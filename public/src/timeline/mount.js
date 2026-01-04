// public/src/timeline/mount.js
// =============================================================================
// Timeline Mount (vis.js)
// =============================================================================
// 职责：
// 1) 拉取并规范化事件数据（fetchAndNormalize -> normalizeEvent）
// 2) 创建 vis.Timeline + DataSet，并负责首屏视窗范围与渲染模板（template）
// 3) 统一处理：点击事件卡片 -> 详情弹窗（popover）
// 4) 与过滤系统对接：接收 filter:* 事件，重算 items 并重绘（按你的约束：新增规则不立刻生效）
// 5) 与样式系统对接：在每次“初次加载/过滤重绘/窗口变化”后重新应用样式
//
// 重要行为：
// - ⭐ 初次加载默认只显示 Importance 为 4/5 的事件（见 mountTimeline 内初始化规则）
// - 过滤/重绘后都会重新应用样式（safeApplyStyles）
// - 点击空白关闭弹窗（document mousedown）
//
// 依赖：
// - vis.js (window.vis.Timeline / window.vis.DataSet)
// - ./fetch.js（数据源）
// - ../filter/*（过滤 UI、状态、引擎）
// - ../style/*（样式 state、应用引擎、stateMem）
// - ../ui-text/index.js（i18n：t()）
//
// 🔧 UI TUNING: 可通过 UI 常量与 baseOptions 修改布局/字体/间距/滚轮缩放等
// 🔌 GENERALIZATION: “列/字段变更”主要影响 normalizeEvent + parseBlobFields + buildKvHTML
// =============================================================================

import { fetchAndNormalize } from './fetch.js';

import { initFilterUI } from '../filter/filter-ui.js';
import { setLogic, upsertRule, clearRules, removeRule, getState } from '../filter/filter-state.js';
import { applyFilters } from '../filter/filter-engine.js';

import { stateMem } from '../style/stateMem.js';
import {
  DEFAULTS,
  ENGINE_KEY_MAP,
  buildEngineStyleState,
  createEmptyRuleForType,
  ensureBucketIn,
  attributeLabels,
  STYLE_LABELS,
  styleLabel,
} from '../_staging/constants.js';

import { setStyleState, getStyleState } from '../state/styleState.js';
import { applyStyleState, attachEventDataAttrs } from '../style/engine.js';

import { t } from '../ui-text/index.js';

/**
 * =============================================================================
 * UI 预设（可调参数）
 * =============================================================================
 */
const UI = {
  canvas: { height: 600 },
  item: {
    fontSize: 10,
    paddingX: 10,
    paddingY: 6,
    borderRadius: 10,
    maxWidth: 320,
  },
  layout: {
    itemPosition: 'bottom',     // 'top' | 'bottom'
    axisPosition: 'bottom',     // 'top' | 'bottom'
    verticalItemGap: 5,
    stack: true,
  },
  zoom: {
    key: 'ctrlKey',             // 缩放按键：'ctrlKey' / 'altKey' / 'shiftKey' 等
    verticalScroll: true,
  },
};

/**
 * =============================================================================
 * 通用小工具函数（文本处理/字段标准化）
 * =============================================================================
 */
function toPlain(x) {
  return x == null ? '' : String(x).replace(/<[^>]*>/g, '').trim();
}

function asDisplay(v) {
  const s = v == null ? '' : String(v).trim();
  return s ? s : '—';
}

/**
 * =============================================================================
 * 兼容“blob 详情文本”的字段解析
 * =============================================================================
 */
const FIELD_LABELS = [
  '事件名称',
  '事件类型',
  '时间',
  '状态',
  '地区',
  '平台类型',
  '主机类型',
  '公司',
  '标签',
  '重要性',
  '描述',
  '贡献者',
];

