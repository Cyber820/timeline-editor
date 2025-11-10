// public/src/timeline/mount.js
// ✅ 版本要点：
// - 仅“点击弹窗”，无悬停 tooltip（不设置 item.title，不配置 options.tooltip）
// - 事件卡片只显示“事件名称”
// - 过滤逻辑分离：“确定”只更新规则，AND/OR 按钮才实际过滤
// - 集成 filter-ui.js / filter-state.js / filter-engine.js
// - ➕ 在“筛选/过滤”右侧插入 5 个样式按钮，点击打开你现有的样式面板（style-panel.js）

import { fetchAndNormalize } from './fetch.js';
import { initFilterUI } from '../filter/filter-ui.js';
import {
  filterState,
  setLogic,
  upsertRule,
  clearRules,
  removeRule,
  getState,
} from '../filter/filter-state.js';
import { applyFilters } from '../filter/filter-engine.js';

// ✅ 复用你现有的样式面板与运行时内存（路径按你的目录结构）
import { openStylePanel } from '../ui/style-panel.js';
import { stateMem } from '../style/stateMem.js';

/* ----------------------------------------------------------------
 * 🧩 显示参数配置
 * ---------------------------------------------------------------- */
const UI = {
  canvas: { height: 1000 },
  item: {
    fontSize: 10,
    paddingX: 10,
    paddingY: 6,
    borderRadius: 10,
    maxWidth: 320,
  },
  layout: {
    itemPosition: 'bottom',
    axisPosition: 'bottom',
    verticalItemGap: 5,
    stack: true,
  },
  zoom: {
    key: 'ctrlKey',
    verticalScroll: true,
  },
};

/* ====================== 工具函数 ====================== */

const toPlain = (x) => (x == null ? '' : String(x).replace(/<[^>]*>/g, '').trim());

const asDisplay = (v) => {
  const s = v == null ? '' : String(v).trim();
  return s ? s : '—';
};

const FIELD_LABELS = [
  '事件名称', '事件类型', '时间', '状态',
  '地区', '平台类型', '主机类型',
  '公司', '标签', '描述', '贡献者'
];

