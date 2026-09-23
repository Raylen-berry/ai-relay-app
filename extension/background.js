'use strict';
// The long-running flow belongs to the visible app, not an ephemeral MV3 worker.
chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'}).catch(console.error);
async function openApp() {
  const url = chrome.runtime.getURL('app.html');
  const windows = await chrome.windows.getAll({populate: true});
  for (const win of windows) {
    const tab = win.tabs?.find(t => t.url === url);
    if (tab) {
      await chrome.windows.update(win.id, {focused: true});
      await chrome.tabs.update(tab.id, {active: true});
      return;
    }
  }
  await chrome.windows.create({url, type: 'popup', width: 1220, height: 860});
}
chrome.action.onClicked.addListener(() => openApp().catch(console.error));
