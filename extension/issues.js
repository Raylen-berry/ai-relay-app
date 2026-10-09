(function(root) {
  'use strict';
  const definitions = {
    'login-required': ['需要重新登录', '在当前模型网页完成登录，再回来继续。', ['page','retry']],
    'page-unreachable': ['网页暂时未连接', '检查任务网页是否仍打开、是否加载完成，再继续当前步骤。', ['page','retry']],
    'page-closed': ['任务网页已关闭', '可以手动补入这一轮回答，或开始一个新任务。', ['manual']],
    'input-missing': ['没有找到输入框', '先查看网页：可能需要登录，也可能是网页结构发生了变化。', ['page','retry','manual']],
    'draft-present': ['网页里有未发送的内容', '先检查输入框中的草稿和附件，确认后清理，或手动处理这一轮。', ['page','retry','manual']],
    'page-busy': ['网页还在生成回答', '等当前回答完成后，回来继续这个步骤。', ['page','retry']],
    'missing-marker': ['尚未收到结束标记', '网页上的回答可能已完成，但缺少本轮结束标记。确认完整后，可手动补入回答继续。', ['page','manual']],
    'answer-timeout': ['等待回答超时', '查看模型是否仍在生成。可以继续等待，也可以手动处理这一轮。', ['page','retry','manual']],
    'attachment-failed': ['附件还未准备好', '查看网页上的附件状态，处理上传或解析问题后再继续。', ['page','retry','manual']],
    'send-uncertain': ['需要确认是否已发送', '先查看任务网页。继续时会检查现有结果，避免自动重复提交。', ['page','retry','manual']],
    'conversation-changed': ['当前对话发生了变化', '返回这个任务原来的模型对话，或手动补入该轮完整回答。', ['page','retry','manual']],
    'manual-pause': ['任务已暂停', '继续会先检查当前步骤。已发出的模型请求可能仍在生成。', ['page','retry','manual']],
    'interrupted': ['上次任务尚未结束', '工作台已恢复记录，确认任务网页后继续。', ['page','retry','manual']],
    'unknown': ['当前步骤需要检查', '查看下面的具体说明，再选择继续或手动处理。', ['page','retry','manual']]
  };
  function describe(code, detail = '', level = 'warning') {
    if (!definitions[code]) code = 'unknown';
    const [title, help, actions] = definitions[code];
    return {code, title, help, actions, detail, level};
  }
  function failure(code, message, context = {}) {
    const error = new Error(message);
    error.relayIssue = code;
    error.relayContext = context;
    return error;
  }
  function classify(error) {
    const text = typeof error === 'string' ? error : error?.message || '';
    let code = error?.relayIssue;
    if (!code) {
      if (/页面已关闭|网页已关闭/.test(text)) code = 'page-closed';
      else if (/页面未连接|连接脚本|无法连接/.test(text)) code = 'page-unreachable';
      else if (/未找到.*输入框/.test(text)) code = 'input-missing';
      else if (/原对话|离开.*网站|不在预期模型网站/.test(text)) code = 'conversation-changed';
      else if (/发送状态|没有确认发送/.test(text)) code = 'send-uncertain';
      else if (/附件|上传|解析/.test(text)) code = 'attachment-failed';
    }
    return {...describe(code, text), ...error?.relayContext};
  }
  const api = {describe, failure, classify};
  root.RelayIssues = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
