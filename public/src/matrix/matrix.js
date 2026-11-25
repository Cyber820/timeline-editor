
// public/src/matrix/matrix.js
// =============================================================================
// 世界电子游戏史二维矩阵 - 页面主程序
//
// 当前功能：
// - 读取 world-zh 的 action=matrix 接口
// - 378列日期坐标
// - 年份纵轴
// - 事件标题卡片
// - 过滤/筛选 UI（尚未连接实际过滤）
//
// 原时间轴 app.js、mount.js 不受影响。
// =============================================================================

import { getVariant } from '../variant/variant.js';
import { fetchAndNormalize } from '../timeline/fetch.js';

import {
  buildMatrixData,
  parseMatrixDate
} from './matrix-data.js';

import {
  initMatrixFilterUI
} from './matrix-filter-ui.js';

// =============================================================================
// 1. DOM辅助函数
// =============================================================================

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
// 5. 矩阵绘制
// =============================================================================

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
      createYearRow(year, columns, yearCells)
    );
  }

  container.appendChild(grid);
}

// =============================================================================
// 6. 页面状态
// =============================================================================

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
// 8. 矩阵初始化
// =============================================================================

export async function initMatrix() {
  const container = document.getElementById(
    'matrix'
  );

  if (!container) {
    throw new Error(
      '[matrix] #matrix container not found'
    );
  }

  // 保存全部原始事件。
  // 过滤界面可以读取，但本阶段不能修改显示结果。
  let allEvents = [];

  // ------------------------------------------------------------
  // 新增：初始化过滤界面。
  //
  // 这里只连接 UI 与规则状态。
  // 不调用 applyFilters()。
  // 不重新绘制矩阵。
  // ------------------------------------------------------------

  initMatrixFilterUI({
    getItems: () => allEvents
  });

  try {
    setStatus('正在读取事件数据……');

    const variant = getVariant();

    if (variant.key !== 'world-zh') {
      console.warn(
        '[matrix] 当前页面不是world-zh配置：',
        variant.key
      );
    }

    const eventsEndpoint = variant?.endpoints?.events;

    if (!eventsEndpoint) {
      throw new Error('未找到事件数据接口');
    }

    // 请求矩阵专用接口。
    const endpoint = new URL(eventsEndpoint);

    endpoint.searchParams.set(
      'action',
      'matrix'
    );

    globalThis.TIMELINE_ENDPOINT = endpoint.toString();

    // 读取并保存完整事件数组。
    const events = await fetchAndNormalize();

    if (!Array.isArray(events)) {
      throw new Error(
        '事件接口返回的数据不是数组'
      );
    }

    allEvents = events;

    setStatus('正在生成二维矩阵……');

    // 不进行任何过滤。
    const matrixData = buildMatrixData(allEvents);

    if (matrixData.columns.length !== 378) {
      throw new Error(
        `日期坐标数量异常：` +
        `${matrixData.columns.length}列，预期378列`
      );
    }

    renderMatrix(
      container,
      matrixData
    );

    const monthlyCount = countMonthlyEvents(
      allEvents
    );

    setStatus(
      `已展示 ${matrixData.total} 条事件，` +
      `其中月度日期事件 ${monthlyCount} 条；` +
      `涉及 ${matrixData.years.length} 个年份；` +
      `跳过 ${matrixData.skipped} 条无法解析日期的记录。`
    );

  } catch (error) {
    console.error(
      '[matrix] initialization failed:',
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

    setStatus('数据加载失败', true);
  }
}

// =============================================================================
// 9. 页面自动启动
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
