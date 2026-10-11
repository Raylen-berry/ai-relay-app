(function(root) {
  'use strict';
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const bounded = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Math.floor(Number(value)))) : fallback;
  function settings(raw = {}) {
    if (!raw || typeof raw !== 'object') raw = {};
    return {
      purpose: clean(raw.purpose).slice(0, 500),
      format: clean(raw.format).slice(0, 200),
      requirements: [...new Set((Array.isArray(raw.requirements) ? raw.requirements : []).filter(v => typeof v === 'string').map(v => v.trim().slice(0, 500)).filter(Boolean))].slice(0, 12),
      reviewMode: raw.reviewMode === 'independent' ? 'independent' : 'draft',
      maxMinutes: bounded(raw.maxMinutes, 60, 5, 480),
      maxApiCalls: bounded(raw.maxApiCalls, 6, 1, 50),
      maxOutputTokens: bounded(raw.maxOutputTokens, 4096, 256, 32768),
      checks: (Array.isArray(raw.checks) ? raw.checks : []).slice(0, 80).filter(c => c && typeof c.text === 'string' && ['supported', 'contradicted', 'uncertain'].includes(c.status)).map(c => ({text:c.text.slice(0, 3000), evidence:clean(c.evidence).slice(0, 30000), status:c.status, note:clean(c.note).slice(0, 500)})),
      accepted: (Array.isArray(raw.accepted) ? raw.accepted : []).filter(v => typeof v === 'string').slice(0, 12)
    };
  }
  function brief(raw) {
    const d = settings(raw);
    return '\n\n【本次交付要求】\n' + (d.purpose ? '用途：' + d.purpose + '\n' : '') + (d.format ? '交付形式：' + d.format + '\n' : '') + (d.requirements.length ? '验收条件：\n' + d.requirements.map(v => '- ' + v).join('\n') + '\n' : '') + '逐项说明已完成与无法确认的内容。未计算的数字、未找到的依据和未执行的检查不得写成已验证。只修正有具体依据的问题，保留尚未解决的分歧。';
  }
  // Approval belongs to an exact statement and its exact evidence, never just an ID.
  function claims(text, workflow) {
    const refs = new Map((workflow?.sourceRefs || []).map(r => [r.id, r]));
    const prose = String(text || '').replace(/```[^]*?```/g, '');
    const out = [];
    for (const sentence of prose.split(/\n+/)) {
      const statement = sentence.trim();
      const ids = [...new Set([...statement.matchAll(/\[(S\d+:P\d+)\]/g)].map(m => m[1]))];
      if (!ids.length) continue;
      const evidence = JSON.stringify(ids.map(id => [id, refs.get(id)?.text || null, refs.get(id)?.url || '']));
      if (!out.some(c => c.text === statement && c.evidence === evidence)) out.push({text:statement, ids, evidence, refs:ids.map(id => refs.get(id)), known:ids.every(id => refs.has(id)), checkable:statement.length <= 3000 && evidence.length <= 30000});
    }
    return out;
  }
  function assessment(run) {
    const d = settings(run?.delivery), text = run?.finalOut || '';
    const items = claims(text, run?.workflow).map(c => ({...c, review:d.checks.find(v => v.text === c.text && v.evidence === c.evidence), status:c.known && c.checkable ? d.checks.find(v => v.text === c.text && v.evidence === c.evidence)?.status || 'pending' : 'contradicted'}));
    const unknown = items.filter(c => !c.known).length;
    const math = mathChecks(text,run?.workflow);
    const contradicted = items.filter(c => c.status === 'contradicted').length + math.items.filter(c=>!c.ok).length;
    const pendingClaims = items.filter(c => !['supported', 'contradicted'].includes(c.status)).length;
    const pendingRequirements = d.requirements.filter(v => !d.accepted.includes(v));
    const needsCitations = ['research', 'knowledge'].includes(run?.workflow?.kind);
    const missingCitations = !!text && needsCitations && !items.length;
    // A matched citation, computed input statistics or a model's own verdict cannot approve a result.
    const pending = pendingClaims + pendingRequirements.length + Number(missingCitations) + Number(!d.requirements.length) + Number(math.required&&!math.present);
    const label = !text ? '等待成果' : contradicted ? '发现证据问题' : pending ? run?.workflow?.restored||run?.deliveryOrigin?.imported ? '导入副本 · 待核对' : run?.deliveryOrigin ? '成果已接收 · 待核对' : '成果已生成 · 待核对' : '已完成所列人工核对';
    return {label, items, math, pending, pendingRequirements, unknown, contradicted, missingCitations, noCriteria:!d.requirements.length};
  }
  function mathChecks(text,workflow) {
    const required=workflow?.kind==='analysis' && !!workflow.numericLedger?.length;
    if(workflow?.restored)return {required,present:false,items:[],restored:true};
    const match=String(text||'').match(/【数字核对】\s*```json\s*([\s\S]*?)```/);
    if(!required||!match)return {required,present:false,items:[]};
    let rows;try{rows=JSON.parse(match[1]);}catch{return {required,present:true,items:[{label:'数字核对块格式无效',ok:false}]};}
    if(!Array.isArray(rows)||!rows.length||rows.length>100)return {required,present:true,items:[{label:'数字核对块应为 1–100 项数组',ok:false}]};
    const ledger=new Map(workflow.numericLedger.map(v=>[v.id,v]));
    return {required,present:true,items:rows.map(row=>{const expected=ledger.get(row?.id),value=row?.value;return {label:expected?.label||String(row?.id||'未知指标'),value,expected:expected?.value,ok:!!expected&&typeof value==='number'&&Number.isFinite(value)&&Math.abs(value-expected.value)<=Math.max(1,Math.abs(expected.value))*16*Number.EPSILON};})};
  }
  function scopeText(workflow) {
    if(!workflow)return '通用任务尚未检查资料完整性和外部事实。';
    if(workflow.restored)return '材料快照来自工作包，本机尚未重新检查其来源或重新计算数据。'+(workflow.scope?.partial?'原任务仅提供部分正文。':'');
    const s = workflow?.scope;
    if (!s) return '旧任务没有保存检索范围，请结合原始材料核对。';
    if (workflow.kind === 'analysis') return `统计基于当前工作表全部 ${s.rows} 行、${s.columns} 个字段；模型仅收到统计摘要及最多 15 行样例。结论中的数字仍需对照统计核查。`;
    return `范围：${s.documents} 份资料，共 ${s.totalChunks} 个段落；本次提供 ${s.selectedChunks} 个段落、${s.suppliedChars} 字符。方式：${s.method}。${s.partial ? '仅覆盖部分正文；未找到证据不能解释为证据不存在。' : '提供了所选资料的正文；资料库之外的内容未被检索。'}`;
  }
  function appendix(run) {
    if (!run?.delivery) return '';
    const d = settings(run.delivery), a = assessment(run);
    const quote = value => String(value).split('\n').map(line => '> ' + line.replace(/[<>]/g, '')).join('\n');
    return '\n\n## 交付与核对记录\n\n' + a.label + '。这些状态记录已列出的检查，不保证所有结论正确。\n\n' + (d.purpose ? '用途：' + d.purpose + '\n\n' : '') + (d.format ? '交付形式：' + d.format + '\n\n' : '') +
      (d.requirements.length ? '### 验收条件\n\n' + d.requirements.map(v => '- [' + (d.accepted.includes(v) ? 'x' : ' ') + '] ' + v).join('\n') : '尚未设置验收条件。') + '\n\n### 材料与检查范围\n\n' + scopeText(run.workflow) +
      (run.workflow?.analysisReport ? '\n\n### 本机计算摘要\n\n' + run.workflow.analysisReport : '') +
      (a.math.required ? '\n\n### 结构化数字核对\n\n'+(a.math.present?a.math.items.map(v=>'- '+v.label+'：'+(v.ok?'与本机统计一致':'不一致或指标无效')+'；回答 '+String(v.value??'无')+'；本机 '+String(v.expected??'无')).join('\n'):'回答未提供可核对的数字块。')+'\n\n只检查核对块中列出的数值，不验证全文数字、计算口径合理性或因果解释。' : '') +
      '\n\n### 引用表述核对\n\n' + (a.items.length ? a.items.map(c => quote(c.text) + '\n\n状态：' + ({supported:'用户标记有依据', contradicted:'证据不符或编号无效', uncertain:'无法确认', pending:'待核对'}[c.status]) + (c.review?.note ? '；说明：' + c.review.note : '')).join('\n\n') : '没有可识别的段落引用，引用支持程度未核对。') +
      (run.deliveryOrigin ? '\n\n### 成果来源\n\n'+(run.deliveryOrigin.label||'用户提供的正文')+(run.deliveryOrigin.kind==='relay'?'；互审任务编号 '+run.deliveryOrigin.taskId+'；顺序 '+run.deliveryOrigin.sequence:'；未在此功能中发送给模型')+(run.deliveryOrigin.imported?'。从备份导入，原有核对状态未沿用':'')+'。核对记录属于这份独立成果。\n' : '\n\n### 运行范围\n\n' + `模式：${run.sequence === '1' ? '单次完成' : d.reviewMode === 'independent' ? '独立核查' : '查看初稿后互审'}；API 发送尝试 ${run.apiAttempts || 0} 次；自动处理上限 ${d.maxMinutes} 分钟；单次 API 输出上限 ${d.maxOutputTokens} token。费用取决于服务商，这些限制不等于金额保证。\n`);
  }
  function safeTask(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.q !== 'string') throw Error('工作包中有无效任务。');
    const out = {};
    for (const key of ['id','q','primary','reviewer','third','sequence','timeout','templates','reviewRoles','outputs','turns','finalOut','partialAnswer','created','timing','route','names','tags','resolved','verified','apiAttempts']) if (raw[key] !== undefined) out[key] = structuredClone(raw[key]);
    out.id = typeof raw.id === 'string' ? raw.id.slice(0,100) : '';
    out.outputs = Object.fromEntries(['first','review','final'].filter(k=>typeof raw.outputs?.[k]==='string').map(k=>[k,raw.outputs[k].slice(0,300000)]));
    out.turns = (Array.isArray(raw.turns)?raw.turns:[]).filter(v=>typeof v==='string').slice(0,9).map(v=>v.slice(0,300000));
    out.templates = Object.fromEntries(['first','review','final'].filter(k=>typeof raw.templates?.[k]==='string').map(k=>[k,raw.templates[k].slice(0,120000)]));
    out.finalOut = typeof raw.finalOut === 'string' ? raw.finalOut.slice(0,300000) : '';
    out.route = (Array.isArray(raw.route)?raw.route:[]).filter(v=>['primary','reviewer','third'].includes(v)).slice(0,9);
    out.names = (Array.isArray(raw.names)?raw.names:[]).filter(v=>typeof v==='string').slice(0,9);
    out.tags = (Array.isArray(raw.tags)?raw.tags:[]).filter(v=>typeof v==='string').slice(0,8).map(v=>v.slice(0,24));
    out.status = raw.status === 'done' ? 'done' : 'paused';
    out.delivery = settings(raw.delivery);
    out.workflow = root.RelayWorkflowData?.meta(raw.workflow);
    out.attachments = (Array.isArray(raw.attachments) ? raw.attachments : []).map(({name,size,type}) => ({name,size,type}));
    return out;
  }
  function safeJob(job) {
    if(!job||typeof job.id!=='string'||!job.config||typeof job.config.q!=='string'||job.config.q.length>120000)throw Error('工作包中有无效队列项目。');
    const config=safeTask({...job.config,id:job.id});
    config.delivery=settings({...config.delivery,checks:[],accepted:[]});
    return {id:job.id,created:Number(job.created)||Date.now(),config,status:['done','cancelled'].includes(job.status)?job.status:config.attachments.length?'blocked':'waiting'};
  }
  function packageData({current, history = [], queue = [], materials,deliverables}) {
    const tasks = history.map(safeTask);
    if (current?.q && !tasks.some(t => t.id === current.id)) tasks.push(safeTask(current));
    return {schema:'ai-relay-delivery', version:1, exported:new Date().toISOString(), materials:structuredClone(materials), tasks:tasks.slice(-100), queue:queue.slice(0,50).map(safeJob),...(deliverables?{deliverables:root.RelayDeliverablesData.state(deliverables)}:{}),notice:'包含任务文字、队列、资料正文、表格与独立成果库；不含 API 配置密钥、活动会话和附件原文件。导入不会发送任务。'};
  }
  const api = {settings, brief, claims, mathChecks, assessment, scopeText, appendix, safeTask, safeJob, packageData};
  root.RelayDeliveryData = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
