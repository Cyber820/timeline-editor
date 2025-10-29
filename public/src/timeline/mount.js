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
      'border-radius:10px',
      'padding:12px',
      'overflow:auto',
      'pointer-events:auto',
      // 新增：最小/最大尺寸，避免过小；过大时内部滚动
      'min-width: 280px',
      'min-height: 140px',
      'max-width: 520px',
      'max-height: 60vh',
      // 字体与排版
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

// 解析 “字段名：值” 的通用函数（支持中文/英文冒号）
function pickFromBlob(blob, label) {
  const s = toPlainText(blob);
  if (!s) return '';
  const re = new RegExp(`${label}\\s*[:：]\\s*([^\\n<]+)`);
  const m = re.exec(s);
  return m ? m[1].trim() : '';
}

// 多候选键读取：item[key]、变体、_raw[key]；再兜底从 blob 里捞
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
  return String(v).split(',').map(s => s.trim()).filter(Boolean);
}

// key-value 行：空值直接不渲染
function kv(k, v) {
  const s = (v == null) ? '' : String(v).trim();
  if (!s) return '';
  return `<div><strong>${escapeHtml(k)}：</strong>${escapeHtml(s)}</div>`;
}

// ✅ 重新实现：不再直接返回 item.title；统一解析后“干净渲染”
function buildDetailHTML(item) {
  const evtType = readField(item, ['EventType'], '事件类型');
  const region  = readField(item, ['Region'], '地区');
  const plat    = readField(item, ['Platform'], '平台类型');
  const cplat   = readField(item, ['ConsolePlatform'], '主机类型');
  const company = readField(item, ['Company'], '公司');
  const desc    = readField(item, ['Description', 'Desc'], '描述');
  const contr   = readField(item, ['Contributor', 'Submitter'], '贡献者');
  const tagsRaw = readField(item, ['Tag', 'Tags'], '标签');
  const tags    = Array.isArray(tagsRaw) ? tagsRaw : normalizeTags(tagsRaw);

  const parts = [];
  // 标题单独加粗一行
  const titleLine = `<div style="font-weight:600;margin-bottom:6px">${escapeHtml(resolveTitle(item))}</div>`;
  // 时间行
  parts.push(kv('开始时间', item.start));
  parts.push(kv('结束时间', item.end));
  // 其它字段
  parts.push(kv('事件类型', evtType));
  parts.push(kv('地区', region));
  parts.push(kv('平台类型', plat));
  parts.push(kv('主机类型', cplat));
  parts.push(kv('公司', company));
  if (tags.length) parts.push(kv('标签', tags.join('，')));
  parts.push(kv('描述', desc));
  parts.push(kv('贡献者', contr));

  return `${titleLine}<div style="font-size:13px;line-height:1.6">${parts.join('')}</div>`;
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

  // 先找点击锚点（优先 target.closest('.vis-item')，回退 data-id）
  const anchorEl = findAnchorElementFromClick(props);
  if (!anchorEl) return;

  // 容器与锚点位置
  const cb = container.getBoundingClientRect();
  const ib = anchorEl.getBoundingClientRect();

  // 以事件框为锚点的“起始位置”（覆盖出现）
  let top  = ib.top  - cb.top + container.scrollTop;
  let left = ib.left - cb.left + container.scrollLeft;

  // 期望尺寸：至少不小于最小尺寸；最多不超过最大尺寸
  // （注意：内联样式里我们已经写了 min/max；JS 里再计算一次用于边界修正）
  const MIN_W = 280, MIN_H = 140;
  const MAX_W = Math.min(520, container.clientWidth);   // 不超过容器可视宽
  const MAX_H = Math.min(container.clientHeight * 0.6, 600); // 不超过容器 60% 高

  let width  = Math.max(ib.width,  MIN_W);
  let height = Math.max(ib.height, MIN_H);
  width  = Math.min(width,  MAX_W);
  height = Math.min(height, MAX_H);

  // 取出 Item 数据并填充
  const item = items.get(itemId);
  pop.innerHTML = buildDetailHTML(item);

  // 边界防溢出：如果右侧或下方会超出容器，就往左/上收回
  const maxLeft = container.scrollLeft + (container.clientWidth  - width  - 8); // 预留 8px 内边距
  const maxTop  = container.scrollTop  + (container.clientHeight - height - 8);

  left = Math.max(container.scrollLeft, Math.min(left, maxLeft));
  top  = Math.max(container.scrollTop,  Math.min(top,  maxTop));

  // 应用定位与尺寸
  pop.style.left = `${left}px`;
  pop.style.top  = `${top}px`;
  pop.style.width  = `${width}px`;
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
