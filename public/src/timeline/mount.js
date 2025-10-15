// 让你能在控制台观察到状态
window.__timelineInit = 'not-started';
window.__timeline = null;
window.__timelineItems = null;

function log(...args){ console.log('[timeline]', ...args); }
