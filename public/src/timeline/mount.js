// src/timeline/mount.js
// ✅ 职责：创建并挂载 vis Timeline；可自定义参数；提供销毁/更新 API。
// 依赖：fetchAndNormalize() 返回规范化 items（含 content/start/end 等）。
import { fetchAndNormalize } from './fetch.js';
import { escapeHtml } from '../utils/dom.js';
import { TIMELINE_DEFAULT_OPTIONS } from '../_staging/constants.js';

// ======== 调试标记（可选） ========
window.__timelineInit = 'not-started';
window.__timeline = null;
window.__timelineItems = null;

function log(...args) { try { console.log('[timeline]', ...args); } catch {} }

// 浅层“深合并”：仅合并一层子对象（满足我们这里的 options 结构）
function mergeOptions(...objs) {
  const out = {};
  for (const o of objs) {
    if (!o || typeof o !== 'object') continue;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = { ...(out[k] || {}), ...v };
      } else if (v !== undefined) {
        out[k] = v;
      }
    }
  }
  return out;
}

// 创建 loading 覆盖层（附 aria）
function createLoadingOverlay() {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = '加载时间轴数据中…';
  el.style.cssText =
    'position:absolute;top:12px;left:12px;background:#fff;border:1px solid #e5e7eb;padding:6px 10px;border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,.04);z-index:10;font-size:12px;';
  return el;
}

// 把各种时间输入转成“可比较的时间戳（毫秒）”；无效返回 NaN
function toMs(tsLike) {
  if (typeof tsLike === 'number') return tsLike;
  const d = new Date(tsLike);
  const n = +d;
  return Number.isFinite(n) ? n : NaN;
}

// ======== 明确提供中文 locale，避免月份乱码 ========
const LOCALE_ZH_CN = {
  months: [
    '一月','二月','三月','四月','五月','六月',
    '七月','八月','九月','十月','十一月','十二月'
  ],
  monthsShort: ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
  weekdays: ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'],
  weekdaysShort: ['日','一','二','三','四','五','六'],
  weekdaysMin: ['日','一','二','三','四','五','六'],
  // 下列键用于工具栏文字；即便没显示工具栏，补上更稳妥
  current: '当前',
  time: '时间',
  day: '日',
  month: '月',
  year: '年',
  zoomIn: '放大',
  zoomOut: '缩小',
  moveLeft: '左移',
  moveRight: '右移',
  open: '打开',
};

// 安全取标题（只返回纯文本）
function pickPlainTitle(item) {
  const raw =
    (item && (item.Title ?? item.title ?? item.content)) ??
    '';
  // 转成字符串并去掉任何 HTML 标签
  const text = String(raw).replace(/<[^>]*>/g, '').trim();
  return text || '(无标题)';
}

