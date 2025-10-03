// src/app.js
import { attachEventDataAttrs, applyStyleState } from './style/engine.js';
import { getStyleState, setStyleState, onStyleStateChange } from './state/styleState.js';
import {
  ENDPOINT,
  attributeLabels,
  PRESET_COLORS,
  STYLE_LABELS,
  styleLabel,
} from './_staging/constants.js';
import { renderFilterList } from './_staging/style-ui.js';

function updateFilterList() {
  const div = document.getElementById('current-filters');
  if (!div) return;
  // 交给 staging 的纯渲染：只负责把 activeFilters 渲染出来
  renderFilterList(div, activeFilters, attributeLabels, (key) => {
    delete activeFilters[key];
    updateFilterList();
    // 这句如果你项目里有就保留，没有就删掉问号保护符
    updateTimelineByFilter?.();
  });
}

// 运行态（保持原有）
let allOptions = {}, activeFilters = {}, filterOptionsChoices, filterLogic = 'and';
let originalItems = [], timeline = null;

// 暂时保留全局暴露（有旧代码用到）
window.attributeLabels = attributeLabels;
window.PRESET_COLORS  = PRESET_COLORS;
window.styleLabel     = styleLabel;

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

window.ENDPOINT = ENDPOINT; // 暴露给 test.html 里的旧代码
window.updateFilterList = updateFilterList;





