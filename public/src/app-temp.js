import { attachEventDataAttrs, applyStyleState } from './style/engine.js';
import { getStyleState, setStyleState, onStyleStateChange } from './state/styleState.js';

// 暴露给现有内联代码使用（避免你现在就重写那段脚本）
window.__styleEngine = { attachEventDataAttrs, applyStyleState };
window.__styleState  = { getStyleState, setStyleState, onStyleStateChange };

console.log('app.js loaded (style engine + state ready)');
// app.js 末尾（在 console.log 之后即可）
window.dispatchEvent(new Event('style:ready'));

// src/app.js（在现有内容基础上补充）
const openBtn = document.getElementById('open-style');
if (openBtn) {
  openBtn.addEventListener('click', async () => {
    const panel = await import('./ui/style-panel.js'); // 按需加载
    panel.openStylePanel({
      selectorBase: '.vis-item.event',
      titleSelector: '.event-title'
    });
  });
}
