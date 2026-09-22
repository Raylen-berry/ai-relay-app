const {test} = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../extension/engine.js');
const C = require('../extension/core.js');
function harness() {
  let time=1000, seq=0; const tabs=new Map(), sent=[], snapshots=[];
  const io={
    async create(provider){const id=++seq;tabs.set(id,{ok:true,input:true,inputOccupied:false,draft:'',busy:false,url:C.providers[provider].url,answers:[]});return id;},
    async snapshot(id){if(!tabs.has(id))throw new Error('页面已关闭');return structuredClone(tabs.get(id));},
    async activate(){}, async cancel(){}, async resume(){},
    async send(id,p){sent.push({id,...p});return {ok:true};}
  };
  const e = new Engine(io,async r=>snapshots.push(structuredClone(r)),()=>time,()=>String(++seq));
  return {e,io,tabs,sent,snapshots,advance:ms=>time+=ms,config:{q:'问题',primary:'deepseek',reviewer:'chatgpt',timeout:5,templates:{...C.templates}}};
}
async function answer(h,body) {
  const p=h.sent.at(-1);h.tabs.get(p.id).answers.push({text:body+p.marker});
  await h.e.tick();h.advance(7000);await h.e.tick();
}
test('full three-stage chain preserves context and returns to the original tab', async()=>{
  const h=harness();await h.e.begin(h.config);await h.e.tick();
  assert.equal(h.sent.length,1);await answer(h,'初稿');
  await h.e.tick();assert.equal(h.sent.length,2);assert.match(h.sent[1].prompt,/初稿/);
  await answer(h,'审核建议');await h.e.tick();assert.equal(h.sent.length,3);
  assert.equal(h.sent[2].id,h.sent[0].id);assert.notEqual(h.sent[1].id,h.sent[0].id);
  assert.match(h.sent[2].prompt,/审核建议/);await answer(h,'【修正处理】已吸收\n【最终答案】最终文本');
  assert.equal(h.e.run.status,'done');assert.equal(h.e.run.finalOut,'最终文本');
  assert.equal(h.sent.length,3);
});
test('lost send acknowledgment never automatically repeats submission, including after reload',async()=>{
  const h=harness();h.io.send=async(id,p)=>{h.sent.push({id,...p});throw new Error('port lost');};
  await h.e.begin(h.config);await h.e.tick();assert.equal(h.e.run.status,'paused');
  assert.equal(h.e.run.pending.phase,'dispatching');
  const saved=structuredClone(h.e.run);h.e.restore(saved);await h.e.resume();await h.e.tick();
  assert.equal(h.sent.length,1);await answer(h,'初稿');assert.equal(h.e.run.outputs.first,'初稿');
});
test('pause during pending send prevents subsequent stage and resume does not resend',async()=>{
  const h=harness();let resolveSend;h.io.send=async(id,p)=>{h.sent.push({id,...p});return new Promise(r=>resolveSend=r);};
  await h.e.begin(h.config);const flight=h.e.tick();
  while(!resolveSend) await new Promise(setImmediate);
  await h.e.pause();resolveSend({ok:true});await flight;
  assert.equal(h.e.run.status,'paused');await h.e.tick();assert.equal(h.sent.length,1);
  await h.e.resume();await answer(h,'初稿');assert.equal(h.sent.length,1);
});
test('checks reviewer login before spending a primary turn',async()=>{
  const h=harness();const create=h.io.create;h.io.create=async p=>{const id=await create(p);if(p==='chatgpt')h.tabs.get(id).input=false;return id;};
  await h.e.begin(h.config);await h.e.tick();assert.equal(h.e.run.status,'paused');assert.equal(h.sent.length,0);
});
test('timeout pauses; manual recovery remains paused until explicitly resumed',async()=>{
  const h=harness();await h.e.begin(h.config);await h.e.tick();h.advance(6*60000);await h.e.tick();
  assert.equal(h.e.run.status,'paused');await h.e.acceptManual('补入初稿');assert.equal(h.e.run.outputs.first,'补入初稿');
  await h.e.tick();assert.equal(h.sent.length,1);await h.e.resume();await h.e.tick();assert.equal(h.sent.length,2);
});
test('closed page and changed conversation never trigger a send to the wrong context',async()=>{
  const h=harness();await h.e.begin(h.config);await h.e.tick();await answer(h,'初稿');
  await h.e.tick();await answer(h,'审核');h.tabs.get(h.e.run.tabs.primary.id).answers=[];
  await h.e.tick();assert.equal(h.e.run.status,'paused');assert.equal(h.sent.length,2);
});
test('a stop during preflight cannot dispatch a prompt',async()=>{
  const h=harness();let release;h.io.snapshot=async id=>{await new Promise(r=>release=r);return structuredClone(h.tabs.get(id));};
  await h.e.begin(h.config);const flight=h.e.tick();while(!release) await new Promise(setImmediate);
  await h.e.pause();release();
  // The preflight may finish reading both pages but must not send either one.
  h.io.snapshot=async id=>structuredClone(h.tabs.get(id));
  await flight;assert.equal(h.sent.length,0);assert.equal(h.e.run.status,'paused');
});
test('an exact prompt already in the composer is resumed, while unrelated drafts stay protected',async()=>{
  const h=harness();await h.e.begin(h.config);await h.e.tick();await answer(h,'初稿');
  const marker='【接力结束_resume】';
  const prompt=C.promptFor(h.e.run,'review',marker);
  h.e.run.pending={taskId:'resume-task',marker,phase:'prepared',started:1000,prompt};
  const reviewer=h.tabs.get(h.e.run.tabs.reviewer.id);
  reviewer.inputOccupied=true;reviewer.draft=prompt;
  await h.e.tick();assert.equal(h.sent.length,2);assert.equal(h.sent[1].prompt,prompt);

  const h2=harness();await h2.e.begin(h2.config);await h2.e.tick();await answer(h2,'初稿');
  const marker2='【接力结束_protect】';
  h2.e.run.pending={taskId:'protect-task',marker:marker2,phase:'prepared',started:1000,prompt:C.promptFor(h2.e.run,'review',marker2)};
  const reviewer2=h2.tabs.get(h2.e.run.tabs.reviewer.id);
  reviewer2.inputOccupied=true;reviewer2.draft='用户自己的草稿';
  await h2.e.tick();assert.equal(h2.sent.length,1);assert.equal(h2.e.run.status,'paused');assert.match(h2.e.run.error,/其他文字/);
});
test('a confirmed unsent prompt becomes retryable only after explicit resume',async()=>{
  const h=harness();let attempts=0;
  h.io.send=async(id,p)=>{h.sent.push({id,...p});attempts++;return attempts===1?{ok:false,retryableDraft:true,error:'未发送'}:{ok:true};};
  await h.e.begin(h.config);await h.e.tick();assert.equal(h.e.run.status,'paused');assert.equal(h.e.run.pending.phase,'prepared');assert.equal(attempts,1);
  await h.e.tick();assert.equal(attempts,1);
  const tab=h.tabs.get(h.e.run.tabs.primary.id);tab.inputOccupied=true;tab.draft=h.e.run.pending.prompt;
  await h.e.resume();await h.e.tick();assert.equal(attempts,2);assert.equal(h.e.run.pending.phase,'waiting');
});
test('a manually submitted prepared prompt is collected instead of sent twice',async()=>{
  const h=harness();await h.e.begin(h.config);await h.e.tick();await answer(h,'初稿');
  const marker='【接力结束_manualsend】';
  h.e.run.pending={taskId:'manual-send',marker,phase:'prepared',started:1000,prompt:C.promptFor(h.e.run,'review',marker)};
  const reviewer=h.tabs.get(h.e.run.tabs.reviewer.id);
  reviewer.answers.push({text:'审核意见'+marker});
  await h.e.tick();assert.equal(h.sent.length,1);assert.equal(h.e.run.pending.phase,'waiting');
  h.advance(7000);await h.e.tick();assert.equal(h.sent.length,1);assert.equal(h.e.run.outputs.review,'审核意见');
});
test('submitted user message without a finished answer prevents resending on resume',async()=>{
  const h=harness();await h.e.begin(h.config);await h.e.tick();await answer(h,'初稿');
  const marker='【接力结束_inflight】';
  h.e.run.pending={taskId:'inflight',marker,phase:'prepared',started:1000,prompt:C.promptFor(h.e.run,'review',marker)};
  const tab=h.tabs.get(h.e.run.tabs.reviewer.id);tab.userMessages=[{text:h.e.run.pending.prompt}];
  await h.e.tick();assert.equal(h.sent.length,1);assert.equal(h.e.run.pending.phase,'waiting');
});
test('uncertain retry whose composer was later cleared waits instead of inserting again',async()=>{
  const h=harness();h.io.send=async(id,p)=>{h.sent.push({id,...p});return {ok:false,retryableDraft:true};};
  await h.e.begin(h.config);await h.e.tick();assert.equal(h.e.run.status,'paused');
  await h.e.resume();await h.e.tick();assert.equal(h.sent.length,1);assert.equal(h.e.run.pending.phase,'waiting');
});
