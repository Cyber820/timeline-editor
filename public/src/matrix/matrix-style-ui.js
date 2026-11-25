
/**
 * public/src/matrix/matrix-style-ui.js
 *
 * 二维矩阵样式编辑 UI（未接样式引擎）
 *
 * 参照原时间轴 timeline/mount.js 中的样式编辑器。
 *
 * 当前支持：
 * - 五个样式按钮
 * - 样式类型绑定与互斥
 * - 新增、删除样式行
 * - 颜色与字体设置
 * - 属性值多选、占用检查
 * - 重置、保存、关闭
 *
 * 当前不支持：
 * - 将样式应用到矩阵事件
 * - localStorage 持久化
 * - 原时间轴 styleState 写入
 */

import { fetchAndNormalize } from '../timeline/fetch.js';

const ATTRIBUTES = [
  { key: 'EventType', label: '事件样式', name: '事件类型' },
  { key: 'Platform', label: '平台样式', name: '平台类型' },
  { key: 'ConsolePlatform', label: '主机样式', name: '主机类型' },
  { key: 'Company', label: '公司样式', name: '公司' },
  { key: 'Region', label: '地区样式', name: '地区' }
];

const STYLE_TYPES = [
  { key: 'fontColor', label: '字体颜色' },
  { key: 'backgroundColor', label: '背景颜色' },
  { key: 'borderColor', label: '边框颜色' },
  { key: 'fontFamily', label: '字体' },
  { key: 'haloColor', label: '光晕颜色' }
];

const FONTS = [
  ['', '（默认字体）'],
  ['Microsoft YaHei, PingFang SC, Noto Sans SC, system-ui',
    'Microsoft YaHei / PingFang / Noto Sans SC'],
  ['SimHei', 'SimHei'],
  ['SimSun', 'SimSun'],
  ['KaiTi', 'KaiTi'],
  ['LiSu', 'LiSu'],
  ['YouYuan', 'YouYuan'],
  ['STCaiyun', 'STCaiyun'],
  ['FZShuTi', 'FZShuTi']
];

// UI 本地状态；不与原 styleState 连接。
const uiState = {
  boundTypes: {},
  rules: {}
};

let currentAttribute = null;
let eventsCache = null;
let eventsPromise = null;
let initialized = false;
let dialog = null;
let previousFocus = null;

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function button(text, handler, className = '') {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', handler);
  return node;
}

function getAttribute(key) {
  return ATTRIBUTES.find(item => item.key === key);
}

function getType(key) {
  return STYLE_TYPES.find(item => item.key === key);
}

function getBoundType(key) {
  return uiState.boundTypes[key] || null;
}

function getRules(key) {
  if (!uiState.rules[key]) uiState.rules[key] = [];
  return uiState.rules[key];
}

function getOwner(type) {
  return Object.keys(uiState.boundTypes).find(
    key => uiState.boundTypes[key] === type
  );
}

function createRule(type) {
  return {
    id: 'rule_' + Math.random().toString(36).slice(2, 10),
    type,
    style: type === 'fontFamily'
      ? { fontFamily: '' }
      : { [type]: '#000000' },
    values: []
  };
}

function normalizeHex(input) {
  let value = String(input || '').trim();

  if (!value) return null;
  if (!value.startsWith('#')) value = '#' + value;

  if (/^#[0-9a-f]{3}$/i.test(value)) {
    value = '#' + [...value.slice(1)]
      .map(char => char + char).join('');
  }

  return /^#[0-9a-f]{6}$/i.test(value)
    ? value.toUpperCase()
    : null;
}

function splitValues(value) {
  if (Array.isArray(value)) {
    return value.flatMap(splitValues);
  }

  return String(value ?? '')
    .split(/[,，;；]/)
    .map(x => x.trim())
    .filter(Boolean);
}

/**
 * 读取真实候选属性值。
 *
 * 首次打开样式窗口时才读取。
 * 使用现有矩阵接口，不修改数据。
 *
 * @returns {Promise<Array<object>>}
 */
async function getEvents() {
  if (eventsCache) return eventsCache;
  if (eventsPromise) return eventsPromise;

  eventsPromise = fetchAndNormalize()
    .then(items => {
      if (!Array.isArray(items)) {
        throw new Error('事件接口未返回数组');
      }
      eventsCache = items;
      return items;
    })
    .finally(() => {
      eventsPromise = null;
    });

  return eventsPromise;
}

