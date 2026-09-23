(function(root) {
  'use strict';
  const C = typeof module !== 'undefined' ? require('./core.js') : root.RelayCore;
  const E = typeof module !== 'undefined' ? require('./editor.js') : root.RelayEditor;
  const pieceAt = pending => pending.parts?.[pending.partIndex || 0] || {prompt: pending.prompt, marker: null};
  const samePrompt = (draft, pending) => E.same(draft, pieceAt(pending).prompt);
  const emptyTime = () => ({send:0, wait:0, paused:0});
  function accrue(t, now) {
    if (!t || t.finishedAt != null) return;
    const row = t.index < 0 ? t.setup : (t.rounds[t.index] ||= emptyTime());
    row[t.mode] += Math.max(0, now - t.checkpoint);
    t.checkpoint = now;
  }
  class RelayEngine {
    constructor(io, changed, now = Date.now, uid = () => crypto.randomUUID()) {
      this.io = io; this.changed = changed; this.now = now; this.uid = uid;
      this.run = null; this.locked = false; this.observation = null;
    }
    clock() {
      const r = this.run, t = r?.timing;
      if (!t || t.finishedAt != null) return;
      accrue(t, this.now());
      t.index = r.stageIndex === 0 && !r.pending ? -1 : r.stageIndex;
      t.mode = r.status === 'paused' ? 'paused' : ['waiting','waitingPart','dispatching'].includes(r.pending?.phase) ? 'wait' : 'send';
      // Dispatching includes upload/parsing and confirmation of the click.
      if (r.pending?.phase === 'dispatching' && r.status !== 'paused') t.mode = 'send';
      if (r.status === 'done') t.finishedAt = this.now();
    }
    static timing(run, now = Date.now()) {
      if (!run?.timing) return null;
      const t = structuredClone(run.timing); accrue(t, now);
      const totals = [t.setup, ...t.rounds.filter(Boolean)].reduce((a,b) => ({send:a.send+b.send, wait:a.wait+b.wait, paused:a.paused+b.paused}), emptyTime());
      return {...t, ...totals, total:totals.send + totals.wait + totals.paused};
    }
    async save() { this.clock(); await this.changed(this.run); }
    log(text) {
      this.run.logs.push({at: this.now(), text});
      this.run.logs = this.run.logs.slice(-100);
    }
    async begin(config) {
      C.validate(config);
      if (this.locked || this.run?.status === 'running') throw new Error('已有任务正在运行。');
      this.run = {
        ...structuredClone(config), route: C.routeFor(config), id: this.uid(), status: 'running', stageIndex: 0,
        outputs: {}, turns: [], finalOut: '', tabs: {}, pending: null, logs: [], error: '', created: this.now(),
        timing:{startedAt:this.now(), checkpoint:this.now(), mode:'send', index:-1, setup:emptyTime(), rounds:[]}
      };
      this.log('任务已创建：' + this.run.route.map(role => C.providers[this.run[role]].name).join(' → ') + '。');
      await this.save();
    }
    restore(run) {
      this.run = run;
      if (this.run && !this.run.route) this.run.route = ['primary','reviewer','primary'];
      if (this.run && !this.run.turns) this.run.turns = [this.run.outputs?.first, this.run.outputs?.review].filter(Boolean);
      if (this.run?.status === 'running') {
        // Closed-window time is separate from measured automatic processing.
        if (this.run.timing) this.run.timing.mode = 'paused';
        this.run.status = 'paused';
        this.run.error = '窗口曾关闭或刷新。点击继续后先检查当前步骤，不会重复发送已尝试发送的消息。';
      }
      if (this.run && !this.run.timing && this.run.status !== 'done') {
        this.run.timing = {startedAt:this.now(), checkpoint:this.now(), mode:'paused', index:this.run.stageIndex,
          setup:emptyTime(), rounds:[], partial:true};
      }
      this.clock();
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
    async prepare() {
      if (this.run.pending) return this.run.pending;
      const stage = C.stageAt(this.run);
      const role = this.run.route[this.run.stageIndex];
      const tab = this.run.tabs[role];
      if (tab?.previousMarker) {
        const snap = await this.io.snapshot(tab.id, this.run[role]);
        if (!snap.answers.some(a => a.text.includes(tab.previousMarker))) throw new Error('本轮模型的原对话已变化，请返回本任务的对话后继续。');
      }
      const marker = '【接力结束_' + this.uid().replaceAll('-', '') + '】';
      const taskId = this.uid();
      const prompt = C.promptFor(this.run, stage, marker);
      this.run.pending = {taskId, marker, phase:'prepared', started:this.now(), prompt,
        parts:C.splitPrompt(prompt, taskId), partIndex:0};
      await this.save();
      return this.run.pending;
    }
    async takeover() {
      if (!this.run || this.run.status === 'done') throw new Error('没有可接管的当前步骤。');
      if (this.active()) await this.pause('已交由你手动接管；自动发送已停止。');
      const role = this.run.route[this.run.stageIndex];
      const tab = this.run.tabs[role];
      if (!tab) throw new Error('当前模型页面尚未打开。');
      await this.prepare();
      await this.io.activate(tab.id);
    }
    async markManualSent() {
      if (this.run?.status !== 'paused' || !this.run.pending) throw new Error('请先手动接管当前步骤。');
      const p = this.run.pending;
      p.phase = p.parts && p.partIndex < p.parts.length - 1 ? 'waitingPart' : 'waiting';
      p.started = this.now(); this.observation = null;
      this.log('用户已手动发送当前片段，继续从网页收取回答。');
      await this.save();
    }
    async complete(text) {
      const stage = C.stageAt(this.run);
      if (!text.trim()) throw new Error('本轮回答为空，不能进入下一步。');
      if (stage === 'final' && !C.extractFinal(text)) throw new Error('最终答案标记后没有内容，请补全后再继续。');
      this.run.outputs[stage] = text;
      this.run.turns.push(text);
      this.log(C.labels[stage] + '完成，已保存。');
      this.run.stageIndex++; this.run.pending = null; this.observation = null;
      if (stage === 'final') {
        this.run.finalOut = C.extractFinal(text); this.run.status = 'done';
        this.log('全部完成，可以复制右侧最终结果。');
      }
      await this.save();
      if (stage === 'final' && this.io.close) {
        const ids = [...new Set(Object.values(this.run.tabs).map(tab => tab.id))];
        await Promise.allSettled(ids.map(async id => this.io.close(id)));
      }
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
        for (const role of [...new Set(this.run.route)]) {
          if (!this.active()) return;
          if (!this.run.tabs[role]) {
            const id = await this.io.create(this.run[role]);
            this.run.tabs[role] = {id, url: C.providers[this.run[role]].url};
            this.log('已打开 ' + C.providers[this.run[role]].name + ' 的独立任务页面。');
            await this.save();
          }
        }
        if (!this.active()) return;
        const stage = C.stageAt(this.run);
        const role = this.run.route[this.run.stageIndex];
        const tab = this.run.tabs[role];
        // Return to the first model after all task pages have opened.
        if (this.run.stageIndex === 0 && !this.run.pending) {
          await this.io.activate(tab.id);
          for (const r of [...new Set(this.run.route)]) {
            if (!this.active()) return;
            const s = await this.io.snapshot(this.run.tabs[r].id, this.run[r]);
            if (!s.input) throw new Error(C.providers[this.run[r]].name + ' 未找到输入框，请在任务页面完成登录后点击继续。');
            if (s.busy || s.inputOccupied) throw new Error(C.providers[this.run[r]].name + ' 页面有未完成的生成或输入，请先检查。');
          }
        }
        if (!this.active()) return;
        let snap = await this.io.snapshot(tab.id, this.run[role]);
        if (!C.allowedURL(this.run[role], snap.url)) throw new Error('任务页面已离开所选模型网站，请重新打开或手动补入结果。');
        if (!this.run.pending) await this.prepare();
        const p = this.run.pending;
        const piece = pieceAt(p);
        const currentMarker = piece.marker || p.marker;
        const waitingPart = !!piece.marker;
        const submitted = [...snap.answers, ...(snap.userMessages || [])].some(a => a.text.includes(currentMarker));
        if (p.phase === 'prepared' && (submitted || (p.draftRetained && !snap.inputOccupied))) {
          p.phase = waitingPart ? 'waitingPart' : 'waiting'; p.started = this.now();
          this.log('检测到本轮提示词已由用户发送，继续收取回答，不再重复发送。');
          await this.save();
        }
        if (p.phase === 'prepared') {
          if (!snap.input) throw new Error('未找到网页输入框，请完成登录后继续。');
          if (snap.busy) throw new Error('网页正在生成，请等待完成后继续。');
          const repairDraft = this.run[role] === 'kimi' && E.lostLineBreaks(snap.draft, piece.prompt, currentMarker);
          const attachedDraft = snap.attachments?.count > 0 && (!E.normalize(snap.draft) || samePrompt(snap.draft, p));
          if (snap.inputOccupied && !samePrompt(snap.draft, p) && !repairDraft && !attachedDraft) {
            throw new Error('网页输入框已有其他文字，请检查后清空输入框再继续。');
          }
          if (repairDraft) this.log('检测到旧版遗留的本轮草稿，将恢复换行并核对全文后发送。');
          else if (attachedDraft) this.log('检测到当前任务输入框中的附件，等待解析完成后发送。');
          else if (snap.inputOccupied) this.log('检测到当前步骤已填入的完整提示词，继续尝试发送。');
          await this.io.activate(tab.id);
          if (!this.active()) return;
          // Persist before sending so a lost response/reload cannot trigger a duplicate.
          p.phase = 'dispatching'; p.started = this.now();
          this.log('正在向 ' + C.providers[this.run[role]].name + ' 发送：' + C.labels[stage]);
          await this.save();
          if (!this.active()) {p.phase = 'prepared'; await this.save(); return;}
          let ack;
          try { ack = await this.io.send(tab.id, {...p, taskId:p.taskId + ':' + (p.partIndex || 0), prompt:piece.prompt, marker:currentMarker, runId: this.run.id,
            attachmentSignature:attachedDraft ? snap.attachments.signature : undefined}); }
          catch { throw new Error('发送状态未能确认。请检查任务网页；继续只会等待结果，不会重复点击发送。'); }
          if (!ack.ok) {
            if (ack.beforeClick || ack.retryableDraft) {
              p.phase = 'prepared'; p.draftRetained = !!(ack.draftRetained || ack.retryableDraft);
            }
            throw new Error(ack.error || '发送未完成，请检查任务页面。');
          }
          p.phase = waitingPart ? 'waitingPart' : 'waiting';
          if (ack.attachment) this.log('TXT / 文件附件已发送，网页已确认接收。');
          this.log(waitingPart ? `已发送材料第 ${p.partIndex + 1}/${p.parts.length} 段，等待确认。` : '已点击发送，等待完整回答。'); await this.save();
          return;
        }
        if (!this.active()) return;
        this.observation = C.observe(this.observation, snap, currentMarker, this.now(), waitingPart ? 1000 : 6000);
        if (this.observation.done) {
          if (waitingPart) {
            p.partIndex++; p.phase = 'prepared'; p.started = this.now(); p.draftRetained = false;
            this.observation = null;
            this.log(`材料第 ${p.partIndex}/${p.parts.length} 段已确认。`);
            await this.save(); return;
          }
          tab.url = snap.url; tab.previousMarker = p.marker;
          await this.complete(C.stripMarker(this.observation.text, p.marker));
        } else if (this.now() - p.started > this.run.timeout * 60000) {
          throw new Error('等待超时，或网页没有输出结束标记。请检查网页；可以继续等待，也可以粘贴完整回答后接着运行。');
        } else await this.save();
      } catch (e) {
        if (this.run && this.active()) await this.pause(e.message);
        else if (this.run) await this.save();
      } finally { this.locked = false; }
    }
  }
  root.RelayEngine = RelayEngine;
  if (typeof module !== 'undefined') module.exports = RelayEngine;
})(globalThis);
