(function(root) {
  'use strict';
  // Selectors are isolated here so site redesigns do not change the workflow.
  // Input selectors checked against live pages on 2026-09-21.
  const adapters = {
    'chat.deepseek.com': {
      name: 'DeepSeek',
      input: ['textarea[placeholder*="DeepSeek"]', 'textarea'],
      send: ['.ds-button--primary.ds-button--circle', 'button[aria-label="发送"]'],
      answer: ['.ds-assistant-message-main-content'],
      busy: ['[aria-label="停止生成"]', '[aria-label="Stop generating"]', '[data-testid="stop-button"]']
    },
    'chatgpt.com': {
      name: 'ChatGPT',
      input: ['#prompt-textarea[contenteditable="true"]', 'textarea#prompt-textarea'],
      send: ['button[data-testid="send-button"]', 'button[aria-label="Send prompt"]', 'button[aria-label="发送提示"]', 'button[aria-label="发送消息"]'],
      answer: ['[data-message-author-role="assistant"] .markdown', '[data-message-author-role="assistant"]'],
      busy: ['button[data-testid="stop-button"]', 'button[aria-label="Stop streaming"]', 'button[aria-label="停止流式传输"]']
    },
    'www.kimi.com': {
      name: 'Kimi',
      input: ['.chat-input-editor[contenteditable="true"]', '[role="textbox"][contenteditable="true"]'],
      send: ['.send-button-container', 'button[aria-label="Send"]', 'button[aria-label="发送"]'],
      answer: ['.segment-assistant', '.chat-content-item-assistant', '[data-message-author-role="assistant"]'],
      busy: ['.stop-button', '[aria-label="Stop"]', '[aria-label="停止生成"]', '.send-button-container:has([name="Stop"])']
    }
  };
  adapters['kimi.com'] = adapters['www.kimi.com'];
  root.RelayAdapters = adapters;
})(globalThis);
