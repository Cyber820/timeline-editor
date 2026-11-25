
/**
 * 文件路径：public/src/matrix/matrix.js
 *
 * 世界电子游戏史二维矩阵主程序。
 * - 从 world-zh 的 action=matrix 接口加载事件
 * - 绘制378个日期坐标和连续年份坐标
 * - 复用原过滤引擎和卡片样式匹配属性
 * - 响应 matrix:ensure-year 事件以扩展纵轴年份范围
 * - 筛选重绘后保留滚动位置和已选日期、年份高亮
 *
 * 依赖：variant/variant.js、timeline/fetch.js、filter/filter-engine.js、
 *       style/engine.js、matrix-data.js、matrix-filter-ui.js。
 */

import { getVariant } from '../variant/variant.js';
import { fetchAndNormalize } from '../timeline/fetch.js';
import { buildMatrixData, parseMatrixDate } from './matrix-data.js';
import { applyFilters } from '../filter/filter-engine.js';
import { attachEventDataAttrs } from '../style/engine.js';
import { initMatrixFilterUI } from './matrix-filter-ui.js';

function createElement(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== '') element.textContent = text;
  return element;
}

function createEventCard(event) {
  const card = createElement('article', 'matrix-card event');
  const title = createElement(
    'h4', 'event-title', String(event?.Title ?? '未命名事件')
  );
  card.appendChild(title);
  attachEventDataAttrs(card, event);
  return card;
}

function createHeaderRow(columns, highlightedIndex = -1) {
  const row = createElement('div', 'matrix-header-row');
  row.appendChild(createElement('div', 'matrix-corner', '年份 / 日期'));

  const fragment = document.createDocumentFragment();
  for (const column of columns) {
    const classes = ['matrix-day-header'];
    if (column.precision === 'month') classes.push('matrix-month-header');
    if (column.index === highlightedIndex) classes.push('mx-jump-target');
    fragment.appendChild(createElement('div', classes.join(' '), column.label));
  }
  row.appendChild(fragment);
  return row;
}

/**
 * 空白年份仅生成一个横跨378列的占位元素，避免产生378个空DOM单元格。
 * @param {number} year 年份
 * @param {Array<object>} columns 日期列
 * @param {Map<number, object[]>} yearCells 当年事件分组
 * @param {boolean} highlighted 是否标注跳转目标
 * @returns {HTMLElement}
 */
function createYearRow(year, columns, yearCells, highlighted = false) {
  const row = createElement('div', 'matrix-year-row');
  row.dataset.year = String(year);

  const label = createElement(
    'div',
    highlighted ? 'matrix-year-label mx-year-jump-target' : 'matrix-year-label',
    `${year}年`
  );
  row.appendChild(label);

  if (!yearCells || yearCells.size === 0) {
    row.classList.add('matrix-year-row-empty');
    row.appendChild(createElement('div', 'matrix-year-empty-fill'));
    return row;
  }

  const fragment = document.createDocumentFragment();
  for (const column of columns) {
    const className = column.precision === 'month'
      ? 'matrix-cell matrix-month-cell'
      : 'matrix-cell';
    const cell = createElement('div', className);
    const events = yearCells.get(column.index) || [];
    for (const event of events) cell.appendChild(createEventCard(event));
    fragment.appendChild(cell);
  }
  row.appendChild(fragment);
  return row;
}

/**
 * 渲染矩阵。yearRange 使用不受过滤影响的年份范围。
 * 如不传入年份范围，则回退到本批事件的最早/最晚年份。
 *
 * @param {HTMLElement} container 滚动容器
 * @param {{columns:Array,years:Array,cells:Map}} matrixData 矩阵数据
 * @param {{minYear:number|null,maxYear:number|null}} [yearRange] 年份范围
 * @returns {void}
 */
export function renderMatrix(container, matrixData, yearRange = {}) {
  if (!(container instanceof HTMLElement)) {
    throw new Error('[matrix] Invalid container.');
  }

  const { columns, years, cells } = matrixData;
  const minYear = Number.isInteger(yearRange.minYear)
    ? yearRange.minYear
    : years.at(-1);
  const maxYear = Number.isInteger(yearRange.maxYear)
    ? yearRange.maxYear
    : years[0];

  container.replaceChildren();
  if (!Number.isInteger(minYear) || !Number.isInteger(maxYear) || minYear > maxYear) {
    container.appendChild(createElement('div', 'matrix-message', '暂无可显示的年份。'));
    return;
  }

  const grid = createElement('div', 'matrix-grid');
  grid.style.setProperty('--matrix-column-count', String(columns.length));

  const savedIndex = Number(container.dataset.jumpIndex);
  const highlightedIndex = container.dataset.jumpIndex !== undefined &&
    Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < columns.length
    ? savedIndex : -1;
  const savedYear = Number(container.dataset.jumpYear);
  const highlightedYear = container.dataset.jumpYear !== undefined &&
    Number.isInteger(savedYear) ? savedYear : null;

  grid.appendChild(createHeaderRow(columns, highlightedIndex));
  for (let year = maxYear; year >= minYear; year--) {
    grid.appendChild(createYearRow(
      year,
      columns,
      cells.get(year),
      year === highlightedYear
    ));
  }
  container.appendChild(grid);
}

