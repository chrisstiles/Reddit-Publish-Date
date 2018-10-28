document.onreadystatechange = function () {
  if (document.readyState === 'complete') {

    chrome.runtime.sendMessage({ loadCache: true });

    chrome.runtime.onMessage.addListener(msg => {
      if (msg === 'cache-loaded') {
        execute();
      }
    });

    function execute() {
      const isOldReddit = document.querySelector('meta[name="jsapi"]') ? false : true;
      var isCommentsPage = window.location.pathname.includes('comments');

      // This will be changed to be the function that updates
      // the post HTMl with the article date. The function
      // will differ based on which version of Reddit we're using
      var updatePost;
      
      if (isOldReddit) {
        // The old Reddit design uses traditional server-side rendering
        updatePost = function (postId, url) {
          const postElement = document.querySelector(`.id-t3_${postId}`);
          
          if (postElement) {
            const timestamp = postElement.querySelector('.live-timestamp');

            if (timestamp) {
              createDateWrapper(postId, timestamp);
              getPublishedDate(postId, url);
            }
            
          }
        }

        // Get list of links
        // const wrapper = document.querySelector('#siteTable');
        
        // if (wrapper) {
        //   const links = wrapper.querySelectorAll('[data-type="link"]');

        //   for (let link of links) {
        //     console.log(link)
        //   }
        // }
        // Get page as JSON
        var url = window.location.href;

        if (url.substring(url.length - 1) === '/') {
          url = url.slice(0, -1) + '';
        }

        fetch (`${url}.json`)
          .then(response => {
            return response.json();
          })
          .then(json => {
            if (json && json.kind === 'Listing') {
              const { children: links } = json.data;

              if (links) {
                for (let link of links) {
                  const { data } = link;
                  const { postHint, url, id } = data;
                  
                  if (!postHint || postHint === 'link') {
                    updatePost(id, url);
                  }
                }
              }
            }
          });
        // const url = `${window.location.href}`;
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
        document.addEventListener('reddit', handleElementAdded, true);
        document.addEventListener('reddit.urlChanged', handleUrlChanged, true);

        function handleElementAdded(e) {
          if (e.detail.type === 'post') {
            const { id, sourceUrl, domain, media } = e.detail.data;

            // Do not add published date for media links or self posts
            if (!media && domain && sourceUrl) {
              updatePost(id, sourceUrl);
            }
          } else if (isCommentsPage && e.detail.type === 'postAuthor') {
            // The 'post' event type doesn't run on comment
            // pages that aren't viewed in the modal window.
            // Instead we use the postAuthor type to know when the post has been added
            console.log('postAuthor')
            console.log(e)
          } else if (e.detail.type === 'subreddit') {
            console.log('subreddit')
            console.log(e)
          }
        }

        function handleUrlChanged(e) {
          isCommentsPage = e.detail.location.pathname.includes('comments');
        }

        var shouldFetch = true;
        updatePost = function (postId, url) {
          const postElement = document.querySelector(`#${postId}`);
          // console.log(postElement, `#${postId}`);

          if (postElement) {
            // Return if we have already updated this element
            if (postElement.getAttribute('added-publish')) {
              return;
            }

            postElement.setAttribute('added-publish', true);

            // insert publish date after date posted on Reddit
            const timestamp = postElement.querySelector('[data-click-id="timestamp"]');

            if (timestamp) {
              createDateWrapper(postId, timestamp);
              // Get the date and insert into DOM
              if (shouldFetch) {
                // shouldFetch = false;

                // getPublishedDate(url, date => {
                //   insertPublishDate(date, timestamp);
                // })

                // getPublishedDate(url, function() {
                //   insertPublishDate(date, timestamp);
                // })

                getPublishedDate(postId, url);
              }

            }
          }
        }
      }

      // Get the date an article was published
      function getPublishedDate(postId, url) {
        // console.log(callback)
        chrome.runtime.sendMessage({ postId, url });
      }

      // Handle background.js message with article date
      chrome.runtime.onMessage.addListener(({ postId, date }) => {
        if (date && postId) {
          insertPublishDate(postId, date);
        }
      });

      // Creates the span we will use to hold date if it exists
      function createDateWrapper(postId, previousElement) {
        if (!previousElement) {
          return;
        }

        const publishElement = document.createElement('span');

        publishElement.classList.add('publish-date');
        publishElement.setAttribute('id', `DatePublished--${postId}`);
        previousElement.parentNode.insertBefore(publishElement, previousElement.nextSibling);
      }


      // Inserts the date the article was published
      function insertPublishDate(postId, date) {
        if (!postId || !date) {
          return;
        }

        const publishElement = document.querySelector(`#DatePublished--${postId}`);

        if (publishElement) {
          publishElement.innerHTML = `Published: ${date}`;
        }
      }


      function getArticleHtml(url) {
        // chrome.runtime.sendMessage({ url }, response => {
        //   console.log(response);
        // });
      }


    // function handlePageLoad() {
    //   const page = getPageType();

    //   if (page) {
    //     const links = getArticleLinks(page);

    //     if (links) {
    //       links.forEach(link => {
    //         const url = link.getAttribute('data-url');
    //         getArticleDate(url);
    //       });
    //     }
    //   }
    // }

    // Get whether the user is on a listing or comments page
    // function getPageType() {
    //   const path = window.location.pathname;
    //   var page = null;

    //   // Comments page
    //   if (path.includes('comments')) {
    //     page = 'comments';
    //   } else {
    //     // Listing page
    //     if (isOldReddit) {
    //       if (document.body.classList.contains('listing-page')) {
    //         page = 'listing';
    //       }
    //     } else {
    //       //   var isListingPage = false;
    //       //   if (path.includes('/r/')) {

    //       //   }

    //       //   const listingPages = ['hot', 'new', 'rising', 'controversial', 'top', 'gilded'];
    //       //   const pathParts = path.split('/');
    //       //   const lastSegment = pathParts.pop() || pathParts.pop();

    //       //   if (!lastSegment || listingPages.includes(lastSegment)) {
    //       //     page = 'listing';
    //       //   }
    //     }

    //     page = 'listing';
    //   }

    //   return page;
    // }

    // Parse Reddit links, removing links to media content
    // function getArticleLinks(page) {
    //   var links = [];

    //   if (page === 'listing') {
    //     links = document.querySelectorAll('#siteTable div[data-url]');
    //   }

    //   return links;
    // }
    }

    

   
  }
} 