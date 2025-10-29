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

/** 从纯文本 blob 中提取 “字段名：值”（支持中/英冒号） */
function pickFromBlob(blob, label) {
  const s = toPlainText(blob);
  if (!s) return '';
  const re = new RegExp(`${label}\\s*[:：]\\s*([^\\n<]+)`);
  const m = re.exec(s);
  return m ? m[1].trim() : '';
}

/** 旧前端策略：优先字段值 -> 失败再从 title/content 文本里 pick */
function readFieldLegacy(item, fieldKeys = [], blobLabel = '') {
  const tryKeys = [];
  fieldKeys.forEach(k => {
    tryKeys.push(k, k.toLowerCase(), k.toUpperCase(), k.charAt(0).toLowerCase() + k.slice(1));
  });
  for (const k of tryKeys) {
    if (item && item[k] != null && item[k] !== '') return item[k];
  }
  if (blobLabel) {
    const v1 = pickFromBlob(item && item.title, blobLabel);
    if (v1) return v1;
    const v2 = pickFromBlob(item && item.content, blobLabel);
    if (v2) return v2;
  }
  return '';
}

/** 标准化标签为数组 */
function normalizeTags(v) {
  if (!v && v !== 0) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return String(v).split(',').map(s => s.trim()).filter(Boolean);
}

/** 安全输出一行：空值则不渲染 */
function kv(label, value) {
  const s = (value == null) ? '' : String(value).trim();
  if (!s) return '';
  return `<div><strong>${escapeHtml(label)}：</strong>${escapeHtml(s)}</div>`;
}

/** ✅ 详情弹窗内容：严格过滤空值，绝不渲染“裸标签：” */
function buildDetailHTML(item) {
  // 标题
  const titleText = resolveTitle(item);

  // 旧前端字段兼容 + 文本兜底
  const start    = readFieldLegacy(item, ['Start', 'start'], '时间');
  const end      = readFieldLegacy(item, ['End', 'end'], '时间');
  const eventTyp = readFieldLegacy(item, ['EventType'], '事件类型');
  const region   = readFieldLegacy(item, ['Region'], '地区');
  const platform = readFieldLegacy(item, ['Platform'], '平台类型');
  const cplat    = readFieldLegacy(item, ['ConsolePlatform'], '主机类型');
  const company  = readFieldLegacy(item, ['Company'], '公司');
  const status   = readFieldLegacy(item, ['Status'], '状态');
  const desc     = readFieldLegacy(item, ['Description', 'Desc'], '描述');
  const contr    = readFieldLegacy(item, ['Contributor', 'Submitter'], '贡献者');

  // 标签：字段或“标签：xxx”行兜底
  let tags = readFieldLegacy(item, ['Tag', 'Tags'], '标签');
  const tagList = Array.isArray(tags) ? tags : normalizeTags(tags);

  // 组装（空值不渲染）
  const parts = [];
  const titleLine = `<div style="font-weight:600;margin-bottom:6px">${escapeHtml(titleText)}</div>`;

  // 时间行（两端之一存在时再渲染；合并为一行）
  if ((start && String(start).trim()) || (end && String(end).trim())) {
    const timeText = `${start || ''}${end ? (' ~ ' + end) : ''}`.trim();
    if (timeText) parts.push(kv('时间', timeText));
  }

  parts.push(kv('事件类型', eventTyp));
  parts.push(kv('状态', status));
  parts.push(kv('地区', region));
  parts.push(kv('平台类型', platform));
  parts.push(kv('主机类型', cplat));
  parts.push(kv('公司', company));
  if (tagList.length) parts.push(kv('标签', tagList.join('，')));
  parts.push(kv('描述', desc));
  parts.push(kv('贡献者', contr));

  return `${titleLine}<div style="font-size:13px;line-height:1.6">${parts.join('')}</div>`;
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

    // 6) 默认参数（核心调节区），合并 constants 默认
    const baseDefaults = {
      // 先用英文避免月份乱码
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

    // 1) 创建/获取弹窗节点（绝对定位：覆盖起点，但允许自适应更大宽高）
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
          'pointer-events:auto',
          'padding:12px',
          'min-width:280px',
          'max-width:520px',
          'max-height:60vh',
          'overflow:auto',
          'display:none'
        ].join(';');
        container.appendChild(pop);
      }
      return pop;
    }

    // 2) 关闭弹窗
    let currentAnchor = null; // 当前锚定的事件框元素
    function hidePopover() {
      const pop = container.querySelector('#event-popover');
      if (pop) pop.style.display = 'none';
      currentAnchor = null;
    }

    // 3) 定位并显示弹窗：覆盖点击的事件框（左上对齐，宽度≥item 宽，必要时扩展）
    function showPopoverOverItem(itemId) {
      const pop = ensurePopover();

      // vis 会给每个 item 一个 data-id
      const selectorId = (window.CSS && CSS.escape) ? CSS.escape(String(itemId)) : String(itemId).replace(/"/g, '\\"');
      const itemEl = container.querySelector(`.vis-item[data-id="${selectorId}"]`);
      if (!itemEl) return;

      // 取出该 Item 的数据，构建内容
      const item = items.get(itemId);
      pop.innerHTML = buildDetailHTML(item);

      // 计算相对容器的定位
      const cb = container.getBoundingClientRect();
      const ib = itemEl.getBoundingClientRect();

      const left = ib.left - cb.left + container.scrollLeft;
      const top  = ib.top  - cb.top  + container.scrollTop;

      // 让弹窗至少与 item 同宽，但保留上限
      const itemWidth = Math.max(ib.width, 1);
      const targetWidth = Math.max(itemWidth, 280); // 至少 280
      pop.style.width = Math.min(targetWidth, 520) + 'px';
      pop.style.left  = left + 'px';
      pop.style.top   = top  + 'px';
      pop.style.display = 'block';

      // 边界防护：若超出容器右侧，向左回退
      const cScrollW = container.scrollWidth;
      const cClientW = container.clientWidth;
      // 以容器可视宽度为准做一次矫正
      const overflowX = (left + pop.offsetWidth) - cClientW - container.scrollLeft;
      if (overflowX > 0) {
        const newLeft = Math.max(0, left - overflowX - 8);
        pop.style.left = newLeft + 'px';
      }

      currentAnchor = itemEl;
    }

    // 4) 点击行为：点击事件框 → 弹出；点击空白 → 关闭
    const onClick = (props) => {
      if (!props || !props.item) { hidePopover(); return; }
      showPopoverOverItem(props.item);
    };
    timeline.on('click', onClick);

    // 外部点击关闭：点击容器内非弹窗/非锚点区域 & 点击容器外
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
      // 关闭弹窗（避免窗口改变后错位）
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
