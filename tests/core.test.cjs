const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../extension/core.js');
test('template variables in user text are not expanded recursively', () => {
  assert.equal(C.fill('{q} / {review}', {q: '保留 {review}', review: '审核'}), '保留 {review} / 审核');
});
test('uses last final marker; keeps whole unmarked result', () => {
  assert.equal(C.extractFinal('【最终答案】旧\n【最终答案】新'), '新');
  assert.equal(C.extractFinal('直接回答'), '直接回答');
  assert.equal(C.extractFinal('**【最终答案】**\n正文'), '正文');
});
test('rejects empty questions, unsupported and identical providers', () => {
  assert.throws(() => C.validate({q: '  '}));
  assert.throws(() => C.validate({q: 'hi', primary:'kimi', reviewer:'kimi'}));
  assert.throws(() => C.validate({q:'hi',primary:'evil',reviewer:'kimi'}));
});
test('URL allowlist rejects credentials tricks, subdomain spoofing and non-HTTPS', () => {
  assert.equal(C.allowedURL('chatgpt','https://chatgpt.com/c/a'),true);
  for(const url of ['https://chatgpt.com.evil.example/','https://chatgpt.com@evil.example/','http://chatgpt.com/','javascript:alert(1)']) assert.equal(C.allowedURL('chatgpt',url),false);
});
test('imports v2 text and templates without trusting URLs or tab IDs', () => {
  const v = C.importData({q:'q',primary:'kimiWeb',reviewer:'chatgpt',t_first:'test {q}',firstOut:'draft',lastOut:'【最终答案】yes',urls:'javascript:evil',tabs:{primary:123},status:'running'});
  assert.equal(v.config.primary,'kimi'); assert.equal(v.config.templates.first,'test {q}');
  assert.equal(v.finalOut,'yes'); assert.equal(v.config.tabs,undefined); assert.equal(v.config.urls,undefined);
});
test('ignores old answers, empty states and streaming pauses', () => {
  const marker='【接力结束_abc】'; let p;
  p = C.observe(p,{busy:false,answers:[{text:'旧回答【接力结束_old】'}]},marker,0);
  assert.equal(p.done,false);
  p=C.observe(p,{busy:false,answers:[{text:'一段没有结束标记的长暂停'}]},marker,999999);
  assert.equal(p.done,false);
  const a={busy:true,answers:[{text:'完整回答'+marker}]};
  p=C.observe(p,a,marker,1000000); p=C.observe(p,a,marker,1100000); assert.equal(p.done,false);
  a.busy=false; p=C.observe(p,a,marker,1100100); assert.equal(p.done,false);
  p=C.observe(p,a,marker,1106200); assert.equal(p.done,true);
});
