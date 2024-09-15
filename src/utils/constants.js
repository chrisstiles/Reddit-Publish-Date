import { tlds } from '../background/data';

export const MAX_CACHED_DATES = 25000;
export const DEFAULT_OPTIONS = Object.freeze({
  dateType: 'relative',
  displayType: 'text',
  showColors: true,
  boldText: true,
  // Get's the default short date format for the user's locale
  get dateFormat() {
    const language = navigator.language || 'en-US';
    const localeParts = language.split(/[\-_]+/);
    const country = localeParts[localeParts.length - 1]?.trim() || 'US';
    const datePreference = tlds[country.toLowerCase()] ?? {
      YMD: true,
      DMY: false,
      MDY: true
    };

    // Delimiter used for short dates in user's locale
    const d =
      new Intl.DateTimeFormat(undefined, { dateStyle: 'short' })
        .format(new Date())
        .split('')
        .find(c => /[\-\/\.]/.test(c)) ?? '/';

    if (datePreference.MDY) return `M${d}D${d}YY`;
    if (datePreference.DMY) return `D${d}M${d}YY`;
    if (datePreference.YMD) return `YYYY${d}M${d}D`;

    return 'M/D/YY';
  }
});
export const CACHE_DATA_CONFIG_DAYS = 7;
export const CONFIG_FETCH_RETRY_MS = 10000; // 10 seconds
export const MAX_CONFIG_FETCH_RETRIES = 5;
export const redditVersions = {
  REDDIT_REDESIGN_1: 'reddit-redesign-1',
  REDDIT_REDESIGN_2: 'reddit-redesign-2',
  OLD_REDDIT: 'old-reddit',
  UNKNOWN: 'unknown'
};