function setStatus(message, isError = false) {
  const status = document.getElementById('matrix-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.error = String(isError);
}

function countMonthlyEvents(events) {
  let count = 0;
  for (const event of events) {
    if (parseMatrixDate(event?.Start)?.precision === 'month') count++;
  }
  return count;
}

/**
 * 初始化矩阵和年份坐标管理。
 * 年份范围由未经筛选的全部事件确定，不随过滤改变。
 * 需要跳转至范围外的年份时，可以按需扩展。
 * @returns {Promise<void>}
 */
export async function initMatrix() {
  const container = document.getElementById('matrix');
  if (!container) throw new Error('[matrix] #matrix container not found.');

  let allEvents = [];
  let currentEvents = [];
  let dataReady = false;
  const yearRange = { minYear: null, maxYear: null };

  function updateMatrixStatus(matrixData) {
    const monthlyCount = countMonthlyEvents(currentEvents);
    setStatus(
      `已展示 ${matrixData.total} / ${allEvents.length} 条事件，` +
      `其中月度日期事件 ${monthlyCount} 条；` +
      `涉及 ${matrixData.years.length} 个有事件的年份；` +
      `跳过 ${matrixData.skipped} 条无法解析日期的记录。`
    );
  }

  function redrawCurrentEvents() {
    const oldScrollLeft = container.scrollLeft;
    const oldScrollTop = container.scrollTop;
    const matrixData = buildMatrixData(currentEvents);
    renderMatrix(container, matrixData, yearRange);
    container.scrollLeft = oldScrollLeft;
    container.scrollTop = oldScrollTop;
    updateMatrixStatus(matrixData);
  }

  function applyMatrixFilter(state) {
    if (!dataReady) return;
    currentEvents = applyFilters(allEvents, state);
    redrawCurrentEvents();
  }

  /**
   * 确保某个年份存在于纵轴，必要时扩展范围并重绘。
   * 不依赖事件、过滤或样式规则。
   * @param {number} year 1至9999的整数年份
   * @returns {boolean} 是否可定位
   */
  function ensureYear(year) {
    if (!dataReady || !Number.isInteger(year) || year < 1 || year > 9999) {
      return false;
    }

    const needsExpansion = yearRange.minYear === null ||
      yearRange.maxYear === null ||
      year < yearRange.minYear || year > yearRange.maxYear;

    container.dataset.jumpYear = String(year);

    if (needsExpansion) {
      yearRange.minYear = yearRange.minYear === null
        ? year : Math.min(yearRange.minYear, year);
      yearRange.maxYear = yearRange.maxYear === null
        ? year : Math.max(yearRange.maxYear, year);
      redrawCurrentEvents();
    } else {
      container.querySelectorAll('.matrix-year-label.mx-year-jump-target')
        .forEach(node => node.classList.remove('mx-year-jump-target'));
      const row = container.querySelector(`.matrix-year-row[data-year="${year}"]`);
      row?.querySelector('.matrix-year-label')?.classList.add('mx-year-jump-target');
    }
    return true;
  }

  // 独立的年份UI通过事件请求扩展纵轴。
  // detail是可变的请求对象，dispatchEvent()同步调用处理器。
  document.addEventListener('matrix:ensure-year', event => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    detail.ready = ensureYear(detail.year);
  });

  initMatrixFilterUI({
    getItems: () => allEvents,
    onApply: state => applyMatrixFilter(state)
  });

  try {
    setStatus('正在读取事件数据……');
    const variant = getVariant();
    if (variant.key !== 'world-zh') {
      console.warn('[matrix] Current variant:', variant.key);
    }
    const eventsEndpoint = variant?.endpoints?.events;
    if (!eventsEndpoint) throw new Error('未找到world-zh事件数据接口。');

    const endpoint = new URL(eventsEndpoint);
    endpoint.searchParams.set('action', 'matrix');
    globalThis.TIMELINE_ENDPOINT = endpoint.toString();

    const events = await fetchAndNormalize();
    if (!Array.isArray(events)) {
      throw new Error('事件接口返回的数据不是数组。');
    }

    allEvents = events;
    currentEvents = events.slice();
    setStatus('正在生成二维矩阵……');

    const matrixData = buildMatrixData(currentEvents);
    if (matrixData.columns.length !== 378) {
      throw new Error('矩阵日期坐标数量不正确：' + matrixData.columns.length);
    }

    // 以所有事件的年份范围作为固定基础纵轴。
    // 后续过滤会保留这一范围内的空白年份。
    if (matrixData.years.length) {
      yearRange.minYear = matrixData.years.at(-1);
      yearRange.maxYear = matrixData.years[0];
    }

    renderMatrix(container, matrixData, yearRange);
    dataReady = true;
    updateMatrixStatus(matrixData);
    console.info('[matrix] Loaded:', allEvents.length, 'events.');
  } catch (error) {
    dataReady = false;
    console.error('[matrix] Initialization failed:', error);
    container.replaceChildren();
    container.appendChild(createElement(
      'div', 'matrix-message', `二维矩阵加载失败：${error.message}`
    ));
    setStatus('数据加载失败', true);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initMatrix(), { once: true });
} else {
  initMatrix();
}
