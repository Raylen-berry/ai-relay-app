const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {parseHTML} = require('linkedom');
function page(host, html) {
  const {window} = parseHTML('<html><body>'+html+'</body></html>');
  let receive, clicks=0;
  window.Element.prototype.getClientRects=()=>[{width:100,height:30}];
  class DataTransfer {
    constructor(){this.data=new Map();}
    setData(type,text){this.data.set(type,text);}
    getData(type){return this.data.get(type)||'';}
  }
  class ClipboardEvent extends window.Event {
    constructor(type,options){super(type,options);this.clipboardData=options.clipboardData;}
  }
  const context = vm.createContext({
    document:window.document, window, location:{hostname:host,href:'https://'+host+'/chat/test'},
    HTMLTextAreaElement:window.HTMLTextAreaElement,HTMLInputElement:window.HTMLInputElement,HTMLButtonElement:window.HTMLButtonElement,
    KeyboardEvent:window.KeyboardEvent || window.Event,
    Event:window.Event,InputEvent:window.InputEvent || window.Event,
    DataTransfer,ClipboardEvent,
    getComputedStyle:()=>({visibility:'visible'}),setTimeout:fn=>setImmediate(fn),console,
    chrome:{runtime:{id:'relay',onMessage:{addListener:fn=>receive=fn}}}
  });
  for(const name of ['adapters.js','editor.js','content.js']) vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../extension',name),'utf8'),context);
  const sendButton=window.document.querySelector('[data-send]');
  sendButton?.addEventListener('click',()=>{clicks++;});
  return {document:window.document,window,clicks:()=>clicks,message:msg=>new Promise(resolve=>receive(msg,{id:'relay'},resolve))};
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
  assert.match((await p.message({...msg,taskId:'task2'})).error,/已有其他内容/);assert.equal(p.clicks(),1);
});
test('does not claim success when the page keeps the composed prompt unsent',async()=>{
  const p=page('chatgpt.com','<textarea id="prompt-textarea"></textarea><button data-testid="send-button" aria-label="Send prompt" data-send></button>');
  const result=await p.message({type:'RELAY_SEND',taskId:'stuck',runId:'run',prompt:'审核提示'});
  assert.equal(result.ok,false);assert.equal(result.uncertain,true);assert.equal(result.retryableDraft,true);assert.match(result.error,/没有确认发送/);assert.equal(p.clicks(),1);
});
test('reuses this task exact prefilled prompt and clicks the current ChatGPT submit button',async()=>{
  const p=page('chatgpt.com','<form><textarea id="prompt-textarea">审核提示</textarea><button id="composer-submit-button" type="submit" data-send></button></form>');
  p.document.querySelector('[data-send]').addEventListener('click',ev=>{ev.preventDefault();p.document.querySelector('textarea').value='';});
  const result=await p.message({type:'RELAY_SEND',taskId:'resume',runId:'run',prompt:'审核提示'});
  assert.equal(result.ok,true);assert.equal(result.verified,true);assert.equal(p.clicks(),1);
});
test('long contenteditable paragraphs preserve blank lines, indentation and Markdown before send',async()=>{
  const E=require('../extension/editor.js');
  const lines=['【审核任务】','',...Array.from({length:80},(_,i)=>`第 ${i} 段：中文 / English **Markdown**`),'','```js','  const x = 1;','```','【接力结束_long】'];
  const prompt=lines.join('\n');
  const p=page('chatgpt.com','<form><div id="prompt-textarea" contenteditable="true"></div><button id="composer-submit-button" data-send></button></form>');
  const box=p.document.querySelector('#prompt-textarea');
  for(const line of lines){const para=p.document.createElement('p');if(line)para.textContent=line;else para.innerHTML='<br class="ProseMirror-trailingBreak">';box.append(para);}
  // Browser innerText is layout dependent; the editor document is not.
  Object.defineProperty(box,'innerText',{get:()=>lines.join('\n\n')});
  assert.equal(E.read(box),prompt);
  const snap=await p.message({type:'RELAY_SNAPSHOT'});assert.equal(snap.draft,prompt);assert.equal(snap.protocol,4);
  p.document.querySelector('[data-send]').addEventListener('click',()=>{box.replaceChildren();});
  const result=await p.message({type:'RELAY_SEND',taskId:'long',runId:'run',prompt});
  assert.equal(result.ok,true);assert.equal(p.clicks(),1);
});
test('fresh contenteditable insertion sends multiline text without a duplicate input event',async()=>{
  const p=page('chatgpt.com','<form><div id="prompt-textarea" contenteditable="true"><p><br></p></div><button id="composer-submit-button" data-send></button></form>');
  const box=p.document.querySelector('#prompt-textarea');
  const prompt='第一段\n\n第二段\n  保留缩进\n【接力结束_new】';
  let inputs=0, submitted='';
  box.addEventListener('input',()=>inputs++);
  p.document.createRange=()=>({selectNodeContents(){}});
  p.window.getSelection=()=>({removeAllRanges(){},addRange(){}});
  // Simulate the editor's native insertText transaction and paragraph output.
  p.document.execCommand=(command,ui,text)=>{
    assert.equal(command,'insertText');box.replaceChildren();
    for(const line of text.split('\n')) { const para=p.document.createElement('p');if(line)para.textContent=line;else para.innerHTML='<br>';box.append(para); }
    box.dispatchEvent(new p.window.Event('input',{bubbles:true}));return true;
  };
  p.document.querySelector('[data-send]').addEventListener('click',()=>{submitted=require('../extension/editor.js').read(box);box.replaceChildren();});
  const result=await p.message({type:'RELAY_SEND',taskId:'new',runId:'run',prompt});
  assert.equal(result.ok,true);assert.equal(submitted,prompt);assert.equal(inputs,1);assert.equal(p.clicks(),1);
});
test('a changed draft containing the marker is protected',async()=>{
  const p=page('chatgpt.com','<textarea id="prompt-textarea">用户改过的内容【接力结束_test】</textarea><button id="composer-submit-button" data-send></button>');
  const result=await p.message({type:'RELAY_SEND',taskId:'changed',runId:'run',marker:'【接力结束_test】',prompt:'原来内容【接力结束_test】'});
  assert.equal(result.beforeClick,true);assert.equal(p.clicks(),0);
});
test('composer removal is uncertain and cancellation cannot trigger fallback submissions',async()=>{
  for(const mode of ['removed','cancelled']) {
    const p=page('chatgpt.com','<form><textarea id="prompt-textarea"></textarea><button id="composer-submit-button" data-send></button></form>');
    let fallbacks=0;
    p.document.querySelector('form').requestSubmit=()=>fallbacks++;
    p.document.querySelector('textarea').addEventListener('keydown',()=>fallbacks++);
    p.document.querySelector('[data-send]').addEventListener('click',()=>{
      if(mode==='removed')p.document.querySelector('textarea').remove();
      else p.message({type:'RELAY_CANCEL',runId:'run'});
    });
    const result=await p.message({type:'RELAY_SEND',taskId:mode,runId:'run',prompt:'测试内容'});
    assert.equal(result.ok,false);assert.equal(result.retryableDraft,false);assert.equal(p.clicks(),1);assert.equal(fallbacks,0);
  }
});
test('draft edited while send button is enabling is never sent',async()=>{
  const p=page('chatgpt.com','<textarea id="prompt-textarea"></textarea><button id="composer-submit-button" disabled data-send></button>');
  const box=p.document.querySelector('textarea');
  box.addEventListener('input',()=>setImmediate(()=>setImmediate(()=>{box.value='后来修改的内容';p.document.querySelector('[data-send]').disabled=false;})));
  const result=await p.message({type:'RELAY_SEND',taskId:'race',runId:'run',prompt:'原始内容'});
  assert.equal(result.beforeClick,true);assert.equal(p.clicks(),0);assert.equal(box.value,'后来修改的内容');
});

