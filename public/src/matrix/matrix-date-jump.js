
/**
 * 文件路径：public/src/matrix/matrix-date-jump.js
 *
 * 功能：
 * - 在矩阵工具栏中增加“日期跳转”按钮
 * - 提供月份、日期选择面板
 * - 支持每月00日（日期未知）
 * - 支持全部378个日期坐标
 * - 将目标日期列定位到可视区域中央
 * - 高亮对应日期表头
 *
 * 依赖：
 * - ./matrix-data.js
 * - ./matrix-date-jump.css
 *
 * 不依赖事件是否存在。
 * 不修改过滤状态、样式状态或年份位置。
 */

import {
  getDayIndex,
  getDaysInMonth
} from './matrix-data.js';

// ============================================================================
// 1. 模块状态
// ============================================================================

let initialized = false;
let jumpButton = null;
let jumpPanel = null;
let monthSelect = null;
let daySelect = null;
let feedback = null;

// ============================================================================
// 2. DOM辅助函数
// ============================================================================

function createElement(tag, className = '', text = '') {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text !== '') {
    node.textContent = text;
  }

  return node;
}

function createButton(text, className = '') {
  const node = createElement('button', className, text);

  node.type = 'button';

  return node;
}

// ============================================================================
// 3. 日期选择
// ============================================================================

/**
 * 更新日期下拉框。
 *
 * 采用闰年2000年作为固定日期轴参考，
 * 与matrix-data.js的378列定义保持一致。
 *
 * 因此2月29日始终是可选坐标。
 *
 * @param {number} month
 * @returns {void}
 */
function updateDayOptions(month) {
  const previous = daySelect.value;
  const maxDay = getDaysInMonth(2000, month);

  daySelect.replaceChildren();

  daySelect.add(
    new Option(
      '00日（日期未知）',
      '0'
    )
  );

  for (let day = 1; day <= maxDay; day++) {
    daySelect.add(
      new Option(`${day}日`, String(day))
    );
  }

  const previousNumber = Number(previous);

  daySelect.value =
    Number.isInteger(previousNumber) &&
    previousNumber >= 0 &&
    previousNumber <= maxDay
      ? String(previousNumber)
      : '0';
}

/**
 * 以YYYY-MM-DD格式表达当前选择。
 *
 * YYYY仅作为坐标占位，并不用于跳转年份。
 *
 * @param {number} month
 * @param {number} day
 * @returns {string}
 */
function formatCoordinate(month, day) {
  return (
    String(month).padStart(2, '0') +
    '-' +
    String(day).padStart(2, '0')
  );
}

// ============================================================================
// 4. 面板显示与关闭
// ============================================================================

function openPanel() {
  if (!jumpPanel) return;

  jumpPanel.hidden = false;
  jumpButton.setAttribute('aria-expanded', 'true');

  monthSelect.focus();
}

function closePanel() {
  if (!jumpPanel) return;

  jumpPanel.hidden = true;
  jumpButton.setAttribute('aria-expanded', 'false');
}

function togglePanel() {
  if (jumpPanel.hidden) {
    openPanel();
  } else {
    closePanel();
  }
}

// ============================================================================
// 5. 日期坐标定位
// ============================================================================

/**
 * 根据月份和日期跳转到矩阵指定列。
 *
 * 不检索事件。
 * 即使目标单元格没有事件，也可以跳转。
 *
 * @param {number} month - 1至12
 * @param {number} day - 0至该月最大日
 * @returns {boolean} 是否定位成功
 */
