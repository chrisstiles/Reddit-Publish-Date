(function() {
  const isOldReddit = document.querySelector('meta[name="jsapi"]') ? false : true;
  let isCommentsPage = window.location.pathname.includes('comments');

  // This will be changed to be the function that updates
  // the post HTMl with the article date. The function
  // will differ based on which version of Reddit we're using
  let updatePost;

  if (isOldReddit) {
    // The old Reddit design uses traditional server-side rendering
    updatePost = function (postId, url, postElement) {
      postId = postId.replace('t3_', '');

      if (postElement) {
        postElement.setAttribute('data-checked-date', true);
        const author = postElement.querySelector('.author');

        if (author) {
          createDateWrapper(postId, author);
          getPublishedDate(postId, url);
        }

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

    if (isCommentsPage) {
      updateCommentsPage();
    } else {
      updateListingPage();
    }

    // Re-check dates when reddit enhancement suite loads new posts
    window.addEventListener('neverEndingLoad', updateListingPage, false);
  } else {
    // The new Reddit design uses Javascript to navigate
    // Watch for jsapi events to know when post elements are added to the DOM
    // Register extension
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
        updateListingPage(e);
      } else if (isCommentsPage && type === 'postAuthor') {
        // The 'post' event type doesn't run on comment
        // pages that aren't viewed in the modal window.
        // Instead we use the postAuthor type to know when the post has been added
        updateCommentsPage(e);
      }
    }

    function updateListingPage(e) {
      const { id, sourceUrl: url, media } = e.detail.data;
      if (!id) return;

      if (shouldCheckURL(url, media)) {
        const postElement = document.querySelector(`#${id}`);
        updatePost(id, url, postElement);
      }
    }

    function updateCommentsPage(e) {
      const { id } = e.detail.data.post;
      if (!id) return;

      let wrapper = null;
      if (document.querySelector('#overlayScrollContainer')) {
        wrapper = document.querySelector(`#overlayScrollContainer #${id}`);
      } else {
        wrapper = document.querySelector(`#${id}`);
      }

      if (wrapper && !wrapper.hasAttribute('data-checked-date')) {
        const link = wrapper.querySelector('a[rel="noopener noreferrer"]');

        if (link) {
          updatePost(id, link.getAttribute('href'), wrapper);
        }
      }
    }

    function handleUrlChanged(e) {
      isCommentsPage = e.detail.location.pathname.includes('comments');
    }

    updatePost = function (id, url, postElement) {
      if (postElement) {
        if (postElement.hasAttribute('data-checked-date')) {
          return;
        }

        postElement.setAttribute('data-checked-date', 'true');

        const timestamp = postElement.querySelector('[data-click-id="timestamp"]');

        if (timestamp) {
          // const element = isCommentsPage ? timestamp.previousSibling : timestamp.parentNode;

          // if (element) {
            createDateWrapper(id, timestamp);
            getPublishedDate(id, url);
          // }
        }
      }
    }
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
    const selector = isCommentsPage ? `DatePublishedComments--${postId}` : `DatePublishedListing--${postId}`;

    publishElement.classList.add('rpd-publish-date');
    publishElement.setAttribute('id', selector);
    
    if (isOldReddit) {
      previousElement.parentNode.insertBefore(publishElement, previousElement.nextSibling);
    } else {
      previousElement.parentNode.append(publishElement);
    }
  }

  function insertPublishDate(postId, date, cssClasses) {
    if (!postId || !date) {
      return;
    }

    const selector = isCommentsPage ? `DatePublishedComments--${postId}` : `DatePublishedListing--${postId}`;
    const publishElement = document.querySelector(`#${selector}`);

    if (publishElement) {
      publishElement.innerHTML = `<span>Published ${date}</span>`;
      if (cssClasses.length) {
        publishElement.classList.add(...cssClasses);
      }
    }
  }

  function shouldCheckURL(url, media) {
    if (!url || typeof url !== 'string' || !url.includes('http')) return false;
    url = url.toLowerCase();

    const invalidFileExtensions = ['jpg', 'jpeg', 'bmp', 'png', 'gif', 'gifv', 'mp4', 'pdf'];

    for (let extension of invalidFileExtensions) {
      if (url.includes(`.${extension}`)) return false;
    }

    const invalidDomains = ['reddit.com', 'redd.it', 'imgur.com', 'gfycat.com'];

    for (let domain of invalidDomains) {
      if (url.includes(`.${domain}`) || url.includes(`//${domain}`)) return false;
    }

    if (media) {
      const validMediaDomains = ['youtube.com', 'youtu.be', 'vimeo.com'];

      for (let domain of validMediaDomains) {
        if (url.includes(`.${domain}`) || url.includes(`//${domain}`)) return true;
      }
    }

    return true;
  }   
})();