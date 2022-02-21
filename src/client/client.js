import './client.scss';

(function () {
  const isOldReddit = !document.querySelector('meta[name="jsapi"]');
  let isCommentsPage = window.location.pathname.includes('comments');

  // Methods to update the page differ between
  // new/old reddit, so we add the correct ones here
  const methods = {};

  if (isOldReddit) {
    // The old Reddit design uses traditional server-side rendering
    methods.updatePost = (postId, url, postElement) => {
      postId = postId.replace('t3_', '');

      if (postElement) {
        postElement.setAttribute('data-checked-date', true);
        const author = postElement.querySelector('.author');

        if (author) {
          createDateWrapper(postId, author);
          getPublishedDate(postId, url);
        }
      }
    };

    methods.updateListingPage = () => {
      const links = document.querySelectorAll(`.link[data-context="listing"]`);

      if (links) {
        for (let link of links) {
          updateLink(link);
        }
      }
    };

    methods.updateCommentsPage = () => {
      const link = document.querySelector(
        '#siteTable .thing[data-type="link"]'
      );
      updateLink(link);
    };

    function updateLink(link) {
      if (!link) return;

      if (!link.hasAttribute('data-checked-date')) {
        if (!link.classList.contains('self')) {
          const id = link.getAttribute('data-fullname');
          const url = link.getAttribute('data-url');

          if (id && shouldCheckURL(url)) {
            methods.updatePost(id, url, link);
          } else {
            link.setAttribute('data-checked-date', true);
          }
        } else {
          link.setAttribute('data-checked-date', true);
        }
      }
    }

    if (isCommentsPage) {
      methods.updateCommentsPage();
    } else {
      methods.updateListingPage();
    }

    // Re-check dates when reddit enhancement suite loads new posts
    window.addEventListener(
      'neverEndingLoad',
      methods.updateListingPage,
      false
    );
  } else {
    // Watch for reddit's jsapi events to handle
    // post elements being added to the DOM
    const meta = document.createElement('meta');
    meta.name = 'Reddit Published Date';
    meta.content = 'Reddit Published Date';
    document.head.appendChild(meta);
    meta.dispatchEvent(new CustomEvent('reddit.ready'));

    // Listen for jsapi events
    document.addEventListener('reddit', handleRedditEvent, true);
    document.addEventListener('reddit.urlChanged', handleUrlChanged, true);

    function handleRedditEvent(e) {
      const { type } = e.detail;

      if (type === 'post') {
        methods.updateListingPage(e);
      } else if (isCommentsPage && type === 'postAuthor') {
        // The 'post' event type doesn't run on comment
        // pages that aren't viewed in the modal window.
        // Instead we use the postAuthor type to know when the post has been added
        methods.updateCommentsPage(e);
      }
    }

    methods.updateListingPage = e => {
      const { id, sourceUrl: url, media } = e.detail.data;
      if (!id) return;

      if (shouldCheckURL(url, media)) {
        // Find the element using the event data or querying the ID
        const elements = e.path;

        // This main scroller item seems to usually be at position 2
        if (elements[2].classList.contains('scrollerItem')) {
          methods.updatePost(e, elements[2]);
          return;
        }

        // Next try simply querying for the ID. Promoted posts
        // have long IDs that will throw an error, so avoid those
        if (id.length <= 20) {
          const postElement = document.querySelector(`#${id}`);

          if (postElement) {
            methods.updatePost(e, postElement);
          }

          return;
        }

        // Finally try looping through the path to find the post element
        for (let i = 0; i < elements.length; i++) {
          const element = elements[i];

          if (
            element instanceof Element &&
            element.classList.contains('scrollerItem')
          ) {
            methods.updatePost(e, element);

            return;
          }
        }
      }
    };

    const getTimestampEl = (wrapper, id, sub) => {
      const selectors = [id.replace(/^[^_]*_/, ''), id]
        .map(postPath => `a[href*="${sub}/comments/${postPath}" i]`)
        .join(', ');

      const commentLinks = wrapper.querySelectorAll(selectors);

      return (
        Array.from(commentLinks).find(el => {
          return (
            el.dataset.clickId === 'timestamp' || el.outerHTML.includes('time')
          );
        }) ??
        commentLinks[0] ??
        null
      );
    };

    methods.updateCommentsPage = e => {
      const { id } = e.detail.data.post;
      const { name: sub } = e.detail.data.subreddit;

      if (!id || !sub) {
        return;
      }

      const wrapper =
        e.path?.find?.(el => el.id === id) ??
        document.querySelector(`#overlayScrollContainer #${id}`) ??
        document.querySelector(`#${id}`);

      if (wrapper && !wrapper.hasAttribute('data-checked-date')) {
        methods.updatePost(e, wrapper);
      }
    };

    function handleUrlChanged(e) {
      isCommentsPage = e.detail.location.pathname.includes('comments');
    }

    methods.updatePost = (e, postElement) => {
      const id = e.detail.data.post?.id ?? e.detail.data.id;
      const { name: sub } = e.detail.data.subreddit;

      if (!id || !sub) {
        return;
      }

      if (postElement) {
        if (postElement.hasAttribute('data-checked-date')) {
          return;
        }

        postElement.setAttribute('data-checked-date', 'true');

        const timestampEl = getTimestampEl(postElement, id, sub);
        const url =
          e.detail.data.permalink ?? timestampEl?.getAttribute('href');

        if (timestampEl && url) {
          createDateWrapper(id, timestampEl);
          getPublishedDate(id, url);
        }
      }
    };
  }

  function getPublishedDate(postId, url) {
    chrome.runtime.sendMessage({ postId, url, type: 'get-date' });
  }

  // Handle background.js message with article date
  chrome.runtime.onMessage.addListener(({ postId, date, cssClasses }) => {
    if (date && postId) {
      insertPublishDate(postId, date, cssClasses);
    }
  });

  function createDateWrapper(postId, previousElement) {
    if (!previousElement) {
      return;
    }

    const publishElement = document.createElement('span');
    const selector = isCommentsPage
      ? `DatePublishedComments--${postId}`
      : `DatePublishedListing--${postId}`;

    publishElement.classList.add('rpd-publish-date');
    publishElement.classList.add(isOldReddit ? 'old-reddit' : 'new-reddit');
    publishElement.setAttribute('id', selector);

    previousElement.after(publishElement);
  }

  function insertPublishDate(postId, date, cssClasses) {
    if (!postId || !date) {
      return;
    }

    const selector = isCommentsPage
      ? `DatePublishedComments--${postId}`
      : `DatePublishedListing--${postId}`;

    const publishElement = document.querySelector(`#${selector}`);

    if (publishElement) {
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
  }

  function shouldCheckURL(url, media) {
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
      if (url.includes(`.${domain}`) || url.includes(`//${domain}`))
        return false;
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
})();
