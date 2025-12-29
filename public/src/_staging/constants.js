// public/src/_staging/constants.js
// ✅ 集中配置项与纯函数（含 attributeLabels 等）
// ⚠️ 你原本文件里除 attributeLabels 外的其它导出（DEFAULTS / ENGINE_KEY_MAP / buildEngineStyleState / styleLabel 等）
//    请保持不变，直接粘贴回下面 “// === 你的原内容开始/结束 ===” 区域。

/* =========================
 * 属性显示名（中文，保持原样）
 * ========================= */
export const attributeLabels = {
  EventType: '事件类型',
  Region: '地区',
  Platform: '平台类型',
  Company: '公司',
  ConsolePlatform: '主机类型',
  Importance: '重要性',

  // 你原来可能还有：
  // Tag: '标签',
  // Status: '状态',
  // Start: '开始时间',
  // End: '结束时间',
  // ...
};

/* =========================
 * 属性显示名（英文，新加）
 * - 只用于 UI 展示，不影响数据 key
 * ========================= */
export const attributeLabelsEn = {
  EventType: 'Event Type',
  Region: 'Region',
  Platform: 'Platform',
  Company: 'Company',
  ConsolePlatform: 'Console Platform',
  Importance: 'Importance',

  // 如你将来需要：
  // Tag: 'Tags',
  // Status: 'Status',
  // Start: 'Start',
  // End: 'End',
  // ...
};

/* =========================
 * === 你的原内容开始 ===
 * 把你当前 constants.js 里其余内容完整放回这里
 * （例如 DEFAULTS / ENGINE_KEY_MAP / buildEngineStyleState / styleLabel / STYLE_LABELS 等）
 * ========================= */

// export const DEFAULTS = ...
// export const ENGINE_KEY_MAP = ...
// export function buildEngineStyleState(...) { ... }
// export const STYLE_LABELS = ...
// export function styleLabel(type) { ... }
// ...

/* =========================
 * === 你的原内容结束 ===
 * ========================= */
