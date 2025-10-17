// public/src/_staging/style-ui.js
// 当前以“显示时间轴”为目标：拉数据 → 规范化 → 渲染 vis.Timeline
// 保留你现有的样式/筛选占位逻辑；后续再逐步拆分

import {
  getFilterOptionsForKeyFrom,
  createEmptyRuleForType,
  ensureBucketIn,
  buildEngineStyleState,
  // 如需中文标签/颜色/样式名，可按需解开：
  // attributeLabels,
  // PRESET_COLORS,
  // styleLabel,
} from './constants.js';

import { toISO } from '../utils/data.js';
import { escapeHtml } from '../utils/dom.js';


import { fetchAndNormalize } from './fetch.js';

import { openAttrPicker } from '../ui/attr-picker.js';






/* =========================
 * —— 新增：按钮/弹窗占位绑定 —— 
 *   保持与你页面 onclick 兼容（可在 app.js 调用）
 * ========================= */
export function bindToolbar() {
  // 过滤
  window.openFilterWindow = function () {
    const el = document.getElementById('filter-window');
    if (el) el.style.display = 'block';
  };
  window.openAddFilter = function () {
    const el = document.getElementById('add-filter-window');
    if (el) el.style.display = 'block';
  };
  window.resetFilters = function () { alert('已复原过滤标准（占位）'); };
  window.applyFilters = function () { alert('已应用 AND 逻辑（占位）'); };
  window.applyFiltersOr = function () { alert('已应用 OR 逻辑（占位）'); };

  // 样式
  window.openStyleWindow = function (attr) {
    const el = document.getElementById('style-window');
    if (!el) return;
    el.style.display = 'block';
    const title = document.getElementById('style-title');
    if (title) title.textContent = (attr || '属性') + ' 样式';
    const hint = document.getElementById('bound-type-hint');
    if (hint) hint.textContent = '当前样式：无';
  };
  window.closeStyleWindow = function () {
    const el = document.getElementById('style-window');
    if (el) el.style.display = 'none';
  };
  window.addStyleRow = function () { alert('新增样式（占位）'); };
  window.confirmStyle = function () {
    alert('样式已保存（占位）');
    const el = document.getElementById('style-window');
    if (el) el.style.display = 'none';
  };

  // 属性选择弹窗按钮
  const picker = document.getElementById('attr-picker-window');
  const confirmBtn = document.getElementById('attr-picker-confirm');
  const cancelBtn = document.getElementById('attr-picker-cancel');
  const selAllBtn = document.getElementById('attr-picker-select-all');
  const clearBtn = document.getElementById('attr-picker-clear');
  if (confirmBtn) confirmBtn.addEventListener('click', () => { alert('已选择（占位）'); if (picker) picker.style.display = 'none'; });
  if (cancelBtn) cancelBtn.addEventListener('click', () => { if (picker) picker.style.display = 'none'; });
  if (selAllBtn) selAllBtn.addEventListener('click', () => alert('全选（占位）'));
  if (clearBtn) clearBtn.addEventListener('click', () => alert('全不选（占位）'));

  log('toolbar bound');
}

// ✅ 补丁：renderRuleRow（用你已写好的 fragment 渲染行）
export function renderRuleRow(attrKey, rule) {
  const tbody = document.getElementById('styleTableBody');
  if (!tbody) return;

  const tr = renderRuleRowFragment(attrKey, rule, {
    buildStyleControl: (type) => buildStyleControl(type), // 依赖注入版控件
    openAttrPicker,                                       // 仍为占位，第二遍再接
    renderRowAttrChips,                                   // 用下方补丁实现
    styleRulesRef: stateMem.styleRules,                   // 删除行时使用
  });

  tbody.appendChild(tr);
}

