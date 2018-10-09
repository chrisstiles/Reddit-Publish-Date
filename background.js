var cachedDates = {};
function loadCachedDates(tabId) {
  chrome.storage.local.get('publishDates', ({ publishDates: dates }) => {
    chrome.tabs.sendMessage(tabId, 'cache-loaded');
    if (dates) {
      try {
        cachedDates = JSON.parse(dates);
      } catch {
        console.log('Error parsing JSON');
      }
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { postId, url, loadCache } = request;
  if (loadCache) {
    loadCachedDates(sender.tab.id);
    return;
  } 

  getArticleDate(postId, url, sender.tab.id);

  // Close message channel
  sendResponse();
});

function getArticleDate(postId, url, tabId) {
  // First check if we have this post cached
  if (cachedDates.hasOwnProperty(postId)) {
    sendDateMessage(tabId, postId, cachedDates[postId]);
    return;
  }

  getArticleHtml(url).then(article => {
    const date = getDateFromHTML(article);

    // Publish date was successfully found, send to client script
    if (date) {
      const formattedDate = formatDate(date);
      sendDateMessage(tabId, postId, formattedDate);

      // Save cached date 
      cachePublishDates(postId, formattedDate);
    }
  });
}

// Send date back to client script
function sendDateMessage(tabId, postId, date) {
  chrome.tabs.sendMessage(tabId, { postId, date });
}

// Get all the HTML from the article page
const headers = new Headers();
headers.append('Content-Type', 'text/html');
headers.append('X-Requested-With', 'XmlHttpRequest');

function getArticleHtml(url) {
  url = 'https://cors-anywhere.herokuapp.com/' + url;
  const request = new Request(url, { headers, method: 'GET', cache: 'reload' });

  return fetch(request)
    .then(response => {
      return response.text();
    })
    .then(html => {
      const htmlDocument = document.implementation.createHTMLDocument('parser');
      const article = htmlDocument.createElement('div');
      article.innerHTML = html;

      return article;
    });
}

function getDateFromHTML(article) {
  var publishDate = null;
  
  // Some websites include linked data with information about the article
  var linkedData = article.querySelector('script[type="application/ld+json"]');

  if (linkedData) {
    try {
      linkedData = JSON.parse(linkedData.innerHTML);
      publishDate = linkedData.datePublished || linkedData.dateCreated;
      
      if (publishDate) {
        return publishDate;
      }
    } catch {
      // The website has invalid JSON, attempt 
      // to get the date with Regex
      const dateTest = /(?<=datePublished":\s*")(\S+)(?=\s*",)/;

      publishDate = linkedData.innerHTML.match(dateTest);

      if (publishDate && publishDate.length) {
        return publishDate[0];
      }
    }
  }

  return publishDate;
}

function formatDate(date) {
  return (new Date(date)).strftime('%x');
}

// Cache list of saved posts. We use a timer
// to ensure we don't repeatedly 
var cacheTimer;
function cachePublishDates(postId, date) {
  cachedDates[postId] = date;
  // console.log(cachedDates)
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    const obj = { publishDates: JSON.stringify(cachedDates) };
    chrome.storage.local.set(obj);
  }, 2000);
}