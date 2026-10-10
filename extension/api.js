(function(root){
  'use strict';
  function endpoint(value){
    let u;try{u=new URL(String(value).trim());}catch{throw new Error('请填写完整的接口地址。');}
    if(u.username||u.password||u.search||u.hash)throw new Error('接口地址不能包含密码、查询参数或片段。');
    if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw new Error('请使用 HTTPS；本机服务可使用 localhost 或 127.0.0.1 的 HTTP 地址。');
    const path=u.pathname.replace(/\/+$/,'');u.pathname=path.endsWith('/chat/completions')?path:path+'/chat/completions';return u.href;
  }
  function profile(raw){
    const p={id:raw.id,name:String(raw.name||'自定义 API').trim().slice(0,60),url:endpoint(raw.url),model:String(raw.model||'').trim(),kind:'api',service:raw.service==='deepseek'?'deepseek':'custom'};
    if(!/^api:[a-zA-Z0-9-]+$/.test(p.id)||!p.model||p.model.length>120)throw new Error('请填写模型名称。');p.hosts=[new URL(p.url).hostname];return p;
  }
  async function request(p,key,messages,{fetcher=fetch,timeout=900000}={}){
    if(!key?.trim())throw new Error('请在 API 设置中填写 Key。');
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeout);
    try{
      const body={model:p.model,messages,stream:false};if(p.service==='deepseek')body.thinking={type:'disabled'};
      const response=await fetcher(endpoint(p.url),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key.trim()},body:JSON.stringify(body),signal:abort.signal,credentials:'omit',redirect:'error'});
      if(!response.ok){const err=new Error({401:'API Key 无效或已失效。',403:'API 拒绝访问，请检查权限。',402:'API 余额不足。',429:'API 请求过于频繁或额度不足，请稍后手动继续。'}[response.status]||`API 返回 HTTP ${response.status}。请检查接口与模型设置。`);err.confirmedRejected=true;throw err;}
      let data;try{data=await response.json();}catch{throw new Error('API 返回了无法解析的内容。请检查服务端；本次请求不会自动重发。');}
      const message=data.choices?.[0]?.message;
      if(typeof message?.content!=='string'||!message.content.trim())throw new Error('API 没有返回可用的回答。本次请求不会自动重发。');
      return {message:{role:'assistant',content:message.content,...(typeof message.reasoning_content==='string'?{reasoning_content:message.reasoning_content}:{})},usage:data.usage?{prompt_tokens:Number(data.usage.prompt_tokens)||0,completion_tokens:Number(data.usage.completion_tokens)||0}:null};
    }catch(e){if(e.confirmedRejected)throw e;if(e.name==='AbortError')throw new Error('API 请求等待超时。服务端可能仍在处理，请检查后手动补入回答；不会自动重发。');if(/^API /.test(e.message))throw e;throw new Error('API 网络连接中断。本次发送状态无法确认，请手动处理；不会自动重发。');}finally{clearTimeout(timer);}
  }
  function transport({providers,getKey,save,threads={}}){
    const live=new Set();
    const is=id=>typeof id==='string'&&id.startsWith('api-tab:');
    return {is,threads,
      async create(provider){const id='api-tab:'+crypto.randomUUID();threads[id]={provider,messages:[],requests:{}};await save();return id;},
      async activate(){},async close(){},async cancel(){},async resume(){},
      async snapshot(id){const t=threads[id];if(!t)throw new Error('API 会话记录缺失，请手动补入回答或开始新任务。');
        for(const r of Object.values(t.requests))if(r.status==='sending'&&!live.has(r.id))throw new Error('API 请求曾中断，发送状态无法确认。请手动补入本轮回答；不会自动重发。');
        const failed=Object.values(t.requests).findLast(r=>r.status==='uncertain');if(failed)throw new Error(failed.error);
        return {ok:true,protocol:5,name:providers[t.provider]?.name,url:providers[t.provider]?.url,input:true,inputOccupied:false,busy:live.has(id),answers:t.messages.filter(m=>m.role==='assistant').map(m=>({text:m.content})),userMessages:t.messages.filter(m=>m.role==='user').map(m=>({text:m.content}))};},
      async send(id,msg){const t=threads[id],p=providers[t.provider];
        if(t.requests[msg.taskId])return {ok:t.requests[msg.taskId].status==='done',error:'这条 API 请求已尝试发送，请检查后手动处理。'};
        let key=await getKey(t.provider);if(!key?.trim())return {ok:false,beforeClick:true,error:'请在 API 设置中填写 Key，再继续本轮。'};
        const r=t.requests[msg.taskId]={id,status:'sending'};await save();live.add(id);
        try{const result=await request(p,key,[...t.messages,{role:'user',content:msg.prompt}]);t.messages.push({role:'user',content:msg.prompt},result.message);r.status='done';r.usage=result.usage;await save();return {ok:true};}
        catch(e){r.status=e.confirmedRejected?'rejected':'uncertain';r.error=e.message;if(e.confirmedRejected)delete t.requests[msg.taskId];await save();return {ok:false,beforeClick:!!e.confirmedRejected,error:e.message};}
        finally{key='';live.delete(id);}
      }
    };
  }
  const api={endpoint,profile,request,transport};root.RelayAPI=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
