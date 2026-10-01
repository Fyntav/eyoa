// The side panel is opened per tab: it appears only in the tab where the
// user clicked the icon, and the assistant works only in that tab.
function disableGlobalPanel() {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  chrome.sidePanel.setOptions({ enabled: false }).catch(() => {});
}
chrome.runtime.onInstalled.addListener(disableGlobalPanel);
chrome.runtime.onStartup.addListener(disableGlobalPanel);
disableGlobalPanel();

const panelTabs = new Set();

chrome.action.onClicked.addListener((tab) => {
  if (!tab || tab.id == null) return;
  // No "await": Chrome requires the panel to be opened in the same click gesture.
  if (!panelTabs.has(tab.id)) {
    chrome.sidePanel.setOptions({ tabId: tab.id, path: `panel.html?tabId=${tab.id}`, enabled: true });
    panelTabs.add(tab.id);
  }
  chrome.sidePanel.open({ tabId: tab.id }).catch(console.error);
});

chrome.tabs.onRemoved.addListener((tabId) => panelTabs.delete(tabId));
