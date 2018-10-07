function sendLoadMessage(tabId) {
  chrome.tabs.sendMessage(tabId, 'page-loaded');
}

chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId }) => {
  sendLoadMessage(tabId);
  console.log('here')
}, { url: [{ hostEquals: 'www.reddit.com' }] });

chrome.webNavigation.onCompleted.addListener(({ tabId }) => {
  sendLoadMessage(tabId);
  console.log('here')
}, { url: [{ hostEquals: 'www.reddit.com' }] });

chrome.webNavigation.onDOMContentLoaded.addListener(({ tabId }) => {
  sendLoadMessage(tabId);
  console.log('here')
}, { url: [{ hostEquals: 'old.reddit.com' }] });