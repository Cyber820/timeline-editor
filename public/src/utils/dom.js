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

// 读取当前表格中指定属性的所有已占用值（排除某行）
export function getTakenValues(attrKey, exceptRowId) {
  const taken = new Set();
  const rows = document.querySelectorAll(`#styleTableBody tr[data-attr-key="${attrKey}"]`);
  rows.forEach(tr => {
    const rid = tr.dataset.rowId;
    if (rid === exceptRowId) return;
    const vals = window.stateMem?.styleRowSelections?.[rid] || [];
    vals.forEach(v => { if (v) taken.add(String(v)); });
  });
  return taken;
}

// 读取样式行中当前的 type|value，用于去重或比对
export function readRowStyleKey(rowEl) {
  if (!rowEl) return '|';
  const firstTd = rowEl.querySelector('td:first-child');
  const type = firstTd?.dataset?.styleType || '';
  let value = '';
  if (!firstTd) return `${type}|`;

  const sel = firstTd.querySelector('select');
  if (sel) value = sel.value?.trim() || '';

  const color = firstTd.querySelector('input[type="color"]');
  const hexInput = firstTd.querySelector('input[type="text"]');

  const normalizeHex = (v) => {
    if (!v) return '';
    let s = String(v).trim().toUpperCase();
    if (!s.startsWith('#')) s = '#' + s;
    return s;
  };

  if (color && color.value) {
    value = normalizeHex(color.value);
  } else if (hexInput && hexInput.value) {
    value = normalizeHex(hexInput.value);
  }

  return `${type}|${value}`;
}
