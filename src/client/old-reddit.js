import {
  getDateForPost,
  isCommentsPage,
  createDateWrapper,
  shouldCheckURL
} from './helpers';

export default function init() {
  updatePage();

  window.addEventListener('neverEndingLoad', updateListingPage, false);
}

function updatePage() {
  if (isCommentsPage()) {
    updateCommentsPage();
  } else {
    updateListingPage();
  }
}

function updateListingPage() {
  const links = document.querySelectorAll(`.link[data-context="listing"]`);

  if (links) {
    for (let link of links) {
      updateLink(link);
    }
  }
}

function updateCommentsPage() {
  const link = document.querySelector('#siteTable .thing[data-type="link"]');

  updateLink(link);
}

function updatePost(postId, url, postElement) {
  postId = postId.replace('t3_', '');

  if (postElement) {
    postElement.setAttribute('data-checked-date', true);

    const author = postElement.querySelector('.author');

    if (author) {
      createDateWrapper(postId, author, 'old-reddit');
      getDateForPost(postId, url);
    }
  }
}

function updateLink(link) {
  if (!link) return;

  if (!link.hasAttribute('data-checked-date')) {
    if (!link.classList.contains('self')) {
      const id = link.getAttribute('data-fullname');
      const url = link.getAttribute('data-url');

      if (id && shouldCheckURL(url)) {
        updatePost(id, url, link);
      } else {
        link.setAttribute('data-checked-date', true);
      }
    } else {
      link.setAttribute('data-checked-date', true);
    }
  }
}
