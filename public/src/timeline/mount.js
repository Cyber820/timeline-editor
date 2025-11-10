// public/src/timeline/mount.js
// ✅ 版本要点：
// - 仅“点击弹窗”，无悬停 tooltip（不设置 item.title，不配置 options.tooltip）
// - 事件卡片只显示“事件名称”
// - 过滤逻辑分离：“确定”只更新规则，AND/OR 按钮才实际过滤
// - 集成 filter-ui.js / filter-state.js / filter-engine.js
// - ➕ 新增：在“筛选/过滤”按钮右侧插入 5 个样式按钮（事件/平台/主机/公司/地区），并提供对应面板（仅UI骨架）

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

/* =================== 样式 UI：按钮与面板（第1步：仅UI骨架） =================== */

const STYLE_BUTTONS = [
  { key: 'event',    label: '事件样式',  title: '事件样式设置' },
  { key: 'platform', label: '平台样式',  title: '平台样式设置' },
  { key: 'console',  label: '主机样式',  title: '主机样式设置' },
  { key: 'company',  label: '公司样式',  title: '公司样式设置' },
  { key: 'region',   label: '地区样式',  title: '地区样式设置' },
];

let styleUiCssInjected = false;

function injectStyleUiCss() {
  if (styleUiCssInjected) return;
  const css = `
  .te-style-btn {
    display:inline-flex; align-items:center; gap:.25rem;
    padding:.35rem .6rem; border:1px solid var(--te-border, #dadde1);
    border-radius:.5rem; background:#fff; cursor:pointer; font-size:.9rem;
  }
  .te-style-btn + .te-style-btn { margin-left:.5rem; }
  .te-style-btn:hover { background:#f6f7f9; }

  .te-style-portal { position:fixed; inset:0; z-index:1000; display:none; }
  .te-style-portal.active { display:block; }

  .te-style-backdrop {
    position:absolute; inset:0; background:rgba(0,0,0,.35);
  }

  .te-style-dialog {
    position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
    width:min(900px, 92vw); max-height:80vh; overflow:auto;
    background:#fff; border-radius:12px; box-shadow:0 12px 40px rgba(0,0,0,.25);
    display:flex; flex-direction:column;
  }

  .te-style-header {
    padding:14px 18px; border-bottom:1px solid #eee; display:flex; align-items:center; justify-content:space-between;
  }
  .te-style-title { font-size:1.05rem; font-weight:600; }
  .te-style-close {
    border:none; background:transparent; font-size:1.25rem; cursor:pointer; line-height:1;
  }

  .te-style-body { padding:16px 18px; display:grid; gap:14px; }
  .te-style-grid { display:grid; grid-template-columns: 260px 1fr; gap:16px; }
  .te-style-card { border:1px solid #eee; border-radius:8px; padding:12px; background:#fafbfc; }
  .te-style-card h4 { margin:0 0 8px 0; font-size:.95rem; }
  .te-style-footer { border-top:1px solid #eee; padding:12px 18px; display:flex; justify-content:flex-end; gap:8px; }
  .te-style-link { background:transparent; border:none; color:#444; cursor:pointer; }
  .te-style-primary { background:#111; color:#fff; border:1px solid #111; border-radius:8px; padding:8px 12px; cursor:pointer; }
  .te-style-muted { color:#666; font-size:.9rem; }

  @media (max-width: 720px) {
    .te-style-grid { grid-template-columns: 1fr; }
  }
  `;
  const tag = document.createElement('style');
  tag.setAttribute('data-te-style-ui', 'true');
  tag.textContent = css;
  document.head.appendChild(tag);
  styleUiCssInjected = true;
}

function ensureStylePanelRoot() {
  let root = document.querySelector('#te-style-panels-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'te-style-panels-root';
    document.body.appendChild(root);
  }
  return root;
}

