'use strict';
const C = RelayCore;
const $ = id => document.getElementById(id);
const isExtension = !!globalThis.chrome?.runtime?.id && !!chrome.storage;
const defaultConfig = () => ({q: '', primary: 'deepseek', reviewer: 'chatgpt', third:'kimi', sequence:'1-2-1', timeout: 15, templates: {...C.templates}});
let config = defaultConfig();
let imported = null;
// Disable writes until this window owns the runner, including during startup.
let lockedElsewhere = isExtension;
let engine;
let taskWindow;
let saveChain = Promise.resolve();
let saveTimer;
let transient = null;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function readForm() {
  config = {q: $('question').value, primary: $('primary').value, reviewer: $('reviewer').value,
    third:$('third').value, sequence:$('sequence').value,
    timeout: Number($('timeout').value), templates: {first: $('templateFirst').value, review: $('templateReview').value, final: $('templateFinal').value}};
}
function populateForm() {
  $('question').value = config.q; $('primary').value = config.primary; $('reviewer').value = config.reviewer;
  $('third').value = config.third || 'kimi'; $('sequence').value = config.sequence || '1-2-1';
  if (![...$('timeout').options].some(o => o.value === String(config.timeout))) config.timeout = 15;
  $('timeout').value = config.timeout;
  $('templateFirst').value = config.templates.first; $('templateReview').value = config.templates.review; $('templateFinal').value = config.templates.final;
}
function store() {
  if (isExtension && lockedElsewhere) return Promise.resolve();
  const payload = structuredClone({config, run: engine?.run, imported});
  saveChain = saveChain.catch(() => {}).then(async () => {
    if (isExtension) await chrome.storage.local.set({relay: payload});
    else localStorage.setItem('aiRelayPreview', JSON.stringify(payload));
  });
  return saveChain;
}
function message(text, error = false) {
  transient = {text, error, until: Date.now() + (error ? 15000 : 7000)};
  $('status').textContent = text;
  if (error) { $('error').textContent = text; $('error').hidden = false; }
}
function render() {
  const r = engine?.run;
  const running = r?.status === 'running';
  const paused = r?.status === 'paused';
  for (const id of ['question','primary','reviewer','third','sequence','timeout','templateFirst','templateReview','templateFinal','resetTemplates']) $(id).disabled = running || lockedElsewhere || engine?.locked;
  $('import').disabled = running || lockedElsewhere || engine?.locked;
  $('newTask').disabled = running || lockedElsewhere || engine?.locked;
  $('export').disabled = lockedElsewhere;
  $('windowNotice').hidden = !lockedElsewhere;
  $('questionHint').hidden = !running && !paused;
  $('questionHint').textContent = running ? '正在处理当前问题。需要换题时，请先点“停止”，再点“新问题”。' : '已暂停，可以修改内容并开始新互审。“继续当前步骤”仍会处理原来的问题。';
  $('start').disabled = running || !isExtension || lockedElsewhere || engine?.locked;
  $('start').textContent = r ? '开始新互审 ↗' : '开始互审 ↗';
  $('pause').disabled = !running || lockedElsewhere;
  $('resume').disabled = !paused || engine?.locked || lockedElsewhere;
  $('takeover').disabled = !r || r.status === 'done' || engine?.locked || lockedElsewhere;
  $('manualSent').disabled = !paused || !r?.pending || engine?.locked || lockedElsewhere;
  $('acceptManual').disabled = !paused || engine?.locked || lockedElsewhere;
  $('copyPrompt').disabled = !r || r.status === 'done';
  $('clear').disabled = running || engine?.locked || lockedElsewhere;
  $('copyFinal').disabled = !((r?.finalOut || imported?.finalOut || '').trim());
  $('charCount').textContent = config.q.length.toLocaleString() + ' 字';
  const output = r?.outputs || imported?.outputs || {};
  $('firstOut').value = output.first || '';
  const reviews = r?.turns?.slice(1, r.status === 'done' ? -1 : undefined) || [];
  $('reviewOut').value = reviews.length ? reviews.map((text,i) => `第 ${i + 2} 轮 · ${C.providers[r[r.route[i + 1]]].name}\n${text}`).join('\n\n') : output.review || '';
  $('lastOut').value = output.final || '';
  $('finalOut').value = r?.finalOut || imported?.finalOut || '';
  $('resultLabel').textContent = r?.status === 'done' ? '已完成' : running ? '处理中' : paused ? '等待接续' : imported?.previous ? '上次结果' : imported ? '已导入' : '等待开始';
  const states = {running: '进行中', paused: '已暂停', done: '已完成'};
  $('status').textContent = r ? states[r.status] + ' · ' + (r.status === 'done' ? '最终结果已保存' : `第 ${r.stageIndex + 1}/${r.route.length} 轮 · ${C.providers[r[r.route[r.stageIndex]]].name} · ${C.labels[C.stageAt(r)]}`) : '就绪 · 输入问题后，点击「开始互审」';
  if (r?.pending?.parts?.length > 1 && r.status !== 'done') $('status').textContent += ` · 材料 ${r.pending.partIndex + 1}/${r.pending.parts.length}`;
  $('error').textContent = r?.error || '';
  $('error').hidden = !r?.error;
  $('logs').textContent = (r?.logs || []).map(x => new Date(x.at).toLocaleTimeString() + '  ' + x.text).join('\n');
  const progress = $('steps'); progress.replaceChildren();
  const route = r?.route || (() => {try {return C.routeFor(config);} catch {return ['primary','reviewer','primary'];}})();
  $('showThird').hidden = !route.includes('third');
  route.forEach((role,i) => {
    if (i) {const arrow=document.createElement('i');arrow.textContent='→';progress.append(arrow);}
    const span=document.createElement('span');span.textContent=`${i + 1} ${C.providers[(r || config)[role]]?.name || '待选模型'}`;
    span.classList.toggle('active',!!r && i===r.stageIndex && r.status!=='done');
    span.classList.toggle('complete',!!r && (i<r.stageIndex || r.status==='done'));
    progress.append(span);
  });
  if (transient && transient.until > Date.now()) {
    $('status').textContent = transient.text;
    if (transient.error) {$('error').textContent = transient.text; $('error').hidden = false;}
  }
}
async function checkedTab(id, provider) {
  let tab;
  try { tab = await chrome.tabs.get(id); } catch { throw new Error('任务网页已关闭。请手动补入本轮回答，或重新开始任务。'); }
  if (!C.allowedURL(provider, tab.pendingUrl || tab.url)) throw new Error('任务网页不在预期模型网站。请在该标签页返回模型网站后继续。');
  return tab;
}
const io = {
  async create(provider) {
    const url = C.providers[provider].url;
    if (taskWindow) {
      try { const tab = await chrome.tabs.create({windowId: taskWindow, url, active: true}); return tab.id; }
      catch { taskWindow = null; }
    }
    const win = await chrome.windows.create({url, type: 'normal', focused: true});
    taskWindow = win.id; return win.tabs[0].id;
  },
  async activate(id) {
    const tab = await chrome.tabs.get(id);
    await chrome.tabs.update(id, {active: true});
    await chrome.windows.update(tab.windowId, {focused: true});
  },
  close: id => chrome.tabs.remove(id),
  async snapshot(id, provider) {
    await checkedTab(id, provider);
    // Newly created pages need time to attach their declarative content script.
    for (let i = 0; i < 24; i++) {
      if (engine.run?.status !== 'running' && i > 0) throw new Error('等待连接已停止。');
      try {
        const data = await chrome.tabs.sendMessage(id, {type: 'RELAY_SNAPSHOT'});
        if (data?.ok && data.protocol !== 3) {
          const error = new Error(C.providers[provider].name + ' 页面仍在使用旧版连接脚本。请刷新这个模型任务页面，再点继续；只重新加载扩展还不够。');
          error.relayUpdate = true; throw error;
        }
        if (data?.ok && data.input) return data;
        if (data?.ok && i === 23) return data;
      } catch (e) { if (e.relayUpdate) throw e; /* Wait for page load without resending. */ }
      await sleep(500);
    }
    throw new Error(C.providers[provider].name + ' 页面未连接。请检查网络、登录，并刷新任务网页后继续。');
  },
  send: (id, p) => chrome.tabs.sendMessage(id, {type: 'RELAY_SEND', ...p}),
  cancel: (id, runId) => chrome.tabs.sendMessage(id, {type: 'RELAY_CANCEL', runId}),
  resume: (id, runId) => chrome.tabs.sendMessage(id, {type: 'RELAY_RESUME', runId})
};
async function copy(text) {
  if (!text?.trim()) throw new Error('当前没有可复制的内容。');
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select();
    const ok = document.execCommand('copy'); t.remove();
    if (!ok) throw new Error('复制失败，请选中文字后手动复制。');
  }
  message('已复制到剪贴板。');
}
function bind(id, fn) {
  $(id).addEventListener('click', async () => {
    try { await fn(); }
    catch (e) { message(e.message, true); }
  });
}
async function loadSaved() {
  let saved;
  try { saved = isExtension ? (await chrome.storage.local.get('relay')).relay : JSON.parse(localStorage.getItem('aiRelayPreview')); }
  catch { message('未能读取本地记录。', true); }
  config = saved?.config ? C.importData({config: saved.config}).config : defaultConfig();
  imported = saved?.imported || null;
  engine.restore(saved?.run || null);
}
async function initialize() {
  engine = new RelayEngine(io, async () => {render(); await store();});
  await loadSaved();
  populateForm(); render();
  $('previewNotice').hidden = isExtension;
  $('modeBadge').textContent = isExtension ? '本地保存' : '界面预览';
  for (const id of ['question','primary','reviewer','third','sequence','timeout','templateFirst','templateReview','templateFinal']) {
    $(id).addEventListener('input', () => {
      readForm(); render();
      clearTimeout(saveTimer); saveTimer = setTimeout(() => store().catch(e => message('保存失败：' + e.message, true)), 300);
    });
  }
  bind('start', async () => {
    if (!isExtension || lockedElsewhere || engine.locked) return;
    if (engine.run && !confirm('开始一个新任务？当前工作台的过程记录将被替换；如需保留，请先导出 JSON。')) return;
    readForm(); C.validate(config); imported = null;
    await engine.begin(config); await engine.tick(); render();
  });
  bind('newTask', async () => {
    if (lockedElsewhere || engine.locked || engine.run?.status === 'running') return;
    clearTimeout(saveTimer);
    if (engine.run) {
      const r = engine.run;
      imported = {...C.importData({config: r, run: r, finalOut: r.finalOut}), previous: true};
    }
    engine.run = null; taskWindow = null; config.q = ''; transient = null;
    $('manual').value = ''; populateForm(); render(); await store();
    $('question').focus(); message('可以输入新问题；上次结果暂时保留在右侧，开始新互审后更新。');
  });
  bind('showOtherWorkbench', async () => {
    const current = await chrome.tabs.getCurrent();
    const url = chrome.runtime.getURL('app.html');
    const windows = await chrome.windows.getAll({populate: true});
    for (const win of windows) {
      const tab = win.tabs?.find(t => t.url === url && t.id !== current?.id);
      if (tab) {await chrome.tabs.update(tab.id, {active: true}); await chrome.windows.update(win.id, {focused: true}); return;}
    }
    message('原窗口可能刚关闭，本窗口会自动接管。');
  });
  bind('pause', async () => {await engine.pause(); render();});
  bind('resume', async () => {await engine.resume(); await engine.tick(); render();});
  bind('takeover', async () => {await engine.takeover(); render(); message('已打开本轮网页。可复制待发内容手动发送，或直接粘贴本轮完整回答跳到下一轮。');});
  bind('manualSent', async () => {await engine.markManualSent(); await engine.resume(); await engine.tick(); render();});
  bind('copyFinal', () => copy($('finalOut').value));
  bind('copyPrompt', async () => {
    const r = engine.run; if (!r) return;
    const stage = C.stageAt(r);
    const marker = r.pending?.marker || '【接力结束_手动】';
    await copy(r.pending?.parts?.[r.pending.partIndex]?.prompt || r.pending?.prompt || C.promptFor(r, stage, marker));
  });
  bind('acceptManual', async () => {
    const r = engine.run; if (!r) throw new Error('请先开始一个任务。');
    if (!confirm('将粘贴内容作为「' + C.labels[C.stageAt(r)] + '」的完整回答，并继续下一轮？请确认模型已经回答完毕。')) return;
    await engine.acceptManual(C.stripMarker($('manual').value, r.pending?.marker || '【接力结束_手动】'));
    $('manual').value = ''; if (engine.run.status !== 'done') {await engine.resume(); await engine.tick();} render();
  });
  for (const [button, role] of [['showPrimary','primary'],['showReviewer','reviewer'],['showThird','third']]) {
    bind(button, async () => {
      if (!isExtension) {message('请在已安装的扩展中打开工作台。'); return;}
      const tab = engine.run?.tabs[role];
      if (tab) await io.activate(tab.id);
      else await chrome.tabs.create({url: C.providers[config[role]].url});
    });
  }
  bind('diagnose', async () => {
    if (!isExtension || !engine.run) throw new Error('请先在扩展内开始任务，创建任务网页。');
    const results = [];
    for (const role of [...new Set(engine.run.route)]) {
      const t = engine.run.tabs[role];
      if (!t) {results.push('尚未打开任务网页'); continue;}
      try { const s = await io.snapshot(t.id, engine.run[role]); results.push(s.name + '：' + (s.input ? '输入框已连接' : '需要登录或适配') + '，识别到 ' + s.answers.length + ' 段回答'); }
      catch (e) { results.push(e.message); }
    }
    message(results.join('；'));
  });
  bind('export', async () => {
    readForm(); await store();
    const data = {schema: 'ai-relay', version: 3, exported: new Date().toISOString(), config, run: engine.run, finalOut: $('finalOut').value};
    if (!engine.run && imported) data.run = {outputs: imported.outputs};
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = 'ai-relay-' + new Date().toISOString().slice(0,10) + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); message('已导出任务数据。');
  });
  $('import').addEventListener('change', async ev => {
    try {
      const file = ev.target.files[0]; if (!file) return;
      if (file.size > 8 * 1024 * 1024) throw new Error('文件超过 8 MB，请导入较小的 JSON。');
      const data = C.importData(JSON.parse(await file.text()));
      if ((engine.run || config.q) && !confirm('用导入数据替换当前工作台内容？')) return;
      engine.run = null; imported = data; config = data.config; populateForm(); render(); await store(); message('导入成功；不会自动发送。');
    } catch (e) {message('导入失败：' + e.message, true);} finally {ev.target.value = '';}
  });
  bind('resetTemplates', async () => {config.templates = {...C.templates}; populateForm(); await store(); message('已恢复默认提示词。');});
  bind('clear', async () => {
    if (!confirm('清空此浏览器中的工作台记录和问题？模型网站上的聊天不会被删除。')) return;
    engine.run = null; imported = null; config.q = ''; $('manual').value = ''; populateForm(); render(); await store(); message('本地记录已清空。');
  });
  window.addEventListener('beforeunload', e => {
    if (engine.run?.status === 'running') {e.preventDefault(); e.returnValue = '';}
  });
  if (isExtension) {
    // Queue for ownership: when an older window closes this one must recover.
    navigator.locks.request('ai-relay-runner', async () => {
      // Re-read after acquisition, never resume using a stale waiting-window copy.
      await loadSaved(); lockedElsewhere = false; transient = null;
      populateForm(); render();
      setInterval(async () => {try {await engine.tick(); render();} catch(e) {message(e.message, true);}}, 1500);
      await new Promise(() => {});
    }).catch(e => message('无法连接工作台：' + e.message + '。请关闭其他工作台后重新打开。', true));
  }
}
initialize().catch(e => message('初始化失败：' + e.message, true));
