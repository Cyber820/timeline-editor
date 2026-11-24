
/**
 * public/src/matrix/matrix-data.js
 *
 * 二维时间矩阵的数据处理模块。
 *
 * 横轴：378列
 * - 366个真实日期
 * - 12个月度日期（每月00日）
 *
 * 纵轴：年份（从新到旧）
 *
 * 不负责读取Google Sheets，也不负责页面绘制。
 */

export function isLeapYear(year) {
  return Number.isInteger(year) &&
    (year % 400 === 0 ||
      (year % 4 === 0 && year % 100 !== 0));
}

export function getDaysInMonth(year, month) {
  if (!Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < 1 || month > 12) {
    return 0;
  }

  const days = [
    31, isLeapYear(year) ? 29 : 28,
    31, 30, 31, 30,
    31, 31, 30, 31, 30, 31
  ];

  return days[month - 1];
}

/**
 * 解析普通的确定日期。
 *
 * 支持：
 * YYYY-MM-DD
 * YYYY/MM/DD
 * YYYY.MM.DD
 * YYYY年M月D日
 * Date对象
 *
 * 不接受00日及其他非法日期。
 */
export function parseExactDate(value) {
  let year, month, day;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;

    year = value.getUTCFullYear();
    month = value.getUTCMonth() + 1;
    day = value.getUTCDate();
  } else {
    const raw = String(value ?? '').trim();

    const match = raw.match(
      /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?(?=$|[T\s])/
    );

    if (!match) return null;

    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  }

  if (!Number.isInteger(year) ||
      year < 1 || year > 9999) {
    return null;
  }

  const maxDay = getDaysInMonth(year, month);

  if (day < 1 || day > maxDay) {
    return null;
  }

  return { year, month, day };
}

/**
 * 解析矩阵日期。
 *
 * 普通日期返回 precision: "day"。
 * YYYY-MM-00 返回 precision: "month"。
 * 无效日期返回 null。
 */
export function parseMatrixDate(value) {
  if (typeof value === 'string') {
    const raw = value.trim();

    const match = raw.match(
      /^(\d{4})-(\d{2})-00$/
    );

    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);

      if (year >= 1 && year <= 9999 &&
          month >= 1 && month <= 12) {
        return {
          year,
          month,
          day: 0,
          precision: 'month'
        };
      }

      return null;
    }
  }

  const date = parseExactDate(value);

  if (!date) return null;

  return {
    ...date,
    precision: 'day'
  };
}

/**
 * 将月、日转换成378列横轴索引。
 *
 * 每月00日位于当月1日之前。
 *
 * 1月00日 -> 0
 * 1月1日  -> 1
 * 2月00日 -> 32
 * 2月29日 -> 61
 * 3月00日 -> 62
 * 12月31日 -> 377
 */
export function getDayIndex(month, day) {
  if (!Number.isInteger(month) ||
      !Number.isInteger(day) ||
      month < 1 || month > 12) {
    return -1;
  }

  const maxDay = getDaysInMonth(2000, month);

  if (day < 0 || day > maxDay) {
    return -1;
  }

  const daysBeforeMonth = [
    0, 31, 60, 91, 121, 152,
    182, 213, 244, 274, 305, 335
  ];

  // 前面每个月都增加一个00日。
  return daysBeforeMonth[month - 1] +
    (month - 1) + day;
}

/**
 * 建立378个横轴日期对象。
 */
export function buildDayColumns() {
  const columns = [];

  for (let month = 1; month <= 12; month++) {
    const maxDay = getDaysInMonth(2000, month);

    for (let day = 0; day <= maxDay; day++) {
      columns.push({
        index: getDayIndex(month, day),
        month,
        day,
        label: day === 0
          ? `${month}月（日期未知）`
          : `${month}月${day}日`,
        precision: day === 0 ? 'month' : 'day'
      });
    }
  }

  return columns;
}

/**
 * 将标准化事件分配到年份和日期单元格。
 *
 * 输入：
 * [{ Start: "...", Title: "..." }, ...]
 *
 * 输出：
 * {
 *   columns,
 *   years,
 *   cells,
 *   total,
 *   skipped
 * }
 */
export function buildMatrixData(events = []) {
  const columns = buildDayColumns();
  const cells = new Map();

  let total = 0;
  let skipped = 0;

  for (const event of events) {
    const date = parseMatrixDate(event?.Start);

    if (!date) {
      skipped++;
      continue;
    }

    const index = getDayIndex(date.month, date.day);

    if (index < 0) {
      skipped++;
      continue;
    }

    if (!cells.has(date.year)) {
      cells.set(date.year, new Map());
    }

    const yearCells = cells.get(date.year);

    if (!yearCells.has(index)) {
      yearCells.set(index, []);
    }

    yearCells.get(index).push(event);
    total++;
  }

  const years = [...cells.keys()]
    .sort((a, b) => b - a);

  return {
    columns,
    years,
    cells,
    total,
    skipped
  };
}
