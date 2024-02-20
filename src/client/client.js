import './client.scss';
import initOldReddit from './old-reddit';
import initRedesign1 from './reddit-redesign-1';
import initRedesign2 from './reddit-redesign-2';
import { getRedditVersion, insertPublishDate } from './helpers';

(async function () {
  switch (await getRedditVersion()) {
    case 'reddit-redesign-2':
      initRedesign2();
      break;
    case 'old-reddit':
      initOldReddit();
      break;
    case 'reddit-redesign-1':
      initRedesign1();
      break;
    default:
      return;
  }

  chrome.runtime.onMessage.addListener(({ postId, date, cssClasses }) => {
    if (date && postId) {
      insertPublishDate(postId, date, cssClasses);
    }
  });
})();
