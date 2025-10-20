import { getFilterOptionsForKeyFrom } from '../_staging/constants.js';


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
