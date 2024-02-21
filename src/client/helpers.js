export async function getRedditVersion(retryDelay = 1000, maxRetries = 5) {
  const getVersion = () => {
    if (document.querySelector('shreddit-app')) {
      return 'reddit-redesign-2';
    }

    if (
      window.location.hostname === 'old.reddit.com' ||
      !!document.documentElement.getAttribute('xmlns')
    ) {
      return 'old-reddit';
    }

    if (document.querySelector('meta[name="jsapi"]')) {
      return 'reddit-redesign-1';
    }

    return 'unknown';
  };

  let retryCount = 0;
  let version = getVersion();

  while (version === 'unknown' && retryCount < maxRetries) {
    await sleep(retryDelay);
    version = getVersion();
    retryCount++;
  }

  return version;
}

export async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getDateForPost(postId, url) {
  chrome.runtime.sendMessage({ postId, url, type: 'get-date' });
}

export function isCommentsPage() {
  return window.location.pathname.includes('/comments/');
}

export function insertPublishDate(postId, date, cssClasses) {
  if (!postId || !date) return;

  const selector = isCommentsPage()
    ? `DatePublishedComments--${postId}`
    : `DatePublishedListing--${postId}`;

  const publishElement = document.querySelector(`#${selector}`);
  if (!publishElement) return;

  publishElement.innerHTML = `<span class="rpd-color-wrapper"></span><span>Published ${date}</span>`;

  if (cssClasses.length) {
    publishElement.classList.add(...cssClasses);

    const previousElement = publishElement.previousSibling;

    // Unify spacing with previous element
    if (previousElement) {
      previousElement.style.marginRight = '0px';

      // Prevent being flush with RES user tag
      if (previousElement.classList.contains('RESUserTag')) {
        publishElement.classList.add('after-user-tag');
      }
    }
  }
}

export function createDateWrapper(postId, previousElement, cssClass) {
  if (!previousElement) {
    return;
  }

  const publishElement = document.createElement('span');
  const selector = isCommentsPage()
    ? `DatePublishedComments--${postId}`
    : `DatePublishedListing--${postId}`;

  publishElement.classList.add('rpd-publish-date');

  if (cssClass) {
    publishElement.classList.add(...cssClass.split(' '));
  }

  publishElement.setAttribute('id', selector);

  previousElement.after(publishElement);
}

export function setPostAsSeen(postElement) {
  postElement?.setAttribute('data-checked-date', true);
}

export function shouldCheckURL(url, media) {
  if (!url || typeof url !== 'string' || !url.includes('http')) return false;
  url = url.toLowerCase();

  const invalidFileExtensions = [
    'jpg',
    'jpeg',
    'bmp',
    'png',
    'gif',
    'gifv',
    'mp4',
    'pdf'
  ];

  for (let extension of invalidFileExtensions) {
    if (url.includes(`.${extension}`)) return false;
  }

  const invalidDomains = [
    'reddit.com',
    'redd.it',
    'imgur.com',
    'gfycat.com',
    'wikipedia.com',
    'twitter.com'
  ];

  for (let domain of invalidDomains) {
    if (url.includes(`.${domain}`) || url.includes(`//${domain}`)) return false;
  }

  if (media) {
    const validMediaDomains = ['youtube.com', 'youtu.be', 'vimeo.com'];

    for (let domain of validMediaDomains) {
      if (url.includes(`.${domain}`) || url.includes(`//${domain}`))
        return true;
    }
  }

  return true;
}

export function addJsAPIMetaTag() {
  const meta = document.createElement('meta');
  meta.name = 'jsapi.consumer';
  meta.content = 'Reddit Published Date';
  document.head.appendChild(meta);
  meta.dispatchEvent(new CustomEvent('reddit.ready'));
}
