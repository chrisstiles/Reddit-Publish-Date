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

  getArticleHtml(url).then(article => {
    const date = getDateFromHTML(article);

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
  const request = new Request(url, { headers, method: 'GET' });
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
      const htmlDocument = document.implementation.createHTMLDocument('parser');
      const article = htmlDocument.createElement('div');
      // html = html.replace(/script/g, 'meta');
      // console.log(html)
      article.innerHTML = html;
      // article.innerHTML = html.replace(/src/g, '_src');

      return article;

      

      // if ()

      // const parser = new DOMParser();
      // const doc = parser.parseFromString(html, 'text/html');
      // return doc;
    }).catch(error => {
      console.log(error)
    });
}

function getDateFromHTML(article) {
  var publishDate = null;
  
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

function checkLinkedData(article) {
  console.log('checkLinkedData()')
  var linkedData = article.querySelectorAll('script[type="application/ld+json"]');
  // console.log(article)
  if (linkedData && linkedData.length) {
    const possibleKeys = ['datePublished', 'dateCreated', 'published', 'uploadDate', 'date'];

    // Some sites have more than one script tag with linked data
    for (let node of linkedData) {
      try {
        let data = JSON.parse(node.innerHTML);

        for (let key of possibleKeys) {
          if (data[key]) {
            let date = formatDate(data[key]);
            // console.log(data[key], date);
            if (date) return date;
          }
        }

      } catch {
        // The website has invalid JSON, attempt 
        // to get the date with Regex
        for (let key of possibleKeys) {
          var dateTest = new RegExp(`/(?<=${key}":\s*")(\S+)(?=\s*",)/`);
          publishDate = node.innerHTML.match(dateTest);

          if (publishDate && publishDate.length) {
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
  console.log('checkMetaData()')
  const possibleProperties = [
    'datePublished', 'article:published_time', 'article:published', 'pubdate', 'publishdate',
    'timestamp', 'date', 'DC.date.issued', 'bt:pubDate', 'sailthru.date', 
    'article.published', 'published-date', 'article.created', 'date_published', 
    'cxenseparse:recs:publishtime', 'article_date_original', 'cXenseParse:recs:publishtime', 
    'DATE_PUBLISHED', 'shareaholic:article_published_time', 'parsely-pub-date'
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
  console.log('checkSelectors()')
  const possibleSelectors = [
    'datePublished', 'pubdate', 'timestamp', 'post__date', 'date', 'Article__Date', 'pb-timestamp', 
    'lastupdatedtime', 'article__meta', 'post-time'
  ];

  for (let selector of possibleSelectors) {
    let selectorString = `[itemprop="${selector}"], .${selector}, #${selector}`;
    let elements = article.querySelectorAll(selectorString);
    
    // Loop through elements to see if one is a date
    if (elements && elements.length) {
      console.log(element)
      for (let element of elements) {
        let dateString;
        let datetime = element.getAttribute('datetime');

        if (datetime) {
          dateString = datetime;
        } else {
          // dateString = element.innerHTML.replace('at', '');
          console.log(dateString)
          dateString = element.innerHTML
            .replace(/at|on|,/g, '')
            .replace(/(\d{4}).*/, '$1')
            .replace(/([0-9]st|nd|th)/g, '')
            .replace(/.*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i, '')
            .trim();

          console.log(dateString)
        }

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
  } else {
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

    // Could not parse date from string
    return null;
  }
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