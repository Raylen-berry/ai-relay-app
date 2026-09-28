const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {parseHTML} = require('linkedom');
const C = require('../extension/core.js');
const turn = () => new Promise(setImmediate);
const cfg = q => ({q,primary:'deepseek',reviewer:'chatgpt',timeout:5,templates:{...C.templates}});
function paused(q) {
  return {config:cfg(q),run:{...cfg(q),id:'saved',status:'paused',stageIndex:1,outputs:{first:'已保存的初稿'},finalOut:'',tabs:{},pending:null,logs:[],error:'旧任务已暂停'}};
}
async function workbench(saved) {
  const {window} = parseHTML(fs.readFileSync(path.join(__dirname,'../extension/app.html'),'utf8'));
  // linkedom does not implement the native select value setter.
  for (const el of window.document.querySelectorAll('select')) {
    let value=(el.querySelector('option[selected]')||el.querySelector('option')).value;
    Object.defineProperty(el,'value',{get:()=>value,set:v=>{value=String(v);}});
  }
  let storage=structuredClone(saved), owner, seq=0;
  const messages=[], tabs=new Map(), intervals=[];
  const newTab=url=>{const tab={id:++seq,windowId:1,url};tabs.set(tab.id,tab);return tab;};
  const context=vm.createContext({document:window.document,window,console,structuredClone,URL,Blob,
    crypto:require('node:crypto').webcrypto,confirm:()=>true,
    setTimeout,clearTimeout,setInterval:fn=>{intervals.push(fn);},
    navigator:{locks:{request:(name,callback)=>{assert.equal(typeof callback,'function');owner=callback;return new Promise(()=>{});}}},
    chrome:{runtime:{id:'relay',getURL:f=>'chrome-extension://relay/'+f},storage:{local:{
      get:async()=>({relay:structuredClone(storage)}),set:async value=>{storage=structuredClone(value.relay);}
    }},tabs:{create:async({url})=>newTab(url),get:async id=>tabs.get(id),update:async()=>{},
      sendMessage:async(id,msg)=>{messages.push(msg);if(msg.type==='RELAY_SNAPSHOT')return {ok:true,protocol:5,input:true,inputOccupied:false,busy:false,url:tabs.get(id).url,answers:[]};return {ok:true};},
      remove:async id=>tabs.delete(id)
    },windows:{create:async({url})=>({id:1,tabs:[newTab(url)]}),update:async()=>{}}}
  });
  for(const file of ['core.js','editor.js','engine.js','layout.js','files.js','app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension',file),'utf8'),context);
  await turn();
  const grant=async()=>{owner();await turn();};
  const click=async id=>{const el=window.document.getElementById(id);assert.equal(!!el.disabled,false,id+' must be enabled');el.click();await turn();await turn();};
  const input=async text=>{const el=window.document.getElementById('question');assert.equal(!!el.disabled,false);el.value=text;el.dispatchEvent(new window.Event('input'));await turn();};
  return {context,messages,grant,click,input,get:id=>window.document.getElementById(id),saved:()=>storage,replaceSaved:v=>{storage=structuredClone(v);},tick:async()=>{for(const fn of intervals)await fn();},cleanup:()=>vm.runInContext('clearTimeout(saveTimer);clearTimeout(ownerNoticeTimer)',context)};
}
test('restored paused task permits editing; a new question preserves outputs without sending until Start',async()=>{
  const w=await workbench(paused('旧问题'));
  try {
    await w.grant();assert.equal(!!w.get('question').disabled,false);assert.match(w.get('questionHint').textContent,/原来的问题/);
    await w.input('修改后的新问题');
    assert.equal(vm.runInContext('engine.run.q',w.context),'旧问题');
    await w.click('newTask');assert.equal(w.get('question').value,'');assert.equal(w.get('firstOut').value,'已保存的初稿');assert.equal(w.saved().run,null);
    assert.equal(w.messages.filter(m=>m.type==='RELAY_SEND').length,0);
    await w.input('用于新测试的问题');await w.click('start');
    assert.equal(w.messages.filter(m=>m.type==='RELAY_SEND').length,1);
    assert.match(w.messages.find(m=>m.type==='RELAY_SEND').prompt,/用于新测试的问题/);
    assert.equal(w.get('question').disabled,true);
    await w.click('pause');await w.tick();assert.equal(!!w.get('question').disabled,false);assert.equal(!!w.get('newTask').disabled,false);
  } finally { w.cleanup(); }
});
test('waiting workbench recovers ownership and loads newest saved data when original closes',async()=>{
  const w=await workbench(paused('旧窗口最初的数据'));
  try {
    assert.equal(w.get('question').disabled,true);assert.equal(w.get('windowNotice').hidden,true);
    w.replaceSaved(paused('原窗口关闭前的新数据'));
    await w.grant();
    assert.equal(!!w.get('question').disabled,false);assert.equal(w.get('windowNotice').hidden,true);
    assert.equal(w.get('question').value,'原窗口关闭前的新数据');assert.equal(w.messages.length,0);
  } finally { w.cleanup(); }
});
test('reopening an interrupted running task pauses it and leaves question editable',async()=>{
  const saved=paused('中断的问题');saved.run.status='running';
  const w=await workbench(saved);
  try {await w.grant();assert.equal(vm.runInContext('engine.run.status',w.context),'paused');assert.equal(!!w.get('question').disabled,false);assert.equal(w.messages.length,0);}
  finally {w.cleanup();}
});

test('workbench shows a custom five-turn route and manual takeover can advance it',async()=>{
  const w=await workbench();
  try {
    await w.grant();w.get('sequence').value='1-2-3-2-1';
    const SeqEvent=w.get('sequence').ownerDocument.defaultView.Event;
    w.get('sequence').dispatchEvent(new SeqEvent('input'));
    await w.input('用户的研究问题');await w.click('start');
    assert.equal(w.get('steps').querySelectorAll('span').length,5);
    assert.equal(w.messages.filter(m=>m.type==='RELAY_SEND').length,1);
    await w.click('takeover');assert.equal(vm.runInContext('engine.run.status',w.context),'paused');
    w.get('manual').value='人工取得的第一轮答案';await w.click('acceptManual');
    assert.equal(w.messages.filter(m=>m.type==='RELAY_SEND').length,2);
    assert.equal(vm.runInContext('engine.run.stageIndex',w.context),1);
  } finally {w.cleanup();}
});

test('timing summary and per-round table render measured totals without inventing legacy times',async()=>{
  const saved=paused('计时检查');saved.run.status='done';saved.run.stageIndex=3;
  saved.run.timing={startedAt:1000,checkpoint:131000,finishedAt:131000,mode:'wait',index:2,
    setup:{send:2000,wait:0,paused:0},rounds:[{send:1000,wait:60000,paused:5000},{send:1000,wait:30000,paused:0},{send:1000,wait:30000,paused:0}]};
  const w=await workbench(saved);
  try {
    await w.grant();assert.equal(w.get('timing').hidden,false);
    assert.equal(w.get('totalTime').textContent,'02:10');assert.equal(w.get('activeTime').textContent,'02:05');assert.equal(w.get('pausedTime').textContent,'00:05');
    assert.equal(w.get('timingRows').querySelectorAll('tr').length,4);
    assert.match(w.get('timingRows').textContent,/1 · DeepSeek · 初稿01:0600:0101:0000:05/);
  } finally {w.cleanup();}
});
