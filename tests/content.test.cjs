const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {parseHTML} = require('linkedom');
function page(host, html) {
  const {window} = parseHTML('<html><body>'+html+'</body></html>');
  let receive, clicks=0;
  window.Element.prototype.getClientRects=()=>[{width:100,height:30}];
  const context = vm.createContext({
    document:window.document, window, location:{hostname:host,href:'https://'+host+'/chat/test'},
    HTMLTextAreaElement:window.HTMLTextAreaElement,HTMLInputElement:window.HTMLInputElement,HTMLButtonElement:window.HTMLButtonElement,
    KeyboardEvent:window.KeyboardEvent || window.Event,
    Event:window.Event,InputEvent:window.InputEvent || window.Event,
    getComputedStyle:()=>({visibility:'visible'}),setTimeout:fn=>setImmediate(fn),console,
    chrome:{runtime:{id:'relay',onMessage:{addListener:fn=>receive=fn}}}
  });
  for(const name of ['adapters.js','content.js']) vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../extension',name),'utf8'),context);
  const sendButton=window.document.querySelector('[data-send]');
  sendButton?.addEventListener('click',()=>{clicks++;});
  return {document:window.document,clicks:()=>clicks,message:msg=>new Promise(resolve=>receive(msg,{id:'relay'},resolve))};
}
test('Kimi collects all final answer blocks and excludes thinking blocks',async()=>{
  const p=page('www.kimi.com','<div class="chat-input-editor" contenteditable="true"></div><div class="send-button-container disabled"></div><div class="segment-assistant"><div class="thinking-container"><div class="markdown">思考中，不应送审</div></div><div class="markdown">答案第一段</div><div class="markdown">答案第二段【接力结束_test】</div></div>');
  const s=await p.message({type:'RELAY_SNAPSHOT'});
  assert.equal(s.answers.length,1);assert.equal(s.answers[0].text,'答案第一段\n\n答案第二段【接力结束_test】');
  assert.equal(s.busy,false);
});
test('DeepSeek extracts only assistant body and never user prompt or reasoning',async()=>{
  const p=page('chat.deepseek.com','<textarea placeholder="给 DeepSeek 发送消息"></textarea><div class="ds-markdown">思考</div><div class="ds-assistant-message-main-content">正式回答</div><div class="ds-button--primary ds-button--circle ds-button--disabled"></div>');
  const s=await p.message({type:'RELAY_SNAPSHOT'});assert.equal(s.answers.length,1);assert.equal(s.answers[0].text,'正式回答');
});
test('ChatGPT extracts assistant Markdown, avoiding user messages',async()=>{
  const p=page('chatgpt.com','<div id="prompt-textarea" contenteditable="true"></div><div data-message-author-role="user">问题和结束标记</div><div data-message-author-role="assistant"><div class="markdown">回答</div></div>');
  const s=await p.message({type:'RELAY_SNAPSHOT'});assert.equal(s.answers.length,1);assert.equal(s.answers[0].text,'回答');
});
test('send deduplication, cancellation, and occupied-draft protection',async()=>{
  const p=page('chat.deepseek.com','<textarea placeholder="给 DeepSeek 发送消息"></textarea><div class="ds-button--primary ds-button--circle ds-button--disabled" role="button" data-send></div>');
  p.document.querySelector('textarea').addEventListener('input',()=>p.document.querySelector('[data-send]').classList.remove('ds-button--disabled'));
  p.document.querySelector('[data-send]').addEventListener('click',()=>{p.document.querySelector('textarea').value='';});
  const msg={type:'RELAY_SEND',taskId:'task1',runId:'run1',prompt:'测试内容'};
  assert.equal((await p.message(msg)).ok,true);assert.equal(p.clicks(),1);
  assert.equal((await p.message(msg)).ok,true);assert.equal(p.clicks(),1);
  await p.message({type:'RELAY_CANCEL',runId:'run1'});
  assert.equal((await p.message({...msg,taskId:'task2'})).beforeClick,true);assert.equal(p.clicks(),1);
  await p.message({type:'RELAY_RESUME',runId:'run1'});
  p.document.querySelector('textarea').value='用户自己的草稿';
  assert.match((await p.message({...msg,taskId:'task2'})).error,/已有内容/);assert.equal(p.clicks(),1);
});
test('does not claim success when the page keeps the composed prompt unsent',async()=>{
  const p=page('chatgpt.com','<textarea id="prompt-textarea"></textarea><button data-testid="send-button" aria-label="Send prompt" data-send></button>');
  const result=await p.message({type:'RELAY_SEND',taskId:'stuck',runId:'run',prompt:'审核提示'});
  assert.equal(result.ok,false);assert.equal(result.uncertain,true);assert.match(result.error,/没有确认发送/);assert.equal(p.clicks(),1);
});
