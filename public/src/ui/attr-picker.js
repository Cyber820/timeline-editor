// src/ui/attr-picker.js
// ✅ 职责：为样式行选择属性值（多选、可搜索）。
// 结构分层：
//   1) buildAttrPickerModel：构建候选 + 预选（纯函数，不依赖 DOM）
//   2) renderAttrPickerInto：把 VM 渲染到指定 DOM
//   3) confirmAttrPickerAction：读取选择、校验冲突、回写规则、刷新 chips
//
// 依赖 & 接线：
//   - 运行态：stateMem（rules/rowSelections）
//   - 工具：findRuleIn（constants.js）、getFilterOptionsForKeyFrom（constants.js）、getTakenValues（utils/dom.js）
//   - UI：renderRowAttrChips（style-table.js）
//   - 文案：attributeLabels（constants.js）
//   - 选择器增强：Choices（可选，无则退化）

import {
  getFilterOptionsForKeyFrom,
  findRuleIn,
  attributeLabels,
} from '../_staging/constants.js';
import { stateMem } from '../style/stateMem.js';
import { getTakenValues } from '../utils/dom.js';
import { renderRowAttrChips } from './style-table.js';

// —— 本模块内部的临时编辑态（仅用于“无依赖注入”的简易入口）——
let _editing = { rowId: null, attrKey: null };
let _choicesInstance = null;

/** ========== 纯函数：构建弹窗 VM（候选 + 预选） ========== */
/**
 * 根据当前规则与可选项，计算：
 *  - candidates：可供选择的值（排除被同属性其他行占用的值，但保留当前行已选）
 *  - preselected：当前行已有的值
 */
export function buildAttrPickerModel(rowId, attrKey, deps = {}) {
  const {
    // 所有可选项，形如 { EventType: [...], Region: [...] } 或 Map
    options = null,
    // 自定义获取器优先（提供则使用它）：(key) => string[]
    getOptions = null,
    // 旧版备用入口（可选）
    getOptionsLegacy = null,

    // 查找规则 & 规则仓库
    findRuleInMap = findRuleIn,    // (rulesMap, attrKey, rowId) => rule|null
    rulesMap = stateMem.styleRules,

    // 去重工具：排除其它行占用
    getTakenValues: getTaken = getTakenValues, // (attrKey, exceptRowId) => Set<string>
  } = deps;

  // 1) 预选值（本行已有）
  let preselected = [];
  if (typeof findRuleInMap === 'function' && rulesMap) {
    const rule = findRuleInMap(rulesMap, attrKey, rowId);
    preselected = (rule && Array.isArray(rule.values)) ? rule.values : [];
  }

  // 2) 候选全集（按优先顺序获取）
  let all = [];
  if (typeof getOptions === 'function') {
    all = getOptions(attrKey) || [];
  } else if (typeof getOptionsLegacy === 'function') {
    all = getOptionsLegacy(attrKey) || [];
  } else if (options) {
    // 若传入了 options，则使用 constants 的统一取法（兼容对象/数组）
    all = getFilterOptionsForKeyFrom(options, attrKey) || [];
  }

  // 3) 去重：排除被同属性其他行占用的值（但保留本行已选）
  const takenByOthers = (typeof getTaken === 'function')
    ? getTaken(attrKey, rowId)
    : new Set();

  const candidates = (all || []).filter(v => preselected.includes(v) || !takenByOthers.has(v));
  return { candidates, preselected };
}

/** ========== 渲染：将 VM 写入到 DOM ========== */
export function renderAttrPickerInto(root, vm, deps = {}) {
  const { titleEl, hintEl, attrNameEl, selectEl, modalEl } = root;
  const {
    attrCnName = '',
    candidates = [],
    preselected = [],
  } = vm;
  const {
    useChoices = (typeof globalThis !== 'undefined' && typeof globalThis.Choices === 'function'),
    choicesCtor = (typeof globalThis !== 'undefined' ? globalThis.Choices : undefined),
    choicesConfig = {
      removeItemButton: true,
      shouldSort: false,
      searchPlaceholderValue: '搜索…',
      position: 'bottom',
    },
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
    if (useChoices && typeof choicesCtor === 'function') {
      selectEl._choices = new choicesCtor(selectEl, choicesConfig);
    }
  }

  if (modalEl && modalEl.style) modalEl.style.display = 'block';
}

/** ========== 纯函数：读取选择（去重） ========== */
export function readUniqueSelections(selectEl) {
  if (!selectEl) return [];
  const vals = Array.from(selectEl.selectedOptions || []).map(o => o.value);
  return Array.from(new Set(vals));
}

