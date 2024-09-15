import './client.scss';
import initOldReddit from './old-reddit';
import initRedesign1 from './reddit-redesign-1';
import initRedesign2 from './reddit-redesign-2';
import { getRedditVersion, insertPublishDate } from './helpers';
import { redditVersions } from '@constants';

(async function () {
  switch (await getRedditVersion()) {
    case redditVersions.REDDIT_REDESIGN_2:
      initRedesign2();
      break;
    case redditVersions.OLD_REDDIT:
      initOldReddit();
      break;
    case redditVersions.REDDIT_REDESIGN_1:
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
