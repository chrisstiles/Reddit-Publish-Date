////////////////////////////
// Initialize
////////////////////////////

chrome.runtime.onInstalled.addListener(() => {
  // Use a service worker to preloading resources from fetched pages 
  navigator.serviceWorker.register('service-worker.js');

  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { hostSuffix: 'reddit.com' },
        })
      ],
      actions: [new chrome.declarativeContent.ShowPageAction()]
    }]);
  });
});

// chrome.tabs.onActivated.addListener(({ tabId }) => {
//   chrome.pageAction.show(tabId);
// });

chrome.pageAction.onClicked.addListener(tab => {
  chrome.tabs.sendMessage(tab.id, { type: 'check-links' });
});

// chrome.browserAction.onClicked.addListener(function (tab) {
//   // No tabs or host permissions needed!
//   console.log('Turning ' + tab.url + ' red!');
//   chrome.tabs.executeScript({
//     code: 'document.body.style.backgroundColor="red"'
//   });
// });


////////////////////////////
// Find date from link
////////////////////////////

chrome.runtime.onMessage.addListener((request, sender) => {
  const { type, postId, url } = request;

  // Check if the date has been cached before parsing page
  if (type === 'get-date') {
    const { id: tabId } = sender.tab;
    chrome.storage.local.get(postId, dateObject => {
      if (dateObject[postId]) {
        sendDateMessage(tabId, postId, dateObject[postId]);
        return;
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
    sendDateMessage(tabId, postId, urlDate)
    cachePublishDates(postId, urlDate);
    return;
  }

  // Finally we download the webpage HTML to
  // try and parse the date from there
  getArticleHtml(url).then(html => {
    if (!html && !urlDate) return;

    // Fallback to use the URL date if none was found in the HTML
    const date = getDateFromHTML(html, url) || urlDate;

    // Publish date was successfully found, send to client script and cache result
    if (date) {
      sendDateMessage(tabId, postId, date);
      cachePublishDates(postId, date);
    }
  });
}

// Send date back to client scri pt
function sendDateMessage(tabId, postId, date) {
  const formattedDate = formatDate(date);

  if (formattedDate) {
    const data = { postId, date: formattedDate };
    const { displayType, dateType, showColors, boldText } = options;
    const cssClasses = [];

    if (displayType === 'bubble') {
      cssClasses.push('rpd-bubble');
    } else {
      cssClasses.push('rpd-text');
    }

    if (showColors) {
      cssClasses.push('rpd-color');
      cssClasses.push(getColorClass(date));
    } else {
      cssClasses.push('rpd-no-color');
    }

    if (boldText) cssClasses.push('rpd-bold');

    if (dateType === 'relative') {
      cssClasses.push('rpd-relative');
    } else {
      cssClasses.push('rpd-date');
    }

    data.cssClasses = cssClasses;

    chrome.tabs.sendMessage(tabId, data);
  }
}

function getArticleHtml(url) {
  const headers = new Headers();
  headers.append('Content-Type', 'text/html');
  headers.append('X-XSS-Protection', '1; mode=block');
  headers.append('Reddit-Publish-Date', 'true');

  const request = new Request(url, { headers });

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

// Used for testing with background.js console
function getDate(url) {
  const urlDate = getDateFromURL(url);

  if (urlDate && isRecent(urlDate)) {
    console.log('URL date (recent):');
    console.log(formatDate(urlDate), getMomentObject(urlDate));
  } else {
    getArticleHtml(url).then(article => {
      let date = getDateFromHTML(article, url);

      if (date) {
        console.log('HTML Date:');
      } else if (urlDate) {
        console.log('URL date (not recent):');
        date = urlDate;
      }

      console.log(formatDate(date), getMomentObject(date));
    });
  }
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
  let publishDate = null;

  if (url.includes('youtube.com') || url.includes('youtu.be')) return getYoutubeDate(html);

  // Try searching from just the HTML string with regex
  // We just look for JSON as it is not accurate to parse
  // HTML with regex, but is much faster than using the DOM
  console.log('checkHTMLString()')
  publishDate = checkHTMLString(html, url);
  if (publishDate) return publishDate;

  // Parse HTML document to search
  const htmlDocument = document.implementation.createHTMLDocument('parser');
  const article = htmlDocument.createElement('div');
  article.innerHTML = html;
  
  // Some websites include linked data with information about the article
  console.log('checkLinkedData()')
  publishDate = checkLinkedData(article, url);

  // Next try searching <meta> tags
  console.log('checkMetaData()')
  if (!publishDate) publishDate = checkMetaData(article);

  // Try checking item props and CSS selectors
  console.log('checkSelectors()')
  if (!publishDate) publishDate = checkSelectors(article, html);

  return publishDate;
}

const possibleKeys = [
  'datePublished', 'dateCreated', 'publishDate', 'published', 'publishedDate', 
  'articleChangeDateShort', 'post_date', 'dateText', 'date', 'uploadDate', 'publishedDateISO8601'
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

  const dateTest = new RegExp(`(?:'|")(?:${possibleKeys.join('|')})(?:'|")?\\s?:\\s?(?:'|")([a-zA-Z0-9_.\\-:+, ]*)(?:'|")`, 'ig');
  let dateArray = html.match(dateTest);

  if (dateArray && dateArray.length) {
    let dateString = dateArray[1];

    // Prefer publish date over other meta data dates
    for (let date of dateArray) {
      if (date.toLowerCase().includes('publish')) {
        dateString = date;
        break;
      }
    }

    if (dateString) {
      dateArray = dateString.match(/(?:["'] ?: ?["'])([ :.a-zA-Z0-9_-]*)(?:["'])/);

      if (dateArray && dateArray[1]) {
        return getMomentObject(dateArray[1]);
      }
    }
  }

  return null;
}

function getYoutubeDate(html) {
  if (!html) return null;

  const dateTest = new RegExp(`(?:["']ytInitialData[",']][.\\s\\S]*dateText["'].*)((?:${months.join('|')}) \\d{1,2}, \\d{4})(?:['"])`, 'i');
  const dateArray = html.match(dateTest);

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
  let linkedData = article.querySelectorAll('script[type="application/ld+json"]');

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
    'content-head', 'news_date', 'tk-soleil', 'entry-content', 'cmTimeStamp', 'meta p:first-child'
  ];

  // Since we can't account for every possible selector a site will use,
  // we check the HTML for CSS classes or IDs that might contain the publish date
  const possibleClassStrings = ['meta', 'publish'];
  const classTest = new RegExp(`(?:(?:class|id)=")([ a-zA-Z0-9_-]*(${possibleClassStrings.join('|')})[ a-zA-Z0-9_-]*)(?:"?)`, 'gim');

  let classMatch;
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
        let dateElement = element.querySelector('time') || element;
        let dateAttribute = dateElement.getAttribute('datetime') || dateElement.getAttribute('content');

        if (dateAttribute) {
          const date = getMomentObject(dateAttribute);
          if (date) return date;
        }



        element.innerHTML = stripScripts(element.innerHTML)
        const dateString = element.innerText || element.getAttribute('value');
        const date = getDateFromString(dateString);
        if (date) return date;
      }
    }
  }

  function stripScripts(html) {
    var div = document.createElement('div');
    div.innerHTML = html;
    var scripts = div.getElementsByTagName('script');
    var i = scripts.length;
    while (i--) {
      scripts[i].parentNode.removeChild(scripts[i]);
    }
    return div.innerHTML;
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
      const date = getDateFromString(dateString);
      if (date) return date;
    }
  }

  return null;
}

