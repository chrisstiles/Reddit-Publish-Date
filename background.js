// chrome.storage.local.clear(function () {
//   console.log('Clearing cache')
//   var error = chrome.runtime.lastError;
//   if (error) {
//     console.error(error);
//   }
// });

////////////////////////////
// Find date from link
////////////////////////////

chrome.runtime.onMessage.addListener((request, sender) => {
  const { type, postId, url } = request;
  const { id: tabId } = sender.tab;

  // Check if the date has been cached before parsing page
  if (type === 'get-date') {
    chrome.storage.local.get(postId, dateObject => {
      if (dateObject[postId]) {
        const date = formatDate(dateObject[postId]);
        if (date) {
          sendDateMessage(tabId, postId, date);
          return;
        }
      }

      getDateFromPage(postId, url, tabId);
    });
  }
});

function getDateFromPage(postId, url, tabId) {
  // First we try to parse the date from the URL.
  // If it exists and it is within a month
  // it should be safe to assume it is correct
  const urlDate = getDateFromURL(url);
  if (urlDate && isRecent(urlDate)) {
    // console.log('url date')
    const date = formatDate(urlDate);
    sendDateMessage(tabId, postId, date)
    cachePublishDates(postId, urlDate);
    return;
  }

  // Finally we download the webpage HTML to
  // try and parse the date from there
  getArticleHtml(url).then(html => {
    if (!html && !urlDate) return;

    // Fallback to use the URL date if none was found in the HTML
    const date = getDateFromHTML(html, url) || urlDate;

    if (!date) {
      console.log('Not Found:')
      console.log(url)
      return;
    };

    // Publish date was successfully found, send to client script and cache
    sendDateMessage(tabId, postId, formatDate(date));
    cachePublishDates(postId, date);
  });
}

// Send date back to client script
function sendDateMessage(tabId, postId, date) {
  chrome.tabs.sendMessage(tabId, { postId, date });
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

////////////////////////////
// Date Parsing
////////////////////////////

function getDateFromURL(url) {
  const skipDomains = ['cnn.com/videos'];
  for (let domain of skipDomains) {
    if (url.includes(domain)) return null;
  }

  const dateTest = /([\./\-_]{0,1}(19|20)\d{2})[\./\-_]{0,1}(([0-3]{0,1}[0-9][\./\-_])|(\w{3,5}[\./\-_]))([0-3]{0,1}[0-9][\./\-]{0,1})/;
  const dateString = url.match(dateTest);
  
  if (dateString) {
    return getMomentObject(dateString[0]);
  }

  return null;
}

function getDateFromHTML(html, url) {
  var publishDate = null;

  if (url.includes('youtube.com') || url.includes('youtu.be')) return getYoutubeDate(html);

  // Try searching from just the HTML string with regex
  // We just look for JSON as it is not accurate to parse
  // HTML with regex, but is much faster than using the DOM
  publishDate = checkHTMLString(html, url);
  if (publishDate) {
    // console.log('Found in HTML String')
    // console.log(publishDate);
    return publishDate
  };

  // Parse HTML document to search
  const htmlDocument = document.implementation.createHTMLDocument('parser');
  const article = htmlDocument.createElement('div');
  article.innerHTML = html;
  
  // Some websites include linked data with information about the article
  publishDate = checkLinkedData(article, url);

  // Next try searching <meta> tags
  if (!publishDate) publishDate = checkMetaData(article);

  // Try checking item props and CSS selectors
  if (!publishDate) publishDate = checkSelectors(article, html);

  return publishDate;
}

window.getDate = function(url) {
  const urlDate = getDateFromURL(url);
  console.log(isRecent(urlDate))
  if (urlDate && isRecent(urlDate)) {
    console.log('URL Date:');
    console.log(urlDate, getMomentObject(urlDate));
  } else {
    getArticleHtml(url).then(article => {
      let date = getDateFromHTML(article, url);

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

const possibleKeys = [
  'datePublished', 'dateCreated', 'publishDate', 'published', 'uploadDate', 'publishedDate', 
  'articleChangeDateShort', 'post_date', 'dateText', 'date'
];
const months = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'
]

function checkHTMLString(html, url) {
  if (!html) return null;

  // Certain websites include JSON data for other posts
  // We don't attempt to parse the date from the HTML on these
  // sites to prevent the wrong date being found
  const skipDomains = ['talkingpointsmemo.com'];
  for (let domain of skipDomains) {
    if (url.includes(domain)) return null;
  }

  const dateTest = new RegExp(`(?:${possibleKeys.join('|')})(?:'|")?\\s?:\\s?(?:'|")([a-zA-Z0-9_.\\-:+, ]*)(?:'|")`, 'i');
  const dateString = html.match(dateTest);

  if (dateString && dateString[1]) {
    return getMomentObject(dateString[1]);
  }

  return null;
}

function getYoutubeDate(html) {
  if (!html) return null;

  const dateTest = new RegExp(`(?:["']ytInitialData[",']][.\\s\\S]*dateText["'].*)((?:${months.join('|')}) \\d{1,2}, \\d{4})(?:['"])`, 'i');
  const dateArray = html.match(dateTest, 'i');

  if (dateArray && dateArray[1]) {
    return getMomentObject(dateArray[1]);
  }

  // Parse videos where date is like "4 hours ago"
  const dateDifferenceTest = /(?:["']ytInitialData[",']][.\s\S]*dateText["'].*["'](?:\w+ )+) ?(\d+) ((?:second|minute|hour|day|month|year)s?) (?:ago)(?:['"])/i
  const dateDifferenceArray = html.match(dateDifferenceTest);
  
  if (dateDifferenceArray && dateDifferenceArray.length >= 3) {
    return getDateFromRelativeTime(dateDifferenceArray[1], dateDifferenceArray[2]);
  }
  
  return null;
}

function checkLinkedData(article, url) {
  var linkedData = article.querySelectorAll('script[type="application/ld+json"]');

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
          let date = checkHTMLString(node.innerHTML, url);
          if (date) return date;
        }
      }
    }
  }

  return null;
}