function createStylePanel({ key, title }) {
  const portal = document.createElement('div');
  portal.className = 'te-style-portal';
  portal.dataset.key = key;

  portal.innerHTML = `
    <div class="te-style-backdrop" data-role="backdrop"></div>
    <div class="te-style-dialog" role="dialog" aria-modal="true" aria-labelledby="te-style-title-${key}">
      <div class="te-style-header">
        <div class="te-style-title" id="te-style-title-${key}">${title}</div>
        <button class="te-style-close" title="关闭" aria-label="关闭">×</button>
      </div>

      <div class="te-style-body">
        <div class="te-style-grid">
          <section class="te-style-card" data-area="style-type">
            <h4>样式类型（占位）</h4>
            <div class="te-style-muted">这里将在第2步放入“为该属性选择<strong>唯一</strong>的样式类型”（如：字体颜色 / 背景色 / 边框色 / 字体粗细…）。</div>
          </section>

          <section class="te-style-card" data-area="style-mapping">
            <h4>属性值 → 样式映射（占位）</h4>
            <div class="te-style-muted">这里将在第2步放入“为该属性下各个具体值指定样式”，同一种样式可复用到多个值。</div>
          </section>
        </div>
      </div>

      <div class="te-style-footer">
        <button class="te-style-link" data-role="clear" title="清除当前设置（占位，不生效）">清除</button>
        <button class="te-style-primary" data-role="ok">完成</button>
      </div>
    </div>
  `;

  const close = () => {
    portal.classList.remove('active');
    portal.dispatchEvent(new Event('te:close'));
  };
  portal.querySelector('.te-style-backdrop')?.addEventListener('click', close);
  portal.querySelector('.te-style-close')?.addEventListener('click', close);
  portal.querySelector('[data-role="ok"]')?.addEventListener('click', close);

  const onKeydown = (e) => {
    if (e.key === 'Escape') close();
  };
  portal.addEventListener('te:open', () => document.addEventListener('keydown', onKeydown));
  portal.addEventListener('te:close', () => document.removeEventListener('keydown', onKeydown));

  portal.open = () => {
    portal.classList.add('active');
    portal.dispatchEvent(new Event('te:open'));
  };

  return portal;
}

function makeStyleButton(btn, onClick) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'te-style-btn';
  el.dataset.key = btn.key;
  el.textContent = btn.label;
  el.addEventListener('click', onClick);
  return el;
}

/**
 * 寻找“筛选/过滤”按钮：尽量保真地插到它的右侧
 * 1) 优先找 data-role/data-* 标记
 * 2) 再退化到按文本匹配 “筛选” / “过滤”
 * 返回 { toolbarEl, filterBtn }
 */
function findFilterButtonNear(container) {
  // 常见语义钩子（如你的 filter-ui 可能会加的标记）
  let filterBtn = document.querySelector('[data-role="filter-toggle"], [data-te-filter-toggle]');
  let toolbarEl = filterBtn?.parentElement;

  // 若未命中，尝试文本匹配（中文“筛选”“过滤”）
  if (!filterBtn) {
    const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
    filterBtn = candidates.find(b => {
      const t = (b.textContent || '').trim();
      return t === '筛选' || t === '过滤' || t.includes('筛选') || t.includes('过滤');
    });
    toolbarEl = filterBtn?.parentElement || null;
  }

  // 如果还没有，尝试容器前后兄弟节点内寻找
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
 * 将 5 个样式按钮插到“筛选/过滤”按钮右侧，并创建对应面板（仅UI）
 * - 若此时筛选按钮尚未渲染，会使用 MutationObserver 监听并自动挂载
 */
function mountStyleUIRightOfFilter(container) {
  injectStyleUiCss();
  const panelRoot = ensureStylePanelRoot();

  // 先创建所有面板并缓存
  const panels = new Map();
  STYLE_BUTTONS.forEach(def => {
    const p = createStylePanel(def);
    panelRoot.appendChild(p);
    panels.set(def.key, p);
  });

  // 内部方法：真正插入按钮
  const doAttach = () => {
    const { toolbarEl, filterBtn } = findFilterButtonNear(container);
    if (!toolbarEl || !filterBtn) return false;

    const frag = document.createDocumentFragment();
    STYLE_BUTTONS.forEach(def => {
      const btn = makeStyleButton(def, () => panels.get(def.key)?.open());
      frag.appendChild(btn);
    });

    // 插入到“筛选/过滤”按钮之后
    if (filterBtn.nextSibling) {
      filterBtn.parentElement.insertBefore(frag, filterBtn.nextSibling);
    } else {
      filterBtn.parentElement.appendChild(frag);
    }
    return true;
  };

  // 1) 立即尝试一次
  if (doAttach()) return;

  // 2) 使用 MutationObserver 监听（filter-ui 异步渲染时）
  const observer = new MutationObserver(() => {
    if (doAttach()) {
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // 3) 兜底：延时多次尝试（减少极端情况下未挂载概率）
  const retries = [120, 400, 1000];
  retries.forEach(ms => setTimeout(() => doAttach(), ms));
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
    end: end || undefined,
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

    /* 在“筛选/过滤”按钮右侧挂载 5 个样式按钮（仅UI） */
    mountStyleUIRightOfFilter(container);

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
