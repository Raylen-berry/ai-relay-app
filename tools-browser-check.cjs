// Development-only real-browser checks for Blob/IndexedDB/chunk transport.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const script=`
document.querySelector('button').onclick=async()=>{
 const out=document.querySelector('pre');out.textContent='检查中…';
 const assert=(value,text)=>{if(!value)throw new Error(text);};
 try {
   const bytes=Uint8Array.from({length:520123},(_,i)=>i%251);
   const f=new File([bytes],'browser-check.png',{type:'image/png'});
   const meta=await RelayFiles.add([f]);
   assert((await RelayFiles.get(meta[0])).size===bytes.length,'Blob read');
   const read=new Uint8Array(await (await RelayFiles.get(meta[0])).arrayBuffer());
   assert(read.every((v,i)=>v===bytes[i]),'Blob byte integrity');
   let chunks=[],commits=0;
   const send=async m=>{if(m.type==='RELAY_FILES_CHUNK')chunks.push(m);if(m.type==='RELAY_FILES_COMMIT')commits++;return {ok:true, ...(m.type==='RELAY_FILES_COMMIT'?{signature:'ready'}:{})};};
   const r=await RelayFiles.upload(send,meta,'batch','run',false,()=>true);
   assert(r.signature==='ready'&&commits===1&&chunks.length===3,'chunk commit');
   let joined=new Uint8Array(bytes.length),offset=0;for(const c of chunks){assert(c.offset===offset,'chunk order');const b=Uint8Array.from(atob(c.data),x=>x.charCodeAt(0));joined.set(b,offset);offset+=b.length;}
   assert(joined.length===bytes.length&&joined.every((v,i)=>v===bytes[i]),'transport byte integrity');
   let calls=0;
   await RelayFiles.upload(async()=>{calls++;return {ok:true,signature:'existing'};},meta,'batch','run',true,()=>true);
   assert(calls===1,'recovery does not resend bytes');
   let active=true, cancelled=false,afterCancelCommit=0;
   try{await RelayFiles.upload(async m=>{if(m.type==='RELAY_FILES_CHUNK')active=false;if(m.type==='RELAY_FILES_COMMIT')afterCancelCommit++;return {ok:true};},meta,'cancel','run',false,()=>active);}catch(e){cancelled=true;assert(e.uploadUncertain===false,'cancel before injection is retryable');}
   assert(cancelled&&afterCancelCommit===0,'cancel prevents commit');
   await RelayFiles.retain(meta.map(f=>f.id));assert((await RelayFiles.get(meta[0])).size===bytes.length,'retained blob');
   await RelayFiles.retain([]);let missing=false;try{await RelayFiles.get(meta[0]);}catch{missing=true;}
   assert(missing,'pruned blob unavailable');
   out.textContent='PASS: Blob 保存/读取、逐字节一致、3 段传输、顺序、提交一次、恢复不重传、取消不上传、保留及清理均通过。';
 }catch(e){out.textContent='FAIL: '+e.stack;}
};`;
const page='<!doctype html><meta charset="utf-8"><title>Relay 本地附件检查</title><h1>本地附件与传输检查</h1><p>只在本机处理生成数据，不连接任何模型。</p><button>开始检查</button><pre>等待检查</pre><script src="/files.js"></script><script src="/check.js"></script>';
http.createServer((req,res)=>{
 const files={'/':page,'/check.js':script,'/files.js':fs.readFileSync(path.join(__dirname,'extension/files.js'),'utf8')};
 if(!(req.url in files)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',req.url==='/'?'text/html; charset=utf-8':'application/javascript; charset=utf-8');res.end(files[req.url]);
}).listen(8767,'127.0.0.1',()=>console.log('Browser checks http://127.0.0.1:8767'));
