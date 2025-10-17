// src/utils/dom.js
/**
 * 将字符串中的 HTML 特殊字符转义，防止注入/显示错误。
 * @param {string} s 原始字符串
 * @returns {string} 安全的 HTML 字符串
 */
export function escapeHtml(s) {
  return String(s).replace(/[&<>\"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
