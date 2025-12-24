// public/src/variant/variant.js
// ✅ 职责：把入口 HTML 注入的 window.TIMELINE_REGION / window.TIMELINE_LANG
//        统一规范化后，映射到对应的 Apps Script endpoints。
// ✅ 你已确定：region = world/china；lang = zh/en

const DEFAULT_REGION = 'world';
const DEFAULT_LANG = 'zh';

function normRegion(v) {
  const s = String(v || '').toLowerCase();
  return s === 'china' ? 'china' : 'world';
}

function normLang(v) {
  const s = String(v || '').toLowerCase();
  return s === 'zh' ? 'zh' : 'en';
}

/**
 * endpoint 映射表
 * - key：`${region}-${lang}`，例如 world-zh
 * - value：按功能域拆分 endpoints：
 *   - events：时间轴事件数据（vis items 的来源）
 *   - options：下拉框/字典数据（Region/Platform/EventType/Tags 等）
 *   - feedback：用户反馈/匿名提交等写入入口
 *
 * 当前你只给了“世界-中文（world-zh）”的 App Script 地址，
 * 因此先只填写 world-zh.events，其它先置为 null（后续补齐即可）。
 */
const ENDPOINTS = {
  'world-zh': {
    events:
      'https://script.google.com/macros/s/AKfycbzap5kVZa7uqJRE47b-Bt5C4OmjnMhX-vIaOtRiSQko2eLcDe9zl3oc4U_Q66Uwkjex/exec',
    options: null,
    feedback: null,
  },

  // 其余 variant 先占位：你后续拿到地址后再补齐
  'world-en': {
    events: 
      'https://script.google.com/macros/s/AKfycbz35orwFbKvmycicLwu2hBkTmSryjHipV4pFR8S8sO3TcoltUYJ5ssfBJmDCgjmry7zZA/exec',
    options: null,
    feedback: null,
  },
  'china-zh': {
    events: 
      'https://script.google.com/macros/s/AKfycbzzQzEJB8V94Kl74kLmIAbIoM4ioA7Ux6fQ13MDDrP7_nu82ScpDr47anI7slJRHDCX/exec',
    options: null,
    feedback: null,
  },
  'china-en': {
    events: 
      'https://script.google.com/macros/s/AKfycbwDJZR9Gx4BhyGYJ9l17BfkSbbEqgFlbVyUigkVoIaZwuuiYM_ShwH8Ckb5JHtlWrcYSg/exec',
    options: null,
    feedback: null,
  },
};

export function getVariant() {
  const regionRaw = globalThis.TIMELINE_REGION ?? DEFAULT_REGION;
  const langRaw = globalThis.TIMELINE_LANG ?? DEFAULT_LANG;

  const region = normRegion(regionRaw);
  const lang = normLang(langRaw);
  const key = `${region}-${lang}`;

  // 若 key 未配置，兜底到 world-zh（因为你目前只提供了它）
  const endpoints = ENDPOINTS[key] || ENDPOINTS['world-zh'];

  return Object.freeze({
    region,
    lang,
    key,
    endpoints,
    ui: Object.freeze({}),
  });
}