function collectOptions(key) {
  const result = new Set();

  for (const event of eventsCache || []) {
    for (const value of splitValues(event[key])) {
      result.add(value);
    }
  }

  // 同时保留已在 UI 中选择的值。
  for (const rule of getRules(key)) {
    for (const value of rule.values) {
      result.add(value);
    }
  }

  return [...result].sort((a, b) =>
    a.localeCompare(b, 'zh-CN')
  );
}

function createStyleControl(rule) {
  const wrap = el('div', 'mx-style-control');

  if (rule.type === 'fontFamily') {
    const select = el('select', 'mx-style-input');

    for (const [value, label] of FONTS) {
      const option = new Option(label, value);
      select.add(option);
    }

    select.value = rule.style.fontFamily || '';
    select.addEventListener('change', () => {
      rule.style.fontFamily = select.value;
    });

    wrap.appendChild(select);
    return wrap;
  }

  const color = el('input', 'mx-style-color');
  color.type = 'color';

  const hex = el('input', 'mx-style-hex');
  hex.type = 'text';
  hex.placeholder = '#RRGGBB';

  const initial = normalizeHex(rule.style[rule.type])
    || '#000000';

  color.value = initial;
  hex.value = initial;

  color.addEventListener('input', () => {
    hex.value = color.value.toUpperCase();
    rule.style[rule.type] = hex.value;
  });

  hex.addEventListener('change', () => {
    const valid = normalizeHex(hex.value);

    if (!valid) {
      hex.value = color.value.toUpperCase();
      return;
    }

    color.value = valid;
    hex.value = valid;
    rule.style[rule.type] = valid;
  });

  wrap.append(color, hex);
  return wrap;
}

function createValueChips(rule) {
  const chips = el('div', 'mx-style-chips');

  if (!rule.values.length) {
    chips.appendChild(el('span', 'mx-style-muted', '（空）'));
    return chips;
  }

  for (const value of rule.values) {
    chips.appendChild(
      el('span', 'mx-style-chip', value)
    );
  }

  return chips;
}

/**
 * 打开属性值多选对话框。
 *
 * 其他规则已经占用的值不能再次选择。
 *
 * @param {string} attributeKey
 * @param {object} rule
 */
function openValuePicker(attributeKey, rule) {
  const overlay = el('div', 'mx-style-picker-overlay');
  const panel = el('div', 'mx-style-picker');

  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', '选择属性值');

  panel.appendChild(
    el('h3', '', '选择属性值')
  );

  const search = el('input', 'mx-style-input');
  search.type = 'search';
  search.placeholder = '输入关键字检索';
  panel.appendChild(search);

  const grid = el('div', 'mx-style-value-grid');
  panel.appendChild(grid);

  const selected = new Set(rule.values);

  const taken = new Set(
    getRules(attributeKey)
      .filter(other => other.id !== rule.id)
      .flatMap(other => other.values)
  );

  const allOptions = collectOptions(attributeKey);

  function renderOptions() {
    grid.replaceChildren();

    const keyword = search.value.trim().toLowerCase();

    const visible = allOptions.filter(value =>
      value.toLowerCase().includes(keyword)
    );

    if (!visible.length) {
      grid.appendChild(
        el('p', 'mx-style-muted', '没有符合条件的属性值')
      );
      return;
    }

    for (const value of visible) {
      const label = el('label', 'mx-style-value-item');
      const checkbox = el('input');

      checkbox.type = 'checkbox';
      checkbox.checked = selected.has(value);
      checkbox.disabled = taken.has(value);

      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(value);
        else selected.delete(value);
      });

      const text = el(
        'span',
        '',
        taken.has(value)
          ? `${value}（已被占用）`
          : value
      );

      if (taken.has(value)) {
        label.classList.add('is-taken');
      }

      label.append(checkbox, text);
      grid.appendChild(label);
    }
  }

  function close() {
    overlay.remove();
  }

  const footer = el('div', 'mx-style-picker-footer');

  footer.append(
    button('取消', close),
    button('确定', () => {
      const conflict = [...selected].find(x => taken.has(x));

      if (conflict) {
        alert(`“${conflict}”已被同属性的其他样式行占用。`);
        return;
      }

      rule.values = [...selected];
      close();
      renderEditor();
    }, 'mx-style-primary')
  );

  panel.appendChild(footer);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', event => {
    if (event.target === overlay) close();
  });

  search.addEventListener('input', renderOptions);

  renderOptions();
  search.focus();
}

