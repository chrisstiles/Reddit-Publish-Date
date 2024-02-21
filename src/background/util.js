export function fetchTimeout(url, ms, { signal, ...options } = {}) {
  const controller = new AbortController();
  const promise = fetch(url, { signal: controller.signal, ...options });
  if (signal) signal.addEventListener('abort', () => controller.abort());
  const timeout = setTimeout(() => controller.abort(), ms);
  return promise.finally(() => clearTimeout(timeout));
}

export function freeRegExp() {
  /\s*/g.exec('');
}

export function innerText(el) {
  el.querySelectorAll('script, style').forEach(s => s.remove());
  return el.textContent
    .replace(/\n\s*\n/g, '\n')
    .replace(/  +/g, '')
    .trim();
}

export function isValidURL(url) {
  if (!url) return false;
  url = url.trim();
  if (url.endsWith('.') || url.endsWith('./')) return false;

  return !!url.match(
    /(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g
  );
}

export function includesUrl(data, url) {
  if (!(url instanceof URL)) url = new URL(url);

  const root = url.hostname.replace(/^www\./, '');

  return !!data.find(item => {
    if (
      item === root ||
      (url.hostname.includes('www.') && item === url.hostname)
    ) {
      return true;
    }

    if (!item.includes(root) || !item.includes('/')) {
      return false;
    }

    // Check if only certain paths for a domain are included
    const path = item.replace(/[^/]*\//, '/');
    return url.pathname.startsWith(path);
  });
}
