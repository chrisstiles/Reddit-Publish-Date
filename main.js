(function() {
  const isOldReddit = location.host === 'old.reddit.com';

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

