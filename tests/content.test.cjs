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
    constructor(){this.data=new Map();this.files=[];this.items={add:f=>this.files.push(f)};}
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
    DataTransfer,ClipboardEvent,File,atob,
    getComputedStyle:e=>({visibility:e.style.visibility||'visible',opacity:e.style.opacity||'1',display:e.style.display||'block'}),setTimeout:fn=>setImmediate(fn),console,
    chrome:{runtime:{id:'relay',onMessage:{addListener:fn=>receive=fn}}}
  });
  for(const name of ['adapters.js','editor.js','markdown-source.js','upload.js','content.js']) vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../extension',name),'utf8'),context);
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
  const snap=await p.message({type:'RELAY_SNAPSHOT'});assert.equal(snap.draft,prompt);assert.equal(snap.protocol,5);
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

function uploadPage(host) {
  const p=filePage(host),picker=p.document.createElement('input');picker.type='file';picker.multiple=true;
  p.box.parentElement.append(picker);
  let uploads=0;
  const button=p.document.querySelector('[data-send]');button.classList.add('disabled');button.disabled=true;
  picker.addEventListener('change',()=>{
    uploads++;p.root.replaceChildren();
    for(const file of picker.files) {
      const temp=p.document.createElement('div');temp.innerHTML=liveCard(host,file);p.root.append(temp.firstElementChild);
    }
    button.disabled=false;button.classList.remove('disabled');
  });
  if(host==='www.kimi.com')p.box.addEventListener('paste',ev=>{p.box.textContent=ev.clipboardData.getData('text/plain');});
  button.addEventListener('click',()=>{p.root.replaceChildren();if(p.box.tagName==='TEXTAREA')p.box.value='';else p.box.textContent='';button.disabled=true;button.classList.add('disabled');});
  return {...p,picker,uploads:()=>uploads};
}
// Minimal fixtures from Edge's actual ready-to-send cards on 2026-09-28.
// DeepSeek retains a loading SVG behind an opacity:0 ancestor after upload.
function liveCard(host,file) {
  const image=file.type.startsWith('image/');
  if(host==='www.kimi.com')return image
    ? `<div class="image-thumbnail middle success"><span class="image-wrapper"><img alt="" src="https://www.kimi.com/test-image?filename=${encodeURIComponent(file.name)}&amp;t=t"></span></div>`
    : `<div class="file-card-container normal success"><img alt="txt"><div><p class="file-card-info-name">${file.name.replace(/\.[^.]+$/,'')}</p><span class="file-ext">${file.name.split('.').pop().toUpperCase()}</span></div></div>`;
  if(host==='chat.deepseek.com')return image
    ? `<div class="d5fa3d1b _183e647"><div><img alt="${file.name}"></div><div class="fb3b3771" style="opacity:0"><div><div class="ds-loading"></div></div></div></div>`
    : `<div class="_25c7358 dafb6286"><div class="e70accd6">${file.name}</div></div>`;
  return image
    ? `<div class="group/composer-attachment composer-attachment-surface" aria-label="${file.name}"><span><img alt="${file.name}"></span><button aria-label="移除 ${file.name}"></button></div>`
    : `<span class="group/composer-attachment"><span class="composer-attachment-surface">${file.name}</span><button class="composer-attachment-surface" aria-label="${file.name}"></button><button aria-label="移除 ${file.name}"></button></span>`;
}
const chosenFiles=[{id:'p',name:'test.png',size:3,type:'image/png'},{id:'d',name:'notes.txt',size:3,type:'text/plain'}];
async function prepareChosen(p,files=chosenFiles) {
  const base={batchId:'batch',runId:'run'};
  const begin=await p.message({...base,type:'RELAY_FILES_BEGIN',files});assert.equal(begin.ok,true,begin.error);
  for(let i=0;i<files.length;i++)assert.equal((await p.message({...base,type:'RELAY_FILES_CHUNK',index:i,offset:0,data:Buffer.from('abc').toString('base64')})).ok,true);
  return p.message({...base,type:'RELAY_FILES_COMMIT'});
}
for(const host of Object.keys(filePages))test(host+' uploads selected image and document once, preserves filenames and sends accompanying instructions',async()=>{
  const p=uploadPage(host),prepared=await prepareChosen(p);assert.equal(prepared.ok,true,prepared.error);
  assert.equal(p.uploads(),1);assert.deepEqual(p.picker.files.map(f=>f.name),['test.png','notes.txt']);
  assert.equal(await p.picker.files[1].text(),'abc');
  const snap=await p.message({type:'RELAY_SNAPSHOT'});assert.equal(snap.attachments.count,2);
  const again=await p.message({type:'RELAY_FILES_BEGIN',batchId:'batch',runId:'run',files:chosenFiles,recovery:true});
  assert.equal(again.signature,prepared.signature);assert.equal(p.uploads(),1);
  let submitted='';p.document.querySelector('[data-send]').addEventListener('click',()=>{});
  if(host==='www.kimi.com')p.box.addEventListener('paste',ev=>submitted=ev.clipboardData.getData('text/plain'));
  else p.box.addEventListener('input',()=>submitted=p.box.value);
  const r=await p.message({type:'RELAY_SEND',taskId:'with-selected',runId:'run',prompt:'请同时核对图片和文档【接力结束_files】',userFiles:true,attachmentSignature:prepared.signature});
  assert.equal(r.ok,true,r.error);assert.match(submitted,/同时核对图片和文档/);assert.equal(p.clicks(),1);
});

