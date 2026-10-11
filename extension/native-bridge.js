'use strict';
importScripts('workflows-data.js','delivery-data.js','workflow-store.js');
const nativeAllowedMessage=new Set(['RELAY_SNAPSHOT','RELAY_SEND','RELAY_CANCEL','RELAY_RESUME','RELAY_FILES_BEGIN','RELAY_FILES_CHUNK','RELAY_FILES_COMMIT']);
const nativeHosts=new Set(['chat.deepseek.com','chatgpt.com','www.kimi.com','kimi.com','www.bing.com']);
const nativeLocks=new Map();
async function nativeCall(msg,sender){
  const source=new URL(sender.url||'');
  if(source.protocol!=='http:'||source.hostname!=='127.0.0.1'||source.pathname!=='/app.html'||source.origin!==msg.origin||!/^\d+$/.test(source.port)||!/^[a-f0-9]{64}$/.test(msg.token)||!/^[a-zA-Z0-9-]{1,80}$/.test(msg.client))throw Error('本机工作台连接无效。');
  const proof=await fetch(source.origin+'/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-Relay-Proof':msg.token,'X-Relay-Client':msg.client},body:JSON.stringify({op:'proof'}),credentials:'omit',redirect:'error'}).then(r=>r.json());
  if(!proof.ok||proof.value!==true)throw Error(proof.error||'此窗口没有任务执行权。');
  const binding=source.origin+'|'+msg.token,key='native-owned:'+source.port;
  const owned=(await chrome.storage.session.get(key))[key]||{binding,tabs:[],windows:[]};if(owned.binding!==binding){owned.binding=binding;owned.tabs=[];owned.windows=[];}
  const save=()=>chrome.storage.session.set({[key]:owned});
  const url=value=>{const u=new URL(value);if(u.protocol!=='https:'||!nativeHosts.has(u.hostname)||u.username||u.password)throw Error('网页地址不在模型连接范围。');return u.href;};
  const tab=async id=>{if(!owned.tabs.includes(id))throw Error('只能访问本机工作台创建的任务网页。');const t=await chrome.tabs.get(id);url(t.pendingUrl||t.url);return t;};
  const win=id=>{if(!owned.windows.includes(id))throw Error('只能操作任务窗口。');};
  switch(msg.op){
    case 'workspace.export':{const {relay,relayWorkspace}=await chrome.storage.local.get(['relay','relayWorkspace']);const materials=await RelayWorkflowStore.get('workspace');if(!relay&&!relayWorkspace&&!materials)throw Error('这个浏览器配置中没有旧版互审记录。');return RelayDeliveryData.packageData({current:relay?.run,history:relayWorkspace?.history||[],queue:relayWorkspace?.queue||[],materials:materials||{version:1,documents:[]}});}
    case 'window.create':{const o=msg.options||{},w=await chrome.windows.create({url:url(o.url),type:'normal',focused:true});owned.windows.push(w.id);owned.tabs.push(...w.tabs.map(t=>t.id));await save();return w;}
    case 'tab.create':{const o=msg.options||{};if(o.windowId)win(o.windowId);const t=await chrome.tabs.create({url:url(o.url),active:true,...(o.windowId?{windowId:o.windowId}:{})});owned.tabs.push(t.id);await save();return t;}
    case 'tab.get':return tab(msg.id);
    case 'tab.update':await tab(msg.id);return chrome.tabs.update(msg.id,{active:true});
    case 'window.update':win(msg.id);return chrome.windows.update(msg.id,{focused:true,state:'normal'});
    case 'tab.remove':await tab(msg.id);await chrome.tabs.remove(msg.id);owned.tabs=owned.tabs.filter(id=>id!==msg.id);await save();return true;
    case 'tab.message':await tab(msg.id);if(!nativeAllowedMessage.has(msg.message?.type))throw Error('连接消息不在许可范围。');return chrome.tabs.sendMessage(msg.id,msg.message);
    default:throw Error('不支持的网页连接操作。');
  }
}
chrome.runtime.onMessageExternal.addListener((msg,sender,reply)=>{
  if(msg?.type!=='RELAY_NATIVE')return;
  const binding=msg.origin+'|'+msg.token;
  const call=(nativeLocks.get(binding)||Promise.resolve()).catch(()=>{}).then(()=>nativeCall(msg,sender));nativeLocks.set(binding,call);
  call.then(value=>reply({ok:true,value})).catch(e=>reply({ok:false,error:e.message}));return true;
});
