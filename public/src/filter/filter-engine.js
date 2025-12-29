// public/src/filter/filter-engine.js
// ✅ 职责：过滤引擎（从 items 中提取可选键/值 + key 的展示名）
// - getOptionKeys(items?)
// - getOptionsForKey(items, key)
// - keyToLabel(key)
//
// ⚠️ 本次仅做“Field 属性名国际化”
// - 中文：使用 attributeLabels
// - 英文：使用 attributeLabelsEn
// - 不依赖 ui-text 的 t()，避免引入新链路

import { getVariant } from '../variant/variant.js';
import { attributeLabels, attributeLabelsEn } from '../_staging/constants.js';

/** 取当前语言：优先 variant.lang，其次 globalThis.TIMELINE_LANG */
function pickLang() {
  try {
    const v = getVariant?.();
    const lang = (v?.lang || globalThis.TIMELINE_LANG || 'zh').toLowerCase();
    return lang === 'en' ? 'en' : 'zh';
  } catch {
    const lang = String(globalThis.TIMELINE_LANG || 'zh').toLowerCase();
    return lang === 'en' ? 'en' : 'zh';
  }
}

/** key → UI label（随语言切换） */
export function keyToLabel(key) {
  const lang = pickLang();
  const dict = lang === 'en' ? (attributeLabelsEn || {}) : (attributeLabels || {});
  return dict[key] || key;
}

/**
 * 从 items 推断可过滤的 keys
 * - 你现有的 filter/filter-ui.js 会再做 UI 层过滤（如移除 Tag、补 Importance）
 */
export function getOptionKeys(items = []) {
  const set = new Set();
  const list = Array.isArray(items) ? items : [];
  list.forEach((it) => {
    if (!it || typeof it !== 'object') return;
    Object.keys(it).forEach((k) => set.add(k));
  });

  // 常见：过滤系统只关心这几个 key（但这里不强制，保持通用）
  // 由 UI 层 prepareAttrOptions() 决定最终展示。
  return Array.from(set);
}

/**
 * 获取某个 key 的可选值集合（去重排序）
 * - 支持字段值为 string/number/array
 */
export function getOptionsForKey(items = [], key) {
  const set = new Set();
  const list = Array.isArray(items) ? items : [];
  list.forEach((it) => {
    if (!it || typeof it !== 'object') return;
    const v = it[key];
    if (v == null) return;

    if (Array.isArray(v)) {
      v.forEach((x) => {
        const s = x == null ? '' : String(x).trim();
        if (s) set.add(s);
      });
      return;
    }

    const s = String(v).trim();
    if (s) set.add(s);
  });

  return Array.from(set).sort((a, b) => String(a).localeCompare(String(b)));
}
