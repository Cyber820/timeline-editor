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
