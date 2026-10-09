(function(root) {
  'use strict';
  // Selectors are isolated here so site redesigns do not change the workflow.
  // Composer and image/file cards checked against live pages on 2026-09-28.
  const adapters = {
    'chat.deepseek.com': {
      name: 'DeepSeek',
      composer: '._77cefa5',
      attachment: '._25c7358, .d5fa3d1b:has(img)',
      attachmentName: '.e70accd6',
      attachmentPending: '.ds-loading, [role="progressbar"]',
      input: ['textarea[placeholder*="DeepSeek"]', 'textarea'],
      send: ['.ds-button--primary.ds-button--circle', 'button[aria-label="发送"]'],
      answer: ['.ds-assistant-message-main-content'],
      busy: ['[aria-label="停止生成"]', '[aria-label="Stop generating"]', '[data-testid="stop-button"]']
    },
    'chatgpt.com': {
      name: 'ChatGPT',
      composer: 'form',
      attachment: '[class~="group/composer-attachment"], [class~="group/file-tile"], [data-testid="file-thumbnail"], [data-testid="attachment"]',
      attachmentName: '[data-file-name], .composer-attachment-surface[aria-label]',
      attachmentPending: '[role="progressbar"], [aria-busy="true"], .cursor-wait',
      input: ['form [data-composer-markdown][contenteditable="true"]', '#prompt-textarea[contenteditable="true"]', 'textarea#prompt-textarea'],
      send: ['button#composer-submit-button', 'button[data-testid="send-button"]', 'button[aria-label="Send prompt"]', 'button[aria-label="Send"]', 'button[aria-label="发送"]', 'button[aria-label="发送提示"]', 'button[aria-label="发送消息"]', 'form button[type="submit"]'],
      answer: ['[data-message-author-role="assistant"] .markdown', '[data-message-author-role="assistant"]', '[data-conversation-role="assistant"] + [data-chatgpt-selection-message-id]', '[data-conversation-role="assistant"] + * [data-chatgpt-selection-message-id]'],
      busy: ['button[data-testid="stop-button"]', 'button[aria-label="Stop streaming"]', 'button[aria-label="停止流式传输"]', 'form button[aria-label="停止"]', 'form button[aria-label="Stop"]']
    },
    'www.kimi.com': {
      name: 'Kimi',
      composer: '.chat-editor',
      attachment: '[data-testid="input-attachment-list"] .file-card-container, [data-testid="input-attachment-list"] .image-thumbnail',
      attachmentName: '.file-card-info-name',
      attachmentPending: '.parsing, .uploading, .loading-icon',
      input: ['.chat-input-editor[contenteditable="true"]', '[role="textbox"][contenteditable="true"]'],
      send: ['.send-button-container', 'button[aria-label="Send"]', 'button[aria-label="发送"]'],
      answer: ['.segment-assistant', '.chat-content-item-assistant', '[data-message-author-role="assistant"]'],
      busy: ['.stop-button', '[aria-label="Stop"]', '[aria-label="停止生成"]', '.send-button-container:has([name="Stop"])']
    }
  };
  adapters['kimi.com'] = adapters['www.kimi.com'];
  root.RelayAdapters = adapters;
})(globalThis);
