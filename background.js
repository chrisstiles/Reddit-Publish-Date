// chrome.storage.local.clear(function () {
//   var error = chrome.runtime.lastError;
//   if (error) {
//     console.error(error);
//   }
// });

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

chrome.runtime.onMessage.addListener((request, sender) => {
  const { postId, url, loadCache } = request;

  if (loadCache) {
    loadCachedDates(sender.tab.id);
    return;
  } 

  getArticleDate(postId, url, sender.tab.id);
});

function getArticleDate(postId, url, tabId) {
  // First check if we have this post cached
  if (cachedDates.hasOwnProperty(postId)) {
    sendDateMessage(tabId, postId, cachedDates[postId]);
    return;
  }

  getArticleHtml(url).then(html => {
    if (!html) return;

    const date = getDateFromHTML(html);

    if (!date) return;

    // Publish date was successfully found, send to client script and cache
    sendDateMessage(tabId, postId, date);
    cachePublishDates(postId, date);
  });
}

// Send date back to client script
function sendDateMessage(tabId, postId, date) {
  chrome.tabs.sendMessage(tabId, { postId, date });
}

// Get all the HTML from the article page
const headers = new Headers();
headers.append('Content-Type', 'text/html');
headers.append('X-XSS-Protection', '1; mode=block');
// TODO Remove no cache headers
// headers.append('pragma', 'no-cache');
// headers.append('cache-control', 'no-cache');
// headers.append('X-Requested-With', 'XmlHttpRequest');

function getArticleHtml(url) {
  // url = 'https://cors-anywhere.herokuapp.com/' + url;
  const request = new Request(url, { headers, method: 'GET', redirect: 'follow' });
  // console.log(url)
  return fetch(request)
    .then(response => {
      // console.log(response.headers)
      // const json = response.json();
      // console.log(json)
      // console.log(response)
      return response.text();
    })
    .then(html => {
      // console.log(html);

      // console.log(JSON.parse(html))
      // html = html.replace(/script|link|img|src|href|rel/g, 'disabled_$&');
      // console.log(html)
      // // html = html
      // if (html.includes('mux.js')) 
      //   window.test = html;
      // }
      
      // html = html.replace(/script/g, 'meta');
      // console.log(html)
      // article.innerHTML = html.replace(/src/g, '_src');

      return html;

      

      // if ()

      // const parser = new DOMParser();
      // const doc = parser.parseFromString(html, 'text/html');
      // return doc;
    }).catch(error => {
      console.log(error)
    });
}

function getDateFromHTML(html) {
  var publishDate = null;

  // Try searching from just the HTML string first
  publishDate = checkHTMLString(html);
  if (publishDate) return publishDate;

  // Parse HTML document to search
  const htmlDocument = document.implementation.createHTMLDocument('parser');
  const article = htmlDocument.createElement('div');
  article.innerHTML = html;
  
  // Some websites include linked data with information about the article
  publishDate = checkLinkedData(article);

  // Next try searching for metadata
  if (!publishDate) publishDate = checkMetaData(article);

  // Try checking item props and CSS selectors
  if (!publishDate) publishDate = checkSelectors(article);

  return publishDate;
}

window.getDate = function(url) {
  getArticleHtml(url).then(article => {
    const date = getDateFromHTML(article);
    console.log(date, formatDate(date));
  });
}
const possibleKeys = ['datePublished', 'dateCreated', 'published', 'uploadDate', 'date', 'publishedDate'];

function checkHTMLString(html) {
  const keys = possibleKeys.join('|');
  //("|'|\s)(publishedDate)("|')\s*:\s*("|')([A-Za-z0-9\-\_\:]+)("|')
}