export function renderStyleTable(attrKey) {
  const tbody = document.getElementById('styleTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  (stateMem.styleRules[attrKey] || []).forEach(rule => renderRuleRow(attrKey, rule));
}

// ✅ 补丁：renderRowAttrChips（包一层，复用 InTbody 版本）
export function renderRowAttrChips(rowId, values) {
  const tbody = document.getElementById('styleTableBody');
  if (!tbody) return;
  renderRowAttrChipsInTbody(tbody, rowId, values);
}

export function confirmAttrPicker() {
  const { rowId, attrKey } = attrPickerEditing || {};
  const sel = document.getElementById('attr-picker-options');
  const modal = document.getElementById('attr-picker-window');

  // 防御：缺少编辑状态或控件
  if (!rowId || !attrKey || !sel) {
    if (modal && modal.style) modal.style.display = 'none';
    attrPickerEditing = { rowId: null, attrKey: null };
    return;
  }

  // 读取当前选择并去重
  const vals = Array.from(sel.selectedOptions || []).map(o => o.value);
  const uniqueVals = Array.from(new Set(vals));

  // 校验冲突（即使 open 时已过滤，这里再保险一次）
  if (typeof getTakenValues === 'function') {
    const takenByOthers = getTakenValues(attrKey, rowId); // Set
    const conflict = uniqueVals.find(v => takenByOthers.has(v));
    if (conflict) {
      alert(`“${conflict}” 已被同属性的其他样式行占用，请取消或更换。`);
      return;
    }
  }

  // 写回规则
  const rule = (typeof findRule === 'function') ? findRule(attrKey, rowId) : null;
  if (!rule) {
    if (modal && modal.style) modal.style.display = 'none';
    attrPickerEditing = { rowId: null, attrKey: null };
    return;
  }
  rule.values = uniqueVals;

  // 同步旧的行缓存（兼容旧结构）
  if (typeof window !== 'undefined' && window.styleRowSelections) {
    window.styleRowSelections[rowId] = uniqueVals;
  }

  // 回填标签
  if (typeof renderRowAttrChips === 'function') {
    renderRowAttrChips(rowId, uniqueVals);
  }

  // 关闭弹窗 & 重置编辑态
  if (modal && modal.style) modal.style.display = 'none';
  attrPickerEditing = { rowId: null, attrKey: null };
}

export function closeAttrPicker() {
  const m = document.getElementById('attr-picker-window');
  if (m && m.style) m.style.display = 'none';
}
export function selectAllInAttrPicker() {
  const sel = document.getElementById('attr-picker-options');
  if (!sel) return;

  const vals = Array.from(sel.options || []).map(o => o.value).filter(Boolean);

  if (attrPickerChoices) {
    // 清空已有 token（防止重复）
    if (typeof attrPickerChoices.removeActiveItems === 'function') {
      try { attrPickerChoices.removeActiveItems(); } catch {}
    }

    // 同步底层 <option>
    Array.from(sel.options).forEach(o => { o.selected = vals.includes(o.value); });

    // 让 Choices UI 同步（不同版本 API 兼容）
    if (vals.length) {
      if (typeof attrPickerChoices.setChoiceByValue === 'function') {
        attrPickerChoices.setChoiceByValue(vals);
      } else if (typeof attrPickerChoices.setValue === 'function') {
        attrPickerChoices.setValue(vals);
      }
    }
  } else {
    // 没用 Choices 的退化情况
    Array.from(sel.options).forEach(o => { o.selected = true; });
  }

  // 触发一次 change，确保 UI 状态同步
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

export function clearAttrPicker() {
  const sel = document.getElementById('attr-picker-options');
  if (!sel) return;

  if (attrPickerChoices) {
    if (typeof attrPickerChoices.removeActiveItems === 'function') {
      try { attrPickerChoices.removeActiveItems(); } catch {}
    }
    Array.from(sel.options).forEach(o => { o.selected = false; });
  } else {
    Array.from(sel.options).forEach(o => { o.selected = false; });
  }

  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

/* =========================
 * 其它工具（可选）
 * ========================= */


export function isSameSet(a = [], b = []) {
  if (a.length !== b.length) return false;
  const sa = new Set(a), sb = new Set(b);
  for (const v of sa) if (!sb.has(v)) return false;
  return true;
}

export function getTakenValues(attrKey, exceptRowId) {
  const taken = new Set();
  const rows = document.querySelectorAll(`#styleTableBody tr[data-attr-key="${attrKey}"]`);
  rows.forEach(tr => {
    const rid = tr.dataset.rowId;
    if (rid === exceptRowId) return;
    const vals = stateMem.styleRowSelections?.[rid] || [];
    vals.forEach(v => { if (v) taken.add(String(v)); });
  });
  return taken;
}

export function readRowStyleKey(rowEl) {
  if (!rowEl) return '|'; // 防御：空节点

  // 样式类型存放在第一列 td 的 data-style-type 上：'fontFamily' / 'fontColor' / ...
  const firstTd = rowEl.querySelector('td:first-child');
  const type = firstTd?.dataset?.styleType || '';

  // 默认值
  let value = '';

  if (!firstTd) return `${type}|`;

  // 字体：select 的 value
  const sel = firstTd.querySelector('select');
  if (sel) {
    value = sel.value?.trim() || '';
  }

  // 颜色：优先读 <input type="color">，其次读旁边的文本框（十六进制）
  const color = firstTd.querySelector('input[type="color"]');
  const hexInput = firstTd.querySelector('input[type="text"]');

  // 规范化 HEX：补齐 #，转大写
  const normalizeHex = (v) => {
    if (!v) return '';
    let s = String(v).trim().toUpperCase();
    if (!s.startsWith('#')) s = '#' + s;
    return s;
  };

  if (color && color.value) {
    value = normalizeHex(color.value);
  } else if (hexInput && hexInput.value) {
    value = normalizeHex(hexInput.value);
  }

  return `${type}|${value}`;
}

/* =========================
 * 过滤面板渲染（纯 UI）
 * ========================= */
export function renderFilterList(container, activeFilters, attributeLabels, onRemove) {
  if (!container) return;
  container.innerHTML = '';
  for (const [key, values] of Object.entries(activeFilters)) {
    const d = document.createElement('div');
    d.textContent = `${(attributeLabels && attributeLabels[key]) || key}: ${values.join(', ')}`;
    const btn = document.createElement('button');
    btn.textContent = '❌';
    btn.onclick = () => onRemove && onRemove(key);
    d.appendChild(btn);
    container.appendChild(d);
  }
}

export function renderAttributeSelect(selectEl, attributeLabels) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  Object.keys(attributeLabels || {}).forEach(key => {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = attributeLabels[key];
    selectEl.appendChild(o);
  });
}

export function renderFilterOptions(selectEl, options, useChoices = false, oldChoicesInstance = null) {
  if (!selectEl) return { choices: null };
  selectEl.innerHTML = '';
  (options || []).forEach(opt => {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    selectEl.appendChild(o);
  });
  if (!useChoices || typeof Choices !== 'function') return { choices: null };
  if (oldChoicesInstance) { try { oldChoicesInstance.destroy(); } catch {} }
  const choices = new Choices(selectEl, { removeItemButton: true, shouldSort: false });
  return { choices };
}

export function renderSimpleOptions(selectEl, list) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  (list || []).forEach(opt => {
    const o = document.createElement('option');
    o.value = o.textContent = opt;
    selectEl.appendChild(o);
  });
}

export function setRowSelections(selMap, rowId, values) {
  selMap[rowId] = Array.isArray(values) ? values.slice() : [];
  return selMap;
}

export function renderStyleTableBody(tbody, rules, attrKey, rowRender) {
  if (!tbody) return;
  tbody.innerHTML = '';
  (Array.isArray(rules) ? rules : []).forEach(rule => rowRender && rowRender(attrKey, rule));
}

/* =========================
 * 样式控件 wiring（字体/颜色）
 * ========================= */
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

export function wireColorHexSync(containerEl, rule) {
  if (!containerEl || !rule) return;
  const color = containerEl.querySelector('input[type="color"]');
  const hex   = containerEl.querySelector('input[type="text"]');
  const current = (rule.style?.[rule.type]) || '#000000';
  if (color) color.value = current;
  if (hex)   hex.value   = current;

  if (color && hex) {
    color.addEventListener('input', () => {
      const v = String(color.value || '#000000').toUpperCase();
      hex.value = v;
      if (!rule.style) rule.style = {};
      rule.style[rule.type] = v;
    });
    hex.addEventListener('change', () => {
      const v = String(hex.value || '#000000').toUpperCase();
      if (!rule.style) rule.style = {};
      rule.style[rule.type] = v;
      if (String(color.value || '').toUpperCase() !== v) color.value = v;
    });
  }
}

/* =========================
 * 表格行片段（纯渲染 + 依赖注入）
 * ========================= */
export function renderRuleRowFragment(attrKey, rule, deps = {}) {
  const {
    buildStyleControl,
    openAttrPicker,
    renderRowAttrChips,
    styleRulesRef,
  } = deps;

  const tr = document.createElement('tr');
  tr.dataset.rowId = rule.id;
  tr.dataset.attrKey = attrKey;

  // 左：样式控件
  const tdContent = document.createElement('td');
  tdContent.dataset.styleType = rule.type;
  const ctrl = buildStyleControl(rule.type);
  tdContent.appendChild(ctrl);
  tr.appendChild(tdContent);

  // 控件 wiring
  if (rule.type === 'fontFamily') {
    wireFontFamilyControl(tdContent, rule);
  } else if (['fontColor', 'borderColor', 'backgroundColor', 'haloColor'].includes(rule.type)) {
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

  // 首次渲染标签
  renderRowAttrChips(rule.id, rule.values || []);

  // 右：删除行
  const tdAction = document.createElement('td');
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.title = '删除该样式行';
  delBtn.textContent = '×';
  delBtn.addEventListener('click', () => {
    const bucket = (styleRulesRef && styleRulesRef[attrKey]) || [];
    const idx = bucket.findIndex(r => r.id === rule.id);
    if (idx >= 0) bucket.splice(idx, 1);
    tr.remove();
  });
  tdAction.appendChild(delBtn);
  tr.appendChild(tdAction);

  return tr;
}

/* =========================
 * 样式类型选择 & 窗口视图
 * ========================= */
export function refreshStyleTypeOptionsInSelect(selectEl, deps) {
  if (!selectEl || !selectEl.options) return;
  const {
    uiTypeToInternal,
    styleTypeOwner = {},
    currentStyleAttr = null,
    attributeLabels = {},
  } = deps || {};

  Array.from(selectEl.options).forEach(opt => {
    if (!opt.dataset.baseText) opt.dataset.baseText = opt.textContent;
    const internal = uiTypeToInternal ? uiTypeToInternal(opt.value) : opt.value;

    if (internal === 'none') {
      opt.disabled = false;
      opt.textContent = opt.dataset.baseText;
      return;
    }

    const owner = styleTypeOwner[internal];
    const isMine = owner === currentStyleAttr;

    opt.disabled = !!(owner && !isMine);
    opt.textContent = opt.dataset.baseText + (
      owner && !isMine ? `（已绑定：${attributeLabels[owner] || owner}）` : ''
    );
  });
}

export function computeStyleWindowViewModel(attr, deps = {}) {
  const {
    boundStyleType = {},
    attributeLabels = {},
    styleLabel = (k) => k,
  } = deps;

  const titleText = `${attributeLabels[attr] || attr} 样式`;
  const bound = boundStyleType[attr] || 'none';
  const hasBound = bound !== 'none';

  return {
    titleText,
    hintText: hasBound ? `当前样式：${styleLabel(bound)}` : '当前样式：无',
    ui: {
      confirm: { disabled: true, display: hasBound ? 'none' : 'inline-block' },
      reset:   { display: hasBound ? 'inline-block' : 'none' },
      add:     { disabled: !hasBound },
      typeSelDefault: 'none',
      tbodyClear: true,
      windowDisplay: 'block',
    }
  };
}

export function applyStyleWindowView(rootEls, vm) {
  const {
    styleTitleEl, styleWindowEl, typeSelEl, tbodyEl, confirmBtnEl, resetBtnEl, addBtnEl, hintEl
  } = rootEls;

  if (styleTitleEl) styleTitleEl.textContent = vm.titleText;
  if (hintEl)       hintEl.textContent = vm.hintText;
  if (styleWindowEl && styleWindowEl.style) styleWindowEl.style.display = vm.ui.windowDisplay;

  if (typeSelEl) typeSelEl.value = vm.ui.typeSelDefault;
  if (tbodyEl && vm.ui.tbodyClear) tbodyEl.innerHTML = '';

  if (confirmBtnEl) {
    confirmBtnEl.disabled = vm.ui.confirm.disabled;
    confirmBtnEl.style.display = vm.ui.confirm.display;
  }
  if (resetBtnEl)  resetBtnEl.style.display = vm.ui.reset.display;
  if (addBtnEl)    addBtnEl.disabled = vm.ui.add.disabled;
}

/* =========================
 * 样式类型选择变更/确认/重置（依赖注入）
 * ========================= */
export function onStyleTypeChangeInSelect(selectEl, deps = {}) {
  if (!selectEl) return { stagedType: 'none', blockedBy: 'no-select' };

  const {
    uiTypeToInternal = (v) => v,
    boundStyleType = {},
    currentStyleAttr = null,
    styleTypeOwner = {},
    attributeLabels = {},
    styleLabel = (k) => k,
    confirmBtnEl = null,
    hintEl = null,
    refreshOptions = null,
    notify = null,
  } = deps;

  const disableConfirm = (yes) => { if (confirmBtnEl) confirmBtnEl.disabled = !!yes; };
  const setHint = (txt) => { if (hintEl) hintEl.textContent = txt; };

  let mapped = uiTypeToInternal(selectEl.value) || 'none';
  let stagedType = mapped;

  // 已绑定：未重置前禁止切换
  const already = boundStyleType[currentStyleAttr] && boundStyleType[currentStyleAttr] !== 'none';
  if (already) {
    selectEl.value = 'none';
    stagedType = 'none';
    setHint(`当前绑定：${styleLabel(boundStyleType[currentStyleAttr])}（如需更改，请先“重置”）`);
    disableConfirm(true);
    return { stagedType, blockedBy: 'self-bound' };
  }

  // 全局唯一占用
  if (mapped !== 'none') {
    const owner = styleTypeOwner[mapped];
    const isMine = owner === currentStyleAttr;
    if (owner && !isMine) {
      const msg = `“${styleLabel(mapped)}” 已绑定到【${attributeLabels[owner] || owner}】。\n如需转移，请先到该属性中点击“重置”。`;
      if (typeof notify === 'function') notify(msg);
      selectEl.value = 'none';
      stagedType = 'none';
      disableConfirm(true);
      if (typeof refreshOptions === 'function') refreshOptions();
      return { stagedType, blockedBy: 'occupied', owner };
    }
  }

  // 正常可选
  disableConfirm(stagedType === 'none');
  return { stagedType, blockedBy: null };
}



export function confirmBindAction(deps = {}) {
  const {
    stagedType = 'none',
    currentStyleAttr = null,

    boundStyleType = {},
    styleTypeOwner = {},

    attributeLabels = {},
    styleLabel = (k) => k,

    tbodyEl = null,
    confirmBtnEl = null,
    resetBtnEl = null,
    addBtnEl = null,
    hintEl = null,

    refreshOptions = null,
    addStyleRow = null,
    notify = (msg) => alert(msg),
    confirmDialog = (msg) => window.confirm(msg),
  } = deps;

  if (stagedType === 'none') return { ok: false, reason: 'none' };

  // 再验占用
  const owner = styleTypeOwner[stagedType];
  if (owner && owner !== currentStyleAttr) {
    notify(`“${styleLabel(stagedType)}” 已绑定到【${attributeLabels[owner] || owner}】。\n如需转移，请先到该属性中点击“重置”。`);
    return { ok: false, reason: 'occupied', owner };
  }

  const prev = boundStyleType[currentStyleAttr] || 'none';
  if (prev !== 'none' && prev !== stagedType) {
    const ok = confirmDialog('切换样式类型将清空该属性下已添加的样式行，是否继续？');
    if (!ok) return { ok: false, reason: 'cancelled' };
    if (tbodyEl) tbodyEl.innerHTML = '';
    if (styleTypeOwner[prev] === currentStyleAttr) delete styleTypeOwner[prev];
  }

  // 写入绑定与占用
  boundStyleType[currentStyleAttr] = stagedType;
  styleTypeOwner[stagedType] = currentStyleAttr;

  // UI
  if (confirmBtnEl) { confirmBtnEl.disabled = true; confirmBtnEl.style.display = 'none'; }
  if (resetBtnEl)   { resetBtnEl.style.display = 'inline-block'; }
  if (addBtnEl)     { addBtnEl.disabled = false; }
  if (hintEl)       { hintEl.textContent = `当前样式：${styleLabel(stagedType)}`; }

  if (typeof refreshOptions === 'function') refreshOptions();
  if (typeof addStyleRow === 'function') addStyleRow();

  return { ok: true, bound: stagedType, attr: currentStyleAttr };
}


export function hideStyleWindow(styleWindowEl) {
  if (styleWindowEl && styleWindowEl.style) styleWindowEl.style.display = 'none';
}

export function confirmStyleAction(deps = {}) {
  const { applyCurrentStyles = () => {}, styleWindowEl = null } = deps;
  applyCurrentStyles({ persist: true });
  hideStyleWindow(styleWindowEl);
  return { ok: true };
}

export function resetBindAction(deps = {}) {
  const {
    currentStyleAttr = null,
    boundStyleType = {},
    styleTypeOwner = {},
    styleRulesRef = {},

    tbodyEl = null,
    typeSelEl = null,
    confirmBtnEl = null,
    resetBtnEl = null,
    addBtnEl = null,
    hintEl = null,

    refreshOptions = null,
    applyCurrentStyles = () => {},
    confirmDialog = (msg) => window.confirm(msg),
  } = deps;

  // 是否有行
  const hasRows = !!tbodyEl && tbodyEl.querySelectorAll('tr').length > 0;
  const ok = !hasRows || confirmDialog('重置将清空该属性下所有样式行，是否继续？');
  if (!ok) return { ok: false, reason: 'cancelled' };

  // 释放占用者
  const prev = boundStyleType[currentStyleAttr] || 'none';
  if (prev !== 'none' && styleTypeOwner[prev] === currentStyleAttr) {
    delete styleTypeOwner[prev];
  }

  // 清空规则与绑定
  boundStyleType[currentStyleAttr] = 'none';
  if (styleRulesRef[currentStyleAttr]) styleRulesRef[currentStyleAttr].length = 0;
  if (tbodyEl) tbodyEl.innerHTML = '';

  // 复位控件与提示
  if (typeSelEl) typeSelEl.value = 'none';
  if (confirmBtnEl) { confirmBtnEl.disabled = true; confirmBtnEl.style.display = 'inline-block'; }
  if (resetBtnEl)   resetBtnEl.style.display = 'none';
  if (addBtnEl)     addBtnEl.disabled = true;
  if (hintEl)       hintEl.textContent = '当前样式：无';

  if (typeof refreshOptions === 'function') refreshOptions();

  // 立即应用并持久化
  applyCurrentStyles({ persist: true });

  return { ok: true, stagedType: 'none' };
}

/* =========================
 * 构建“应用范围”多选（仅 UI，依赖注入）
 * ========================= */
export function buildAttrMultiSelectFor(attrKey, deps = {}) {
  const {
    options = null,                 // 相当于 allOptions
    getOptions = null,              // 可选：自定义获取器 (attrKey) => string[]
    useChoices = !!(typeof Choices === 'function'),
    choicesConfig = {
      removeItemButton: true,
      shouldSort: false,
      searchPlaceholderValue: '搜索…',
      position: 'bottom'
    },
  } = deps;

  const sel = document.createElement('select');
  sel.multiple = true;
  sel.className = 'style-attr-select';

  const opts = (typeof getOptions === 'function')
    ? (getOptions(attrKey) || [])
    : (options ? getFilterOptionsForKeyFrom(options, attrKey) : []);

  if (!opts || opts.length === 0) {
    const o = new Option('（暂无可选项 / 仍在加载）', '');
    o.disabled = true;
    sel.appendChild(o);
  } else {
    opts.forEach(v => sel.appendChild(new Option(v, v)));
  }

  if (useChoices) {
    sel._choices = new Choices(sel, choicesConfig);
  }

  return sel;
}





/* =========================
 * 新增样式行（仅 UI，依赖注入）
 * ========================= */
export function addStyleRowFor(attrKey, deps = {}) {
  const {
    boundStyleType = {},
    rulesMap = {},
    idFactory = null,
    renderRow = null, // (attrKey, rule) => void
  } = deps;

  const bound = boundStyleType[attrKey];
  if (!bound || bound === 'none') {
    return { ok: false, reason: 'unbound' };
  }

  const rule = createEmptyRuleForType(
    bound,
    idFactory || (() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `r_${Date.now()}_${Math.random().toString(36).slice(2)}`))
  );

  const bucket = ensureBucketIn(rulesMap, attrKey);
  bucket.push(rule);

  if (typeof renderRow === 'function') {
    renderRow(attrKey, rule);
  }

  return { ok: true, rule };
}


/* =========================
 * Attr Picker（依赖注入）
 * ========================= */
export function buildAttrPickerModel(rowId, attrKey, deps = {}) {
  const {
    options = null,                    // allOptions
    getOptions = null,                 // (key) => string[]
    getOptionsLegacy = null,           // 老版入口（可选）
    findRuleInMap = null,              // (rulesMap, attrKey, rowId) => rule|null
    rulesMap = null,                   // styleRules
    getTakenValues = null,             // (attrKey, exceptRowId) => Set<string>
  } = deps;

  // 预选
  let pre = [];
  if (typeof findRuleInMap === 'function' && rulesMap) {
    const rule = findRuleInMap(rulesMap, attrKey, rowId);
    pre = (rule && Array.isArray(rule.values)) ? rule.values : [];
  }

  // 候选
  let all = [];
  if (typeof getOptions === 'function') all = getOptions(attrKey) || [];
  else if (typeof getOptionsLegacy === 'function') all = getOptionsLegacy(attrKey) || [];
  else if (options) all = options[attrKey] || [];

  // 去重：排除其它行已占用（保留本行已选）
  const takenByOthers = (typeof getTakenValues === 'function')
    ? getTakenValues(attrKey, rowId)
    : new Set();

  const candidates = all.filter(v => pre.includes(v) || !takenByOthers.has(v));
  return { candidates, preselected: pre };
}

export function renderAttrPickerInto(root, vm, deps = {}) {
  const { titleEl, hintEl, attrNameEl, selectEl, modalEl } = root;
  const { attrCnName = '', candidates = [], preselected = [] } = vm;
  const {
    useChoices = !!(typeof Choices === 'function'),
    choicesConfig = { removeItemButton: true, shouldSort: false, searchPlaceholderValue: '搜索…', position: 'bottom' }
  } = deps;

  if (titleEl) titleEl.textContent = '选择应用的属性值';
  if (hintEl)  hintEl.textContent = `${attrCnName}：可多选，可搜索`;
  if (attrNameEl) attrNameEl.textContent = attrCnName;

  // 清理旧实例与旧选项
  if (selectEl && selectEl._choices && typeof selectEl._choices.destroy === 'function') {
    try { selectEl._choices.destroy(); } catch {}
    selectEl._choices = null;
  }
  if (selectEl) {
    selectEl.innerHTML = '';
    if (!candidates.length) {
      const o = new Option('（暂无可选项 / 仍在加载）', '');
      o.disabled = true;
      selectEl.appendChild(o);
    } else {
      candidates.forEach(v => {
        selectEl.appendChild(new Option(v, v, false, preselected.includes(v)));
      });
    }
    if (useChoices) {
      selectEl._choices = new Choices(selectEl, choicesConfig);
    }
  }

  if (modalEl && modalEl.style) modalEl.style.display = 'block';
}

export function openAttrPickerFor(rowId, attrKey, deps = {}) {
  const {
    // DOM
    modalEl,
    titleEl,
    hintEl,
    attrNameEl,
    selectEl,
    // 文案
    attributeLabels = {},
    // 数据与工具
    options = null,
    getOptions = null,
    getOptionsLegacy = null,
    findRuleInMap = null,
    rulesMap = null,
    getTakenValues = null,
  } = deps;

  const cn = attributeLabels[attrKey] || attrKey;
  const { candidates, preselected } = buildAttrPickerModel(rowId, attrKey, {
    options, getOptions, getOptionsLegacy, findRuleInMap, rulesMap, getTakenValues
  });

  renderAttrPickerInto(
    { modalEl, titleEl, hintEl, attrNameEl, selectEl },
    { attrCnName: cn, candidates, preselected },
    {}
  );
}

/* =========================
 * Attr Picker 确认（依赖注入）
 * ========================= */
export function readUniqueSelections(selectEl) {
  if (!selectEl) return [];
  const vals = Array.from(selectEl.selectedOptions || []).map(o => o.value);
  return Array.from(new Set(vals));
}

export function confirmAttrPickerAction(deps = {}) {
  const {
    rowId = null,
    attrKey = null,

    selectEl = null,      // #attr-picker-options
    modalEl = null,       // #attr-picker-window

    rulesMap = null,      // styleRules
    findRuleInMap = null, // (rulesMap, attrKey, rowId) => rule | null
    styleRowSelectionsRef = null,

    getTakenValues = null,          // (attrKey, exceptRowId) => Set<string>
    renderRowAttrChips = null,      // (rowId, values) => void

    notify = (msg) => alert(msg),
  } = deps;

  // 兜底：编辑态或控件缺失
  if (!rowId || !attrKey || !selectEl) {
    if (modalEl && modalEl.style) modalEl.style.display = 'none';
    return { ok: false, reason: 'invalid-state' };
  }

  // 读取并去重
  const uniqueVals = readUniqueSelections(selectEl);

  // 终检：与其他行冲突
  if (typeof getTakenValues === 'function') {
    const takenByOthers = getTakenValues(attrKey, rowId);
    const conflict = uniqueVals.find(v => takenByOthers.has(v));
    if (conflict) {
      notify(`“${conflict}” 已被同属性的其他样式行占用，请取消或更换。`);
      return { ok: false, reason: 'conflict', conflict };
    }
  }

  // 写回规则
  let rule = null;
  if (typeof findRuleInMap === 'function') {
    rule = findRuleInMap(rulesMap, attrKey, rowId);
  }
  if (!rule) {
    if (modalEl && modalEl.style) modalEl.style.display = 'none';
    return { ok: false, reason: 'rule-not-found' };
  }
  rule.values = uniqueVals;

  // 同步（可选）旧的行内缓存
  if (styleRowSelectionsRef) {
    styleRowSelectionsRef[rowId] = uniqueVals;
  }

  // 回填 chips
  if (typeof renderRowAttrChips === 'function') {
    renderRowAttrChips(rowId, uniqueVals);
  }

  // 关闭弹窗
  if (modalEl && modalEl.style) modalEl.style.display = 'none';

  return { ok: true, values: uniqueVals };
}

// ========== AttrPicker 批量选择：依赖注入版（不查全局 ID，不触发 alert） ==========

// 全选：把 <select multiple> 的所有可用项选中，并（可选）同步 Choices 实例
export function selectAllInAttrPickerEl(selectEl, choicesInstance = null) {
  if (!selectEl) return { ok: false, reason: 'no-select' };

  const vals = Array.from(selectEl.options || [])
    .map(o => o.value)
    .filter(Boolean);

  if (choicesInstance) {
    // 清掉已有 token
    if (typeof choicesInstance.removeActiveItems === 'function') {
      choicesInstance.removeActiveItems();
    }
    // 保障底层 option 也选中
    Array.from(selectEl.options || []).forEach(o => { o.selected = vals.includes(o.value); });
    // 让 Choices 生成 token（兼容不同版本 API）
    if (vals.length) {
      if (typeof choicesInstance.setChoiceByValue === 'function') {
        choicesInstance.setChoiceByValue(vals);
      } else if (typeof choicesInstance.setValue === 'function') {
        choicesInstance.setValue(vals);
      }
    }
  } else {
    // 退化：没有 Choices
    Array.from(selectEl.options || []).forEach(o => { o.selected = true; });
  }

  selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, values: vals };
}

