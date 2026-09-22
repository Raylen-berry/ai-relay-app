(() => {
  'use strict';
  if (globalThis.__aiRelayInstalled) return;
  globalThis.__aiRelayInstalled = true;
  const adapter = RelayAdapters[location.hostname];
  if (!adapter) return;
  const ledger = new Map();
  const cancelled = new Set();
  const visible = e => !!e && !!e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  function select(selectors, requireVisible = true) {
    for (const selector of selectors) {
      const nodes = [...document.querySelectorAll(selector)].filter(e => !requireVisible || visible(e));
      if (nodes.length) return nodes;
    }
    return [];
  }
  const input = () => select(adapter.input)[0];
  const inputText = e => (e?.value ?? e?.innerText ?? '').trim();
  const enabled = e => e && !e.disabled && e.getAttribute('aria-disabled') !== 'true' && !/(^|[\s-])disabled($|\s)/.test(e.className);
  const normalized = s => String(s || '').replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();
  function busy() {
    if (select(adapter.busy).length) return true;
    // DeepSeek switches the circular send arrow to a stop square while generating.
    if (adapter.name === 'DeepSeek') {
      const b = select(adapter.send)[0];
      if (b && enabled(b) && !inputText(input())) return true;
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
    return {
      name: adapter.name, url: location.href, input: !!box,
      inputOccupied: !!inputText(box), draft: inputText(box), sendFound: !!findSendButton(box), busy: busy(),
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
      const roots = form ? [form, document] : [document];
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
    const reuseDraft = !!existing && existing === normalized(msg.prompt);
    if (existing && !reuseDraft) return {ok: false, beforeClick: true, error: '网页输入框已有其他内容；请检查后清空，避免覆盖草稿。'};
    ledger.set(msg.taskId, {ok: false, uncertain: true, error: '正在准备发送，请先检查网页。'});
    if (!reuseDraft) {
      box.focus();
      if (box instanceof HTMLTextAreaElement || box instanceof HTMLInputElement) {
        const proto = box instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(box, msg.prompt);
        box.dispatchEvent(new Event('input', {bubbles: true}));
        box.dispatchEvent(new Event('change', {bubbles: true}));
      } else {
        const range = document.createRange(); range.selectNodeContents(box);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        // Chromium's editing command triggers ProseMirror/Lexical input handlers.
        // Do not fall back to innerHTML: it may look filled without updating editor state.
        const inserted = document.execCommand('insertText', false, msg.prompt);
        // execCommand already emits the editor's native input event. Some editors
        // treat a second synthetic event as an unrelated update, so only supply
        // one when the browser reports that insertText was unsupported.
        if (!inserted) box.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: msg.prompt}));
      }
      await sleep(200);
    }
    if (normalized(inputText(box)) !== normalized(msg.prompt)) {
      const result = {ok: false, beforeClick: true, error: '网页没有完整接收文字。未点击发送，请检查输入框。'};
      ledger.delete(msg.taskId); return result;
    }
    let button;
    for (let i = 0; i < 20; i++) {
      if (cancelled.has(msg.runId)) {ledger.delete(msg.taskId); return {ok: false, beforeClick: true, error: '已停止；网页可能保留未发送文字。'};}
      button = findSendButton(box);
      if (button) break;
      await sleep(150);
    }
    if (!button || cancelled.has(msg.runId)) {
      ledger.delete(msg.taskId);
      return {ok: false, beforeClick: true, error: '发送按钮不可用；请检查登录、字数限制或网页改版。'};
    }
    // A visible click is not proof of delivery. Chat editors occasionally show
    // the pasted text while their internal state still considers the composer
    // empty. Confirm that the composer clears or generation starts before
    // reporting success, then use two site-neutral submission fallbacks.
    const delivered = () => {
      const current = input();
      return !current || !normalized(inputText(current)) || busy();
    };
    const waitForDelivery = async (rounds = 12) => {
      for (let i = 0; i < rounds; i++) {
        if (delivered()) return true;
        await sleep(125);
      }
      return delivered();
    };
    let attempted = false;
    button.click(); attempted = true;
    if (!await waitForDelivery()) {
      const form = box.closest('form');
      if (form?.requestSubmit) {
        try { form.requestSubmit(button instanceof HTMLButtonElement ? button : undefined); attempted = true; } catch (_) {}
      }
    }
    if (!await waitForDelivery(8)) {
      // Kimi and some localized ChatGPT/DeepSeek layouts temporarily omit or
      // replace the normal send button. Their composers still accept Enter.
      box.focus();
      for (const type of ['keydown', 'keypress', 'keyup']) {
        box.dispatchEvent(new KeyboardEvent(type, {key: 'Enter', code: 'Enter', bubbles: true, cancelable: true}));
      }
      attempted = true;
    }
    if (!await waitForDelivery(12)) {
      const result = {ok: false, uncertain: attempted, retryableDraft: true, error: '文字已填入，但网页没有确认发送。任务已暂停；直接点击“继续当前步骤”会重新尝试发送这段相同内容。'};
      // The composer still contains this task's exact prompt, so an explicit
      // resume may safely retry without overwriting unrelated user text.
      ledger.delete(msg.taskId);
      return result;
    }
    const result = {ok: true, clicked: true, verified: true};
    ledger.set(msg.taskId, result);
    return result;
  }
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (sender.id !== chrome.runtime.id || !msg || !msg.type?.startsWith('RELAY_')) return;
    if (msg.type === 'RELAY_CANCEL') {cancelled.add(msg.runId); reply({ok: true}); return;}
    if (msg.type === 'RELAY_RESUME') {cancelled.delete(msg.runId); reply({ok: true}); return;}
    if (msg.type === 'RELAY_SNAPSHOT') {reply({ok: true, ...snapshot()}); return;}
    if (msg.type === 'RELAY_SEND') {
      send(msg).then(reply).catch(e => reply({ok: false, uncertain: true, error: e.message}));
      return true;
    }
  });
})();
