// public/src/app.js
// ✅ App 入口：绑定工具栏 → 挂载时间轴 → 提供全局少量兼容钩子

import { attachEventDataAttrs, applyStyleState } from './style/engine.js';
import { getStyleState, setStyleState, onStyleStateChange } from './state/styleState.js';

import {
  attributeLabels,
  PRESET_COLORS,
  styleLabel,
  // 过滤纯函数
  filterItems,
} from './_staging/constants.js';

import { getVariant } from './variant/variant.js';

// UI：工具栏占位绑定（attr-picker 已在内部接线）
import { bindToolbar } from './_staging/style-ui.js';
// UI：当前过滤条件列表渲染（chips/整组移除）
import { renderFilterList } from './ui/filter-ui.js';
// Timeline：实际挂载渲染
import { mountTimeline } from './timeline/mount.js';

// ========== 运行态（保持轻量） ==========
let allOptions = {};               // 可选：后续接入真实 options 源
let activeFilters = {};            // 例：{ Region:['日本','北美'] }
let filterLogic = 'and';           // 'and' | 'or'
let timeline = null;               // vis.Timeline 实例
let itemsDS = null;                // vis.DataSet（当前展示集）
let originalItems = [];            // 初始 items 的快照（用于过滤回放）

// ========== Variant（region/lang → endpoints） ==========
const variant = getVariant();
window.__variant = variant; // 便于调试

// 当前页面的 events endpoint（权威来源）
const ENDPOINT = variant?.endpoints?.events || null;

// 如果 events endpoint 缺失，尽早报错（比 fetch 时报一堆二次错误更好定位）
if (!ENDPOINT) {
  console.error('[app] Missing events endpoint for variant:', variant);
  throw new Error('[app] TIMELINE events endpoint is not set');
}

// ✅ 关键：把 endpoint 写到全局，供 fetch.js 读取（你刚刚已把 fetch.js 改成读这里）
globalThis.TIMELINE_ENDPOINT = ENDPOINT;
globalThis.TIMELINE_OPTIONS_ENDPOINT = variant?.endpoints?.options || null;
globalThis.TIMELINE_FEEDBACK_ENDPOINT = variant?.endpoints?.feedback || null;

// 兼容旧逻辑（test.html/旧模块可能读 window.ENDPOINT）
window.ENDPOINT = ENDPOINT;

// ========== 兼容旧全局 ==========
window.attributeLabels = attributeLabels;
window.PRESET_COLORS  = PRESET_COLORS;
window.styleLabel     = styleLabel;

window.__styleEngine = { attachEventDataAttrs, applyStyleState };
window.__styleState  = { getStyleState, setStyleState, onStyleStateChange };

// 方便你验证四个入口是否切换成功
console.log('app.js loaded', {
  variantKey: variant.key,
  region: variant.region,
  lang: variant.lang,
  eventsEndpoint: ENDPOINT,
});

window.dispatchEvent(new Event('style:ready'));

// 按需加载样式面板（旧按钮示例）
const openBtn = document.getElementById('open-style');
if (openBtn) {
  openBtn.addEventListener('click', async () => {
    const panel = await import('./ui/style-panel.js'); // 懒加载
    panel.openStylePanel({
      selectorBase: '.vis-item.event',
      titleSelector: '.event-title',
    });
  });
}

// ========== 过滤 UI 渲染 ==========
function updateFilterList() {
  const div = document.getElementById('current-filters');
  if (!div) return;
  renderFilterList(
    div,
    activeFilters,
    attributeLabels,
    // 移除回调：支持整组或单值（filter-ui 内已兼容）
    (key, value) => {
      if (value == null) {
        delete activeFilters[key];
      } else {
        const arr = activeFilters[key] || [];
        activeFilters[key] = arr.filter(v => v !== value);
        if (activeFilters[key].length === 0) delete activeFilters[key];
      }
      updateFilterList();
      window.updateTimelineByFilter?.();
    },
    { perValueRemove: true } // 每个值渲染为可移除 chip
  );
}
window.updateFilterList = updateFilterList;

// ========== 过滤应用 ==========
function getFilteredItems() {
  if (!originalItems?.length) return [];
  if (!activeFilters || Object.keys(activeFilters).length === 0) return originalItems.slice();
  return filterItems(originalItems, activeFilters, filterLogic);
}

function updateTimelineByFilter() {
  if (!itemsDS || !timeline) return;
  const next = getFilteredItems();
  itemsDS.clear();
  if (next.length) itemsDS.add(next);
  // 轻量 redraw
  try { timeline.redraw(); } catch {}
}
window.updateTimelineByFilter = updateTimelineByFilter;

// ========== 页面就绪：绑定工具栏 & 挂载时间轴 ==========
window.addEventListener('DOMContentLoaded', async () => {
  bindToolbar();

  const el = document.getElementById('timeline');
  if (!el) {
    console.error('[timeline] 未找到 #timeline 容器');
    return;
  }

  // ⚠️ 当前不改 mount.js：不要把 {variant, endpoint} 作为第二参传入
  // 因为 mount.js 会把第二参当作 vis options merge，属于隐患（虽然现在可能“看起来没事”）。
  const handle = await mountTimeline(el);

  timeline = handle?.timeline || null;
  itemsDS  = handle?.items || null;

  // 记录原始 items（用于过滤回放）
  try {
    originalItems = itemsDS ? itemsDS.get() : [];
  } catch {
    originalItems = [];
  }

  // 初次渲染过滤 UI（若有默认过滤）
  updateFilterList();
});
