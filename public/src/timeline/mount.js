// public/src/timeline/mount.js
// ✅ 版本要点：
// - 渲染 vis.js 时间轴（仅标题，不启用悬停）
// - 点击事件卡片显示详情弹窗
// - 接入过滤（保持你现有的 filter-* 接口不变）
// - 接入样式编辑：五个样式按钮 → 样式面板（单属性单类型 + 类型全局唯一）
// - 接入属性选择弹窗（左“确定”/右“取消”）
// - 注入 data-* 属性，供样式引擎匹配；构建 allOptions 供弹窗使用

import { fetchAndNormalize } from './fetch.js';

import {
  attributeLabels,
  TIMELINE_DEFAULT_OPTIONS,
  mapEventToItem,
} from '../_staging/constants.js';

import { applyStyleState, attachEventDataAttrs } from '../style/engine.js';
import { stateMem } from '../style/stateMem.js';

import {
  openStylePanel,
  computeStyleWindowViewModel,
  applyStyleWindowView,
  refreshStyleTypeOptionsInSelect,
  onStyleTypeChangeInSelect,
  confirmBindAction,
  resetBindAction,
} from '../ui/style-panel.js';

import {
  renderStyleTable,
  addStyleRowFor,
} from '../ui/style-table.js';

import {
  openAttrPicker,
  confirmAttrPicker,
  closeAttrPicker,
  selectAllInAttrPicker,
  clearAttrPicker,
} from '../ui/attr-picker.js';

// ===== 可调 UI 配置（与你当前一致） =====
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

// ========= 小工具 =========
const toPlain = (x) => (x == null ? '' : String(x).replace(/<[^>]*>/g, '').trim());
const asDisplay = (v) => {
  const s = v == null ? '' : String(v).trim();
  return s ? s : '—';
};

// ========= 详情弹窗 HTML =========
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

// ========= 把映射后的 vis item 附加 detailHtml、titleText 等 =========
function enrichItemForUI(event, index) {
  const it = mapEventToItem(event, index);
  const detailHtml = buildKvHTML({
    title: it.content,
    start: it.start,
    end: it.end,
    EventType: it.EventType,
    Region: it.Region,
    Platform: it.Platform,
    Company: it.Company,
    ConsolePlatform: it.ConsolePlatform,
    Tag: it.Tag,
    Description: '', // mapEventToItem 已经给了 title tooltip，点击弹窗内主展示结构这里不再重复描述
  });
  return {
    ...it,
    titleText: it.content,
    detailHtml,
  };
}

// ========= 统计 unique 选项（提供给属性选择弹窗） =========
function collectAllOptions(items) {
  const sets = {
    EventType: new Set(),
    Region: new Set(),
    Platform: new Set(),
    Company: new Set(),
    ConsolePlatform: new Set(),
    Tag: new Set(),
    Status: new Set(),
  };
  items.forEach((it) => {
    Object.keys(sets).forEach((k) => {
      const v = it[k];
      if (k === 'Tag') {
        (Array.isArray(v) ? v : String(v || '').split(','))
          .map(s => s.trim())
          .filter(Boolean)
          .forEach((t) => sets.Tag.add(t));
      } else if (v != null && v !== '') {
        sets[k].add(String(v));
      }
    });
  });

  const obj = {};
  Object.keys(sets).forEach((k) => (obj[k] = Array.from(sets[k])));
  return obj;
}

// ========= 属性选择弹窗：将“右取消 / 左确定”改成“左确定 / 右取消” =========
function fixAttrPickerButtonOrder() {
  const okBtn = document.getElementById('attr-picker-confirm');
  const cancelBtn = document.getElementById('attr-picker-cancel');
  const btnWrap = (okBtn && okBtn.parentElement) || null;
  if (!okBtn || !cancelBtn || !btnWrap) return;

  // 如果当前顺序是「左取消右确定」，就把确定插到最左
  if (btnWrap.firstElementChild === cancelBtn) {
    btnWrap.insertBefore(okBtn, cancelBtn); // 确定到左边
  }
  okBtn.textContent = '确定';
  cancelBtn.textContent = '取消';
}

