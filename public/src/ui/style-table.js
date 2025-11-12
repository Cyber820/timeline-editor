// src/ui/style-table.js
// ✅ 职责：样式规则表格渲染 & 交互 wiring（UI 层，不做引擎计算）
// - renderStyleTable(attrKey)
// - renderRuleRow(attrKey, rule)
// - addStyleRowFor(attrKey, deps)           新增一行并渲染
// - buildAttrMultiSelectFor(attrKey, deps)  构建多选控件（可注入 Choices）
// - 工具：renderChipsInto / renderRowAttrChips / renderRowAttrChipsInTbody / setRowSelections / wire*
//
// 依赖与注入：尽量通过 deps 注入，降低对全局的耦合。
// 默认仍兼容你当前的全局用法（如 window.stateMem.styleRules）。

import {
  getFilterOptionsForKeyFrom,
  createEmptyRuleForType,
  ensureBucketIn,
} from '../_staging/constants.js';
import { genId } from '../utils/id.js';

/** ---------- 小工具：HEX 规范化 ---------- */
function normalizeHexUpper(v) {
  if (!v) return '';
  let s = String(v).trim().toUpperCase();
  if (!s.startsWith('#')) s = '#' + s;
  // #ABC -> #AABBCC
  if (s.length === 4) {
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  // 非法长度交给 <input type="color"> 兜底
  return s;
}

/** ---------- 行渲染入口（使用全局 tbody 与全局依赖的默认注入） ---------- */
export function renderRuleRow(attrKey, rule) {
  const tbody = document.getElementById('styleTableBody');
  if (!tbody) return;

  // 默认依赖：直接使用全局 window.stateMem.styleRules
  const tr = renderRuleRowFragment(attrKey, rule, {
    buildStyleControl: (type) => buildStyleControl(type),
    openAttrPicker, // 由其它 UI 模块提供，当前允许留空（不会崩）
    renderRowAttrChips, // 本文件下方实现（对全局 tbody 的薄封装）
    styleRulesRef: (window.stateMem && window.stateMem.styleRules) || {}, // 删除行时使用
  });

  tbody.appendChild(tr);
}

/** 渲染整个 attrKey 的表格 */
export function renderStyleTable(attrKey) {
  const tbody = document.getElementById('styleTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const rules =
    (window.stateMem &&
      window.stateMem.styleRules &&
      window.stateMem.styleRules[attrKey]) ||
    [];
  (rules || []).forEach((rule) => renderRuleRow(attrKey, rule));
}

/** ---------- 渲染 chips（封装：使用全局 tbody） ---------- */
export function renderRowAttrChips(rowId, values) {
  const tbody = document.getElementById('styleTableBody');
  if (!tbody) return;
  renderRowAttrChipsInTbody(tbody, rowId, values);
}

/** 设定「每行当前选择的属性值」的内存映射（浅拷贝入存） */
export function setRowSelections(selMap, rowId, values) {
  selMap[rowId] = Array.isArray(values) ? values.slice() : [];
  return selMap;
}

/** 支持传入自定义 tbody 与 row 渲染器（纯渲染，不耦合全局） */
export function renderStyleTableBody(tbody, rules, attrKey, rowRender) {
  if (!tbody) return;
  tbody.innerHTML = '';
  (Array.isArray(rules) ? rules : []).forEach(
    (rule) => rowRender && rowRender(attrKey, rule),
  );
}

/** ---------- 控件 wiring：字体族 ---------- */
export function wireFontFamilyControl(containerEl, rule) {
  if (!containerEl || !rule) return;
  const sel = containerEl.querySelector('select');
  if (!sel) return;
  sel.value = rule.style?.fontFamily || '';
  sel.addEventListener('change', () => {
    if (!rule.style) rule.style = {};
    rule.style.fontFamily = sel.value || '';
  });
}

/** ---------- 控件 wiring：颜色（color ↔ input[text] 同步） ---------- */
export function wireColorHexSync(containerEl, rule) {
  if (!containerEl || !rule) return;
  const color = containerEl.querySelector('input[type="color"]');
  const hex = containerEl.querySelector('input[type="text"]');

  const key = rule.type; // 'fontColor' | 'borderColor' | 'backgroundColor' | 'haloColor'
  const current = normalizeHexUpper(rule.style?.[key] || '#000000');

  if (color) color.value = current;
  if (hex) hex.value = current;

  if (color && hex) {
    color.addEventListener('input', () => {
      const v = normalizeHexUpper(color.value || '#000000');
      hex.value = v;
      (rule.style ||= {})[key] = v;
    });
    hex.addEventListener('change', () => {
      const v = normalizeHexUpper(hex.value || '#000000');
      (rule.style ||= {})[key] = v;
      if (normalizeHexUpper(color.value || '') !== v) color.value = v;
    });
  }
}

/**
 * 组装一行 <tr>（纯 DOM，依赖从 deps 注入）
 * deps:
 *  - buildStyleControl(type): HTMLElement   样式输入控件工厂
 *  - openAttrPicker(rowId, attrKey): void  打开属性选择弹窗
 *  - renderRowAttrChips(rowId, values):void 渲染 chips
 *  - styleRulesRef: Record<string, Rule[]>  规则桶（用于删除）
 */
export function renderRuleRowFragment(attrKey, rule, deps = {}) {
  const {
    buildStyleControl,
    openAttrPicker = () => {},
    renderRowAttrChips,
    styleRulesRef = {},
  } = deps;

  const tr = document.createElement('tr');
  tr.dataset.rowId = rule.id;
  tr.dataset.attrKey = attrKey;

  // 左：样式控件
  const tdContent = document.createElement('td');
  tdContent.dataset.styleType = rule.type;
  const ctrl = buildStyleControl
    ? buildStyleControl(rule.type)
    : document.createTextNode(rule.type);
  tdContent.appendChild(ctrl);
  tr.appendChild(tdContent);

  // 控件 wiring
  if (rule.type === 'fontFamily') {
    wireFontFamilyControl(tdContent, rule);
  } else if (
    ['fontColor', 'borderColor', 'backgroundColor', 'haloColor'].includes(
      rule.type,
    )
  ) {
    wireColorHexSync(tdContent, rule);
  }

  // 中：标签 chips + “添加/修改属性”
  const tdAttr = document.createElement('td');
  const chips = document.createElement('div');
  chips.className = 'attr-chips';
  chips.style.minHeight = '28px';
  tdAttr.appendChild(chips);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.textContent = '添加/修改属性';
  editBtn.style.marginLeft = '8px';
  editBtn.addEventListener('click', () => openAttrPicker(rule.id, attrKey));
  tdAttr.appendChild(editBtn);

  tr.appendChild(tdAttr);

  // 首次渲染 chips
  if (typeof renderRowAttrChips === 'function') {
    renderRowAttrChips(rule.id, rule.values || []);
  }

  // 右：删除行
  const tdAction = document.createElement('td');
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.title = '删除该样式行';
  delBtn.textContent = '×';
  delBtn.addEventListener('click', () => {
    const bucket = (styleRulesRef && styleRulesRef[attrKey]) || [];
    const idx = bucket.findIndex((r) => r.id === rule.id);
    if (idx >= 0) bucket.splice(idx, 1);
    // 清理选择缓存，防止“幽灵选择”
    try {
      if (window.stateMem && window.stateMem.styleRowSelections) {
        delete window.stateMem.styleRowSelections[rule.id];
      }
    } catch {}
    tr.remove();
  });
  tdAction.appendChild(delBtn);
  tr.appendChild(tdAction);

  return tr;
}

/**
 * 构建多选控件：
 * - 默认从 constants.getFilterOptionsForKeyFrom(options, attrKey) 获取候选项
 * - 允许注入 getOptions(attrKey) 作为完全替代
 * - 允许注入 Choices 构造（或自动检测全局 Choices）
 */
export function buildAttrMultiSelectFor(attrKey, deps = {}) {
  const {
    options = null, // = allOptions
    getOptions = null,
    useChoices =
      typeof globalThis !== 'undefined' &&
      typeof globalThis.Choices === 'function',
    choicesCtor =
      typeof globalThis !== 'undefined' ? globalThis.Choices : undefined,
    choicesConfig = {
      removeItemButton: true,
      shouldSort: false,
      searchPlaceholderValue: '搜索…',
      position: 'bottom',
    },
  } = deps;

  const sel = document.createElement('select');
  sel.multiple = true;
  sel.className = 'style-attr-select';

  const opts =
    typeof getOptions === 'function'
      ? getOptions(attrKey) || []
      : options
      ? getFilterOptionsForKeyFrom(options, attrKey)
      : [];

  if (!opts || opts.length === 0) {
    const o = new Option('（暂无可选项 / 仍在加载）', '');
    o.disabled = true;
    sel.appendChild(o);
  } else {
    opts.forEach((v) => sel.appendChild(new Option(v, v)));
  }

  if (useChoices && typeof choicesCtor === 'function') {
    sel._choices = new choicesCtor(sel, choicesConfig);
  }

  return sel;
}

/**
 * 新增样式行：
 * - 需要先在 boundStyleType 中为 attrKey 绑定好样式类型（fontColor/borderColor/...）
 * - 可注入 idFactory（默认使用 genId('rule_')）
 * - rulesMap: { [attrKey]: Rule[] }
 * - renderRow: (attrKey, rule) => void
 */
export function addStyleRowFor(attrKey, deps = {}) {
  const {
    boundStyleType = {},
    rulesMap = {},
    idFactory = () => genId('rule_'),
    renderRow = null,
  } = deps;

  const bound = boundStyleType[attrKey];
  if (!bound || bound === 'none') {
    return { ok: false, reason: 'unbound' };
  }

  const rule = createEmptyRuleForType(bound, idFactory);
  const bucket = ensureBucketIn(rulesMap, attrKey);
  bucket.push(rule);

  if (typeof renderRow === 'function') {
    renderRow(attrKey, rule);
  }

  return { ok: true, rule };
}

/** 把一组值渲染成可视 chips（不持久化，仅 UI） */
export function renderChipsInto(containerEl, values) {
  if (!containerEl) return;
  const list = Array.isArray(values) ? values : [];
  containerEl.innerHTML = '';

  if (list.length === 0) {
    containerEl.innerHTML = '<span style="color:#999;">（未选择）</span>';
    return;
  }
  list.forEach((v) => {
    const tag = document.createElement('span');
    tag.textContent = v;
    tag.style.cssText =
      'display:inline-block;padding:2px 6px;margin:2px;border:1px solid #ccc;border-radius:10px;font-size:12px;';
    containerEl.appendChild(tag);
  });
}

/** 在指定 tbody 中刷新某一行的 chips */
export function renderRowAttrChipsInTbody(tbodyEl, rowId, values) {
  if (!tbodyEl) return { ok: false, reason: 'no-tbody' };
  const tr = tbodyEl.querySelector(`tr[data-row-id="${rowId}"]`);
  if (!tr) return { ok: false, reason: 'no-row' };
  const box = tr.querySelector('.attr-chips');
  if (!box) return { ok: false, reason: 'no-chips' };
  renderChipsInto(box, values);
  return { ok: true };
}

/** ---------- 依赖占位：buildStyleControl / openAttrPicker ----------
 * 这两个功能通常由 UI 其它模块提供，这里给默认实现以保证文件独立可运行。
 * - buildStyleControl(type): 返回控件 DOM
 * - openAttrPicker(rowId, attrKey): 打开属性选择弹窗
 */
function buildStyleControl(type) {
  // fontFamily：<select>
  if (type === 'fontFamily') {
    const wrap = document.createElement('div');
    const sel = document.createElement('select');
    // ✅ 增加“隶书 / 幼圆”，保留常见回退
    sel.innerHTML = `
      <option value="">（默认字体）</option>
      <option value="Inter, system-ui, Arial">Inter</option>
      <option value="Noto Sans SC, system-ui, Arial">思源黑体</option>
      <option value="SimHei, Arial">黑体 (SimHei)</option>
      <option value="SimSun, serif">宋体 (SimSun)</option>
      <option value="'LiSu', 'STLiti', 'KaiTi', serif">隶书 (LiSu)</option>
      <option value="'YouYuan', 'Microsoft YaHei', 'PingFang SC', sans-serif">幼圆 (YouYuan)</option>
    `;
    wrap.appendChild(sel);
    return wrap;
  }

  // 颜色类：color + text 输入
  if (['fontColor', 'borderColor', 'backgroundColor', 'haloColor'].includes(type)) {
    const wrap = document.createElement('div');
    const color = document.createElement('input');
    color.type = 'color';
    const hex = document.createElement('input');
    hex.type = 'text';
    hex.placeholder = '#RRGGBB';
    hex.style.marginLeft = '6px';
    wrap.appendChild(color);
    wrap.appendChild(hex);
    return wrap;
  }

  // 兜底：文本
  const span = document.createElement('span');
  span.textContent = String(type || 'unknown');
  return span;
}

function openAttrPicker(/* rowId, attrKey */) {
  // 第二轮再由真正的弹窗实现替换；此处不做任何操作，避免报错。
}
