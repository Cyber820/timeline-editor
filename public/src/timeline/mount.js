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
  const m = /(事件名称)\s*[:：]\s*([^\n<]+)/.exec(s);
  return m ? m[2].trim() : '';
}

/** 兼容各种形态，尽力取出“可显示的标题纯文本” */
function resolveTitle(item) {
  const t1 = toPlainText(item && item.Title);
  if (t1) return t1;
  const t2 = toPlainText(item && item.title);
  if (t2) return t2;

  const fromTitleBlob = pickTitleFromBlob(item && item.title);
  if (fromTitleBlob) return fromTitleBlob;

  const fromContentBlob = pickTitleFromBlob(item && item.content);
  if (fromContentBlob) return fromContentBlob;

  const t3 = toPlainText(item && item.content);
  if (t3) return t3;

  const t4 = toPlainText(item && item.label);
  if (t4) return t4;

  return '(无标题)';
}

// 从 blob（多行字符串）里解析“字段名：值”（支持中/英文冒号）
function pickFromBlob(blob, label) {
  const s = toPlainText(blob);
  if (!s) return '';
  const re = new RegExp(`${label}\\s*[:：]\\s*([^\\n<]+)`);
  const m = re.exec(s);
  return m ? m[1].trim() : '';
}

// 多候选键读取：item[key]、item[key 的变体]、item._raw[key]…；再兜底从 blob 里捞
function readField(item, keys = [], blobLabel = '') {
  const tryKeys = [];
  keys.forEach(k => {
    tryKeys.push(k);
    tryKeys.push(k.charAt(0).toLowerCase() + k.slice(1));
    tryKeys.push(k.toUpperCase());
    tryKeys.push(k.toLowerCase());
  });

  for (const k of tryKeys) {
    if (item && item[k] != null && item[k] !== '') return item[k];
  }
  if (item && item._raw) {
    for (const k of tryKeys) {
      if (item._raw[k] != null && item._raw[k] !== '') return item._raw[k];
    }
  }
  if (blobLabel) {
    const v1 = pickFromBlob(item && item.title, blobLabel);
    if (v1) return v1;
    const v2 = pickFromBlob(item && item.content, blobLabel);
    if (v2) return v2;
  }
  return '';
}

