(function(root){
  'use strict';
  if(location.protocol!=='http:'||location.hostname!=='127.0.0.1')return;
  const external=root.chrome?.runtime;
  const token=new URL(location.href).searchParams.get('launch')||sessionStorage.getItem('relayNativeToken');
  if(!token)return;
  sessionStorage.setItem('relayNativeToken',token);
  history.replaceState(null,'',location.pathname+location.hash);
  const client=crypto.randomUUID(),extension='ecjeppfncoeigfaiojgpmpppgmlkbcil';
  let owner=false,leaseTimer;
  async function rpc(op,values={}){const response=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-Relay-Proof':token,'X-Relay-Client':client},body:JSON.stringify({op,...values})});let data;try{data=await response.json();}catch{throw Error('本机核心连接中断，请从桌面重新打开工作台。');}if(!data.ok)throw Error(data.error||'本机操作失败。');return data.value;}
  async function bridge(op,values={}){
    if(!external?.sendMessage)throw Error('网页连接扩展尚未加载。本机资料、历史和 API 仍可使用；网页模型请先在 Chrome 扩展管理页加载 extension。');
    return new Promise((resolve,reject)=>{external.sendMessage(extension,{type:'RELAY_NATIVE',origin:location.origin,token,client,op,...values},r=>{const error=root.chrome?.runtime?.lastError||external.lastError;if(error||!r)reject(Error('网页连接扩展不可用，请加载或重新加载 extension；本机记录不受影响。'));else if(!r.ok)reject(Error(r.error));else resolve(r.value);});});
  }
  const area=name=>({async get(keys){if(typeof keys==='string')keys=[keys];if(!Array.isArray(keys))keys=Object.keys(keys||{});const out={};for(const key of keys){const value=await rpc('read',{area:name,key});if(value!==null)out[key]=value;}return out;},async set(values){for(const [key,value]of Object.entries(values))await rpc('write',{area:name,key,value});},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])await rpc('remove',{area:name,key});},async setAccessLevel(){}});
  const localURL=url=>new URL(url,location.origin).origin===location.origin;
  const chrome={storage:{local:area('local'),session:area('session')},runtime:{id:'relay-native',getURL:file=>new URL(file,location.origin+'/').href,lastError:null},
    permissions:{async contains({permissions}={}){return !permissions||Notification.permission==='granted';},async request({permissions}={}){return !permissions||await Notification.requestPermission()==='granted';}},
    notifications:{async create(id,values){if(Notification.permission==='granted')new Notification(values.title,{body:values.message,icon:'/icon-128.png'});return id;}},
    tabs:{async get(id){return bridge('tab.get',{id});},async create(options){if(localURL(options.url)){const u=new URL(options.url);u.searchParams.set('launch',token);window.open(u.href);return {id:0};}return bridge('tab.create',{options});},async update(id,options){return bridge('tab.update',{id,options});},async remove(id){return bridge('tab.remove',{id});},async sendMessage(id,message){return bridge('tab.message',{id,message});},async getCurrent(){return {id:-1};}},
    windows:{async create(options){return bridge('window.create',{options});},async update(id,options){return bridge('window.update',{id,options});},async getAll(){return [];}}};
  // Preserve Chrome's external messaging object before supplying the workspace storage facade.
  root.chrome=chrome;
  root.RelayNative={rpc,bridge,get owner(){return owner;},
    async acquire(){for(;;){if(await rpc('lease')){owner=true;leaseTimer=setInterval(async()=>{try{if(!await rpc('lease'))throw Error('写入权已转移。');}catch{owner=false;clearInterval(leaseTimer);location.reload();}},5000);return;}await new Promise(resolve=>setTimeout(resolve,1200));}},
    async api(id,url,options,timeout){const result=await rpc('api',{id,url,headers:options.headers,body:options.body,timeout});return new Response(result.body,{status:result.status,headers:{'Content-Type':'application/json'}});},
    async recovered(id){const result=await rpc('read',{area:'requests',key:id});return result?.status==='done'?result.response:null;}
  };
  window.addEventListener('pagehide',()=>{clearInterval(leaseTimer);fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-Relay-Proof':token,'X-Relay-Client':client},body:JSON.stringify({op:'release'}),keepalive:true}).catch(()=>{});});
})(globalThis);
