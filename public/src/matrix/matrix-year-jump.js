
/**
 * 文件路径：public/src/matrix/matrix-year-jump.js
 *
 * 功能：
 * - 在日期跳转按钮后创建“年份跳转”按钮和年份输入面板
 * - 支持没有事件的年份，包括当前纵轴范围之外的年份
 * - 只改变纵向滚动，不影响横向日期位置
 * - 通过 matrix:ensure-year 事件请求矩阵扩展年份范围
 * - 高亮目标年份标签；过滤重绘后由 matrix.js 恢复高亮
 *
 * 依赖：matrix.js 中的 matrix:ensure-year 监听器、matrix-year-jump.css。
 * 不读取事件数组、不修改过滤或样式状态。
 */

let initialized = false;
let wrap = null;
let trigger = null;
let panel = null;
let input = null;
let message = null;

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function makeButton(text, className = '') {
  const node = el('button', className, text);
  node.type = 'button';
  return node;
}

function validateYear(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{1,4}$/.test(raw)) return null;
  const year = Number(raw);
  return year >= 1 && year <= 9999 ? year : null;
}

function closePanel() {
  if (!panel) return;
  panel.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
}

function openPanel() {
  if (!panel) return;
  const scroll = document.getElementById('matrix');
  const savedYear = scroll?.dataset.jumpYear;
  const firstYear = scroll?.querySelector('.matrix-year-row')?.dataset.year;
  input.value = savedYear || firstYear || String(new Date().getFullYear());
  message.textContent = '';
  panel.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  input.focus();
  input.select();
}

/**
 * 跳转指定年份。年份不需要对应事件。
 * 必要时通知matrix.js创建该年份的空白坐标行。
 * @param {number} year 1到9999的整数年份
 * @returns {boolean} 是否成功定位
 */
export function jumpToMatrixYear(year) {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return false;

  const scroll = document.getElementById('matrix');
  if (!scroll) return false;

  // detail中的ready由matrix.js同步写入。
  const request = { year, ready: false };
  document.dispatchEvent(new CustomEvent('matrix:ensure-year', { detail: request }));
  if (!request.ready) return false;

  const row = scroll.querySelector(`.matrix-year-row[data-year="${year}"]`);
  if (!row) return false;

  const header = scroll.querySelector('.matrix-header-row');
  const scrollRect = scroll.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const stickyHeaderHeight = header?.getBoundingClientRect().height || 0;

  // 只滚动纵轴，将年份行尽可能放在固定日期表头下方的可见区域中央。
  const visibleHeight = Math.max(0, scroll.clientHeight - stickyHeaderHeight);
  const visibleCenter = scrollRect.top + stickyHeaderHeight + visibleHeight / 2;
  const targetCenter = rowRect.top + rowRect.height / 2;
  scroll.scrollTop = Math.max(
    0,
    scroll.scrollTop + targetCenter - visibleCenter
  );

  console.info('[matrix-year-jump] Located:', year);
  return true;
}

function createPanel() {
  const pane = el('div', 'mx-year-jump-panel');
  pane.id = 'matrix-year-jump-panel';
  pane.hidden = true;
  pane.setAttribute('role', 'group');
  pane.setAttribute('aria-label', '年份跳转设置');

  pane.appendChild(el('div', 'mx-year-jump-heading', '跳转到年份'));
  pane.appendChild(el(
    'p', 'mx-year-jump-hint',
    '无需该年存在事件。缺失的年份会以空白行显示。'
  ));

  const field = el('label', 'mx-year-jump-field');
  field.appendChild(el('span', '', '年份'));
  input = el('input', 'mx-year-jump-input');
  input.type = 'number';
  input.min = '1';
  input.max = '9999';
  input.step = '1';
  input.placeholder = '例如 1985';
  input.setAttribute('aria-label', '输入目标年份');
  field.appendChild(input);
  pane.appendChild(field);

  message = el('p', 'mx-year-jump-message');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  pane.appendChild(message);

  const actions = el('div', 'mx-year-jump-actions');
  const cancel = makeButton('取消');
  const go = makeButton('跳转', 'mx-year-jump-primary');

  cancel.addEventListener('click', () => {
    closePanel();
    trigger.focus();
  });

  function performJump() {
    const year = validateYear(input.value);
    if (year === null) {
      message.textContent = '请输入1至9999之间的整数年份。';
      return;
    }
    if (jumpToMatrixYear(year)) {
      closePanel();
      trigger.focus();
    } else {
      message.textContent = '跳转失败：矩阵尚未加载完成。';
    }
  }

  go.addEventListener('click', performJump);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') performJump();
  });

  actions.append(cancel, go);
  pane.appendChild(actions);
  return pane;
}

/**
 * 创建年份跳转UI，放在现有日期跳转按钮的右侧。
 * @returns {void}
 */
export function initMatrixYearJump() {
  if (initialized) return;

  const dateJump = document.querySelector('.mx-jump-wrap');
  if (!dateJump) return;

  initialized = true;
  wrap = el('div', 'mx-year-jump-wrap');
  trigger = makeButton('年份跳转', 'mx-year-jump-trigger');
  trigger.setAttribute('aria-controls', 'matrix-year-jump-panel');
  trigger.setAttribute('aria-expanded', 'false');

  panel = createPanel();
  wrap.append(trigger, panel);
  dateJump.after(wrap);

  trigger.addEventListener('click', event => {
    event.stopPropagation();
    if (panel.hidden) openPanel();
    else closePanel();
  });

  document.addEventListener('pointerdown', event => {
    if (!panel.hidden && !wrap.contains(event.target)) closePanel();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) {
      closePanel();
      trigger.focus();
    }
  });
}

function start() {
  if (document.querySelector('.mx-jump-wrap')) {
    initMatrixYearJump();
    return;
  }
  const observer = new MutationObserver(() => {
    if (document.querySelector('.mx-jump-wrap')) {
      observer.disconnect();
      initMatrixYearJump();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