function checkMetaData(article) {
  const possibleProperties = [
    'datePublished', 'article:published_time', 'article:published', 'pubdate', 'publishdate',
    'timestamp', 'date', 'DC.date.issued', 'bt:pubDate', 'sailthru.date', 'meta', 'og:published_time',
    'article.published', 'published-date', 'article.created', 'date_published', 'vr:published_time',
    'cxenseparse:recs:publishtime', 'article_date_original', 'cXenseParse:recs:publishtime', 
    'DATE_PUBLISHED', 'shareaholic:article_published_time', 'parsely-pub-date', 'twt-published-at',
    'published_date', 'dc.date', 'field-name-post-date', 'Last-modified', 'posted'
  ];

  const metaData = article.querySelectorAll('meta');

  for (let meta of metaData) {
    const property = meta.getAttribute('name') || meta.getAttribute('property') || meta.getAttribute('itemprop') || meta.getAttribute('http-equiv');
    
    if (property && possibleProperties.includes(property)) {
      // console.log(property)
      const date = getMomentObject(meta.getAttribute('content'));
      if (date) return date;
    }
  }

  // Check page title
  const title = article.querySelector('title');
  if (title) {
    const date = getDateFromString(title.innerText);
    if (date) return date;
  }

  return null;
}

function checkSelectors(article, html) {
  const possibleSelectors = [
    'datePublished', 'published', 'pubdate', 'timestamp', 'timeStamp', 'post-date', 'post__date', 'article-date', 'article_date', 
    'Article__Date', 'pb-timestamp', 'meta', 'lastupdatedtime', 'article__meta', 'post-time', 'video-player__metric', 
    'Timestamp-time', 'report-writer-date', 'published_date', 'byline', 'date-display-single', 'tmt-news-meta__date', 
    'blog-post-meta', 'timeinfo-txt', 'field-name-post-date', 'post--meta', 'article-dateline', 'storydate', 
    'content-head', 'news_date', 'tk-soleil', 'entry-content'
  ];

  // Since we can't account for every possible selector a site will use,
  // we check the HTML for CSS classes or IDs that might contain the publish date
  const possibleClassStrings = ['meta', 'publish'];
  const classTest = new RegExp(`(?:(?:class|id)=")([ a-zA-Z0-9_-]*(${possibleClassStrings.join('|')})[ a-zA-Z0-9_-]*)(?:"?)`, 'gim');

  var classMatch;
  while (classMatch = classTest.exec(html)) {
    if (!possibleSelectors.includes(classMatch[1])) {
      possibleSelectors.unshift(classMatch[1]);
    }
  }


  for (let selector of possibleSelectors) {
    let selectorString = `[itemprop="${selector}"], .${selector}, #${selector}`;
    let elements = article.querySelectorAll(selectorString);
    
    // Loop through elements to see if one is a date
    if (elements && elements.length) {
      for (let element of elements) {
        // console.log(element)
        // if (!element) {
        //   console.log(element, elements, selector)
        //   console.log(article)
        //   return;
        // }

        let dateElement = element.querySelector('time') || element;
        let dateAttribute = dateElement.getAttribute('datetime') || dateElement.getAttribute('content');
        // console.log(dateAttribute)
        // console.log(dateAttribute)
        if (dateAttribute) {
          let date = getMomentObject(dateAttribute);
          if (date) return date;
        }

        const dateString = element.innerText || element.getAttribute('value');
        let date = getDateFromString(dateString);
        if (date) return date;
      }
    }
  }

  // Check more generic selectors that could be used for other dates
  // We'll make sure to only check these if they're inside an article tag
  const additionalSelectors = ['datetime', 'date'];
  for (let selector of additionalSelectors) {
    let element = article.querySelector(`.${selector}`);

    if (element) {
      let date = getDateFromString(element.innerText);
      if (date) return date;
    }
  }

  // Check for time elements that might be publication date
  const timeElements = article.querySelectorAll('article time[datetime], time[pubdate]');
  if (timeElements && timeElements.length) {
    for (let element of timeElements) {element.getAttribute('datetime') || element.getAttribute('pubdate')
      const dateString = element.getAttribute('datetime') || element.innerText;
      // console.log(dateString)
      const date = getDateFromString(dateString);
      if (date) return date;
    }
  }

  return null;
}