// 标准化标签为数组
function normalizeTags(v) {
  if (!v && v !== 0) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return String(v)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

const fmtDate = (v) => {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(+d) ? d.toISOString().slice(0,10) : String(v);
};

// ✅ 统一的详情 HTML 生成（空值不渲染行，避免“标签：”空行）
function buildDetailHTML(item) {
  if (typeof item?.title === 'string' && item.title.trim()) {
    return item.title;
  }

  const evtType = readField(item, ['EventType'], '事件类型');
  const region  = readField(item, ['Region'], '地区');
  const plat    = readField(item, ['Platform'], '平台类型');
  const cplat   = readField(item, ['ConsolePlatform'], '主机类型');
  const company = readField(item, ['Company'], '公司');
  const desc    = readField(item, ['Description', 'Desc'], '描述');
  const contr   = readField(item, ['Contributor', 'Submitter'], '贡献者');
  const tagsRaw = readField(item, ['Tag', 'Tags'], '标签');
  const tags    = Array.isArray(tagsRaw) ? tagsRaw : normalizeTags(tagsRaw);

  const kv = (k, v) =>
    v == null || v === '' ? '' : `<div><strong>${escapeHtml(k)}：</strong>${escapeHtml(String(v))}</div>`;

  const parts = [];
  parts.push(kv('事件名称', resolveTitle(item)));
  if (item.start) parts.push(kv('开始时间', fmtDate(item.start)));
  if (item.end)   parts.push(kv('结束时间', fmtDate(item.end)));
  parts.push(kv('事件类型', evtType));
  parts.push(kv('地区', region));
  parts.push(kv('平台类型', plat));
  parts.push(kv('主机类型', cplat));
  parts.push(kv('公司', company));
  if (tags.length) parts.push(kv('标签', tags.join('，')));
  parts.push(kv('描述', desc));
  parts.push(kv('贡献者', contr));

  return `
    <div style="font-weight:600;margin-bottom:6px">${escapeHtml(resolveTitle(item))}</div>
    <div style="font-size:13px;line-height:1.6">
      ${parts.join('')}
    </div>
  `;
}

// 兼容 DataSet 中 id 的字符串/数字差异
function getItemByIdSafe(dataset, id) {
  return dataset.get(id) ?? dataset.get(
    typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : String(id)
  );
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

    // 5) 计算时间范围（容错）
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

    // 6) 默认参数（先用英文避免月份乱码）
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
      TIMELINE_DEFAULT_OPTIONS,
      baseDefaults,
      overrides
    );
    if (startDate instanceof Date) options.start = startDate;
    if (endDate   instanceof Date) options.end   = endDate;

    // 7) 创建时间轴
    const vis = window.vis;
    timeline = new vis.Timeline(container, items, options);
    window.__timeline = timeline;

    // ======================
    // === 覆盖式弹窗逻辑 ===
    // ======================

    // 弹窗节点（绝对定位，覆盖点击的事件框；给定最小/最大尺寸和较高层级）
    function ensurePopover() {
      let pop = container.querySelector('#event-popover');
      if (!pop) {
        pop = document.createElement('div');
        pop.id = 'event-popover';
        pop.style.cssText = [
          'position:absolute',
          'z-index:10000',
          'background:#fff',
          'border:1px solid #e5e7eb',
          'box-shadow:0 8px 24px rgba(0,0,0,.15)',
          'border-radius:10px',
          'padding:12px',
          'overflow:auto',
          'pointer-events:auto',
          'min-width:280px',
          'min-height:140px',
          'max-width:520px',
          'max-height:60vh',
          'font-size:14px',
          'line-height:1.5'
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

    // 稳定拿到点击的 .vis-item（优先用 srcEvent.target，再回退 data-id）
    function findAnchorElementFromClick(props) {
      const evt = props && (props.event?.srcEvent || props.event);
      const t = evt && evt.target;
      const hit = t && t.closest ? t.closest('.vis-item') : null;
      if (hit) return hit;

      if (!props || props.item == null) return null;
      const selectorId = (window.CSS && CSS.escape)
        ? CSS.escape(String(props.item))
        : String(props.item).replace(/"/g, '\\"');
      return container.querySelector(`.vis-item[data-id="${selectorId}"]`);
    }

    function showPopoverOverItem(props) {
      const pop = ensurePopover();
      const itemId = props.item;

      // 先找点击锚点
      const anchorEl = findAnchorElementFromClick(props);
      if (!anchorEl) return;

      // 滚动参照：vis 内部通常是 .vis-content 滚动
      const scroller = container.querySelector('.vis-panel > .vis-content')
                      || container.querySelector('.vis-content')
                      || container;

      const cb = container.getBoundingClientRect();
      const ib = anchorEl.getBoundingClientRect();

      let top  = ib.top  - cb.top + scroller.scrollTop;
      let left = ib.left - cb.left + scroller.scrollLeft;

      // 期望尺寸（不至于过小）
      const MIN_W = 280, MIN_H = 140;
      const MAX_W = Math.min(520, container.clientWidth);
      const MAX_H = Math.min(container.clientHeight * 0.6, 600);

      let width  = Math.max(ib.width,  MIN_W);
      let height = Math.max(ib.height, MIN_H);
      width  = Math.min(width,  MAX_W);
      height = Math.min(height, MAX_H);

      // 取数据
      const item = getItemByIdSafe(items, itemId);
      if (!item) return;
      pop.innerHTML = buildDetailHTML(item);

      // 边界修正
      const maxLeft = scroller.scrollLeft + (container.clientWidth  - width  - 8);
      const maxTop  = scroller.scrollTop  + (container.clientHeight - height - 8);
      left = Math.max(scroller.scrollLeft, Math.min(left, maxLeft));
      top  = Math.max(scroller.scrollTop,  Math.min(top,  maxTop));

      // 定位显示
      pop.style.left = `${left}px`;
      pop.style.top  = `${top}px`;
      pop.style.width  = `${width}px`;
      pop.style.height = `${height}px`;
      pop.style.display = 'block';

      currentAnchor = anchorEl;
    }

    // 点击 item → 弹出；点击空白 → 关闭（兼容不同版本事件名）
    const onClick = (props) => {
      if (!props || props.item == null) { hidePopover(); return; }
      showPopoverOverItem(props);
    };
    timeline.on('click', onClick);
    timeline.on('itemclick', onClick);

    // 外部点击关闭：既不在弹窗里也不在锚点里
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

    // 8) 自适应窗口（并关闭弹窗避免错位）
    resizeHandler = () => {
      timeline.redraw();
      hidePopover();
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
