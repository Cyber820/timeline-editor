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

// 工具：把任意输入规整为一维数组（尽量保留原值，不强制转字符串）
export function normalizeToArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return [raw];
  if (raw && typeof raw === 'object') {
    // 例如 ConsolePlatform 是 { 平台A: [...], 平台B: [...] }
    try {
      return Object.values(raw).flat().filter(Boolean);
    } catch (e) {
      // 极端环境无 .flat()
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