function checkLinkedData(article) {
  // console.log('checkLinkedData()')
  var linkedData = article.querySelectorAll('script[type="application/ld+json"]');
  // console.log(article)
  if (linkedData && linkedData.length) {
    // Some sites have more than one script tag with linked data
    for (let node of linkedData) {
      try {
        let data = JSON.parse(node.innerHTML);

        for (let key of possibleKeys) {
          if (data[key]) {
            let date = formatDate(data[key]);
            if (date) return date;
          }
        }

      } catch {
        // The website has invalid JSON, attempt 
        // to get the date with Regex
        for (let key of possibleKeys) {
          var dateTest = new RegExp(`/(?<=${key}":\s*")(\S+)(?=\s*",)/`);
          publishDate = node.innerHTML.match(dateTest);

          if (publishDate) {
            let date = formatDate(publishDate[0]);
            if (date) return date;
          }
        }
      }
    }
  }

  return null;
}

function checkMetaData(article) {
  // console.log('checkMetaData()')
  const possibleProperties = [
    'datePublished', 'article:published_time', 'article:published', 'pubdate', 'publishdate',
    'timestamp', 'date', 'DC.date.issued', 'bt:pubDate', 'sailthru.date', 
    'article.published', 'published-date', 'article.created', 'date_published', 
    'cxenseparse:recs:publishtime', 'article_date_original', 'cXenseParse:recs:publishtime', 
    'DATE_PUBLISHED', 'shareaholic:article_published_time', 'parsely-pub-date', 'twt-published-at'
  ];

  const metaData = article.querySelectorAll('meta');

  for (let meta of metaData) {
    let property = meta.getAttribute('name') || meta.getAttribute('property') || meta.getAttribute('itemprop');

    if (property && possibleProperties.includes(property)) {
      let date = formatDate(meta.getAttribute('content'));
      if (date) return date;
    }
  }

  return null;
}

function checkSelectors(article) {
  // console.log('checkSelectors()')
  const possibleSelectors = [
    'datePublished', 'pubdate', 'timestamp', 'post__date', 'date', 'Article__Date', 'pb-timestamp', 
    'lastupdatedtime', 'article__meta', 'post-time', 'video-player__metric', 'Timestamp-time', 'report-writer-date'
  ];

  for (let selector of possibleSelectors) {
    let selectorString = `[itemprop="${selector}"], .${selector}, #${selector}`;
    let elements = article.querySelectorAll(selectorString);
    
    // Loop through elements to see if one is a date
    if (elements && elements.length) {
      for (let element of elements) {
        if (!element) {
          console.log(element, elements, selector)
          console.log(article)
          return;
        }

        let dateString;
        let dateAttribute = element.getAttribute('datetime') || element.getAttribute('content');

        if (dateAttribute) {
          let date = formatDate(dateAttribute);
          if (date) return date;
        }

        // Check for formatted date inside html
        dateString = element.innerHTML.match(/\d{1,2}\/\d{1,2}\/\d{1,2}|\d{1,4}-\d{1,2}-\d{1,4}/);
        if (dateString) {
          let date = formatDate(dateString[0]);
          if (date) return date;
        }

        // Try to parse out the date from the rest of the text
        dateString = element.innerHTML
          .replace(/at|on|,/g, '')
          .replace(/(\d{4}).*/, '$1')
          .replace(/([0-9]st|nd|th)/g, '')
          .replace(/.*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i, '')
          .trim();

        let date = formatDate(dateString);
        if (date) return date;
      }
    }
  }

  return null;
}

function formatDate(dateString) {
  if (!dateString) return null;

  var date = moment(dateString);
  const format = 'M/D/YY';

  if (date.isValid()) {
    return date.format(format);
  }

  // Try to account for strangly formatted dates
  dateString = dateString.toLowerCase();
  const timezones = ['est', 'cst', 'mst', 'pst', 'edt', 'cdt', 'mdt', 'pdt'];

  for (let timezone of timezones) {
    if (dateString.includes(timezone)) {
      date = moment(dateString.substring(0, dateString.indexOf(timezone)));
      if (date.isValid()) {
        return date.format(format);
      }

      break;
    }
  }

  // Some invalid date strings include the date without formatting
  var dateNumbers = dateString.match(/\d{8}/);

  if (dateNumbers) {
    dateNumbers = dateNumbers[0].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
    date = moment(dateNumbers);
    if (date.isValid()) {
      return date.format(format);
    }
  }

  // Could not parse date from string
  return null;
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

moment.suppressDeprecationWarnings = true;