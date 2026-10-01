// O painel lateral é aberto por aba: ele aparece somente na aba em que o
// usuário clicou no ícone, e o assistente trabalha apenas nessa aba.
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
  // Sem "await": o Chrome exige que o painel seja aberto no mesmo gesto do clique.
  if (!panelTabs.has(tab.id)) {
    chrome.sidePanel.setOptions({ tabId: tab.id, path: `panel.html?tabId=${tab.id}`, enabled: true });
    panelTabs.add(tab.id);
  }
  chrome.sidePanel.open({ tabId: tab.id }).catch(console.error);
});

chrome.tabs.onRemoved.addListener((tabId) => panelTabs.delete(tabId));
