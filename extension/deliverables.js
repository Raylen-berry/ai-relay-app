(function(root){
  'use strict';
  const B=root.RelayDeliverablesData,D=root.RelayDeliveryData,$=id=>document.getElementById(id);
  const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  function init(ctx,onReview){
    let saved=B.empty(),chain=Promise.resolve(),timer,dirty=false,revision=0,rendered='',previewed='',ready=false,loadError=false;
    const writable=()=>ready&&!loadError&&ctx.writable();
    const get=()=>saved.records.find(r=>r.id===saved.activeId)||null;
    const notice=(text,bad=false)=>{$('deskStatus').textContent=text;$('deskStatus').classList.toggle('error',bad);};
    const readStore=async()=>ctx.extension?(await chrome.storage.local.get('relayDeliverables')).relayDeliverables:JSON.parse(localStorage.getItem('relayDeliverables')||'null');
    const writeStore=async value=>ctx.extension?chrome.storage.local.set({relayDeliverables:value}):localStorage.setItem('relayDeliverables',JSON.stringify(value));
    const id=()=>crypto.randomUUID();
    function mutate(fn){
      const next=chain.then(async()=>{if(!writable())throw Error('当前窗口不能修改成果，请使用正在工作的窗口。');const value=B.state(await fn(structuredClone(saved)));await writeStore(value);saved=value;render();onReview();return value;});
      chain=next.catch(()=>{});return next;
    }
    function values(){return {title:$('deskTitle').value,markdown:$('deskBody').value,delivery:{purpose:$('deskPurpose').value,format:$('deskFormat').value,requirements:$('deskRequirements').value.split('\n').map(v=>v.trim()).filter(Boolean)}};}
    async function flush(){
      clearTimeout(timer);if(!dirty){await chain;return;}
      const target=saved.activeId,changes=values(),version=revision;
      await mutate(value=>{const r=value.records.find(v=>v.id===target);if(!r)throw Error('这份成果已不存在。');return B.put(value,B.update(r,{...changes,delivery:{...r.delivery,...changes.delivery}}));});
      if(version!==revision)return flush();
      dirty=false;render();notice('成果和核对记录已保存在本机。');
    }
    function event(el,type,fn){$(el).addEventListener(type,async e=>{try{await fn(e);}catch(error){notice('未完成：'+error.message,true);} });}
    function render(){
      const record=get(),can=writable();
      $('deskBusy').hidden=!ctx.busy();
      $('deskEmpty').hidden=!!record;$('deskEditor').hidden=!record;
      $('deskCount').textContent=saved.records.length+' / 50 份';
      $('deskReceive').disabled=!can||!ctx.run()?.finalOut;
      for(const key of ['deskNew','deskImport','deskRestore','deskDelete','deskSave','deskReferenceAdd','deskTitle','deskBody','deskPurpose','deskFormat','deskRequirements','deskRefId','deskRefTitle','deskRefBody'])$(key).disabled=!can;
      $('deskBackup').disabled=!ready||loadError||!saved.records.length;
      const picker=$('deskSelect');picker.replaceChildren();
      if(!saved.records.length){const o=node('option','还没有成果');o.value='';picker.append(o);}
      for(const r of saved.records){const o=node('option',r.title);o.value=r.id;picker.append(o);}picker.value=saved.activeId;picker.disabled=!can;
      const history=$('deskHistory'),hprev=history.value;history.replaceChildren(node('option','从任务库选择已完成的成果'));
      history.firstChild.value='';for(const r of ctx.workspace()?.history||[])if(r.finalOut&&r.status==='done'){const o=node('option',(r.q||'互审成果').split('\n')[0].slice(0,100));o.value=r.id;history.append(o);}history.value=hprev;history.disabled=!can;
      $('deskReceiveHistory').disabled=!can||!history.value;
      for(const key of ['deskMarkdown','deskWord','deskPDF'])$(key).disabled=!record?.markdown.trim()||!can;
      if(!record)return;
      $('deskOrigin').textContent=(record.origin.label||({relay:'AI 互审成果',paste:'粘贴的正文',file:'导入的文本'}[record.origin.kind]))+(record.origin.imported?' · 导入副本，旧核对状态未沿用':'')+' · 修改正文、依据或验收条件后需重新核对';
      const signature=record.id+':'+record.updated;
      if(!$('deskPreviewBody').hidden&&previewed!==signature){root.RelayMarkdown.render($('deskPreviewBody'),record.markdown);previewed=signature;}
      if(!dirty&&signature!==rendered){
        for(const [key,value]of [['deskTitle',record.title],['deskBody',record.markdown],['deskPurpose',record.delivery.purpose],['deskFormat',record.delivery.format],['deskRequirements',record.delivery.requirements.join('\n')]])if($(key)!==document.activeElement&&$(key).value!==value)$(key).value=value;
        rendered=signature;
      }
      const refs=$('deskReferences');refs.replaceChildren();
      for(const r of record.workflow?.sourceRefs||[]){const li=node('li'),d=node('details');d.append(node('summary','['+r.id+'] '+r.title),node('blockquote',r.text));li.append(d);const remove=node('button','移除这段依据');remove.className='text-btn';remove.disabled=!can;remove.onclick=async()=>{try{await flush();await mutate(value=>{const item=value.records.find(v=>v.id===record.id);return B.put(value,B.update(item,{workflow:{...item.workflow,sourceRefs:item.workflow.sourceRefs.filter(v=>v.id!==r.id)}}));});notice('依据已移除，核对记录已重置。');}catch(e){notice(e.message,true);}};li.append(remove);refs.append(li);}
    }
    async function show(delivery){await flush();$('taskWorkspace').hidden=delivery;$('deliveryWorkspace').hidden=!delivery;for(const [key,on]of [['navTasks',!delivery],['navDelivery',delivery]])$(key).setAttribute('aria-pressed',String(on));render();onReview();}
    async function add(record){await flush();dirty=false;await mutate(value=>B.put(value,record));notice('成果已接收，请填写验收条件并逐项核对。');await show(true);}
    for(const key of ['deskTitle','deskBody','deskPurpose','deskFormat','deskRequirements'])event(key,'input',()=>{if(!writable())return;dirty=true;revision++;notice('正在编辑…');clearTimeout(timer);timer=setTimeout(()=>flush().catch(e=>notice('尚未保存：'+e.message,true)),500);});
    event('navTasks','click',()=>show(false));event('navDelivery','click',()=>show(true));
    event('sendToDelivery','click',()=>add(B.fromRun(ctx.run(),id())));
    event('deskNew','click',()=>add(B.create({id:id(),title:'未命名成果'})));
    event('deskReceive','click',()=>add(B.fromRun(ctx.run(),id())));
    event('deskHistory','change',()=>{$('deskReceiveHistory').disabled=!writable()||!$('deskHistory').value;});
    event('deskReceiveHistory','click',()=>{const r=(ctx.workspace()?.history||[]).find(v=>v.id===$('deskHistory').value);return add(B.fromRun(r,id()));});
    event('deskSelect','change',async e=>{const target=e.target.value;await flush();dirty=false;await mutate(value=>({...value,activeId:target}));});
    event('deskSave','click',flush);
    event('deskDelete','click',async()=>{await flush();const r=get();if(!r||!confirm('删除“'+r.title+'”及其核对记录？请先备份需要保留的成果。'))return;await mutate(value=>({...value,records:value.records.filter(v=>v.id!==r.id),activeId:''}));notice('成果已删除。');});
    event('deskImport','change',async e=>{try{const f=e.target.files[0];if(!f)return;if(!/\.(txt|md|markdown)$/i.test(f.name)||f.size>1024*1024)throw Error('请选择不超过 1 MB 的 TXT 或 Markdown 文件。');let body;try{body=new TextDecoder('utf-8',{fatal:true}).decode(await f.arrayBuffer());}catch{throw Error('文件编码无法读取，请另存为 UTF-8 文本。');}if(body.includes('\u0000'))throw Error('文件包含非文本内容，请另存为 UTF-8 文本。');await add(B.create({id:id(),title:f.name.slice(0,180),markdown:body,origin:{kind:'file',label:f.name.slice(0,180)}}));}finally{e.target.value='';}});
    event('deskPreview','click',async()=>{await flush();const r=get();if(!r)return;const pane=$('deskPreviewBody');pane.hidden=!pane.hidden;$('deskPreview').setAttribute('aria-expanded',String(!pane.hidden));if(!pane.hidden){root.RelayMarkdown.render(pane,r.markdown);previewed=r.id+':'+r.updated;}});
    event('deskReferenceAdd','click',async()=>{await flush();const reference={id:$('deskRefId').value.trim(),title:$('deskRefTitle').value,body:$('deskRefBody').value};const target=saved.activeId;await mutate(value=>B.put(value,B.reference(value.records.find(v=>v.id===target),reference)));$('deskRefBody').value='';notice('原文已保存；同编号会替换旧原文，核对记录已重置。');});
    const report=async()=>{await flush();const r=B.asRun(get());if(!r?.finalOut.trim())throw Error('请先填写成果正文。');return {title:get().title,body:r.finalOut+(root.RelayWorkflowData?.citationAppendix(r.finalOut,r.workflow)||'')+D.appendix(r)};};
    event('deskMarkdown','click',async()=>{const r=await report();root.RelayExports.download(r.body,'成果与核对记录.md','text/markdown;charset=utf-8');});
    event('deskWord','click',async()=>{const r=await report();root.RelayExports.download(root.RelayExports.docx(r.body,r.title),'成果与核对记录.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document');});
    event('deskPDF','click',async()=>{const r=await report();await root.RelayExports.pdf(r.body,r.title);});
    event('deskBackup','click',async()=>{await flush();root.RelayExports.download(JSON.stringify({schema:'ai-relay-deliverables',...saved},null,2),'AI-Relay-成果库.json','application/json');notice('成果库已下载，包含正文、原文依据和核对记录。');});
    event('deskRestore','change',async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>25*1024*1024)throw Error('成果备份不能超过 25 MB。');const raw=JSON.parse(await f.text());if(raw.schema!=='ai-relay-deliverables')throw Error('这不是成果库备份。');const copy=B.state(raw,{imported:true});copy.records=copy.records.map(r=>({...r,id:id()}));await flush();await mutate(value=>{for(const r of copy.records)value=B.put(value,r);return value;});notice('备份已添加为独立副本。旧核对状态已清除，未发送任何任务。');}finally{e.target.value='';}});
    const reload=async()=>{clearTimeout(timer);await chain;dirty=false;const raw=await readStore();saved=raw?B.state(raw):B.empty();ready=true;loadError=false;rendered='';render();onReview();};
    const loading=reload().catch(e=>{ready=true;loadError=true;notice('成果库未能读取，原记录未改动：'+e.message,true);render();});
    return {ready:loading,render,flush,reload,state:()=>structuredClone(saved),current:()=>B.asRun(get()),
      changeCheck:async(fn,target=saved.activeId)=>{try{await flush();await mutate(value=>{if(value.activeId!==target)throw Error('所选成果已变化，请重新核对。');const r=value.records.find(v=>v.id===target);if(!r?.markdown.trim())throw Error('请先填写成果正文。');const next=structuredClone(r);fn(next.delivery);next.updated=Math.max(Date.now(),r.updated+1);return B.put(value,next);});notice('核对记录已保存。');}catch(e){notice('核对记录尚未保存：'+e.message,true);onReview();throw e;}},
      replace:async raw=>{await flush();await mutate(()=>B.state(raw));dirty=false;rendered='';render();onReview();},
      writable};
  }
  root.RelayDeliverables={init};
})(globalThis);
