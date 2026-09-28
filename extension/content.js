(() => {
  'use strict';
  if (globalThis.__aiRelayInstalled) return;
  globalThis.__aiRelayInstalled = true;
  const adapter = RelayAdapters[location.hostname];
  if (!adapter) return;
  const ledger = new Map();
  const cancelled = new Set();
  const visible = e => {
    if (!e || !e.getClientRects().length) return false;
    for (let node=e; node; node=node.parentElement) {
      const style=getComputedStyle(node);
      if (style.visibility==='hidden' || style.display==='none' || style.opacity==='0') return false;
    }
    return true;
  };
  function select(selectors, requireVisible = true) {
    for (const selector of selectors) {
      const nodes = [...document.querySelectorAll(selector)].filter(e => !requireVisible || visible(e));
      if (nodes.length) return nodes;
    }
    return [];
  }
  const input = () => select(adapter.input)[0];
  const inputText = RelayEditor.read;
  const enabled = e => e && !e.disabled && e.getAttribute('aria-disabled') !== 'true' && !/(^|[\s-])disabled($|\s)/.test(e.className);
  const normalized = RelayEditor.normalize;
  function attachmentName(card) {
    const label=card.querySelector(adapter.attachmentName), img=card.querySelector('img');
    let name=card.getAttribute('data-file-name') || card.querySelector('[data-file-name]')?.getAttribute('data-file-name') ||
      label?.getAttribute('title') || label?.getAttribute('aria-label') || label?.textContent ||
      card.getAttribute('aria-label') || img?.getAttribute('alt');
    // Kimi displays a document's extension separately, and images have an empty
    // alt. Read the filename in the displayed image URL, never its signed token.
    if (adapter.name==='Kimi') {
      const ext=normalized(card.querySelector('.file-ext')?.textContent).toLowerCase();
      if (name && ext && !name.toLowerCase().endsWith('.'+ext)) name+='.'+ext;
      if (!name) {
        const match=img?.getAttribute('src')?.match(/[?&]filename=([^&]*)/);
        if (match) { try {name=decodeURIComponent(match[1].replace(/\+/g,' '));} catch {} }
      }
    }
    return normalized(name || card.textContent);
  }
  // Only inspect the current composer, never attachments in conversation history.
  function attachments(box = input()) {
    const root = box?.closest(adapter.composer);
    const candidates = root ? [...root.querySelectorAll(adapter.attachment)].filter(visible) : [];
    const cards = candidates.filter(e=>!candidates.some(parent=>parent!==e && parent.contains(e)));
    const names = cards.map(attachmentName);
    const pending = cards.some(e => e.matches(adapter.attachmentPending) ||
      [...e.querySelectorAll(adapter.attachmentPending)].some(visible) ||
      /等待解析|解析中|上传中|正在上传|正在处理|uploading|processing/i.test(e.innerText || ''));
    const failed = cards.some(e => /(^|\s)(error|failed)(\s|$)/.test(e.className) ||
      /上传失败|解析失败|无法上传|upload failed|failed to upload/i.test(e.innerText || ''));
    return {count:cards.length, names, signature:JSON.stringify([...names].sort()), pending, failed};
  }
  function busy() {
    if (select(adapter.busy).length) return true;
    // DeepSeek switches the circular send arrow to a stop square while generating.
    if (adapter.name === 'DeepSeek') {
      const b = select(adapter.send)[0];
      if (b && enabled(b) && !inputText(input()) && !attachments().count) return true;
    }
    if (adapter.name === 'Kimi') {
      const b = select(adapter.send)[0];
      if (b?.querySelector('[name*="Stop"], [name*="stop"]')) return true;
    }
    return false;
  }
  function snapshot() {
    const box = input();
    const entries = select(adapter.answer, false);
    const files = attachments(box);
    return {
      protocol: 5, name: adapter.name, url: location.href, input: !!box,
      inputOccupied: !!inputText(box) || !!files.count, draft: inputText(box), attachments:files,
      sendFound: !!findSendButton(box), busy: busy(),
      userMessages: select(['[data-message-author-role="user"]'], false).map(e => ({text: inputText(e)})),
      answers: entries.map(e => {
        if (adapter.name === 'Kimi') {
          const parts = [...e.querySelectorAll('.markdown')].filter(n => !n.closest('.thinking-container'));
          return {text: parts.map(n => n.innerText.trim()).join('\n\n')};
        }
        return {text: e.innerText?.trim() || ''};
      }).filter(a => a.text)
    };
  }
  function findSendButton(box) {
    const form = box?.closest?.('form');
    for (const selector of adapter.send) {
      const roots = form ? [form] : [document];
      for (const root of roots) {
        const button = [...root.querySelectorAll(selector)].find(e => visible(e) && enabled(e));
        if (button) return button;
      }
    }
    return null;
  }
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function send(msg) {
    if (ledger.has(msg.taskId)) return ledger.get(msg.taskId);
    if (cancelled.has(msg.runId)) return {ok: false, beforeClick: true, error: '已停止任务。'};
    const box = input();
    if (!box) return {ok: false, beforeClick: true, error: '未找到输入框，请完成登录或检查页面适配。'};
    if (busy()) return {ok: false, beforeClick: true, error: '网页正在生成回答，请等待完成。'};
    if (typeof msg.prompt !== 'string' || !msg.prompt.trim()) return {ok: false, beforeClick: true, error: '发送内容为空。'};
    const existing = normalized(inputText(box));
    const initialFiles = attachments(box);
    const reuseFiles = initialFiles.count > 0 && msg.attachmentSignature === initialFiles.signature;
    if (initialFiles.count && !reuseFiles) return {ok:false, beforeClick:true, error:'网页已有附件，请先检查当前步骤再继续。'};
    const reuseDraft = !!existing && existing === normalized(msg.prompt);
    const reuseComposed = msg.userFiles && msg.composedSignature === initialFiles.signature && (!existing || reuseDraft);
    const repairDraft = adapter.name === 'Kimi' && RelayEditor.lostLineBreaks(existing, msg.prompt, msg.marker);
    if (existing && !reuseDraft && !repairDraft) return {ok: false, beforeClick: true, error: '网页输入框已有其他内容；请检查后清空，避免覆盖草稿。'};
    ledger.set(msg.taskId, {ok: false, uncertain: true, error: '正在准备发送，请先检查网页。'});
    if (!reuseDraft && !reuseComposed && (!reuseFiles || msg.userFiles)) {
      box.focus();
      if (box instanceof HTMLTextAreaElement || box instanceof HTMLInputElement) {
        const proto = box instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(box, msg.prompt);
        box.dispatchEvent(new Event('input', {bubbles: true}));
        box.dispatchEvent(new Event('change', {bubbles: true}));
      } else {
        const range = document.createRange(); range.selectNodeContents(box);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        if (box.getAttribute('data-lexical-editor') === 'true' || adapter.name === 'Kimi') {
          // Kimi's single-line Lexical insertText path removes all newlines.
          // Its paste handler accepts multiline plain text and updates editor state.
          // This event does not read or overwrite the system clipboard.
          try {
            const data = new DataTransfer(); data.setData('text/plain', msg.prompt);
            box.dispatchEvent(new ClipboardEvent('paste', {clipboardData: data, bubbles: true, cancelable: true, composed: true}));
          } catch {
            ledger.delete(msg.taskId);
            return {ok: false, beforeClick: true, error: '网页未接收多行粘贴，未点击发送。请刷新该模型页面后继续。'};
          }
        } else {
          // Never fall back to innerHTML: it can bypass the editor's state.
          const inserted = document.execCommand('insertText', false, msg.prompt);
          if (!inserted) box.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: msg.prompt}));
        }
      }
      for (let i = 0; i < 16; i++) {
        await sleep(125);
        if (RelayEditor.same(inputText(input()), msg.prompt) || (msg.userFiles ? attachments().count > initialFiles.count : attachments().count)) break;
      }
    }
    let files = attachments();
    const fileSignature = files.count ? files.signature : null;
    const contentMatches = () => {
      const draft = inputText(input()), currentFiles = attachments();
      if (msg.userFiles) {
        // Selected files must survive prompt insertion. An empty draft is only
        // valid if the site converted that prompt into an additional TXT card.
        if (!initialFiles.names.every(name=>currentFiles.names.includes(name))) return false;
        if (!RelayEditor.same(draft,msg.prompt) && !((currentFiles.count>initialFiles.count || (reuseComposed && msg.composedAsFile)) && !normalized(draft))) return false;
      }
      if (fileSignature) return currentFiles.count > 0 && currentFiles.signature === fileSignature &&
        (!normalized(draft) || RelayEditor.same(draft, msg.prompt));
      return !currentFiles.count && RelayEditor.same(draft, msg.prompt);
    };
    if (!contentMatches()) {
      const result = {ok: false, beforeClick: true, error: '网页没有完整接收文字。未点击发送，请检查输入框。'};
      ledger.delete(msg.taskId); return result;
    }
    let button;
    // Attachment parsing can take much longer than the editor update itself.
    for (let i = 0; i < (fileSignature ? 240 : 20); i++) {
      if (cancelled.has(msg.runId)) {ledger.delete(msg.taskId); return {ok: false, beforeClick: true, draftRetained: true, error: '已停止；网页可能保留未发送文字。'};}
      files = attachments();
      if (files.failed || !contentMatches()) break;
      button = !files.pending && findSendButton(input());
      if (button) break;
      await sleep(fileSignature ? 250 : 150);
    }
    if (!button || cancelled.has(msg.runId)) {
      ledger.delete(msg.taskId);
      return {ok: false, beforeClick: true, draftRetained: true,
        ...(msg.userFiles && contentMatches() ? {composedSignature:fileSignature,composedAsFile:!normalized(inputText(input()))} : {}), error: files.failed
        ? '附件上传或解析失败，未点击发送。请检查模型网页后继续。'
        : files.pending ? '附件仍在上传或解析，已保留。完成后点击“继续当前步骤”。'
        : '发送按钮不可用或待发内容发生变化；请检查网页后继续当前步骤。'};
    }
    // One submission per attempt. A slow response must not trigger several
    // independent submissions through click, requestSubmit and Enter.
    const delivered = () => {
      const current = input();
      return (current && !normalized(inputText(current)) && !attachments(current).count) || busy() ||
        (!!msg.marker && snapshot().userMessages.some(m => m.text.includes(msg.marker)));
    };
    const waitForDelivery = async (rounds = 40) => {
      for (let i = 0; i < rounds; i++) {
        if (delivered()) return true;
        if (cancelled.has(msg.runId)) return false;
        await sleep(125);
      }
      return delivered();
    };
    // Recheck immediately before the irreversible action, including edits made
    // by the user while the send button was becoming available.
    if (!contentMatches() || attachments().pending || attachments().failed) {
      ledger.delete(msg.taskId);
      return {ok:false, beforeClick:true, error:'发送前输入内容发生变化，已暂停。'};
    }
    button.click();
    if (!await waitForDelivery()) {
      const retryableDraft = !cancelled.has(msg.runId) && contentMatches();
      const result = {ok: false, uncertain: true, retryableDraft,
        ...(msg.userFiles && retryableDraft ? {composedSignature:fileSignature,composedAsFile:!normalized(inputText(input()))} : {}), error: retryableDraft
        ? '内容已填入，但网页没有确认发送。任务已暂停；确认网页没有发出后，可点“继续当前步骤”重试。'
        : '发送状态未确认，任务已暂停。请检查网页；继续时先等待结果，避免重复发送。'};
      if (retryableDraft) ledger.delete(msg.taskId); else ledger.set(msg.taskId, result);
      return result;
    }
    const result = {ok: true, clicked: true, verified: true, attachment:!!fileSignature};
    ledger.set(msg.taskId, result);
    return result;
  }
  const uploader = RelayUpload.create({input,attachments,busy,cancelled,sleep,adapter});
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (sender.id !== chrome.runtime.id || !msg || !msg.type?.startsWith('RELAY_')) return;
    if (msg.type === 'RELAY_CANCEL') {cancelled.add(msg.runId); reply({ok: true}); return;}
    if (msg.type === 'RELAY_RESUME') {cancelled.delete(msg.runId); reply({ok: true}); return;}
    if (msg.type === 'RELAY_SNAPSHOT') {reply({ok: true, ...snapshot()}); return;}
    if (msg.type.startsWith('RELAY_FILES_')) {
      uploader.receive(msg).then(reply).catch(e=>reply({ok:false,error:e.message}));return true;
    }
    if (msg.type === 'RELAY_SEND') {
      send(msg).then(reply).catch(e => reply({ok: false, uncertain: true, error: e.message}));
      return true;
    }
  });
})();
