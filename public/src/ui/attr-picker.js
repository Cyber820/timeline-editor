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

export function confirmAttrPicker() {
  const { rowId, attrKey } = attrPickerEditing || {};
  const sel = document.getElementById('attr-picker-options');
  const modal = document.getElementById('attr-picker-window');

  // 防御：缺少编辑状态或控件
  if (!rowId || !attrKey || !sel) {
    if (modal && modal.style) modal.style.display = 'none';
    attrPickerEditing = { rowId: null, attrKey: null };
    return;
  }

  // 读取当前选择并去重
  const vals = Array.from(sel.selectedOptions || []).map(o => o.value);
  const uniqueVals = Array.from(new Set(vals));

  // 校验冲突（即使 open 时已过滤，这里再保险一次）
  if (typeof getTakenValues === 'function') {
    const takenByOthers = getTakenValues(attrKey, rowId); // Set
    const conflict = uniqueVals.find(v => takenByOthers.has(v));
    if (conflict) {
      alert(`“${conflict}” 已被同属性的其他样式行占用，请取消或更换。`);
      return;
    }
  }

  // 写回规则
  const rule = (typeof findRule === 'function') ? findRule(attrKey, rowId) : null;
  if (!rule) {
    if (modal && modal.style) modal.style.display = 'none';
    attrPickerEditing = { rowId: null, attrKey: null };
    return;
  }
  rule.values = uniqueVals;

  // 同步旧的行缓存（兼容旧结构）
  if (typeof window !== 'undefined' && window.styleRowSelections) {
    window.styleRowSelections[rowId] = uniqueVals;
  }

  // 回填标签
  if (typeof renderRowAttrChips === 'function') {
    renderRowAttrChips(rowId, uniqueVals);
  }

  // 关闭弹窗 & 重置编辑态
  if (modal && modal.style) modal.style.display = 'none';
  attrPickerEditing = { rowId: null, attrKey: null };
}

export function closeAttrPicker() {
  const m = document.getElementById('attr-picker-window');
  if (m && m.style) m.style.display = 'none';
}

export function selectAllInAttrPicker() {
  const sel = document.getElementById('attr-picker-options');
  if (!sel) return;

  const vals = Array.from(sel.options || []).map(o => o.value).filter(Boolean);

  if (attrPickerChoices) {
    // 清空已有 token（防止重复）
    if (typeof attrPickerChoices.removeActiveItems === 'function') {
      try { attrPickerChoices.removeActiveItems(); } catch {}
    }

    // 同步底层 <option>
    Array.from(sel.options).forEach(o => { o.selected = vals.includes(o.value); });

    // 让 Choices UI 同步（不同版本 API 兼容）
    if (vals.length) {
      if (typeof attrPickerChoices.setChoiceByValue === 'function') {
        attrPickerChoices.setChoiceByValue(vals);
      } else if (typeof attrPickerChoices.setValue === 'function') {
        attrPickerChoices.setValue(vals);
      }
    }
  } else {
    // 没用 Choices 的退化情况
    Array.from(sel.options).forEach(o => { o.selected = true; });
  }

  // 触发一次 change，确保 UI 状态同步
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

export function clearAttrPicker() {
  const sel = document.getElementById('attr-picker-options');
  if (!sel) return;

  if (attrPickerChoices) {
    if (typeof attrPickerChoices.removeActiveItems === 'function') {
      try { attrPickerChoices.removeActiveItems(); } catch {}
    }
    Array.from(sel.options).forEach(o => { o.selected = false; });
  } else {
    Array.from(sel.options).forEach(o => { o.selected = false; });
  }

  sel.dispatchEvent(new Event('change', { bubbles: true }));
}
