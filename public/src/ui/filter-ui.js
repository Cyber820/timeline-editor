// src/ui/filter-ui.js
// ✅ 职责：过滤器 UI 渲染（轻逻辑，无业务耦合）
// - renderFilterList(container, activeFilters, attributeLabels, onRemove, opts)
// - renderAttributeSelect(selectEl, attributeLabels, opts)
// - renderFilterOptions(selectEl, options, deps)
// - 工具：readSelectedOptions / syncChoicesSelection
//
// 说明：
// - 依赖 Choices.js 为可选；未加载时自动退化为原生 <select multiple>。
// - 文本使用 textContent，避免 XSS；不引入 escapeHtml。

/**
 * ⭐ 当前允许出现在「过滤属性」下拉框中的字段：
 *   - EventType        事件类型
 *   - Region          地区
 *   - Platform        平台类型
 *   - Company         公司
 *   - ConsolePlatform 主机类型
 *   - Importance      重要性
 *
 * 说明：
 * - 即使 attributeLabels 中仍然有 Tag / Status 等，这里也会自动忽略它们；
 * - 确保不会再出现「标签」；
 * - Importance 只要在 attributeLabels 中有条目，就会出现在属性列表里。
 */
const FILTERABLE_KEYS = [
  'EventType',
  'Region',
  'Platform',
  'Company',
  'ConsolePlatform',
  'Importance',
];

/**
 * 渲染“已激活过滤条件”列表。
 * @param {HTMLElement} container
 * @param {Record<string,string[]>} activeFilters 例：{ Region:['日本','北美'] }
 * @param {Record<string,string>} attributeLabels 例：{ Region:'地区', ... }
 * @param {(key:string, value?:string)=>void} onRemove
 * @param {{ perValueRemove?: boolean }} [opts]
 *        perValueRemove=true 时，渲染成逐值 chips，可单独移除某个值；否则整组移除。
 */
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
    empty.textContent = '（暂无过滤条件）';
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
      // 逐值 chips，可单独移除某个值
      (values || []).forEach((val) => {
        const chip = document.createElement('span');
        chip.style.cssText =
          'display:inline-flex;align-items:center;margin:2px 6px 2px 0;padding:2px 6px;border:1px solid #ccc;border-radius:10px;font-size:12px;';
        const txt = document.createElement('span');
        txt.textContent = val;
        chip.appendChild(txt);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = '移除此项';
        btn.textContent = '×';
        btn.style.cssText = 'margin-left:6px;cursor:pointer;';
        btn.onclick = () => onRemove && onRemove(key, val);
        chip.appendChild(btn);

        wrap.appendChild(chip);
      });

      // 组级清空
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.title = '清空该组';
      clearBtn.textContent = '清空';
      clearBtn.style.cssText = 'margin-left:8px;';
      clearBtn.onclick = () => onRemove && onRemove(key);
      wrap.appendChild(clearBtn);
    } else {
      // 保持原行为：一键移除该属性下所有值
      const text = document.createElement('span');
      text.textContent = (values || []).join(', ');
      wrap.appendChild(text);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = '移除该属性的过滤';
      btn.textContent = '❌';
      btn.style.cssText = 'margin-left:8px;';
      btn.onclick = () => onRemove && onRemove(key);
      wrap.appendChild(btn);
    }

    container.appendChild(wrap);
  }
}

/**
 * 渲染“属性选择”下拉列表。
 * @param {HTMLSelectElement} selectEl
 * @param {Record<string,string>} attributeLabels
 * @param {{ includePlaceholder?: boolean, placeholderText?: string, orderKeys?: string[] }} [opts]
 *        - orderKeys 指定顺序；未提供则按 label 升序
 *
 * ⭐ 变更点：
 *   - 使用 FILTERABLE_KEYS 白名单，只展示 EventType / Region / Platform /
 *     Company / ConsolePlatform / Importance；
 *   - 即便 attributeLabels 里有 Tag，也不会出现在下拉里；
 *   - Importance 只要存在于 attributeLabels，即可正常展示。
 */
export function renderAttributeSelect(selectEl, attributeLabels, opts = {}) {
  if (!selectEl) return;
  const { includePlaceholder = true, placeholderText = '选择属性', orderKeys } = opts;

  selectEl.innerHTML = '';

  // 先从 attributeLabels 中取出“存在的键”，再与 FILTERABLE_KEYS 求交集
  const allKeys = Object.keys(attributeLabels || {});
  const allowedExistingKeys = FILTERABLE_KEYS.filter((k) => allKeys.includes(k));

  // 如果调用方提供了 orderKeys，则在这个基础上再次过滤
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

/**
 * 渲染“某属性的可选值”列表到 <select multiple>
 * - 自动清理旧 Choices 实例
 * - options 为空时提供占位提示并可禁用
 * @param {HTMLSelectElement} selectEl
 * @param {string[]} options
 * @param {{
 *   useChoices?: boolean,
 *   choicesCtor?: Function,            // 默认取 globalThis.Choices
 *   choicesConfig?: Object,
 *   oldChoicesInstance?: any,
 *   placeholderWhenEmpty?: string,
 *   disableWhenEmpty?: boolean
 * }} deps
 * @returns {{ choices: any }}
 */
export function renderFilterOptions(selectEl, options, deps = {}) {
  if (!selectEl) return { choices: null };

  const {
    useChoices = (typeof globalThis !== 'undefined' && typeof globalThis.Choices === 'function'),
    choicesCtor = (typeof globalThis !== 'undefined' ? globalThis.Choices : undefined),
    choicesConfig = { removeItemButton: true, shouldSort: false },
    oldChoicesInstance = null,
    placeholderWhenEmpty = '（暂无可选项 / 仍在加载）',
    disableWhenEmpty = false,
  } = deps;

  // 清理旧实例
  if (oldChoicesInstance && typeof oldChoicesInstance.destroy === 'function') {
    try { oldChoicesInstance.destroy(); } catch {}
  }
  if (selectEl._choices && typeof selectEl._choices.destroy === 'function') {
    try { selectEl._choices.destroy(); } catch {}
    selectEl._choices = null;
  }

  // 写入新选项
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

/** 读取 <select multiple> 的唯一选中值数组 */
export function readSelectedOptions(selectEl) {
  if (!selectEl) return [];
  const vals = Array.from(selectEl.selectedOptions || []).map((o) => o.value);
  return Array.from(new Set(vals)).filter(Boolean);
}

/**
 * 将给定 values 同步到 select/Choices
 * @param {HTMLSelectElement} selectEl
 * @param {any} choicesInstance 由 renderFilterOptions 返回
 * @param {string[]} values
 */
export function syncChoicesSelection(selectEl, choicesInstance, values = []) {
  if (!selectEl) return;

  const want = Array.from(new Set(values)).filter(Boolean);

  // 同步底层 option
  Array.from(selectEl.options || []).forEach((o) => {
    o.selected = want.includes(o.value);
  });

  // 同步 Choices token
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

  // 触发 change 供外层监听
  selectEl.dispatchEvent(new Event('change', { bubbles: true }));
}