function getDateFromString(string) {
  if (!string.trim()) return null;
  
  var date = getMomentObject(string);
  if (date) return date;

  const numberDateTest = /\d{1,2}[\.\/-]\d{1,2}[\.\/-]\d{1,4}/;
  var dateString = string.match(numberDateTest);
  if (dateString) date = getMomentObject(dateString[0]);
  if (date) return date;

  const stringDateTest = new RegExp(`/(${months.join('|')})\w*\b \d{1,2},? {1,2}(\d{4}|\d{2})/i`, 'i');
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

////////////////////////////
// Date Helpers
////////////////////////////

function getMomentObject(dateString) {
  if (!dateString) return null;
  if (typeof dateString === 'string') {
    dateString = dateString.toLowerCase();
  }
  
  var date = moment(dateString);
  if (isValid(date)) return date;

  // Try to account for strangly formatted dates
  const timezones = ['est', 'cst', 'mst', 'pst', 'edt', 'cdt', 'mdt', 'pdt'];

  for (let timezone of timezones) {
    if (dateString.includes(timezone)) {
      date = moment(dateString.substring(0, dateString.indexOf(timezone)));
      if (isValid(date)) return date;
    }
  }

  for (let month of months) {
    if (dateString.includes(month)) {
      const monthSearch = new RegExp(`(\\d{1,4} )?${month}`);
      const startIndex = dateString.search(monthSearch)
      const yearIndex = dateString.search(/\d{4}/);
      const endIndex = yearIndex === -1 ? dateString.length : yearIndex + 4;

      date = moment(dateString.substring(startIndex, endIndex));
      if (isValid(date)) return date;
    }
  }

  // Some invalid date strings include the date without formatting
  // var dateNumbers = dateString.match(/\d{8}/);
  const dateNumbers = parseDigitOnlyDate(dateString);

  if (dateNumbers) {
    // dateNumbers = dateNumbers[0].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
    date = moment(dateNumbers);
    if (isValid(date)) return date;
  }

  // console.log('FINALLY HERE: ', dateString)

  // Use today's date if the string contains 'today'
  if (dateString.includes('today')) {
    return moment();
  }

  // Could not parse date from string
  return null;
}

function getDateFromRelativeTime(num, units) {
  if ((!num && num !== 0) || !units) return null;
  if (!isNaN(num) && typeof units === 'string') {
    const date = moment().subtract(num, units);
    if (isValid(date)) return date;
  }

  return null;
}

function parseDigitOnlyDate(dateString) {
  if (!dateString) return null;
  const matchedDate = dateString.replace(/\/|-\./g, '').match(/\b(\d{6}|\d{8})\b/);
  console.log('here', dateString, matchedDate)
  
  var day, month, year, dayMonthArray;

  if (matchedDate) {
    var dateString = matchedDate[0];

    if (dateString.length === 6) {
      const dateArray = dateString.replace(/(\d{2})(\d{2})(\d{2})/, '$1-$2-$3').split('-');
      console.log('come on ', dateArray)
      if (Number(dateArray[0]) > 12) {
        dayMonthArray = [dateArray[1], dateArray[0]];
      } else {
        dayMonthArray = [dateArray[0], dateArray[1]];
      }

      console.log('here it is: ', dayMonthArray)
      year = dateArray[2];
    } else {
      if (Number(dateString[0]) !== 2) {
        const dateArray = dateString.replace(/(\d{2})(\d{2})(\d{4})/, '$1-$2-$3').split('-');
        if (dateArray) {
          if (Number(dateArray[0]) > 12) {
            dayMonthArray = [dateArray[1], dateArray[0]];
          } else {
            dayMonthArray = [dateArray[0], dateArray[1]];
          }
          
          year = dateArray[2];
        }
        
      } else {
        const dateArray = dateString.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3').split('-');
        if (dateArray) {
          dayMonthArray = [dateArray[1], dateArray[2]]
          year = dateArray[0];
        }

        // if (Number(dateArray[]))
        // if (Number(dateArray[0] > 12)) {
        //   day = dateArray[0];
        //   month = dateArray[1];
        // } else {
        //   day = dateArray[1];
        //   month = dateArray[0];
        // }

        // const dateArray = dateString.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3').split('-');

        // year = dateArray[0];
      }
    }

    // Date array is most likely [month, day], but try to check if possible
    console.log(dayMonthArray)
    const possibleMonth = Number(dayMonthArray[0]);
    const possibleDay = Number(dayMonthArray[1]);
    if (possibleMonth === possibleDay) {
      console.log('here 1')
      day = possibleDay;
      month = possibleMonth;
    } else if (possibleMonth > 12) {
      console.log('here 2')
      day = possibleMonth;
      month = possibleDay;
    } else {
      // Have to guess which is month and which is date.
      // We can guess using the current month and day
      const currentMonth = Number(moment().format('M'));
      const currentDay = Number(moment().format('D'));

      // if (possibleDay === currentDay) {
      //   console.log('here 3')
      //   day = possibleDay;
      //   month = possibleMonth;
      // } else if (possibleDay === currentMonth) {
      //   console.log('here 4')
      //   day = possibleMonth;
      //   month = possibleDay;
      // } else {
      //   console.log('here 5')
        // day = possibleDay;
        // month = possibleMonth;
      // }
      console.log('wtf')
      day = possibleDay;
      month = possibleMonth;

    }
    console.log('YAY')
    console.log(`${month}-${day}-${year}`)
    return `${month}-${day}-${year}`;
    
  }

  return null;
}

function formatDate(date) {
  if (!date) return null;
  if (!moment.isMoment(date)) date = getMomentObject(date);
  if (!isValid(date)) return null;

  const { dateType, dateFormat } = options;
  if (dateType === 'date') {
    return date.format(dateFormat);
  } else {
    return date.fromNow();
  }
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

////////////////////////////
// Caching
////////////////////////////

var cache = {};
var hasLoadedCachedIds = false;
var cachedIds = [];
var currentIds = [];
var isClearingCache = false;
var cacheTimer;

function cachePublishDates(postId, date) {
  if (!moment.isMoment(date)) date = getMomentObject(date);
  if (!date) return;
  // if (isValid(date)) {
  //   cachedDates[postId] = date.toISOString();
  // }

  // const obj = {};

  cache[postId] = date.toISOString();
  cacheId(postId);
  startCacheTimer();
  

  // date = date.toISOString();
  // cache[postId] = JSON.stringify({ date, index: cachedIds.length });
  // cache[postId] = { date, index: cachedIds.length - 1 };
  
  // console.log({ postId: date.toISOString() })
  
  // clearTimeout(cacheTimer);
  // cacheTimer = setTimeout(() => {
  //   const obj = { publishDates: JSON.stringify(cachedDates) };
  //   chrome.storage.local.set(obj);
  // }, 2000);
}

function cacheId(postId) {
  if (!hasLoadedCachedIds) {
    if (!currentIds.includes(postId)) {
      currentIds.push(postId);
    }

    getCachedIds();
  } else {
    cachedIds.push(postId);
  }
}

function getCachedIds() {
  chrome.storage.local.get('cachedIds', ids => {
    if (ids && ids.length) {
      cachedIds = ids;

      // Add new ids that haven't been cached in local storage yet
      for (let id of currentIds) {
        cachedIds.push(id);
      }
    } else {
      cachedIds = currentIds.slice();
    }

    hasLoadedCachedIds = true;
    currentIds = [];
  });
}

function startCacheTimer() {
  if (isClearingCache) return;
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    cache.cachedIds = cachedIds;
    // console.log(cache)
    chrome.storage.local.set(cache, () => {
      // console.log(postId)
      const error = chrome.runtime.lastError;
      if (error) console.log(error.message)
      if (error && 
          error.message && 
          error.message.toLowerCase().includes('quota exceeded')) {
        clearOldCachedDates();
      }
    });
  }, 2000);
}

