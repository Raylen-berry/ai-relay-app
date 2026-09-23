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

test('custom route validates three distinct models and returns to the first',()=>{
  const config={q:'问题',primary:'deepseek',reviewer:'chatgpt',third:'kimi',sequence:'1-2-3-2-1',templates:{...C.templates}};
  assert.deepEqual(C.routeFor(config),['primary','reviewer','third','reviewer','primary']);
  assert.equal(C.stageAt({...config,route:C.routeFor(config),stageIndex:2}),'review');
  assert.throws(()=>C.routeFor({...config,third:'chatgpt'}),/第三模型/);
  assert.throws(()=>C.routeFor({...config,sequence:'1-2-2-1'}),/相邻/);
  assert.throws(()=>C.routeFor({...config,sequence:'1-2-3'}),/首|接力/);
});

test('long prompt is divided into bounded sequential text segments with unique receipts',()=>{
  const content='材料😀\n'.repeat(1800)+'【接力结束_final】';
  const parts=C.splitPrompt(content,'run',2500);
  assert.ok(parts.length>2);
  assert.ok(parts.every(p=>Array.from(p.prompt).length<2800));
  const chars=Array.from(content);
  assert.ok(parts.every((p,i)=>p.prompt.endsWith(chars.slice(i*2500,(i+1)*2500).join(''))));
  assert.equal(new Set(parts.slice(0,-1).map(p=>p.marker)).size,parts.length-1);
  assert.equal(parts.at(-1).marker,null);
  assert.ok(parts.at(-1).prompt.endsWith('【接力结束_final】'));
  assert.deepEqual(C.splitPrompt('短问题','run'),[{prompt:'短问题',marker:null}]);
});
