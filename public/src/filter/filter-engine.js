// public/src/filter/filter-engine.js
// ✅ 过滤引擎：提供 keys / values / key→label
// - getOptionKeys(items?)
// - getOptionsForKey(items, key)
// - keyToLabel(key)
//
// 本次修改目标：Field 属性名随语言切换（中/英）
// - 不依赖 ui-text 的 t()，避免新链路

import { getVariant } from '../variant/variant.js';
import { getAttributeLabelsByLang } from '../_staging/constants.js';

/** 取当前语言：优先 variant.lang，其次 globalThis.TIMELINE_LANG */
function pickLang() {
  try {
    const v = typeof getVariant === 'function' ? getVariant() : null;
    const lang = (v?.lang || globalThis?.TIMELINE_LANG || 'zh').toLowerCase();
    return lang === 'en' ? 'en' : 'zh';
  } catch {
    const lang = String(globalThis?.TIMELINE_LANG || 'zh').toLowerCase();
    return lang === 'en' ? 'en' : 'zh';
  }
}

/** key → UI label（随语言切换） */
export function keyToLabel(key) {
  const lang = pickLang();
  const dict = getAttributeLabelsByLang(lang) || {};
  return dict[key] || key;
}

/** 从 items 中推断可过滤的 keys（UI 层会再做白名单/黑名单处理） */
export function getOptionKeys(items = []) {
  const list = Array.isArray(items) ? items : [];
  const set = new Set();

  list.forEach((it) => {
    if (!it || typeof it !== 'object') return;
    Object.keys(it).forEach((k) => set.add(k));
  });

  return Array.from(set);
}

/** 获取某 key 的可选值（去重排序）；支持字段值为 string/number/array */
export function getOptionsForKey(items = [], key) {
  const list = Array.isArray(items) ? items : [];
  const set = new Set();

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