export function jumpToMatrixDate(month, day) {
  const index = getDayIndex(month, day);

  if (index < 0) {
    console.warn(
      '[matrix-date-jump] Invalid date:',
      month,
      day
    );

    return false;
  }

  const scroll = document.getElementById('matrix');

  if (!scroll) {
    console.warn(
      '[matrix-date-jump] Matrix container not found.'
    );

    return false;
  }

  const grid = scroll.querySelector('.matrix-grid');

  if (!grid) {
    console.warn(
      '[matrix-date-jump] Matrix grid is not ready.'
    );

    return false;
  }

  const headerRow = grid.querySelector(
    '.matrix-header-row'
  );

  if (!headerRow) {
    return false;
  }

  // 第一格是左上角的年份/日期标签。
  // 第index+1格才是真正的日期标题。
  const target = headerRow.children.item(index + 1);

  if (
    !target ||
    !target.classList.contains('matrix-day-header')
  ) {
    console.error(
      '[matrix-date-jump] Date column missing:',
      index
    );

    return false;
  }

  const corner = headerRow.querySelector(
    '.matrix-corner'
  );

  // --------------------------------------------------------------------------
  // 计算横向滚动目标
  //
  // 不采用固定220px乘以列号。
  //
  // 使用真实DOM尺寸，可以在后续矩阵缩放
  // 功能上线后继续正常定位。
  //
  // 目标是将日期列放在年份固定栏右侧
  // 可视区域的水平中央。
  // --------------------------------------------------------------------------

  const scrollRect = scroll.getBoundingClientRect();

  const targetRect = target.getBoundingClientRect();

  const cornerWidth = corner
    ? corner.getBoundingClientRect().width
    : 0;

  const targetCenter =
    targetRect.left + targetRect.width / 2;

  const visibleCenter =
    scrollRect.left +
    cornerWidth +
    (scroll.clientWidth - cornerWidth) / 2;

  const desiredScrollLeft =
    scroll.scrollLeft +
    targetCenter -
    visibleCenter;

  // 只改变横向位置。
  // 不调用scrollIntoView()，避免纵向滚动。
  scroll.scrollLeft = Math.max(
    0,
    desiredScrollLeft
  );

  // --------------------------------------------------------------------------
  // 高亮目标日期表头
  //
  // 仅作用于标题栏。
  // 不改变事件卡片，也不修改样式引擎。
  // --------------------------------------------------------------------------

  headerRow
    .querySelectorAll('.mx-jump-target')
    .forEach(node => {
      node.classList.remove('mx-jump-target');
    });

  target.classList.add('mx-jump-target');

  // 保存当前坐标，供后续截图及缩放模块使用。
  scroll.dataset.jumpMonth = String(month);
  scroll.dataset.jumpDay = String(day);
  scroll.dataset.jumpIndex = String(index);

  console.info(
    '[matrix-date-jump] Located:',
    formatCoordinate(month, day),
    'column:',
    index
  );

  return true;
}

// ============================================================================
// 6. 创建日期跳转面板
// ============================================================================