// 全不选：清空选中，并（可选）同步 Choices 实例
export function clearAttrPickerEl(selectEl, choicesInstance = null) {
  if (!selectEl) return { ok: false, reason: 'no-select' };

  if (choicesInstance && typeof choicesInstance.removeActiveItems === 'function') {
    choicesInstance.removeActiveItems();
  }
  Array.from(selectEl.options || []).forEach(o => { o.selected = false; });

  selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true };
}

// ========== 行内 Chips 渲染：依赖注入版 ==========

// 直接对“chips 容器”渲染（最通用）
export function renderChipsInto(containerEl, values) {
  if (!containerEl) return;
  const list = Array.isArray(values) ? values : [];
  containerEl.innerHTML = '';

  if (list.length === 0) {
    containerEl.innerHTML = '<span style="color:#999;">（未选择）</span>';
    return;
  }
  list.forEach(v => {
    const tag = document.createElement('span');
    tag.textContent = v;
    tag.style.cssText = 'display:inline-block;padding:2px 6px;margin:2px;border:1px solid #ccc;border-radius:10px;font-size:12px;';
    containerEl.appendChild(tag);
  });
}

// 根据 rowId 在给定 tbody 内找到 .attr-chips 渲染（避免依赖全局 #styleTableBody）
export function renderRowAttrChipsInTbody(tbodyEl, rowId, values) {
  if (!tbodyEl) return { ok: false, reason: 'no-tbody' };
  const tr = tbodyEl.querySelector(`tr[data-row-id="${rowId}"]`);
  if (!tr) return { ok: false, reason: 'no-row' };
  const box = tr.querySelector('.attr-chips');
  if (!box) return { ok: false, reason: 'no-chips' };
  renderChipsInto(box, values);
  return { ok: true };
}

