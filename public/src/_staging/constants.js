// public/src/_staging/constants.js
// ⚠️ 现在不被引用。先集中放“可配置项”，等迁移时从各处删掉硬编码，再统一引用。

export const DEFAULTS = {
  SELECTOR_BASE: '.vis-item.event, .vis-item-content.event',
  TITLE_SELECTOR: '.event-title',
  BORDER_WIDTH_PX: 2,     // 统一边框宽度（仅作为默认；实际以后由后端 compiler/constants.js 控制）
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
  { name: '洋红',   hex: '#D946EF' },
];