test('incomplete bytes, unsupported types, cancellation and changed drafts cannot upload files',async()=>{
  for(const mode of ['incomplete','unsupported','cancel','changed']) {
    const p=uploadPage('chatgpt.com'),base={runId:'run',batchId:'batch'};
    if(mode==='unsupported')p.picker.setAttribute('accept','application/pdf');
    const begin=await p.message({...base,type:'RELAY_FILES_BEGIN',files:chosenFiles});
    if(mode==='unsupported'){assert.equal(begin.ok,false);continue;}
    if(mode!=='incomplete')for(let i=0;i<2;i++)await p.message({...base,type:'RELAY_FILES_CHUNK',index:i,offset:0,data:'YWJj'});
    if(mode==='changed')p.box.value='用户的新草稿';
    if(mode==='cancel')await p.message({type:'RELAY_CANCEL',runId:'run'});
    assert.equal((await p.message({...base,type:'RELAY_FILES_COMMIT'})).ok,false);assert.equal(p.uploads(),0);
  }
});

test('recovery without matching attachments does not inject or silently claim an upload',async()=>{
  const p=uploadPage('chatgpt.com');
  const result=await p.message({type:'RELAY_FILES_BEGIN',files:chosenFiles,runId:'run',batchId:'lost',recovery:true});
  assert.equal(result.ok,false);assert.match(result.error,/不会重复上传/);assert.equal(p.uploads(),0);
});

test('ChatGPT server renaming during this upload is confirmed after parsing and reused without another upload',async()=>{
  const p=uploadPage('chatgpt.com');
  p.picker.addEventListener('change',()=>{
    p.root.firstElementChild.setAttribute('aria-busy','true');
    setImmediate(()=>{
      p.root.replaceChildren();
      for(const file of chosenFiles){const temp=p.document.createElement('div');temp.innerHTML=liveCard('chatgpt.com',{...file,name:file.name.replace(/(\.[^.]+)$/,'(1)$1')});p.root.append(temp.firstElementChild);}
    });
  });
  const prepared=await prepareChosen(p);
  assert.equal(prepared.ok,true,prepared.error);assert.match(prepared.signature,/test\(1\)\.png/);
  const again=await p.message({type:'RELAY_FILES_BEGIN',batchId:'batch',runId:'run',files:chosenFiles,recovery:true});
  assert.equal(again.ok,true,again.error);assert.equal(again.signature,prepared.signature);assert.equal(p.uploads(),1);
  const sent=await p.message({type:'RELAY_SEND',taskId:'renamed',runId:'run',prompt:'核对原附件【接力结束_renamed】',userFiles:true,attachmentSignature:prepared.signature});
  assert.equal(sent.ok,true,sent.error);assert.equal(p.clicks(),1);
});

test('renamed or unrelated files without a known upload batch do not bypass recovery checks',async()=>{
  const p=uploadPage('chatgpt.com');
  for(const file of chosenFiles){const temp=p.document.createElement('div');temp.innerHTML=liveCard('chatgpt.com',{...file,name:file.name.replace(/(\.[^.]+)$/,'(2)$1')});p.root.append(temp.firstElementChild);}
  const unknown=await p.message({type:'RELAY_FILES_BEGIN',batchId:'unknown',runId:'run',files:chosenFiles,recovery:true});
  assert.equal(unknown.ok,false);assert.equal(p.uploads(),0);
  const q=uploadPage('chatgpt.com');await prepareChosen(q);
  q.root.firstElementChild.setAttribute('aria-label','another.png');q.root.firstElementChild.querySelector('img').setAttribute('alt','another.png');
  const changed=await q.message({type:'RELAY_FILES_BEGIN',batchId:'batch',runId:'run',files:chosenFiles,recovery:true});
  assert.equal(changed.ok,false);assert.equal(q.uploads(),1);
});

