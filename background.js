chrome.storage.local.clear(function () {
  var error = chrome.runtime.lastError;
  if (error) {
    console.error(error);
  }
});

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
    const date = formatDate(cachedDates[postId]);
    if (date) {
      sendDateMessage(tabId, postId, date);
      return;
    }
  }

  // Next we try to parse the date from the URL.
  // If it exists and it is within a month
  // it should be safe to assume it is correct
  const urlDate = getDateFromURL(url);
  if (urlDate && isRecent(urlDate)) {
    const date = formatDate(urlDate);
    sendDateMessage(tabId, postId, date);
    cachePublishDates(postId, urlDate);
    return;
  }

  // Finally we download the webpage HTML to
  // try and parse the date from there
  getArticleHtml(url).then(html => {
    if (!html && !urlDate) return;

    // Fallback to use the URL date if none was found in the HTML
    const date = getDateFromHTML(html) || urlDate;

    if (!date) return;

    // Publish date was successfully found, send to client script and cache
    sendDateMessage(tabId, postId, formatDate(date));
    cachePublishDates(postId, date);
  });
}

// Send date back to client script
function sendDateMessage(tabId, postId, date) {
  chrome.tabs.sendMessage(tabId, { postId, date });
}

function getDateFromURL(url) {
  const dateTest = /([\./\-_]{0,1}(19|20)\d{2})[\./\-_]{0,1}(([0-3]{0,1}[0-9][\./\-_])|(\w{3,5}[\./\-_]))([0-3]{0,1}[0-9][\./\-]{0,1})?/;
  const dateString = url.match(dateTest);
  
  if (dateString) {
    window.test = dateString[0]
    return getMomentObject(dateString[0]);
  }

  return null;
}

function getArticleHtml(url) {
  const headers = new Headers();
  headers.append('Content-Type', 'text/html');
  headers.append('X-XSS-Protection', '1; mode=block');

  const request = new Request(url, { headers, method: 'GET', redirect: 'follow' });

  return fetch(request)
    .then(response => {
      return response.text();
    })
    .then(html => {
      return html;
    }).catch(error => {
      console.log(error)
    });
}

function getDateFromHTML(html) {
  var publishDate = null;

  // Try searching from just the HTML string with regex
  // We just look for JSON as it is not accurate to parse
  // HTML with regex, but is much faster than using the DOM
  publishDate = checkHTMLString(html);
  if (publishDate) {
    console.log('Found in HTML String')
    console.log(publishDate);
    return publishDate
  };

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
  const urlDate = getDateFromURL(url);
  if (urlDate && isRecent(urlDate)) {
    console.log('URL Date:');
    console.log(urlDate, getMomentObject(urlDate));
  } else {
    getArticleHtml(url).then(article => {
      let date = getDateFromHTML(article);

      if (date && urlDate) {
        if (date.isSame(urlDate, 'day')) {
          console.log('SAME DAY :D');
        } else {
          console.warn('DIFFERENT DAYS :(');
          console.log(date, urlDate)
        }
      }

      if (date) {
        console.log('HTML Date:');
      } else if (urlDate) {
        console.log('URL Date (not recent):');
        date = urlDate;
      }

      console.log(formatDate(date), getMomentObject(date));
    });
  }
}

const possibleKeys = ['datePublished', 'dateCreated', 'publishDate', 'published', 'uploadDate', 'date', 'publishedDate'];

