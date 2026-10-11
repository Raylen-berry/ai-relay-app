importScripts('native-bridge.js');
'use strict';
// The long-running flow belongs to the visible app, not an ephemeral MV3 worker.
chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'}).catch(console.error);
let opening = Promise.resolve();
async function openApp(sourceId) {
  const url = chrome.runtime.getURL('app.html');
  let source;
  if(Number.isInteger(sourceId)) {
    source=await chrome.tabs.get(sourceId);
    if(source.url!==chrome.runtime.getURL('open.html'))throw new Error('启动页面无效。');
  }
  const windows = await chrome.windows.getAll({populate: true});
  for (const win of windows) {
    const tab = win.tabs?.find(t => t.url?.split(/[?#]/)[0] === url);
    if (tab) {
      try {
        await chrome.tabs.update(tab.id, {active: true});
        await chrome.windows.update(win.id, {focused: true, ...(win.state==='minimized'?{state:'normal'}:{})});
      } catch {continue;} // A window closed while this launch was being handled.
      if(source)await chrome.tabs.remove(source.id);
      return {ok:true,reused:true};
    }
  }
  if(source)await chrome.tabs.update(source.id,{url});
  else await chrome.windows.create({url, type: 'popup', width: 1220, height: 860});
  return {ok:true,reused:false};
}
function launch(id) {const result=opening.catch(()=>{}).then(()=>openApp(id));opening=result;return result;}
chrome.action.onClicked.addListener(() => launch().catch(console.error));
let notificationsBound = false;
function bindNotifications() {
  if (notificationsBound || !chrome.notifications?.onClicked) return;
  notificationsBound = true;
  chrome.notifications.onClicked.addListener(id => {
    if (id.startsWith('relay-')) launch().catch(console.error);
  });
}
bindNotifications();
chrome.permissions?.onAdded?.addListener(bindNotifications);
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  if(sender.id!==chrome.runtime.id || sender.url!==chrome.runtime.getURL('open.html') || msg?.type!=='RELAY_OPEN_APP')return;
  launch(msg.tabId).then(reply).catch(e=>reply({ok:false,error:e.message}));return true;
});
