// src/timeline/mount.js
// ✅ 职责：创建并挂载 vis Timeline；可自定义参数；提供销毁/更新 API。
// 依赖：fetchAndNormalize() 负责抓取并返回已规范化的 items（含 content/start/end）。
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
  const n = +new Date(tsLike);
  return Number.isFinite(n) ? n : NaN;
}

/** 将任意输入转成“去标签的纯文本” */
function toPlainText(x) {
  if (x == null) return '';
  if (typeof x === 'string') return x.replace(/<[^>]*>/g, '').trim();
  if (x && typeof x === 'object') {
    if (typeof x.text === 'string') return x.text.trim();
    if (typeof x.textContent === 'string') return x.textContent.trim();
    if (x.el && typeof x.el.textContent === 'string') return x.el.textContent.trim();
    if (typeof x.innerText === 'string') return x.innerText.trim();
  }
  return String(x).replace(/<[^>]*>/g, '').trim();
}

/** 从多行文本（title/content）中解析“事件名称：xxx” */
function pickTitleFromBlob(blob) {
  const s = toPlainText(blob);
  if (!s) return '';
  // 支持中文冒号“：”或英文冒号“:”，并抓取到行尾或 HTML 换行前
  const m = /(事件名称)\s*[:：]\s*([^\n<]+)/.exec(s);
  return m ? m[2].trim() : '';
}

/** 兼容各种形态，尽力取出“可显示的标题纯文本” */
function resolveTitle(item) {
  // 1) 显式字段优先
  const t1 = toPlainText(item && item.Title);
  if (t1) return t1;
  const t2 = toPlainText(item && item.title);
  if (t2) return t2;

  // 2) 有些数据把“全量详情”塞进 title 或 content；从中解析“事件名称：xxx”
  const fromTitleBlob = pickTitleFromBlob(item && item.title);
  if (fromTitleBlob) return fromTitleBlob;

  const fromContentBlob = pickTitleFromBlob(item && item.content);
  if (fromContentBlob) return fromContentBlob;

  // 3) 仍不行，就退回到 content/label 的纯文本
  const t3 = toPlainText(item && item.content);
  if (t3) return t3;

  const t4 = toPlainText(item && item.label);
  if (t4) return t4;

  // 4) 最终兜底
  return '(无标题)';
}

