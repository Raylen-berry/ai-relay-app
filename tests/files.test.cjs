const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate}=require('../extension/files.js');
const C=require('../extension/core.js');
test('file selection rejects empty files, duplicate names and limits before sending',()=>{
  assert.doesNotThrow(()=>validate([{name:'one.png',size:512},{name:'two.pdf',size:3000}]));
  assert.throws(()=>validate([{name:'empty.txt',size:0}]),/不能为空/);
  assert.throws(()=>validate([{name:'big.pdf',size:21*1024*1024}]),/20 MB/);
  assert.throws(()=>validate(Array.from({length:11},(_,i)=>({name:i+'.txt',size:1}))),/10 个/);
  assert.throws(()=>validate(Array.from({length:3},(_,i)=>({name:i+'.pdf',size:20*1024*1024}))),/50 MB/);
  assert.throws(()=>validate([{name:'same.png',size:2},{name:'same.png',size:3}]),/名称不能重复/);
});
test('JSON imports never activate machine-local file references from another export',()=>{
  const imported=C.importData({config:{q:'问题',attachments:[{id:'foreign',name:'file.pdf',size:12}]},run:{tabs:{primary:{id:100}},attachments:[{id:'foreign'}]}});
  assert.equal(imported.config.attachments,undefined);assert.equal(imported.run,undefined);
});
