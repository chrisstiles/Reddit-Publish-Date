import moment from 'moment';
import months from './data/months.json';
import tlds from './data/tlds.json';

export function getMomentObject(dateString, url, ignoreLength) {
  if (!dateString) return null;
  if (!ignoreLength && dateString.length && dateString.length > 100) {
    return null;
  }

  let date = moment(dateString);
  if (isValidDate(date)) return date;

  // Check for multiple pieces of article metadata separated by the "|" character
  const parts = dateString.split('|');

  if (parts.length > 1) {
    for (const part of parts) {
      date = getMomentObject(part, url, ignoreLength);
      if (isValidDate(date)) return date;
    }
  }

  dateString = dateString
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
    .replace(/^.*(from|original|published|modified)[^ ]*/i, '')
    .trim();

  // Try to account for strangly formatted dates
  const timezones = ['est', 'cst', 'mst', 'pst', 'edt', 'cdt', 'mdt', 'pdt'];

  for (let timezone of timezones) {
    if (dateString.toLowerCase().includes(timezone)) {
      date = moment(dateString.substring(0, dateString.indexOf(timezone)));
      if (isValidDate(date)) return date;
    }
  }

  const monthsJoined = months.join('|');
  const dateSearch = new RegExp(
    `((((${monthsJoined})\.?\s+\d{1,2})|(\d{1,2}\s+(${monthsJoined})\.?)),?\s+\d{2,4}\b)`,
    'i'
  );
  const matchedDate = dateString.match(dateSearch);

  if (matchedDate) {
    date = moment(matchedDate[0]);
    if (isValidDate(date)) return date;
  }

  for (let month of months) {
    if (dateString.toLowerCase().includes(month)) {
      const monthSearch = new RegExp(`(\\d{1,4} )?${month}`, 'i');
      const startIndex = dateString.search(monthSearch);
      const yearIndex = dateString.search(/\d{4}/);
      const endIndex = yearIndex === -1 ? dateString.length : yearIndex + 4;

      date = moment(dateString.substring(startIndex, endIndex));
      if (isValidDate(date)) return date;
    }
  }

  // Some invalid date strings include the date without formatting
  let digitDate = dateString.replace(/[ \.\/-]/g, '');
  const dateNumbers = parseDigitOnlyDate(digitDate, url);

  if (dateNumbers) {
    date = moment(dateNumbers);
    if (isValidDate(date)) return date;
  }

  // Use today's date if the string contains 'today'
  if (dateString.includes('today')) {
    return moment();
  }

  // Could not parse date from string
  return null;
}

export function isValidDate(date) {
  if (!moment.isMoment(date)) date = moment(date);
  const input = date._i;
  if (!input) return false;

  if (date.isBefore(moment().subtract(10, 'y')) && !input.match(/\b\d{4}\b/)) {
    const year = new Date().getFullYear();
    date.year(year);
  }

  if (!date.isValid()) {
    return false;
  }

  // Check if the date is on or before tomorrow to account for time zone differences
  const tomorrow = moment().add(1, 'd');

  // There are a lot of false positives that return
  // January 1st of the current year. To avoid frequent
  // incorrect dates, we typically assume that a Jan 1
  // date is invalid unless the current month is January
  const jan1 = moment(`${new Date().getFullYear()}-01-01`);

  if (tomorrow.month() !== 0 && date.isSame(jan1, 'd')) {
    return false;
  }

  const longAgo = moment().subtract(19, 'y');
  const inputLength = date._i.length;
  const digits = date._i.match(/\d/g);
  const digitLength = !digits ? 0 : digits.length;

  return (
    date.isSameOrBefore(tomorrow, 'd') &&
    date.isSameOrAfter(longAgo) &&
    inputLength >= 5 &&
    digitLength >= 3
  );
}

export function isRecentDate(date, difference = 31, url) {
  if (!date) return false;
  if (!moment.isMoment(date)) date = getMomentObject(date, url);

  const tomorrow = moment().add(1, 'd');
  const lastMonth = tomorrow.clone().subtract(difference, 'd');

  return date.isValid() && date.isBetween(lastMonth, tomorrow, 'd', '[]');
}

////////////////////////////
// Date Parsing
////////////////////////////

export function parseDigitOnlyDate(dateString, url) {
  if (!dateString) return null;

  let matchedDate = dateString
    .replace(/\/|-\./g, '')
    .match(/\b(\d{6}|\d{8})\b/);

  if (!matchedDate) {
    matchedDate = dateString.match(/\d{8}/);
    if (!matchedDate) {
      return null;
    } else {
      return matchedDate[0];
    }
  }

  dateString = matchedDate[0];

  if (dateString.length === 6) {
    const dateArray = dateString
      .replace(/(\d{2})(\d{2})(\d{2})/, '$1-$2-$3')
      .split('-');

    const date = getDateFromParts(dateArray, url);
    if (date && isValidDate(date)) return date;
  } else {
    let date = getDateFromParts(
      dateString.replace(/(\d{2})(\d{2})(\d{4})/, '$1-$2-$3'),
      url
    );

    if (date && isValidDate(date)) return date;

    date = getDateFromParts(
      dateString.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
      url
    );

    if (date && isValidDate(date)) return date;
  }

  return null;
}

