// public/src/_staging/constants.js
// ⚠️ 现在不被引用。先集中放“可配置项”，等迁移时从各处删掉硬编码，再统一引用。

export const DEFAULTS = {
  SELECTOR_BASE: '.vis-item.event, .vis-item-content.event',
  TITLE_SELECTOR: '.event-title',
  BORDER_WIDTH_PX: 2,     // 统一边框宽度（仅作为默认；实际以后由后端 compiler/constants.js 控制）
};

// public/src/_staging/constants.js

export const ENDPOINT = "https://script.google.com/macros/s/AKfycbxe-P-iT8Jv8xSNTqdYB7SMi4sy2pPl8lLZ2EWqaXsP-jz6nfsxdJ1a0lzNSGB-e_1U/exec";

export const attributeLabels = {
  EventType: "事件类型",
  Region: "地区",
  Platform: "平台类型",
  Company: "公司",
  ConsolePlatform: "主机类型",
  Tag: "标签" // 建议补上，面板里常用
};

export const PRESET_COLORS = [
  { name: '琥珀',   hex: '#F59E0B' },
  { name: '靛蓝',   hex: '#6366F1' },
  { name: '祖母绿', hex: '#10B981' },
  { name: '玫红',   hex: '#F43F5E' },
  { name: '天青',   hex: '#0EA5E9' },
  { name: '紫罗兰', hex: '#8B5CF6' },
  { name: '青柠',   hex: '#84CC16' },
  { name: '橙',     hex: '#F97316' },
  { name: '洋红',   hex: '#D946EF' }
];

export const STYLE_LABELS = {
  fontFamily: '字体',
  fontColor: '字体颜色',
  borderColor: '事件框颜色',
  backgroundColor: '事件框填充色',
  haloColor: '光晕颜色',
  none: '无'
};

// 在 constants.js 里
export function styleLabel(key) {
  return STYLE_LABELS[key] || key; // 兜底：未知键名就原样显示
}



import { normalizeToArray } from './constants.js'; // 若与本文件同源可省略import

// 纯函数：从传入的 options 中取候选，完全不依赖全局
export function getFilterOptionsForKeyFrom(options, key) {
  if (!options) return [];
  if (key === 'ConsolePlatform') {
    return normalizeToArray(options.ConsolePlatform);
  }
  return normalizeToArray(options[key]);
}

// 若已在本文件里：可直接用；否则用你现有版本
export function normalizeToArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return [raw];
  if (raw && typeof raw === 'object') {
    try { return Object.values(raw).flat().filter(Boolean); } catch {
      var out = [];
      Object.keys(raw).forEach(k => {
        var v = raw[k];
        if (Array.isArray(v)) out = out.concat(v);
        else if (v) out.push(v);
      });
      return out;
    }
  }
  return [];
}

export function normalizeToStringArray(raw) {
  return normalizeToArray(raw).map(v => (v == null ? '' : String(v)));
}

// 纯粹：被选集合里是否包含给定值（值可为标量或数组）
export function valueInSelected(val, selectedArr) {
  const selected = normalizeToStringArray(selectedArr || []);
  if (!selected.length) return false;
  const values = normalizeToStringArray(val);
  return values.some(v => selected.includes(v));
}

export function passesAndLogicFilters(item, filters) {
  return Object.entries(filters || {}).every(([key, values]) =>
    valueInSelected(item?.[key], values)
  );
}

export function passesOrLogicFilters(item, filters) {
  return Object.entries(filters || {}).some(([key, values]) =>
    valueInSelected(item?.[key], values)
  );
}

// 纯粹：按 filters + logic 过滤 items，返回新数组
export function filterItems(items, filters, logic = 'and') {
  if (!filters || !Object.keys(filters).length) return items || [];
  const fn = logic === 'or' ? passesOrLogicFilters : passesAndLogicFilters;
  return (items || []).map(it => it).filter(it => fn(it, filters));
}
