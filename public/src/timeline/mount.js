// src/timeline/mount.js
import { fetchAndNormalize } from './fetch.js';
import { escapeHtml } from '../utils/dom.js';

// ======== 控制台标记 ========
window.__timelineInit = 'not-started';
window.__timeline = null;
window.__timelineItems = null;

function log(...args) {
  console.log('[timeline]', ...args);
}

/**
 * 主入口：渲染时间轴
 * @param {HTMLElement} container - 目标容器
 * @param {Object} overrides - 可覆盖的 vis 选项
 */
export async function mountTimeline(container, overrides = {}) {
  window.__timelineInit = 'mounting';
  log('mountTimeline start');

  // 0) 防御：检查容器和 vis.js
  if (!container) {
    console.error('mountTimeline: 容器不存在');
    window.__timelineInit = 'container-missing';
    return;
  }
  if (!window.vis || !window.vis.Timeline || !window.vis.DataSet) {
    console.error('mountTimeline: vis.js 未加载');
    container.innerHTML =
      '<div style="padding:12px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">vis.js 未加载，请检查脚本引入顺序。</div>';
    window.__timelineInit = 'error';
    return;
  }

  // 1) 初始化全局状态
  window.__timelineItems = new window.vis.DataSet([]);
  window.__timeline = null;

  // 2) 显示“加载中”
  const loading = document.createElement('div');
  loading.textContent = '加载时间轴数据中…';
  loading.style.cssText =
    'position:absolute;top:12px;left:12px;background:#fff;border:1px solid #e5e7eb;padding:6px 10px;border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,.04);z-index:10;font-size:12px;';
  const needRel = getComputedStyle(container).position === 'static';
  if (needRel) container.style.position = 'relative';
  container.appendChild(loading);

  try {
    // 3) 拉数据 + 规范化
    const data = await fetchAndNormalize();
    if (!data.length) {
      container.innerHTML =
        '<div style="padding:12px;background:#fff3cd;border:1px solid #ffeeba;border-radius:8px;color:#856404;">接口返回 0 条记录：请检查 Title/Start 字段是否存在，以及 Start 是否为可解析日期（如 1998-10-21）。</div>';
      window.__timelineInit = 'empty-data';
      return;
    }

    // 4) 写入 DataSet
    const items = new window.vis.DataSet(data);
    window.__timelineItems = items;

    // 5) 计算时间范围
    const times = items.get().map(it => +new Date(it.start || it.end));
    const minT = Math.min.apply(null, times);
    const maxT = Math.max.apply(null, times);
    const pad = Math.max(7, Math.round((maxT - minT) * 0.05));

    // 6) 默认参数（核心调节区）
    const defaults = {
      locale: 'zh-cn',
      stack: true,
      minHeight: 720,
      maxHeight: 720,
      orientation: { axis: 'bottom', item: 'bottom' },
      margin: { item: 12, axis: 14 },
      zoomMin: 1000 * 60 * 60 * 24,
      zoomMax: 1000 * 60 * 60 * 24 * 3660,
      tooltip: { followMouse: true },
      start: isFinite(minT) ? new Date(minT - pad) : undefined,
      end: isFinite(maxT) ? new Date(maxT + pad) : undefined,
    };

    // 7) 合并配置
    const options = { ...defaults, ...overrides };

    // 8) 创建时间轴
    const timeline = new window.vis.Timeline(container, items, options);
    window.__timeline = timeline;

    // 9) 自适应窗口
    window.addEventListener('resize', () => timeline.redraw());

    window.__timelineInit = 'mounted';
    log('mounted with items:', items.length);
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div style="padding:16px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">加载失败：${escapeHtml(err.message)}</div>`;
    window.__timelineInit = 'error';
  } finally {
    loading.remove();
  }
}
