(function(root) {
  'use strict';
  const C = typeof module !== 'undefined' ? require('./core.js') : root.RelayCore;
  class RelayEngine {
    constructor(io, changed, now = Date.now, uid = () => crypto.randomUUID()) {
      this.io = io; this.changed = changed; this.now = now; this.uid = uid;
      this.run = null; this.locked = false; this.observation = null;
    }
    async save() { await this.changed(this.run); }
    log(text) {
      this.run.logs.push({at: this.now(), text});
      this.run.logs = this.run.logs.slice(-100);
    }
    async begin(config) {
      C.validate(config);
      if (this.locked || this.run?.status === 'running') throw new Error('已有任务正在运行。');
      this.run = {
        ...structuredClone(config), id: this.uid(), status: 'running', stageIndex: 0,
        outputs: {}, finalOut: '', tabs: {}, pending: null, logs: [], error: '', created: this.now()
      };
      this.log('任务已创建：初稿 → 审核 → 原模型定稿。');
      await this.save();
    }
    restore(run) {
      this.run = run;
      if (this.run?.status === 'running') {
        this.run.status = 'paused';
        this.run.error = '窗口曾关闭或刷新。点击继续后先检查当前步骤，不会重复发送已尝试发送的消息。';
      }
      this.observation = null;
    }
    async pause(reason = '已停止自动接力。网页上已发出的生成可能仍在继续；继续时会先读取结果。') {
      if (!this.run || this.run.status === 'done') return;
      this.run.status = 'paused'; this.run.error = reason; this.log(reason);
      await this.save();
      await Promise.allSettled(Object.values(this.run.tabs).map(t => this.io.cancel(t.id, this.run.id)));
    }
    async resume() {
      if (!this.run || this.run.status !== 'paused' || this.locked) return;
      await Promise.allSettled(Object.values(this.run.tabs).map(t => this.io.resume(t.id, this.run.id)));
      this.run.status = 'running'; this.run.error = '';
      if (this.run.pending) this.run.pending.started = this.now();
      this.observation = null; this.log('继续处理当前步骤。'); await this.save();
    }
    active() { return this.run?.status === 'running'; }
    async complete(text) {
      const stage = C.stages[this.run.stageIndex];
      if (!text.trim()) throw new Error('本轮回答为空，不能进入下一步。');
      if (stage === 'final' && !C.extractFinal(text)) throw new Error('最终答案标记后没有内容，请补全后再继续。');
      this.run.outputs[stage] = text;
      this.log(C.labels[stage] + '完成，已保存。');
      this.run.stageIndex++; this.run.pending = null; this.observation = null;
      if (stage === 'final') {
        this.run.finalOut = C.extractFinal(text); this.run.status = 'done';
        this.log('全部完成，可以复制右侧最终结果。');
      }
      await this.save();
    }
    async acceptManual(text) {
      if (!this.run || this.run.status !== 'paused' || this.locked) throw new Error('请先停止任务，再补入当前步骤的完整回答。');
      if (!text.trim()) throw new Error('请粘贴完整回答。');
      this.log('用户手动补入当前步骤回答。');
      await this.complete(text);
      // Stay paused: the user explicitly resumes before the next transmission.
    }
    async tick() {
      if (!this.active() || this.locked) return;
      this.locked = true;
      try {
        for (const role of ['primary', 'reviewer']) {
          if (!this.active()) return;
          if (!this.run.tabs[role]) {
            const id = await this.io.create(this.run[role]);
            this.run.tabs[role] = {id, url: C.providers[this.run[role]].url};
            this.log('已打开 ' + C.providers[this.run[role]].name + ' 的独立任务页面。');
            await this.save();
          }
        }
        if (!this.active()) return;
        const stage = C.stages[this.run.stageIndex];
        const role = stage === 'review' ? 'reviewer' : 'primary';
        const tab = this.run.tabs[role];
        // Check both pages before the first transmission.
        if (this.run.stageIndex === 0 && !this.run.pending) {
          for (const r of ['primary','reviewer']) {
            if (!this.active()) return;
            const s = await this.io.snapshot(this.run.tabs[r].id, this.run[r]);
            if (!s.input) throw new Error(C.providers[this.run[r]].name + ' 未找到输入框，请在任务页面完成登录后点击继续。');
            if (s.busy || s.inputOccupied) throw new Error(C.providers[this.run[r]].name + ' 页面有未完成的生成或输入，请先检查。');
          }
        }
        if (!this.active()) return;
        let snap = await this.io.snapshot(tab.id, this.run[role]);
        if (!C.allowedURL(this.run[role], snap.url)) throw new Error('任务页面已离开所选模型网站，请重新打开或手动补入结果。');
        if (!this.run.pending) {
          if (stage === 'final' && tab.previousMarker && !snap.answers.some(a => a.text.includes(tab.previousMarker))) {
            throw new Error('原模型的初稿对话已发生变化，请回到本任务的初稿对话再继续。');
          }
          const marker = '【接力结束_' + this.uid().replaceAll('-', '') + '】';
          this.run.pending = {taskId: this.uid(), marker, phase: 'prepared', started: this.now(), prompt: C.promptFor(this.run, stage, marker)};
          await this.save();
        }
        const p = this.run.pending;
        if (p.phase === 'prepared') {
          if (!snap.input) throw new Error('未找到网页输入框，请完成登录后继续。');
          if (snap.busy || snap.inputOccupied) throw new Error('网页正在生成或输入框已有文字，请检查后清空输入框再继续。');
          await this.io.activate(tab.id);
          if (!this.active()) return;
          // Persist before sending so a lost response/reload cannot trigger a duplicate.
          p.phase = 'dispatching'; p.started = this.now();
          this.log('正在向 ' + C.providers[this.run[role]].name + ' 发送：' + C.labels[stage]);
          await this.save();
          if (!this.active()) {p.phase = 'prepared'; await this.save(); return;}
          let ack;
          try { ack = await this.io.send(tab.id, {...p, runId: this.run.id}); }
          catch { throw new Error('发送状态未能确认。请检查任务网页；继续只会等待结果，不会重复点击发送。'); }
          if (!ack.ok) {
            if (ack.beforeClick) p.phase = 'prepared';
            throw new Error(ack.error || '发送未完成，请检查任务页面。');
          }
          p.phase = 'waiting';
          this.log('已点击发送，等待完整回答。'); await this.save();
          return;
        }
        if (!this.active()) return;
        this.observation = C.observe(this.observation, snap, p.marker, this.now());
        if (this.observation.done) {
          tab.url = snap.url; tab.previousMarker = p.marker;
          await this.complete(C.stripMarker(this.observation.text, p.marker));
        } else if (this.now() - p.started > this.run.timeout * 60000) {
          throw new Error('等待超时，或网页没有输出结束标记。请检查网页；可以继续等待，也可以粘贴完整回答后接着运行。');
        }
      } catch (e) {
        if (this.run && this.active()) await this.pause(e.message);
        else if (this.run) await this.save();
      } finally { this.locked = false; }
    }
  }
  root.RelayEngine = RelayEngine;
  if (typeof module !== 'undefined') module.exports = RelayEngine;
})(globalThis);