// Matches the real Kimi DOM captured on 2026-09-22: a single paragraph and
// Lexical text span. insertText dropped LF; plain-text paste retained them.
function kimiPage(draft='') {
  const p=page('www.kimi.com','<div class="chat-input-editor" data-lexical-editor="true" contenteditable="true" role="textbox"><p><span data-lexical-text="true"></span></p></div><div class="send-button-container" data-send><svg name="Send"></svg></div>');
  const box=p.document.querySelector('.chat-input-editor');
  box.querySelector('span').textContent=draft;
  p.document.createRange=()=>({selectNodeContents(){}});
  p.window.getSelection=()=>({removeAllRanges(){},addRange(){}});
  p.document.execCommand=(command,ui,text)=>{box.querySelector('span').textContent=text.replace(/\n/g,'');return true;};
  return {...p,box};
}
test('Kimi fresh and legacy collapsed drafts use paste preserving all line breaks',async()=>{
  const E=require('../extension/editor.js'),marker='【接力结束_kimi】';
  const prompt='问题\n\n中文 **Markdown**\n```js\n  const x = 1;\n```\n'+marker;
  for(const legacy of [false,true]) {
    const p=kimiPage(legacy?prompt.replace(/\n/g,''):'');let pastes=0,submitted;
    p.box.addEventListener('paste',event=>{
      pastes++;event.preventDefault();
      setImmediate(()=>{p.box.querySelector('span').textContent=event.clipboardData.getData('text/plain');});
    });
    p.document.querySelector('[data-send]').addEventListener('click',()=>{submitted=E.read(p.box);p.box.querySelector('span').textContent='';});
    const result=await p.message({type:'RELAY_SEND',taskId:'paste',runId:'run',marker,prompt});
    assert.equal(result.ok,true);assert.equal(pastes,1);assert.equal(submitted,prompt);assert.equal(p.clicks(),1);
  }
});
test('Kimi paste refusal or newline loss pauses without clicking or insertText fallback',async()=>{
  for(const mode of ['refused','flattened']) {
    const p=kimiPage();let fallback=0;p.document.execCommand=()=>{fallback++;};
    p.box.addEventListener('paste',event=>{if(mode==='flattened')p.box.querySelector('span').textContent=event.clipboardData.getData('text/plain').replace(/\n/g,'');});
    const result=await p.message({type:'RELAY_SEND',taskId:'rejected',runId:'run',prompt:'第一段\n\n第二段'});
    assert.equal(result.beforeClick,true);assert.equal(p.clicks(),0);assert.equal(fallback,0);
  }
});
test('Kimi legacy recovery rejects every other text change, foreign marker and missing marker',async()=>{
  const marker='【接力结束_kimi】',prompt='第一段\n  第二段\n'+marker;
  for(const draft of [prompt.replace(/\n/g,'')+'额外文字',prompt.replace(/\s/g,''),prompt.replace(/\n/g,'').replace('kimi','other')]) {
    const p=kimiPage(draft);
    const result=await p.message({type:'RELAY_SEND',taskId:'protect',runId:'run',marker,prompt});
    assert.equal(result.beforeClick,true);assert.equal(p.clicks(),0);assert.equal(p.box.textContent,draft);
  }
  assert.equal(require('../extension/editor.js').lostLineBreaks(prompt.replace(/\n/g,''),prompt,''),false);
});
// Composer structures observed in Edge on 2026-09-23 (no conversation content).
const filePages = {
  'www.kimi.com': {html:'<div class="chat-editor"><div data-testid="input-attachment-list"></div><div class="chat-input-editor" contenteditable="true" data-lexical-editor="true"></div><div class="send-button-container" data-send></div></div>', root:'[data-testid="input-attachment-list"]', card:'<div class="file-card-container normal"><p class="file-card-info-name">relay.txt</p><div class="file-card-info-status">TXT 7.27 KB</div></div>', box:'.chat-input-editor'},
  'chatgpt.com': {html:'<form><div id="files"></div><textarea id="prompt-textarea"></textarea><button id="composer-submit-button" data-send></button></form>',root:'#files',card:'<div class="group/file-tile" role="group" aria-label="relay.txt"><span>relay.txt</span><button aria-label="Remove file"></button></div>',box:'textarea'},
  'chat.deepseek.com': {html:'<div class="_77cefa5"><div id="files"></div><textarea placeholder="DeepSeek"></textarea><div class="ds-button--primary ds-button--circle" data-send></div></div>',root:'#files',card:'<div class="_25c7358"><div class="e70accd6">relay.txt</div><button>粘贴原文至输入框</button></div>',box:'textarea'}
};
function filePage(host) {
  const f=filePages[host],p=page(host,f.html),box=p.document.querySelector(f.box),root=p.document.querySelector(f.root);
  p.document.createRange=()=>({selectNodeContents(){}});p.window.getSelection=()=>({removeAllRanges(){},addRange(){}});
  return {...p,box,root,attach:()=>{root.innerHTML=f.card;return root.firstElementChild;}};
}
for(const host of Object.keys(filePages)) {
  test(host+' sends an attachment-only composer, waits for clearing, and ignores history files',async()=>{
    const p=filePage(host);p.attach();
    p.document.body.insertAdjacentHTML('afterbegin',filePages[host].card);
    const snap=await p.message({type:'RELAY_SNAPSHOT'});
    assert.equal(snap.attachments.count,1);assert.equal(snap.inputOccupied,true);assert.equal(snap.busy,false);
    p.document.querySelector('[data-send]').addEventListener('click',()=>setImmediate(()=>p.root.replaceChildren()));
    const result=await p.message({type:'RELAY_SEND',taskId:'file',runId:'run',prompt:'long prompt',attachmentSignature:snap.attachments.signature});
    assert.equal(result.ok,true);assert.equal(result.attachment,true);assert.equal(p.clicks(),1);assert.equal(p.root.children.length,0);
  });
  test(host+' does not treat an empty editor with a retained attachment as delivered',async()=>{
    const p=filePage(host);p.attach();const snap=await p.message({type:'RELAY_SNAPSHOT'});
    const result=await p.message({type:'RELAY_SEND',taskId:'stuck-file',runId:'run',prompt:'long prompt',attachmentSignature:snap.attachments.signature});
    assert.equal(result.ok,false);assert.equal(result.retryableDraft,true);assert.equal(p.clicks(),1);
  });
  test(host+' waits for parsing, then submits exactly once',async()=>{
    const p=filePage(host),card=p.attach(),progress=p.document.createElement('div');
    progress.setAttribute('role','progressbar');progress.className='parsing';card.append(progress);
    const snap=await p.message({type:'RELAY_SNAPSHOT'});assert.equal(snap.attachments.pending,true);
    setImmediate(()=>setImmediate(()=>{assert.equal(p.clicks(),0);progress.remove();}));
    p.document.querySelector('[data-send]').addEventListener('click',()=>p.root.replaceChildren());
    assert.equal((await p.message({type:'RELAY_SEND',taskId:'parsing',runId:'run',prompt:'long prompt',attachmentSignature:snap.attachments.signature})).ok,true);
    assert.equal(p.clicks(),1);
  });
}
test('Kimi paste converting to TXT continues without rewriting or a text-equality failure',async()=>{
  const p=filePage('www.kimi.com');let pastes=0;
  p.box.addEventListener('paste',()=>{pastes++;p.attach();});
  p.document.querySelector('[data-send]').addEventListener('click',()=>p.root.replaceChildren());
  const result=await p.message({type:'RELAY_SEND',taskId:'convert',runId:'run',prompt:'中文长材料\n'.repeat(600)});
  assert.equal(result.ok,true);assert.equal(result.attachment,true);assert.equal(pastes,1);assert.equal(p.clicks(),1);
});
test('unknown existing attachment, changed draft, upload failure and cancellation never send',async()=>{
  for(const mode of ['foreign','text','failed','cancel','replaced']) {
    const p=filePage('www.kimi.com'),card=p.attach();const snap=await p.message({type:'RELAY_SNAPSHOT'});
    if(mode==='text')p.box.textContent='用户编辑过的内容';
    if(mode==='failed')card.classList.add('failed');
    if(mode==='replaced')card.querySelector('p').textContent='changed.txt';
    if(mode==='cancel')await p.message({type:'RELAY_CANCEL',runId:'run'});
    const result=await p.message({type:'RELAY_SEND',taskId:mode,runId:'run',prompt:'long prompt',attachmentSignature:mode==='foreign'?undefined:snap.attachments.signature});
    assert.equal(result.beforeClick,true);assert.equal(p.clicks(),0);
  }
});
test('attachment parsing timeout preserves the draft for an explicit resume',async()=>{
  const p=filePage('www.kimi.com');p.attach().classList.add('parsing');const s=await p.message({type:'RELAY_SNAPSHOT'});
  const r=await p.message({type:'RELAY_SEND',taskId:'timeout',runId:'run',prompt:'long prompt',attachmentSignature:s.attachments.signature});
  assert.equal(r.beforeClick,true);assert.equal(r.draftRetained,true);assert.match(r.error,/仍在上传或解析/);assert.equal(p.clicks(),0);
});
for(const host of ['chatgpt.com','chat.deepseek.com']) test(host+' accepts a text editor update converted into an attachment',async()=>{
  const p=filePage(host),button=p.document.querySelector('[data-send]');button.disabled=true;
  p.box.addEventListener('input',()=>{p.box.value='';p.attach();button.disabled=false;});
  button.addEventListener('click',()=>p.root.replaceChildren());
  const result=await p.message({type:'RELAY_SEND',taskId:'converted',runId:'run',prompt:'long material'});
  assert.equal(result.ok,true);assert.equal(result.attachment,true);assert.equal(p.clicks(),1);
});
test('attachment replaced while waiting for the send button is not submitted',async()=>{
  const p=filePage('www.kimi.com');const card=p.attach(),button=p.document.querySelector('[data-send]');button.classList.add('disabled');
  const s=await p.message({type:'RELAY_SNAPSHOT'});
  setImmediate(()=>{card.querySelector('p').textContent='changed.txt';button.classList.remove('disabled');});
  const r=await p.message({type:'RELAY_SEND',taskId:'changed-file',runId:'run',prompt:'long material',attachmentSignature:s.attachments.signature});
  assert.equal(r.beforeClick,true);assert.equal(p.clicks(),0);
});
