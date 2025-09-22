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

