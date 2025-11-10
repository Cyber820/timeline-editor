// public/src/timeline/mount.js
// ✅ 版本要点：
// - 仅“点击弹窗”，无悬停 tooltip（不设置 item.title，不配置 options.tooltip）
// - 事件卡片只显示“事件名称”
// - 过滤逻辑分离：“确定”只更新规则，AND/OR 按钮才实际过滤
// - 集成 filter-ui.js / filter-state.js / filter-engine.js
// - ➕ 样式功能 第1步：在“筛选/过滤”右侧插入5个样式按钮 + 面板（UI骨架）
// - ➕ 样式功能 第2步：面板内交互 —— 选择“唯一样式类型” & “属性值→样式映射”（仅状态，不渲染）
//    * 同一属性仅允许一种样式类型（切换会二次确认并清空映射）
//    * 一个样式值可映射多个具体值
//    * 提供映射列表、删除、清空
//    * 暴露 window.TE_StyleState 与 `style:state-changed` 事件

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

/* =================== 样式 UI：按钮与面板（第1步+第2步） =================== */

// 面板按钮定义
const STYLE_BUTTONS = [
  { key: 'event',    label: '事件样式',  title: '事件样式设置',  field: 'EventType' },
  { key: 'platform', label: '平台样式',  title: '平台样式设置',  field: 'Platform' },
  { key: 'console',  label: '主机样式',  title: '主机样式设置',  field: 'ConsolePlatform' },
  { key: 'company',  label: '公司样式',  title: '公司样式设置',  field: 'Company' },
  { key: 'region',   label: '地区样式',  title: '地区样式设置',  field: 'Region' },
];

// 支持的样式类型（仅示例集；第3步我们会把它映射到真实渲染）
const STYLE_TYPES = [
  { key: 'fontColor',  label: '字体颜色（推荐）',   input: 'color' },
  { key: 'bgColor',    label: '卡片背景色',         input: 'color' },
  { key: 'borderColor',label: '卡片边框色',         input: 'color' },
  { key: 'fontWeight', label: '字体粗细',           input: 'select', options: [
      { value: 'normal', label: '正常' },
      { value: '500',    label: '中等（500）' },
      { value: '600',    label: '偏粗（600）' },
      { value: '700',    label: '加粗（700）' },
    ]},
];

