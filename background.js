const pageLoadMessage = 'page-loaded';

chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId }) => {
  chrome.tabs.sendMessage(tabId, pageLoadMessage);
}, { url: [{ hostEquals: 'www.reddit.com' }] });

chrome.webNavigation.onCompleted.addListener(({ tabId }) => {
  chrome.tabs.sendMessage(tabId, pageLoadMessage);
}, { url: [{ hostEquals: 'www.reddit.com' }] });

chrome.webNavigation.onDOMContentLoaded.addListener(({ tabId }) => {
  chrome.tabs.sendMessage(tabId, pageLoadMessage);
}, { url: [{ hostEquals: 'old.reddit.com' }] });