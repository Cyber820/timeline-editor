
/**
 * 文件路径：public/src/matrix/matrix.js
 *
 * 功能：
 * - 读取world-zh的matrix事件接口
 * - 生成378列×年份的二维矩阵
 * - 绘制事件标题卡片
 * - 接入原有AND/OR过滤功能
 * - 保留重新筛选时的滚动位置
 * - 为事件卡片附加自定义样式匹配属性
 *
 * 依赖：
 * - ../variant/variant.js
 * - ../timeline/fetch.js
 * - ../filter/filter-engine.js
 * - ../style/engine.js
 * - ./matrix-data.js
 * - ./matrix-filter-ui.js
 *
 * 本模块不负责样式编辑窗口。
 * 样式编辑窗口由matrix-style-ui.js独立负责。
 */

import { getVariant } from '../variant/variant.js';

import {
  fetchAndNormalize
} from '../timeline/fetch.js';

import {
  buildMatrixData,
  parseMatrixDate
} from './matrix-data.js';

import {
  applyFilters
} from '../filter/filter-engine.js';

import {
  attachEventDataAttrs
} from '../style/engine.js';

import {
  initMatrixFilterUI
} from './matrix-filter-ui.js';

// =============================================================================
// 1. DOM辅助函数
// =============================================================================

/**
 * 创建HTML元素。
 *
 * @param {string} tag
 * @param {string} className
 * @param {string} text
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

// =============================================================================
// 2. 事件卡片
// =============================================================================

/**
 * 创建事件标题卡片。
 *
 * 使用原有attachEventDataAttrs()附加属性，
 * 使样式引擎能够通过data-*匹配事件。
 *
 * @param {Object} event
 * @returns {HTMLElement}
 */
function createEventCard(event) {
  const card = createElement(
    'article',
    'matrix-card event'
  );

  const title = createElement(
    'h4',
    'event-title',
    String(event?.Title ?? '未命名事件')
  );

  card.appendChild(title);

  // ---------------------------------------------------------------------------
  // 样式引擎接线
  //
  // 附加：
  // data-EventType
  // data-Company
  // data-Tag
  // data-Platform
  // data-ConsolePlatform
  // data-Region
  //
  // 该函数来自原时间轴样式引擎。
  // 不改变事件本身。
  // ---------------------------------------------------------------------------

  attachEventDataAttrs(card, event);

  return card;
}

// =============================================================================
// 3. 横轴日期标题
// =============================================================================

/**
 * 生成378列日期标题。
 *
 * @param {Array<Object>} columns
 * @returns {HTMLElement}
 */
function createHeaderRow(columns) {
  const row = createElement(
    'div',
    'matrix-header-row'
  );

  const corner = createElement(
    'div',
    'matrix-corner',
    '年份 / 日期'
  );

  row.appendChild(corner);

  const fragment =
    document.createDocumentFragment();

  for (const column of columns) {
    const isMonth =
      column.precision === 'month';

    const className = isMonth
      ? 'matrix-day-header matrix-month-header'
      : 'matrix-day-header';

    const header = createElement(
      'div',
      className,
      column.label
    );

    fragment.appendChild(header);
  }

  row.appendChild(fragment);

  return row;
}

// =============================================================================
// 4. 年份行
// =============================================================================

/**
 * 生成某一年的完整378列。
 *
 * @param {number} year
 * @param {Array<Object>} columns
 * @param {Map<number,Object[]>} yearCells
 * @returns {HTMLElement}
 */
function createYearRow(year, columns, yearCells) {
  const row = createElement(
    'div',
    'matrix-year-row'
  );

  const label = createElement(
    'div',
    'matrix-year-label',
    `${year}年`
  );

  row.appendChild(label);

  const fragment =
    document.createDocumentFragment();

  for (const column of columns) {
    const className =
      column.precision === 'month'
        ? 'matrix-cell matrix-month-cell'
        : 'matrix-cell';

    const cell = createElement(
      'div',
      className
    );

    const events =
      yearCells.get(column.index) || [];

    for (const event of events) {
      cell.appendChild(
        createEventCard(event)
      );
    }

    fragment.appendChild(cell);
  }

  row.appendChild(fragment);

  return row;
}

// =============================================================================
// 5. 矩阵渲染
// =============================================================================

/**
 * 根据矩阵数据重新生成DOM。
 *
 * @param {HTMLElement} container
 * @param {Object} matrixData
 * @returns {void}
 */
export function renderMatrix(container, matrixData) {
  if (!(container instanceof HTMLElement)) {
    throw new Error(
      '[matrix] Invalid container.'
    );
  }

  const { columns, years, cells } = matrixData;

  container.replaceChildren();

  if (years.length === 0) {
    container.appendChild(
      createElement(
        'div',
        'matrix-message',
        '当前筛选条件下没有符合要求的事件。'
      )
    );

    return;
  }

  const grid = createElement(
    'div',
    'matrix-grid'
  );

  grid.style.setProperty(
    '--matrix-column-count',
    String(columns.length)
  );

  grid.appendChild(
    createHeaderRow(columns)
  );

  for (const year of years) {
    const yearCells =
      cells.get(year) || new Map();

    grid.appendChild(
      createYearRow(
        year,
        columns,
        yearCells
      )
    );
  }

  container.appendChild(grid);
}

