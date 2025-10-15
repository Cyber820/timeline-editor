// src/utils/data.js
/** 
 * 将各种日期格式（1998-10-21 / 1998.10.21 / 1998/10/21）标准化为 ISO 字符串。
 * @param {string|Date} d 原始日期字符串或对象
 * @returns {string|undefined} ISO 格式日期，或 undefined（无法解析时）
 */
export function toISO(d) {
  if (!d) return undefined;
  const s = String(d).trim();
  const norm = s.replace(/[./]/g, '-');
  const dt = new Date(norm);
  return isNaN(+dt) ? undefined : dt.toISOString();
}
