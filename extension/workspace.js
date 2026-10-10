(function(root){
  'use strict';
  const D=root.RelayWorkspaceData,C=root.RelayCore,A=root.RelayAPI,$=id=>document.getElementById(id);
  const clone=v=>structuredClone(v),empty=()=>({version:1,history:[],queue:[],queueEnabled:false,activeJobId:null,apiProfiles:[],apiThreads:{},notifications:false});
  const labels={waiting:'等待',running:'处理中',paused:'已暂停',done:'已完成',cancelled:'已取消',blocked:'需重新选择附件'};
  function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
  function init(ctx){
    let state=empty(),chain=Promise.resolve(),selected=null,editing=null,lastData='',lastRoles='',lastLists='',lastHistory='',lastRun='',pumping=false;
    const writable=()=>ctx.writable();
    const on=(id,event,fn)=>$(id).addEventListener(event,async e=>{try{if(!writable()&&event!=='input'&&!['historyOpen','historyClose','queueOpen','queueClose','inspectDiff','inspectIssues','inspectSources'].includes(id))return;await fn(e);}catch(err){ctx.message(err.message,true);}});
    const save=()=>{if(!writable())return Promise.resolve();const payload=clone(state);chain=chain.catch(()=>{}).then(()=>ctx.extension?chrome.storage.local.set({relayWorkspace:payload}):localStorage.setItem('relayWorkspace',JSON.stringify(payload)));return chain;};
    const getKey=async id=>{if(!ctx.extension)return '';const session=(await chrome.storage.session.get('relayApiSecrets')).relayApiSecrets||{},local=(await chrome.storage.local.get('relayApiSecrets')).relayApiSecrets||{};return session[id]||local[id]||'';};
    const transport=A.transport({providers:C.providers,getKey,threads:state.apiThreads,save});
    async function load(){
      const data=ctx.extension?(await chrome.storage.local.get('relayWorkspace')).relayWorkspace:JSON.parse(localStorage.getItem('relayWorkspace')||'null');
      state={...empty(),...(data||{})};state.history=Array.isArray(state.history)?state.history.slice(-100):[];state.queue=Array.isArray(state.queue)?state.queue.slice(0,50):[];state.apiProfiles=Array.isArray(state.apiProfiles)?state.apiProfiles:[];state.apiThreads=state.apiThreads&&typeof state.apiThreads==='object'?state.apiThreads:{};
      state.apiProfiles=state.apiProfiles.map(p=>{try{return A.profile(p);}catch{return null;}}).filter(Boolean);
      for(const p of state.apiProfiles)C.providers[p.id]=p;transport.threads=state.apiThreads;
      // Keep the transport's backing map stable when ownership moves to this window.
      for(const k of Object.keys(transportBacking))delete transportBacking[k];Object.assign(transportBacking,state.apiThreads);state.apiThreads=transportBacking;
      state.queueEnabled=false;for(const job of state.queue)if(job.status==='running')job.status='paused';lastLists=lastRoles=lastRun=lastHistory=lastData='';renderProviders();
    }
    const transportBacking=transport.threads;
    function renderProviders(){
      const cfg=ctx.config();for(const role of ['primary','reviewer','third']){const select=$(role);select.querySelectorAll('option[data-api]').forEach(e=>e.remove());for(const p of state.apiProfiles){const option=node('option',p.name);option.value=p.id;option.dataset.api='true';select.append(option);}select.value=cfg[role];}
    }
    function io(base){const wrapped={};for(const k of Object.keys(base))wrapped[k]=(...args)=>{
      if(k==='create'&&C.providers[args[0]]?.kind==='api')return transport.create(...args);
      if(transport.is(args[0])){if(k==='upload')throw new Error('API 文字接口暂不支持附件。');if(k==='activate'){ctx.message('这是 API 会话，回答会直接收取到工作台。');return Promise.resolve();}return transport[k]?.(...args);}
      return base[k](...args);
    };return wrapped;}
    function validate(cfg){C.validate(cfg);if(C.routeFor(cfg).some(r=>C.providers[cfg[r]]?.kind==='api')&&cfg.attachments?.length)throw new Error('带附件的任务请选择网页模型。API 首版支持文字互审。');}
    async function preflight(cfg){validate(cfg);for(const role of [...new Set(C.routeFor(cfg))]){const p=C.providers[cfg[role]];if(p.kind==='api'){if(!await getKey(p.id))throw new Error(p.name+' 尚未配置 Key，请先到 API 设置填写。');if(!await chrome.permissions.contains({origins:[new URL(p.url).origin+'/*']}))throw new Error(p.name+' 的接口访问权限尚未开启，请在 API 设置重新保存连接。');}}}
    function record(){const r=ctx.run();return r?state.history.find(x=>x.id===r.id)||{...D.snapshot(r,C.providers),tags:[],resolved:[],verified:[]}:null;}
    async function ensureRecord(){const r=ctx.run();if(!r)return null;let rec=state.history.find(x=>x.id===r.id);if(!rec){rec={...D.snapshot(r,C.providers),tags:[],resolved:[],verified:[]};state.history.push(rec);state.deletedIds=(state.deletedIds||[]).filter(id=>id!==r.id);}return rec;}
    function bounded(){while(state.history.length>100||JSON.stringify(state).length>7500000&&state.history.length>1)state.history.shift();}
    async function changed(){
      if(!writable())return;const r=ctx.run();if(!r)return;
      const signature=r.id+'|'+r.status+'|'+r.turns?.length+'|'+r.finalOut?.length;if(signature===lastRun)return;lastRun=signature;
      if((r.turns?.length||r.status==='done')&&!state.deletedIds?.includes(r.id)){const rec=await ensureRecord();Object.assign(rec,D.snapshot(r,C.providers));bounded();}
      const job=state.queue.find(j=>j.id===state.activeJobId);if(job){if(!job.runId)job.runId=r.id;if(job.runId===r.id){job.status=r.status;job.error=r.error||'';if(r.status==='done')state.activeJobId=null;}}
      if(r.status==='done')for(const tab of Object.values(r.tabs||{}))if(transport.is(tab.id))delete state.apiThreads[tab.id];
      await save();render();await notify(r);
    }
    async function notify(r){
      if(!state.notifications||!ctx.extension||!['done','paused'].includes(r.status))return;
      const key=r.id+':'+r.status+':'+(r.issue?.code||r.error||'');if(state.notificationKeys?.includes(key))return;
      if(!await chrome.permissions.contains({permissions:['notifications']}))return;
      if(!chrome.notifications?.create)return;
      state.notificationKeys=[...(state.notificationKeys||[]),key].slice(-200);await save();
      await chrome.notifications.create('relay-'+r.id,{type:'basic',iconUrl:'icon-128.png',title:r.status==='done'?'互审已完成':'互审需要你处理',message:r.status==='done'?'结果已保存在工作台。':(r.issue?.title||'任务已暂停，请回工作台查看。')}).catch(()=>{});
    }
    function renderRoles(){
      const cfg=ctx.config(),disabled=!writable()||ctx.busy(),sig=[cfg.sequence,cfg.primary,cfg.reviewer,cfg.third,JSON.stringify(cfg.reviewRoles||{}),disabled].join('|');if(sig===lastRoles)return;lastRoles=sig;const target=$('reviewRoleFields');target.replaceChildren();
      let route;try{route=C.routeFor(cfg);}catch{target.append(node('p','填写有效的接力顺序后，可以设置每轮审核分工。','tiny'));return;}
      route.slice(1,-1).forEach((role,i)=>{const round=i+2,label=node('label',`第 ${round} 轮 · ${C.providers[cfg[role]].name}`),select=node('select');select.setAttribute('aria-label',`第 ${round} 轮审核分工`);for(const [key,text] of Object.entries(D.specialties)){const o=node('option',text);o.value=key;select.append(o);}select.value=cfg.reviewRoles?.[round]||'general';select.disabled=disabled;select.onchange=async()=>{cfg.reviewRoles={...(cfg.reviewRoles||{}),[round]:select.value};await ctx.store();};label.append(select);target.append(label);});
    }
    function renderInspector(){
      const rec=record(),sig=JSON.stringify([rec?.id,rec?.outputs?.first,rec?.finalOut,rec?.turns,rec?.resolved,rec?.verified,writable()]);if(sig===lastData)return;lastData=sig;
      const diff=$('diffContent');diff.replaceChildren();
      if(!rec?.outputs?.first||!rec?.finalOut)diff.append(node('p','完成互审后，这里会显示初稿与定稿的差异。','empty-state'));
      else{const result=D.compare(rec.outputs.first,rec.finalOut);if(result.large){const cols=node('div',undefined,'diff-columns');for(const [title,text] of [['初稿',rec.outputs.first],['定稿',rec.finalOut]]){const col=node('div');col.append(node('strong',title),node('pre',text));cols.append(col);}diff.append(cols);}else for(const row of result.rows){const line=node('div',undefined,'diff-line '+row.kind);line.append(node('span',row.kind==='add'?'+':row.kind==='remove'?'−':' ','diff-marker'),node('span',row.text));diff.append(line);}}
      for(const [id,items,field,renderText] of [
        ['reviewIssues',D.issues(rec?.turns),'resolved',(li,item)=>{const label=node('label',item.text),small=node('span',`第 ${item.round} 轮 · 候选审核事项`,'tiny');label.append(small);li.append(label);return item.id;}],
        ['reviewSources',D.sources(rec?.turns,rec?.names),'verified',(li,item)=>{const label=node('label'),a=node('a',item.url);a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';label.append(a,node('span',`第 ${item.rounds.join('、')} 轮 · ${item.names.join(' / ')} · ${rec?.verified?.includes(item.url)?'已标记核验':'尚未核验'}`,'tiny'));li.append(label);return item.url;}]
      ]){const list=$(id);list.replaceChildren();if(!items.length)list.append(node('li',id==='reviewSources'?'暂无引用链接。':'暂无提取到的候选事项，请结合审核全文判断。','empty-state'));for(const item of items){const li=node('li'),check=node('input');check.type='checkbox';const key=renderText(li,item);check.checked=rec?.[field]?.includes(key)||false;check.disabled=!writable();check.setAttribute('aria-label',(field==='resolved'?'标记已处理：':'标记已核验：')+(item.text||item.url));check.onchange=async()=>{const r=await ensureRecord();if(!r)return;r[field]=check.checked?[...new Set([...(r[field]||[]),key])]:(r[field]||[]).filter(x=>x!==key);await save();renderInspector();};li.prepend(check);list.append(li);}}
      for(const id of ['exportMarkdown','exportWord','exportPDF','exportReview'])$(id).disabled=id==='exportReview'?!rec?.turns?.length:!rec?.finalOut;
    }
    function resultDocument(rec,full=false){
      if(!full)return rec.finalOut||'';
      const issues=D.issues(rec.turns).map(x=>`- [${rec.resolved?.includes(x.id)?'x':' '}] 第 ${x.round} 轮：${x.text}`).join('\n');
      const refs=D.sources(rec.turns,rec.names).map(x=>`- [${rec.verified?.includes(x.url)?'x':' '}] ${x.url}（第 ${x.rounds.join('、')} 轮；${rec.verified?.includes(x.url)?'已标记核验':'尚未核验'}）`).join('\n');
      return `# 互审记录\n\n## 问题\n\n${rec.q}\n\n`+(rec.turns||[]).map((t,i)=>`## 第 ${i+1} 轮 · ${rec.names?.[i]||'模型'}\n\n${t}`).join('\n\n')+`\n\n## 待确认事项\n\n${issues||'暂无提取到的候选事项。'}\n\n## 模型引用来源\n\n${refs||'暂无引用链接。'}`;
    }
    async function exportResult(rec,type,full=false){if(!rec||(full?!rec.turns?.length:!rec.finalOut))throw new Error('当前没有可导出的结果。');const text=resultDocument(rec,full),title=full?'完整互审':'互审结果',name='AI-Relay-'+new Date(rec.created||Date.now()).toISOString().slice(0,10);if(type==='md')RelayExports.download(text,name+(full?'-完整互审':'')+'.md','text/markdown;charset=utf-8');else if(type==='word')RelayExports.download(RelayExports.docx(text,title),name+'.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document');else await RelayExports.pdf(text,title);}
    function renderHistory(force=false){
      if(!$('historyDialog').open&&!force)return;const search=$('historySearch').value.trim().toLowerCase(),tag=$('historyTagFilter').value.trim().toLowerCase(),sig=JSON.stringify([search,tag,state.history,selected,writable()]);if(sig===lastHistory)return;lastHistory=sig;
      const list=$('historyList');list.replaceChildren();const records=[...state.history].reverse().filter(r=>(!search||[r.q,r.finalOut,...(r.tags||[])].join('\n').toLowerCase().includes(search))&&(!tag||(r.tags||[]).some(t=>t.toLowerCase().includes(tag))));
      if(!records.length)list.append(node('li','没有匹配的任务。','empty-state'));
      for(const r of records){const li=node('li'),button=node('button',r.q.slice(0,70)+(r.q.length>70?'…':''),'task-title'+(r.id===selected?' active':''));button.onclick=()=>{selected=r.id;lastHistory='';renderHistory(true);};li.append(button,node('span',new Date(r.created).toLocaleString()+' · '+(labels[r.status]||r.status),'task-meta'));if(r.tags?.length)li.append(node('span',r.tags.join(' · '),'task-meta'));list.append(li);}
      const detail=$('historyDetail');detail.replaceChildren();const rec=state.history.find(x=>x.id===selected);if(!rec){detail.append(node('p','选择一个任务查看。','empty-state'));return;}
      detail.append(node('h3',rec.q.slice(0,200)),node('p',(rec.names||[]).join(' → '),'tiny'));
      const input=node('input');input.placeholder='标签，用逗号分隔';input.value=(rec.tags||[]).join('，');input.disabled=!writable();input.setAttribute('aria-label','任务标签');input.onchange=async()=>{rec.tags=D.tags(input.value);await save();lastHistory='';renderHistory(true);};detail.append(input);
      const actions=node('div',undefined,'task-actions');for(const [text,fn,disabled] of [
        ['载入问题',()=>loadQuestion(rec),!writable()||ctx.busy()],['Markdown',()=>exportResult(rec,'md'),!rec.finalOut],['Word',()=>exportResult(rec,'word'),!rec.finalOut],['PDF…',()=>exportResult(rec,'pdf'),!rec.finalOut],['完整互审',()=>exportResult(rec,'md',true),!rec.turns?.length],['删除',async()=>{if(!confirm('删除此任务库记录？当前工作台和模型网站的聊天不会被删除。'))return;state.history=state.history.filter(r=>r.id!==rec.id);state.deletedIds=[...(state.deletedIds||[]),rec.id].slice(-100);selected=null;await save();render();renderHistory(true);},!writable()]
      ]){const b=node('button',text,'secondary');b.disabled=disabled;b.onclick=()=>Promise.resolve(fn()).catch(e=>ctx.message(e.message,true));actions.append(b);}detail.append(actions);
      const result=node('div',undefined,'markdown-body');RelayMarkdown.render(result,rec.finalOut||rec.outputs?.first||'尚无回答。');detail.append(result);
    }
    async function loadQuestion(rec){if(ctx.busy())throw new Error('请先暂停当前任务。');if(ctx.run()?.status==='paused'&&!confirm('载入此问题会替换当前暂停任务，是否继续？'))return;await cancelActive();const cfg={...C.importData({config:rec}).config,attachments:[]};ctx.setConfig(cfg);await ctx.store();$('historyDialog').close();$('queueDialog').close();ctx.message('问题已载入，请确认模型和附件后再开始。历史结果保留在任务库。');}
    async function addJobs(questions){ctx.readForm();const cfg=clone(ctx.config());validate(cfg);if(state.queue.filter(j=>j.status!=='done'&&j.status!=='cancelled').length+questions.length>50)throw new Error('队列最多保留 50 个待处理任务。');for(const q of questions){const copy={...clone(cfg),q};validate(copy);state.queue.push({id:crypto.randomUUID(),config:copy,status:'waiting',created:Date.now()});}await save();render();ctx.message(`已加入 ${questions.length} 个问题。点击“运行队列”后按顺序处理。`);}
    function cancelActive(){state.queueEnabled=false;const job=state.queue.find(j=>j.id===state.activeJobId);if(job&&job.status!=='done')job.status='cancelled';state.activeJobId=null;lastLists='';return save();}
    async function pump(){
      if(pumping||!writable()||!state.queueEnabled||ctx.busy()||ctx.run()?.status==='paused')return;
      if(state.activeJobId)return;const job=state.queue.find(j=>j.status==='waiting');if(!job){state.queueEnabled=false;await save();render();return;}
      pumping=true;try{await preflight(job.config);await ctx.checkFiles(job.config.attachments||[]);job.status='running';state.activeJobId=job.id;await save();ctx.setConfig(clone(job.config));await ctx.start(job.config);render();}
      catch(e){job.status='paused';job.error=e.message;state.queueEnabled=false;if(!job.runId)state.activeJobId=null;await save();render();ctx.message('队列已停下：'+e.message,true);}finally{pumping=false;}
    }
    function renderQueue(){
      const sig=JSON.stringify([state.queue,state.queueEnabled,state.activeJobId,writable(),ctx.busy(),state.apiProfiles]);if(sig===lastLists)return;lastLists=sig;
      const list=$('queueList');list.replaceChildren();if(!state.queue.length)list.append(node('li','队列还没有问题。','empty-state'));
      state.queue.forEach((job,index)=>{const li=node('li'),title=node('strong',job.config.q.slice(0,120));li.append(title,node('span',`${index+1} · ${labels[job.status]||job.status} · ${job.config.sequence} · ${(job.config.attachments||[]).length} 个附件`,'task-meta'));if(job.error)li.append(node('p',job.error,'tiny'));const actions=node('div',undefined,'task-actions');
        for(const [text,fn,disabled] of [
          ['载入问题',()=>loadQuestion({...job.config,id:job.id}),ctx.busy()],['上移',async()=>{[state.queue[index-1],state.queue[index]]=[state.queue[index],state.queue[index-1]];await save();render();},index===0||job.status==='running'||state.queue[index-1]?.status==='running'],
          ['重试排队',async()=>{if(job.runId&&ctx.run()?.id===job.runId&&ctx.run()?.status!=='done')throw new Error('此任务已有互审记录，请在工作台继续当前步骤。');job.status='waiting';job.error='';delete job.runId;await save();render();},!['paused','cancelled'].includes(job.status)||job.id===state.activeJobId],
          ['移除',async()=>{if(job.id===state.activeJobId){await cancelActive();}state.queue=state.queue.filter(j=>j.id!==job.id);await save();await ctx.prune();render();},job.status==='running'||job.id===state.activeJobId]
        ]){const b=node('button',text,'secondary');b.disabled=disabled||!writable();b.onclick=()=>Promise.resolve(fn()).catch(e=>ctx.message(e.message,true));actions.append(b);}li.append(actions);list.append(li);});
      $('queueStatus').textContent=state.queueEnabled?'队列已开启':state.activeJobId?'当前项暂停，后续等待':'队列未运行';$('queueRun').disabled=!writable()||!ctx.extension||ctx.busy()||!state.queue.some(j=>['waiting','paused'].includes(j.status));$('queueStop').disabled=!writable()||!state.queueEnabled;
    }
    function renderAPI(){const list=$('apiProfiles');list.replaceChildren();for(const p of state.apiProfiles){const li=node('li');li.append(node('strong',p.name),node('span',p.model+' · '+p.url,'task-meta'));const actions=node('div',undefined,'task-actions');
      const edit=node('button','修改连接 / Key','secondary');edit.disabled=!writable()||ctx.busy();edit.onclick=async()=>{editing=p.id;$('apiService').value=p.service;$('apiName').value=p.name;$('apiEndpoint').value=p.url;$('apiModel').value=p.model;$('apiKey').value='';$('apiKey').placeholder='留空保留已保存的 Key';$('apiRemember').checked=!!(await chrome.storage.local.get('relayApiSecrets')).relayApiSecrets?.[p.id];$('apiSave').textContent='保存修改';$('apiCancelEdit').hidden=false;$('apiEndpoint').focus();};
      const remove=node('button','删除','text-btn danger');remove.disabled=!writable()||ctx.busy();remove.onclick=async()=>{try{if(['primary','reviewer','third'].some(r=>ctx.run()?.[r]===p.id)||state.queue.some(j=>['waiting','paused','running'].includes(j.status)&&['primary','reviewer','third'].some(r=>j.config[r]===p.id)))throw new Error('当前任务或队列正在使用此连接。请先换一个新问题并移除相关排队项。');if(!confirm('删除这个 API 连接和保存的 Key？'))return;state.apiProfiles=state.apiProfiles.filter(x=>x.id!==p.id);delete C.providers[p.id];for(const area of [chrome.storage.local,chrome.storage.session]){const keys=(await area.get('relayApiSecrets')).relayApiSecrets||{};delete keys[p.id];await area.set({relayApiSecrets:keys});}const cfg=ctx.config();for(const [r,fallback] of [['primary','deepseek'],['reviewer','chatgpt'],['third','kimi']])if(cfg[r]===p.id)cfg[r]=fallback;await save();renderProviders();ctx.populate();await ctx.store();renderAPI();ctx.render();}catch(e){ctx.message(e.message,true);}};actions.append(edit,remove);li.append(actions);list.append(li);}}
    function resetEdit(){editing=null;$('apiKey').value='';$('apiKey').placeholder='填写 Key';$('apiSave').textContent='添加连接';$('apiCancelEdit').hidden=true;}
    function render(){if(!$('historyOpen'))return;$('historyCount').textContent=state.history.length;$('queueCount').textContent=state.queue.filter(j=>!['done','cancelled'].includes(j.status)).length;$('notifyEnabled').checked=state.notifications;
      for(const id of ['queueAdd','batchAdd','batchQuestions','apiService','apiName','apiEndpoint','apiModel','apiKey','apiRemember','apiSave','apiCancelEdit','historyRestore','historyBackup','notifyEnabled'])$(id).disabled=!writable()||(ctx.busy()&&!['queueAdd','batchAdd','batchQuestions','notifyEnabled','historyBackup'].includes(id));
      $('queueAdd').disabled=!writable()||!ctx.config().q.trim();renderRoles();renderInspector();renderQueue();renderHistory();
    }
    on('historyOpen','click',()=>{renderHistory(true);$('historyDialog').showModal();});on('historyClose','click',()=>$('historyDialog').close());on('queueOpen','click',()=>{$('queueDialog').showModal();renderQueue();});on('queueClose','click',()=>$('queueDialog').close());
    for(const id of ['historySearch','historyTagFilter'])on(id,'input',()=>renderHistory(true));
    for(const [id,panel] of [['inspectDiff','diffPanel'],['inspectIssues','issuesPanel'],['inspectSources','sourcesPanel']])on(id,'click',()=>{for(const [b,p] of [['inspectDiff','diffPanel'],['inspectIssues','issuesPanel'],['inspectSources','sourcesPanel']]){$(b).setAttribute('aria-pressed',String(b===id));$(p).hidden=p!==panel;}});
    for(const [id,type,full] of [['exportMarkdown','md',false],['exportWord','word',false],['exportPDF','pdf',false],['exportReview','md',true]])on(id,'click',()=>exportResult(record(),type,full));
    on('queueAdd','click',async()=>{await addJobs([ctx.config().q]);});on('batchAdd','click',async()=>{const questions=$('batchQuestions').value.split(/\r?\n\s*\r?\n/).map(s=>s.trim()).filter(Boolean);if(!questions.length)throw new Error('请填写要排队的问题。');await addJobs(questions);$('batchQuestions').value='';});
    on('queueRun','click',async()=>{if(ctx.run()?.status==='paused'){if(!state.activeJobId||state.queue.find(j=>j.id===state.activeJobId)?.runId!==ctx.run().id)throw new Error('工作台有其他暂停任务，请先继续或载入新问题。');state.queueEnabled=true;await save();await ctx.resume();}else{state.queueEnabled=true;await save();await pump();}render();});
    on('queueStop','click',async()=>{state.queueEnabled=false;await save();render();});
    on('notifyEnabled','change',async()=>{state.notifications=$('notifyEnabled').checked;if(state.notifications&&ctx.extension){const granted=await chrome.permissions.request({permissions:['notifications']});if(!granted){state.notifications=false;ctx.message('未开启桌面通知。任务仍会保存在工作台。');}}await save();render();});
    on('apiService','change',()=>{const deep=$('apiService').value==='deepseek';$('apiName').value=deep?'DeepSeek API':'自定义 API';$('apiEndpoint').value=deep?'https://api.deepseek.com':'';$('apiModel').value=deep?'deepseek-flash':'';});on('apiCancelEdit','click',resetEdit);
    on('apiSave','click',async()=>{if(!ctx.extension)throw new Error('API 连接请在已安装的扩展中配置。');const p=A.profile({id:editing||'api:'+crypto.randomUUID(),service:$('apiService').value,name:$('apiName').value,url:$('apiEndpoint').value,model:$('apiModel').value});
      if(state.apiProfiles.some(x=>x.id!==p.id&&x.url===p.url&&x.model===p.model))throw new Error('同一个接口和模型已经添加，请修改现有连接。');
      if(state.queue.some(j=>['waiting','running','paused'].includes(j.status)&&['primary','reviewer','third'].some(r=>j.config[r]===p.id))||['primary','reviewer','third'].some(r=>ctx.run()?.[r]===p.id))throw new Error('当前任务或队列正在使用此连接，请先换一个新问题再修改。');
      const granted=await chrome.permissions.request({origins:[new URL(p.url).origin+'/*']});if(!granted)throw new Error('未开启接口访问权限，连接没有保存。');
      const key=$('apiKey').value.trim()||await getKey(p.id);if(!key)throw new Error('请填写 API Key。');const remember=$('apiRemember').checked;
      for(const [area,keep] of [[chrome.storage.session,!remember],[chrome.storage.local,remember]]){const keys=(await area.get('relayApiSecrets')).relayApiSecrets||{};if(keep)keys[p.id]=key;else delete keys[p.id];await area.set({relayApiSecrets:keys});}
      state.apiProfiles=state.apiProfiles.filter(x=>x.id!==p.id);state.apiProfiles.push(p);C.providers[p.id]=p;await save();renderProviders();ctx.populate();resetEdit();renderAPI();ctx.render();ctx.message('API 连接已保存，可在模型下拉框中选择。');});
    on('historyBackup','click',()=>{const backup={schema:'ai-relay-workspace',version:1,exported:new Date().toISOString(),history:state.history,queue:state.queue.map(({id,config,status,created})=>({id,config,status,created})),apiProfiles:state.apiProfiles};RelayExports.download(JSON.stringify(backup,null,2),'AI-Relay-任务库.json','application/json');});
    on('historyRestore','change',async ev=>{try{const file=ev.target.files[0];if(!file)return;if(file.size>8*1024*1024)throw new Error('备份超过 8 MB。');const raw=JSON.parse(await file.text());if(raw.schema!=='ai-relay-workspace'||raw.version!==1||!Array.isArray(raw.history)||!Array.isArray(raw.queue))throw new Error('这不是支持的任务库备份。');if(ctx.run()?.status==='running'||state.activeJobId)throw new Error('请先完成或取消当前队列任务。');if(!confirm('合并此备份的任务记录？队列将以等待状态恢复，不会自动发送；附件需要重新选择。'))return;
        if(raw.apiProfiles&&!Array.isArray(raw.apiProfiles))throw new Error('备份中的 API 连接无效。');
        const profiles=(raw.apiProfiles||[]).slice(0,30).map(A.profile),providers={...C.providers};for(const p of profiles)if(!providers[p.id])providers[p.id]=p;
        const sanitize=value=>{const cfg=C.importData({config:value}).config;for(const role of ['primary','reviewer','third'])if(providers[value?.[role]])cfg[role]=value[role];return cfg;};
        // Validate the whole backup before changing either records or model connections.
        const records=raw.history.slice(0,100).map(rec=>{if(typeof rec.id!=='string'||typeof rec.q!=='string'||!Array.isArray(rec.turns)||rec.turns.some(x=>typeof x!=='string'))throw new Error('备份中的任务内容无效。');const cfg=sanitize(rec),route=Array.isArray(rec.route)&&rec.route.every(r=>['primary','reviewer','third'].includes(r))?rec.route:['primary','reviewer','primary'];const clean=D.snapshot({...cfg,id:rec.id,status:rec.status==='done'?'done':'paused',created:Number(rec.created)||Date.now(),turns:rec.turns,outputs:C.importData({run:rec}).outputs,finalOut:typeof rec.finalOut==='string'?rec.finalOut:'',route},providers);clean.tags=D.tags((Array.isArray(rec.tags)?rec.tags:[]).join(','));clean.resolved=Array.isArray(rec.resolved)?rec.resolved.filter(x=>typeof x==='string'):[];clean.verified=Array.isArray(rec.verified)?rec.verified.filter(x=>typeof x==='string'&&/^https?:\/\//.test(x)):[];return clean;});
        const jobs=raw.queue.slice(0,50).map(job=>{const cfg=sanitize(job.config);if(!cfg.q.trim()||cfg.q.length>120000)throw new Error('备份中的队列问题无效。');return {id:typeof job.id==='string'?job.id:crypto.randomUUID(),config:{...cfg,attachments:[]},status:['done','cancelled'].includes(job.status)?job.status:job.config?.attachments?.length?'blocked':'waiting',created:Date.now()};});
        for(const p of profiles)if(!state.apiProfiles.some(x=>x.id===p.id)){state.apiProfiles.push(p);C.providers[p.id]=p;}
        for(const rec of records)if(!state.history.some(x=>x.id===rec.id))state.history.push(rec);
        for(const job of jobs)if(!state.queue.some(x=>x.id===job.id))state.queue.push(job);
        state.queue=state.queue.slice(0,50);state.queueEnabled=false;bounded();await save();renderProviders();ctx.populate();renderAPI();render();ctx.message('任务库已恢复。API Key 与附件请在本机重新配置；队列尚未启动。');
      }finally{ev.target.value='';}});
    return {load,io,render,renderAPI,changed,pump,preflight,validate,cancelActive,async clear(){state.history=[];state.queue=[];state.activeJobId=null;state.queueEnabled=false;state.apiThreads={};for(const k of Object.keys(transportBacking))delete transportBacking[k];state.apiThreads=transportBacking;await save();lastRun=lastData=lastHistory=lastLists='';render();},attachmentIds:()=>state.queue.filter(j=>!['done','cancelled'].includes(j.status)).flatMap(j=>(j.config.attachments||[]).map(f=>f.id)),state:()=>clone(state)};
  }
  root.RelayWorkspace={init};
})(globalThis);
