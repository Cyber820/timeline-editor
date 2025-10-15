// src/ui/attr-picker.js
import { getFilterOptionsForKeyFrom } from '../_staging/constants.js';
// import { findRule, getTakenValues } from './style-panel.js'; // 之后再接

let attrPickerEditing = { rowId: null, attrKey: null };
let attrPickerChoices = null;

/** 打开属性选择弹窗 */
export function openAttrPicker(rowId, attrKey) {
  attrPickerEditing = { rowId, attrKey };
  const modal = document.getElementById('attr-picker-window');
  const title = document.getElementById('attr-picker-title');
  const hint  = document.getElementById('attr-picker-hint');
  const sel   = document.getElementById('attr-picker-options');
  if (!modal || !title || !hint || !sel) return;

  const labels = (typeof window !== 'undefined' && window.attributeLabels) || {};
  const cn = labels[attrKey] || attrKey;
  title.textContent = '选择应用的属性值';
  hint.textContent  = cn + '：可多选，可搜索';

  const attrNameSpan = document.getElementById('attr-picker-attrname');
  if (attrNameSpan) attrNameSpan.textContent = cn;

  if (attrPickerChoices?.destroy) { try { attrPickerChoices.destroy(); } catch {} }
  sel.innerHTML = '';

  // TODO: findRule, getFilterOptionsForKey, getTakenValues 引入后替换下列临时写法
  const rule = null;
  const pre  = [];

  const opts = window.allOptions?.[attrKey] || [];
  const all = Array.isArray(opts) ? opts : (opts ? Object.values(opts).flat() : []);
  const takenByOthers = new Set();
  const options = all.filter(v => pre.includes(v) || !takenByOthers.has(v));

  options.forEach(v => sel.appendChild(new Option(v, v, false, pre.includes(v))));

  if (typeof window.Choices === 'function') {
    attrPickerChoices = new window.Choices(sel, {
      removeItemButton: true,
      shouldSort: false,
      searchPlaceholderValue: '搜索…',
      position: 'bottom',
    });
  }

  modal.style.display = 'block';
}
