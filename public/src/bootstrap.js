// public/src/bootstrap.js
import { mountTimeline } from './timeline/mount.js';
import { initInfoDialogs } from './ui/info-dialog.js';

initInfoDialogs();
window.dispatchEvent(new Event('style:ready'));

await mountTimeline(document.getElementById('timeline'), {});
