
// public/src/matrix/matrix.js
// =============================================================================
// 世界电子游戏史二维矩阵 - 主程序
//
// 数据：world-zh Google Apps Script
// 接口：/exec?action=matrix
//
// 横轴：378列（366个确定日期 + 12个月度日期未知位置）
// 纵轴：年份，从新到旧
//
// 当前功能：
// - 读取并标准化事件
// - 二维卡片矩阵
// - 无网格线布局
// - 复用原有过滤/筛选界面
// - 实际 AND/OR 过滤
// - 删除规则与 Reset
// - 保留筛选前后的滚动位置
//
// 尚未实现：
// - 自定义事件格式
// - 日期跳转
// - 独立单轴缩放
// =============================================================================

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
 * @param {object} event
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

  return card;
}


// =============================================================================
// 3. 横轴日期标题
// =============================================================================

/**
 * 生成完整日期标题行。
 *
 * @param {Array<object>} columns
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

  const fragment = document.createDocumentFragment();

  for (const column of columns) {
    const isMonth = column.precision === 'month';

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
// 4. 纵轴年份行
// =============================================================================

/**
 * 生成某个年份的完整行。
 *
 * @param {number} year
 * @param {Array<object>} columns
 * @param {Map<number,object[]>} yearCells
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

  const fragment = document.createDocumentFragment();

  for (const column of columns) {
    const className =
      column.precision === 'month'
        ? 'matrix-cell matrix-month-cell'
        : 'matrix-cell';

    const cell = createElement(
      'div',
      className
    );

    const events = yearCells.get(column.index) || [];

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
 * 渲染二维矩阵。
 *
 * @param {HTMLElement} container
 * @param {object} matrixData
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
 * 更新顶部状态信息。
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
// 7. 月度事件统计
// =============================================================================

/**
 * 统计事件数组中的月度日期事件。
 *
 * @param {Array<object>} events
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
// 8. 初始化和过滤管理
// =============================================================================

/**
 * 初始化二维矩阵页面。
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

  // ---------------------------------------------------------------------------
  // 数据状态
  //
  // allEvents：
  //   保存全部原始标准化事件。
  //
  // currentEvents：
  //   当前实际显示的事件。
  //
  // dataReady：
  //   是否完成首次数据加载。
  // ---------------------------------------------------------------------------

  let allEvents = [];
  let currentEvents = [];
  let dataReady = false;

  // ---------------------------------------------------------------------------
  // 更新状态栏
  //
  // 只统计进入当前矩阵的数据。
  // Apps Script端已跳过的数据不在统计范围内。
  // ---------------------------------------------------------------------------

  function updateMatrixStatus(matrixData) {
    const monthlyCount =
      countMonthlyEvents(currentEvents);

    const totalOriginal = allEvents.length;

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
  // 保留目前的滚动位置。
  //
  // 当筛选结果减少时，浏览器可能自动限制滚动范围。
  // 这是正常行为。
  // ---------------------------------------------------------------------------

  function redrawCurrentEvents() {
    const oldScrollLeft = container.scrollLeft;
    const oldScrollTop = container.scrollTop;

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
  // 应用过滤规则
  //
  // 由过滤UI在以下情况下调用：
  // - 选择AND
  // - 选择OR
  // - 删除规则
  // - Reset
  //
  // 新增规则时不会调用。
  // ---------------------------------------------------------------------------

  function applyMatrixFilter(state) {
    if (!dataReady) {
      return;
    }

    currentEvents = applyFilters(
      allEvents,
      state
    );

    redrawCurrentEvents();
  }

  // ---------------------------------------------------------------------------
  // 初始化过滤界面
  //
  // getItems():
  //   始终返回全部事件，保证候选项完整。
  //
  // onApply():
  //   只有需要实际筛选时才调用。
  // ---------------------------------------------------------------------------

  initMatrixFilterUI({
    getItems: () => allEvents,

    onApply: (state) => {
      applyMatrixFilter(state);
    }
  });

  // ---------------------------------------------------------------------------
  // 读取事件数据
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

    // 添加矩阵专用接口参数。
    const endpoint = new URL(eventsEndpoint);

    endpoint.searchParams.set(
      'action',
      'matrix'
    );

    globalThis.TIMELINE_ENDPOINT =
      endpoint.toString();

    // 使用原有数据读取与标准化模块。
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

    // -------------------------------------------------------------------------
    // 初次绘制：默认显示所有事件。
    // 不应用过滤规则。
    // -------------------------------------------------------------------------

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
