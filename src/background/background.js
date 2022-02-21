import getPublishDate, { getMomentObject } from './get-publish-date';
import moment from 'moment';
import { MAX_CACHED_DATES, DEFAULT_OPTIONS } from '@constants';

////////////////////////////
// Find publish dates for posts
////////////////////////////

chrome.runtime.onMessage.addListener((request = {}, sender) => {
  const { type, postId, url } = request;

  // Check if the date has been cached before parsing page
  if (type === 'get-date') {
    const { id: tabId } = sender.tab;

    chrome.storage.local.get(postId, dateObject => {
      let dateString = dateObject[postId];

      if (dateString) {
        let isEstimate = false;

        if (dateString.includes('estimate')) {
          isEstimate = true;
          dateString.replace('estimate', '');
        }

        sendDateMessage(tabId, postId, dateString, isEstimate);

        return;
      }

      getDateFromPage(postId, url, tabId);
    });
  }
});

async function getDateFromPage(postId, url, tabId) {
  try {
    const date = (await getPublishDate(url))?.publishDate;

    // Publish date was successfully found,
    // send to client script and cache result
    if (date) {
      handleDateFound(tabId, postId, date);
    }
  } catch (error) {
    console.error(error);
  }
}

// Send date back to client script
async function sendDateMessage(tabId, postId, date, isEstimate) {
  const formattedDate = await formatDate(date);

  if (formattedDate) {
    const data = { postId, date: formattedDate };
    const options = await getOptions();
    const cssClasses = [];

    if (options.displayType === 'bubble') {
      cssClasses.push('rpd-bubble');
    } else {
      cssClasses.push('rpd-text');
    }

    if (options.showColors) {
      cssClasses.push('rpd-color');
      cssClasses.push(getColorClass(date));
    } else {
      cssClasses.push('rpd-no-color');
    }

    if (options.boldText) {
      cssClasses.push('rpd-bold');
    }

    if (options.dateType === 'relative') {
      cssClasses.push('rpd-relative');
    } else {
      cssClasses.push('rpd-date');
    }

    if (options.isEstimate) {
      cssClasses.push('rpd-estimate');
    }

    data.cssClasses = cssClasses;
    chrome.tabs.sendMessage(tabId, data);
  }
}

function handleDateFound(tabId, postId, date, isEstimate) {
  sendDateMessage(tabId, postId, date, isEstimate);
  cachePublishDates(postId, date);
}

////////////////////////////
// Date Helpers
////////////////////////////

async function formatDate(date) {
  if (!date) return null;
  if (!moment.isMoment(date)) date = getMomentObject(date);
  if (!isValid(date)) return null;

  const { dateType, dateFormat } = await getOptions();

  if (dateType === 'date') {
    return date.format(dateFormat);
  } else {
    return getRelativeDate(date);
  }
}

function getRelativeDate(date) {
  const startOfPublishDate = date.clone().startOf('d');
  const today = moment();
  const yesterday = moment().subtract(1, 'd').startOf('d');

  if (date.isSameOrAfter(today, 'd')) {
    return 'today';
  } else if (date.isSame(yesterday, 'd')) {
    return 'yesterday';
  } else {
    return startOfPublishDate.from(today.startOf('d'));
  }
}

function getColorClass(_date) {
  const date = moment(_date);
  if (!isValid(date)) return 'invalid';

  const today = moment().startOf('d');

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
  }

  // Future date
  if (date.isAfter(today, 'd')) {
    return 'rpd-future';
  }

  return 'rpd-invalid';
}

function isValid(date) {
  if (!moment.isMoment(date)) date = moment(date);
  const input = date._i;
  if (!input) return false;

  // Check if the date is on or before tomorrow to account for time zone differences
  const tomorrow = moment().add(1, 'd');
  const longAgo = moment().subtract(20, 'y');
  const inputLength = date._i.length;
  const digits = date._i.match(/\d/g);
  const digitLength = !digits ? 0 : digits.length;

  return (
    date.isValid() &&
    date.isSameOrBefore(tomorrow, 'd') &&
    date.isSameOrAfter(longAgo) &&
    inputLength >= 5 &&
    digitLength >= 3
  );
}

function isToday(date) {
  if (!date) return false;
  if (!moment.isMoment(date)) date = getMomentObject(date);

  const today = moment();

  return date.isValid() && date.isSame(today, 'd');
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

function cachePublishDates(postId, date, isEstimate) {
  if (!moment.isMoment(date)) date = getMomentObject(date);
  if (!date) return;

  let dateString = date.toISOString();
  if (isEstimate) dateString += 'estimate';

  cache[postId] = dateString;
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

      if (error) {
        console.log(error.message);
      }

      if (
        cachedIds.length >= MAX_CACHED_DATES ||
        error?.message?.toLowerCase().includes('quota exceeded')
      ) {
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

  oldIds.forEach(id => delete cache[id]);
}

function clearCache() {
  chrome.storage.local.clear(function () {
    cachedIds = [];
    currentIds = [];
    cache = { cachedIds };
    hasLoadedCachedIds = false;

    let error = chrome.runtime.lastError;

    if (error) {
      console.error(error);
    }
  });
}

globalThis.clearExtensionCache = clearCache;

////////////////////////////
// Extension Options
////////////////////////////

let options = null;

async function getOptions() {
  if (options) {
    return Promise.resolve(Object.assign({}, DEFAULT_OPTIONS, options));
  }

  return new Promise(resolve => {
    chrome.storage.sync.get(DEFAULT_OPTIONS, savedOptions => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        return resolve(DEFAULT_OPTIONS);
      }

      options = savedOptions;

      resolve(options);
    });
  });
}

getOptions();

chrome.runtime.onMessage.addListener((request = {}) => {
  const { type, ...savedOptions } = request;

  if (type === 'options-changed') {
    options = Object.assign({}, DEFAULT_OPTIONS, savedOptions);
  }

  return true;
});

moment.suppressDeprecationWarnings = true;
