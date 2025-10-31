// src/timeline/mount.js
// ✅ 职责：创建并挂载 vis Timeline；旧版映射 + 点击覆盖式弹窗（不自动消失）
// 依赖：window.ENDPOINT 由外部注入；TIMELINE_DEFAULT_OPTIONS 提供基础配置
import { escapeHtml } from '../utils/dom.js';
import { TIMELINE_DEFAULT_OPTIONS, ENDPOINT } from '../_staging/constants.js';

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

// loading 覆盖层
function createLoadingOverlay() {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = '加载时间轴数据中…';
  el.style.cssText =
    'position:absolute;top:12px;left:12px;background:#fff;border:1px solid #e5e7eb;padding:6px 10px;border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,.04);z-index:10;font-size:12px;';
  return el;
}

// 旧版：从 blob(多行文本)里提取“标签：值”
function pickFromBlob(blob, label) {
  const s = (blob == null ? '' : String(blob)).replace(/<[^>]*>/g, '');
  if (!s) return '';
  const re = new RegExp(label + '\\s*[:：]\\s*([^\\n<]+)');
  const m = re.exec(s);
  return m ? m[1].trim() : '';
}

// 旧版：把一条原始记录映射为 timeline item（含 title HTML）
function mapEventToItem(event, idx) {
  const contentText = event.content ?? event.Title ?? '(无标题)';
  const Start = event.Start ?? event.start ?? '';
  const End   = event.End   ?? event.end   ?? '';
  const blob  = (event.title ?? '').toString();

  const EventType       = event.EventType       ?? event.eventType       ?? pickFromBlob(blob, '事件类型');
  const Region          = event.Region          ?? event.region          ?? pickFromBlob(blob, '地区');
  const Platform        = event.Platform        ?? event.platform        ?? pickFromBlob(blob, '平台类型');
  const Company         = event.Company         ?? event.company         ?? pickFromBlob(blob, '公司');
  const Status          = event.Status          ?? event.status          ?? pickFromBlob(blob, '状态');
  const ConsolePlatform = event.ConsolePlatform ?? event.consolePlatform ?? pickFromBlob(blob, '主机类型');

  const TagRaw = event.Tag ?? event.tag ?? pickFromBlob(blob, '标签');
  const Tag = Array.isArray(TagRaw)
    ? TagRaw
    : String(TagRaw || '').split(',').map(s => s.trim()).filter(Boolean);

  // 旧版：优先使用 blob；否则拼接 HTML（允许空值但换行保持）
  const tooltipHtml = blob
    ? blob.replace(/\n/g, '<br>')
    : [
        `事件名称：${contentText}`,
        `事件类型：${EventType || ''}`,
        `时间：${Start || ''}${End ? ' ~ ' + End : ''}`,
        `状态：${Status || ''}`,
        `地区：${Region || ''}`,
        `平台类型：${Platform || ''}`,
        `主机类型：${ConsolePlatform || ''}`,
        `公司：${Company || ''}`
      ].join('<br>');

  return {
    id: event.id || `auto-${idx + 1}`,
    content: contentText,
    start: Start,
    end: End || undefined,
    title: tooltipHtml, // ✅ 关键：保留旧版 HTML 详情
    EventType, Region, Platform, Company, Status, ConsolePlatform,
    Tag,
    Description: event.Description ?? event.desc ?? '',
    Contributor: event.Contributor ?? event.Submitter ?? event.submitter ?? ''
  };
}

