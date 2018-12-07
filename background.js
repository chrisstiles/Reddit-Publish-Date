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
    console.log('url date')
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
  const dateTest = /([\./\-_]{0,1}(19|20)\d{2})[\./\-_]{0,1}(([0-3]{0,1}[0-9][\./\-_])|(\w{3,5}[\./\-_]))([0-3]{0,1}[0-9][\./\-]{0,1})/;
  const dateString = url.match(dateTest);
  
  if (dateString) {
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

function getDateFromHTML(html, url) {
  var publishDate = null;

  if (url.includes('youtube.com') || url.includes('youtu.be')) return getYoutubeDate(html);

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
  'datePublished', 'dateCreated', 'publishDate', 'published', 'uploadDate', 'date', 'publishedDate', 
  'articleChangeDateShort', 'post_date', 'dateText'
];
const months = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'
]

function checkHTMLString(html) {
  if (!html) return null;

  const keys = possibleKeys.join('|');
  // const dateTest = new RegExp(`(?:\\b(?:${keys})["|']?\\s*:\\s*["|'])(.+)(?:"|')`, 'i');
  // const dateTest = new RegExp(`(?:${keys})(?:"|')?\\s*:\\s*(["'])(?:(?=(\\?))\\2.)*?\\1`, 'i');
  // const dateTest = new RegExp(`(?:${keys})(?:"|')?\\s*:\\s*(\\1"|')((?:(?=(\\?))\\2.)*?)\\1`, 'i');
  const dateTest = new RegExp(`(?:${keys})(?:'|")?\\s?:\\s?(?:'|")([a-zA-Z0-9_.\\-: ]*)(?:'|")`, 'i');


  // (?:uploadDate)(?:'|")?\s?:\s?(?:'|")([a-zA-Z0-9_.\-:]*)(?:'|")
  // (?:uploadDate)(?:'|")?\s?:\s?(?:'|")([a-zA-Z0-9_.\-:]*)(?:'|")


  const dateString = html.match(dateTest);
  console.log(dateString)
  if (dateString && dateString[1]) {
    // dateString = dateString[1].toLowerCase().replace('published on', ''
    return getMomentObject(dateString[1]);
  }

  return null;
}

function getYoutubeDate(html) {
  if (!html) return null;

  const dateTest = new RegExp(`(?:["']ytInitialData[",']][.\\s\\S]*dateText["'].*)((?:${months.join('|')}) \\d{1,2}, \\d{4})(?:['"])`, 'i');
  const dateString = html.match(dateTest, 'i');

  if (dateString && dateString[1]) {
    return getMomentObject(dateString[1]);
  }
  
  return null;
}