/**
 * 主入口：渲染时间轴
 * @param {HTMLElement} container
 * @param {Object} overrides
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

  // 在闭包里维护这些句柄，便于返回/销毁
  let resizeHandler = null;
  let timeline = null;
  let items = null;

  // 销毁：移除监听、还原样式、清空内容
  function destroy() {
    try { if (resizeHandler) window.removeEventListener('resize', resizeHandler); } catch {}
    try { if (timeline && timeline.destroy) timeline.destroy(); } catch {}
    try { if (container.contains(loading)) loading.remove(); } catch {}
    if (needRel) container.style.position = originalPosition || '';
    window.__timelineInit = 'destroyed';
    window.__timeline = null;
    window.__timelineItems = null;
  }

  // 安全设置 items
  function setItems(nextItems = []) {
    if (!items) return;
    items.clear();
    if (Array.isArray(nextItems) && nextItems.length) {
      items.add(nextItems);
    }
    if (timeline && timeline.redraw) {
      requestAnimationFrame(() => timeline.redraw());
    }
  }

  // 动态 patch options（浅合并）
  function setOptions(patch = {}) {
    if (timeline && patch && typeof patch === 'object') {
      timeline.setOptions(mergeOptions(timeline.options || {}, patch));
      if (timeline.redraw) requestAnimationFrame(() => timeline.redraw());
    }
  }

  try {
    // 3) 拉数据 + 规范化
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

    // 5) 计算时间范围（容错：若无 start/end，跳过范围设定）
    const raw = items.get();
    const times = raw
      .map(it => toMs((it && (it.start != null ? it.start : it.end))))
      .filter(Number.isFinite);

    let startDate, endDate;
    if (times.length) {
      const minT = Math.min(...times);
      const maxT = Math.max(...times);
      const DAY = 24 * 60 * 60 * 1000;
      const span = Math.max(0, maxT - minT);
      const padMs = Math.max(7 * DAY, Math.round(span * 0.05));
      const s = new Date(minT - padMs);
      const e = new Date(maxT + padMs);
      if (!Number.isNaN(+s)) startDate = s;
      if (!Number.isNaN(+e)) endDate = e;
    }

    // 6) 默认参数（核心调节区），先用英文避免月份乱码
    const baseDefaults = {
      locale: 'en',
      minHeight: 720,
      maxHeight: 720,
      template: (item, element) => {
        const titleText = resolveTitle(item);
        const host = (element && element.closest) ? (element.closest('.vis-item') || element) : element;
        if (host && host.classList) host.classList.add('event');
        const root = document.createElement('div');
        const h4 = document.createElement('h4');
        h4.className = 'event-title';
        h4.textContent = titleText;
        root.appendChild(h4);
        return root;
      },
    };

    const options = mergeOptions(
      TIMELINE_DEFAULT_OPTIONS, // 全局默认（constants.js）
      baseDefaults,             // 本文件默认
      overrides                 // 调用方覆盖
    );
    if (startDate instanceof Date) options.start = startDate;
    if (endDate instanceof Date) options.end = endDate;

    // 7) 创建时间轴
    const vis = window.vis;
    timeline = new vis.Timeline(container, items, options);
    window.__timeline = timeline;

    // ======================
    // === 覆盖式弹窗逻辑 ===
    // ======================

    function ensurePopover() {
      let pop = container.querySelector('#event-popover');
      if (!pop) {
        pop = document.createElement('div');
        pop.id = 'event-popover';
        pop.style.cssText = [
          'position:absolute',
          'z-index:1000',
          'background:#fff',
          'border:1px solid #e5e7eb',
          'box-shadow:0 8px 24px rgba(0,0,0,.15)',
          'border-radius:8px',
          'overflow:auto',
          'pointer-events:auto',
          'padding:10px'
        ].join(';');
        container.appendChild(pop);
      }
      return pop;
    }

    let currentAnchor = null; // 当前锚定的事件框元素
    function hidePopover() {
      const pop = container.querySelector('#event-popover');
      if (pop) pop.style.display = 'none';
      currentAnchor = null;
    }

    function buildDetailHTML(item) {
      if (typeof item.title === 'string' && item.title.trim()) {
        return item.title; // 复用旧版 HTML tooltip
      }
      const lines = [];
      const safe = (v) => (v == null ? '' : String(v));
      const kv = (k, v) => `<div><strong>${k}：</strong>${safe(v)}</div>`;

      lines.push(kv('事件名称', resolveTitle(item)));
      if (item.start) lines.push(kv('开始时间', safe(item.start)));
      if (item.end)   lines.push(kv('结束时间', safe(item.end)));
      if (item.EventType)       lines.push(kv('事件类型', item.EventType));
      if (item.Region)          lines.push(kv('地区', item.Region));
      if (item.Platform)        lines.push(kv('平台类型', item.Platform));
      if (item.ConsolePlatform) lines.push(kv('主机类型', item.ConsolePlatform));
      if (item.Company)         lines.push(kv('公司', item.Company));
      if (Array.isArray(item.Tag) && item.Tag.length) {
        lines.push(kv('标签', item.Tag.join('，')));
      }
      return lines.join('');
    }

    // 利用点击事件的 target 来定位，失败时再回退到 data-id 查询
    function findAnchorElementFromClick(props) {
      // 1) 首选：事件源往上找 .vis-item
      const t = props && props.event && props.event.target;
      const hit = t && t.closest ? t.closest('.vis-item') : null;
      if (hit) return hit;

      // 2) 回退：通过 data-id 匹配
      if (!props || props.item == null) return null;
      const selectorId = (window.CSS && CSS.escape)
        ? CSS.escape(String(props.item))
        : String(props.item).replace(/"/g, '\\"');
      return container.querySelector(`.vis-item[data-id="${selectorId}"]`);
    }

    function showPopoverOverItem(props) {
      const pop = ensurePopover();
      const itemId = props.item;
      const anchorEl = findAnchorElementFromClick(props);
      if (!anchorEl) return;

      const cb = container.getBoundingClientRect();
      const ib = anchorEl.getBoundingClientRect();

      const top  = ib.top  - cb.top + container.scrollTop;
      const left = ib.left - cb.left + container.scrollLeft;
      const width  = ib.width;
      const height = ib.height;

      const item = items.get(itemId);
      pop.innerHTML = buildDetailHTML(item);

      pop.style.top = `${top}px`;
      pop.style.left = `${left}px`;
      pop.style.width = `${width}px`;
      pop.style.height = `${height}px`;
      pop.style.display = 'block';

      currentAnchor = anchorEl;
    }

    const onClick = (props) => {
      if (!props || props.item == null) { hidePopover(); return; }
      showPopoverOverItem(props);
    };
    timeline.on('click', onClick);

    function outsideClickHandler(e) {
      const pop = container.querySelector('#event-popover');
      if (!pop || pop.style.display === 'none') return;

      const target = e.target;
      const clickInPop = pop.contains(target);
      const clickOnAnchor = currentAnchor && currentAnchor.contains && currentAnchor.contains(target);

      if (!clickInPop && !clickOnAnchor) {
        hidePopover();
      }
    }
    document.addEventListener('mousedown', outsideClickHandler);

    // 8) 自适应窗口
    resizeHandler = () => {
      timeline.redraw();
      hidePopover(); // 尺寸变化避免错位
    };
    window.addEventListener('resize', resizeHandler);

    // 完整销毁：移除监听、弹窗
    const _baseDestroy = destroy;
    destroy = function () {
      document.removeEventListener('mousedown', outsideClickHandler);
      hidePopover();
      _baseDestroy();
    };

    window.__timelineInit = 'mounted';
    log('mounted with items:', items.get().length);

    // 9) 返回可操作句柄
    return { timeline, items, destroy, setItems, setOptions };
  } catch (err) {
    console.error(err);
    container.innerHTML =
      `<div style="padding:16px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">加载失败：${escapeHtml(err && err.message ? err.message : String(err))}</div>`;
    window.__timelineInit = 'error';
    return { timeline: null, items: null, destroy, setItems, setOptions };
  } finally {
    try { loading.remove(); } catch {}
  }
}
