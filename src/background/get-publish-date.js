import HTMLParser from 'node-html-parser';
import { get as getByKeyPath } from 'lodash';
import months from './data/months.json';
import {
  getMomentObject,
  isRecentDate,
  getDateFromRelativeTime,
  getDateFromString
} from './date-helpers';
import {
  fetchTimeout,
  freeRegExp,
  innerText,
  isValidURL,
  includesUrl
} from './util';

import * as defaultDataConfig from './data';

// Configuration for things like site specific date
// parsing are periodically fetched from the server
let config = defaultDataConfig;

////////////////////////////
// Date Parsing
////////////////////////////

export default function getPublishDate(url, checkModified, dataConfig) {
  if (!isValidURL(url)) {
    return Promise.reject('Invalid URL');
  }

  if (url.trim().match(/\.pdf($|\?)/)) {
    return Promise.reject('URL refers to a PDF');
  }

  if (includesUrl(config.ignoreDomains, url)) {
    return Promise.resolve(null);
  }

  updateConfig(dataConfig);

  return new Promise((resolve, reject) => {
    try {
      fetchArticleAndParse(url, checkModified)
        .then(resolve)
        .catch(error => {
          const maxErrorLength = 500;

          if (typeof error === 'string') {
            error = error.substring(0, maxErrorLength);
          } else if (error.message) {
            error = error.message.substring(0, maxErrorLength);
          }

          resolve(null);
        });
    } catch (error) {
      reject(error);
    }
  });
}

function updateConfig(dataConfig) {
  if (
    !dataConfig ||
    Array.isArray(dataConfig) ||
    typeof dataConfig !== 'object'
  ) {
    config = defaultDataConfig;
    return;
  }

  if (dataConfig === config) {
    return;
  }

  config = dataConfig;

  // Ensure shape of config matches what is expected
  Object.keys(defaultDataConfig).forEach(key => {
    const value = config[key];
    const defaultValue = defaultDataConfig[key];

    if (
      !value ||
      (Array.isArray(defaultValue) && !Array.isArray(value)) ||
      typeof defaultValue !== typeof value
    ) {
      config[key] = defaultValue;
    }
  });
}

function fetchArticleAndParse(url, checkModified) {
  return new Promise((resolve, reject) => {
    getArticleHtml(url)
      .then(html => {
        if (!html) reject('Error fetching HTML');

        const { date: publishDate, dom } = getDateFromHTML(html, url);

        const data = {
          publishDate,
          modifyDate:
            publishDate && checkModified
              ? getDateFromHTML(html, url, true, dom).date
              : null
        };

        // Avoid memory leaks from RegExp.lastMatch
        freeRegExp();

        if (data.publishDate) {
          resolve(data);
        } else {
          reject(`No date found: ${url}`);
        }
      })
      .catch(reject);
  });
}

function getArticleHtml(url) {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      headers: {
        Accept: 'text/html',
        'Content-Type': 'text/html'
      }
    };

    fetchTimeout(url, 30000, options)
      .then(async response => {
        if (response.status === 200) {
          resolve(await response.text());
          return;
        }

        reject(`status code ${response.status}, URL: ${url}`);
      })
      .catch(error => {
        reject(`${error}, ${url}`);
      });
  });
}

