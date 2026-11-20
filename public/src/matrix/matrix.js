
// public/src/matrix/matrix.js
// =============================================================================
// 世界电子游戏史二维矩阵 - 页面主程序
//
// 职责：
// 1. 使用现有 variant.js 获取事件接口。
// 2. 使用现有 fetch.js 获取标准化事件。
// 3. 调用 matrix-data.js 生成二维坐标。
// 4. 渲染 366 天 × 年份的卡片矩阵。
//
// 不负责过滤、自定义样式、缩放和时间跳转。
// 不修改原有时间轴。
// =============================================================================

import { getVariant } from '../variant/variant.js';
import { fetchAndNormalize } from '../timeline/fetch.js';
import { buildMatrixData } from './matrix-data.js';

/**
 * 创建一个普通 DOM 元素。
 *
 * @param {string} tag - HTML 标签名
 * @param {string} className - CSS 类名
 * @param {string} text - 纯文本内容
 * @returns {HTMLElement}
 */
function createElement(tag, className, text = '') {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== '') {
    element.textContent = text;
  }

  return element;
}

/**
 * 生成一个事件标题卡片。
 *
 * @param {object} event - fetchAndNormalize() 返回的事件
 * @returns {HTMLElement}
 */
function createEventCard(event) {
  const card = createElement('article', 'matrix-card event');

  const title = createElement(
    'h4',
    'event-title',
    String(event?.Title ?? '未命名事件')
  );

  card.appendChild(title);

  return card;
}

/**
 * 创建顶部日期标题行。
 *
 * @param {Array<object>} columns - 366 个日期对象
 * @returns {HTMLElement}
 */
function createHeaderRow(columns) {
  const row = createElement('div', 'matrix-header-row');

  const corner = createElement(
    'div',
    'matrix-corner',
    '年份 / 日期'
  );

  row.appendChild(corner);

  const fragment = document.createDocumentFragment();

  for (const column of columns) {
    const header = createElement(
      'div',
      'matrix-day-header',
      column.label
    );

    fragment.appendChild(header);
  }

  row.appendChild(fragment);

  return row;
}

/**
 * 创建一个年份行。
 *
 * 每个年份拥有 366 个日期单元格。
 * 同一天的多张事件卡片在同一个单元格中排列。
 *
 * @param {number} year
 * @param {Array<object>} columns
 * @param {Map<number,object[]>} yearCells
 * @returns {HTMLElement}
 */
function createYearRow(year, columns, yearCells) {
  const row = createElement('div', 'matrix-year-row');

  const label = createElement(
    'div',
    'matrix-year-label',
    `${year}年`
  );

  row.appendChild(label);

  const fragment = document.createDocumentFragment();

  for (const column of columns) {
    const cell = createElement('div', 'matrix-cell');

    const events = yearCells.get(column.index) || [];

    if (events.length > 0) {
      const cards = document.createDocumentFragment();

      for (const event of events) {
        cards.appendChild(createEventCard(event));
      }

      cell.appendChild(cards);
    }

    fragment.appendChild(cell);
  }

  row.appendChild(fragment);

  return row;
}

/**
 * 将矩阵数据渲染到指定容器。
 *
 * @param {HTMLElement} container - .matrix-scroll 容器
 * @param {object} matrixData - buildMatrixData() 返回的数据
 * @returns {void}
 */
export function renderMatrix(container, matrixData) {
  if (!(container instanceof HTMLElement)) {
    throw new Error('[matrix] invalid container');
  }

  const { columns, years, cells } = matrixData;

  container.replaceChildren();

  if (years.length === 0) {
    container.appendChild(
      createElement(
        'div',
        'matrix-message',
        '未找到包含有效完整日期的事件。'
      )
    );
    return;
  }

  const grid = createElement('div', 'matrix-grid');

  grid.appendChild(createHeaderRow(columns));

  for (const year of years) {
    const yearCells = cells.get(year) || new Map();

    grid.appendChild(
      createYearRow(year, columns, yearCells)
    );
  }

  container.appendChild(grid);
}

/**
 * 设置页面顶部状态信息。
 *
 * @param {string} message
 * @param {boolean} isError
 * @returns {void}
 */
function setStatus(message, isError = false) {
  const status = document.getElementById('matrix-status');

  if (!status) return;

  status.textContent = message;
  status.dataset.error = String(isError);
}

/**
 * 初始化二维矩阵页面。
 *
 * 依赖：
 * - window.TIMELINE_REGION = 'world'
 * - window.TIMELINE_LANG = 'zh'
 *
 * @returns {Promise<void>}
 */
export async function initMatrix() {
  const container = document.getElementById('matrix');

  if (!container) {
    throw new Error('[matrix] #matrix container not found');
  }

  try {
    setStatus('正在读取事件数据……');

    const variant = getVariant();
    const endpoint = variant?.endpoints?.events;

    if (!endpoint) {
      throw new Error('未找到事件数据接口');
    }

    // fetch.js 使用这一全局变量获取接口。
    // 这里只为独立矩阵页面设置，不修改原有代码。
    globalThis.TIMELINE_ENDPOINT = endpoint;

    const events = await fetchAndNormalize();

    setStatus('正在生成二维矩阵……');

    const matrixData = buildMatrixData(events);

    renderMatrix(container, matrixData);

    setStatus(
      `已展示 ${matrixData.total} 条事件，` +
      `涉及 ${matrixData.years.length} 个年份；` +
      `跳过 ${matrixData.skipped} 条无法确定完整日期的记录。`
    );

  } catch (error) {
    console.error('[matrix] initialization failed:', error);

    container.replaceChildren();

    const message = createElement(
      'div',
      'matrix-message',
      `二维矩阵加载失败：${error.message}`
    );

    container.appendChild(message);

    setStatus('数据加载失败', true);
  }
}

// 本模块作为新页面的独立入口。
// 不依赖旧版 app.js 的初始化过程。
if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    () => initMatrix(),
    { once: true }
  );
} else {
  initMatrix();
}
