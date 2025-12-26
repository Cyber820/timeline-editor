// src/ui/filter-ui.js
// ✅ 职责：过滤器 UI 渲染（轻逻辑，无业务耦合）

import { t } from '../ui-text/index.js';

/**
 * ⭐ 当前允许出现在「过滤属性」下拉框中的字段：
 *   - EventType        事件类型
 *   - Region          地区
 *   - Platform        平台类型
 *   - Company         公司
 *   - ConsolePlatform 主机类型
 *   - Importance      重要性
 */
const FILTERABLE_KEYS = [
  'EventType',
  'Region',
  'Platform',
  'Company',
  'ConsolePlatform',
  'Importance',
];

export function renderFilterList(
  container,
  activeFilters,
  attributeLabels,
  onRemove,
  opts = {}
) {
  if (!container) return;
  container.innerHTML = '';

  const { perValueRemove = false } = opts;
  const entries = Object.entries(activeFilters || {});
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:#999;font-size:12px;';
    empty.textContent = t('filter.list.empty'); // ✅
    container.appendChild(empty);
    return;
  }

  for (const [key, values] of entries) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin:4px 0;';

    const label = document.createElement('strong');
    label.textContent = `${(attributeLabels && attributeLabels[key]) || key}: `;
    wrap.appendChild(label);

    if (perValueRemove) {
      (values || []).forEach((val) => {
        const chip = document.createElement('span');
        chip.style.cssText =
          'display:inline-flex;align-items:center;margin:2px 6px 2px 0;padding:2px 6px;border:1px solid #ccc;border-radius:10px;font-size:12px;';
        const txt = document.createElement('span');
        txt.textContent = val;
        chip.appendChild(txt);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = t('filter.list.removeOneTitle'); // ✅
        btn.textContent = '×';
        btn.style.cssText = 'margin-left:6px;cursor:pointer;';
        btn.onclick = () => onRemove && onRemove(key, val);
        chip.appendChild(btn);

        wrap.appendChild(chip);
      });

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.title = t('filter.list.clearGroupTitle'); // ✅
      clearBtn.textContent = t('filter.list.clearGroup'); // ✅
      clearBtn.style.cssText = 'margin-left:8px;';
      clearBtn.onclick = () => onRemove && onRemove(key);
      wrap.appendChild(clearBtn);
    } else {
      const text = document.createElement('span');
      text.textContent = (values || []).join(', ');
      wrap.appendChild(text);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = t('filter.list.removeGroupTitle'); // ✅
      btn.textContent = '❌';
      btn.style.cssText = 'margin-left:8px;';
      btn.onclick = () => onRemove && onRemove(key);
      wrap.appendChild(btn);
    }

    container.appendChild(wrap);
  }
}

export function renderAttributeSelect(selectEl, attributeLabels, opts = {}) {
  if (!selectEl) return;

  const {
    includePlaceholder = true,
    placeholderText = t('filter.attrSelect.placeholder'), // ✅
    orderKeys,
  } = opts;

  selectEl.innerHTML = '';

  const allKeys = Object.keys(attributeLabels || {});
  const allowedExistingKeys = FILTERABLE_KEYS.filter((k) => allKeys.includes(k));

  const keys =
    orderKeys && orderKeys.length
      ? orderKeys.filter((k) => allowedExistingKeys.includes(k))
      : allowedExistingKeys.sort((a, b) =>
          String(attributeLabels[a]).localeCompare(String(attributeLabels[b]))
        );

  if (includePlaceholder) {
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = placeholderText;
    ph.disabled = true;
    ph.selected = true;
    selectEl.appendChild(ph);
  }

  keys.forEach((key) => {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = attributeLabels[key];
    selectEl.appendChild(o);
  });
}

export function renderFilterOptions(selectEl, options, deps = {}) {
  if (!selectEl) return { choices: null };

  const {
    useChoices = (typeof globalThis !== 'undefined' && typeof globalThis.Choices === 'function'),
    choicesCtor = (typeof globalThis !== 'undefined' ? globalThis.Choices : undefined),
    choicesConfig = { removeItemButton: true, shouldSort: false },
    oldChoicesInstance = null,
    placeholderWhenEmpty = t('filter.options.emptyOrLoading'), // ✅
    disableWhenEmpty = false,
  } = deps;

  if (oldChoicesInstance && typeof oldChoicesInstance.destroy === 'function') {
    try { oldChoicesInstance.destroy(); } catch {}
  }
  if (selectEl._choices && typeof selectEl._choices.destroy === 'function') {
    try { selectEl._choices.destroy(); } catch {}
    selectEl._choices = null;
  }

  selectEl.innerHTML = '';
  const list = Array.isArray(options) ? options : [];

  if (!list.length) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = placeholderWhenEmpty;
    o.disabled = true;
    selectEl.appendChild(o);
    if (disableWhenEmpty) selectEl.disabled = true;
  } else {
    selectEl.disabled = false;
    list.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      selectEl.appendChild(o);
    });
  }

  if (!useChoices || typeof choicesCtor !== 'function') {
    return { choices: null };
  }

  const choices = new choicesCtor(selectEl, choicesConfig);
  selectEl._choices = choices;
  return { choices };
}

export function readSelectedOptions(selectEl) {
  if (!selectEl) return [];
  const vals = Array.from(selectEl.selectedOptions || []).map((o) => o.value);
  return Array.from(new Set(vals)).filter(Boolean);
}

export function syncChoicesSelection(selectEl, choicesInstance, values = []) {
  if (!selectEl) return;

  const want = Array.from(new Set(values)).filter(Boolean);

  Array.from(selectEl.options || []).forEach((o) => {
    o.selected = want.includes(o.value);
  });

  if (choicesInstance) {
    if (typeof choicesInstance.removeActiveItems === 'function') {
      choicesInstance.removeActiveItems();
    }
    if (want.length) {
      if (typeof choicesInstance.setChoiceByValue === 'function') {
        choicesInstance.setChoiceByValue(want);
      } else if (typeof choicesInstance.setValue === 'function') {
        choicesInstance.setValue(want);
      }
    }
  }

  selectEl.dispatchEvent(new Event('change', { bubbles: true }));
}