function getDateFromHTML(html, url, checkModified, dom) {
  let date = null;

  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return { date: getYoutubeDate(html), dom: null };
  }

  // Create virtual HTML document to parse
  if (!dom) {
    html = html
      .replace(/<style.*>\s?[^<]*<\/style>/g, '')
      .replace(/<style/g, '<disbalestyle')
      .replace(/<\/style /g, '</disablestyle');

    dom = HTMLParser.parse(html);
  }

  const article = dom;
  const data = { date: null, dom };

  if (!article?.querySelector) {
    return data;
  }

  const urlObject = new URL(url);
  const hostname = urlObject.hostname.replace(/^www./, '');

  // We can add site specific methods for
  // finding publish dates. This is helpful
  // for websites with incorrect/inconsistent
  // ways of displaying publish dates
  const site = config.sites[hostname];

  // Ignore site config it only contains metadata
  const ignoreSiteConfig =
    typeof site === 'object' &&
    Object.keys(site).every(
      k => k === 'metadata' || k === 'stopParsingIfNotFound'
    );

  if (site && !checkModified && !ignoreSiteConfig) {
    // String values refer to selectors
    if (typeof site === 'string') {
      data.date = checkSelectors(article, html, site, false, url);
    }

    if (
      typeof site === 'object' &&
      (site.key || site.method === 'linkedData')
    ) {
      // Some websites have different layouts for different
      // sections of the website (i.e. /video/).
      const { path, key, method = 'selector' } = site;

      // If URL is on the same site, but a different path we
      // will continue checking the data normally.
      if (
        method &&
        (!path || urlObject.pathname.match(new RegExp(path, 'i')))
      ) {
        switch (method) {
          case 'html':
            data.date = checkHTMLString(html, url, false, key);
            break;
          case 'selector':
            data.date = checkSelectors(article, html, site, false, url);
            break;
          case 'linkedData':
            data.date = checkLinkedData(article, html, false, key);
            break;
        }
      }
    }

    if (data.date || site.stopParsingIfNotFound) {
      return data;
    }
  }

  // Some domains have incorrect dates in their
  // URLs or LD JSON. For those we only
  // check the page's markup for the date
  const isHTMLOnly = includesUrl(config.htmlOnlyDomains, urlObject);

  // Try searching from just the HTML string with regex
  // We just look for JSON as it is not accurate to parse
  // HTML with regex, but is much faster than using the DOM
  if (!isHTMLOnly) {
    data.date = checkHTMLString(html, url, checkModified);
    if (data.date) return data;
  }

  // Attempt to get date from URL, we do this after
  // checking the HTML string because it can be inaccurate
  let urlDate = null;

  if (!isHTMLOnly && !checkModified) {
    urlDate = checkURL(url);

    if (urlDate && isRecentDate(urlDate, 3, url)) {
      data.date = urlDate;
      return data;
    }
  }

  // Some websites include linked data with information about the article
  data.date = checkLinkedData(article, url, checkModified);
  if (data.date) return data;

  // Next try searching <meta> tags
  data.date = checkMetaData(article, checkModified, url);
  if (data.date) return data;

  // Try checking item props and CSS selectors
  data.date = checkSelectors(article, html, null, checkModified, url);
  if (data.date) return data;

  // Use URL date if other parsing methods failed
  if (urlDate) data.date = urlDate;

  return data;
}

function checkHTMLString(html, url, checkModified, key) {
  if (!html) return null;

  const { jsonKeys } = config;

  const arr = key ? [key] : checkModified ? jsonKeys.modify : jsonKeys.publish;
  const regexString = `(?:(?:'|"|\\b)(?:${arr.join(
    '|'
  )})(?:'|")?: ?(?:'|"))([a-zA-Z0-9_.\\-:+, /]*)(?:'|")`;

  // First try with global
  let dateTest = new RegExp(regexString, 'ig');
  let dateArray = html.match(dateTest);

  if (dateArray && dateArray.length) {
    let dateString = dateArray[0];

    // Prefer publish date over other meta data dates
    for (let date of dateArray) {
      if (date.toLowerCase().includes('publish')) {
        dateString = date;
        break;
      }
    }

    if (dateString) {
      dateArray = dateString.match(
        /(?:["'] ?: ?["'])([ :.a-zA-Z0-9_-]*)(?:["'])/
      );

      if (dateArray && dateArray[1]) {
        let date = getMomentObject(dateArray[1], url);
        if (date) return date;
      }
    }
  }

  // Try matching without global flag
  dateTest = new RegExp(regexString, 'i');
  dateArray = html.match(dateTest);

  if (dateArray && dateArray[1]) {
    let date = getMomentObject(dateArray[1], url);
    if (date) return date;
  }

  return null;
}