// 依赖注入版：只构造 UI，不直接写 rule.style，不依赖 window.*
// 用法（第二遍时）：buildStyleControl('fontColor', { PRESET_COLORS })
export function buildStyleControl(type, deps = {}) {
  const { PRESET_COLORS = [] } = deps;
  const wrap = document.createElement('div');

  // ====== 字体族 ======
  if (type === 'fontFamily') {
    const fontSel = document.createElement('select');
    fontSel.innerHTML = `
      <option value="">请选择字体</option>
      <option value="STCaiyun">华文彩云 (STCaiyun)</option>
      <option value="FZShuTi">方正舒体 (FZShuTi)</option>
      <option value="FZYaoti">方正姚体 (FZYaoti)</option>
      <option value='"Microsoft YaHei"'>微软雅黑 (Microsoft YaHei)</option>
      <option value="DengXian">等线 (DengXian)</option>
      <option value="LiSu">隶书 (LiSu)</option>
      <option value="YouYuan">幼圆 (YouYuan)</option>
      <option value="SimSun">宋体 (SimSun)</option>
      <option value="SimHei">黑体 (SimHei)</option>
      <option value="KaiTi">楷体 (KaiTi)</option>
    `;
    wrap.appendChild(fontSel);
    return wrap;
  }

  // ====== 颜色类：fontColor / borderColor / backgroundColor / haloColor ======
  if (['fontColor', 'borderColor', 'backgroundColor', 'haloColor'].includes(type)) {
    wrap.className = 'color-ui';

    // 1) 原生取色器
    const color = document.createElement('input');
    color.type = 'color';
    color.value = '#000000';
    color.setAttribute('aria-label', '选择颜色');

    // 2) HEX 输入
    const hex = document.createElement('input');
    hex.type = 'text';
    hex.placeholder = '#RRGGBB';
    hex.value = color.value.toUpperCase();
    hex.inputMode = 'text';
    hex.pattern = '^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$';

    // —— 工具：HEX 规范化 + 文本可读色 + 预览 —— //
    function normalizeHex(v) {
      let s = String(v || '').trim();
      if (!s) return null;
      if (s[0] !== '#') s = '#' + s;
      if (/^#([0-9a-fA-F]{3})$/.test(s)) s = '#' + s.slice(1).split('').map(ch => ch + ch).join('');
      if (/^#([0-9a-fA-F]{6})$/.test(s)) return s.toUpperCase();
      return null;
    }
    function textOn(bg) {
      const n = normalizeHex(bg);
      if (!n) return '#111';
      const r = parseInt(n.slice(1,3),16), g = parseInt(n.slice(3,5),16), b = parseInt(n.slice(5,7),16);
      const L = 0.299*r + 0.587*g + 0.114*b;
      return L > 180 ? '#111' : '#fff';
    }
    function applyPreview(v) {
      hex.style.background = v;
      hex.style.color = textOn(v);
    }
    applyPreview(hex.value);

    // —— 同步：取色器 -> HEX（实时）——
    color.addEventListener('input', () => {
      const v = color.value.toUpperCase();
      hex.value = v;
      applyPreview(v);
      // 只分发事件给外层；本函数不直接写 rule.style
      hex.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // —— 同步：HEX 输入预览 + 同步取色器 —— 
    hex.addEventListener('input', () => {
      const n = normalizeHex(hex.value);
      if (n) {
        color.value = n;
        applyPreview(n);
      }
    });
    // 失焦校正
    hex.addEventListener('change', () => {
      const n = normalizeHex(hex.value);
      if (n) {
        hex.value = n;
        color.value = n;
        applyPreview(n);
      } else {
        hex.value = color.value.toUpperCase();
        applyPreview(hex.value);
      }
    });

    // —— 点击/聚焦 HEX 时唤起取色器 —— 
    hex.addEventListener('focus', () => color.focus());
    hex.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof color.showPicker === 'function') color.showPicker();
      else color.click();
    });

    wrap.appendChild(color);
    wrap.appendChild(hex);

    // 3) 预设色块（9 个非黑白）
    const sw = document.createElement('div');
    sw.className = 'swatches';

    const palette = (Array.isArray(PRESET_COLORS) && PRESET_COLORS.length)
      ? PRESET_COLORS
      : [
          { name: '琥珀',   hex: '#F59E0B' },
          { name: '靛蓝',   hex: '#6366F1' },
          { name: '祖母绿', hex: '#10B981' },
          { name: '玫红',   hex: '#F43F5E' },
          { name: '天青',   hex: '#0EA5E9' },
          { name: '紫罗兰', hex: '#8B5CF6' },
          { name: '青柠',   hex: '#84CC16' },
          { name: '橙',     hex: '#F97316' },
          { name: '洋红',   hex: '#D946EF' }
        ];

    palette.forEach(c => {
      const s = document.createElement('div');
      s.className = 'swatch';
      s.title = `${c.name} ${c.hex}`;
      s.style.cssText = 'display:inline-block;width:18px;height:18px;border-radius:4px;margin:4px;cursor:pointer;border:1px solid rgba(0,0,0,.15);';
      s.style.background = c.hex;
      s.addEventListener('click', () => {
        const val = String(c.hex).toUpperCase();
        color.value = val;
        hex.value = val;
        applyPreview(val);
        color.dispatchEvent(new Event('input',  { bubbles: true }));
        hex.dispatchEvent(new Event('change', { bubbles: true }));
      });
      sw.appendChild(s);
    });
    wrap.appendChild(sw);

    return wrap;
  }

  // 其他类型占位
  wrap.textContent = type + '（待配置）';
  return wrap;
}

/**
 * 依赖注入版：应用当前样式（可选持久化）
 * —— 不直接访问 window/localStorage/DOM；由调用方注入
 */
export function applyCurrentStylesInjected({
  // 必需内存
  boundStyleType = {},
  styleRules = {},

  // 引擎调用
  applyEngine = (state, opts) => {},

  // 选择器（与现网保持一致，便于第二遍替换）
  selectorBase = '.vis-item.event, .vis-item-content.event',
  titleSelector = '.event-title',

  // 持久化
  persist = true,
  storageKey = 'timelineStyle.v1',
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
} = {}) {
  const state = buildEngineStyleState(boundStyleType, styleRules);

  if (persist && storage && typeof storage.setItem === 'function') {
    try { storage.setItem(storageKey, JSON.stringify(state)); } catch {}
  }

  applyEngine(state, { selectorBase, titleSelector });
  return state;
}