// 把各种时间输入转成毫秒时间戳
function toMs(tsLike) {
  if (typeof tsLike === 'number') return tsLike;
  const n = +new Date(tsLike);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * 主入口：渲染时间轴（旧版读取逻辑 + 点击覆盖式弹窗）
 * @param {HTMLElement} container
 * @param {Object} overrides
 */
export async function mountTimeline(container, overrides = {}) {
  window.__timelineInit = 'mounting';
  log('mountTimeline start');

  // 0) 防御
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
  if (!window.ENDPOINT) {
    container.innerHTML =
      '<div style="padding:12px;background:#fff3cd;border:1px solid #ffeeba;border-radius:8px;color:#856404;">未设置 ENDPOINT。</div>';
    window.__timelineInit = 'endpoint-missing';
    return;
  }

  // 1) 初始化
  window.__timelineItems = new window.vis.DataSet([]);
  window.__timeline = null;

  // 2) loading
  const loading = createLoadingOverlay();
  const originalPosition = container.style.position;
  const needRel = getComputedStyle(container).position === 'static';
  if (needRel) container.style.position = 'relative';
  container.appendChild(loading);

  let resizeHandler = null;
  let scrollHandler = null;
  let rangeChangeHandler = null;

  let timeline = null;
  let items = null;

  // 弹窗状态
  let currentItemId = null;
  let currentAnchorEl = null;

  // 销毁
  function destroy() {
    try { if (resizeHandler) window.removeEventListener('resize', resizeHandler); } catch {}
    try { if (scrollHandler) container.removeEventListener('scroll', scrollHandler, { passive: true }); } catch {}
    try { if (rangeChangeHandler) timeline.off('rangechanged', rangeChangeHandler); } catch {}
    try { if (timeline && timeline.destroy) timeline.destroy(); } catch {}
    try { if (container.contains(loading)) loading.remove(); } catch {}
    if (needRel) container.style.position = originalPosition || '';
    // 移除弹窗与外部点击监听
    try { document.removeEventListener('mousedown', outsideClickHandler); } catch {}
    try { const pop = container.querySelector('#event-popover'); if (pop) pop.remove(); } catch {}
    window.__timelineInit = 'destroyed';
    window.__timeline = null;
    window.__timelineItems = null;
  }

  // 弹窗：创建/获取
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
        'border-radius:10px',
        'padding:12px',
        'overflow:auto',
        'pointer-events:auto',
        'min-width:280px',
        'min-height:140px',
        'max-width:560px',
        'max-height:60vh',
        'font-size:14px',
        'line-height:1.55'
      ].join(';');
      container.appendChild(pop);
    }
    return pop;
  }

  function hidePopover() {
    const pop = container.querySelector('#event-popover');
    if (pop) pop.style.display = 'none';
    // 不清空 currentItemId / currentAnchorEl，让我们可以在 rangechanged/resize 时继续复位
  }

  function outsideClickHandler(e) {
    const pop = container.querySelector('#event-popover');
    if (!pop || pop.style.display === 'none') return;
    const clickInPop = pop.contains(e.target);
    const clickOnAnchor = currentAnchorEl && currentAnchorEl.contains && currentAnchorEl.contains(e.target);
    if (!clickInPop && !clickOnAnchor) hidePopover();
  }

  // 复位弹窗位置（保持显示，不消失）
  function repositionPopover() {
    const pop = container.querySelector('#event-popover');
    if (!pop || pop.style.display === 'none') return;
    if (!currentItemId) return;

    // 重新找 anchor（因为时间轴重绘后 DOM 变化）
    const selectorId = (window.CSS && CSS.escape)
      ? CSS.escape(String(currentItemId))
      : String(currentItemId).replace(/"/g, '\\"');
    const itemEl = container.querySelector(`.vis-item[data-id="${selectorId}"]`);
    if (!itemEl) {
      // 找不到锚点了，先隐藏
      hidePopover();
      return;
    }
    currentAnchorEl = itemEl;

    const cb = container.getBoundingClientRect();
    const ib = itemEl.getBoundingClientRect();

    const MIN_W = 280, MIN_H = 140;
    const MAX_W = Math.min(560, container.clientWidth);
    const MAX_H = Math.min(container.clientHeight * 0.6, 600);

    let top  = ib.top  - cb.top + container.scrollTop;
    let left = ib.left - cb.left + container.scrollLeft;
    let width  = Math.max(ib.width,  MIN_W);
    let height = Math.max(ib.height, MIN_H);
    width  = Math.min(width,  MAX_W);
    height = Math.min(height, MAX_H);

    const maxLeft = container.scrollLeft + (container.clientWidth  - width  - 8);
    const maxTop  = container.scrollTop  + (container.clientHeight - height - 8);

    left = Math.max(container.scrollLeft, Math.min(left, maxLeft));
    top  = Math.max(container.scrollTop,  Math.min(top,  maxTop));

    pop.style.left   = `${left}px`;
    pop.style.top    = `${top}px`;
    pop.style.width  = `${width}px`;
    pop.style.height = `${height}px`;
  }

  // 弹窗内容：优先使用 item.title（旧版 HTML）
  function buildDetailHTML(item) {
    if (typeof item?.title === 'string' && item.title.trim()) {
      return item.title;
    }
    // 兜底：简要信息（避免空白）
    const parts = [];
    const kv = (k, v) => (v == null || v === '' ? '' : `<div><strong>${escapeHtml(k)}：</strong>${escapeHtml(String(v))}</div>`);
    parts.push(kv('事件名称', item?.content || '(无标题)'));
    if (item?.start) parts.push(kv('开始时间', item.start));
    if (item?.end)   parts.push(kv('结束时间', item.end));
    if (Array.isArray(item?.Tag) && item.Tag.length) parts.push(kv('标签', item.Tag.join('，')));
    if (item?.Description) parts.push(kv('描述', item.Description));
    if (item?.Contributor) parts.push(kv('贡献者', item.Contributor));
    return parts.join('') || '<div>(无详情)</div>';
  }

  function showPopoverOverProps(props) {
    const pop = ensurePopover();
    currentItemId = props.item;

    // 先用事件源向上找 .vis-item，回退 data-id
    let anchor = props?.event?.target?.closest ? props.event.target.closest('.vis-item') : null;
    if (!anchor) {
      const selectorId = (window.CSS && CSS.escape)
        ? CSS.escape(String(currentItemId))
        : String(currentItemId).replace(/"/g, '\\"');
      anchor = container.querySelector(`.vis-item[data-id="${selectorId}"]`);
    }
    if (!anchor) return;

    currentAnchorEl = anchor;

    const cb = container.getBoundingClientRect();
    const ib = anchor.getBoundingClientRect();

    const MIN_W = 280, MIN_H = 140;
    const MAX_W = Math.min(560, container.clientWidth);
    const MAX_H = Math.min(container.clientHeight * 0.6, 600);

    let top  = ib.top  - cb.top + container.scrollTop;
    let left = ib.left - cb.left + container.scrollLeft;
    let width  = Math.max(ib.width,  MIN_W);
    let height = Math.max(ib.height, MIN_H);
    width  = Math.min(width,  MAX_W);
    height = Math.min(height, MAX_H);

    // 内容
    const item = items.get(currentItemId);
    pop.innerHTML = buildDetailHTML(item);

    // 边界
    const maxLeft = container.scrollLeft + (container.clientWidth  - width  - 8);
    const maxTop  = container.scrollTop  + (container.clientHeight - height - 8);
    left = Math.max(container.scrollLeft, Math.min(left, maxLeft));
    top  = Math.max(container.scrollTop,  Math.min(top,  maxTop));

    pop.style.left = `${left}px`;
    pop.style.top  = `${top}px`;
    pop.style.width  = `${width}px`;
    pop.style.height = `${height}px`;
    pop.style.display = 'block';
  }

  // 监听“外部点击关闭”
  function bindOutsideCloseOnce() {
    document.addEventListener('mousedown', outsideClickHandler);
  }

  try {
    // 3) 拉数据（旧版直取 ENDPOINT）
    const res = await fetch(window.ENDPOINT);
    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) {
      container.innerHTML =
        '<div style="padding:12px;background:#fff3cd;border:1px solid #ffeeba;border-radius:8px;color:#856404;">接口返回 0 条记录：请检查 Title/Start 字段是否存在，以及 Start 是否为可解析日期（如 1998-10-21）。</div>';
      window.__timelineInit = 'empty-data';
      return { timeline: null, items: null, destroy };
    }

    // 4) 旧版映射
    const mapped = raw.map((ev, i) => mapEventToItem(ev, i));

    // 5) DataSet
    items = new window.vis.DataSet(mapped);
    window.__timelineItems = items;

    // 6) 计算时间范围
    const times = mapped
      .map(it => toMs(it.start != null ? it.start : it.end))
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

    // 7) 选项（英文避免月份乱码；模板只渲染标题）
    const baseDefaults = {
      locale: 'en',
      minHeight: 720,
      maxHeight: 720,
      template: (item, element) => {
        const host = element?.closest?.('.vis-item') || element;
        if (host && host.classList) host.classList.add('event');
        const root = document.createElement('div');
        const h4 = document.createElement('h4');
        h4.className = 'event-title';
        h4.textContent = item?.content || '(无标题)';
        root.appendChild(h4);
        return root;
      },
    };

    const options = mergeOptions(
      TIMELINE_DEFAULT_OPTIONS,
      baseDefaults,
      overrides
    );
    if (startDate instanceof Date) options.start = startDate;
    if (endDate instanceof Date) options.end = endDate;

    // 8) 创建时间轴
    const vis = window.vis;
    timeline = new vis.Timeline(container, items, options);
    window.__timeline = timeline;

    // 9) 点击 → 覆盖式弹窗（只在外部点击时关闭）
    timeline.on('click', (props) => {
      if (!props || props.item == null) return hidePopover();
      showPopoverOverProps(props);
      bindOutsideCloseOnce();
    });

    // 10) 在可导致重绘/移动的场景下，仅“复位弹窗位置”，不隐藏
    resizeHandler = () => repositionPopover();
    window.addEventListener('resize', resizeHandler);

    scrollHandler = () => repositionPopover();
    container.addEventListener('scroll', scrollHandler, { passive: true });

    rangeChangeHandler = () => repositionPopover();
    timeline.on('rangechanged', rangeChangeHandler);

    window.__timelineInit = 'mounted';
    log('mounted with items:', items.get().length);

    return { timeline, items, destroy };
  } catch (err) {
    console.error(err);
    container.innerHTML =
      `<div style="padding:16px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">加载失败：${escapeHtml(err && err.message ? err.message : String(err))}</div>`;
    window.__timelineInit = 'error';
    return { timeline: null, items: null, destroy };
  } finally {
    try { loading.remove(); } catch {}
  }
}