/** ========== 动作：确认选择，写回规则并刷新 chips ========== */
export function confirmAttrPickerAction(deps = {}) {
  const {
    rowId = null,
    attrKey = null,

    // DOM
    selectEl = null,      // #attr-picker-options
    modalEl = null,       // #attr-picker-window

    // 数据 & 工具
    rulesMap = stateMem.styleRules,     // { [attrKey]: Rule[] }
    findRuleInMap = findRuleIn,         // (rulesMap, attrKey, rowId) => rule | null
    styleRowSelectionsRef = stateMem.styleRowSelections,

    getTakenValues: getTaken = getTakenValues, // (attrKey, exceptRowId) => Set<string>
    renderRowAttrChips: renderChips = renderRowAttrChips,

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
  if (typeof getTaken === 'function') {
    const takenByOthers = getTaken(attrKey, rowId);
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
  if (typeof renderChips === 'function') {
    renderChips(rowId, uniqueVals);
  }

  // 关闭弹窗
  if (modalEl && modalEl.style) modalEl.style.display = 'none';

  return { ok: true, values: uniqueVals };
}

/** ========== 辅助：全选/全不选（带 Choices 兼容） ========== */
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

export function clearAttrPickerEl(selectEl, choicesInstance = null) {
  if (!selectEl) return { ok: false, reason: 'no-select' };

  if (choicesInstance && typeof choicesInstance.removeActiveItems === 'function') {
    choicesInstance.removeActiveItems();
  }
  Array.from(selectEl.options || []).forEach(o => { o.selected = false; });

  selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true };
}

/* ========================================================================
 * 兼容入口（基于固定 DOM id 的即插即用模式） —— 方便你现阶段直接使用
 * - openAttrPicker(rowId, attrKey)：读取 #attr-picker-* 元素并弹窗
 * - confirmAttrPicker()：读取选择并写回 stateMem，再刷新 chips
 * - closeAttrPicker() / selectAllInAttrPicker() / clearAttrPicker()
 * ====================================================================== */

export function openAttrPicker(rowId, attrKey) {
  _editing = { rowId, attrKey };

  const modalEl = document.getElementById('attr-picker-window');
  const titleEl = document.getElementById('attr-picker-title');
  const hintEl  = document.getElementById('attr-picker-hint');
  const selectEl = document.getElementById('attr-picker-options');
  const attrNameEl = document.getElementById('attr-picker-attrname');

  if (!modalEl || !titleEl || !hintEl || !selectEl) return;

  const cn = (attributeLabels && attributeLabels[attrKey]) || attrKey;

  const { candidates, preselected } = buildAttrPickerModel(rowId, attrKey, {
    // 默认从全局 allOptions 兼容读取；第二轮再切到统一 options 源
    options: (typeof globalThis !== 'undefined' && globalThis.allOptions) || null,
    rulesMap: stateMem.styleRules,
    findRuleInMap: findRuleIn,
    getTakenValues: getTakenValues,
  });

  // 渲染
  renderAttrPickerInto(
    { modalEl, titleEl, hintEl, attrNameEl, selectEl },
    { attrCnName: cn, candidates, preselected },
    {
      useChoices: (typeof globalThis !== 'undefined' && typeof globalThis.Choices === 'function'),
      choicesCtor: (typeof globalThis !== 'undefined' ? globalThis.Choices : undefined),
    }
  );

  _choicesInstance = selectEl._choices || null;
}

export function confirmAttrPicker() {
  const { rowId, attrKey } = _editing || {};
  const modalEl = document.getElementById('attr-picker-window');
  const selectEl = document.getElementById('attr-picker-options');

  const ret = confirmAttrPickerAction({
    rowId, attrKey,
    selectEl, modalEl,
    rulesMap: stateMem.styleRules,
    findRuleInMap: findRuleIn,
    styleRowSelectionsRef: stateMem.styleRowSelections,
    getTakenValues: getTakenValues,
    renderRowAttrChips: renderRowAttrChips,
    notify: (msg) => alert(msg),
  });

  // 复位编辑态
  _editing = { rowId: null, attrKey: null };
  return ret;
}

export function closeAttrPicker() {
  const m = document.getElementById('attr-picker-window');
  if (m && m.style) m.style.display = 'none';
  _editing = { rowId: null, attrKey: null };
}

export function selectAllInAttrPicker() {
  const sel = document.getElementById('attr-picker-options');
  return selectAllInAttrPickerEl(sel, _choicesInstance);
}

export function clearAttrPicker() {
  const sel = document.getElementById('attr-picker-options');
  return clearAttrPickerEl(sel, _choicesInstance);
}
