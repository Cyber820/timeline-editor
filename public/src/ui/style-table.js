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

export function setRowSelections(selMap, rowId, values) {
  selMap[rowId] = Array.isArray(values) ? values.slice() : [];
  return selMap;
}


export function renderStyleTableBody(tbody, rules, attrKey, rowRender) {
  if (!tbody) return;
  tbody.innerHTML = '';
  (Array.isArray(rules) ? rules : []).forEach(rule => rowRender && rowRender(attrKey, rule));
}

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

