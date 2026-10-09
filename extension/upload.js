(function(root) {
  'use strict';
  function create({input,attachments,busy,cancelled,sleep,adapter}) {
    const batches=new Map();
    const fail=error=>({ok:false,error});
    const normalized=s=>String(s||'').normalize('NFC').trim().replace(/\.[^.]+$/,ext=>ext.toLowerCase());
    function renamedBySite(name, actual) {
      if(adapter.name !== 'ChatGPT')return false;
      const dot=name.lastIndexOf('.'),base=dot<0?name:name.slice(0,dot),ext=dot<0?'':name.slice(dot);
      const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      return new RegExp('^'+escape(base)+' ?\\([1-9]\\d*\\)'+escape(ext)+'$').test(actual);
    }
    function matches(files, current, allowRenamed = false) {
      if(current.count!==files.length)return false;
      const names=[...(current.names||[])].map(normalized);
      return files.every(f=>{const expected=normalized(f.name);const at=names.findIndex(name=>name===expected || (allowRenamed && renamedBySite(expected,name)));if(at<0)return false;names.splice(at,1);return true;});
    }
    const signature=files=>JSON.stringify(files.map(f=>[f.id,f.name,f.size,f.type]));
    const accepts=(element,file)=>{
      const accept=element.getAttribute('accept');
      return !accept || accept.split(',').some(rule=>{
        rule=rule.trim().toLowerCase();
        return rule==='*/*' || (rule.startsWith('.') ? file.name.toLowerCase().endsWith(rule) :
          rule.endsWith('/*') ? file.type.startsWith(rule.slice(0,-1)) : file.type===rule);
      });
    };
    function fileInput(files) {
      const composer=input()?.closest(adapter.composer);
      // Only choose file controls belonging to the active composer.
      return [...(composer?.querySelectorAll('input[type="file"]')||[])].find(e=>!e.disabled && (files.length===1 || e.multiple) && files.every(f=>accepts(e,f)));
    }
    async function receive(msg) {
      if(cancelled.has(msg.runId))return fail('已停止准备附件。');
      if(msg.type==='RELAY_FILES_BEGIN') {
        const files=msg.files;
        if(!Array.isArray(files)||!files.length||files.length>10||files.some(f=>!f.id||!f.name||!Number.isInteger(f.size)||f.size<1||f.size>20*1024*1024)||files.reduce((n,f)=>n+f.size,0)>50*1024*1024)return fail('附件数量或大小不符合限制。');
        const current=attachments();
        let batch=batches.get(msg.batchId);
        if(batch && batch.key!==signature(files))return fail('附件内容发生变化，请开始新任务。');
        if(!current.pending && matches(files,current,batch?.state==='attached' || batch?.state==='attaching')) {
          batches.set(msg.batchId,{runId:msg.runId,key:signature(files),files,state:'attached'});
          return {ok:true,signature:current.signature};
        }
        if(batch?.state==='attached')return fail('已准备的附件发生变化，请手动检查；不会重复上传。');
        if(msg.recovery && batch?.state!=='buffering')return fail('上次上传状态不明确。请在此模型页面手动补齐原附件，再点继续；不会重复上传。');
        if(!input()||busy()||current.count||RelayEditor.normalize(RelayEditor.read(input())))return fail('当前网页有草稿、附件或正在生成，请检查后继续。');
        if(!fileInput(files))return fail('网页没有可用的附件入口，或不支持本次文件类型/数量。可手动上传后继续。');
        // Drop completed byte buffers; the website owns attached files now.
        for(const [id,item]of batches)if(item.state==='buffering'&&id!==msg.batchId)batches.delete(id);
        batches.set(msg.batchId,{runId:msg.runId,key:signature(files),files,state:'buffering',bytes:files.map(()=>[]),received:files.map(()=>0)});
        return {ok:true};
      }
      const batch=batches.get(msg.batchId);
      if(!batch||batch.runId!==msg.runId)return fail('附件传输会话已失效，请检查网页后继续。');
      if(msg.type==='RELAY_FILES_CHUNK') {
        const i=msg.index;
        if(batch.state!=='buffering'||!Number.isInteger(i)||!batch.files[i]||msg.offset!==batch.received[i]||typeof msg.data!=='string'||msg.data.length>262144)return fail('附件分片不完整，请重新准备。');
        const text=atob(msg.data),bytes=Uint8Array.from(text,c=>c.charCodeAt(0));
        if(batch.received[i]+bytes.length>batch.files[i].size)return fail('附件分片超出文件大小。');
        batch.bytes[i].push(bytes);batch.received[i]+=bytes.length;return {ok:true};
      }
      if(msg.type==='RELAY_FILES_COMMIT') {
        if(batch.state==='attached' && matches(batch.files,attachments(),true))return {ok:true,signature:attachments().signature};
        if(batch.state!=='buffering'||batch.files.some((f,i)=>batch.received[i]!==f.size))return fail('附件未传输完整，未上传。');
        const target=fileInput(batch.files);
        if(!target||busy()||attachments().count||RelayEditor.normalize(RelayEditor.read(input())))return fail('上传前网页内容发生变化，已停止。');
        const data=new DataTransfer();
        batch.files.forEach((f,i)=>data.items.add(new File(batch.bytes[i],f.name,{type:f.type,lastModified:f.lastModified})));
        batch.state='attaching';delete batch.bytes;delete batch.received;
        target.files=data.files;
        target.dispatchEvent(new Event('change',{bubbles:true}));
        let readySignature = null, stable = 0;
        for(let i=0;i<240;i++) {
          if(cancelled.has(msg.runId))return fail('已停止；网页可能保留附件。');
          const current=attachments();
          if(current.failed)return fail('附件上传失败，请在模型页面检查。');
          if(!current.pending && matches(batch.files,current,true)) {
            stable = readySignature === current.signature ? stable + 1 : 0;
            readySignature = current.signature;
            if(stable>=8){batch.state='attached';return {ok:true,signature:current.signature};}
          } else {readySignature = null;stable = 0;}
          await sleep(250);
        }
        return fail('网页没有确认全部附件。请检查或手动补齐附件后继续。');
      }
      return fail('未知附件操作。');
    }
    return {receive};
  }
  root.RelayUpload={create};
})(globalThis);
