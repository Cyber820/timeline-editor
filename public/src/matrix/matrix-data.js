
// public/src/matrix/matrix-data.js
// =============================================================================
// 二维时间矩阵：日期解析及数据分组
//
// 职责：
// 1. 将确定的年月日映射到固定的 366 天坐标。
// 2. 根据年份和日期位置对事件分组。
// 3. 排除无法确定完整日期的记录。
// 4. 不修改原始事件对象，也不依赖 vis.js。
//
// 横轴：1 月 1 日至 12 月 31 日（固定包含 2 月 29 日）
// 纵轴：年份，默认从新到旧
// =============================================================================

/**
 * 判断某年是否为公历闰年。
 *
 * @param {number} year - 完整年份
 * @returns {boolean}
 */
export function isLeapYear(year) {
  return (
    Number.isInteger(year) &&
    (year % 400 === 0 ||
      (year % 4 === 0 && year % 100 !== 0))
  );
}

/**
 * 返回某年某月的实际天数。
 *
 * @param {number} year
 * @param {number} month - 1 至 12
 * @returns {number} 无效月份返回 0
 */
export function getDaysInMonth(year, month) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return 0;
  }

  const days = [
    31,
    isLeapYear(year) ? 29 : 28,
    31, 30, 31, 30,
    31, 31, 30, 31, 30, 31
  ];

  return days[month - 1];
}

/**
 * 解析确定日期。
 *
 * 支持：
 * - YYYY-MM-DD
 * - YYYY/MM/DD
 * - YYYY.MM.DD
 * - YYYY年M月D日
 * - 上述纯数字日期之后带有时间部分的字符串
 * - 有效 Date 对象
 *
 * 不支持：
 * - 只有年份或年月
 * - 日期范围、模糊日期
 * - 无法识别的日期表达方式
 *
 * @param {string|Date} value
 * @returns {{year:number, month:number, day:number}|null}
 */
export function parseExactDate(value) {
  let year;
  let month;
  let day;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;

    year = value.getUTCFullYear();
    month = value.getUTCMonth() + 1;
    day = value.getUTCDate();
  } else {
    const raw = String(value ?? '').trim();

    if (!raw) return null;

    const match = raw.match(
      /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?(?=$|[T\s])/ 
    );

    if (!match) return null;

    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  }

  if (
    !Number.isInteger(year) ||
    year < 1 ||
    year > 9999 ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const maxDay = getDaysInMonth(year, month);

  if (day < 1 || day > maxDay) {
    return null;
  }

  return { year, month, day };
}

/**
 * 将月、日映射为固定的横轴列索引。
 *
 * 使用闰年作为基准，因此：
 * 1 月 1 日 → 0
 * 2 月 29 日 → 59
 * 3 月 1 日 → 60
 * 12 月 31 日 → 365
 *
 * @param {number} month - 1 至 12
 * @param {number} day
 * @returns {number} 0 至 365；无效日期返回 -1
 */
export function getDayIndex(month, day) {
  const maxDay = getDaysInMonth(2000, month);

  if (
    !Number.isInteger(day) ||
    day < 1 ||
    day > maxDay
  ) {
    return -1;
  }

  const daysBeforeMonth = [
    0, 31, 60, 91, 121, 152,
    182, 213, 244, 274, 305, 335
  ];

  return daysBeforeMonth[month - 1] + day - 1;
}

/**
 * 生成横轴的 366 个日期标签。
 *
 * @returns {Array<{
 *   index:number,
 *   month:number,
 *   day:number,
 *   label:string
 * }>}
 */
export function buildDayColumns() {
  const columns = [];

  for (let month = 1; month <= 12; month++) {
    const days = getDaysInMonth(2000, month);

    for (let day = 1; day <= days; day++) {
      columns.push({
        index: getDayIndex(month, day),
        month,
        day,
        label: `${month}月${day}日`
      });
    }
  }

  return columns;
}

/**
 * 将事件数组转换为二维矩阵数据。
 *
 * 输入使用现有 fetchAndNormalize() 的输出结构：
 * - Start
 * - Title
 * - id
 * - 其他事件元数据原样保留
 *
 * 年份只包含实际存在有效事件的年份。
 * 如果同一年、同一天有多个事件，存入同一数组。
 *
 * @param {Array<object>} events - 标准化事件数组
 * @returns {{
 *   columns:Array<object>,
 *   years:number[],
 *   cells:Map<number, Map<number, object[]>>,
 *   total:number,
 *   skipped:number
 * }}
 */
export function buildMatrixData(events = []) {
  const columns = buildDayColumns();
  const cells = new Map();

  let total = 0;
  let skipped = 0;

  for (const event of events) {
    const date = parseExactDate(event?.Start);

    if (!date) {
      skipped++;
      continue;
    }

    const columnIndex = getDayIndex(date.month, date.day);

    if (columnIndex < 0) {
      skipped++;
      continue;
    }

    if (!cells.has(date.year)) {
      cells.set(date.year, new Map());
    }

    const yearCells = cells.get(date.year);

    if (!yearCells.has(columnIndex)) {
      yearCells.set(columnIndex, []);
    }

    yearCells.get(columnIndex).push(event);
    total++;
  }

  const years = [...cells.keys()].sort((a, b) => b - a);

  return {
    columns,
    years,
    cells,
    total,
    skipped
  };
}