export function getDateFromString(string, url) {
  if (!string || !string.trim()) return null;
  string = string.trim();
  let date = getMomentObject(string, url);
  if (date) return date;

  string = string
    .replace(/\b\d{1,2}:\d{1,2}.*/, '')
    .replace(/([-\/]\d{2,4}) .*/, '$1')
    .trim();

  date = getMomentObject(string, url);
  if (date) return date;

  date = getMomentObject(getDateFromParts(string, url));
  if (date) return date;

  const numberDateTest = /^\d{1,2}[\.\/-]\d{1,2}[\.\/-]\d{1,4}$/;
  let dateString = string.match(numberDateTest);

  if (dateString) date = getMomentObject(dateString[0], url);
  if (date) return date;

  dateString = string.match(/(?:published):? (.*$)/i);
  if (dateString) date = getMomentObject(dateString[1], url);
  if (date) return date;

  const stringDateTest = new RegExp(
    `/(${months.join('|')})\w*\b \d{1,2},? {1,2}(\d{4}|\d{2})/i`,
    'i'
  );
  dateString = string.match(stringDateTest);
  if (dateString) date = getMomentObject(dateString[0], url);
  if (date) return date;

  dateString = string
    .replace(/at|on|,/g, '')
    .replace(/(\d{4}).*/, '$1')
    .replace(/([0-9]st|nd|th)/g, '')
    .replace(/posted:*/i, '')
    .replace(
      /.*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i,
      ''
    )
    .trim();

  date = getMomentObject(dateString, url);
  if (date) return date;

  return null;
}

export function getDateFromRelativeTime(num, units) {
  if ((!num && num !== 0) || !units) return null;
  if (!isNaN(num) && typeof units === 'string') {
    const date = moment().subtract(num, units);
    if (isValidDate(date)) return date;
  }

  return null;
}

export function getDateFromParts(nums = [], url) {
  if (!nums) {
    return null;
  }

  if (typeof nums === 'string') {
    nums = nums
      .replace(/[\n\r]+|[\s]{2,}/g, ' ')
      .trim()
      .replace(/[\.\/-]/g, '-')
      .split('-');
  }

  if (!Array.isArray(nums)) {
    return null;
  }

  if (nums.length > 1) {
    nums[0] = nums[0].replace(/\S*\s/g, '');
  }

  let day, month, year;
  let [num1, num2, num3] = nums;

  if (isNaN(parseInt(num1)) || isNaN(parseInt(num2))) return null;

  // Use tomorrow for dates to account for time zones
  const tomorrow = moment().add(1, 'd');
  const currentDay = tomorrow.date();
  const currentYear = tomorrow.year();
  const currentMonth = tomorrow.month() + 1;
  const prefer = {
    YMD: true,
    DMY: false,
    MDY: true
  };

  // When a date string is something like 1/2/20, we attempt
  // to guess which number is the month and which is the day.
  // We default parsing as <month>/<day>/<year>
  if (url) {
    const domain = new URL(url).hostname.split('.').pop();
    if (tlds[domain]) Object.assign(prefer, tlds[domain]);
  }

  num1 = String(num1);
  num2 = String(num2);

  if (!isNaN(parseInt(num3))) {
    num3 = String(num3).replace(/(\d{2,4})\b.*/, '$1');

    if (num1.length === 4) {
      if (num3.length === 4) {
        return null;
      }

      day = parseInt(num3);
      month = parseInt(num2);
      year = parseInt(num1);
    } else {
      if (!num3.match(/^\d{2,4}$/)) {
        return null;
      }

      if (num3.length === 2) {
        num3 = String(currentYear).substr(0, 2) + num3;
      }

      day = prefer.MDY ? parseInt(num2) : parseInt(num1);
      month = prefer.MDY ? parseInt(num1) : parseInt(num2);
      year = parseInt(num3);
    }
  } else {
    day = prefer.MDY ? parseInt(num2) : parseInt(num1);
    month = prefer.MDY ? parseInt(num1) : parseInt(num2);
    num3 = String(currentYear);
    year = parseInt(num3);
  }

  // Month can't be greater than 12 or in the future
  if (month > 12 || month > currentMonth) {
    const _day = day;
    day = month;
    month = _day;
  }

  // Day cannot be in the future
  if (month === currentMonth && day > currentDay && year === currentYear) {
    if (month < currentDay && day <= currentMonth) {
      const _day = day;
      day = month;
      month = _day;
    }
  }

  if (day > 31 || month > 12 || year > currentYear) {
    return null;
  }

  if (day && month && year) {
    return `${month}-${day}-${year}`;
  }

  return null;
}
