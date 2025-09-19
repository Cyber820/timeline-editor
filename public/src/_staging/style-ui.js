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