function clearOldCachedDates() {
  if (isClearingCache) return;
  isClearingCache = true;
  const oldIds = cachedIds.splice(0, cachedIds.length / 2);

  chrome.storage.local.remove(oldIds, () => {
    isClearingCache = false;
  });
}

////////////////////////////
// Extension Options
////////////////////////////

const options = {
  dateType: 'date',
  dateFormat: 'M/D/YY'
};

chrome.storage.sync.get({
  dateType: 'date',
  dateFormat: 'M/D/YY'
}, ({ dateType, dateFormat }) => {
  options.dateType = dateType;
  // options.dateFormat = dateFormat;
});

chrome.runtime.onMessage.addListener((request, sender) => {
  const { type, dateType } = request;

  if (type === 'options-changed') {
    options.dateType = dateType;
  }
});

moment.suppressDeprecationWarnings = true;



(function (window, document, undefined) {

  var Storage = {};
  window.Storage = Storage;

  Storage.tracking = true;
  Storage.track = function () {
    Storage.tracking = !Storage.tracking;
    if (Storage.tracking) {
      console.log("Tracking storage performance.");
    } else {
      console.log("Not tracking storage performance.");
    }
  }

  Storage.KB = 1024;
  Storage.MB = 1024 * 1024;
  Storage.GB = 1024 * 1024 * 1024;

  Storage.showTotalBytes = function () {
    function callback(bytes) {
      console.log("Total bytes in use: " + bytes);
    }
    if (arguments.length == 0) {
      return chrome.storage.local.getBytesInUse(null, callback);
    } else {
      var ary = arguments.slice();
      ary.push(callback);
      return chrome.storage.local.getBytesInUse.apply(null, ary);
    }
  };

  // Print entry list to console.
  Storage.getEntryList = function (callback) {
    if (typeof callback == 'undefined') {
      callback = function (ids) {
        console.log(ids);
      }
    }

    chrome.storage.local.get("index:ids", function (items) {
      if (chrome.runtime.lastError) {
        console.log("Error retrieving index: " + chrome.runtime.lastError);
        return;
      }
      var ids = items["index:ids"];
      callback(ids);
    });
  };

  Storage.getEntry = function (id) {
    var start = performance.now();
    chrome.storage.local.get(id, function (items) {
      if (chrome.runtime.lastError) {
        console.log("Error retrieving entry: " + chrome.runtime.lastError);
        return;
      }
      if (!items[id]) {
        console.log("Entry not found.");
      }
      var end = performance.now();
      console.log("Entry retrieved in " + (end - start) + " ms.");
    });
  }

  // Store a value with the specified key, save the key to the index.
  Storage.store = function (key, value) {
    var storeKey = "data:" + key;
    chrome.storage.local.get("index:ids", function (items) {
      if (chrome.runtime.lastError) {
        console.log("Error retrieving index: " + chrome.runtime.lastError);
        return;
      }
      var ids = items["index:ids"];
      ids.push(storeKey);
      var store = {};
      var start = performance.now();
      store["index:ids"] = ids;
      store[storeKey] = value;
      chrome.storage.local.set(store, function () {
        if (chrome.runtime.lastError) {
          console.log("Error Storing: ", chrome.runtime.lastError);
        }
        var end = performance.now();
        console.log("Value stored in " + (end - start) + " ms.");
      });
    });
  };

  // Get a string with the specified number of bytes.
  Storage.getData = function (bytes) {
    var chars = [];
    for (var i = 0; i < bytes; i++) {
      chars.push('A');
    }
    return chars.join('');
  };

  // Create and add an arbitrary entry to the local storage.
  Storage.addEntry = function (bytes) {
    var id = Storage._guid();
    var data = Storage.getData(bytes);
    Storage.store(id, data);
    Storage.updateSizes();
  };

  Storage.getSizes = function (callback) {
    if (typeof callback == 'undefined') {
      callback = function (info) {
        console.log(info);
      }
    }
    chrome.storage.local.get("index:size", function (items) {
      var sizes = items["index:size"];
      callback(sizes);
    })
  };

  Storage.updateSizes = function () {
    function waitUntilCondition(cond, fn) {
      if (cond()) {
        fn();
      } else {
        setTimeout(function () {
          waitUntilCondition(cond, fn);
        }, 20);
      }
    }

    Storage.getEntryList(function (ids) {
      var error = false;
      var checked = {};
      ids.forEach(function (id) {
        checked[id] = false;
      });
      var sizes;
      chrome.storage.local.get("index:size", function (items) {
        if (chrome.runtime.lastError) {
          console.log("Error: " + chrome.runtime.lastError);
          error = true;
          return;
        }
        sizes = items["index:size"];

        ids.forEach(function (id) {
          if (!sizes.hasOwnProperty(id)) {
            chrome.storage.local.getBytesInUse(id, function (size) {
              sizes[id] = size;
              checked[id] = true;
            });
          } else {
            checked[id] = true;
          }
        });
      });
      waitUntilCondition(function () {
        return ids.every(function (id) { return checked[id]; });
      }, function () {
        chrome.storage.local.set({
          "index:size": sizes
        });
      });
    });
  };

  Storage._guid = function () {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
      s4() + '-' + s4() + s4() + s4();
  };

  chrome.runtime.onInstalled.addListener(updateFunction);
  function updateFunction(details) {
    var previousVersion = details.previousVersion;
    var version = chrome.runtime.getManifest().version;

    // Get/set settings.
    chrome.storage.local.get(["index:ids", "index:size"], function (result) {
      if (!result["index:ids"]) {
        chrome.storage.local.set({
          "index:ids": []
        });
      }
      if (!result["index:size"]) {
        chrome.storage.local.set({
          "index:size": {}
        });
      }
    });
  }

})(window, document);