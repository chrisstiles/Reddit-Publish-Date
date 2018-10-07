// // return mystring.replace(/&/g, "&amp;").replace(/>/g, "&gt;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
// var url = 'http://www.whateverorigin.org/get?url=' + encodeURIComponent('https://www.washingtonpost.com/politics/kavanaugh-vote-divided-senate-poised-to-confirm-trumps-nominee/2018/10/06/64bf69fa-c969-11e8-b2b5-79270f9cce17_story.html?utm_term=.55f7529b2af3')
// var headers = new Headers();
// headers.append('Content-Type', 'text/html');

// var request = new Request(url, { headers, method: 'GET' });

// fetch(request)
//   .then(response => {
//     return response.json();
//   })
//   .then(({ contents: html }) => {
//     const parser = new DOMParser();
//     // console.log(html)

//     const doc = parser.parseFromString(html, 'text/html');

//     window.test = doc;
//     // console.log(html)
//     const element = doc.querySelector('.wp-logo-link');

//     console.log(element)
//   })

// const isCommentsPage

// function getArticleLinks() {
//   const links = 
// }

const isOldReddit = location.host === 'old.reddit.com';

// The new Reddit design is a single page application
// Watch for the page changing with Javascript and re-run
// document.head.appendChild(document.createElement('script')).text = '(' +
//   function () {
//     // injected DOM script is not a content script anymore, 
//     // it can modify objects and functions of the page
//     var _pushState = history.pushState;
//     history.pushState = function (state, title, url) {
//       _pushState.call(this, state, title, url);
//       window.dispatchEvent(new CustomEvent('state-changed', { detail: state }));
//     };
//     // repeat the above for replaceState too
//   } + ')(); this.remove();'; // remove the DOM script element

// And here content script listens to our DOM script custom events
// window.addEventListener('state-changed', function (e) {
//   // console.log('History state changed', e.detail, location.hash);
//   // doSomething();
//   console.log('state-changed')
//   handlePageLoad();
// });

chrome.runtime.onMessage.addListener(msg => {
  if (msg === 'page-loaded') {
    console.log('page loading')
    handlePageLoad();
  }
});

// chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
//   if (msg === 'page-loaded') {
//     handlePageLoad();
//   }
// });

// console.clear();
function handlePageLoad() {
  const scrollContainer = document.querySelector('#overlayScrollContainer');
  console.log(scrollContainer)
}

handlePageLoad();

