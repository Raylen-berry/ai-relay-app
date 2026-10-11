(function(root){
  'use strict';
  const specialties={general:'综合审核',facts:'事实与证据',logic:'逻辑与遗漏',style:'表达与可读性',opposition:'反方检验'};
  const instructions={facts:'重点检查事实、数字、时间和证据。区分已知事实、推断与无法核验的说法；不要编造来源。',logic:'重点检查推理链条、前提、遗漏、边界条件和可执行性，给出具体反例或修正建议。',style:'重点检查表达、结构和可读性，删去空话、套话与重复，保留原意和必要细节。',opposition:'从反方角度寻找最有力的反例与替代解释。说明异议成立的条件，不为反对而反对。'};
  function roles(value){const out={};for(const [k,v] of Object.entries(value||{}))if(/^[2-8]$/.test(k)&&Object.hasOwn(specialties,v))out[k]=v;return out;}
  function tags(value){return [...new Set(String(value||'').split(/[,，]/).map(s=>s.trim().slice(0,24)).filter(Boolean))].slice(0,8);}
  function compare(before,after){
    const a=String(before||'').split('\n'),b=String(after||'').split('\n');
    if(a.length*b.length>350000||a.length+b.length>2500)return {large:true,rows:[],before:a,after:b};
    const dp=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
    for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
    let i=0,j=0;const rows=[];
    while(i<a.length||j<b.length){if(i<a.length&&j<b.length&&a[i]===b[j]){rows.push({kind:'same',text:a[i++]});j++;}else if(j<b.length&&(i===a.length||dp[i][j+1]>=dp[i+1][j]))rows.push({kind:'add',text:b[j++]});else rows.push({kind:'remove',text:a[i++]});}
    return {large:false,rows};
  }
  function sources(turns,names=[]){
    const out=new Map();(turns||[]).forEach((text,i)=>{
      for(const match of String(text).matchAll(/https?:\/\/[^\s<>"\u3000【】]+/g)){
        const raw=match[0].replace(/[)\]）。，；、.!?]+$/g,'');
        try{const u=new URL(raw);if(u.username||u.password)continue;const url=u.href;const item=out.get(url)||{url,rounds:[],names:[]};if(!item.rounds.includes(i+1))item.rounds.push(i+1);if(names[i]&&!item.names.includes(names[i]))item.names.push(names[i]);out.set(url,item);}catch{}
      }
    });return [...out.values()].slice(0,100);
  }
  function issues(turns){
    const out=[];(turns||[]).slice(1,-1).forEach((text,index)=>{
      const lines=String(text).split('\n');let inCode=false;
      for(let line of lines){if(/^\s*```/.test(line)){inCode=!inCode;continue;}if(inCode)continue;
        line=line.replace(/^\s*(?:[-*+]|\d+[.、)])\s*/, '').trim();
        if(line.length>=8&&line.length<=900&&/(\[(?:高|中|低)\]|待(?:核验|确认|解决)|无法(?:验证|核实)|证据不足|存在争议|必须修正|不确定)/.test(line))out.push({id:`${index+2}:${line}`,round:index+2,text:line});
      }
    });return out.slice(0,100);
  }
  function snapshot(run,providers){
    const safe={};for(const k of ['id','q','primary','reviewer','third','sequence','timeout','templates','reviewRoles','outputs','turns','finalOut','status','created','timing','route','apiAttempts','partialAnswer'])if(run[k]!==undefined)safe[k]=structuredClone(run[k]);
    if(root.RelayWorkflowData){const metadata=root.RelayWorkflowData.meta(run.workflow);if(metadata)safe.workflow=metadata;}
    if(run.delivery)safe.delivery=root.RelayDeliveryData.settings(run.delivery);
    safe.attachments=(run.attachments||[]).map(({name,size,type})=>({name,size,type}));
    safe.names=(run.route||[]).map(role=>providers[run[role]]?.name||run[role]);return safe;
  }
  const api={specialties,instructions,roles,tags,compare,sources,issues,snapshot};root.RelayWorkspaceData=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
