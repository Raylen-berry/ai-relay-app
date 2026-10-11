const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('optional notification click binding activates after permission grant and reuses the workbench',async()=>{
  let permissionAdded,notificationClick,focused=0,bindings=0;
  const chrome={storage:{local:{setAccessLevel:async()=>{}}},runtime:{getURL:f=>'chrome-extension://relay/'+f,onMessage:{addListener(){}}},action:{onClicked:{addListener(){}}},permissions:{onAdded:{addListener:fn=>permissionAdded=fn}},tabs:{update:async()=>{}},windows:{getAll:async()=>[{id:1,tabs:[{id:2,url:'chrome-extension://relay/app.html'}]}],update:async()=>{focused++;},create:async()=>{throw Error('should focus existing');}}};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../extension/background.js'),'utf8'),{chrome,console,importScripts:name=>assert.equal(name,'native-bridge.js')});
  chrome.notifications={onClicked:{addListener:fn=>{bindings++;notificationClick=fn;}}};permissionAdded();permissionAdded();assert.equal(bindings,1);
  notificationClick('unrelated');await new Promise(setImmediate);assert.equal(focused,0);notificationClick('relay-task');await new Promise(setImmediate);assert.equal(focused,1);
});

test('extension reload does not open a workbench until its icon is clicked',async()=>{
  let click,installed=false;
  const chrome={storage:{local:{setAccessLevel:async()=>{}}},runtime:{getURL:f=>'chrome-extension://relay/'+f,
    onMessage:{addListener(){}},onInstalled:{addListener:()=>{installed=true;}}},action:{onClicked:{addListener:fn=>click=fn}},
    windows:{getAll:async()=>[],create:async()=>{opened++;}}};
  let opened=0;
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../extension/background.js'),'utf8'),{chrome,console,importScripts:name=>assert.equal(name,'native-bridge.js')});
  assert.equal(installed,false);assert.equal(opened,0);assert.equal(typeof click,'function');
  await click();await new Promise(setImmediate);assert.equal(opened,1);
});

test('two desktop launches focus one existing workbench and close only the empty launchers',async()=>{
  const base='chrome-extension://relay/',tabs=new Map([[1,{id:1,windowId:8,url:base+'open.html'}],[2,{id:2,windowId:9,url:base+'open.html'}]]);
  const removed=[],focused=[];let listener;
  const chrome={storage:{local:{setAccessLevel:async()=>{}}},runtime:{id:'relay',getURL:f=>base+f,onMessage:{addListener:fn=>listener=fn}},action:{onClicked:{addListener(){}}},
    tabs:{get:async id=>tabs.get(id),update:async(id,change)=>{Object.assign(tabs.get(id),change);return tabs.get(id);},remove:async id=>{removed.push(id);tabs.delete(id);}},
    windows:{getAll:async()=>[...tabs.values()].map(tab=>({id:tab.windowId,state:'minimized',tabs:[{...tab}]})),update:async(id,change)=>focused.push({id,...change}),create:()=>{throw new Error('must reuse launch window');}}};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../extension/background.js'),'utf8'),{chrome,console,importScripts:name=>assert.equal(name,'native-bridge.js')});
  const open=id=>new Promise(resolve=>listener({type:'RELAY_OPEN_APP',tabId:id},{id:'relay',url:base+'open.html'},resolve));
  const result=await Promise.all([open(1),open(2)]);
  assert.equal(result[0].ok,true);assert.equal(result[1].reused,true);assert.equal(tabs.get(1).url,base+'app.html');assert.deepEqual(removed,[2]);assert.equal(focused[0].state,'normal');
  // Closing the workbench leaves no durable ownership flag for the next launch.
  tabs.delete(1);tabs.set(3,{id:3,windowId:10,url:base+'open.html'});
  assert.equal((await open(3)).reused,false);assert.equal(tabs.get(3).url,base+'app.html');
});
