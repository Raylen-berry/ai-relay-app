const {test} = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../extension/engine.js');
const C = require('../extension/core.js');
function harness() {
  let time=1000, seq=0; const tabs=new Map(), sent=[], snapshots=[], activated=[], closed=[];
  const io={
    async create(provider){const id=++seq;tabs.set(id,{ok:true,input:true,inputOccupied:false,draft:'',busy:false,url:C.providers[provider].url,answers:[]});return id;},
    async snapshot(id){if(!tabs.has(id))throw new Error('页面已关闭');return structuredClone(tabs.get(id));},
    async activate(id){activated.push(id);}, async close(id){closed.push(id);}, async cancel(){}, async resume(){},
    async send(id,p){sent.push({id,...p});return {ok:true};}
  };
  const e = new Engine(io,async r=>snapshots.push(structuredClone(r)),()=>time,()=>String(++seq));
  return {e,io,tabs,sent,snapshots,activated,closed,advance:ms=>time+=ms,config:{q:'问题',primary:'deepseek',reviewer:'chatgpt',timeout:5,templates:{...C.templates}}};
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
  assert.deepEqual(h.closed.sort(),[h.e.run.tabs.primary.id,h.e.run.tabs.reviewer.id].sort());
  assert.equal(h.activated[0],h.e.run.tabs.primary.id);
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

test('resuming a Kimi legacy collapsed prompt repairs only the exact pending task',async()=>{
  for(const modified of [false,true]) {
    const h=harness();await h.e.begin({...h.config,primary:'kimi',reviewer:'deepseek'});
    h.io.send=async(id,p)=>{h.sent.push({id,...p});return {ok:false,beforeClick:true,error:'旧版未接收换行'};};
    await h.e.tick();assert.equal(h.e.run.status,'paused');
    const p=h.e.run.pending,tab=h.tabs.get(h.e.run.tabs.primary.id);
    tab.inputOccupied=true;tab.draft=p.prompt.replace(/\n/g,'')+(modified?'用户修改':'');
    h.io.send=async(id,p)=>{h.sent.push({id,...p});return {ok:true};};
    await h.e.resume();await h.e.tick();
    assert.equal(h.sent.length,modified?1:2);
    assert.equal(h.e.run.status,modified?'paused':'running');
    if(!modified)assert.equal(h.sent[1].prompt,p.prompt);
  }
});

test('custom 1-2-3-2-1 route reuses each model conversation and keeps all prior reviews',async()=>{
  const h=harness();await h.e.begin({...h.config,third:'kimi',sequence:'1-2-3-2-1'});
  await h.e.tick();assert.equal(h.sent.length,1);
  await answer(h,'初稿');await h.e.tick();assert.equal(h.sent.length,2);
  await answer(h,'审核二');await h.e.tick();assert.equal(h.sent.length,3);
  await answer(h,'审核三');await h.e.tick();assert.equal(h.sent.length,4);
  assert.equal(h.sent[3].id,h.sent[1].id);assert.match(h.sent[3].prompt,/审核二/);assert.match(h.sent[3].prompt,/审核三/);
  await answer(h,'复审二');await h.e.tick();assert.equal(h.sent.length,5);
  assert.equal(h.sent[4].id,h.sent[0].id);assert.match(h.sent[4].prompt,/复审二/);
  await answer(h,'【最终答案】已综合四轮意见');
  assert.equal(h.e.run.finalOut,'已综合四轮意见');assert.equal(h.e.run.turns.length,5);
  assert.equal(h.closed.length,3);
});

test('long question sends bounded chunks in order and waits for each receipt',async()=>{
  const h=harness();await h.e.begin({...h.config,q:'研究材料\n'.repeat(1500)});
  await h.e.tick();const p=h.e.run.pending;
  assert.ok(p.parts.length>2);assert.equal(h.sent.length,1);assert.equal(p.phase,'waitingPart');
  for(let i=0;i<p.parts.length-1;i++) {
    const chunk=h.sent.at(-1);assert.equal(chunk.marker,p.parts[i].marker);
    h.tabs.get(chunk.id).answers.push({text:'收到 '+chunk.marker});
    await h.e.tick();h.advance(1200);await h.e.tick();
    assert.equal(p.partIndex,i+1);
    await h.e.tick();assert.equal(h.sent.length,i+2);
  }
  assert.equal(h.sent.at(-1).marker,p.marker);
  assert.equal(p.phase,'waiting');
});

test('manual takeover and handoff resume receipt collection without resending',async()=>{
  const h=harness();await h.e.begin(h.config);await h.e.tick();
  const prior=h.sent.length;
  await h.e.takeover();assert.equal(h.e.run.status,'paused');
  await h.e.markManualSent();await h.e.resume();await h.e.tick();
  assert.equal(h.sent.length,prior);assert.equal(h.e.run.pending.phase,'waiting');
  await answer(h,'用户手动取得的初稿');assert.equal(h.e.run.outputs.first,'用户手动取得的初稿');
});

test('resumes a task attachment instead of mistaking the empty text for a sent prompt',async()=>{
  const h=harness();h.io.send=async(id,p)=>{h.sent.push({id,...p});return {ok:false,beforeClick:true,draftRetained:true,error:'parsing'};};
  await h.e.begin(h.config);await h.e.tick();assert.equal(h.e.run.status,'paused');
  const tab=h.tabs.get(h.e.run.tabs.primary.id);tab.attachments={count:1,signature:'["relay.txt"]'};tab.inputOccupied=true;
  h.io.send=async(id,p)=>{h.sent.push({id,...p});return {ok:true,attachment:true};};
  await h.e.resume();await h.e.tick();assert.equal(h.sent.length,2);assert.equal(h.sent[1].attachmentSignature,'["relay.txt"]');
  assert.equal(h.e.run.pending.phase,'waiting');
});
test('timing separates send, answer wait and pause; finished totals freeze and rows add up',async()=>{
  const h=harness(),send=h.io.send;h.io.send=async(...args)=>{h.advance(2000);return send(...args);};
  await h.e.begin(h.config);h.advance(1000);await h.e.tick();
  h.advance(3000);await h.e.pause();h.advance(5000);await h.e.resume();await answer(h,'first');
  await h.e.tick();await answer(h,'review');await h.e.tick();await answer(h,'【最终答案】done');
  const t=Engine.timing(h.e.run,h.e.now());
  assert.equal(t.setup.send,1000);assert.equal(t.rounds[0].send,2000);assert.equal(t.rounds[0].wait,10000);assert.equal(t.rounds[0].paused,5000);
  assert.equal(t.send,7000);assert.equal(t.wait,24000);assert.equal(t.paused,5000);assert.equal(t.total,36000);
  h.advance(60000);assert.deepEqual(Engine.timing(h.e.run,h.e.now()),t);
});
test('reloading keeps recorded timing and counts closed-window time as pause',async()=>{
  const h=harness();await h.e.begin(h.config);await h.e.tick();h.advance(4000);await h.e.save();
  const saved=structuredClone(h.e.run);h.advance(10000);h.e.restore(saved);
  const t=Engine.timing(h.e.run,h.e.now());assert.equal(t.wait,4000);assert.equal(t.paused,10000);assert.equal(t.total,14000);
  await h.e.resume();h.advance(1000);await h.e.save();assert.equal(Engine.timing(h.e.run,h.e.now()).wait,5000);
});
