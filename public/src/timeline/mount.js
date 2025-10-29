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
  const t1 = toPlainText(item?.Title);
  if (t1) return t1;
  const t2 = toPlainText(item?.title);
  if (t2) return t2;

  // 2) 从大段详情里解析“事件名称：xxx”
  const fromTitleBlob = pickTitleFromBlob(item?.title);
  if (fromTitleBlob) return fromTitleBlob;

  const fromContentBlob = pickTitleFromBlob(item?.content);
  if (fromContentBlob) return fromContentBlob;

  // 3) 退回到 content/label 的纯文本
  const t3 = toPlainText(item?.content);
  if (t3) return t3;

  const t4 = toPlainText(item?.label);
  if (t4) return t4;

  // 4) 最终兜底
  return '(无标题)';
}

/**
 * 主入口：渲染时间轴
 * @param {HTMLElement} container - 目标容器
 * @param {Object} overrides - 可覆盖的 vis 选项（与 TIMELINE_DEFAULT_OPTIONS & 本地 defaults 合并）
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

  // 局部句柄
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
    if (Array.isArray(nextItems) && nextItems.length) items.add(nextItems);
    if (timeline?.redraw) requestAnimationFrame(() => timeline.redraw());
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

    // 5) 计算时间范围
    const ts = items.get().map(it => toMs(it.start || it.end)).filter(Number.isFinite);
    const minT = ts.length ? Math.min(...ts) : NaN;
    const maxT = ts.length ? Math.max(...ts) : NaN;
    const pad = ts.length ? Math.max(7, Math.round((maxT - minT) * 0.05)) : 0;

    // 6) 默认参数（核心调节区）
    const baseDefaults = {
      minHeight: 720,
      maxHeight: 720,
      // 为避免月份乱码，先用英文。后续换 zh-cn 再配合 moment/locale
      locale: 'en',
      start: Number.isFinite(minT) ? new Date(minT - pad) : undefined,
      end: Number.isFinite(maxT) ? new Date(maxT + pad) : undefined,
      // 仅显示“标题”
      template: (item, element) => {
        const host = element?.closest?.('.vis-item') || element;
        if (host) host.classList.add('event');
        const root = document.createElement('div');
        const h4 = document.createElement('h4');
        h4.className = 'event-title';
        h4.textContent = resolveTitle(item);
        root.appendChild(h4);
        return root;
      },
    };

    const options = mergeOptions(
      TIMELINE_DEFAULT_OPTIONS,
      baseDefaults,
      overrides
    );

    // 7) 创建时间轴
    const vis = window.vis;
    timeline = new vis.Timeline(container, items, options);
    window.__timeline = timeline;

    // ======================
    // === 覆盖式弹窗逻辑 ===
    // ======================

    // 关键：vis 的可视内容容器
    const contentEl = container.querySelector('.vis-content') || container;

    // 1) 创建/获取弹窗节点（挂到 .vis-content 里）
    function ensurePopover() {
      let pop = contentEl.querySelector('#event-popover');
      if (!pop) {
        pop = document.createElement('div');
        pop.id = 'event-popover';
        pop.style.cssText = [
          'position:absolute',
          'z-index:9999',
          'background:#fff',
          'border:1px solid #e5e7eb',
          'box-shadow:0 8px 24px rgba(0,0,0,.15)',
          'border-radius:8px',
          'overflow:auto',
          'pointer-events:auto',
          'padding:10px'
        ].join(';');
        contentEl.appendChild(pop);
      }
      return pop;
    }

    // 2) 关闭弹窗
    let currentAnchor = null; // 当前锚定的事件框元素
    function hidePopover() {
      const pop = contentEl.querySelector('#event-popover');
      if (pop) pop.style.display = 'none';
      currentAnchor = null;
    }

    // 3) 渲染弹窗内容（优先用 item.title 的 HTML，否则拼装）
    function buildDetailHTML(item) {
      if (typeof item.title === 'string' && item.title.trim()) return item.title;
      const safe = (v) => (v == null ? '' : String(v));
      const kv = (k, v) => `<div><strong>${k}：</strong>${safe(v)}</div>`;
      const parts = [];
      parts.push(kv('事件名称', resolveTitle(item)));
      if (item.start) parts.push(kv('开始时间', safe(item.start)));
      if (item.end)   parts.push(kv('结束时间', safe(item.end)));
      if (item.EventType)       parts.push(kv('事件类型', item.EventType));
      if (item.Region)          parts.push(kv('地区', item.Region));
      if (item.Platform)        parts.push(kv('平台类型', item.Platform));
      if (item.ConsolePlatform) parts.push(kv('主机类型', item.ConsolePlatform));
      if (item.Company)         parts.push(kv('公司', item.Company));
      if (Array.isArray(item.Tag) && item.Tag.length) {
        parts.push(kv('标签', item.Tag.join('，')));
      }
      return parts.join('');
    }

    // 4) 定位并显示弹窗：覆盖点击的事件框
    function showPopoverOverItem(itemId) {
      const pop = ensurePopover();

      // 在 .vis-content 里查找 item 节点
      const selectorId = (window.CSS && CSS.escape)
        ? CSS.escape(String(itemId))
        : String(itemId).replace(/"/g, '\\"');

      const itemEl = contentEl.querySelector(`.vis-item[data-id="${selectorId}"]`);
      if (!itemEl) return;

      // 以 .vis-content 为参照计算定位
      const cb = contentEl.getBoundingClientRect();
      const ib = itemEl.getBoundingClientRect();

      const top  = ib.top  - cb.top;
      const left = ib.left - cb.left;
      const width  = ib.width;
      const height = ib.height;

      // 读取数据 & 填充内容
      const item = items.get(itemId);
      pop.innerHTML = buildDetailHTML(item);

      // 覆盖到 item 位置和尺寸
      pop.style.top = `${top}px`;
      pop.style.left = `${left}px`;
      pop.style.width = `${width}px`;
      pop.style.height = `${height}px`;
      pop.style.display = 'block';

      currentAnchor = itemEl;
    }

    // 5) 点击行为：点击事件框 → 弹出；点击空白 → 关闭
    const onClick = (props) => {
      if (!props || !props.item) { hidePopover(); return; }
      showPopoverOverItem(props.item);
    };
    timeline.on('click', onClick);

    // 点击容器或文档其他位置时关闭（不在弹窗内且不在锚点上）
    function outsideClickHandler(e) {
      const pop = contentEl.querySelector('#event-popover');
      if (!pop || pop.style.display === 'none') return;

      const t = e.target;
      const clickInPop = pop.contains(t);
      const clickOnAnchor = currentAnchor && currentAnchor.contains && currentAnchor.contains(t);

      if (!clickInPop && !clickOnAnchor) hidePopover();
    }
    document.addEventListener('mousedown', outsideClickHandler);

    // 窗口变化：重绘并关闭弹窗避免错位
    resizeHandler = () => { timeline.redraw(); hidePopover(); };
    window.addEventListener('resize', resizeHandler);

    // 覆盖 destroy，加入清理
    const _baseDestroy = destroy;
    destroy = function () {
      document.removeEventListener('mousedown', outsideClickHandler);
      hidePopover();
      _baseDestroy();
    };

    // ======================
    // === 覆盖式弹窗逻辑 End
    // ======================

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