function checkURL(url) {
  const skipDomains = ['cnn.com/videos'];
  for (let domain of skipDomains) {
    if (url.includes(domain)) return null;
  }

  const dateTest =
    /([\./\-_]{0,1}(19|20)\d{2})[\./\-_]{0,1}(([0-3]{0,1}[0-9][\./\-_])|(\w{3,5}[\./\-_]))([0-3]{0,1}[0-9][\./\-]{0,1})/;
  let dateString = url.match(dateTest);

  if (dateString) {
    let date = getMomentObject(dateString[0], url);
    if (date) return date;
  }

  const singleDigitTest = /\/(\d{8})\//;
  dateString = url.match(singleDigitTest);

  if (dateString) {
    let date = getMomentObject(dateString[0], url);
    if (date) return date;
  }

  return null;
}

function getYoutubeDate(html) {
  if (!html) return null;

  const dateTest = new RegExp(
    `(?:["']ytInitialData[",']][.\\s\\S]*dateText["'].*)((?:${months.join(
      '|'
    )}) \\d{1,2}, \\d{4})(?:['"])`,
    'i'
  );
  const dateArray = html.match(dateTest);

  if (dateArray && dateArray[1]) {
    return getMomentObject(dateArray[1]);
  }

  // Parse videos where date is like "4 hours ago"
  const dateDifferenceTest =
    /(?:["']ytInitialData[",']][.\s\S]*dateText["'].*["'](?:\w+ )+) ?(\d+) ((?:second|minute|hour|day|month|year)s?) (?:ago)(?:['"])/i;
  const dateDifferenceArray = html.match(dateDifferenceTest);

  if (dateDifferenceArray && dateDifferenceArray.length >= 3) {
    return getDateFromRelativeTime(
      dateDifferenceArray[1],
      dateDifferenceArray[2]
    );
  }

  return null;
}

function checkLinkedData(article, url, checkModified, specificKey) {
  let linkedData = article.querySelectorAll(
    'script[type="application/ld+json"], script[type="application/json"]'
  );

  const { jsonKeys } = config;
  const arr = checkModified ? jsonKeys.modify : jsonKeys.publish;

  if (linkedData && linkedData.length) {
    // Some sites have more than one script tag with linked data
    for (let node of linkedData) {
      try {
        let data = JSON.parse(node.innerHTML);

        if (specificKey) {
          return getMomentObject(getByKeyPath(data, specificKey), url);
        }

        for (let key of arr) {
          if (data[key]) {
            let date = getMomentObject(data[key], url);
            if (date) return date;
          }
        }
      } catch (e) {
        // The website has invalid JSON, attempt
        // to get the date with Regex
        let date = checkHTMLString(node.innerHTML, url, checkModified);
        if (date) return date;
      }
    }
  }

  return null;
}

function checkMetaData(article, checkModified, url) {
  const { metaAttributes } = config;
  const arr = checkModified ? metaAttributes.modify : metaAttributes.publish;
  const metaData = article.querySelectorAll('meta');
  const metaRegex = new RegExp(arr.join('|'), 'i');

  for (let meta of metaData) {
    const property =
      meta.getAttribute('name') ||
      meta.getAttribute('property') ||
      meta.getAttribute('itemprop') ||
      meta.getAttribute('http-equiv');

    if (property && metaRegex.test(property)) {
      const date = getMomentObject(meta.getAttribute('content'), url);
      if (date) return date;
    }
  }

  return null;
}