function parseBlobFields(blob) {
  const s = toPlain(blob);
  const out = {};
  if (!s) return out;

  const escaped = FIELD_LABELS.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const lookahead = '(?=\\s*(?:' + escaped.join('|') + ')\\s*[:：]|$)';

  for (const label of FIELD_LABELS) {
    const re = new RegExp(label + '\\s*[:：]\\s*([\\s\\S]*?)' + lookahead, 'i');
    const m = re.exec(s);
    if (m) out[label] = m[1].replace(/\\n/g, '\n').trim();
  }

  const tval = out['时间'];
  if (tval) {
    const m1 =
      /([0-9]{4}-[0-9]{2}-[0-9]{2})\s*[~—–-]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(tval);
    if (m1) {
      out.__start = m1[1];
      out.__end = m1[2];
    } else {
      const m2 = /([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(tval);
      if (m2) out.__start = m2[1];
    }
  }
  return out;
}

function normalizeTags(v) {
  if (!v && v !== 0) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function toMs(ts) {
  if (typeof ts === 'number') return ts;
  const n = +new Date(ts);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * =============================================================================
 * 详情弹窗内容生成
 * =============================================================================
 */
function buildKvHTML(obj) {
  const kv = [
    [t('detail.fields.eventName') || 'Event', obj.title],
    [t('detail.fields.start') || 'Start', obj.start],
    [t('detail.fields.end') || 'End', obj.end],
    [t('detail.fields.eventType') || 'Event Type', obj.EventType],
    [t('detail.fields.region') || 'Region', obj.Region],
    [t('detail.fields.platform') || 'Platform', obj.Platform],
    [t('detail.fields.consolePlatform') || 'Console Platform', obj.ConsolePlatform],
    [t('detail.fields.company') || 'Company', obj.Company],
    [t('detail.fields.importance') || 'Importance', obj.Importance],
    [t('detail.fields.tag') || 'Tags', Array.isArray(obj.Tag) ? obj.Tag.join('，') : obj.Tag || ''],
    [t('detail.fields.description') || 'Description', obj.Description],
    [t('detail.fields.contributor') || 'Contributor', obj.Contributor || obj.Submitter],
  ];

  const rows = kv
    .map(
      ([k, v]) =>
        '<div class="kv-row" style="display:flex;gap:8px;align-items:flex-start;">' +
        '<dt class="kv-key" style="min-width:84px;flex:0 0 auto;font-weight:600;">' +
        k +
        '</dt>' +
        '<dd class="kv-val" style="margin:0;white-space:pre-wrap;word-break:break-word;">' +
        asDisplay(v) +
        '</dd>' +
        '</div>',
    )
    .join('');

  return (
    '<div style="font-weight:700;margin-bottom:8px">' +
    asDisplay(obj.title) +
    '</div>' +
    '<dl class="kv" style="display:flex;flex-direction:column;gap:6px;font-size:13px;line-height:1.6;">' +
    rows +
    '</dl>'
  );
}

/**
 * =============================================================================
 * 作用域样式注入（scoped CSS）
 * =============================================================================
 * B3 修改：避免重复挂载造成 style 累积（同一 container 内会替换旧 style，并移除旧 scope class）
 */
function injectScopedStyles(container, ui) {
  const STYLE_ID = 'tl-scoped-style';

  // 若同一 container 曾经注入过：移除旧 scope class，并替换 style
  const oldStyle = container.querySelector(`style#${STYLE_ID}`);
  if (oldStyle) {
    const oldScope = oldStyle.getAttribute('data-scope');
    if (oldScope) container.classList.remove(oldScope);
    try {
      oldStyle.parentNode && oldStyle.parentNode.removeChild(oldStyle);
    } catch {}
  }

  const scope = 'tl-scope-' + Math.random().toString(36).slice(2, 8);
  container.classList.add(scope);

  const css =
    '.' + scope + ' .vis-item.event{border-radius:' + ui.item.borderRadius + 'px;}' +
    '.' + scope + ' .vis-item .vis-item-content{padding:' + ui.item.paddingY + 'px ' + ui.item.paddingX + 'px;max-width:' + ui.item.maxWidth + 'px;}' +
    '.' + scope + ' .event-title{font-size:' + ui.item.fontSize + 'px;line-height:1.4;margin:0;max-width:' + ui.item.maxWidth + 'px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.' + scope + ' #event-popover{position:absolute;z-index:1000;background:#fff;border:1px solid #e5e7eb;box-shadow:0 8px 24px rgba(0,0,0,.15);' +
    'border-radius:10px;padding:12px;overflow:auto;pointer-events:auto;min-width:280px;min-height:140px;max-width:700px;max-height:70vh;font-size:12px;line-height:1;display:none;}' +
    '.te-style-btn{display:inline-flex;align-items:center;gap:.25rem;padding:.35rem .6rem;border:1px solid #dadde1;border-radius:.5rem;background:#fff;cursor:pointer;font-size:.9rem;}' +
    '.te-style-btn+.te-style-btn{margin-left:.5rem}.te-style-btn:hover{background:#f6f7f9}' +
    '#style-window{position:fixed;inset:0;z-index:9999;display:none}' +
    '#style-window .sw-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.35)}' +
    '#style-window .sw-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(980px,94vw);max-height:80vh;overflow:auto;background:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.25)}' +
    '#style-window header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #eee}' +
    '#style-window section{padding:16px 18px}#style-window footer{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid #eee}' +
    '#styleTable{width:100%;border-collapse:collapse}#styleTable thead tr{border-bottom:1px solid #eee}#styleTable th,#styleTable td{text-align:left;padding:8px 4px}' +
    '.attr-chips span{display:inline-block;padding:2px 6px;margin:2px;border:1px solid #ccc;border-radius:10px;font-size:12px}' +
    '.te-muted{color:#666;font-size:.9rem}';

  const styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent = css;
  styleEl.setAttribute('data-scope', scope);
  container.appendChild(styleEl);
  return scope;
}

function createLoadingOverlay() {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = 'Loading…';
  el.style.cssText =
    'position:absolute;top:12px;left:12px;background:#fff;border:1px solid #e5e7eb;padding:6px 10px;border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,.04);z-index:10;font-size:12px;';
  return el;
}

/**
 * =============================================================================
 * 数据映射：raw event -> vis item + 业务字段（用于过滤与弹窗）
 * =============================================================================
 */
function normalizeEvent(event, i) {
  const Start = event.Start ?? event.start ?? '';
  const End = event.End ?? event.end ?? '';

  const blob = (event.title || event.content || '').toString();
  const parsed = parseBlobFields(blob);

  const title =
    toPlain(event.Title) ||
    parsed['事件名称'] ||
    toPlain(event.title) ||
    toPlain(event.content) ||
    '(Untitled)';

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
  const Importance = event.Importance ?? parsed['重要性'] ?? '';

  const detailHtml = buildKvHTML({
    title,
    start,
    end,
    EventType,
    Region,
    Platform,
    Company,
    ConsolePlatform,
    Tag,
    Importance,
    Description: Desc,
    Contributor: Contrib,
    Status,
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
    Importance,
  };
}

/**
 * =============================================================================
 * 样式应用（单点出口）
 * =============================================================================
 */
function safeApplyStyles() {
  try {
    const saved = getStyleState();
    if (saved && (saved.boundTypes || saved.rules)) {
      applyStyleState(saved, {
        selectorBase: DEFAULTS.SELECTOR_BASE,
        titleSelector: DEFAULTS.TITLE_SELECTOR,
      });
    }
  } catch {
    // keep silent
  }
}

/**
 * =============================================================================
 * Style Panel（样式面板）+ i18n 支持
 * =============================================================================
 */
function tr(key, fallback) {
  const v = t(key);
  return v && v !== key ? v : fallback;
}

function tf(key, vars, fallback) {
  const raw = tr(key, fallback || key);
  return String(raw).replace(/\{(\w+)\}/g, (_, k) =>
    vars && k in vars ? vars[k] : `{${k}}`,
  );
}

function attrLabelI18n(attrKey) {
  const v = t(`filter.fields.${attrKey}`);
  if (v && v !== `filter.fields.${attrKey}`) return v;
  return attributeLabels?.[attrKey] || attrKey;
}

function styleTypeLabelI18n(typeKey) {
  const v = t(`style.types.${typeKey}`);
  if (v && v !== `style.types.${typeKey}`) return v;
  return STYLE_LABELS?.[typeKey] || styleLabel(typeKey) || typeKey;
}

const STYLE_ATTR_BTNS = [
  { textKey: 'event', field: 'EventType' },
  { textKey: 'platform', field: 'Platform' },
  { textKey: 'console', field: 'ConsolePlatform' },
  { textKey: 'company', field: 'Company' },
  { textKey: 'region', field: 'Region' },
];

const UI_STYLE_TYPES = [
  { key: 'fontColor' },
  { key: 'backgroundColor' },
  { key: 'borderColor' },
  { key: 'fontFamily' },
  { key: 'haloColor' },
];

let panelInjected = false;
let stylePanelCloseBound = false; // B4：确保关闭行为只绑定一次

function ensureStylePanelInjected() {
  if (panelInjected) return;

  const host = document.createElement('div');
  host.id = 'style-window';

  const optNone = tr('style.panel.noneOption', '（未选择）');
  const baseTitle = tr('style.panel.baseTitle', '样式');
  const typeLabel = tr('style.panel.styleTypeLabel', '样式类型');
  const confirmBind = tr('style.panel.confirmBind', '确认绑定');
  const reset = tr('style.panel.reset', '重置');
  const addRow = tr('style.panel.addRow', '新增样式行');
  const saveApply = tr('style.panel.saveApply', '保存并应用');
  const close = tr('style.panel.close', '关闭');

  const thStyle = tr('style.panel.table.style', '样式');
  const thValues = tr('style.panel.table.values', '作用属性值');
  const thAction = tr('style.panel.table.action', '操作');

  host.innerHTML =
    '<div class="sw-backdrop"></div>' +
    '<div class="sw-panel">' +
    '<header>' +
    '<div><div id="style-title" style="font-weight:600;font-size:1.05rem;">' +
    baseTitle +
    '</div>' +
    '<div id="bound-type-hint" class="te-muted" style="margin-top:4px;">' +
    tr('style.window.currentStyleNone', '当前样式：无') +
    '</div></div>' +
    '<button id="style-close" title="' +
    close +
    '" style="border:none;background:transparent;font-size:20px;cursor:pointer;">×</button>' +
    '</header>' +
    '<section>' +
    '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">' +
    '<label>' +
    typeLabel +
    '：</label>' +
    '<select id="style-type-select"><option value="none">' +
    optNone +
    '</option>' +
    UI_STYLE_TYPES.map((x) => '<option value="' + x.key + '">' + styleTypeLabelI18n(x.key) + '</option>').join('') +
    '</select>' +
    '<button id="style-confirm" style="display:inline-block;" disabled>' +
    confirmBind +
    '</button>' +
    '<button id="style-reset" style="display:none;">' +
    reset +
    '</button>' +
    '<button id="style-add" disabled>' +
    addRow +
    '</button>' +
    '</div>' +
    '<table id="styleTable"><thead><tr>' +
    '<th style="width:36%;">' +
    thStyle +
    '</th><th>' +
    thValues +
    '</th><th style="width:72px;">' +
    thAction +
    '</th>' +
    '</tr></thead><tbody id="styleTableBody"></tbody></table>' +
    '</section>' +
    '<footer><button id="style-save" style="background:#111;color:#fff;border:1px solid #111;border-radius:8px;padding:8px 12px;cursor:pointer;">' +
    saveApply +
    '</button></footer>' +
    '</div>';

  document.body.appendChild(host);
  panelInjected = true;

  // B4：关闭/backdrop 点击行为只绑定一次（在 injected 阶段绑定）
  if (!stylePanelCloseBound) {
    stylePanelCloseBound = true;
    document.getElementById('style-close')?.addEventListener('click', closeStylePanelLight);
    document
      .querySelector('#style-window .sw-backdrop')
      ?.addEventListener('click', closeStylePanelLight);
  }
}

function openStylePanelLight() {
  ensureStylePanelInjected();
  const el = document.getElementById('style-window');
  if (el) el.style.display = 'block';
}

function closeStylePanelLight() {
  const el = document.getElementById('style-window');
  if (el) el.style.display = 'none';
}

function buildColorControl(rule) {
  const wrap = document.createElement('div');

  const color = document.createElement('input');
  color.type = 'color';
  color.setAttribute('aria-label', tr('style.controls.color.ariaLabel', '选择颜色'));

  const hex = document.createElement('input');
  hex.type = 'text';
  hex.placeholder = '#RRGGBB';
  hex.style.marginLeft = '6px';

  const current = String(rule.style?.[rule.type] || '#000000').toUpperCase();
  color.value = /^#[0-9A-Fa-f]{6}$/.test(current) ? current : '#000000';
  hex.value = color.value;

  function norm(v) {
    let s = String(v || '').trim();
    if (!s) return null;
    if (s[0] !== '#') s = '#' + s;
    if (/^#([0-9a-fA-F]{3})$/.test(s)) {
      s = '#' + s.slice(1).split('').map((c) => c + c).join('');
    }
    if (/^#([0-9a-fA-F]{6})$/.test(s)) return s.toUpperCase();
    return null;
  }

  color.addEventListener('input', () => {
    const v = color.value.toUpperCase();
    hex.value = v;
    (rule.style ||= {})[rule.type] = v;
  });

  hex.addEventListener('change', () => {
    const v = norm(hex.value) || color.value.toUpperCase();
    hex.value = v;
    color.value = v;
    (rule.style ||= {})[rule.type] = v;
  });

  wrap.appendChild(color);
  wrap.appendChild(hex);
  return wrap;
}

function buildFontControl(rule) {
  const wrap = document.createElement('div');
  const sel = document.createElement('select');

  const optDefault = tr('style.controls.fontFamily.default', '（默认字体）');
  sel.innerHTML =
    `<option value="">${optDefault}</option>` +
    '<option value="Microsoft YaHei, PingFang SC, Noto Sans SC, system-ui">Microsoft YaHei / PingFang / Noto Sans SC</option>' +
    '<option value="SimHei">SimHei</option>' +
    '<option value="SimSun">SimSun</option>' +
    '<option value="KaiTi">KaiTi</option>' +
    '<option value="LiSu">LiSu</option>' +
    '<option value="YouYuan">YouYuan</option>' +
    '<option value="STCaiyun">STCaiyun</option>' +
    '<option value="FZShuTi">FZShuTi</option>';

  sel.value = rule.style?.fontFamily || '';
  sel.addEventListener('change', () => {
    (rule.style ||= {}).fontFamily = sel.value || '';
  });

  wrap.appendChild(sel);
  return wrap;
}

function buildStyleCellControl(rule) {
  if (['fontColor', 'backgroundColor', 'borderColor', 'haloColor'].includes(rule.type)) {
    return buildColorControl(rule);
  }
  if (rule.type === 'fontFamily') return buildFontControl(rule);

  const span = document.createElement('span');
  span.textContent = styleTypeLabelI18n(rule.type);
  return span;
}

function uniqueSorted(list) {
  return Array.from(new Set((list || []).filter(Boolean))).sort((a, b) =>
    String(a).localeCompare(String(b)),
  );
}

function renderChips(container, values) {
  container.innerHTML = '';
  const list = Array.isArray(values) ? values : [];

  if (!list.length) {
    const s = document.createElement('span');
    s.className = 'te-muted';
    s.textContent = tr('filter.summary.emptyChip', '（空）');
    container.appendChild(s);
    return;
  }

  list.forEach((v) => {
    const tag = document.createElement('span');
    tag.textContent = v;
    container.appendChild(tag);
  });
}

function getTakenValuesForAttr(attrKey, exceptRowId) {
  const taken = new Set();
  const bucket = (stateMem.styleRules && stateMem.styleRules[attrKey]) || [];
  for (const r of bucket) {
    if (exceptRowId && r.id === exceptRowId) continue;
    const vals = Array.isArray(r.values) ? r.values : [];
    for (const v of vals) taken.add(v);
  }
  return taken;
}

function renderRow(containerTbody, attrKey, rule, allOptionsForAttr) {
  const trEl = document.createElement('tr');
  trEl.dataset.rowId = rule.id;
  trEl.dataset.attrKey = attrKey;

  const tdStyle = document.createElement('td');
  tdStyle.dataset.styleType = rule.type;
  tdStyle.appendChild(buildStyleCellControl(rule));
  trEl.appendChild(tdStyle);

  const tdVals = document.createElement('td');

  const chips = document.createElement('div');
  chips.className = 'attr-chips';
  chips.style.minHeight = '28px';
  tdVals.appendChild(chips);

  const btnPick = document.createElement('button');
  btnPick.type = 'button';
  btnPick.textContent = tr('style.panel.pickValues', '添加/修改属性');
  btnPick.style.marginLeft = '8px';
  tdVals.appendChild(btnPick);

  trEl.appendChild(tdVals);

  renderChips(chips, rule.values || []);

  btnPick.addEventListener('click', () => {
    const list = uniqueSorted(allOptionsForAttr);
    const current = new Set(Array.isArray(rule.values) ? rule.values : []);
    const taken = getTakenValuesForAttr(attrKey, rule.id);

    const box = document.createElement('div');
    box.style.cssText =
      'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;';

    const panel = document.createElement('div');
    panel.style.cssText =
      'width:min(720px,92vw);max-height:70vh;overflow:auto;background:#fff;border-radius:10px;padding:12px;box-shadow:0 12px 40px rgba(0,0,0,.35);';

    panel.innerHTML =
      '<div style="font-weight:600;margin-bottom:8px;">' +
      tr('style.panel.pickDialogTitle', '选择属性值') +
      '</div>';

    const grid = document.createElement('div');
    grid.style.cssText =
      'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;';

    const takenSuffix = tr('style.panel.takenSuffix', '（已被占用）');

    list.forEach((v) => {
      const label = document.createElement('label');
      label.style.cssText =
        'border:1px solid #e5e7eb;border-radius:8px;padding:6px;display:flex;gap:6px;align-items:center;';

      const cb = document.createElement('input');
      cb.type = 'checkbox';

      const isTaken = taken.has(v) && !current.has(v);
      cb.checked = current.has(v);
      cb.disabled = isTaken;

      cb.addEventListener('change', () => {
        if (cb.checked) current.add(v);
        else current.delete(v);
      });

      const span = document.createElement('span');
      span.textContent = isTaken ? v + takenSuffix : v;
      span.style.opacity = isTaken ? '0.55' : '1';

      label.appendChild(cb);
      label.appendChild(span);
      grid.appendChild(label);
    });

    panel.appendChild(grid);

    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:10px;';

    const ok = document.createElement('button');
    ok.textContent = tr('style.panel.ok', '确定');

    const cancel = document.createElement('button');
    cancel.textContent = tr('style.panel.cancel', '取消');

    ok.addEventListener('click', () => {
      const finalSelected = Array.from(current);

      const finalTaken = getTakenValuesForAttr(attrKey, rule.id);
      const conflict = finalSelected.find((x) => finalTaken.has(x));
      if (conflict) {
        alert(tf('style.panel.conflictAlert', { value: conflict }, `“${conflict}” 已被占用`));
        return;
      }

      rule.values = finalSelected;
      renderChips(chips, rule.values);
      document.body.removeChild(box);
    });

    cancel.addEventListener('click', () => document.body.removeChild(box));

    footer.appendChild(ok);
    footer.appendChild(cancel);

    panel.appendChild(footer);
    box.appendChild(panel);
    document.body.appendChild(box);
  });

  const tdAction = document.createElement('td');
  const del = document.createElement('button');
  del.type = 'button';
  del.title = tr('style.panel.deleteRowTitle', '删除该样式行');
  del.textContent = '×';
  del.addEventListener('click', () => {
    const bucket = (stateMem.styleRules && stateMem.styleRules[attrKey]) || [];
    const idx = bucket.findIndex((r) => r.id === rule.id);
    if (idx >= 0) bucket.splice(idx, 1);
    trEl.remove();
  });

  tdAction.appendChild(del);
  trEl.appendChild(tdAction);

  containerTbody.appendChild(trEl);
}

function collectOptionsForAttr(mapped, attrKey) {
  const vals = mapped
    .map((it) => it?.[attrKey])
    .flatMap((v) => (Array.isArray(v) ? v : [v]));
  return uniqueSorted(vals.filter(Boolean));
}

/**
 * A1 修改：不再依赖不存在的 i18n key（例如 style.window.boundTo）
 * - 被别的属性占用时，直接显示为：`样式名 (属性名)`，避免出现英文碎片
 */
function refreshTypeOptions(selectEl) {
  if (!selectEl) return;

  Array.from(selectEl.options).forEach((opt) => {
    if (!opt.dataset.baseText) opt.dataset.baseText = opt.textContent;

    const type = opt.value;
    if (type === 'none') {
      opt.disabled = false;
      opt.textContent = opt.dataset.baseText;
      return;
    }

    const owner = stateMem.styleTypeOwner?.[type];
    const isMine = owner === stateMem.currentStyleAttr;
    opt.disabled = !!(owner && !isMine);

    const ownerLabel = owner ? attrLabelI18n(owner) : '';
    const base = styleTypeLabelI18n(type);

    opt.textContent = owner && !isMine ? `${base} (${ownerLabel})` : base;
  });
}

function persistAndApply() {
  const engineState = buildEngineStyleState(
    stateMem.boundStyleType,
    stateMem.styleRules,
    ENGINE_KEY_MAP,
  );
  const saved = setStyleState(engineState);
  applyStyleState(saved, {
    selectorBase: DEFAULTS.SELECTOR_BASE,
    titleSelector: DEFAULTS.TITLE_SELECTOR,
  });
}

/**
 * A2：这里返回 cleanup，用于 destroy() 时断开 observer & timeout
 */
function mountStyleButtonsRightOfFilter(container, mapped, registerCleanup = () => {}) {
  function findFilterBtn() {
    let btn = document.querySelector('[data-role="filter-toggle"],[data-te-filter-toggle]');
    if (btn) return btn;

    const cands = Array.from(document.querySelectorAll('button,[role="button"]'));
    return cands.find((b) => /Filter|筛选|过滤/.test((b.textContent || '').trim())) || null;
  }

  function doAttach() {
    const filterBtn = findFilterBtn();
    if (!filterBtn) return false;

    // 防止重复插入：若已经插入过（同一页面重复 mount），则跳过
    if (filterBtn.parentElement?.querySelector?.('[data-te-style-btn="1"]')) return true;

    const frag = document.createDocumentFragment();

    STYLE_ATTR_BTNS.forEach((def) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'te-style-btn';
      b.setAttribute('data-te-style-btn', '1');
      b.textContent = tr(`style.buttons.${def.textKey}`, def.textKey);
      b.addEventListener('click', () => openStyleEditorFor(def.field, mapped));
      frag.appendChild(b);
    });

    filterBtn.parentElement &&
      (filterBtn.nextSibling
        ? filterBtn.parentElement.insertBefore(frag, filterBtn.nextSibling)
        : filterBtn.parentElement.appendChild(frag));

    return true;
  }

  if (doAttach()) return;

  const obs = new MutationObserver(() => {
    if (doAttach()) obs.disconnect();
  });
  obs.observe(document.body, { childList: true, subtree: true });

  registerCleanup(() => {
    try { obs.disconnect(); } catch {}
  });

  const tids = [120, 400, 1000].map((ms) => setTimeout(() => doAttach(), ms));
  registerCleanup(() => {
    tids.forEach((id) => {
      try { clearTimeout(id); } catch {}
    });
  });
}

function openStyleEditorFor(attrKey, mapped) {
  ensureStylePanelInjected();

  stateMem.currentStyleAttr = attrKey;
  stateMem.boundStyleType ||= {};
  stateMem.styleTypeOwner ||= {};
  stateMem.styleRules ||= {};
  stateMem.styleRowSelections ||= {};

  const titleEl = document.getElementById('style-title');
  const hintEl = document.getElementById('bound-type-hint');
  const typeSel = document.getElementById('style-type-select');
  const tbody = document.getElementById('styleTableBody');

  const btnConfirm = document.getElementById('style-confirm');
  const btnReset = document.getElementById('style-reset');
  const btnAdd = document.getElementById('style-add');
  const btnSave = document.getElementById('style-save');

  const attrText = attrLabelI18n(attrKey);
  titleEl &&
    (titleEl.textContent = tf('style.window.title', { attr: attrText }, `${attrText} Styles`));

  if (tbody) {
    tbody.innerHTML = '';
    const bucket = stateMem.styleRules[attrKey] || [];
    const opts = collectOptionsForAttr(mapped, attrKey);
    bucket.forEach((rule) => renderRow(tbody, attrKey, rule, opts));
  }

  const boundNow = () => stateMem.boundStyleType[attrKey] || 'none';

  refreshTypeOptions(typeSel);
  if (typeSel) typeSel.value = 'none';
  btnConfirm && (btnConfirm.disabled = true);

  const currentBound = boundNow();
  const currentLabel =
    currentBound === 'none' ? tr('style.types.none', 'None') : styleTypeLabelI18n(currentBound);

  hintEl &&
    (hintEl.textContent =
      currentBound === 'none'
        ? tr('style.window.currentStyleNone', 'Current style: none')
        : tf(
            'style.window.currentStyle',
            { style: currentLabel },
            `Current style: ${currentLabel}`,
          ));

  btnAdd && (btnAdd.disabled = currentBound === 'none');
  btnReset && (btnReset.style.display = currentBound === 'none' ? 'none' : 'inline-block');
  typeSel && (typeSel.disabled = currentBound !== 'none');

  let stagedType = 'none';

  if (typeSel) {
    typeSel.onchange = () => {
      const current = boundNow();
      const val = typeSel.value || 'none';

      if (current !== 'none') {
        typeSel.value = 'none';
        btnConfirm && (btnConfirm.disabled = true);
        hintEl &&
          (hintEl.textContent = tf(
            'style.window.currentBound',
            { style: styleTypeLabelI18n(current) },
            `Current binding: ${styleTypeLabelI18n(current)} (reset required to change)`,
          ));
        return;
      }

      const owner = stateMem.styleTypeOwner?.[val];
      if (val !== 'none' && owner && owner !== attrKey) {
        const ownerText = attrLabelI18n(owner);
        typeSel.value = 'none';
        btnConfirm && (btnConfirm.disabled = true);
        hintEl &&
          (hintEl.textContent = tf(
            'style.window.boundHint',
            { style: styleTypeLabelI18n(val), attr: ownerText },
            `“${styleTypeLabelI18n(val)}” is already bound to [${ownerText}]`,
          ));
        return;
      }

      stagedType = val;
      btnConfirm && (btnConfirm.disabled = stagedType === 'none');
    };
  }

  btnConfirm &&
    (btnConfirm.onclick = () => {
      const curr = boundNow();
      if (curr !== 'none' || stagedType === 'none') return;

      stateMem.boundStyleType[attrKey] = stagedType;
      stateMem.styleTypeOwner[stagedType] = attrKey;

      hintEl &&
        (hintEl.textContent = tf(
          'style.window.currentStyle',
          { style: styleTypeLabelI18n(stagedType) },
          `Current style: ${styleTypeLabelI18n(stagedType)}`,
        ));

      btnConfirm.disabled = true;
      btnReset && (btnReset.style.display = 'inline-block');
      btnAdd && (btnAdd.disabled = false);
      typeSel && (typeSel.disabled = true);

      const rule = createEmptyRuleForType(
        stagedType,
        () => 'rule_' + Math.random().toString(36).slice(2, 8),
      );
      ensureBucketIn(stateMem.styleRules, attrKey).push(rule);

      tbody && renderRow(tbody, attrKey, rule, collectOptionsForAttr(mapped, attrKey));
    });

  btnReset &&
    (btnReset.onclick = () => {
      const bucketLen = (stateMem.styleRules[attrKey] || []).length;
      if (bucketLen && !confirm(tr('style.panel.resetConfirm', 'Reset?'))) return;

      const prev = boundNow();
      if (prev !== 'none' && stateMem.styleTypeOwner[prev] === attrKey) {
        delete stateMem.styleTypeOwner[prev];
      }

      stateMem.boundStyleType[attrKey] = 'none';
      const bucket = stateMem.styleRules[attrKey];
      if (bucket) bucket.length = 0;

      tbody && (tbody.innerHTML = '');
      hintEl && (hintEl.textContent = tr('style.window.currentStyleNone', 'Current style: none'));

      btnAdd && (btnAdd.disabled = true);
      btnReset.style.display = 'none';

      if (typeSel) {
        typeSel.value = 'none';
        typeSel.disabled = false;
      }
      btnConfirm && (btnConfirm.disabled = true);

      persistAndApply();
    });

  btnAdd &&
    (btnAdd.onclick = () => {
      const tt = boundNow();
      if (!tt || tt === 'none') {
        alert(tr('style.panel.needBindAlert', 'Please bind a style type first.'));
        return;
      }

      const rule = createEmptyRuleForType(
        tt,
        () => 'rule_' + Math.random().toString(36).slice(2, 8),
      );
      ensureBucketIn(stateMem.styleRules, attrKey).push(rule);

      tbody && renderRow(tbody, attrKey, rule, collectOptionsForAttr(mapped, attrKey));
    });

  btnSave &&
    (btnSave.onclick = () => {
      const bucket = stateMem.styleRules[attrKey] || [];

      for (let i = bucket.length - 1; i >= 0; i--) {
        const r = bucket[i];

        const hasStyle =
          r.type === 'fontFamily'
            ? !!(r.style && 'fontFamily' in r.style)
            : !!(r.style && r.style[r.type]);

        const hasValues = Array.isArray(r.values) && r.values.length > 0;

        if (!hasStyle || !hasValues) bucket.splice(i, 1);
      }

      persistAndApply();
      closeStylePanelLight();
    });

  openStylePanelLight();
}

/**
 * =============================================================================
 * B2：初始显示范围解析（允许你指定首屏范围，但不会硬编码覆盖 overrides）
 * =============================================================================
 * 你可在页面全局设置其一：
 * 1) globalThis.TIMELINE_INITIAL_RANGE = { start:'1990-01-01', end:'2000-12-31' }
 * 2) globalThis.TIMELINE_INITIAL_START / TIMELINE_INITIAL_END
 *
 * 调用 mountTimeline 时传 overrides.start/end 的优先级最高。
 */
function resolveInitialRange() {
  const r = globalThis?.TIMELINE_INITIAL_RANGE;
  const s = r?.start ?? globalThis?.TIMELINE_INITIAL_START;
  const e = r?.end ?? globalThis?.TIMELINE_INITIAL_END;

  const start = s ? new Date(s) : null;
  const end = e ? new Date(e) : null;

  const okStart = start && Number.isFinite(+start);
  const okEnd = end && Number.isFinite(+end);

  return {
    start: okStart ? start : null,
    end: okEnd ? end : null,
  };
}

/**
 * =============================================================================
 * 主挂载：mountTimeline(container, overrides?)
 * =============================================================================
 */
export async function mountTimeline(container, overrides = {}) {
  // A2：统一注册清理函数，destroy() 释放所有监听器/observer/timeout
  const cleanups = [];
  function registerCleanup(fn) {
    if (typeof fn === 'function') cleanups.push(fn);
  }
  function on(target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    registerCleanup(() => {
      try { target.removeEventListener(type, handler, opts); } catch {}
    });
  }

  if (typeof container === 'string') {
    const node = document.querySelector(container);
    if (!node) {
      console.error('mountTimeline: container not found:', container);
      return { timeline: null, items: null, destroy() {} };
    }
    container = node;
  }

  if (!container) {
    console.error('mountTimeline: container missing');
    return { timeline: null, items: null, destroy() {} };
  }

  if (!window.vis || !window.vis.Timeline || !window.vis.DataSet) {
    container.innerHTML =
      '<div style="padding:12px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">vis.js is not loaded.</div>';
    return { timeline: null, items: null, destroy() {} };
  }

  const loading = createLoadingOverlay();
  const needRel = getComputedStyle(container).position === 'static';
  if (needRel) container.style.position = 'relative';
  container.appendChild(loading);

  injectScopedStyles(container, UI);

  const beforeSelector = container.id ? `#${container.id}` : '#timeline';

  let timeline = null;
  let dataset = null;
  let mapped = null;

  try {
    const raw = await fetchAndNormalize();
    const data = Array.isArray(raw) ? raw : [];

    if (!data.length) {
      container.innerHTML =
        '<div style="padding:12px;background:#fff3cd;border:1px solid #ffeeba;border-radius:8px;color:#856404;">0 records returned.</div>';
      return { timeline: null, items: null, destroy() {} };
    }

    mapped = data.map((evt, i) => normalizeEvent(evt, i));

    clearRules();
    setLogic('AND');
    upsertRule('Importance', ['4', '5']);

    const initialItems = applyFilters(mapped, getState());

    dataset = new window.vis.DataSet(initialItems);

    const tvals = mapped.map((it) => toMs(it.start ?? it.end)).filter(Number.isFinite);

    let autoStart = null;
    let autoEnd = null;
    if (tvals.length) {
      const minT = Math.min(...tvals);
      const maxT = Math.max(...tvals);

      const DAY = 86400000;
      const pad = Math.max(7 * DAY, Math.round((maxT - minT) * 0.05));
      autoStart = new Date(minT - pad);
      autoEnd = new Date(maxT + pad);
    }

    // B2：允许你指定首屏范围（但不强行覆盖 overrides.start/end）
    const initial = resolveInitialRange();

    const baseOptions = {
      minHeight: UI.canvas.height,
      maxHeight: UI.canvas.height,

      orientation: {
        item: UI.layout.itemPosition,
        axis: UI.layout.axisPosition,
      },

      margin: { item: UI.layout.verticalItemGap, axis: 50 },

      // B1 保留：固定 en，避免你提到的中文乱码风险（你明确要求保留）
      locale: 'en',

      editable: false,
      stack: UI.layout.stack,

      verticalScroll: UI.zoom.verticalScroll,
      zoomKey: UI.zoom.key,

      template: (item, element) => {
        try {
          const contentEl = element;
          const itemEl = element?.closest?.('.vis-item');

          if (itemEl) {
            itemEl.classList.add('event');
            attachEventDataAttrs?.(itemEl, item);
          }
          if (contentEl) {
            contentEl.classList.add('event');
            attachEventDataAttrs?.(contentEl, item);
          }
        } catch {}

        const root = document.createElement('div');
        const h4 = document.createElement('h4');
        h4.className = 'event-title';
        h4.textContent = item.titleText || item.content || '(Untitled)';
        root.appendChild(h4);
        return root;
      },
    };

    const options = { ...baseOptions, ...overrides };

    // start/end 优先级：
    // 1) overrides.start/end（调用者显式指定）
    // 2) globalThis 初始范围（你手动指定）
    // 3) 自动范围（按数据）
    if (!('start' in overrides)) {
      if (initial.start) options.start = initial.start;
      else if (autoStart) options.start = autoStart;
    }
    if (!('end' in overrides)) {
      if (initial.end) options.end = initial.end;
      else if (autoEnd) options.end = autoEnd;
    }

    const vis = window.vis;
    timeline = new vis.Timeline(container, dataset, options);
    registerCleanup(() => {
      try { timeline?.destroy(); } catch {}
    });

    initFilterUI({
      beforeElSelector: beforeSelector,
      getItems: () => mapped,
      getCurrentRules: () => getState().rules,
    });

    // A2：样式按钮挂载的 observer/timeouts 纳入 destroy 清理
    mountStyleButtonsRightOfFilter(container, mapped, registerCleanup);

    safeApplyStyles();

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
      const t0 = props?.event?.target;
      const hit = t0 && t0.closest ? t0.closest('.vis-item') : null;
      if (hit) return hit;

      if (props?.item == null) return null;

      const idStr = String(props.item).replace(/"/g, '\\"');
      return container.querySelector('.vis-item[data-id="' + idStr + '"]');
    }

    function showPopoverOverItem(props) {
      const anchor = findAnchorFromProps(props);
      if (!anchor) return;

      const dsItem = dataset.get(props.item);
      pop.innerHTML = dsItem?.detailHtml || '<div style="padding:8px;">(No details)</div>';

      const cb = container.getBoundingClientRect();
      const ib = anchor.getBoundingClientRect();

      const MIN_W = 280;
      const MIN_H = 140;
      const MAX_W = Math.min(520, container.clientWidth);
      const MAX_H = Math.min(container.clientHeight * 0.6, 600);

      let left = ib.left - cb.left + container.scrollLeft;
      let top = ib.top - cb.top + container.scrollTop;

      const width = Math.min(Math.max(ib.width, MIN_W), MAX_W);
      const height = Math.min(Math.max(ib.height, MIN_H), MAX_H);

      const maxLeft = container.scrollLeft + (container.clientWidth - width - 8);
      const maxTop = container.scrollTop + (container.clientHeight - height - 8);

      if (left < container.scrollLeft) left = container.scrollLeft;
      if (left > maxLeft) left = maxLeft;

      if (top < container.scrollTop) top = container.scrollTop;
      if (top > maxTop) top = maxTop;

      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
      pop.style.width = width + 'px';
      pop.style.height = height + 'px';
      pop.style.display = 'block';

      currentAnchor = anchor;
    }

    // timeline.on -> 在 destroy() 里会随 timeline.destroy() 清掉（vis 自己释放）
    timeline.on('click', (props) => {
      if (!props || props.item == null) {
        hidePopover();
        return;
      }
      showPopoverOverItem(props);
    });

    // A2：document/window 监听纳入清理
    const onDocMouseDown = (e) => {
      if (pop.style.display === 'none') return;
      const inPop = pop.contains(e.target);
      const onAnchor = currentAnchor && currentAnchor.contains(e.target);
      if (!inPop && !onAnchor) hidePopover();
    };
    on(document, 'mousedown', onDocMouseDown);

    const onResize = () => {
      try { timeline.redraw(); } catch {}
      hidePopover();
      safeApplyStyles();
    };
    on(window, 'resize', onResize);

    /**
     * Filter 事件桥接
     * - A3 保留：新增规则不立刻生效（你明确要求）
     * - A4 保留：reset 清空规则并展示全量（你明确要求）
     */
    const onAddRule = (e) => {
      const { key, values } = e.detail || {};
      upsertRule(key, values);
      // 按你的要求：不立即重算 dataset，等待用户选择 AND/OR 逻辑再应用
    };
    on(window, 'filter:add-rule:confirm', onAddRule);

    const onSetLogic = (e) => {
      const mode = e?.detail?.mode;
      setLogic(mode);

      const next = applyFilters(mapped, getState());
      dataset.clear();
      dataset.add(next);

      requestAnimationFrame(() => safeApplyStyles());
    };
    on(window, 'filter:set-logic', onSetLogic);

    const onReset = () => {
      clearRules();
      dataset.clear();
      dataset.add(mapped);

      requestAnimationFrame(() => safeApplyStyles());
    };
    on(window, 'filter:reset', onReset);

    const onRemoveRule = (e) => {
      const key = e?.detail?.key;
      if (key) removeRule(key);

      const next = applyFilters(mapped, getState());
      dataset.clear();
      dataset.add(next);

      requestAnimationFrame(() => safeApplyStyles());
    };
    on(window, 'filter:remove-rule', onRemoveRule);

    timeline.on('changed', () => requestAnimationFrame(() => safeApplyStyles()));

    return {
      timeline,
      items: dataset,
      destroy() {
        // A2：集中清理
        cleanups.forEach((fn) => {
          try { fn(); } catch {}
        });
      },
    };
  } catch (err) {
    console.error(err);

    container.innerHTML = `<div style="padding:16px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">
      Load failed: ${toPlain(err?.message || err)}
    </div>`;

    return { timeline: null, items: null, destroy() {} };
  } finally {
    try {
      container.contains(loading) && loading.remove();
    } catch {}
  }
}

export default mountTimeline;
