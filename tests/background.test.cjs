const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('extension reload does not open a workbench until its icon is clicked',async()=>{
  let click,installed=false;
  const chrome={storage:{local:{setAccessLevel:async()=>{}}},runtime:{getURL:f=>'chrome-extension://relay/'+f,
    onInstalled:{addListener:()=>{installed=true;}}},action:{onClicked:{addListener:fn=>click=fn}},
    windows:{getAll:async()=>[],create:async()=>{opened++;}}};
  let opened=0;
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../extension/background.js'),'utf8'),{chrome,console});
  assert.equal(installed,false);assert.equal(opened,0);assert.equal(typeof click,'function');
  await click();await new Promise(setImmediate);assert.equal(opened,1);
});
