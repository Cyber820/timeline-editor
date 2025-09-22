// public/src/_staging/style-ui.js
// ⚠️ 现在不被任何地方引用；只是“停机位”。后续我们把已有函数一点点搬进来。
// 你可以逐步把 renderRuleRow / buildStyleControl / openAttrPicker 等粘到对应位置。

// —— 内存模型（与面板一致）——
export const stateMem = {
  currentStyleAttr: null,
  boundStyleType: {},       // { [attrKey]: 'fontColor' | 'bgColor' | 'borderColor' | 'fontFamily' | 'haloColor' | 'none' }
  styleTypeOwner: {},       // { [styleKey]: attrKey }
  styleRules: {},           // { [attrKey]: Array<{ id, type, style: {}, values: string[] }> }
  styleRowSelections: {},   // { [rowId]: string[] }
};

// —— 通用工具（可直接用，或用你的实现替换）——
export function genId() {
  return crypto.randomUUID?.() || ('r_' + Date.now() + '_' + Math.random().toString(36).slice(2));
}
export function ensureBucket(attrKey) {
  if (!stateMem.styleRules[attrKey]) stateMem.styleRules[attrKey] = [];
  return stateMem.styleRules[attrKey];
}
export function findRule(attrKey, rowId) {
  const bucket = stateMem.styleRules[attrKey] || [];
  return bucket.find(r => r.id === rowId) || null;
}
export function uiTypeToInternal(t) { return (t === 'font') ? 'fontFamily' : t; }

// —— 渲染骨架（⚠️ 先空着，等你把现有实现贴进来）——
export function renderStyleTable(attrKey) {
  const tbody = document.getElementById('styleTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  (stateMem.styleRules[attrKey] || []).forEach(rule => renderRuleRow(attrKey, rule));
}
export function renderRuleRow(attrKey, rule) {
  // TODO: 把你现有的 renderRuleRow 函数体粘过来
}
export function buildStyleControl(type) {
  // TODO: 把你现有的 buildStyleControl 函数体粘过来（已支持 9 色预设 & 调色板的那版）
  return document.createElement('div');
}
export function renderRowAttrChips(rowId, values) {
  // TODO: 把你现有的 renderRowAttrChips 粘过来
}

// —— 属性选择弹窗（骨架）——
export function openAttrPicker(rowId, attrKey) { /* TODO: 粘你的实现 */ }
export function confirmAttrPicker() { /* TODO: 粘你的实现 */ }
export function closeAttrPicker() { const m = document.getElementById('attr-picker-window'); if (m) m.style.display = 'none'; }
export function selectAllInAttrPicker() { /* TODO */ }
export function clearAttrPicker() { /* TODO */ }

// —— 其它工具（可选粘贴）——
export function readRowStyleKey(rowEl){ /* 可按需放你的实现 */ }
export function isSameSet(a=[],b=[]){ if(a.length!==b.length) return false; const sa=new Set(a), sb=new Set(b); for(const v of sa) if(!sb.has(v)) return false; return true; }
export function getTakenValues(attrKey, exceptRowId){
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

// 纯渲染：把当前筛选条件渲染到传入的容器里
export function renderFilterList(container, activeFilters, attributeLabels, onRemove) {
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

// 根据映射渲染属性下拉
export function renderAttributeSelect(selectEl, attributeLabels) {
  selectEl.innerHTML = '';
  Object.keys(attributeLabels).forEach(key => {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = attributeLabels[key];
    selectEl.appendChild(o);
  });
}

// 渲染候选项并可选地初始化 Choices（多选）
export function renderFilterOptions(selectEl, options, useChoices = false, oldChoicesInstance = null) {
  selectEl.innerHTML = '';
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    selectEl.appendChild(o);
  });
  if (!useChoices) return { choices: null };
  if (oldChoicesInstance) {
    try { oldChoicesInstance.destroy(); } catch {}
  }
  const choices = new Choices(selectEl, { removeItemButton: true, shouldSort: false });
  return { choices };
}

// 追加到 public/src/_staging/style-ui.js
export function renderSimpleOptions(selectEl, list) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  (list || []).forEach(opt => {
    const o = document.createElement('option');
    o.value = o.textContent = opt;
    selectEl.appendChild(o);
  });
}

