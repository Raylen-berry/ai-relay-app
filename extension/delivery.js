(function(root) {
  'use strict';
  const D = root.RelayDeliveryData, $ = id => document.getElementById(id);
  const node = (tag, text, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; };
  function init(ctx) {
    let last = '', formSignature = '', timer;
    const desk=root.RelayDeliverables?.init(ctx,()=>{last='';render();});
    const reviewRun=()=>desk?desk.current():ctx.run();
    const reviewEditable=()=>desk?desk.writable():editable();
    const editable = () => ctx.writable() && !ctx.busy();
    async function save(message) { await ctx.store(); await ctx.changed(); $('deliverySaved').textContent = message; }
    const signature = d => JSON.stringify([d.purpose,d.format,d.requirements,d.reviewMode,d.maxMinutes,d.maxApiCalls,d.maxOutputTokens,ctx.config().sequence]);
    function populate() {
      const d = D.settings(ctx.config().delivery);
      const sig = signature(d);
      if (sig === formSignature) return;
      formSignature = sig;
      for (const [id, value] of [['deliveryPurpose',d.purpose],['deliveryFormat',d.format],['deliveryRequirements',d.requirements.join('\n')],['deliveryMinutes',d.maxMinutes],['deliveryCalls',d.maxApiCalls],['deliveryTokens',d.maxOutputTokens]]) $(id).value = value;
      $('deliveryMode').value = ctx.config().sequence === '1' ? 'single' : d.reviewMode;
    }
    function read() {
      const old = D.settings(ctx.config().delivery);
      const requirements=$('deliveryRequirements').value.split('\n').map(v=>v.trim()).filter(Boolean);
      if(requirements.length>12||requirements.some(v=>v.length>500))throw Error('验收条件最多 12 项，每项最多 500 字。请精简后再开始。');
      ctx.config().delivery = D.settings({...old, purpose:$('deliveryPurpose').value, format:$('deliveryFormat').value, requirements:$('deliveryRequirements').value.split('\n'), maxMinutes:$('deliveryMinutes').value, maxApiCalls:$('deliveryCalls').value, maxOutputTokens:$('deliveryTokens').value, reviewMode:$('deliveryMode').value});
    }
    async function changedForm(mode = false) {
      if (!editable()) return;
      read();
      if (mode) {
        ctx.config().sequence = $('deliveryMode').value === 'single' ? '1' : '1-2-1';
        ctx.populate();
      }
      if (mode) { formSignature = ''; populate(); }
      else formSignature = signature(D.settings(ctx.config().delivery));
      clearTimeout(timer);
      timer = setTimeout(() => save('任务要求已保存。').catch(e => ctx.message(e.message,true)), 250);
      ctx.render();
    }
    async function changeCheck(fn,target) {
      if(desk){await desk.changeCheck(fn,target);last='';render();return;}
      const run = ctx.run();
      if (!editable() || !run?.finalOut) return;
      const previous = structuredClone(run.delivery);
      run.delivery = D.settings(run.delivery); fn(run.delivery);
      try { await save('核对记录已保存。'); }
      catch (e) { run.delivery = previous; await ctx.store().catch(()=>{}); await ctx.changed().catch(()=>{}); throw e; }
      last = ''; render();
    }
    function event(id, type, action) { $(id).addEventListener(type, async e => { try { await action(e); } catch(error) { ctx.message(error.message,true); } }); }
    function render() {
      populate();
      for (const id of ['deliveryPurpose','deliveryFormat','deliveryRequirements','deliveryMode','deliveryMinutes','deliveryCalls','deliveryTokens','deliveryRestore','deliveryClearKeys']) $(id).disabled = !editable();
      $('deliveryBackup').disabled = !ctx.writable() || ctx.busy();
      desk?.render();
      $('sendToDelivery').disabled=!ctx.writable()||!ctx.run()?.finalOut;
      const task=ctx.run(),run=reviewRun(),a=D.assessment(run);
      $('deliveryPartialBox').hidden=!task?.partialAnswer||task.status==='done';
      $('deliveryPartial').value=task?.partialAnswer||'';
      $('deliveryBadge').textContent = a.label;
      $('deliveryBadge').classList.toggle('problem', !!a.contradicted);
      $('deliveryResult').hidden = !run?.finalOut;
      $('deliveryExtend').hidden = task?.status !== 'paused' || task?.issue?.code !== 'run-limit';
      $('deliveryExtend').disabled = !editable();
      if (!run?.finalOut) return;
      const sig = JSON.stringify([run.id,run.finalOut,run.workflow,run.delivery,reviewEditable()]);
      if (sig === last) return;
      last = sig;
      const summary = $('deliverySummary'); summary.replaceChildren();
      summary.append(node('span',D.scopeText(run.workflow)));
      if (a.noCriteria) summary.append(node('span','本次没有预先设置验收条件，成果质量尚未确认。'));
      if (a.missingCitations) summary.append(node('span','回答没有可定位的引用，关键事实仍待核对。'));
      summary.append(node('span',`待核对 ${a.pending} 项；证据问题 ${a.contradicted} 项。没有引用的表述也可能需要核查。`));
      if(a.math.required)summary.append(node('span',a.math.present ? '数字核对块：'+a.math.items.filter(v=>v.ok).length+'/'+a.math.items.length+' 项与本机统计一致。只覆盖列出的数值，全文解释仍需检查。' : '尚未提供数字核对块，不能自动确认结论中的数字。'));
      for(const item of a.math.items.filter(v=>!v.ok))summary.append(node('span','数值问题：'+item.label+'；回答 '+String(item.value??'无')+'；本机 '+String(item.expected??'无')));
      const acceptance = $('deliveryAcceptance'); acceptance.replaceChildren();
      const d = D.settings(run.delivery);
      for (const requirement of d.requirements) {
        const li=node('li'), label=node('label'), check=node('input'); check.type='checkbox'; check.checked=d.accepted.includes(requirement); check.disabled=!reviewEditable();
        check.addEventListener('change',()=>changeCheck(value=>{value.accepted=check.checked?[...new Set([...value.accepted,requirement])]:value.accepted.filter(v=>v!==requirement);},run.id).catch(e=>ctx.message(e.message,true)));
        label.append(check,node('span',requirement)); li.append(label); acceptance.append(li);
      }
      const list=$('deliveryClaims'); list.replaceChildren();
      if (!a.items.length) list.append(node('li','没有可识别的段落引用。请结合原文与任务要求检查成果。'));
      // Render only a bounded window; every claim remains counted and exported.
      for (const claim of a.items.slice(0,80)) {
        const li=node('li'); li.append(node('p',claim.text));
        const details=node('details'); details.append(node('summary','查看本次提供的原文'));
        claim.ids.forEach((id,i)=>details.append(node('blockquote','['+id+'] '+(claim.refs[i] ? claim.refs[i].title+' · '+claim.refs[i].label+'\n'+claim.refs[i].text : '本次没有提供这个编号。')))); li.append(details);
        const row=node('div',undefined,'delivery-check-row'), select=node('select'), note=node('input'); note.type='text'; note.maxLength=500; note.placeholder='核对说明（可选）'; note.value=claim.review?.note||''; note.setAttribute('aria-label','核对说明：'+claim.ids.join(','));
        for (const [value,label] of [['pending','待核对'],['supported','这句话有依据'],['contradicted','证据不符'],['uncertain','无法确认']]) { const option=node('option',label); option.value=value; select.append(option); }
        select.value=claim.status; select.setAttribute('aria-label','引用表述核对：'+claim.ids.join(',')); select.disabled=note.disabled=!reviewEditable()||!claim.known||!claim.checkable;
        const update=()=>changeCheck(value=>{value.checks=value.checks.filter(c=>c.text!==claim.text||c.evidence!==claim.evidence);if(select.value!=='pending')value.checks.push({text:claim.text,evidence:claim.evidence,status:select.value,note:note.value});},run.id);
        select.addEventListener('change',()=>update().catch(e=>ctx.message(e.message,true))); note.addEventListener('change',()=>update().catch(e=>ctx.message(e.message,true)));
        row.append(select,note); li.append(row); if(!claim.known) li.append(node('p','编号不存在，不能标记为有依据。','delivery-note')); if(!claim.checkable)li.append(node('p','表述或证据过长，无法在此标记，请拆分后核对。','delivery-note')); list.append(li);
      }
      if (a.items.length>80) list.append(node('li','界面显示前 80 项；其余项目仍列为待核对，并写入核对记录。'));
    }
    for (const id of ['deliveryPurpose','deliveryFormat','deliveryRequirements','deliveryMinutes','deliveryCalls','deliveryTokens']) event(id,'input',()=>changedForm());
    event('deliveryMode','change',()=>changedForm(true));
    event('deliveryReport','click',async()=>{await desk?.flush();const r=reviewRun();if(r?.finalOut)RelayExports.download(r.finalOut+(root.RelayWorkflowData?.citationAppendix(r.finalOut,r.workflow)||'')+D.appendix(r),'AI-Relay-成果与核对记录.md','text/markdown;charset=utf-8');});
    event('deliveryExtend','click',async()=>{if(!editable()||ctx.run()?.issue?.code!=='run-limit')return;const r=ctx.run();r.delivery=D.settings({...r.delivery,maxMinutes:D.settings(r.delivery).maxMinutes+15,maxApiCalls:D.settings(r.delivery).maxApiCalls+1});await save('运行上限已增加。点击“继续当前步骤”接着处理。');ctx.render();});
    event('deliveryClearKeys','click',async()=>{if(!editable()||!ctx.extension)return;await chrome.storage.session.remove('relayApiSecrets');await chrome.storage.local.remove('relayApiSecrets');$('apiKey').value='';await save('保存的 API Key 已清除。网页账号和接口地址保留。');});
    event('deliveryBackup','click',async()=>{if(!editable())return;await desk?.flush();await ctx.store();await ctx.changed();const data=D.packageData({current:ctx.run()||{...ctx.config(),id:'prepared-task',status:'paused'},history:ctx.workspace().history,queue:ctx.workspace().queue,materials:ctx.materials(),deliverables:desk?.state()});RelayExports.download(JSON.stringify(data,null,2),'AI-Relay-完整工作包-'+new Date().toISOString().slice(0,10)+'.json','application/json');$('deliverySaved').textContent='工作包已下载。请保存到 E:\\Download\\software\\AI-Relay\\工作包。';});
    event('deliveryRestore','change',async e=>{
      try {
        if(!editable())return;
        const file=e.target.files[0]; if(!file)return; if(file.size>25*1024*1024)throw Error('工作包超过 25 MB，请使用较小的备份。');
        const raw=JSON.parse(await file.text());if(raw.schema!=='ai-relay-delivery'||raw.version!==1||!Array.isArray(raw.tasks)||raw.tasks.length>100)throw Error('工作包格式无效。');
        const deliverables=raw.deliverables===undefined?undefined:root.RelayDeliverablesData.state(raw.deliverables,{imported:true});
        const materials=ctx.validateMaterials(raw.materials),tasks=raw.tasks.map(D.safeTask);if(tasks.some(t=>typeof t.id!=='string'||!t.id||t.q.length>120000)||new Set(tasks.map(t=>t.id)).size!==tasks.length)throw Error('任务编号或内容无效。');
        for(const task of tasks)if(task.workflow)task.workflow.restored=true;
        if(raw.queue!==undefined&&(!Array.isArray(raw.queue)||raw.queue.length>50))throw Error('工作包队列格式无效。');
        const queue=(raw.queue||[]).map(D.safeJob);if(new Set(queue.map(v=>v.id)).size!==queue.length)throw Error('队列项目编号重复。');
        if(!confirm('用工作包替换资料、任务库和队列？若含成果库也会替换成果库，旧版工作包保留现有成果库。建议先备份。恢复不运行任务，API Key 不会导入。'))return;
        if(!editable())throw Error('当前任务状态已变化，请暂停后重试。');
        await ctx.restore({materials,tasks,queue,deliverables});last='';ctx.render();$('deliverySaved').textContent='工作包已恢复，任务尚未发送。核对记录来自导入文件，请确认其来源。';
      } finally { e.target.value=''; }
    });
    if(root.RelayNative){const button=node('button','迁移浏览器旧记录','text-btn');$('deliveryClearKeys').after(button);button.onclick=async()=>{try{if(!editable())return;if(!confirm('将当前浏览器的旧版互审资料和任务库迁移到本机？会替换本机工作台中的资料和任务库，建议先保存工作包。旧浏览器记录保留，Key 和附件原文件需要重新配置。'))return;const raw=await RelayNative.bridge('workspace.export');const deliverables=undefined;const materials=ctx.validateMaterials(raw.materials),tasks=raw.tasks.map(D.safeTask),queue=(raw.queue||[]).map(D.safeJob);for(const task of tasks)if(task.workflow)task.workflow.restored=true;if(!editable())throw Error('当前任务状态已变化，请暂停后迁移。');await ctx.restore({materials,tasks,queue});last='';ctx.render();$('deliverySaved').textContent='浏览器旧记录已迁移，没有发送任务。请重新选择附件并配置 API Key。';}catch(e){ctx.message(e.message,true);}};}
    return {read,populate,render,desk,ready:desk?.ready||Promise.resolve()};
  }
  root.RelayDelivery={init};
})(globalThis);