test('selected files plus prompt converted to TXT survive a parsing pause without repasting',async()=>{
  const p=uploadPage('www.kimi.com'),prepared=await prepareChosen(p);
  let pastes=0;
  p.box.addEventListener('paste',()=>{
    pastes++;p.box.textContent='';const temp=p.document.createElement('div');temp.innerHTML=filePages['www.kimi.com'].card.replaceAll('relay.txt','prompt.txt');
    temp.firstElementChild.classList.add('parsing');p.root.append(temp.firstElementChild);
  });
  const msg={type:'RELAY_SEND',taskId:'txt-selected',runId:'run',prompt:'长提示词',userFiles:true,attachmentSignature:prepared.signature};
  const first=await p.message(msg);assert.equal(first.ok,false);assert.equal(first.composedAsFile,true);assert.equal(p.clicks(),0);
  p.root.querySelector('.parsing').classList.remove('parsing');
  const result=await p.message({...msg,attachmentSignature:first.composedSignature,composedSignature:first.composedSignature,composedAsFile:true});
  assert.equal(result.ok,true,result.error);assert.equal(pastes,1);assert.equal(p.uploads(),1);assert.equal(p.clicks(),1);
});

test('new ChatGPT composer, assistant body and stop button are recognized without old IDs',async()=>{
  const p=page('chatgpt.com','<main><div><h4>你说：</h4><div>用户问题</div></div><div><h4 data-conversation-role="assistant">ChatGPT 说：</h4><div data-chatgpt-selection-message-id="answer-id"><div class="MarkdownRoot-rZKhxa">回答【接力结束_new】</div></div></div><form><div data-composer-markdown contenteditable="true"></div><button aria-label="停止"></button></form></main>');
  let s=await p.message({type:'RELAY_SNAPSHOT'});
  assert.equal(s.input,true);assert.equal(s.busy,true);assert.equal(s.answers.length,1);assert.equal(s.answers[0].text,'回答【接力结束_new】');
  p.document.querySelector('button').setAttribute('aria-label','发送');
  s=await p.message({type:'RELAY_SNAPSHOT'});assert.equal(s.busy,false);assert.equal(s.sendFound,true);
});

test('Kimi live split-extension names and URL image names recover existing mixed attachments',async()=>{
  const p=uploadPage('www.kimi.com'),files=[{...chosenFiles[0],name:'测试图 空格.png'},{...chosenFiles[1],name:'notes.TXT'}];
  const prepared=await prepareChosen(p,files);assert.equal(prepared.ok,true,prepared.error);
  const s=await p.message({type:'RELAY_SNAPSHOT'});assert.deepEqual(Array.from(s.attachments.names),['测试图 空格.png','notes.txt']);
  const recovered=await p.message({type:'RELAY_FILES_BEGIN',runId:'run',batchId:'new-after-reload',files,recovery:true});
  assert.equal(recovered.ok,true);assert.equal(p.uploads(),1);
});

test('overlapping card selectors count an attachment once and visible loading still blocks sending',async()=>{
  const p=uploadPage('chatgpt.com');await prepareChosen(p);
  p.root.firstElementChild.querySelector('span').setAttribute('data-testid','attachment');
  assert.equal((await p.message({type:'RELAY_SNAPSHOT'})).attachments.count,2);
  const d=uploadPage('chat.deepseek.com');await prepareChosen(d);
  assert.equal((await d.message({type:'RELAY_SNAPSHOT'})).attachments.pending,false);
  d.root.querySelector('.fb3b3771').style.opacity='1';
  const snap=await d.message({type:'RELAY_SNAPSHOT'});assert.equal(snap.attachments.pending,true);
  const r=await d.message({type:'RELAY_SEND',taskId:'visible-spinner',runId:'run',prompt:'附件测试',userFiles:true,attachmentSignature:snap.attachments.signature});
  assert.equal(r.ok,false);assert.equal(d.clicks(),0);
});

test('ChatGPT nested selection wrapper reads only assistant answers in live October layout',async()=>{
  const p=page('chatgpt.com','<main><div><h4 data-conversation-role="user">你说：</h4><div><div data-chatgpt-selection-message-id="user"><div>USER_ONLY【接力结束_oct】</div></div></div></div><div><h4 data-conversation-role="assistant">ChatGPT 说：</h4><div><div class="thinking">THINKING_ONLY</div><div data-chatgpt-selection-message-id="first"><div class="MarkdownRoot"><div class="DilResponseRoot">第一段正式回答</div></div></div></div></div><div><h4 data-conversation-role="user">你说：</h4><div>USER_ONLY 第二次问题</div></div><div><h4 data-conversation-role="assistant">ChatGPT 说：</h4><div><div><div data-chatgpt-selection-message-id="second"><div class="MarkdownRoot"><div class="DilResponseRoot">审核完成【接力结束_oct】</div></div></div></div></div></div><form><div data-composer-markdown contenteditable="true"></div><button aria-label="发送"></button></form></main>');
  const snap=await p.message({type:'RELAY_SNAPSHOT'});
  assert.equal(snap.answers.length,2);
  assert.equal(snap.answers[0].text,'第一段正式回答');
  assert.equal(snap.answers[1].text,'审核完成【接力结束_oct】');
  assert.ok(snap.answers.every(answer=>!answer.text.includes('USER_ONLY')&&!answer.text.includes('THINKING_ONLY')));
});
