// public/src/timeline/mount.js
// =============================================================================
// Timeline Mount (vis.js)
// =============================================================================
// 职责：
// 1) 拉取并规范化事件数据（fetchAndNormalize -> normalizeEvent）
// 2) 创建 vis.Timeline + DataSet，并负责首屏视窗范围与渲染模板（template）
// 3) 统一处理：点击事件卡片 -> 详情弹窗（popover）
// 4) 与过滤系统对接：接收 filter:* 事件，重算 items 并重绘
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
 * 🔧 UI TUNING: 这里是“视觉体验”最常改的一组参数入口，便于交接者快速定位。
 * - canvas.height：时间轴画布固定高度（minHeight/maxHeight）
 * - item.fontSize/padding/borderRadius/maxWidth：事件卡片排版
 * - layout.itemPosition/axisPosition/verticalItemGap/stack：轴线与卡片堆叠方式
 * - zoom.key/verticalScroll：缩放/滚轮行为
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
 * 这些函数用于保证：弹窗内容安全可读、字段缺失时 UI 有兜底值。
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
 * 背景：你的数据来源可能包含一个“长描述字段”（title/content）里拼接的多行 KV 文本。
 * 这里用 FIELD_LABELS 作为“可识别标签集合”，将 blob 文本拆回结构化字段。
 *
 * 🔌 GENERALIZATION:
 * - 若你要把时间轴泛化到“艺术史/文学史”等，字段标签很可能变化，
 *   FIELD_LABELS 与 parseBlobFields 需要同步调整（或改成可配置 schema）。
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

/**
 * parseBlobFields(blob)
 * 从“多行 KV 文本”中解析出 out[label]，并额外推导 __start/__end。
 */
