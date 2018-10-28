var cachedDates = {};
function loadCachedDates(tabId) {
  chrome.storage.local.get('publishDates', ({ publishDates: dates }) => {
    chrome.tabs.sendMessage(tabId, 'cache-loaded');
    if (dates) {
      try {
        cachedDates = JSON.parse(dates);
      } catch {
        cachedDates = {};
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
  const request = new Request(url, { headers, method: 'GET' });

  return fetch(request)
    .then(response => {
      return response.text();
    })
    .then(html => {
      const htmlDocument = document.implementation.createHTMLDocument('parser');
      const article = htmlDocument.createElement('div');
      // html = html.replace(/src/g, '_src');
      article.innerHTML = html.replace(/src/g, '_src');;

      return article;
    });
}

function getDateFromHTML(article) {
  var publishDate = null;
  
  // Some websites include linked data with information about the article
  publishDate = checkLinkedData(article);

  // Next try searching for metadata
  if (!publishDate) {
    publishDate = checkMetaData(article);
  }

  // Try checking item props and CSS selectors
  if (!publishDate) {
    publishDate = checkSelectors(article);
  }

  return publishDate;
}

function checkLinkedData(article) {
  var linkedData = article.querySelectorAll('script[type="application/ld+json"]');

  if (linkedData && linkedData.length) {
    const possibleKeys = ['datePublished', 'dateCreated', 'published'];

    // Some sites have more than one script tag with linked data
    for (let node of linkedData) {
      try {
        let data = JSON.parse(node.innerHTML);

        for (let key of possibleKeys) {
          if (data[key]) {
            return data[key];
          }
        }

      } catch {
        // The website has invalid JSON, attempt 
        // to get the date with Regex
        for (let key of possibleKeys) {
          var dateTest = new RegExp(`/(?<=${key}":\s*")(\S+)(?=\s*",)/`);
          publishDate = node.innerHTML.match(dateTest);

          if (publishDate && publishDate.length) {
            return publishDate[0];
          }
        }
      }
    }
  }

  return null;
}

function checkMetaData(article) {
  const possibleProperties = [
    'article:published_time', 'article:published', 'pubdate', 'publishdate',
    'timestamp', 'DC.date.issued', 'bt:pubDate', 'sailthru.date', 
    'article.published', 'published-date', 'article.created', 'date_published', 'cxenseparse:recs:publishtime', 'article_date_original', 'cXenseParse:recs:publishtime', 
    'DATE_PUBLISHED', 'datePublished'
  ];

  const metaData = article.querySelectorAll('meta');

  for (let meta of metaData) {
    let property = meta.getAttribute('name') || meta.getAttribute('property') || meta.getAttribute('itemprop');

    if (property && possibleProperties.includes(property)) {
      return meta.getAttribute('content');
    }
  }

  return null;
}

function checkSelectors(article) {
  const possibleSelectors = [
    'datePublished', 'pubdate', 'timestamp', 'post__date', 'Article__Date'
  ];

  for (let selector of possibleSelectors) {
    let selectorString = `[itemprop="${selector}"], .${selector}, #${selector}`;
    let elements = article.querySelectorAll(selectorString);
    
    // Loop through elements to see if one is a date
    if (elements && elements.length) {
      for (let element of elements) {
        let datetime = element.getAttribute('datetime');
        if (datetime) {
          return datetime;
        }

        if (isValidDate(element.innerHTML)) {
          return element.innerHTML;
        }
      }
    }
  }

  return null;
}

function isValidDate(date) {
  date = Date.parse(date);

  if (!isNaN(date)) {
    return true;
  } else {
    return false;
  }
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