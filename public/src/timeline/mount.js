// public/src/timeline/mount.js
// === 渲染时间轴主入口 ===
// 负责：创建 timeline 容器、加载数据、显示 timeline
// 依赖：fetchAndNormalize, vis.js

import { fetchAndNormalize } from './fetch.js';

// —— 全局可观测状态（便于调试）——
window.__timelineInit = 'not-started';
window.__timeline = null;
window.__timelineItems = null;

/** 控制台输出辅助 */
function log(...args) {
  console.log('[timeline]', ...args);
}

/**
 * 在页面上挂载并渲染时间轴
 * @param {HTMLElement} container - 承载 timeline 的 DOM 节点
 */
export async function mountTimeline(container) {
  window.__timelineInit = 'mounting';
  log('mountTimeline start');

  if (!container) {
    console.error('mountTimeline: 容器不存在');
    window.__timelineInit = 'container-missing';
    return;
  }

  // 初始化空数据集（防止报错）
  window.__timelineItems = new window.vis.DataSet([]);
  window.__timeline = null;

  // 加载提示
  const loading = document.createElement('div');
  loading.textContent = '加载时间轴数据中…';
  loading.style.cssText = `
    position:absolute; top:12px; left:12px;
    background:#fff; border:1px solid #e5e7eb;
    padding:6px 10px; border-radius:6px;
    box-shadow:0 1px 2px rgba(0,0,0,.04);
    z-index:10; font-size:12px;
  `;
  container.appendChild(loading);

  try {
    // —— 拉取数据（fetch.js）——
    const data = await fetchAndNormalize();

    if (!data.length) {
      container.innerHTML = `
        <div style="padding:12px;background:#fff3cd;
        border:1px solid #ffeeba;border-radius:8px;color:#856404;">
          接口返回 0 条记录：请检查 Title/Start 字段是否存在，
          以及 Start 是否为可解析日期（如 1998-10-21）。
        </div>`;
      window.__timelineInit = 'empty-data';
      return;
    }

    // —— 创建 DataSet —— 
    const items = new window.vis.DataSet(data);
    window.__timelineItems = items;

    // 自动计算时间范围（略加 padding）
    const times = items.get().map(it => +new Date(it.start || it.end));
    const minT = Math.min.apply(null, times);
    const maxT = Math.max.apply(null, times);
    const pad = Math.max(7, Math.round((maxT - minT) * 0.05));

    // —— vis.js 选项（控制样式与布局）——
    const options = {
      locale: 'zh-cn',
      stack: true, // 多事件堆叠显示
      zoomMin: 1000 * 60 * 60 * 24, // 最小缩放：1天
      zoomMax: 1000 * 60 * 60 * 24 * 3660, // 最大缩放：约10年
      maxHeight: 720,
      minHeight: 720,
      margin: { item: 8, axis: 12 }, // item间距、轴距
      orientation: 'top', // 事件在时间轴上方
      tooltip: { followMouse: true },
      start: isFinite(minT) ? new Date(minT - pad) : undefined,
      end: isFinite(maxT) ? new Date(maxT + pad) : undefined,
    };

    // —— 渲染 timeline —— 
    const timeline = new window.vis.Timeline(container, items, options);
    window.__timeline = timeline;

    // 响应窗口缩放
    window.addEventListener('resize', () => timeline.redraw());
    window.__timelineInit = 'mounted';
    log('mounted with items:', items.length);
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div style="padding:16px;color:#b91c1c;background:#fef2f2;
      border:1px solid #fecaca;border-radius:8px;">
        加载失败：${err.message}
      </div>`;
    window.__timelineInit = 'error';
  } finally {
    loading.remove();
  }
}
