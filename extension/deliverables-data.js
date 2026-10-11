(function(root) {
  'use strict';
  const limits={records:50,text:300000,total:5000000}, D=()=>root.RelayDeliveryData;
  const text=(v,max,label)=>{if(typeof v!=='string'||v.length>max)throw Error(label+'格式无效或超过长度限制。');return v;};
  function normalize(raw,{imported=false}={}) {
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('成果记录格式无效。');
    const id=text(raw.id,100,'成果编号');if(!id||!/^[\w-]+$/.test(id))throw Error('成果编号无效。');
    const markdown=text(raw.markdown,limits.text,'成果正文');
    const title=text(raw.title,180,'成果标题').trim()||'未命名成果';
    const requirements=raw.delivery?.requirements;
    if(requirements!==undefined&&(!Array.isArray(requirements)||requirements.length>12||requirements.some(v=>typeof v!=='string'||v.length>500)))throw Error('验收条件最多 12 项，每项最多 500 字。');
    const refs=raw.workflow?.sourceRefs;
    if(refs!==undefined&&(!Array.isArray(refs)||refs.length>100||refs.some(r=>!r||!/^S[1-9]\d*:P[1-9]\d*$/.test(r.id)||typeof r.text!=='string'||r.text.length>850)||new Set(refs.map(r=>r.id)).size!==refs.length))throw Error('原文编号重复、无效或超过限制；每段最多 850 字。');
    const workflow=root.RelayWorkflowData?.meta(raw.workflow);
    const kind=['relay','paste','file'].includes(raw.origin?.kind)?raw.origin.kind:'paste';
    const origin={kind,label:typeof raw.origin?.label==='string'?raw.origin.label.slice(0,180):'',taskId:typeof raw.origin?.taskId==='string'?raw.origin.taskId.slice(0,100):'',sequence:typeof raw.origin?.sequence==='string'?raw.origin.sequence.slice(0,30):'',imported:imported||raw.origin?.imported===true};
    const delivery=D().settings(raw.delivery);
    if(imported){delivery.checks=[];delivery.accepted=[];if(workflow)workflow.restored=true;}
    const stamp=v=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):Date.now();
    return {id,title,markdown,origin,workflow,delivery,created:stamp(raw.created),updated:stamp(raw.updated)};
  }
  function state(raw,{imported=false}={}) {
    if(!raw||raw.version!==1||!Array.isArray(raw.records)||raw.records.length>limits.records)throw Error('成果库格式无效，最多保存 50 份。');
    const records=raw.records.map(v=>normalize(v,{imported}));
    if(new Set(records.map(v=>v.id)).size!==records.length)throw Error('成果编号重复。');
    if(records.reduce((n,r)=>n+r.markdown.length+(r.workflow?.sourceRefs||[]).reduce((m,s)=>m+s.text.length,0),0)>limits.total)throw Error('成果库最多保存 500 万字符，请先备份并删除旧成果。');
    return {version:1,records,activeId:records.some(v=>v.id===raw.activeId)?raw.activeId:records[0]?.id||''};
  }
  const empty=()=>({version:1,records:[],activeId:''});
  function create({id,title,markdown='',origin={kind:'paste'},workflow,delivery},now=Date.now()) {return normalize({id,title,markdown,origin,workflow,delivery,created:now,updated:now});}
  function fromRun(run,id) {
    if(!run?.finalOut?.trim())throw Error('尚无可接收的最终成果。');
    text(run.finalOut,limits.text,'成果正文');
    const safe=D().safeTask(run);
    const result=create({id,title:(safe.q||'互审成果').split('\n')[0].slice(0,180),markdown:safe.finalOut,origin:{kind:'relay',label:'AI 互审成果',taskId:safe.id,sequence:safe.sequence},workflow:safe.workflow,delivery:safe.delivery});
    // A copy begins a separate review; original task approvals never transfer automatically.
    result.delivery.checks=[];result.delivery.accepted=[];
    return result;
  }
  function update(record,changes,now=Date.now()) {
    const next=normalize({...record,...changes,updated:Math.max(now,record.updated+1)});
    const oldRequirements=JSON.stringify(record.delivery.requirements),newRequirements=JSON.stringify(next.delivery.requirements);
    if(next.markdown!==record.markdown||JSON.stringify(next.workflow)!==JSON.stringify(record.workflow)||oldRequirements!==newRequirements){next.delivery.checks=[];next.delivery.accepted=[];}
    return next;
  }
  function put(raw,record) {
    const saved=state(raw),next=normalize(record),exists=saved.records.some(r=>r.id===next.id);
    if(!exists&&saved.records.length===limits.records)throw Error('成果库已满。请先备份，再删除不需要的成果。');
    return state({...saved,activeId:next.id,records:exists?saved.records.map(r=>r.id===next.id?next:r):[next,...saved.records]});
  }
  function reference(record,{id,title,body}) {
    if(!/^S[1-9]\d*:P[1-9]\d*$/.test(id))throw Error('原文编号请使用 S1:P1 这样的格式。');
    if(typeof body!=='string'||!body.trim()||body.length>850)throw Error('请提供原文，每段最多 850 字；长文可分成多个编号。');
    text(title,180,'原文标题');
    const refs=(record.workflow?.sourceRefs||[]).filter(r=>r.id!==id);
    refs.push({id,title:title.trim().slice(0,180)||'手动提供的资料',label:'手动提供的原文',text:body,url:'',verified:false});
    return update(record,{workflow:{...record.workflow,kind:record.workflow?.kind||'research',sourceRefs:refs,scope:{...record.workflow?.scope,documents:new Set(refs.map(r=>r.id.split(':')[0])).size,totalChunks:refs.length,selectedChunks:refs.length,suppliedChars:refs.reduce((n,r)=>n+r.text.length,0),partial:true,method:'用户手动提供的原文快照'}}});
  }
  function asRun(record){return record?{id:record.id,q:record.title,status:'done',sequence:record.origin.sequence||'1',finalOut:record.markdown,workflow:record.workflow,delivery:record.delivery,deliveryOrigin:record.origin}:null;}
  const api={limits,normalize,state,empty,create,fromRun,update,put,reference,asRun};root.RelayDeliverablesData=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