function getDateFromString(string) {
  if (!string.trim()) return null;
  
  let date = getMomentObject(string);
  if (date) return date;

  const numberDateTest = /\d{1,2}[\.\/-]\d{1,2}[\.\/-]\d{1,4}/;
  let dateString = string.match(numberDateTest);
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
    .replace(/posted:*/i, '')
    .replace(/.*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i, '')
    .trim();
  
  date = getMomentObject(dateString);
  if (date) return date;

  return null; 
}


////////////////////////////
// Date Helpers
////////////////////////////

function getMomentObject(dateString) {
  if (!dateString) return null;
  
  let date = moment(dateString);
  if (isValid(date)) return date;

  // Try to account for strangly formatted dates
  const timezones = ['est', 'cst', 'mst', 'pst', 'edt', 'cdt', 'mdt', 'pdt'];

  for (let timezone of timezones) {
    if (dateString.toLowerCase().includes(timezone)) {
      date = moment(dateString.substring(0, dateString.indexOf(timezone)));
      if (isValid(date)) return date;
    }
  }

  for (let month of months) {
    if (dateString.toLowerCase().includes(month)) {
      const monthSearch = new RegExp(`(\\d{1,4} )?${month}`);
      const startIndex = dateString.search(monthSearch)
      const yearIndex = dateString.search(/\d{4}/);
      const endIndex = yearIndex === -1 ? dateString.length : yearIndex + 4;

      date = moment(dateString.substring(startIndex, endIndex));
      if (isValid(date)) return date;
    }
  }

  // Some invalid date strings include the date without formatting
  const dateNumbers = parseDigitOnlyDate(dateString);

  if (dateNumbers) {
    date = moment(dateNumbers);
    if (isValid(date)) return date;
  }

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
  
  let day, month, year, dayMonthArray;

  if (matchedDate) {
    let dateString = matchedDate[0];

    if (dateString.length === 6) {
      const dateArray = dateString.replace(/(\d{2})(\d{2})(\d{2})/, '$1-$2-$3').split('-');

      if (Number(dateArray[0]) > 12) {
        dayMonthArray = [dateArray[1], dateArray[0]];
      } else {
        dayMonthArray = [dateArray[0], dateArray[1]];
      }

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
      }
    }

    // Date array is most likely [month, day], but try to check if possible
    const possibleMonth = Number(dayMonthArray[0]);
    const possibleDay = Number(dayMonthArray[1]);

    if (possibleMonth === possibleDay) {
      day = possibleDay;
      month = possibleMonth;
    } else if (possibleMonth > 12) {
      day = possibleMonth;
      month = possibleDay;
    } else {
      // Have to guess which is month and which is date.
      // We can guess using the current month and day
      if (currentMonth === possibleDay && currentDay === possibleMonth) {
        day = possibleMonth;
        month = possibleDay;
      } else {
        day = possibleDay;
        month = possibleMonth;
      }
    }

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
    return getRelativeDate(date);
  }
}

