// public/src/_staging/constants.js
// ⚠️ 现在不被任何页面 import。作为“停机位/镜像”集中放可配置项与纯函数。
// 等第二遍“统一接线”时，再从各处删掉硬编码并统一引用这里的导出。

/* =========================
 * 基本默认配置
 * ========================= */
export const DEFAULTS = {
  SELECTOR_BASE: '.vis-item.event, .vis-item-content.event',
  TITLE_SELECTOR: '.event-title',
  BORDER_WIDTH_PX: 2, // 统一边框宽度（最终以后由后端 compiler/constants.js 控制）
};

/* =========================
 * 接口地址
 * ========================= */
export const ENDPOINT =
  'https://script.google.com/macros/s/AKfycbxe-P-iT8Jv8xSNTqdYB7SMi4sy2pPl8lLZ2EWqaXsP-jz6nfsxdJ1a0lzNSGB-e_1U/exec';

/* =========================
 * 文案/标签映射 & 颜色预设
 * ========================= */
export const attributeLabels = {
  EventType: '事件类型',
  Region: '地区',
  Platform: '平台类型',
  Company: '公司',
  ConsolePlatform: '主机类型',
  Tag: '标签', // 面板常用，补上
};

export const PRESET_COLORS = [
  { name: '琥珀', hex: '#F59E0B' },
  { name: '靛蓝', hex: '#6366F1' },
  { name: '祖母绿', hex: '#10B981' },
  { name: '玫红', hex: '#F43F5E' },
  { name: '天青', hex: '#0EA5E9' },
  { name: '紫罗兰', hex: '#8B5CF6' },
  { name: '青柠', hex: '#84CC16' },
  { name: '橙',   hex: '#F97316' },
  { name: '洋红', hex: '#D946EF' },
];

export const STYLE_LABELS = {
  fontFamily: '字体',
  fontColor: '字体颜色',
  borderColor: '事件框颜色',
  backgroundColor: '事件框填充色',
  haloColor: '光晕颜色',
  none: '无',
};

export function styleLabel(key) {
  return STYLE_LABELS[key] || key; // 兜底：未知键名就原样显示
}

/* =========================
 * 归一化工具
 * ========================= */
export function normalizeToArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return [raw];
  if (raw && typeof raw === 'object') {
    try {
      // 例如 ConsolePlatform: { 平台A:[...], 平台B:[...] }
      return Object.values(raw).flat().filter(Boolean);
    } catch {
      // 无 .flat() 的极端环境
      let out = [];
      Object.keys(raw).forEach((k) => {
        const v = raw[k];
        if (Array.isArray(v)) out = out.concat(v);
        else if (v) out.push(v);
      });
      return out;
    }
  }
  return [];
}

export function normalizeToStringArray(raw) {
  return normalizeToArray(raw).map((v) => (v == null ? '' : String(v)));
}

/* =========================
 * 过滤相关纯函数
 * ========================= */
// 从传入的 options 中取候选，不依赖全局
export function getFilterOptionsForKeyFrom(options, key) {
  if (!options) return [];
  if (key === 'ConsolePlatform') {
    return normalizeToArray(options.ConsolePlatform);
  }
  return normalizeToArray(options[key]);
}

// 被选集合里是否包含给定值（值可为标量或数组）
export function valueInSelected(val, selectedArr) {
  const selected = normalizeToStringArray(selectedArr || []);
  if (!selected.length) return false;
  const values = normalizeToStringArray(val);
  return values.some((v) => selected.includes(v));
}

export function passesAndLogicFilters(item, filters) {
  return Object.entries(filters || {}).every(([key, values]) =>
    valueInSelected(item?.[key], values),
  );
}

export function passesOrLogicFilters(item, filters) {
  return Object.entries(filters || {}).some(([key, values]) =>
    valueInSelected(item?.[key], values),
  );
}

// 按 filters + logic 过滤 items，返回新数组
export function filterItems(items, filters, logic = 'and') {
  if (!filters || !Object.keys(filters).length) return items || [];
  const fn = logic === 'or' ? passesOrLogicFilters : passesAndLogicFilters;
  return (items || []).filter((it) => fn(it, filters));
}

/* =========================
 * 文本提取 & 事件映射
 * ========================= */
// 从 blob（如 title 文本）里提取形如 “标签：值” 的中文标注
export function pickLabeledFromBlob(blob, label) {
  if (!blob) return '';
  const m = new RegExp(`${label}：([^\\n]+)`).exec(String(blob));
  return m ? m[1].trim() : '';
}