// 把选中的属性值集合写回到行选择表：{ [rowId]: string[] }
export function setRowSelections(selMap, rowId, values) {
  selMap[rowId] = Array.isArray(values) ? values.slice() : [];
  return selMap;
}

// 纯渲染：把规则数组渲染到传入的 <tbody>
// rowRender: (attrKey, rule) => void   由调用方提供（保持你现有的 renderRuleRow 逻辑）
export function renderStyleTableBody(tbody, rules, attrKey, rowRender) {
  if (!tbody) return;
  tbody.innerHTML = '';
  (rules || []).forEach((rule) => rowRender && rowRender(attrKey, rule));
}

export function wireFontFamilyControl(containerEl, rule) {
  const sel = containerEl.querySelector('select');
  if (!sel) return;
  sel.value = rule.style.fontFamily || '';
  sel.addEventListener('change', () => {
    rule.style.fontFamily = sel.value || '';
  });
}

export function wireColorHexSync(containerEl, rule) {
  const color = containerEl.querySelector('input[type="color"]');
  const hex   = containerEl.querySelector('input[type="text"]');
  const current = (rule.style?.[rule.type]) || '#000000';
  if (color) color.value = current;
  if (hex)   hex.value   = current;

  if (color && hex) {
    color.addEventListener('input', () => {
      const v = color.value.toUpperCase();
      hex.value = v;
      rule.style[rule.type] = v;
    });
    hex.addEventListener('change', () => {
      const v = hex.value.toUpperCase();
      rule.style[rule.type] = v;
      if (color.value.toUpperCase() !== v) color.value = v;
    });
  }
}

