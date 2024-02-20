import {
  addJsAPIMetaTag,
  getDateForPost,
  isCommentsPage as isInitialCommentsPage,
  createDateWrapper,
  shouldCheckURL
} from './helpers';

let isCommentsPage = isInitialCommentsPage();

export default function init() {
  addJsAPIMetaTag();

  // Listen for jsapi events
  document.addEventListener('reddit', handleRedditEvent, true);
  document.addEventListener('reddit.urlChanged', handleUrlChanged, true);
}

function updatePost(e, postElement) {
  const { id, url, sub } = getEventData(e);
  if (
    !id ||
    !sub ||
    !postElement ||
    postElement.hasAttribute('data-checked-date')
  ) {
    return;
  }
  postElement.setAttribute('data-checked-date', 'true');

  const timestampEl = getTimestampEl(postElement, id, sub);

  if (timestampEl && url) {
    createDateWrapper(id, timestampEl, 'reddit-redesign-1');
    getDateForPost(id, url);
  }
}

function updateListingPage(e) {
  const { id, url, media } = getEventData(e);

  if (!id || !shouldCheckURL(url, media)) {
    return;
  }

  const scrollerItem = e.target?.closest?.('.scrollerItem');

  if (scrollerItem) {
    updatePost(e, scrollerItem);
    return;
  }

  // Find the element using the event data or querying the ID
  const elements = e.path ?? e.composedPath?.();
  if (!Array.isArray(elements)) return;

  // This main scroller item seems to usually be at position 2
  if (elements[2]?.classList?.contains('scrollerItem')) {
    updatePost(e, elements[2]);
    return;
  }
  // Next try simply querying for the ID. Promoted posts
  // have long IDs that will throw an error, so avoid those
  if (id.length <= 20) {
    const postElement = document.querySelector(`#${id}`);
    if (postElement) updatePost(e, postElement);
    return;
  }

  // Finally try looping through the path to find the post element
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];

    if (
      element instanceof Element &&
      element.classList.contains('scrollerItem')
    ) {
      updatePost(e, element);
      return;
    }
  }
}

function updateCommentsPage(e) {
  const { id, url, media } = getEventData(e);

  if (!id || !shouldCheckURL(url, media)) {
    return;
  }

  const post = e.target?.closest?.('.Post');

  if (post) {
    updatePost(e, post);
    return;
  }

  const elements = e.path ?? e.composedPath?.();

  const element =
    elements?.find?.(el => el.id === id) ??
    document.querySelector(`#overlayScrollContainer #${id}`) ??
    document.querySelector(`#${id}:not(.scrollerItem)`);

  if (element) {
    updatePost(e, element);
  }
}

function handleRedditEvent(e) {
  if (e.detail.type === 'post') {
    if (isCommentsPage) {
      updateCommentsPage(e);
    } else {
      updateListingPage(e);
    }
  }
}

function getEventData(e = {}) {
  const { id, sourceUrl: url, media } = e?.detail?.data ?? {};
  const subreddit = e?.detail?.data?.subreddit ?? {};
  return { id, url, media, sub: subreddit.name };
}

function getTimestampEl(wrapper, id, sub) {
  const timestamp = wrapper.querySelector('[data-testid="post_timestamp"]');
  if (timestamp) return timestamp;

  const selectors = [id.replace(/^[^_]*_/, ''), id]
    .map(postPath => `a[href*="${sub}/comments/${postPath}" i]`)
    .join(', ');

  const commentLinks = Array.from(wrapper.querySelectorAll(selectors));

  return (
    commentLinks.find(
      el =>
        el.dataset.clickId === 'timestamp' ||
        el.dataset.testid === 'post_timestamp'
    ) ??
    commentLinks.find(el => el.outerHTML.includes('time')) ??
    commentLinks[0] ??
    null
  );
}

function handleUrlChanged(e) {
  isCommentsPage = e.detail.location.pathname.includes('comments');
}
