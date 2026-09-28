(function(root) {
  'use strict';
  const limits = {count:10, file:20*1024*1024, total:50*1024*1024};
  function validate(files) {
    if (files.length > limits.count) throw new Error('一次最多添加 10 个附件。');
    if (files.some(f => !f.name || !Number.isInteger(f.size) || f.size < 1 || f.size > limits.file)) throw new Error('附件不能为空，每个文件最多 20 MB。');
    if (files.reduce((n,f)=>n+f.size,0) > limits.total) throw new Error('本次附件总大小最多 50 MB。');
    if(new Set(files.map(f=>f.name.normalize('NFC'))).size!==files.length)throw new Error('附件名称不能重复，请先重命名同名文件。');
  }
  let opening;
  function db() {
    return opening ||= new Promise((resolve,reject) => {
      const request = indexedDB.open('ai-relay-files',1);
      request.onupgradeneeded = () => request.result.createObjectStore('files',{keyPath:'id'});
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {opening=null;reject(new Error('本地附件存储无法打开。'));};
    });
  }
  async function transaction(mode, action) {
    const database=await db();
    return new Promise((resolve,reject) => {
      const tx=database.transaction('files',mode);let result;
      tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error || new Error('附件保存失败，请检查磁盘空间。'));
      action(tx.objectStore('files'),value=>{result=value;});
    });
  }
  async function add(files) {
    validate(files);
    const rows=files.map(blob=>({id:crypto.randomUUID(),name:blob.name,type:blob.type,size:blob.size,lastModified:blob.lastModified,blob}));
    await transaction('readwrite',store=>rows.forEach(row=>store.put(row)));
    return rows.map(({blob,...meta})=>meta);
  }
  async function get(meta) {
    const row=await transaction('readonly',(store,done)=>{store.get(meta.id).onsuccess=ev=>done(ev.target.result);});
    if (!row?.blob || row.size !== meta.size || row.name !== meta.name) throw new Error('本地附件丢失：'+meta.name+'。请重新选择附件并开始新任务。');
    return row.blob;
  }
  async function retain(ids) {
    const keep=new Set(ids);
    await transaction('readwrite',store=>{store.openCursor().onsuccess=ev=>{const c=ev.target.result;if(c){if(!keep.has(c.key))c.delete();c.continue();}};});
  }
  async function upload(send, files, batchId, runId, recovery, active) {
    validate(files);
    const call=async msg=>{
      if (!active()) throw new Error('已停止准备附件。');
      const result=await send({runId,batchId,...msg});
      if (!result?.ok) throw new Error(result?.error || '附件传输未确认，请检查模型网页。');
      return result;
    };
    // BEGIN is observational on recovery: an uncertain upload is never repeated.
    let injected=false;
    try {
      const started=await call({type:'RELAY_FILES_BEGIN',files,recovery});
      if (started.signature) return started;
      for (let index=0;index<files.length;index++) {
        const blob=await get(files[index]);
        for (let offset=0;offset<blob.size;offset+=192*1024) {
          const bytes=new Uint8Array(await blob.slice(offset,offset+192*1024).arrayBuffer());
          let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
          await call({type:'RELAY_FILES_CHUNK',index,offset,data:btoa(binary)});
        }
      }
      if (!active()) throw new Error('已停止准备附件。');
      injected=true;
      return await call({type:'RELAY_FILES_COMMIT'});
    } catch(e) {e.uploadUncertain=injected || recovery;throw e;}
  }
  root.RelayFiles={limits,validate,add,get,retain,upload};
  if(typeof module!=='undefined')module.exports=root.RelayFiles;
})(globalThis);