function renderRules(attributeKey, tbody) {
  tbody.replaceChildren();

  for (const rule of getRules(attributeKey)) {
    const tr = el('tr');

    const tdStyle = el('td');
    tdStyle.appendChild(createStyleControl(rule));

    const tdValues = el('td');
    tdValues.appendChild(createValueChips(rule));

    tdValues.appendChild(
      button('添加/修改属性', () =>
        openValuePicker(attributeKey, rule)
      )
    );

    const tdAction = el('td');

    const remove = button('×', () => {
      const rules = getRules(attributeKey);
      const index = rules.findIndex(r => r.id === rule.id);

      if (index !== -1) rules.splice(index, 1);
      renderEditor();
    });

    remove.title = '删除该样式行';
    tdAction.appendChild(remove);

    tr.append(tdStyle, tdValues, tdAction);
    tbody.appendChild(tr);
  }
}

/**
 * 重新渲染当前样式编辑窗口。
 * 不应用任何样式到事件卡片。
 */
function renderEditor() {
  if (!dialog || !currentAttribute) return;

  const attr = getAttribute(currentAttribute);
  const bound = getBoundType(currentAttribute);

  dialog.querySelector('[data-role="title"]').textContent =
    `${attr.name} 样式`;

  const hint = dialog.querySelector('[data-role="hint"]');

  hint.textContent = bound
    ? `当前样式：${getType(bound).label}`
    : '当前样式：无';

  const select = dialog.querySelector('[data-role="type"]');
  const confirm = dialog.querySelector('[data-role="confirm"]');
  const reset = dialog.querySelector('[data-role="reset"]');
  const add = dialog.querySelector('[data-role="add"]');

  select.replaceChildren(new Option('（未选择）', 'none'));

  for (const type of STYLE_TYPES) {
    const owner = getOwner(type.key);

    const label = owner && owner !== currentAttribute
      ? `${type.label}（${getAttribute(owner).name}）`
      : type.label;

    const option = new Option(label, type.key);
    option.disabled = !!(owner && owner !== currentAttribute);
    select.add(option);
  }

  select.value = 'none';
  select.disabled = !!bound;

  confirm.disabled = true;

  reset.hidden = !bound;
  add.disabled = !bound;

  const tbody = dialog.querySelector('tbody');
  renderRules(currentAttribute, tbody);
}

function closeEditor() {
  if (!dialog) return;

  dialog.hidden = true;
  currentAttribute = null;

  document.body.classList.remove('mx-style-dialog-open');
  previousFocus?.focus?.();
}

/**
 * 打开指定属性的样式编辑窗口。
 *
 * @param {string} attributeKey
 */
async function openEditor(attributeKey) {
  if (!getAttribute(attributeKey)) return;

  currentAttribute = attributeKey;
  previousFocus = document.activeElement;

  dialog.hidden = false;
  document.body.classList.add('mx-style-dialog-open');

  renderEditor();

  const hint = dialog.querySelector('[data-role="loading"]');

  if (!eventsCache) {
    hint.textContent = '正在读取属性候选项……';

    try {
      await getEvents();
      hint.textContent = '';
    } catch (error) {
      console.error('[matrix-style-ui]', error);
      hint.textContent =
        '候选项读取失败，请检查数据接口后重新打开。';
    }
  } else {
    hint.textContent = '';
  }

  if (currentAttribute === attributeKey && !dialog.hidden) {
    renderEditor();
  }

  dialog.querySelector('[data-role="close"]').focus();
}

/**
 * 创建共用的样式窗口。
 * 五个按钮分别打开自己的属性状态。
 */
