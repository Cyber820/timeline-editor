// public/src/variant/variant.js
// ✅ 职责：读取入口 HTML 注入的 window.TIMELINE_REGION / window.TIMELINE_LANG，
//        规范化后映射到对应的 Apps Script endpoints。
// ✅ 约定：region = world/china；lang = zh/en

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
 * 当前先只接入 events；options/feedback 未来补齐。
 */
const ENDPOINTS = {
  'world-zh': {
    events:
      'https://script.google.com/macros/s/AKfycbzap5kVZa7uqJRE47b-Bt5C4OmjnMhX-vIaOtRiSQko2eLcDe9zl3oc4U_Q66Uwkjex/exec',
    options: null,
    feedback: null,
  },
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

  // 兜底顺序：key -> 默认组合 -> 最终保底（world-zh）
  const defaultKey = `${DEFAULT_REGION}-${DEFAULT_LANG}`;
  const endpoints =
    ENDPOINTS[key] || ENDPOINTS[defaultKey] || ENDPOINTS['world-zh'];

  // 开发期提示：如果发生兜底，说明入口注入或配置可能有误
  if (!ENDPOINTS[key]) {
    console.warn(
      `[variant] missing key "${key}", fallback to "${defaultKey}"`,
      { regionRaw, langRaw }
    );
  }

  return Object.freeze({
    region,
    lang,
    key,
    endpoints: Object.freeze({ ...endpoints }),
    ui: Object.freeze({}),
  });
}