function createJumpPanel() {
  const panel = createElement(
    'div',
    'mx-jump-panel'
  );

  panel.hidden = true;

  panel.id = 'matrix-date-jump-panel';

  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', '日期跳转设置');

  const heading = createElement(
    'div',
    'mx-jump-heading',
    '跳转到日期'
  );

  const hint = createElement(
    'p',
    'mx-jump-hint',
    '可跳转到没有事件的日期。00日表示该月日期未知。'
  );

  const fields = createElement(
    'div',
    'mx-jump-fields'
  );

  // 月份
  const monthField = createElement(
    'label',
    'mx-jump-field'
  );

  monthField.appendChild(
    createElement('span', '', '月份')
  );

  monthSelect = createElement(
    'select',
    'mx-jump-select'
  );

  monthSelect.setAttribute(
    'aria-label',
    '选择月份'
  );

  for (let month = 1; month <= 12; month++) {
    monthSelect.add(
      new Option(`${month}月`, String(month))
    );
  }

  monthSelect.value = '1';

  monthField.appendChild(monthSelect);

  // 日期
  const dayField = createElement(
    'label',
    'mx-jump-field'
  );

  dayField.appendChild(
    createElement('span', '', '日期')
  );

  daySelect = createElement(
    'select',
    'mx-jump-select'
  );

  daySelect.setAttribute(
    'aria-label',
    '选择日期'
  );

  dayField.appendChild(daySelect);

  fields.append(monthField, dayField);

  updateDayOptions(1);

  monthSelect.addEventListener('change', () => {
    updateDayOptions(Number(monthSelect.value));
  });

  // 操作按钮
  const actions = createElement(
    'div',
    'mx-jump-actions'
  );

  const cancelButton = createButton('取消');

  const goButton = createButton(
    '跳转',
    'mx-jump-primary'
  );

  cancelButton.addEventListener('click', () => {
    closePanel();
    jumpButton.focus();
  });

  goButton.addEventListener('click', () => {
    const month = Number(monthSelect.value);
    const day = Number(daySelect.value);

    const success = jumpToMatrixDate(month, day);

    if (success) {
      feedback.textContent =
        `已定位至 ${month}月` +
        (day === 0 ? '00日（日期未知）' : `${day}日`);

      closePanel();
      jumpButton.focus();

    } else {
      feedback.textContent =
        '跳转失败：矩阵尚未加载完成，或日期无效。';
    }
  });

  actions.append(cancelButton, goButton);

  panel.append(
    heading,
    hint,
    fields,
    actions
  );

  return panel;
}

// ============================================================================
// 7. 初始化工具栏按钮
// ============================================================================

/**
 * 在原有过滤/样式按钮后添加“日期跳转”按钮。
 *
 * @returns {void}
 */
export function initMatrixDateJump() {
  if (initialized) return;

  const filterButton = document.querySelector(
    '[data-role="filter-toggle"], [data-te-filter-toggle]'
  );

  if (!filterButton) {
    console.warn(
      '[matrix-date-jump] Filter button not ready.'
    );

    return;
  }

  initialized = true;

  const wrap = createElement(
    'div',
    'mx-jump-wrap'
  );

  jumpButton = createButton(
    '日期跳转',
    'mx-jump-trigger'
  );

  jumpButton.setAttribute(
    'aria-expanded',
    'false'
  );

  jumpButton.setAttribute(
    'aria-controls',
    'matrix-date-jump-panel'
  );

  jumpPanel = createJumpPanel();

  wrap.append(jumpButton, jumpPanel);

  // 尽量排在五个样式按钮之后。
  const styleButtons = [
    ...document.querySelectorAll('.mx-style-trigger')
  ];

  const anchor = styleButtons.length
    ? styleButtons[styleButtons.length - 1]
    : filterButton;

  anchor.after(wrap);

  feedback = createElement(
    'span',
    'mx-jump-sr-only'
  );

  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');

  wrap.appendChild(feedback);

  jumpButton.addEventListener('click', event => {
    event.stopPropagation();
    togglePanel();
  });

  // 点击面板外关闭。
  document.addEventListener('pointerdown', event => {
    if (
      jumpPanel &&
      !jumpPanel.hidden &&
      !wrap.contains(event.target)
    ) {
      closePanel();
    }
  });

  // ESC关闭。
  document.addEventListener('keydown', event => {
    if (
      event.key === 'Escape' &&
      jumpPanel &&
      !jumpPanel.hidden
    ) {
      closePanel();
      jumpButton.focus();
    }
  });

  console.info(
    '[matrix-date-jump] Initialized.'
  );
}

// ============================================================================
// 8. 自动启动
// ============================================================================

function start() {
  const selector =
    '[data-role="filter-toggle"], [data-te-filter-toggle]';

  if (document.querySelector(selector)) {
    initMatrixDateJump();
    return;
  }

  // filter-ui.js会动态生成工具栏按钮。
  // 因此在按钮尚未出现时等待DOM更新。
  const observer = new MutationObserver(() => {
    if (document.querySelector(selector)) {
      observer.disconnect();
      initMatrixDateJump();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    start,
    { once: true }
  );
} else {
  start();
}