function getRelativeDate(date) {
  if (date.isAfter(moment()) && isToday(date)) {
    console.log('here')
    return 'today';
  } else {
    const today = moment();
    if (date.isSame(today, 'd')) {
      console.log('here')
      return date.fromNow();  
    } else {
      console.log('here')
      if (date.isAfter(today)) {
        return 'today';
      } else {
        return date.clone().startOf('d').from(today.startOf('d'));
      }
    }
  }
}

function getColorClass(_date) {
  const date = moment(_date);
  if (!isValid(date)) return 'invalid';
  
  const today = moment().startOf('d');
  
  // today.startOf('d');

  // Today or yesterday
  const yesterday = today.clone().subtract(1, 'd').startOf('d');
  if (isToday(date) || date.isSame(yesterday, 'd')) {
    return 'rpd-1';
  }

  // 2 days - 1 week
  const oneWeekAgo = today.clone().subtract(7, 'd').startOf('d');
  if (date.isSameOrAfter(oneWeekAgo, 'd')) {
    return 'rpd-2';
  }

  // 1 week - 2 weeks
  const twoWeeksAgo = today.clone().subtract(14, 'd').startOf('d');
  if (date.isSameOrAfter(twoWeeksAgo, 'd')) {
    return 'rpd-3';
  }

  // 2 weeks - 1 month
  const oneMonthAgo = today.clone().subtract(1, 'M').startOf('d');
  if (date.isSameOrAfter(oneMonthAgo, 'd')) {
    return 'rpd-4';
  }

  // 1 month - 3 months
  const threeMonthsAgo = today.clone().subtract(3, 'M').startOf('d');
  if (date.isSameOrAfter(threeMonthsAgo, 'd')) {
    return 'rpd-5';
  }

  // 3 months - 6 months
  const sixMonthsAgo = today.clone().subtract(6, 'M').startOf('d');
  if (date.isSameOrAfter(sixMonthsAgo, 'd')) {
    return 'rpd-6';
  }

  // 6 months - 1 year
  const oneYearAgo = today.clone().subtract(1, 'y').startOf('d');
  if (date.isSameOrAfter(oneYearAgo, 'd')) {
    return 'rpd-7';
  }

  // More than 1 year old
  if (date.isBefore(oneYearAgo, 'd')) {
    return 'rpd-8';
  };

  // Future date
  if (date.isAfter(today, 'd')) {
    return 'rpd-future';
  }

  return 'rpd-invalid';
}

function isValid(date) {
  if (!moment.isMoment(date)) date = moment(date);

  // Check if the date is on or before tomorrow to account for time zone differences
  const tomorrow = moment().add(1, 'd');

  return date.isValid() && date.isSameOrBefore(tomorrow, 'd');
}

function isToday(date) {
  if (!date) return false;
  if (!moment.isMoment(date)) date = getMomentObject(date);

  const today = moment();

  return date.isValid() && date.isSame(today, 'd');
}

function isRecent(date) {
  if (!date) return false;
  if (!moment.isMoment(date)) date = getMomentObject(date);

  const tomorrow = moment().add(1, 'd');
  const lastMonth = tomorrow.clone().subtract(31, 'd');

  return date.isValid() && date.isBetween(lastMonth, tomorrow, 'd', '[]');
}


////////////////////////////
// Caching
////////////////////////////

let cache = {};
let hasLoadedCachedIds = false;
let cachedIds = [];
let currentIds = [];
let isClearingCache = false;
let cacheTimer;

function cachePublishDates(postId, date) {
  if (!moment.isMoment(date)) date = getMomentObject(date);
  if (!date) return;

  cache[postId] = date.toISOString();
  cacheId(postId);
  startCacheTimer();
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
    chrome.storage.local.set(cache, () => {
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

function clearCache() {
  chrome.storage.local.clear(function () {
    let error = chrome.runtime.lastError;
    if (error) {
      console.error(error);
    }
  });
}


////////////////////////////
// Extension Options
////////////////////////////

const options = {
  dateType: 'relative',
  dateFormat: 'M/D/YY',
  displayType: 'text',
  showColors: true,
  boldText: true
};

chrome.storage.sync.get(options, savedOptions => {
  const { dateType, dateFormat, showColors, displayType, boldText } = savedOptions;
  
  options.dateType = dateType;
  options.showColors = showColors;
  options.displayType = displayType;
  options.boldText = boldText;
});

chrome.runtime.onMessage.addListener((request, sender) => {
  const { type, dateType, showColors, displayType, boldText, dateFormat } = request;

  if (type === 'options-changed') {
    options.dateType = dateType;
    options.dateFormat = dateFormat;
    options.showColors = showColors;
    options.displayType = displayType;
    options.boldText = boldText;
  }
});

moment.suppressDeprecationWarnings = true;