function checkHTMLString(html) {
  if (!html) return null;
  const keys = possibleKeys.join('|');
  const dateTest = new RegExp(`(?:\b(?:${possibleKeys.join('|')})["|']?\s*:\s*["|'])([A-Za-z0-9-_:]+)(?:"|')`, 'i');
  const dateString = html.match(dateTest);

  if (dateString && dateString[3]) {
    return getMomentObject(dateString[3]);
  }

  return null;
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
            let date = getMomentObject(data[key]);
            if (date) return date;
          }
        }

      } catch {
        // The website has invalid JSON, attempt 
        // to get the date with Regex
        for (let key of possibleKeys) {
          let dateTest = new RegExp(`/(?<=${key}":\s*")(\S+)(?=\s*",)/`);
          dateString = node.innerHTML.match(dateTest);

          if (dateString) {
            let date = getMomentObject(dateString[0]);
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
    'timestamp', 'date', 'DC.date.issued', 'bt:pubDate', 'sailthru.date', 'meta',
    'article.published', 'published-date', 'article.created', 'date_published', 
    'cxenseparse:recs:publishtime', 'article_date_original', 'cXenseParse:recs:publishtime', 
    'DATE_PUBLISHED', 'shareaholic:article_published_time', 'parsely-pub-date', 'twt-published-at'
  ];

  const metaData = article.querySelectorAll('meta');

  for (let meta of metaData) {
    let property = meta.getAttribute('name') || meta.getAttribute('property') || meta.getAttribute('itemprop');

    if (property && possibleProperties.includes(property)) {
      let date = getMomentObject(meta.getAttribute('content'));
      if (date) return date;
    }
  }

  return null;
}

function checkSelectors(article) {
  // console.log('checkSelectors()')
  const possibleSelectors = [
    'datePublished', 'pubdate', 'timestamp', 'timeStamp', 'post__date', 'date', 'Article__Date', 'pb-timestamp', 'meta',
    'lastupdatedtime', 'article__meta', 'post-time', 'video-player__metric', 'Timestamp-time', 'report-writer-date'
  ];

  for (let selector of possibleSelectors) {
    let selectorString = `[itemprop="${selector}"], .${selector}, #${selector}`;
    let elements = article.querySelectorAll(selectorString);
    
    // Loop through elements to see if one is a date
    if (elements && elements.length) {
      for (let element of elements) {
        console.log(element)
        if (!element) {
          console.log(element, elements, selector)
          console.log(article)
          return;
        }

        let dateString;
        let dateAttribute = element.getAttribute('datetime') || element.getAttribute('content');

        if (dateAttribute) {
          let date = getMomentObject(dateAttribute);
          if (date) return date;
        }

        let date = getDateFromString(element.innerText);
        if (date) return date;
      }
    }
  }

  return null;
}

function getDateFromString(string) {
  if (!string.trim()) return null;
  
  var date = getMomentObject(string);
  if (date) return date;

  const numberDateTest = /\d{1,2}[\/-]\d{1,2}[\/-]\d{1,4}/;
  var dateString = string.match(numberDateTest);
  if (dateString) date = getMomentObject(dateString[0]);
  if (date) return date;

  const stringDateTest = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\b \d{1,2},? {1,2}(\d{4}|\d{2})/i;
  dateString = string.match(stringDateTest);
  if (dateString) date = getMomentObject(dateString[0]);
  if (date) return date;
  
  dateString = string
    .replace(/at|on|,/g, '')
    .replace(/(\d{4}).*/, '$1')
    .replace(/([0-9]st|nd|th)/g, '')
    .replace(/.*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i, '')
    .trim();
  
  return getMomentObject(dateString);
}

function getMomentObject(dateString) {
  if (!dateString) return null;

  // Account for dateStrings that are just a string
  // of numbers i.e. 11082018
  dateString.replace(/^(\d{2}|\d{4})(\d{2})(\d{2}|\d{4})$/, '$1-$2-$3');

  var date = moment(dateString);

  if (isValid(date)) {
    return date;
  }

  // Try to account for strangly formatted dates
  dateString = dateString.toLowerCase();
  const timezones = ['est', 'cst', 'mst', 'pst', 'edt', 'cdt', 'mdt', 'pdt'];

  for (let timezone of timezones) {
    if (dateString.includes(timezone)) {
      date = moment(dateString.substring(0, dateString.indexOf(timezone)));
      if (isValid(date)) {
        return date;
      }

      break;
    }
  }

  // Some invalid date strings include the date without formatting
  var dateNumbers = dateString.match(/\d{8}/);

  if (dateNumbers) {
    dateNumbers = dateNumbers[0].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
    date = moment(dateNumbers);
    if (isValid(date)) {
      return date;
    }
  }

  // Could not parse date from string
  return null;
}

function formatDate(date) {
  if (!date) return null;
  if (!moment.isMoment(date)) date = getMomentObject(date);
  if (!isValid(date)) return null;

  const format = 'M/D/YY';
  return date.format(format);
}

function isValid(date) {
  if (!moment.isMoment(date)) date = moment(date);

  // Check if the date is on or before tomorrow to account for time zone differences
  const tomorrow = moment().add(1, 'days');

  return date.isValid() && date.isSameOrBefore(tomorrow, 'day');
}

function isToday(date) {
  if (!date) return false;
  if (!moment.isMoment(date)) date = getMomentObject(date);

  const today = moment();

  return date.isValid() && date.isSame(today, 'day');
}

function isRecent(date) {
  if (!date) return false;
  if (!moment.isMoment(date)) date = getMomentObject(date);

  const tomorrow = moment().add(1, 'days');
  const lastMonth = tomorrow.clone().subtract(31, 'days');

  return date.isValid() && date.isBetween(lastMonth, tomorrow, 'day', '[]');
}

// Cache list of saved posts. We use a timer
// to ensure we don't repeatedly 
var cacheTimer;
function cachePublishDates(postId, date) {
  if (!moment.isMoment(date)) date = getMomentObject(date);
  if (isValid(date)) {
    cachedDates[postId] = date.toISOString();
  }
  
  // console.log(cachedDates)
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    const obj = { publishDates: JSON.stringify(cachedDates) };
    chrome.storage.local.set(obj);
  }, 2000);
}

moment.suppressDeprecationWarnings = true;