// 统一把 Tag 转为数组
export function normalizeTagArray(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// 原始事件 → vis item 的“纯函数”映射（无副作用）
export function mapEventToItem(event, index = 0) {
  const contentText = event.content ?? event.Title ?? '(无标题)';
  const Start = event.Start ?? event.start ?? '';
  const End = event.End ?? event.end ?? '';
  const blob = (event.title ?? '').toString();

  const EventType = event.EventType ?? event.eventType ?? pickLabeledFromBlob(blob, '事件类型');
  const Region = event.Region ?? event.region ?? pickLabeledFromBlob(blob, '地区');
  const Platform = event.Platform ?? event.platform ?? pickLabeledFromBlob(blob, '平台类型');
  const Company = event.Company ?? event.company ?? pickLabeledFromBlob(blob, '公司');
  const Status = event.Status ?? event.status ?? pickLabeledFromBlob(blob, '状态');
  const ConsolePlatform =
    event.ConsolePlatform ?? event.consolePlatform ?? pickLabeledFromBlob(blob, '主机类型');

  const TagRaw = event.Tag ?? event.tag ?? pickLabeledFromBlob(blob, '标签');
  const Tag = normalizeTagArray(TagRaw);

  const tooltipHtml = blob
    ? blob.replace(/\n/g, '<br>')
    : [
        `事件名称：${contentText}`,
        `事件类型：${EventType || ''}`,
        `时间：${Start || ''}${End ? ' ~ ' + End : ''}`,
        `状态：${Status || ''}`,
        `地区：${Region || ''}`,
        `平台类型：${Platform || ''}`,
        `主机类型：${ConsolePlatform || ''}`,
        `公司：${Company || ''}`,
      ].join('<br>');

  return {
    id: event.id || `auto-${index + 1}`,
    content: contentText,
    start: Start,
    end: End || undefined,
    title: tooltipHtml,
    EventType,
    Region,
    Platform,
    Company,
    Status,
    ConsolePlatform,
    Tag,
  };
}

/* =========================
 * vis Timeline 选项预设（可选）
 * ========================= */
export const TIMELINE_DEFAULT_OPTIONS = {
  locale: 'zh-cn',
  editable: false,
  margin: { item: 10, axis: 50 },
  orientation: { axis: 'bottom', item: 'bottom' },
  tooltip: { followMouse: true, overflowMethod: 'flip' },
  verticalScroll: true,
  zoomKey: 'ctrlKey',
  stack: true,
};

// 生成规则行 id（纯函数/无全局副作用）
export const createRowId = (() => {
  let counter = 0;
  return () => `row-${++counter}`;
})();

// 简单去重
export function uniq(arr) {
  const set = new Set(arr || []);
  return Array.from(set);
}

// 校验：同一属性是否允许切换到目标样式类型（保留 'none'）
export function canBindStyleType(boundMap, attrKey, nextType) {
  if (nextType === 'none') return true;
  const owner = Object.entries(boundMap).find(([k, v]) => v === nextType && k !== attrKey);
  return !owner; // 该样式类型还未被其他属性占用
}

// 通用 ID 生成器：优先用 UUID，回退到时间戳+随机
export function genId(prefix = 'r_') {
  const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return prefix ? `${prefix}${uuid}` : uuid;
}

// 纯函数版本：在给定的规则表上确保 attrKey 存在并返回数组
export function ensureBucketIn(rulesMap, attrKey) {
  if (!rulesMap[attrKey]) rulesMap[attrKey] = [];
  return rulesMap[attrKey];
}

// 在给定规则表中按 attrKey/rowId 查找规则（无全局依赖）
export function findRuleIn(rulesMap, attrKey, rowId) {
  const bucket = (rulesMap && rulesMap[attrKey]) || [];
  return bucket.find(r => r.id === rowId) || null;
}

// UI 下拉到内部键名映射：'font' => 'fontFamily'
export function uiTypeToInternal(t) {
  return (t === 'font') ? 'fontFamily' : t;
}

// public/src/_staging/constants.js
export function createEmptyRuleForType(type, idFactory = () => `r_${Date.now()}`) {
  const rule = { id: idFactory(), type, style: {}, values: [] };
  if (type === 'fontFamily') {
    rule.style.fontFamily = '';
  } else {
    rule.style[type] = '#000000'; // 颜色默认黑
  }
  return rule;
}
