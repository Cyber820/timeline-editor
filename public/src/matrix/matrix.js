
// public/src/matrix/matrix.js
// =============================================================================
// 世界电子游戏史二维矩阵 - 页面主程序
//
// 数据接口：
//   原有 events URL + ?action=matrix
//
// 数据来源：
//   当前 world-zh Google Apps Script 的 Events 工作表
//
// 横轴：
//   378列 = 366个真实日期 + 12个月度日期未知位置
//
// 纵轴：
//   年份，从新到旧
//
// 职责：
//   1. 获取 world-zh 数据接口。
//   2. 添加 action=matrix 请求参数。
//   3. 使用原有 fetchAndNormalize() 获取标准化数据。
//   4. 调用 matrix-data.js 生成二维坐标。
//   5. 渲染日期表头、年份标签和事件标题卡片。
//   6. 显示基本数据统计。
//
// 不负责：
//   - 过滤器
//   - 自定义格式
//   - 缩放
//   - 日期跳转
//
// 不依赖原有 vis.js 时间轴。
// =============================================================================

import { getVariant } from '../variant/variant.js';
import { fetchAndNormalize } from '../timeline/fetch.js';
import {
  buildMatrixData,
  parseMatrixDate
} from './matrix-data.js';


// =============================================================================
// 1. DOM辅助函数
// =============================================================================

/**
 * 创建普通DOM元素。
 *
 * @param {string} tag - HTML标签名
 * @param {string} className - CSS类名
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


// =============================================================================
// 2. 事件卡片
// =============================================================================

/**
 * 创建事件标题卡片。
 *
 * 当前只显示Title，不显示详情。
 *
 * @param {object} event - 标准化事件对象
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
// 3. 日期标题行
// =============================================================================

/**
 * 创建横轴日期标题。
 *
 * 普通日期：
 *   2月20日
 *
 * 日期未知：
 *   2月（日期未知）
 *
 * @param {Array<object>} columns - 日期坐标列表
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
// 4. 年份行
// =============================================================================

/**
 * 创建一个年份行。
 *
 * 每个年份对应378个日期位置。
 * 同一年同一日期可以包含多张事件卡片。
 *
 * @param {number} year - 年份
 * @param {Array<object>} columns - 日期坐标列表
 * @param {Map<number,object[]>} yearCells - 当年事件分组
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
    const isMonth = column.precision === 'month';

    const className = isMonth
      ? 'matrix-cell matrix-month-cell'
      : 'matrix-cell';

    const cell = createElement(
      'div',
      className
    );

    const events = yearCells.get(column.index) || [];

    if (events.length > 0) {
      const cards = document.createDocumentFragment();

      for (const event of events) {
        cards.appendChild(
          createEventCard(event)
        );
      }

      cell.appendChild(cards);
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
 * 将矩阵数据渲染到指定容器。
 *
 * @param {HTMLElement} container - 页面矩阵容器
 * @param {object} matrixData - buildMatrixData()返回的数据
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
        '未找到包含有效日期的事件。'
      )
    );

    return;
  }

  const grid = createElement(
    'div',
    'matrix-grid'
  );

  // 列数由matrix-data.js的实际结果决定。
  // 当前应为378列。
  grid.style.setProperty(
    '--matrix-column-count',
    String(columns.length)
  );

  grid.appendChild(
    createHeaderRow(columns)
  );

  for (const year of years) {
    const yearCells = cells.get(year) || new Map();

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
 * 更新页面顶部状态信息。
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
 * 统计只有年月、没有具体日期的事件。
 *
 * 该函数不修改任何事件对象。
 *
 * @param {Array<object>} events
 * @returns {number}
 */
function countMonthlyEvents(events) {
  let count = 0;

  for (const event of events) {
    const date = parseMatrixDate(event?.Start);

    if (date?.precision === 'month') {
      count++;
    }
  }

  return count;
}


// =============================================================================
// 8. 页面初始化
// =============================================================================

/**
 * 初始化二维矩阵。
 *
 * 页面需提前设置：
 *   window.TIMELINE_REGION = 'world';
 *   window.TIMELINE_LANG = 'zh';
 *
 * @returns {Promise<void>}
 */
export async function initMatrix() {
  const container = document.getElementById(
    'matrix'
  );

  if (!container) {
    throw new Error(
      '[matrix] #matrix container not found'
    );
  }

  try {
    setStatus('正在读取事件数据……');

    // -----------------------------------------------------------------------
    // 读取现有world-zh接口配置。
    // -----------------------------------------------------------------------

    const variant = getVariant();

    if (variant.key !== 'world-zh') {
      console.warn(
        '[matrix] 当前页面不是world-zh配置：',
        variant.key
      );
    }

    const eventsEndpoint = variant?.endpoints?.events;

    if (!eventsEndpoint) {
      throw new Error(
        '未找到事件数据接口'
      );
    }

    // -----------------------------------------------------------------------
    // 新增：请求矩阵专用接口。
    //
    // 原接口：
    //   /exec
    //
    // 新接口：
    //   /exec?action=matrix
    //
    // 不修改variant.js，也不修改原时间轴。
    // -----------------------------------------------------------------------

    const endpoint = new URL(eventsEndpoint);

    endpoint.searchParams.set(
      'action',
      'matrix'
    );

    globalThis.TIMELINE_ENDPOINT = endpoint.toString();

    // -----------------------------------------------------------------------
    // 继续使用原有的fetchAndNormalize()。
    //
    // fetch.js会保留Apps Script返回的start字符串。
    // YYYY-MM-00因此能传递给matrix-data.js。
    // -----------------------------------------------------------------------

    const events = await fetchAndNormalize();

    if (!Array.isArray(events)) {
      throw new Error(
        '事件接口返回的数据不是数组'
      );
    }

    setStatus('正在生成二维矩阵……');

    // -----------------------------------------------------------------------
    // 使用已经测试通过的378列数据映射。
    // -----------------------------------------------------------------------

    const matrixData = buildMatrixData(events);

    if (matrixData.columns.length !== 378) {
      throw new Error(
        `日期坐标数量异常：` +
        `${matrixData.columns.length}列，预期378列`
      );
    }

    // -----------------------------------------------------------------------
    // 绘制矩阵。
    // -----------------------------------------------------------------------

    renderMatrix(
      container,
      matrixData
    );

    // -----------------------------------------------------------------------
    // 统计成功展示的月度日期事件。
    // -----------------------------------------------------------------------

    const monthlyCount = countMonthlyEvents(events);

    const skipped = matrixData.skipped;

    setStatus(
      `已展示 ${matrixData.total} 条事件，` +
      `其中月度日期事件 ${monthlyCount} 条；` +
      `涉及 ${matrixData.years.length} 个年份；` +
      `跳过 ${skipped} 条无法解析日期的记录。`
    );

  } catch (error) {
    console.error(
      '[matrix] initialization failed:',
      error
    );

    container.replaceChildren();

    const message = createElement(
      'div',
      'matrix-message',
      `二维矩阵加载失败：${error.message}`
    );

    container.appendChild(message);

    setStatus(
      '数据加载失败',
      true
    );
  }
}


// =============================================================================
// 9. 自动启动
// =============================================================================

/*
 * 新页面独立初始化。
 *
 * 不调用旧版app.js。
 * 不调用mountTimeline()。
 */

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    () => initMatrix(),
    { once: true }
  );
} else {
  initMatrix();
}
