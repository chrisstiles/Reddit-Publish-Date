import {
  addJsAPIMetaTag,
  getDateForPost,
  createDateWrapper,
  shouldCheckURL,
  setPostAsSeen
} from './helpers';
import { redditVersions } from '@constants';

const allowedRoutes = ['frontpage', 'subreddit', 'post_page'];

export default function init() {
  addJsAPIMetaTag();

  const wrapper = document.querySelector('shreddit-app');
  if (!wrapper) return;

  const observer = new MutationObserver(() => {
    if (allowedRoutes.includes(wrapper.getAttribute('routename'))) {
      updatePage();
    }
  });

  observer.observe(wrapper, { childList: true, subtree: true });

  updatePage();
}

function updatePage() {
  const postSelector =
    'shreddit-post[post-type="link"]:not([data-checked-date])';

  document.querySelectorAll(postSelector).forEach(updatePost);
}

function updatePost(post) {
  if (post?.hasAttribute('data-checked-date')) return;

  setPostAsSeen(post);

  if (post?.getAttribute('post-type') !== 'link') {
    return;
  }

  const postId = post.id?.replace('t3_', '');
  const url = post.getAttribute('content-href');

  if (!postId || !shouldCheckURL(url)) return;

  const prevElement = post.querySelector('faceplate-timeago');
  if (!prevElement) return;

  createDateWrapper(postId, prevElement, redditVersions.REDDIT_REDESIGN_2);
  getDateForPost(postId, url);
}