/**
 * 主入口：渲染时间轴
 * @param {HTMLElement} container
 * @param {Object} overrides - 可覆盖 vis 选项
 * @returns {Promise<{timeline:any, items:any, destroy:Function, setItems:Function, setOptions:Function}>}
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

  // 1) 初始化全局状态（可选）
  window.__timelineItems = new window.vis.DataSet([]);
  window.__timeline = null;

  // 2) 显示“加载中”
  const loading = createLoadingOverlay();
  const originalPosition = container.style.position;
  const needRel = getComputedStyle(container).position === 'static';
  if (needRel) container.style.position = 'relative';
  container.appendChild(loading);

  // 销毁函数占位（在成功创建后填充）
  let resizeHandler = null;
  let timeline = null;
  let items = null;

  function destroy() {
    try { if (resizeHandler) window.removeEventListener('resize', resizeHandler); } catch {}
    try { if (timeline && timeline.destroy) timeline.destroy(); } catch {}
    try { if (container.contains(loading)) loading.remove(); } catch {}
    if (needRel) container.style.position = originalPosition || '';
    window.__timelineInit = 'destroyed';
    window.__timeline = null;
    window.__timelineItems = null;
  }

  function setItems(nextItems = []) {
    if (!items) return;
    items.clear();
    if (Array.isArray(nextItems) && nextItems.length) items.add(nextItems);
    if (timeline && timeline.redraw) requestAnimationFrame(() => timeline.redraw());
  }

  function setOptions(patch = {}) {
    if (timeline && patch && typeof patch === 'object') {
      timeline.setOptions(mergeOptions(timeline.options || {}, patch));
      if (timeline.redraw) requestAnimationFrame(() => timeline.redraw());
    }
  }

  try {
    // 3) 拉数据 + 规范化（此处由 fetch.js 决定是本地 mock 还是表格接口）
    const data = await fetchAndNormalize();
    if (!Array.isArray(data) || data.length === 0) {
      container.innerHTML =
        '<div style="padding:12px;background:#fff3cd;border:1px solid #ffeeba;border-radius:8px;color:#856404;">接口返回 0 条记录：请检查 Title/Start 字段是否存在，以及 Start 是否为可解析日期（如 1998-10-21）。</div>';
      window.__timelineInit = 'empty-data';
      return { timeline: null, items: null, destroy, setItems, setOptions };
    }

    // 4) 写入 DataSet
    items = new window.vis.DataSet(data);
    window.__timelineItems = items;

    // 5) 计算时间范围（用毫秒时间戳，稳）
    const raw = items.get();
    const times = raw
      .map(it => toMs(it && (it.start ?? it.end)))
      .filter(Number.isFinite);

    let startDate, endDate;
    if (times.length) {
      const minT = Math.min(...times);
      const maxT = Math.max(...times);
      const DAY = 24 * 60 * 60 * 1000;
      const span = Math.max(0, maxT - minT);
      const padMs = Math.max(7 * DAY, Math.round(span * 0.05)); // 至少 7 天
      const s = new Date(minT - padMs);
      const e = new Date(maxT + padMs);
      if (!Number.isNaN(+s)) startDate = s;
      if (!Number.isNaN(+e)) endDate = e;
    }

    // 6) 默认参数（核心调节区）：显式提供中文 locale，并只显示 Title
    const wantedLocale =
      (overrides && overrides.locale) ||
      (TIMELINE_DEFAULT_OPTIONS && TIMELINE_DEFAULT_OPTIONS.locale) ||
      'zh-cn';

    const baseDefaults = {
      minHeight: 720,
      maxHeight: 720,
      // 提供 locale 表（把 zh-cn 明确成我们上面的中文翻译）
      locales: {
        ...(TIMELINE_DEFAULT_OPTIONS?.locales || {}),
        'zh-cn': LOCALE_ZH_CN,
        'zh': LOCALE_ZH_CN,
      },
      locale: wantedLocale,
      // 只显示标题（纯文本）；不再把 meta/desc 塞进内容区
      template: (item, element) => {
        const titleText = pickPlainTitle(item);
        // 标记 .event，供后续样式引擎选择器使用
        const host = element?.closest?.('.vis-item') || element;
        if (host) host.classList.add('event');
        // 结构：<div><h4 class="event-title">Title</h4></div>
        const root = document.createElement('div');
        const h4 = document.createElement('h4');
        h4.className = 'event-title';
        h4.textContent = titleText;
        root.appendChild(h4);
        return root;
      },
    };

    const options = mergeOptions(
      TIMELINE_DEFAULT_OPTIONS,
      baseDefaults,
      overrides
    );
    // 仅当有效时才设置 start/end（避免把“普通对象/Invalid Date”塞进 options）
    if (startDate instanceof Date) options.start = startDate;
    if (endDate   instanceof Date) options.end   = endDate;

    // 7) 创建时间轴
    const vis = window.vis;
    timeline = new vis.Timeline(container, items, options);
    window.__timeline = timeline;

    // 8) 自适应窗口
    const onResize = () => timeline.redraw();
    resizeHandler = onResize;
    window.addEventListener('resize', onResize);

    window.__timelineInit = 'mounted';
    log('mounted with items:', items.get().length);

    // 9) 返回可操作句柄
    return { timeline, items, destroy, setItems, setOptions };
  } catch (err) {
    console.error(err);
    container.innerHTML =
      `<div style="padding:16px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">加载失败：${escapeHtml(err?.message || String(err))}</div>`;
    window.__timelineInit = 'error';
    return { timeline: null, items: null, destroy, setItems, setOptions };
  } finally {
    try { loading.remove(); } catch {}
  }
}