export function renderRuleRowFragment(attrKey, rule, deps) {
  const { buildStyleControl, openAttrPicker, renderRowAttrChips, styleRulesRef } = deps;

  const tr = document.createElement('tr');
  tr.dataset.rowId = rule.id;
  tr.dataset.attrKey = attrKey;

  // 左：样式控件
  const tdContent = document.createElement('td');
  tdContent.dataset.styleType = rule.type;
  const ctrl = buildStyleControl(rule.type);
  tdContent.appendChild(ctrl);
  tr.appendChild(tdContent);

  // 控件事件接线（字体 / 颜色）
  if (rule.type === 'fontFamily') {
    wireFontFamilyControl(tdContent, rule);
  } else if (['fontColor','borderColor','backgroundColor','haloColor'].includes(rule.type)) {
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

  // 右：删除该行
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

// public/src/_staging/style-ui.js 追加 —— 备用的纯化版本（依赖注入）
export function refreshStyleTypeOptionsInSelect(selectEl, deps) {
  if (!selectEl || !selectEl.options) return;
  const {
    uiTypeToInternal,
    styleTypeOwner = {},
    currentStyleAttr = null,
    attributeLabels = {},
  } = deps || {};

  Array.from(selectEl.options).forEach(opt => {
    if (!opt.dataset.baseText) opt.dataset.baseText = opt.textContent; // 记住原始文案
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

// 仅做视图模型计算：把 attr → 标题/提示/按钮状态
export function computeStyleWindowViewModel(attr, deps = {}) {
  const {
    boundStyleType = {},         // 传入你现有的 boundStyleType
    attributeLabels = {},        // 传入 attributeLabels
    styleLabel = (k) => k,       // 传入 styleLabel 函数（可用常量里的）
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
      add:     { disabled: !hasBound ? true : false },
      typeSelDefault: 'none',
      tbodyClear: true,
      windowDisplay: 'block',
    }
  };
}

// 把视图模型应用到 DOM（纯 DOM 写入；不含任何全局变量）
export function applyStyleWindowView(rootEls, vm) {
  const {
    styleTitleEl, styleWindowEl, typeSelEl, tbodyEl, confirmBtnEl, resetBtnEl, addBtnEl, hintEl
  } = rootEls;

  if (styleTitleEl) styleTitleEl.textContent = vm.titleText;
  if (hintEl)       hintEl.textContent = vm.hintText;
  if (styleWindowEl) styleWindowEl.style.display = vm.ui.windowDisplay;

  if (typeSelEl) typeSelEl.value = vm.ui.typeSelDefault;
  if (tbodyEl && vm.ui.tbodyClear) tbodyEl.innerHTML = '';

  if (confirmBtnEl) {
    confirmBtnEl.disabled = vm.ui.confirm.disabled;
    confirmBtnEl.style.display = vm.ui.confirm.display;
  }
  if (resetBtnEl)  resetBtnEl.style.display = vm.ui.reset.display;
  if (addBtnEl)    addBtnEl.disabled = vm.ui.add.disabled;
}

// 依赖注入版：处理样式类型切换逻辑（不依赖全局，不直接 alert）
export function onStyleTypeChangeInSelect(selectEl, deps = {}) {
  if (!selectEl) return { stagedType: 'none', blockedBy: 'no-select' };

  const {
    uiTypeToInternal = (v) => v,
    boundStyleType = {},          // 全局映射：{ [attrKey]: 'fontFamily' | ... | 'none' }
    currentStyleAttr = null,      // 当前正在编辑的属性 key
    styleTypeOwner = {},          // 反向占用表：{ [styleType]: attrKey }
    attributeLabels = {},         // 中文名映射
    styleLabel = (k) => k,        // 文案函数
    confirmBtnEl = null,          // 可选：确认按钮节点
    hintEl = null,                // 可选：提示文本节点
    refreshOptions = null,        // 可选：函数 -> 刷新下拉占用状态
    notify = null,                // 可选：替代 alert 的提示函数 (msg)
  } = deps;

  const disableConfirm = (yes) => { if (confirmBtnEl) confirmBtnEl.disabled = !!yes; };
  const setHint = (txt) => { if (hintEl) hintEl.textContent = txt; };

  let mapped = uiTypeToInternal(selectEl.value) || 'none';
  let stagedType = mapped;

  // 该属性已绑定某类型 -> 未重置前禁止切换
  const already = boundStyleType[currentStyleAttr] && boundStyleType[currentStyleAttr] !== 'none';
  if (already) {
    selectEl.value = 'none';
    stagedType = 'none';
    setHint(`当前绑定：${styleLabel(boundStyleType[currentStyleAttr])}（如需更改，请先“重置”）`);
    disableConfirm(true);
    return { stagedType, blockedBy: 'self-bound' };
  }

  // 全局唯一占用检查
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

// 依赖注入版：确认绑定动作（不依赖全局，可测）
// deps 里传入你现有的运行态 & DOM 引用 & 回调
export function confirmBindAction(deps = {}) {
  const {
    stagedType = 'none',
    currentStyleAttr = null,

    boundStyleType = {},   // { [attrKey]: 'fontFamily' | ... | 'none' }
    styleTypeOwner = {},   // { [styleType]: attrKey }

    attributeLabels = {},  // 中文名映射
    styleLabel = (k) => k, // 文案函数

    // DOM（可选传）
    tbodyEl = null,
    confirmBtnEl = null,
    resetBtnEl = null,
    addBtnEl = null,
    hintEl = null,

    // 回调（可选传）
    refreshOptions = null, // -> refreshStyleTypeOptions
    addStyleRow = null,    // -> addStyleRow()
    notify = (msg) => alert(msg), // 替代 alert，可注入自定义提示
    confirmDialog = (msg) => window.confirm(msg), // 可替换为自定义弹窗
  } = deps;

  if (stagedType === 'none') {
    return { ok: false, reason: 'none' };
  }

  // 再次确认全局唯一占用（防 race）
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

    // 释放之前占用的类型
    if (styleTypeOwner[prev] === currentStyleAttr) {
      delete styleTypeOwner[prev];
    }
  }

  // 写入绑定与占用
  boundStyleType[currentStyleAttr] = stagedType;
  styleTypeOwner[stagedType] = currentStyleAttr;

  // UI 状态切换
  if (confirmBtnEl) { confirmBtnEl.disabled = true; confirmBtnEl.style.display = 'none'; }
  if (resetBtnEl)   { resetBtnEl.style.display = 'inline-block'; }
  if (addBtnEl)     { addBtnEl.disabled = false; }
  if (hintEl)       { hintEl.textContent = `当前样式：${styleLabel(stagedType)}`; }

  // 刷新下拉可用性
  if (typeof refreshOptions === 'function') refreshOptions();

  // 自动新增一行（仅 UI）
  if (typeof addStyleRow === 'function') addStyleRow();

  return { ok: true, bound: stagedType, attr: currentStyleAttr };
}

// 1) 关闭样式窗口（纯 DOM 小助手）
export function hideStyleWindow(styleWindowEl) {
  if (styleWindowEl && styleWindowEl.style) styleWindowEl.style.display = 'none';
}

// 2) 确认样式应用动作（依赖注入版）
export function confirmStyleAction(deps = {}) {
  const {
    applyCurrentStyles = () => {}, // 传入你现有的 applyCurrentStyles
    styleWindowEl = null,          // document.getElementById('style-window')
  } = deps;

  // 生成全量样式 -> 注入 CSS -> 可选持久化
  applyCurrentStyles({ persist: true });

  // 关闭窗口（若传入）
  hideStyleWindow(styleWindowEl);

  return { ok: true };
}

// 3) 重置绑定动作（依赖注入版；等同 onResetBind 的逻辑）
export function resetBindAction(deps = {}) {
  const {
    // 运行态
    currentStyleAttr = null,
    boundStyleType = {},    // { [attrKey]: 'fontFamily' | ... | 'none' }
    styleTypeOwner = {},    // { [styleType]: attrKey }
    styleRulesRef = {},     // { [attrKey]: Array<rule> }

    // DOM
    tbodyEl = null,         // #styleTableBody
    typeSelEl = null,       // #style-type
    confirmBtnEl = null,    // #style-confirm-btn
    resetBtnEl = null,      // #style-reset-btn
    addBtnEl = null,        // #add-style-btn
    hintEl = null,          // #bound-type-hint

    // 回调
    refreshOptions = null,  // refreshStyleTypeOptions
    applyCurrentStyles = () => {}, // 你现有的 applyCurrentStyles
    confirmDialog = (msg) => window.confirm(msg), // 可替换为自定义弹窗
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

  // 清空该属性规则与绑定
  boundStyleType[currentStyleAttr] = 'none';
  if (styleRulesRef[currentStyleAttr]) styleRulesRef[currentStyleAttr].length = 0;
  if (tbodyEl) tbodyEl.innerHTML = '';

  // 复位控件与提示
  if (typeSelEl) typeSelEl.value = 'none';
  if (confirmBtnEl) { confirmBtnEl.disabled = true; confirmBtnEl.style.display = 'inline-block'; }
  if (resetBtnEl)   resetBtnEl.style.display = 'none';
  if (addBtnEl)     addBtnEl.disabled = true;
  if (hintEl)       hintEl.textContent = '当前样式：无';

  // 刷新下拉可用性
  if (typeof refreshOptions === 'function') refreshOptions();

  // 立刻应用并持久化
  applyCurrentStyles({ persist: true });

  // 返回给调用方可选地同步 stagedType
  return { ok: true, stagedType: 'none' };
}

export function hideStyleWindow(styleWindowEl) {
  if (styleWindowEl && styleWindowEl.style) styleWindowEl.style.display = 'none';
}

import { getFilterOptionsForKeyFrom } from './constants.js'; // 第二遍接线时才会生效

export function buildAttrMultiSelectFor(attrKey, deps = {}) {
  const {
    options = null,                 // 相当于 allOptions
    getOptions = null,              // 可选：自定义获取器 (attrKey) => string[]
    useChoices = !!window.Choices,  // 是否启用 Choices
    choicesConfig = { removeItemButton: true, shouldSort: false, searchPlaceholderValue: '搜索…', position: 'bottom' },
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

  if (useChoices && typeof Choices === 'function') {
    sel._choices = new Choices(sel, choicesConfig);
  }

  return sel;
}

// public/src/_staging/style-ui.js
import { createEmptyRuleForType } from './constants.js';
import { ensureBucketIn } from './constants.js'; // 你已添加过；若无请一并加入 constants.js
// 或者使用你当前文件里的 stateMem 版本，第二遍时再改成 ensureBucketIn

export function addStyleRowFor(attrKey, deps = {}) {
  const {
    boundStyleType = {},    // { [attrKey]: 'fontFamily' | 'fontColor' | ... | 'none' }
    rulesMap = {},          // { [attrKey]: Array<rule> } → 相当于 styleRules
    idFactory = null,       // 可传入 genId
    renderRow = null,       // 渲染函数：renderRuleRow(attrKey, rule)
  } = deps;

  const bound = boundStyleType[attrKey];
  if (!bound || bound === 'none') {
    return { ok: false, reason: 'unbound' };
  }

  const rule = createEmptyRuleForType(bound, idFactory || (() => crypto.randomUUID?.() || `r_${Date.now()}_${Math.random().toString(36).slice(2)}`));
  const bucket = ensureBucketIn(rulesMap, attrKey);
  bucket.push(rule);

  if (typeof renderRow === 'function') {
    renderRow(attrKey, rule);
  }

  return { ok: true, rule };
}

// —— attr picker：数据准备（候选 / 预选 / 去重）——
export function buildAttrPickerModel(rowId, attrKey, deps = {}) {
  const {
    // 数据来源（任选其一或并用）
    options = null,                    // 相当于 allOptions
    getOptions = null,                 // (key) => string[]，如用 getFilterOptionsForKeyFrom
    getOptionsLegacy = null,           // (key) => string[]，如你现有 getFilterOptionsForKey
    // 行/规则访问
    findRuleInMap = null,              // (rulesMap, attrKey, rowId) => rule | null
    rulesMap = null,                   // 相当于 styleRules
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

  // 去重：排除其它行已占用，但保留本行已选
  const takenByOthers = (typeof getTakenValues === 'function')
    ? getTakenValues(attrKey, rowId)
    : new Set();

  const candidates = all.filter(v => pre.includes(v) || !takenByOthers.has(v));
  return { candidates, preselected: pre };
}

// —— attr picker：渲染 DOM（含 Choices 可选初始化）——
export function renderAttrPickerInto(root, vm, deps = {}) {
  const {
    titleEl, hintEl, attrNameEl, selectEl, modalEl
  } = root;

  const {
    attrCnName = '',          // 中文属性名
    candidates = [],          // 选项
    preselected = [],         // 预选
  } = vm;

  const {
    useChoices = !!window.Choices,
    choicesConfig = { removeItemButton: true, shouldSort: false, searchPlaceholderValue: '搜索…', position: 'bottom' }
  } = deps;

  if (titleEl) titleEl.textContent = '选择应用的属性值';
  if (hintEl)  hintEl.textContent  = `${attrCnName}：可多选，可搜索`;
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
    if (useChoices && typeof Choices === 'function') {
      selectEl._choices = new Choices(selectEl, choicesConfig);
    }
  }

  if (modalEl && modalEl.style) modalEl.style.display = 'block';
}

// —— attr picker：一站式 orchestrator（第二遍才会被接线）——
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