// =============================================================================
// 6. 页面状态
// =============================================================================

/**
 * 更新页面顶部的状态信息。
 *
 * @param {string} message
 * @param {boolean} isError
 * @returns {void}
 */
function setStatus(message, isError = false) {
  const status = document.getElementById(
    'matrix-status'
  );

  if (!status) return;

  status.textContent = message;
  status.dataset.error = String(isError);
}

// =============================================================================
// 7. 月度事件数量统计
// =============================================================================

/**
 * 统计YYYY-MM-00事件。
 *
 * @param {Array<Object>} events
 * @returns {number}
 */
function countMonthlyEvents(events) {
  let count = 0;

  for (const event of events) {
    if (
      parseMatrixDate(event?.Start)?.precision
      === 'month'
    ) {
      count++;
    }
  }

  return count;
}

// =============================================================================
// 8. 页面初始化及过滤管理
// =============================================================================

/**
 * 初始化世界中文版二维矩阵。
 *
 * @returns {Promise<void>}
 */
export async function initMatrix() {
  const container = document.getElementById(
    'matrix'
  );

  if (!container) {
    throw new Error(
      '[matrix] #matrix container not found.'
    );
  }

  let allEvents = [];
  let currentEvents = [];
  let dataReady = false;

  // ---------------------------------------------------------------------------
  // 统计信息
  // ---------------------------------------------------------------------------

  function updateMatrixStatus(matrixData) {
    const monthlyCount =
      countMonthlyEvents(currentEvents);

    const totalOriginal =
      allEvents.length;

    setStatus(
      `已展示 ${matrixData.total} / ${totalOriginal} 条事件，` +
      `其中月度日期事件 ${monthlyCount} 条；` +
      `涉及 ${matrixData.years.length} 个年份；` +
      `跳过 ${matrixData.skipped} 条无法解析日期的记录。`
    );
  }

  // ---------------------------------------------------------------------------
  // 重新绘制当前事件
  //
  // 原有CSS规则保存在head中的style元素里。
  // 新建卡片时重新附加data-*属性，
  // 所以筛选之后无需重新编译样式。
  // ---------------------------------------------------------------------------

  function redrawCurrentEvents() {
    const oldScrollLeft =
      container.scrollLeft;

    const oldScrollTop =
      container.scrollTop;

    const matrixData =
      buildMatrixData(currentEvents);

    renderMatrix(
      container,
      matrixData
    );

    container.scrollLeft = oldScrollLeft;
    container.scrollTop = oldScrollTop;

    updateMatrixStatus(matrixData);
  }

  // ---------------------------------------------------------------------------
  // 执行过滤
  // ---------------------------------------------------------------------------

  function applyMatrixFilter(state) {
    if (!dataReady) return;

    currentEvents = applyFilters(
      allEvents,
      state
    );

    redrawCurrentEvents();
  }

  // ---------------------------------------------------------------------------
  // 初始化现有过滤面板
  // ---------------------------------------------------------------------------

  initMatrixFilterUI({
    getItems: () => allEvents,

    onApply: state => {
      applyMatrixFilter(state);
    }
  });

  // ---------------------------------------------------------------------------
  // 读取Google Apps Script事件
  // ---------------------------------------------------------------------------

  try {
    setStatus('正在读取事件数据……');

    const variant = getVariant();

    if (variant.key !== 'world-zh') {
      console.warn(
        '[matrix] Current variant:',
        variant.key
      );
    }

    const eventsEndpoint =
      variant?.endpoints?.events;

    if (!eventsEndpoint) {
      throw new Error(
        '未找到world-zh事件数据接口。'
      );
    }

    const endpoint =
      new URL(eventsEndpoint);

    endpoint.searchParams.set(
      'action',
      'matrix'
    );

    globalThis.TIMELINE_ENDPOINT =
      endpoint.toString();

    const events =
      await fetchAndNormalize();

    if (!Array.isArray(events)) {
      throw new Error(
        '事件接口返回的数据不是数组。'
      );
    }

    allEvents = events;
    currentEvents = events.slice();

    setStatus('正在生成二维矩阵……');

    // 初次绘制显示全部事件。
    const matrixData =
      buildMatrixData(currentEvents);

    if (matrixData.columns.length !== 378) {
      throw new Error(
        '矩阵日期坐标数量不正确：' +
        matrixData.columns.length
      );
    }

    renderMatrix(
      container,
      matrixData
    );

    dataReady = true;

    updateMatrixStatus(matrixData);

    console.info(
      '[matrix] Loaded:',
      allEvents.length,
      'events.'
    );

  } catch (error) {
    dataReady = false;

    console.error(
      '[matrix] Initialization failed:',
      error
    );

    container.replaceChildren();

    container.appendChild(
      createElement(
        'div',
        'matrix-message',
        `二维矩阵加载失败：${error.message}`
      )
    );

    setStatus(
      '数据加载失败',
      true
    );
  }
}

// =============================================================================
// 9. 自动启动
// =============================================================================

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    () => initMatrix(),
    { once: true }
  );
} else {
  initMatrix();
}
