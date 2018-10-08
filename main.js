(function() {
  const isOldReddit = document.querySelector('meta[name="jsapi"]') ? false : true;
  console.log(isOldReddit)
  // The new Reddit design uses Javascript to navigate
  // Watch for jsapi events to know when post elements are added to the DOM
  if (!isOldReddit) {
    document.addEventListener('reddit', addElement, true);
    document.addEventListener('reddit.urlChanged', urlChanged, true);


    function handleElementAdded(e) {
      console.log(e)
      if (e.detail.type === 'post') {
        console.log(e)
      }
    }
  }

  
  // // document.addEventListener('reddit.ready', redditReady, true);
  // document.addEventListener('reddit.urlChanged', urlChanged, true);
  // document.addEventListener('post', post, true);
  // document.addEventListener('subreddit', subreddit, true);

  const meta = document.createElement('meta');
  meta.name = 'jsapi.consumer';
  meta.content = 'Reddit Published Date';
  document.head.appendChild(meta);
  meta.dispatchEvent(new CustomEvent('reddit.ready'));

  function urlChanged(e) {
    console.log('urlChanged()')
    console.log(e)
  }

  function post() {
    console.log('post()')
    console.log(e.type)
  }

  function subreddit() {
    console.log('subreddit()')
    console.log(e.type)
  }

  // Check for new links whenever a new page loads
  chrome.runtime.onMessage.addListener(msg => {
    if (msg === 'page-loaded') {
      handlePageLoad();
    }
  });
  
  function handlePageLoad() {
    const page = getPageType();

    if (page) {
      const links = getArticleLinks(page);

      if (links) {
        links.forEach(link => {
          const url = link.getAttribute('data-url');
          getArticleDate(url);
        });
      }
    }
  }

  // Get whether the user is on a listing or comments page
  function getPageType() {
    const path = window.location.pathname;
    var page = null;

    // Comments page
    if (path.includes('comments')) {
      page = 'comments';
    } else {
      // Listing page
      if (isOldReddit) {
        if (document.body.classList.contains('listing-page')) {
          page = 'listing';
        }
      } else {
      //   var isListingPage = false;
      //   if (path.includes('/r/')) {

      //   }

      //   const listingPages = ['hot', 'new', 'rising', 'controversial', 'top', 'gilded'];
      //   const pathParts = path.split('/');
      //   const lastSegment = pathParts.pop() || pathParts.pop();

      //   if (!lastSegment || listingPages.includes(lastSegment)) {
      //     page = 'listing';
      //   }
      } 

      page = 'listing';
    }

    return page;
  }

  // Parse Reddit links, removing links to media content
  function getArticleLinks(page) {
    var links = [];

    if (page === 'listing') {
      links = document.querySelectorAll('#siteTable div[data-url]');
    }

    return links;
  }

  const headers = new Headers();
  headers.append('Content-Type', 'text/html');
  var show = true;
  function getArticleDate(url) {
    url = 'http://www.whateverorigin.org/get?url=' + encodeURIComponent(url);
    const request = new Request(url, { headers, method: 'GET' });

    fetch(request)
    .then(response => {
      return response.json();
    })
    .then(({ contents: html }) => {
      const parser = new DOMParser();
      // console.log(html)

      const doc = parser.parseFromString(html, 'text/html');

      if (show) {
        show = false;
        console.log(doc)
      }
      // window.test = doc;
      // // console.log(html)
      // const element = doc.querySelector('.wp-logo-link');

      // console.log(element)
    });
  }
})();