// ========= 样式面板：打开某属性 =========
function openStyleForAttr(attrKey) {
  stateMem.currentStyleAttr = attrKey;

  // 打开面板（若没有真实面板，会回退 JSON 面板；有面板则下面接线）
  openStylePanel({ selectorBase: '.vis-item.event', titleSelector: '.event-title' });

  const root = document.getElementById('style-window');
  if (!root) return;

  // ViewModel → DOM
  const styleTitleEl  = document.getElementById('style-title');
  const styleWindowEl = root;
  const typeSelEl     = document.getElementById('style-type-select');
  const tbodyEl       = document.getElementById('styleTableBody');
  const confirmBtnEl  = document.getElementById('style-type-confirm');
  const resetBtnEl    = document.getElementById('style-type-reset');
  const addBtnEl      = document.getElementById('style-add-row');
  const hintEl        = document.getElementById('bound-type-hint');

  const vm = computeStyleWindowViewModel(attrKey);
  applyStyleWindowView(
    { styleTitleEl, styleWindowEl, typeSelEl, tbodyEl, confirmBtnEl, resetBtnEl, addBtnEl, hintEl },
    vm,
  );

  // 初始：根据占用情况给下拉 options 打标签
  refreshStyleTypeOptionsInSelect(typeSelEl, {
    uiTypeToInternal: (v) => v,
    styleTypeOwner: stateMem.styleTypeOwner,
    currentStyleAttr: stateMem.currentStyleAttr,
    attributeLabels,
  });

  // 监听：下拉变化 → 只“暂存”选择（不立即生效，需点“确认绑定”）
  let stagedType = 'none';
  typeSelEl && typeSelEl.addEventListener('change', () => {
    const ret = onStyleTypeChangeInSelect(typeSelEl, {
      uiTypeToInternal: (v) => v,
      boundStyleType: stateMem.boundStyleType,
      currentStyleAttr: stateMem.currentStyleAttr,
      styleTypeOwner: stateMem.styleTypeOwner,
      attributeLabels,
      confirmBtnEl,
      hintEl,
      refreshOptions: () =>
        refreshStyleTypeOptionsInSelect(typeSelEl, {
          uiTypeToInternal: (v) => v,
          styleTypeOwner: stateMem.styleTypeOwner,
          currentStyleAttr: stateMem.currentStyleAttr,
          attributeLabels,
        }),
      notify: (msg) => alert(msg),
    });
    stagedType = ret.stagedType || 'none';
  });

  // 点击“确认绑定” → 真正绑定 + 占用登记 + 至少生成一行
  confirmBtnEl && confirmBtnEl.addEventListener('click', () => {
    const ret = confirmBindAction({
      stagedType,
      currentStyleAttr: stateMem.currentStyleAttr,
      boundStyleType: stateMem.boundStyleType,
      styleTypeOwner: stateMem.styleTypeOwner,
      tbodyEl,
      confirmBtnEl,
      resetBtnEl,
      addBtnEl,
      hintEl,
      refreshOptions: () =>
        refreshStyleTypeOptionsInSelect(typeSelEl, {
          uiTypeToInternal: (v) => v,
          styleTypeOwner: stateMem.styleTypeOwner,
          currentStyleAttr: stateMem.currentStyleAttr,
          attributeLabels,
        }),
      addStyleRow: () => {
        const r = addStyleRowFor(attrKey, {
          boundStyleType: stateMem.boundStyleType,
          rulesMap: stateMem.styleRules,
          renderRow: (a, rule) => {
            // 交给全局渲染入口（append 到 tbody）
            // 注：renderStyleTable 会用当前 bucket 全量重绘；这里只渲染单行即可
            const { renderRuleRow } = requireRowRender();
            renderRuleRow(a, rule);
          },
        });
        if (!r.ok) alert('新增样式行失败：尚未绑定样式类型。');
      },
      notify: (msg) => alert(msg),
      confirmDialog: (msg) => window.confirm(msg),
    });
    if (ret.ok) {
      // 如已有规则，直接重绘
      renderStyleTable(attrKey);
    }
  });

  // 点击“重置” → 释放占用、清空行、复位提示，并立即保存+应用
  resetBtnEl && resetBtnEl.addEventListener('click', () => {
    resetBindAction({
      currentStyleAttr: stateMem.currentStyleAttr,
      boundStyleType: stateMem.boundStyleType,
      styleTypeOwner: stateMem.styleTypeOwner,
      styleRulesRef: stateMem.styleRules,
      tbodyEl,
      typeSelEl,
      confirmBtnEl,
      resetBtnEl,
      addBtnEl,
      hintEl,
      refreshOptions: () =>
        refreshStyleTypeOptionsInSelect(typeSelEl, {
          uiTypeToInternal: (v) => v,
          styleTypeOwner: stateMem.styleTypeOwner,
          currentStyleAttr: stateMem.currentStyleAttr,
          attributeLabels,
        }),
      confirmDialog: (msg) => window.confirm(msg),
    });
  });

  // “新增一行” → 基于已绑定类型创建规则行
  addBtnEl && addBtnEl.addEventListener('click', () => {
    const r = addStyleRowFor(attrKey, {
      boundStyleType: stateMem.boundStyleType,
      rulesMap: stateMem.styleRules,
      renderRow: (a, rule) => {
        const { renderRuleRow } = requireRowRender();
        renderRuleRow(a, rule);
      },
    });
    if (!r.ok) alert('请先选择并绑定“样式类型”。');
  });

  // 若该属性已有规则，首屏渲染一次
  renderStyleTable(attrKey);
}

