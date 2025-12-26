// public/src/ui-text/index.js
// ✅ 职责：根据当前 variant.lang 选择语言包，并提供 t(key) 翻译函数

import { getVariant } from '../variant/variant.js';
import ZH from './zh.js';
import EN from './en.js';

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

function getDict() {
  const lang = pickLang();
  return lang === 'en' ? EN : ZH;
}

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
    else return undefined;
  }
  return cur;
}

/**
 * t(key, params?)
 * - key: 'info.feedback.title' 这种点路径
 * - params: { name: 'xx' } 用于简单模板替换： "Hello {name}"
 */
export function t(key, params = null) {
  const dict = getDict();
  let val = getByPath(dict, key);

  // fallback：如果没找到英文，就退回中文
  if (val == null) {
    val = getByPath(ZH, key);
  }

  if (val == null) return String(key);

  let s = String(val);
  if (params && typeof params === 'object') {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

export function getUIText() {
  return getDict();
}