function parseBlobFields(blob) {
  const s = toPlain(blob);
  const out = {};
  if (!s) return out;

  // 为避免 label 中有正则特殊字符，先做转义
  const escaped = FIELD_LABELS.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const lookahead = '(?=\\s*(?:' + escaped.join('|') + ')\\s*[:：]|$)';

  // 每个 label 按“label: value 直到下一个 label 或结束”提取
  for (const label of FIELD_LABELS) {
    const re = new RegExp(label + '\\s*[:：]\\s*([\\s\\S]*?)' + lookahead, 'i');
    const m = re.exec(s);
    if (m) out[label] = m[1].replace(/\\n/g, '\n').trim();
  }

  // 解析“时间”字段，提取 __start/__end（YYYY-MM-DD）
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

/**
 * normalizeTags(v)
 * Tag 字段兼容：数组 / 逗号分隔字符串 / 空值
 *
 * 🔌 GENERALIZATION:
 * - 若未来 Tag 改为分号、管道符或多列结构，这里是第一个要改的位置。
 */
function normalizeTags(v) {
  if (!v && v !== 0) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * toMs(ts)
 * 用于计算整体数据范围（min/max），得到默认视窗 start/end 的 padding。
 */
function toMs(ts) {
  if (typeof ts === 'number') return ts;
  const n = +new Date(ts);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * =============================================================================
 * 详情弹窗内容生成
 * =============================================================================
 * buildKvHTML(obj) -> HTML string
 *
 * 说明：
 * - 你已实现 i18n 的 label 显示，这里保持原逻辑不改。
 * - asDisplay() 保证空值输出为 '—'。
 *
 * 🔧 UI TUNING:
 * - 若想改变弹窗排版/字体/间距，可以在这里或 injectScopedStyles 中做。
 * 🔌 GENERALIZATION:
 * - 若字段集合变化，KV 列表应同步变化；建议未来做“schema 驱动”的字段映射。
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
 * injectScopedStyles(container, ui)
 * - 给 container 增加随机 scope class，避免 CSS 污染全局
 * - 注入 vis-item 与弹窗（popover）以及样式面板的基础样式
 *
 * 🔧 UI TUNING:
 * - 事件卡片 padding/maxWidth/title font 等在这里同步调整。
 * - popover 的 max-height、shadow、border-radius 也在这里调。
 */
function injectScopedStyles(container, ui) {
  const scope = 'tl-scope-' + Math.random().toString(36).slice(2, 8);
  container.classList.add(scope);

  // 注意：这里仍使用字符串拼接；若后续要更易维护，可改为模板字符串分段。
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
  styleEl.textContent = css;
  styleEl.setAttribute('data-scope', scope);
  container.appendChild(styleEl);
  return scope;
}

/**
 * createLoadingOverlay()
 * - timeline 初始化期间展示“Loading…”
 * - 位置在 container 左上角
 */
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
 * normalizeEvent(event, i)
 *
 * 输出是 vis.DataSet 可接受的 item（至少包含 id/content/start/end），
 * 并额外挂上过滤与渲染所需字段：EventType/Region/Platform/Company/.../Tag/Importance。
 *
 * 🔌 GENERALIZATION:
 * - 这一块是“列变化影响最大”的区域。
 * - 如果将来列名变化（例如艺术史用 Person/Work/School），这里必须改；
 *   并且同步影响 buildKvHTML（弹窗字段）与过滤系统的字段集合。
 */
function normalizeEvent(event, i) {
  // 兼容不同来源字段名（Start/End vs start/end）
  const Start = event.Start ?? event.start ?? '';
  const End = event.End ?? event.end ?? '';

  // blob 文本兼容：一些来源把 KV 文本拼在 title/content 里
  const blob = (event.title || event.content || '').toString();
  const parsed = parseBlobFields(blob);

  // 标题优先级：显式列 > blob 解析 > fallback
  const title =
    toPlain(event.Title) ||
    parsed['事件名称'] ||
    toPlain(event.title) ||
    toPlain(event.content) ||
    '(Untitled)';

  // 时间优先级：显式列 > blob 推导
  const start = Start || parsed.__start || '';
  const end = End || parsed.__end || '';

  // 业务字段（用于过滤/样式/弹窗）
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

  // 详情弹窗 HTML（预先生成以提升点击响应）
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
    // vis item 基本字段
    id: event.id || `auto-${i + 1}`,
    content: title,
    start: start || undefined,
    end: end || undefined,

    // 自定义扩展字段（供 template/弹窗/过滤/样式使用）
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
 * safeApplyStyles()
 * - 从持久化的 styleState 中读取，并通过 style engine 应用到 DOM
 * - try/catch 容错，避免样式系统异常导致时间轴主逻辑崩溃
 *
 * 🔧 UI TUNING:
 * - 若选择器结构变化（比如 vis 的 DOM 结构变化），需要改 DEFAULTS.SELECTOR_BASE 等。
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
    // 保持静默：避免 UI 端打断主流程；调试期可考虑 console.warn
  }
}

/**
 * =============================================================================
 * Style Panel（样式面板）+ i18n 支持
 * =============================================================================
 * 说明：
 * - 这部分是“样式编辑 UI”的轻量实现，直接在 mount.js 内注入 #style-window。
 * - 依赖 stateMem 维护：当前属性绑定、样式类型所有权、规则集合等。
 *
 * ⚠️ PRODUCTIZATION NOTE:
 * - 从架构角度，这一坨 UI 最终应该拆到独立模块（例如 ui/style-panel.js），
 *   mount.js 保持“挂载 + 管线接线”即可。
 * - 你现在把它放在这里是可行的，但交接文档应强调它的职责与未来拆分方向。
 */

// i18n helpers：tr/tf 给面板与控件使用
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

/**
 * attrLabelI18n(attrKey)
 * - 优先使用 i18n: filter.fields.*
 * - fallback 到 constants 的 attributeLabels（中文）或 raw key
 */
function attrLabelI18n(attrKey) {
  const v = t(`filter.fields.${attrKey}`);
  if (v && v !== `filter.fields.${attrKey}`) return v;
  return attributeLabels?.[attrKey] || attrKey;
}

/**
 * styleTypeLabelI18n(typeKey)
 * - 优先使用 i18n: style.types.*
 * - fallback 到 constants 的 STYLE_LABELS 或 styleLabel() 或 raw key
 */
function styleTypeLabelI18n(typeKey) {
  const v = t(`style.types.${typeKey}`);
  if (v && v !== `style.types.${typeKey}`) return v;
  return STYLE_LABELS?.[typeKey] || styleLabel(typeKey) || typeKey;
}

/**
 * 样式面板入口按钮：绑定到哪个字段（EventType/Platform/...）
 * 🔧 UI TUNING: 可增减这里的字段，让“样式入口按钮”更多/更少
 * 🔌 GENERALIZATION: 若你的产品允许用户自定义字段，这里应由 schema 动态生成
 */
const STYLE_ATTR_BTNS = [
  { textKey: 'event', field: 'EventType' },
  { textKey: 'platform', field: 'Platform' },
  { textKey: 'console', field: 'ConsolePlatform' },
  { textKey: 'company', field: 'Company' },
  { textKey: 'region', field: 'Region' },
];

/**
 * 面板支持的“样式类型”集合
 * 注意：你有“同一种属性只能绑定一种样式类型”的约束，
 * 这由 stateMem.styleTypeOwner + boundStyleType 实现。
 */
const UI_STYLE_TYPES = [
  { key: 'fontColor' },
  { key: 'backgroundColor' },
  { key: 'borderColor' },
  { key: 'fontFamily' },
  { key: 'haloColor' },
];

let panelInjected = false;

/**
 * ensureStylePanelInjected()
 * - 懒加载注入 #style-window DOM
 * - 文案全部走 i18n（tr/styleTypeLabelI18n）
 *
 * 🔧 UI TUNING:
 * - 可在这里改面板宽度/布局/表头名称/按钮文本
 */
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
}

function openStylePanelLight() {
  ensureStylePanelInjected();
  document.getElementById('style-window').style.display = 'block';
}

function closeStylePanelLight() {
  const el = document.getElementById('style-window');
  if (el) el.style.display = 'none';
}

/**
 * 颜色控件：input[type=color] + hex 文本输入
 * - 写回 rule.style[rule.type]
 */
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

    // 支持 #RGB -> #RRGGBB
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

/**
 * 字体控件：预设字体族下拉
 * - 写回 rule.style.fontFamily
 *
 * 🔧 UI TUNING:
 * - 你可根据目标用户环境增删字体选项
 */
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

/**
 * 根据 rule.type 选择对应控件
 */
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

/**
 * renderChips(container, values)
 * - 用 chips 展示当前 rule.values
 */
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

/**
 * getTakenValuesForAttr(attrKey, exceptRowId)
 * - 防止“同一个属性值”被多个样式行重复占用（你现在的约束）
 */
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

/**
 * renderRow(...)
 * - 样式面板表格的一行：左侧是样式控件，中间是 chips + 选择器，右侧删除
 */
function renderRow(containerTbody, attrKey, rule, allOptionsForAttr) {
  const trEl = document.createElement('tr');
  trEl.dataset.rowId = rule.id;
  trEl.dataset.attrKey = attrKey;

  // 1) 样式控件
  const tdStyle = document.createElement('td');
  tdStyle.dataset.styleType = rule.type;
  tdStyle.appendChild(buildStyleCellControl(rule));
  trEl.appendChild(tdStyle);

  // 2) 作用属性值 chips + 选择按钮
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

  // 选择属性值弹窗（含“已占用”禁用）
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

      // 再检查一次冲突（防止并发/意外）
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

  // 3) 删除按钮
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

/**
 * collectOptionsForAttr(mapped, attrKey)
 * - 从当前数据集中收集该字段可能的值，用于样式行选择器
 * - 兼容字段值是数组（如 Tag）
 *
 * 🔌 GENERALIZATION:
 * - 若将来字段可以是对象或复杂结构，这里需要扩展“可枚举值提取策略”
 */
function collectOptionsForAttr(mapped, attrKey) {
  const vals = mapped
    .map((it) => it?.[attrKey])
    .flatMap((v) => (Array.isArray(v) ? v : [v]));
  return uniqueSorted(vals.filter(Boolean));
}

/**
 * refreshTypeOptions(selectEl)
 * - 样式类型下拉：如果某类型已被别的属性绑定，则禁用并提示绑定到哪个属性
 * - 使用 stateMem.styleTypeOwner 维护“样式类型归属”
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

    opt.textContent =
      base +
      (owner && !isMine
        ? ` (${tr('style.window.boundTo', 'bound to')}: ${ownerLabel})`
        : '');
  });
}

/**
 * persistAndApply()
 * - 将 stateMem 中的规则，转换为 engine 可消费的结构并持久化，再应用到 DOM
 * - buildEngineStyleState(...) 负责“UI state -> engine state”的映射
 */
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
 * mountStyleButtonsRightOfFilter(container, mapped)
 * - 在“筛选按钮右侧”插入一组“样式入口按钮”
 * - 如果筛选按钮是动态生成的，使用 MutationObserver 与延迟重试进行挂载
 *
 * 🔧 UI TUNING:
 * - findFilterBtn() 的识别策略可按你的 UI 结构调整（data-role、文本等）
 */
function mountStyleButtonsRightOfFilter(container, mapped) {
  function findFilterBtn() {
    let btn = document.querySelector('[data-role="filter-toggle"],[data-te-filter-toggle]');
    if (btn) return btn;

    const cands = Array.from(document.querySelectorAll('button,[role="button"]'));
    return cands.find((b) => /Filter|筛选|过滤/.test((b.textContent || '').trim())) || null;
  }

  function doAttach() {
    const filterBtn = findFilterBtn();
    if (!filterBtn) return false;

    const frag = document.createDocumentFragment();

    STYLE_ATTR_BTNS.forEach((def) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'te-style-btn';
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

  // 兼容不同渲染时序
  [120, 400, 1000].forEach((ms) => setTimeout(() => doAttach(), ms));
}

/**
 * openStyleEditorFor(attrKey, mapped)
 * - 打开样式面板，并加载当前 attrKey 对应的规则 bucket
 * - 实现“先绑定样式类型，再添加多条规则行”的流程
 * - 强制约束：同一种样式类型只能被一个属性绑定（styleTypeOwner）
 *
 * ⚠️ PRODUCTIZATION NOTE:
 * - 若未来允许用户“同时对一个属性使用多种样式类型”，
 *   这里的 boundStyleType/styleTypeOwner 约束需要整体重构。
 */
function openStyleEditorFor(attrKey, mapped) {
  ensureStylePanelInjected();

  // stateMem 的结构若不存在则初始化
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

  // 渲染现有规则 bucket
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

  // stagedType：用户在下拉里选中的“待绑定样式类型”
  let stagedType = 'none';

  if (typeSel) {
    typeSel.onchange = () => {
      const current = boundNow();
      const val = typeSel.value || 'none';

      // 已绑定则不允许换（必须 reset）
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

      // 样式类型被别的属性占用：禁止绑定
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

  // 确认绑定：创建第一条样式规则行
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

  // 重置绑定：清空 bucket，并释放 styleTypeOwner 占用
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

      // 重置后立即应用（清除样式）
      persistAndApply();
    });

  // 新增样式行：同一 attrKey 下可有多行规则，每行占用不同的 values 集合
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

  // 保存并应用：会剔除不完整行（无样式值或无 values）
  btnSave &&
    (btnSave.onclick = () => {
      const bucket = stateMem.styleRules[attrKey] || [];

      // 从后往前删，避免 index 变化
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

  // 面板关闭行为：右上角 X 或 backdrop 点击
  document.getElementById('style-close')?.addEventListener('click', closeStylePanelLight);
  document
    .querySelector('#style-window .sw-backdrop')
    ?.addEventListener('click', closeStylePanelLight);

  openStylePanelLight();
}

/**
 * =============================================================================
 * 主挂载：mountTimeline(container, overrides?)
 * =============================================================================
 * 对外 API：
 * - mountTimeline('#timeline', overrides) -> Promise<{ timeline, items, destroy }>
 *
 * container:
 * - 支持 selector string 或 HTMLElement
 *
 * overrides:
 * - 允许覆盖 vis Timeline options（比如 start/end/locale/margin/...）
 *
 * 关键流程：
 * 1) 校验 container 与 vis.js
 * 2) 注入 scoped CSS + loading overlay
 * 3) fetch -> normalizeEvent -> mapped
 * 4) 初始化过滤默认规则（Importance 4/5）
 * 5) new DataSet(initialItems) -> new Timeline(...)
 * 6) initFilterUI + style buttons + safeApplyStyles
 * 7) 绑定 timeline click -> popover
 * 8) 监听 filter:* 事件 -> dataset 重算/重绘 -> safeApplyStyles
 *
 * 🔧 UI TUNING:
 * - baseOptions 里的 locale / margin / stack / zoomKey / template 可调整。
 * - startDate/endDate 目前被硬编码覆盖为 1990-2000（见下方标记）。
 *
 * ⚠️ PRODUCTIZATION NOTE:
 * - startDate/endDate 固定范围用于 demo/聚焦；产品化需改回“按数据自动范围”或用户可配置。
 */
export async function mountTimeline(container, overrides = {}) {
  // 允许传入 selector string
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

  // vis.js 依赖检查
  if (!window.vis || !window.vis.Timeline || !window.vis.DataSet) {
    container.innerHTML =
      '<div style="padding:12px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">vis.js is not loaded.</div>';
    return { timeline: null, items: null, destroy() {} };
  }

  // loading overlay
  const loading = createLoadingOverlay();
  const needRel = getComputedStyle(container).position === 'static';
  if (needRel) container.style.position = 'relative';
  container.appendChild(loading);

  // scoped CSS
  injectScopedStyles(container, UI);

  // filter UI 会把按钮插到某个元素前，这里需要一个 selector
  const beforeSelector = container.id ? `#${container.id}` : '#timeline';

  let timeline = null;
  let dataset = null;
  let mapped = null;

  try {
    /**
     * 1) 拉取数据
     */
    const raw = await fetchAndNormalize();
    const data = Array.isArray(raw) ? raw : [];

    if (!data.length) {
      container.innerHTML =
        '<div style="padding:12px;background:#fff3cd;border:1px solid #ffeeba;border-radius:8px;color:#856404;">0 records returned.</div>';
      return { timeline: null, items: null, destroy() {} };
    }

    /**
     * 2) 数据映射（结构化 + 预生成 detailHtml）
     */
    mapped = data.map((evt, i) => normalizeEvent(evt, i));

    /**
     * 3) 初始化默认过滤规则：Importance = 4/5
     *    ⭐ 这是你的产品默认行为
     */
    clearRules();
    setLogic('AND');
    upsertRule('Importance', ['4', '5']);

    const initialItems = applyFilters(mapped, getState());

    /**
     * 4) vis 数据集
     */
    dataset = new window.vis.DataSet(initialItems);

    /**
     * 5) 计算默认视窗范围：按数据 min/max + padding
     *    （但你下面又用硬编码覆盖了 1990-2000）
     */
    const tvals = mapped.map((it) => toMs(it.start ?? it.end)).filter(Number.isFinite);

    let startDate, endDate;
    if (tvals.length) {
      const minT = Math.min(...tvals);
      const maxT = Math.max(...tvals);

      const DAY = 86400000;
      const pad = Math.max(7 * DAY, Math.round((maxT - minT) * 0.05));
      startDate = new Date(minT - pad);
      endDate = new Date(maxT + pad);
    }

    // ⚠️ PRODUCTIZATION NOTE:
    // 你当前强制把视窗固定为 1990-2000。
    // 如果未来要“自动聚焦数据范围”或“由用户配置”，删除/迁移这两行。
    startDate = new Date('1990-01-01');
    endDate = new Date('2000-12-31');

    /**
     * 6) vis Timeline options
     * 🔧 UI TUNING: 这里是第二个最常改的区域（与 UI 常量配合）。
     */
    const baseOptions = {
      minHeight: UI.canvas.height,
      maxHeight: UI.canvas.height,

      orientation: {
        item: UI.layout.itemPosition,
        axis: UI.layout.axisPosition,
      },

      margin: { item: UI.layout.verticalItemGap, axis: 50 },

      locale: 'en',
      editable: false,
      stack: UI.layout.stack,

      // 滚轮/缩放
      verticalScroll: UI.zoom.verticalScroll,
      zoomKey: UI.zoom.key,

      /**
       * template(item, element)
       * - element: vis 渲染时提供的内容 DOM 容器
       * - 这里我们将 item/titleText 渲染为单行标题，并挂上 data attrs 供样式引擎使用
       *
       * 🔧 UI TUNING:
       * - 若要支持多行标题、显示时间、或在卡片上显示更多字段，从这里改。
       */
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
        } catch {
          // 忽略：避免影响主渲染流程
        }

        const root = document.createElement('div');
        const h4 = document.createElement('h4');
        h4.className = 'event-title';
        h4.textContent = item.titleText || item.content || '(Untitled)';
        root.appendChild(h4);
        return root;
      },
    };

    // 允许外部覆盖 options（例如不同页面/variant）
    const options = { ...baseOptions, ...overrides };
    if (startDate) options.start = startDate;
    if (endDate) options.end = endDate;

    /**
     * 7) 创建 Timeline
     */
    const vis = window.vis;
    timeline = new vis.Timeline(container, dataset, options);

    /**
     * 8) 初始化过滤 UI（只负责 UI，不直接改 dataset）
     */
    initFilterUI({
      beforeElSelector: beforeSelector,
      getItems: () => mapped,
      getCurrentRules: () => getState().rules,
    });

    /**
     * 9) 样式入口按钮（i18n）
     */
    mountStyleButtonsRightOfFilter(container, mapped);

    /**
     * 10) 初次应用样式（从持久化 state）
     */
    safeApplyStyles();

    /**
     * =============================================================================
     * Popover（详情弹窗）：点击 vis item 显示，点击空白关闭
     * =============================================================================
     */

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

    /**
     * findAnchorFromProps(props)
     * - vis click 事件会给 props.item (id) 与 props.event.target
     * - 优先用 event.target 找最近 vis-item，失败则用 data-id 查询
     */
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

      // 🔧 UI TUNING: 弹窗尺寸策略
      const MIN_W = 280;
      const MIN_H = 140;
      const MAX_W = Math.min(520, container.clientWidth);
      const MAX_H = Math.min(container.clientHeight * 0.6, 600);

      let left = ib.left - cb.left + container.scrollLeft;
      let top = ib.top - cb.top + container.scrollTop;

      const width = Math.min(Math.max(ib.width, MIN_W), MAX_W);
      const height = Math.min(Math.max(ib.height, MIN_H), MAX_H);

      // 保证弹窗不超出容器可视区域（留 8px 边距）
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

    // timeline click：点空白隐藏；点 item 显示弹窗
    timeline.on('click', (props) => {
      if (!props || props.item == null) {
        hidePopover();
        return;
      }
      showPopoverOverItem(props);
    });

    // 点击弹窗外/卡片外关闭
    document.addEventListener('mousedown', (e) => {
      if (pop.style.display === 'none') return;
      const inPop = pop.contains(e.target);
      const onAnchor = currentAnchor && currentAnchor.contains(e.target);
      if (!inPop && !onAnchor) hidePopover();
    });

    // resize：重绘 + 关闭弹窗 + 重新应用样式
    window.addEventListener('resize', () => {
      try {
        timeline.redraw();
      } catch {}
      hidePopover();
      safeApplyStyles();
    });

    /**
     * =============================================================================
     * Filter 事件桥接：filter-ui -> 触发 window event -> mount.js 更新 dataset
     * =============================================================================
     * 约定事件：
     * - filter:add-rule:confirm  { key, values }   -> upsertRule
     * - filter:set-logic         { mode }          -> setLogic + applyFilters + dataset
     * - filter:reset                              -> clearRules + dataset = mapped
     * - filter:remove-rule      { key }           -> removeRule + applyFilters + dataset
     */

    window.addEventListener('filter:add-rule:confirm', (e) => {
      const { key, values } = e.detail || {};
      upsertRule(key, values);
      // 注意：这里你当前“只更新 state，不立刻重算 dataset”
      // 如果希望“新增规则立即生效”，可在这里 applyFilters + dataset 重算。
    });

    window.addEventListener('filter:set-logic', (e) => {
      const mode = e?.detail?.mode;
      setLogic(mode);

      const next = applyFilters(mapped, getState());
      dataset.clear();
      dataset.add(next);

      requestAnimationFrame(() => safeApplyStyles());
    });

    window.addEventListener('filter:reset', () => {
      clearRules();
      dataset.clear();
      dataset.add(mapped);

      requestAnimationFrame(() => safeApplyStyles());
    });

    window.addEventListener('filter:remove-rule', (e) => {
      const key = e?.detail?.key;
      if (key) removeRule(key);

      const next = applyFilters(mapped, getState());
      dataset.clear();
      dataset.add(next);

      requestAnimationFrame(() => safeApplyStyles());
    });

    // vis 发生变化时（例如 range changed）也可重新应用样式
    timeline.on('changed', () => requestAnimationFrame(() => safeApplyStyles()));

    return {
      timeline,
      items: dataset,
      destroy() {
        try {
          timeline.destroy();
        } catch {}
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