function createDialog() {
  const overlay = el('div', 'mx-style-overlay');
  overlay.hidden = true;

  overlay.innerHTML = `
    <div class="mx-style-backdrop" data-role="backdrop"></div>
    <div class="mx-style-panel"
         role="dialog"
         aria-modal="true"
         aria-labelledby="mx-style-dialog-title">

      <header class="mx-style-panel-header">
        <div>
          <h2 id="mx-style-dialog-title"
              data-role="title">样式设置</h2>
          <p data-role="hint"
             class="mx-style-muted">当前样式：无</p>
        </div>
        <button type="button"
                data-role="close"
                class="mx-style-close"
                aria-label="关闭">×</button>
      </header>

      <section class="mx-style-panel-body">
        <div class="mx-style-actions">
          <label for="mx-style-type">样式类型：</label>
          <select id="mx-style-type"
                  data-role="type"></select>

          <button type="button"
                  data-role="confirm"
                  disabled>确认绑定</button>

          <button type="button"
                  data-role="reset"
                  hidden>重置</button>

          <button type="button"
                  data-role="add"
                  disabled>新增样式行</button>
        </div>

        <p data-role="loading"
           class="mx-style-muted"></p>

        <div class="mx-style-table-scroll">
          <table class="mx-style-table">
            <thead>
              <tr>
                <th>样式</th>
                <th>作用属性值</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </section>

      <footer class="mx-style-panel-footer">
        <span class="mx-style-muted">
          当前为UI测试阶段，尚不改变事件显示。
        </span>
        <button type="button"
                data-role="save"
                class="mx-style-primary">保存并应用</button>
      </footer>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('[data-role="close"]')
    .addEventListener('click', closeEditor);

  overlay.querySelector('[data-role="backdrop"]')
    .addEventListener('click', closeEditor);

  overlay.querySelector('[data-role="type"]')
    .addEventListener('change', event => {
      const type = event.target.value;
      const confirm = overlay.querySelector(
        '[data-role="confirm"]'
      );

      confirm.disabled =
        type === 'none' ||
        !!getBoundType(currentAttribute) ||
        !!getOwner(type);
    });

  overlay.querySelector('[data-role="confirm"]')
    .addEventListener('click', () => {
      const select = overlay.querySelector('[data-role="type"]');
      const type = select.value;

      if (
        !currentAttribute ||
        type === 'none' ||
        getBoundType(currentAttribute) ||
        getOwner(type)
      ) return;

      uiState.boundTypes[currentAttribute] = type;

      getRules(currentAttribute).push(createRule(type));
      renderEditor();
    });

  overlay.querySelector('[data-role="reset"]')
    .addEventListener('click', () => {
      if (!currentAttribute) return;

      if (
        getRules(currentAttribute).length &&
        !confirm('重置将清空该属性下所有样式行，是否继续？')
      ) return;

      delete uiState.boundTypes[currentAttribute];
      uiState.rules[currentAttribute] = [];

      renderEditor();
    });

  overlay.querySelector('[data-role="add"]')
    .addEventListener('click', () => {
      const type = getBoundType(currentAttribute);

      if (!type) {
        alert('请先绑定样式类型');
        return;
      }

      getRules(currentAttribute).push(createRule(type));
      renderEditor();
    });

  overlay.querySelector('[data-role="save"]')
    .addEventListener('click', () => {
      // UI-only：保留内存状态，关闭窗口。
      // 不调用 applyStyleState() 或 setStyleState()。
      closeEditor();
    });

  document.addEventListener('keydown', event => {
    if (overlay.hidden) return;

    if (event.key === 'Escape') {
      // 属性值选择弹窗在上层时由其自身关闭。
      if (document.querySelector('.mx-style-picker-overlay')) {
        return;
      }
      closeEditor();
    }
  });

  return overlay;
}

/**
 * 初始化五个样式按钮。
 *
 * 将按钮插在原过滤按钮右侧。
 * 不修改原过滤UI模块。
 *
 * @returns {void}
 */
export function initMatrixStyleUI() {
  if (initialized) return;

  const filterButton = document.querySelector(
    '[data-role="filter-toggle"]'
  );

  if (!filterButton) {
    console.warn(
      '[matrix-style-ui] Filter button not found.'
    );
    return;
  }

  initialized = true;
  dialog = createDialog();

  const fragment = document.createDocumentFragment();

  for (const attr of ATTRIBUTES) {
    const btn = button(
      attr.label,
      () => openEditor(attr.key),
      'mx-style-trigger'
    );

    btn.dataset.styleAttribute = attr.key;
    fragment.appendChild(btn);
  }

  filterButton.after(fragment);
}

// 现有 matrix.js 会先初始化过滤按钮。
// 若模块执行顺序不同，则等待过滤按钮出现。
function start() {
  if (document.querySelector('[data-role="filter-toggle"]')) {
    initMatrixStyleUI();
    return;
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector('[data-role="filter-toggle"]')) {
      observer.disconnect();
      initMatrixStyleUI();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, {
    once: true
  });
} else {
  start();
}