function checkSelectors(article, html, site, checkModified, url) {
  const specificSelector =
    !checkModified && site
      ? typeof site === 'string'
        ? site
        : site.key
      : null;

  const arr = specificSelector
    ? [specificSelector]
    : checkModified
    ? config.selectors.modify.slice()
    : config.selectors.publish.slice();

  // Since we can't account for every possible selector a site will use,
  // we check the HTML for CSS classes or IDs that might contain the publish date
  if (!specificSelector) {
    const possibleClassStrings = ['byline'];

    if (checkModified) {
      possibleClassStrings.push(...['update', 'modify']);
    } else {
      possibleClassStrings.push('publish');
    }

    const classTest = new RegExp(
      `(?:(?:class|id)=")([ a-zA-Z0-9_-]*(${possibleClassStrings.join(
        '|'
      )})[ a-zA-Z0-9_-]*)(?:"?)`,
      'gim'
    );

    let classMatch;
    while ((classMatch = classTest.exec(html))) {
      if (!arr.includes(classMatch[1])) {
        arr.push(classMatch[1]);
      }
    }
  }

  for (let selector of arr) {
    const selectorString = specificSelector
      ? specificSelector
      : `[itemprop^="${selector}" i], [class^="${selector}" i], [id^="${selector}" i], input[name^="${selector}" i]`;
    const elements = article.querySelectorAll(selectorString);

    // Loop through elements to see if one is a date
    if (elements && elements.length) {
      for (let element of elements) {
        if (site && typeof site === 'object' && site.attribute) {
          const value =
            site.attribute === 'innerText'
              ? innerText(element)
              : element.getAttribute(site.attribute);

          return getMomentObject(value, url, true);
        }

        const dateElement = element.querySelector('time') || element;
        const dateAttribute =
          dateElement.getAttribute('datetime') ||
          dateElement.getAttribute('content') ||
          dateElement.getAttribute('datePublished');

        if (dateAttribute) {
          const date = getMomentObject(dateAttribute, url);

          if (date) {
            return date;
          }
        }

        const dateString =
          innerText(dateElement) || dateElement.getAttribute('value');
        let date = getDateFromString(dateString, url);

        if (date) {
          return date;
        }

        date = checkChildNodes(element, url);
        if (date) return date;
      }
    }
  }

  if (specificSelector) {
    return null;
  }

  // Check for time elements that might be publication date
  const timeSelectors = checkModified
    ? 'time[updatedate], time[modifydate], time[dt-updated]'
    : 'article time[datetime], time[pubdate]';

  const timeElements = article.querySelectorAll(timeSelectors);

  if (timeElements && timeElements.length) {
    for (let element of timeElements) {
      const attributes = checkModified
        ? ['updatedate', 'modifydate', 'dt-updated', 'datetime']
        : ['pubdate', 'datetime'];
      const dateString =
        attributes.map(a => element.getAttribute(a)).find(d => d) ||
        innerText(element);

      let date = getDateFromString(dateString, url);

      if (date) {
        return date;
      }

      date = checkChildNodes(element);
      if (date) return date;
    }
  }

  if (checkModified) {
    return null;
  }

  // If all else fails, try searching for very generic selectors.
  // We only use this date if there is only one occurance
  const genericSelectors = [
    '.date',
    '#date',
    '.byline',
    '.data',
    '.datetime',
    '.submitted'
  ];
  for (let selector of genericSelectors) {
    const elements = article.querySelectorAll(
      `article ${selector}, .article ${selector}, #article ${selector}, header ${selector}, ${selector}`
    );

    if (elements.length === 1) {
      let date = getDateFromString(innerText(elements[0]), url);
      if (date) return date;

      date = checkChildNodes(elements[0]);
      if (date) return date;
    }
  }

  return null;
}

function checkChildNodes(parent, url) {
  const children = parent.childNodes;
  if (!children?.length) return null;

  for (let i = 0; i < children.length; i++) {
    const text = children[i].textContent.trim();
    const date = getDateFromString(text, url);

    if (date) {
      return date;
    }
  }

  return null;
}