// 核心状态：每个属性只能一种样式类型；每个属性值 → 样式值映射
const styleState = {
  // 形如：
  // EventType: { type: 'fontColor', map: { '社会事件': '#2b7cff', '电子竞技': '#ff8a00' } }
};
window.TE_StyleState = styleState; // 暴露给调试/下游

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
    width:min(980px, 94vw); max-height:80vh; overflow:auto;
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
  .te-style-grid { display:grid; grid-template-columns: 300px 1fr; gap:16px; }
  .te-style-card { border:1px solid #eee; border-radius:8px; padding:12px; background:#fafbfc; }
  .te-style-card h4 { margin:0 0 8px 0; font-size:.95rem; }
  .te-style-footer { border-top:1px solid #eee; padding:12px 18px; display:flex; justify-content:flex-end; gap:8px; }
  .te-style-link { background:transparent; border:none; color:#444; cursor:pointer; }
  .te-style-primary { background:#111; color:#fff; border:1px solid #111; border-radius:8px; padding:8px 12px; cursor:pointer; }
  .te-style-muted { color:#666; font-size:.9rem; }

  .te-radio { display:flex; flex-direction:column; gap:8px; }
  .te-radio label { display:flex; align-items:center; gap:8px; cursor:pointer; }
  .te-radio input[type="radio"] { transform: translateY(1px); }

  .te-list { display:flex; flex-direction:column; gap:8px; max-height:48vh; overflow:auto; background:#fff; border:1px solid #eee; border-radius:8px; padding:8px; }
  .te-li { display:flex; align-items:center; gap:8px; }
  .te-li .name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  .te-row { display:flex; align-items:center; gap:8px; }
  .te-chip { display:inline-flex; align-items:center; gap:6px; border:1px solid #e5e7eb; background:#fff; padding:4px 8px; border-radius:999px; }
  .te-chip .rm { border:none; background:transparent; cursor:pointer; font-size:14px; line-height:1; }

  .te-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .te-input { border:1px solid #e5e7eb; border-radius:8px; padding:8px 10px; }
  .te-select { border:1px solid #e5e7eb; border-radius:8px; padding:7px 10px; }

  @media (max-width: 820px) { .te-style-grid { grid-template-columns: 1fr; } }
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

function createStylePanelShell({ key, title }) {
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
            <h4>样式类型（唯一）</h4>
            <div class="te-style-type-container"></div>
          </section>

          <section class="te-style-card" data-area="style-mapping">
            <h4>属性值 → 样式映射</h4>
            <div class="te-style-map-container"></div>
          </section>
        </div>
      </div>

      <div class="te-style-footer">
        <button class="te-style-link" data-role="clear">清空映射</button>
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
  portal.querySelector('[data-role="clear"]')?.addEventListener('click', () => {
    const field = portal.dataset.field;
    if (!field) return;
    if (!styleState[field]) styleState[field] = { type: null, map: {} };
    styleState[field].map = {};
    dispatchStyleChanged(field);
    // 重新渲染映射区
    renderMappingUI(portal);
  });

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

/** 广播全局事件，方便第3步接入渲染 */
function dispatchStyleChanged(field) {
  const ev = new CustomEvent('style:state-changed', {
    detail: { field, state: styleState }
  });
  window.dispatchEvent(ev);
}

/** 获取去重后的属性值列表 */
function distinctValues(items, field) {
  const set = new Set();
  items.forEach(it => {
    const v = it?.[field];
    if (Array.isArray(v)) {
      v.forEach(s => s && set.add(String(s)));
    } else if (v != null && v !== '') {
      set.add(String(v));
    }
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

/** 渲染：样式类型单选（唯一） */
function renderTypeSelectorUI(portal) {
  const field = portal.dataset.field;
  const container = portal.querySelector('.te-style-type-container');
  if (!container) return;

  const cur = styleState[field] || { type: null, map: {} };

  const radios = STYLE_TYPES.map(t => {
    const id = `te-st-${field}-${t.key}`;
    return `
      <label for="${id}">
        <input type="radio" name="te-type-${field}" id="${id}" value="${t.key}" ${t.key === cur.type ? 'checked' : ''} />
        <span>${t.label}</span>
      </label>
    `;
  }).join('');

  container.innerHTML = `<div class="te-radio">${radios}</div>`;

  container.querySelectorAll('input[type="radio"]').forEach(r => {
    r.addEventListener('change', () => {
      const nextType = r.value;
      if (!styleState[field]) styleState[field] = { type: null, map: {} };
      const prevType = styleState[field].type;

      if (prevType && prevType !== nextType) {
        const ok = window.confirm(`该属性已绑定样式类型「${labelOfType(prevType)}」。\n切换为「${labelOfType(nextType)}」将清空现有映射。是否继续？`);
        if (!ok) {
          // 回滚单选
          renderTypeSelectorUI(portal);
          return;
        }
        styleState[field].map = {};
      }
      styleState[field].type = nextType;
      dispatchStyleChanged(field);
      renderMappingUI(portal); // 映射区根据类型变化而变化
    });
  });
}

function labelOfType(key) {
  return STYLE_TYPES.find(t => t.key === key)?.label ?? key;
}

/** 渲染：属性值 → 样式映射编辑器 */
function renderMappingUI(portal) {
  const field = portal.dataset.field;
  const getItems = portal._getItems;
  const box = portal.querySelector('.te-style-map-container');
  if (!box || !getItems) return;

  // 依赖唯一类型
  const st = styleState[field] || { type: null, map: {} };
  const currentType = st.type;

  const allVals = distinctValues(getItems(), field);
  const mapped = st.map || {};

  const controls = renderStyleValueControlsHTML(currentType);
  const list = allVals.map(v => {
    const checked = false;
    return `
      <div class="te-li">
        <input type="checkbox" value="${escapeAttr(v)}" />
        <div class="name" title="${escapeAttr(v)}">${safeText(v)}</div>
        <div class="cur te-muted">${mapped[v] ? previewStyleValue(currentType, mapped[v]) : '未设置'}</div>
      </div>
    `;
  }).join('');

  const mappedChips = Object.entries(mapped).map(([val, sty]) => {
    return `
      <span class="te-chip" data-val="${escapeAttr(val)}">
        <span class="k">${safeText(val)}</span>
        <span class="v">${previewStyleValue(currentType, sty)}</span>
        <button class="rm" title="移除">×</button>
      </span>
    `;
  }).join('') || '<span class="te-muted">暂无映射</span>';

  box.innerHTML = `
    <div class="te-row" style="justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
      <div style="flex:1;min-width:260px;">
        <div class="te-list" data-role="values-list">
          ${list || '<div class="te-muted" style="padding:8px;">当前没有可用的属性值</div>'}
        </div>
      </div>

      <div style="flex:1.2;min-width:320px;display:flex;flex-direction:column;gap:12px;">
        <div>
          <div class="te-muted" style="margin-bottom:6px;">为“勾选的属性值”选择样式值：</div>
          <div class="te-actions" data-role="style-controls">
            ${controls}
            <button class="te-style-primary" data-role="apply" ${currentType ? '' : 'disabled'}>应用到所选</button>
          </div>
          ${!currentType ? '<div class="te-muted" style="margin-top:6px;">请先在左侧选择“样式类型”。</div>' : ''}
        </div>

        <div>
          <div style="font-weight:600;margin-bottom:6px;">当前映射</div>
          <div class="te-actions" data-role="chips">
            ${mappedChips}
          </div>
        </div>
      </div>
    </div>
  `;

  // 事件：应用按钮
  const applyBtn = box.querySelector('[data-role="apply"]');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      if (!currentType) return;
      const selectedVals = Array.from(box.querySelectorAll('[data-role="values-list"] input[type="checkbox"]:checked'))
        .map(i => i.value);

      if (!selectedVals.length) {
        alert('请先勾选左侧要应用的属性值。');
        return;
      }
      const styValue = readStyleControlValue(box, currentType);
      if (styValue == null || styValue === '') {
        alert('请先选择或输入样式值。');
        return;
      }
      if (!styleState[field]) styleState[field] = { type: currentType, map: {} };
      if (!styleState[field].map) styleState[field].map = {};
      selectedVals.forEach(v => styleState[field].map[v] = styValue);

      dispatchStyleChanged(field);
      renderMappingUI(portal);
    });
  }

  // 事件：删除某条映射
  box.querySelectorAll('.te-chip .rm').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = btn.closest('.te-chip');
      const val = el?.dataset?.val;
      if (!val) return;
      if (!styleState[field]) return;
      delete styleState[field].map[val];
      dispatchStyleChanged(field);
      renderMappingUI(portal);
    });
  });
}

/** 根据样式类型，渲染选择控件（颜色输入/下拉等） */
function renderStyleValueControlsHTML(type) {
  if (!type) {
    // 占位
    return `
      <input class="te-input" type="text" placeholder="样式值（等待选择类型）" disabled />
    `;
  }
  const def = STYLE_TYPES.find(t => t.key === type);
  if (!def) return `<input class="te-input" type="text" placeholder="样式值" />`;

  if (def.input === 'color') {
    // 颜色输入 + 自由文本（支持 #RRGGBB 或 rgba(...) 等）
    return `
      <input class="te-input" type="color" data-role="color-hex" value="#ff9900" />
      <input class="te-input" type="text" data-role="color-text" placeholder="#RRGGBB 或 rgba(...)" value="#ff9900" />
    `;
  }
  if (def.input === 'select') {
    const options = (def.options || []).map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    return `<select class="te-select" data-role="select">${options}</select>`;
  }
  // 兜底文本
  return `<input class="te-input" type="text" placeholder="样式值" />`;
}

function readStyleControlValue(box, type) {
  const def = STYLE_TYPES.find(t => t.key === type);
  if (!def) {
    const any = box.querySelector('[data-role="style-controls"] input[type="text"]');
    return any ? any.value : null;
  }
  if (def.input === 'color') {
    const hex = box.querySelector('[data-role="color-hex"]')?.value?.trim();
    const txt = box.querySelector('[data-role="color-text"]')?.value?.trim();
    // 优先文本（允许 RGBA 等），否则取 hex
    return txt || hex || null;
  }
  if (def.input === 'select') {
    return box.querySelector('[data-role="select"]')?.value ?? null;
  }
  return null;
}

function previewStyleValue(type, value) {
  if (!type) return String(value);
  if (type === 'fontColor') {
    return `<span style="display:inline-flex;align-items:center;gap:6px;">
      <span style="width:12px;height:12px;border-radius:3px;border:1px solid #e5e7eb;background:${escapeAttr(value)};"></span>
      <span>${safeText(value)}</span>
    </span>`;
  }
  if (type === 'bgColor' || type === 'borderColor') {
    return `<span style="display:inline-flex;align-items:center;gap:6px;">
      <span style="width:18px;height:12px;border-radius:3px;border:1px solid #e5e7eb;background:${type==='bgColor'?escapeAttr(value):'#fff'};${type==='borderColor'?'box-shadow: inset 0 0 0 2px '+escapeAttr(value):''}"></span>
      <span>${safeText(value)}</span>
    </span>`;
  }
  return safeText(String(value));
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
function safeText(s) {
  return String(s).replace(/[<>&]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[m]));
}

/**
 * 寻找“筛选/过滤”按钮：尽量保真地插到它的右侧
 * 1) 优先找 data-role/data-* 标记
 * 2) 再退化到按文本匹配 “筛选” / “过滤”
 * 返回 { toolbarEl, filterBtn }
 */
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
 * 将 5 个样式按钮插到“筛选/过滤”按钮右侧，并创建对应面板（含第2步交互）
 * @param {HTMLElement} container
 * @param {() => any[]} getItems - 获取当前完整 items（用于枚举属性值）
 */
function mountStyleUIRightOfFilter(container, getItems) {
  injectStyleUiCss();
  const panelRoot = ensureStylePanelRoot();

  // 先创建所有面板并缓存
  const panels = new Map();
  STYLE_BUTTONS.forEach(def => {
    const p = createStylePanelShell(def);
    p.dataset.field = def.field;
    p._getItems = getItems; // 保存回调以便渲染属性值列表
    panelRoot.appendChild(p);
    panels.set(def.key, p);

    // 面板打开时渲染
    p.addEventListener('te:open', () => {
      renderTypeSelectorUI(p);
      renderMappingUI(p);
    });
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

    if (filterBtn.nextSibling) {
      filterBtn.parentElement.insertBefore(frag, filterBtn.nextSibling);
    } else {
      filterBtn.parentElement.appendChild(frag);
    }
    return true;
  };

  // 1) 立即尝试一次
  if (doAttach()) return;

  // 2) 监听异步渲染
  const observer = new MutationObserver(() => {
    if (doAttach()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // 3) 兜底重试
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

    /* 在“筛选/过滤”按钮右侧挂载 5 个样式按钮（含第2步交互） */
    mountStyleUIRightOfFilter(container, () => mapped);

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
