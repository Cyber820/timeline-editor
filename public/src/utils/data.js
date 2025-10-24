// src/utils/data.js
// ✅ 通用数据工具函数集合。
//   - 负责日期标准化、集合比较等通用纯逻辑。
//   - 无副作用，可在前后端通用。

/**
 * 将各种日期格式（如 1998-10-21 / 1998.10.21 / 1998/10/21）
 * 统一标准化为 ISO 格式字符串（YYYY-MM-DDTHH:mm:ss.sssZ）。
 *
 * 逻辑：
 *  - 若输入为 Date 实例，则直接转 ISO。
 *  - 若为字符串，则统一替换分隔符为“-”。
 *  - 若无法解析，返回 undefined。
 *
 * @param {string|Date} d 原始日期字符串或 Date 对象
 * @returns {string|undefined} ISO 格式字符串，或 undefined（无法解析）
 */
export function toISO(d) {
  if (!d) return undefined;

  // 如果已是 Date 对象
  if (d instanceof Date && !isNaN(+d)) return d.toISOString();

  const s = String(d).trim();
  if (!s) return undefined;

  // 替换常见日期分隔符
  const norm = s.replace(/[./]/g, '-');

  const dt = new Date(norm);
  return isNaN(+dt) ? undefined : dt.toISOString();
}

/**
 * 比较两个集合（或数组）的值是否完全一致（忽略顺序，严格匹配）。
 *
 * 用法示例：
 *   isSameSet(['a', 'b'], ['b', 'a']); // true
 *   isSameSet(['a'], ['a', 'a']);       // true
 *   isSameSet(['a'], ['b']);            // false
 *
 * @param {Iterable} a 第一个集合或数组
 * @param {Iterable} b 第二个集合或数组
 * @returns {boolean} 是否完全相同
 */
export function isSameSet(a = [], b = []) {
  // 快速路径：长度不同直接 false
  if (a.length !== b.length) return false;

  const sa = new Set(a);
  const sb = new Set(b);

  if (sa.size !== sb.size) return false;

  for (const v of sa) {
    if (!sb.has(v)) return false;
  }
  return true;
}