function checkLinkedData(article) {
  // console.log('checkLinkedData()')
  var linkedData = article.querySelectorAll('script[type="application/ld+json"]');
  console.log('here')
  // console.log(article)
  if (linkedData && linkedData.length) {
    console.log(linkedData)
    // Some sites have more than one script tag with linked data
    for (let node of linkedData) {
      console.log()
      try {
        let data = JSON.parse(node.innerHTML);
        console.log(data)

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
          let date = checkHTMLString(node.innerHTML);
          if (date) return date;
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
    'timestamp', 'date', 'DC.date.issued', 'bt:pubDate', 'sailthru.date', 'meta', 'og:published_time',
    'article.published', 'published-date', 'article.created', 'date_published', 'vr:published_time',
    'cxenseparse:recs:publishtime', 'article_date_original', 'cXenseParse:recs:publishtime', 
    'DATE_PUBLISHED', 'shareaholic:article_published_time', 'parsely-pub-date', 'twt-published-at',
    'published_date', 'dc.date', 'field-name-post-date', 'Last-modified'
  ];

  const metaData = article.querySelectorAll('meta');

  for (let meta of metaData) {
    const property = meta.getAttribute('name') || meta.getAttribute('property') || meta.getAttribute('itemprop') || meta.getAttribute('http-equiv');
    
    if (property && possibleProperties.includes(property)) {
      console.log(property)
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

function checkSelectors(article) {
  // console.log('checkSelectors()')
  const possibleSelectors = [
    'datePublished', 'published', 'pubdate', 'timestamp', 'timeStamp', 'post__date', 'Article__Date', 'pb-timestamp', 
    'meta', 'lastupdatedtime', 'article__meta', 'post-time', 'video-player__metric', 'Timestamp-time', 'report-writer-date',
    'published_date', 'byline', 'date-display-single', 'tmt-news-meta__date', 'blog-post-meta', 'timeinfo-txt', 'field-name-post-date',
    'post--meta', 'article-dateline', 'storydate', 'content-head', 'news_date'
  ];

  for (let selector of possibleSelectors) {
    let selectorString = `[itemprop="${selector}"], .${selector}, #${selector}`;
    let elements = article.querySelectorAll(selectorString);
    
    // Loop through elements to see if one is a date
    if (elements && elements.length) {
      for (let element of elements) {
        console.log(element)
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
      console.log(dateString)
      const date = getDateFromString(dateString);
      if (date) return date;
    }
  }
  // if (timeElement) {
    
  // }

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

function getMomentObject(dateString) {
  if (!dateString) return null;
  // var date;

  // Account for dateStrings that are just a string of numbers i.e. 11082018
  // First check dates formatted with month before day
  // console.log(dateString)
  // dateString = parseDigitOnlyDate(dateString);
  // const singleLineDate = parseSingleLineDate(dateString);

  // if (singleLineDate) {
  //   date = moment(singleLineDate);
  //   if (isValid(date)) return date;
  // }

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
  // var dateNumbers = dateString.match(/\d{8}/);
  const dateNumbers = parseDigitOnlyDate(dateString);

  if (dateNumbers) {
    // dateNumbers = dateNumbers[0].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
    date = moment(dateNumbers);
    if (isValid(date)) return date;
  }

  console.log('FINALLY HERE: ', dateString)

  // Use today's date if the string contains 'today'
  if (dateString.includes('today')) {
    return moment();
  }
  

  // Could not parse date from string
  return null;
}
// (\d{1,2})(\d{1,4})$
// function parseSingleLineDate(dateString) {
//   if (!dateString) return null;
//   if (moment.isMoment(dateString)) return dateString;

//   // const dateTest = /^(2\d{3}|\d{4})(?:[\.\/-]?)(\d{1,2})(?:[\.\/-]?)(\d{1,2})|(\d{1,2})(?:[\.\/-]?)(\d{1,2})-(\d{1,4})$/;
//   // const dateTest = /^(2\d{3}|\d{1,2})(\d{1,2})(\d{1,4})$/;
//   const dateTest = /\\b((?:2\d{3})|(?:\d{1,2}))(?:[\.\/-]?)(\d{2})(?:[\.\/-]?)(\d{2,4})\\b/;

//   const dateArray = String(dateString).match(dateTest);
//   console.log(dateString)

//   // const dateArray = dateString.replace(dateTest, '$1-$2-$3').split('-');

//   // if (!dateArray || dateArray.length === 1) return dateString;

//   if (dateArray && dateArray.length >= 4) {
//     var day, month, year;
//     console.log(dateArray)

//     if (dateArray[1].length === 4) {
//       console.log('here')
//       year = dateArray[1];

//       if (parseInt(dateArray[2]) > 12) {
//         day = dateArray[2];
//         month = dateArray[3];
//       } else {
//         day = dateArray[3];
//         month = dateArray[2];
//       }
//     } else {
//       console.log('there')
//       year = dateArray[3];

//       if (parseInt(dateArray[2]) > 12) {
//         day = dateArray[2];
//         month = dateArray[1];
//       } else {
//         day = dateArray[1];
//         month = dateArray[2];
//       }
//     }

//     return `${month}-${day}-${year}`;
//   }

//   return dateString;
// }

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
  
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    const obj = { publishDates: JSON.stringify(cachedDates) };
    chrome.storage.local.set(obj);
  }, 2000);
}

moment.suppressDeprecationWarnings = true;