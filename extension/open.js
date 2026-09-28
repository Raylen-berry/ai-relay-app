'use strict';
async function openWorkbench() {
  const retry=document.getElementById('retryOpen');retry.hidden=true;
  try {
    const tab=await chrome.tabs.getCurrent();
    const result=await chrome.runtime.sendMessage({type:'RELAY_OPEN_APP',tabId:tab.id});
    if(!result?.ok)throw new Error(result?.error||'启动未完成。');
  } catch(e) {
    document.getElementById('opening').textContent='未能打开工作台：'+e.message+'。请确认扩展已重新加载。';retry.hidden=false;
  }
}
document.getElementById('retryOpen').addEventListener('click',openWorkbench);
openWorkbench();