function parseBlobFields(blob) {
  const s = toPlain(blob);
  const out = {};
  if (!s) return out;

  const escaped = FIELD_LABELS.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const lookahead = `(?=\\s*(?:${escaped.join('|')})\\s*[:：]|$)`;

  for (const label of FIELD_LABELS) {
    const re = new RegExp(`${label}\\s*[:：]\\s*([\\s\\S]*?)${lookahead}`, 'i');
    const m = re.exec(s);
    if (m) out[label] = m[1].replace(/\\n/g, '\n').trim();
  }

  const t = out['时间'];
  if (t) {
    const m1 = /([0-9]{4}-[0-9]{2}-[0-9]{2})\s*[~—–-]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(t);
    if (m1) {
      out.__start = m1[1];
      out.__end = m1[2];
    } else {
      const m2 = /([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(t);
      if (m2) out.__start = m2[1];
    }
  }

  return out;
}

function normalizeTags(v) {
  if (!v && v !== 0) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return String(v).split(',').map(s => s.trim()).filter(Boolean);
}

function buildKvHTML(obj) {
  const kv = [
    ['事件名称', obj.title],
    ['开始时间', obj.start],
    ['结束时间', obj.end],
    ['事件类型', obj.EventType],
    ['地区', obj.Region],
    ['平台类型', obj.Platform],
    ['主机类型', obj.ConsolePlatform],
    ['公司', obj.Company],
    ['标签', Array.isArray(obj.Tag) ? obj.Tag.join('，') : (obj.Tag || '')],
    ['描述', obj.Description],
    ['贡献者', obj.Contributor || obj.Submitter],
  ];

  const rows = kv.map(([k, v]) =>
    `<div class="kv-row" style="display:flex;gap:8px;align-items:flex-start;">
       <dt class="kv-key" style="min-width:84px;flex:0 0 auto;font-weight:600;">${k}</dt>
       <dd class="kv-val" style="margin:0;white-space:pre-wrap;word-break:break-word;">${asDisplay(v)}</dd>
     </div>`
  ).join('');

  return `
    <div style="font-weight:700;margin-bottom:8px">${asDisplay(obj.title)}</div>
    <dl class="kv" style="display:flex;flex-direction:column;gap:6px;font-size:13px;line-height:1.6;">
      ${rows}
    </dl>
  `;
}

function createLoadingOverlay() {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = '加载时间轴数据中…';
  el.style.cssText =
    'position:absolute;top:12px;left:12px;background:#fff;border:1px solid #e5e7eb;padding:6px 10px;border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,.04);z-index:10;font-size:12px;';
  return el;
}

function toMs(tsLike) {
  if (typeof tsLike === 'number') return tsLike;
  const n = +new Date(tsLike);
  return Number.isFinite(n) ? n : NaN;
}

function injectScopedStyles(container, ui = UI) {
  const scope = `tl-scope-${Math.random().toString(36).slice(2, 8)}`;
  container.classList.add(scope);

  const css = `
    .${scope} .vis-item.event {
      border-radius: ${ui.item.borderRadius}px;
    }
    .${scope} .vis-item .vis-item-content {
      padding: ${ui.item.paddingY}px ${ui.item.paddingX}px;
      max-width: ${ui.item.maxWidth}px;
    }
    .${scope} .event-title {
      font-size: ${ui.item.fontSize}px;
      line-height: 1.4;
      margin: 0;
      max-width: ${ui.item.maxWidth}px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .${scope} #event-popover {
      position: absolute;
      z-index: 1000;
      background: #fff;
      border: 1px solid #e5e7eb;
      box-shadow: 0 8px 24px rgba(0,0,0,.15);
      border-radius: 10px;
      padding: 12px;
      overflow: auto;
      pointer-events: auto;
      min-width: 280px;
      min-height: 140px;
      max-width: 700px;
      max-height: 70vh;
      font-size: 12px;
      line-height: 1;
      display: none;
    }
  `.trim();

  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-scope', scope);
  styleEl.textContent = css;
  container.appendChild(styleEl);

  return scope;
}

/* =================== 样式按钮（调用你现有的 style-panel） =================== */

// 5 个按钮：字面与字段一一对应
const STYLE_ATTR_BTNS = [
  { key: 'event',    label: '事件样式',  field: 'EventType' },
  { key: 'platform', label: '平台样式',  field: 'Platform' },
  { key: 'console',  label: '主机样式',  field: 'ConsolePlatform' },
  { key: 'company',  label: '公司样式',  field: 'Company' },
  { key: 'region',   label: '地区样式',  field: 'Region' },
];

let styleBtnCssInjected = false;
function injectStyleBtnCss() {
  if (styleBtnCssInjected) return;
  const css = `
    .te-style-btn {
      display:inline-flex; align-items:center; gap:.25rem;
      padding:.35rem .6rem; border:1px solid var(--te-border, #dadde1);
      border-radius:.5rem; background:#fff; cursor:pointer; font-size:.9rem;
    }
    .te-style-btn + .te-style-btn { margin-left:.5rem; }
    .te-style-btn:hover { background:#f6f7f9; }
  `;
  const tag = document.createElement('style');
  tag.setAttribute('data-te-style-buttons', 'true');
  tag.textContent = css;
  document.head.appendChild(tag);
  styleBtnCssInjected = true;
}

/** 寻找“筛选/过滤”按钮附近（容错：先找 data-attr，再退化到文本匹配） */
function findFilterButtonNear(container) {
  let filterBtn = document.querySelector('[data-role="filter-toggle"], [data-te-filter-toggle]');
  let toolbarEl = filterBtn?.parentElement;

  if (!filterBtn) {
    const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
    filterBtn = candidates.find(b => {
      const t = (b.textContent || '').trim();
      return t === '筛选' || t === '过滤' || t.includes('筛选') || t.includes('过滤');
    });
    toolbarEl = filterBtn?.parentElement || null;
  }

  if (!filterBtn && container) {
    const siblings = [];
    if (container.previousElementSibling) siblings.push(container.previousElementSibling);
    if (container.nextElementSibling) siblings.push(container.nextElementSibling);
    for (const sib of siblings) {
      const btn = sib.querySelector('[data-role="filter-toggle"], [data-te-filter-toggle]') ||
                  Array.from(sib.querySelectorAll('button, [role="button"]'))
                    .find(b => /筛选|过滤/.test((b.textContent || '').trim()));
      if (btn) {
        filterBtn = btn;
        toolbarEl = btn.parentElement;
        break;
      }
    }
  }

  return { toolbarEl: toolbarEl || null, filterBtn: filterBtn || null };
}

/**
 * 在“筛选/过滤”按钮右侧挂载 5 个样式按钮。
 * 点击后：设置 stateMem.currentStyleAttr，并打开你现有的样式面板（style-panel）。
 */
function mountStyleButtonsRightOfFilter(container) {
  injectStyleBtnCss();

  const doAttach = () => {
    const { toolbarEl, filterBtn } = findFilterButtonNear(container);
    if (!toolbarEl || !filterBtn) return false;

    const frag = document.createDocumentFragment();

    STYLE_ATTR_BTNS.forEach(def => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'te-style-btn';
      btn.textContent = def.label;
      btn.addEventListener('click', () => {
        // 指定当前编辑的属性（EventType/Platform/...）
        stateMem.currentStyleAttr = def.field;
        // 打开你的面板（style-panel.js 会自动把持久态注入 stateMem & 渲染表格）
        openStylePanel({ selectorBase: '.vis-item.event', titleSelector: '.event-title' });
      });
      frag.appendChild(btn);
    });

    if (filterBtn.nextSibling) {
      filterBtn.parentElement.insertBefore(frag, filterBtn.nextSibling);
    } else {
      filterBtn.parentElement.appendChild(frag);
    }
    return true;
  };

  if (doAttach()) return;

  const observer = new MutationObserver(() => {
    if (doAttach()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  [120, 400, 1000].forEach(ms => setTimeout(() => doAttach(), ms));
}

/* =================== 数据映射 =================== */
function normalizeEvent(event, i) {
  const Start = event.Start ?? event.start ?? '';
  const End = event.End ?? event.end ?? '';
  const blob = (event.title || event.content || '').toString();

  const parsed = parseBlobFields(blob);

  const title = toPlain(event.Title)
    || parsed['事件名称']
    || toPlain(event.title)
    || toPlain(event.content)
    || '(无标题)';

  const start = Start || parsed.__start || '';
  const end = End || parsed.__end || '';

  const EventType = event.EventType ?? parsed['事件类型'] ?? '';
  const Region = event.Region ?? parsed['地区'] ?? '';
  const Platform = event.Platform ?? parsed['平台类型'] ?? '';
  const Company = event.Company ?? parsed['公司'] ?? '';
  const Status = event.Status ?? parsed['状态'] ?? '';
  const ConsolePlatform = event.ConsolePlatform ?? parsed['主机类型'] ?? '';
  const Desc = event.Description ?? parsed['描述'] ?? '';
  const Contrib = event.Contributor ?? event.Submitter ?? parsed['贡献者'] ?? '';
  const TagRaw = event.Tag ?? parsed['标签'] ?? '';
  const Tag = normalizeTags(TagRaw);

  const detailHtml = buildKvHTML({
    title, start, end, EventType, Region, Platform, Company,
    ConsolePlatform, Tag, Description: Desc, Contributor: Contrib, Status,
  });

  return {
    id: event.id || `auto-${i + 1}`,
    content: title,
    start: start || undefined,
    end: end || undefined,  // ✅
    detailHtml,
    titleText: title,
    EventType,
    Region,
    Platform,
    Company,
    Status,
    ConsolePlatform,
    Tag,
  };
}

/* ======================= 主挂载 ======================= */
export async function mountTimeline(container, overrides = {}) {
  if (typeof container === 'string') {
    const node = document.querySelector(container);
    if (!node) {
      console.error('mountTimeline: 未找到容器选择器：', container);
      return { timeline: null, items: null, destroy: () => {} };
    }
    container = node;
  }

  if (!container) {
    console.error('mountTimeline: 容器不存在');
    return { timeline: null, items: null, destroy: () => {} };
  }

  if (!window.vis || !window.vis.Timeline || !window.vis.DataSet) {
    container.innerHTML =
      '<div style="padding:12px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">vis.js 未加载，请检查脚本引入顺序。</div>';
    return { timeline: null, items: null, destroy: () => {} };
  }

  const loading = createLoadingOverlay();
  const originalPosition = container.style.position;
  const needRel = getComputedStyle(container).position === 'static';
  if (needRel) container.style.position = 'relative';
  container.appendChild(loading);

  injectScopedStyles(container, UI);

  const beforeSelector = container.id ? `#${container.id}` : '#timeline';
  let timeline = null, dataset = null, mapped = null;

  try {
    const raw = await fetchAndNormalize();
    const data = Array.isArray(raw) ? raw : [];
    if (!data.length) {
      container.innerHTML =
        '<div style="padding:12px;background:#fff3cd;border:1px solid #ffeeba;border-radius:8px;color:#856404;">接口返回 0 条记录。</div>';
      return { timeline: null, items: null, destroy: () => {} };
    }

    mapped = data.map((evt, i) => normalizeEvent(evt, i));
    dataset = new window.vis.DataSet(mapped);

    const tvals = mapped.map(it => toMs(it.start ?? it.end)).filter(Number.isFinite);
    let startDate, endDate;
    if (tvals.length) {
      const minT = Math.min(...tvals);
      const maxT = Math.max(...tvals);
      const DAY = 86400000;
      const pad = Math.max(7 * DAY, Math.round((maxT - minT) * 0.05));
      startDate = new Date(minT - pad);
      endDate = new Date(maxT + pad);
    }

    const baseOptions = {
      minHeight: UI.canvas.height,
      maxHeight: UI.canvas.height,
      orientation: { item: UI.layout.itemPosition, axis: UI.layout.axisPosition },
      margin: { item: UI.layout.verticalItemGap, axis: 50 },
      locale: 'en',
      editable: false,
      stack: UI.layout.stack,
      verticalScroll: UI.zoom.verticalScroll,
      zoomKey: UI.zoom.key,
      template: (item, element) => {
        const host = element?.closest?.('.vis-item') || element;
        if (host) host.classList.add('event');
        const root = document.createElement('div');
        const h4 = document.createElement('h4');
        h4.className = 'event-title';
        h4.textContent = item.titleText || item.content || '(无标题)';
        root.appendChild(h4);
        return root;
      },
    };

    const options = { ...baseOptions, ...overrides };
    if (startDate) options.start = startDate;
    if (endDate) options.end = endDate;

    const vis = window.vis;
    timeline = new vis.Timeline(container, dataset, options);

    /* 初始化过滤 UI（保留你原有行为） */
    initFilterUI({
      beforeElSelector: beforeSelector,
      getItems: () => mapped,
      getCurrentRules: () => getState().rules,
    });

    /* 在“筛选/过滤”按钮右侧挂载 5 个样式按钮（点击打开 style-panel） */
    mountStyleButtonsRightOfFilter(container);

    /* ===== 点击弹窗 ===== */
    function ensurePopover() {
      let pop = container.querySelector('#event-popover');
      if (!pop) {
        pop = document.createElement('div');
        pop.id = 'event-popover';
        container.appendChild(pop);
      }
      return pop;
    }

    const pop = ensurePopover();
    let currentAnchor = null;

    function hidePopover() {
      pop.style.display = 'none';
      currentAnchor = null;
    }

    function findAnchorFromProps(props) {
      const t = props?.event?.target;
      const hit = t && t.closest ? t.closest('.vis-item') : null;
      if (hit) return hit;

      if (props?.item == null) return null;
      const idSel = (window.CSS && CSS.escape)
        ? CSS.escape(String(props.item))
        : String(props.item).replace(/"/g, '\\"');
      return container.querySelector(`.vis-item[data-id="${idSel}"]`);
    }

    function showPopoverOverItem(props) {
      const anchor = findAnchorFromProps(props);
      if (!anchor) return;

      const dsItem = dataset.get(props.item);
      pop.innerHTML = dsItem?.detailHtml || '<div style="padding:8px;">（无详情）</div>';

      const cb = container.getBoundingClientRect();
      const ib = anchor.getBoundingClientRect();

      const MIN_W = 280, MIN_H = 140;
      const MAX_W = Math.min(520, container.clientWidth);
      const MAX_H = Math.min(container.clientHeight * 0.6, 600);

      let left = ib.left - cb.left + container.scrollLeft;
      let top = ib.top - cb.top + container.scrollTop;

      const width = Math.min(Math.max(ib.width, MIN_W), MAX_W);
      const height = Math.min(Math.max(ib.height, MIN_H), MAX_H);

      const maxLeft = container.scrollLeft + (container.clientWidth - width - 8);
      const maxTop = container.scrollTop + (container.clientHeight - height - 8);

      left = Math.max(container.scrollLeft, Math.min(left, maxLeft));
      top = Math.max(container.scrollTop, Math.min(top, maxTop));

      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
      pop.style.width = `${width}px`;
      pop.style.height = `${height}px`;
      pop.style.display = 'block';

      currentAnchor = anchor;
    }

    timeline.on('click', (props) => {
      if (!props || props.item == null) {
        hidePopover();
        return;
      }
      showPopoverOverItem(props);
    });

    document.addEventListener('mousedown', (e) => {
      if (pop.style.display === 'none') return;
      const inPop = pop.contains(e.target);
      const onAnchor = currentAnchor && currentAnchor.contains(e.target);
      if (!inPop && !onAnchor) hidePopover();
    });

    window.addEventListener('resize', () => {
      timeline.redraw();
      hidePopover();
    });

    /* ===== 过滤逻辑 ===== */

    // “确定”仅更新规则，不应用
    window.addEventListener('filter:add-rule:confirm', (e) => {
      const { key, values } = e.detail || {};
      upsertRule(key, values);
    });

    // “和/或”才应用过滤
    window.addEventListener('filter:set-logic', (e) => {
      const mode = e?.detail?.mode;
      setLogic(mode);
      const next = applyFilters(mapped, getState());
      dataset.clear();
      dataset.add(next);
    });

    // “复原”清空规则并恢复
    window.addEventListener('filter:reset', () => {
      clearRules();
      dataset.clear();
      dataset.add(mapped);
    });

    // “×”按钮清空单属性规则
    window.addEventListener('filter:remove-rule', (e) => {
      const key = e?.detail?.key;
      if (key) removeRule(key);
    });

    return { timeline, items: dataset, destroy: () => timeline.destroy() };
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div style="padding:16px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">
      加载失败：${toPlain(err?.message || err)}
    </div>`;
    return { timeline: null, items: null, destroy: () => {} };
  } finally {
    try { container.contains(loading) && loading.remove(); } catch {}
  }
}

export default mountTimeline;