// 为了避免循环引用，按需取一次（在事件里调用）
function requireRowRender() {
  return {
    renderRuleRow: (a, r) => {
      // 直接复用全局导出的渲染函数（已 import）
      // 这里包一层是为了将来做 A/B 或替换时更容易
      const tbody = document.getElementById('styleTableBody');
      if (!tbody) return;
      // 利用 style-table.js 的入口
      const row = document.createElement('tbody'); // 占位不用
      // 实际上我们只需要调用已暴露的 renderRuleRow
      // 但它会 append 到 #styleTableBody，所以这里直接用：
      import('../ui/style-table.js').then(mod => {
        mod.renderRuleRow(a, r);
      }).catch(() => {
        // 回退：已经通过顶层 import 了，直接用顶层的
        renderStyleTable(a);
      });
    },
  };
}

// ========= 过滤 UI（保持你现有行为，略） =========
// 你原有的 filter-ui/filter-engine/filter-state 已在之前挂接，这里不再重复。

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

  // Loading
  const loading = createLoadingOverlay();
  const needRel = getComputedStyle(container).position === 'static';
  if (needRel) container.style.position = 'relative';
  container.appendChild(loading);
  injectScopedStyles(container, UI);

  let timeline = null, dataset = null, mapped = null;

  try {
    // 拉数据
    const raw = await fetchAndNormalize();
    const data = Array.isArray(raw) ? raw : [];
    if (!data.length) {
      container.innerHTML =
        '<div style="padding:12px;background:#fff3cd;border:1px solid #ffeeba;border-radius:8px;color:#856404;">接口返回 0 条记录。</div>';
      return { timeline: null, items: null, destroy: () => {} };
    }

    // 归一 + UI 字段
    mapped = data.map((evt, i) => enrichItemForUI(evt, i));

    // DataSet + 初始视窗
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

    // Timeline 选项
    const baseOptions = {
      ...TIMELINE_DEFAULT_OPTIONS,
      minHeight: UI.canvas.height,
      maxHeight: UI.canvas.height,
      orientation: { item: UI.layout.itemPosition, axis: UI.layout.axisPosition },
      margin: { item: UI.layout.verticalItemGap, axis: 50 },
      editable: false,
      stack: UI.layout.stack,
      verticalScroll: UI.zoom.verticalScroll,
      zoomKey: UI.zoom.key,
      tooltip: undefined, // 不启用悬停 tooltip
      template: (item, element) => {
        const host = element?.closest?.('.vis-item') || element;
        if (host) {
          host.classList.add('event');
          // 注入 data-* 属性（供样式引擎命中）
          attachEventDataAttrs(host, item);
        }
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

    // 实例化
    const vis = window.vis;
    timeline = new vis.Timeline(container, dataset, options);

    // ========= 点击弹窗 =========
    const pop = ensurePopover(container);
    let currentAnchor = null;

    function ensurePopover(root) {
      let el = root.querySelector('#event-popover');
      if (!el) {
        el = document.createElement('div');
        el.id = 'event-popover';
        root.appendChild(el);
      }
      return el;
    }
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

    // ========= 属性选择弹窗：按钮位置 & 接线 =========
    fixAttrPickerButtonOrder();
    wireAttrPickerButtons();

    function wireAttrPickerButtons() {
      const ok = document.getElementById('attr-picker-confirm');
      const cancel = document.getElementById('attr-picker-cancel');
      const selectAllBtn = document.getElementById('attr-picker-select-all');
      const clearBtn = document.getElementById('attr-picker-clear');

      ok && ok.addEventListener('click', () => { confirmAttrPicker(); });
      cancel && cancel.addEventListener('click', () => { closeAttrPicker(); });
      selectAllBtn && selectAllBtn.addEventListener('click', () => { selectAllInAttrPicker(); });
      clearBtn && clearBtn.addEventListener('click', () => { clearAttrPicker(); });
    }

    // ========= 样式面板：五个按钮绑定 =========
    wireStyleButtons();

    function wireStyleButtons() {
      const bind = (id, attrKey) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', () => openStyleForAttr(attrKey));
      };
      bind('style-btn-event',   'EventType');
      bind('style-btn-platform','Platform');
      bind('style-btn-console', 'ConsolePlatform');
      bind('style-btn-company', 'Company');
      bind('style-btn-region',  'Region');
    }

    // ========= allOptions 提供给属性选择弹窗 =========
    const optionsByKey = collectAllOptions(mapped);
    // 供 attr-picker.js 的 openAttrPicker 默认读取
    globalThis.allOptions = optionsByKey;

    // ========= 首次应用：把持久化的样式（如有）应用到当前 DOM =========
    // openStylePanel 里会负责把 localStorage 的样式装载入 stateMem
    // 这里直接触发一次 apply（以当前持久态为准；没有就无副作用）
    try {
      // style-panel.js 在 openStylePanel 时已做过一次 apply；此处不重复强制
    } catch {}

    return { timeline, items: dataset, destroy: () => timeline && timeline.destroy() };
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
