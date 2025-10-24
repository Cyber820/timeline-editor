// public/src/_staging/constants.js
// ✅ 用途：集中放可配置项与纯函数，以便第二轮“统一接线”时移除散落的硬编码。
// ⚠️ 当前仍未被任何页面 import，作为“停机位/镜像”存在。

/* =========================================================
 * 0) 版本标识（便于排查与灰度）
 * ======================================================= */
export const CONSTS_VERSION = 'constants@1.1.0';

/* =========================================================
 * 1) 基本默认配置（支持全局覆盖）
 *    - 可通过 globalThis.DEFAULTS_OVERRIDE 在接线期做灰度
 * ======================================================= */
export const DEFAULTS = Object.freeze({
  SELECTOR_BASE: '.vis-item.event, .vis-item-content.event',
  TITLE_SELECTOR: '.event-title',
  BORDER_WIDTH_PX: 2, // 统一边框宽度（最终以后由后端 compiler/constants.js 控制）
  ...(globalThis?.DEFAULTS_OVERRIDE || {}),
});

/* =========================================================
 * 2) 接口地址（支持 global 覆盖；便于环境切换）
 * ======================================================= */
export const ENDPOINT =
  globalThis?.TIMELINE_ENDPOINT ||
  'https://script.google.com/macros/s/AKfycbxe-P-iT8Jv8xSNTqdYB7SMi4sy2pPl8lLZ2EWqaXsP-jz6nfsxdJ1a0lzNSGB-e_1U/exec';

/* =========================================================
 * 3) 字段映射（统一规范后端字段名 → 前端键）
 *    - 若 Apps Script/Sheet 字段变动，只改这里
 * ======================================================= */
export const FIELD = Object.freeze({
  id: 'ID',
  title: 'Title',
  start: 'Start',
  end: 'End',
  company: 'Company',
  region: 'Region',
  platform: 'Platform',
  consolePlatform: 'ConsolePlatform',
  eventType: 'EventType',
  desc: 'Description',
  tag: 'Tag',
  status: 'Status',
});

/* =========================================================
 * 4) 展示标签 / 颜色预设
 * ======================================================= */
export const attributeLabels = Object.freeze({
  EventType: '事件类型',
  Region: '地区',
  Platform: '平台类型',
  Company: '公司',
  ConsolePlatform: '主机类型',
  Tag: '标签',
  Status: '状态',
});

export const PRESET_COLORS = Object.freeze([
  { name: '琥珀', hex: '#F59E0B' },
  { name: '靛蓝', hex: '#6366F1' },
  { name: '祖母绿', hex: '#10B981' },
  { name: '玫红', hex: '#F43F5E' },
  { name: '天青', hex: '#0EA5E9' },
  { name: '紫罗兰', hex: '#8B5CF6' },
  { name: '青柠', hex: '#84CC16' },
  { name: '橙',   hex: '#F97316' },
  { name: '洋红', hex: '#D946EF' },
]);

export const STYLE_LABELS = Object.freeze({
  fontFamily: '字体',
  fontColor: '字体颜色',
  borderColor: '事件框颜色',
  backgroundColor: '事件框填充色',
  haloColor: '光晕颜色',
  none: '无',
});

export function styleLabel(key) {
  return STYLE_LABELS[key] || key; // 兜底：未知键名原样显示
}

/* =========================================================
 * 5) 归一化工具（对输入多态更宽容）
 * ======================================================= */
export function normalizeToArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (raw instanceof Set) return Array.from(raw);
  if (raw instanceof Map) return Array.from(raw.values());
  const t = typeof raw;
  if (t === 'string') return [raw];
  if (t === 'number' || t === 'boolean') return [raw];
  if (t === 'object') {
    try {
      // 例如 ConsolePlatform: { 平台A:[...], 平台B:[...] }
      return Object.values(raw).flat().filter(Boolean);
    } catch {
      // 无 .flat() 的极端环境
      let out = [];
      Object.keys(raw).forEach((k) => {
        const v = raw[k];
        if (Array.isArray(v)) out = out.concat(v);
        else if (v != null) out.push(v);
      });
      return out;
    }
  }
  return [];
}

export function normalizeToStringArray(raw) {
  return normalizeToArray(raw).map((v) => (v == null ? '' : String(v)));
}

/* =========================================================
 * 6) 过滤相关纯函数
 *    - 约定：filters 中空数组/空值将自动忽略（不参与过滤）
 * ======================================================= */
export function getFilterOptionsForKeyFrom(options, key) {
  if (!options) return [];
  if (key === 'ConsolePlatform') {
    return normalizeToArray(options.ConsolePlatform);
  }
  return normalizeToArray(options[key]);
}

export function valueInSelected(val, selectedArr) {
  const selected = normalizeToStringArray(selectedArr || []);
  if (!selected.length) return true; // 空选择 → 不限制
  const values = normalizeToStringArray(val);
  if (!values.length) return false;
  return values.some((v) => selected.includes(v));
}

export function passesAndLogicFilters(item, filters) {
  const entries = Object.entries(filters || {}).filter(
    ([, v]) => normalizeToStringArray(v).length > 0,
  );
  if (!entries.length) return true; // 过滤器全空等同于不过滤
  return entries.every(([key, values]) => valueInSelected(item?.[key], values));
}

export function passesOrLogicFilters(item, filters) {
  const entries = Object.entries(filters || {}).filter(
    ([, v]) => normalizeToStringArray(v).length > 0,
  );
  if (!entries.length) return true;
  return entries.some(([key, values]) => valueInSelected(item?.[key], values));
}

export function filterItems(items, filters, logic = 'and') {
  const list = Array.isArray(items) ? items : [];
  const fn = logic === 'or' ? passesOrLogicFilters : passesAndLogicFilters;
  return fn === passesAndLogicFilters && (!filters || !Object.keys(filters).length)
    ? list
    : list.filter((it) => fn(it, filters));
}

/* =========================================================
 * 7) 文本提取 & 标签归一
 *    - 支持“标签：aaa, bbb”“标签: aaa，bbb”各种中英标点
 * ======================================================= */
export function pickLabeledFromBlob(blob, label) {
  if (!blob) return '';
  // 支持全角/半角冒号、可选空格；只取到换行前
  const re = new RegExp(`${label}[：:][\\s]*([^\\n]+)`);
  const m = re.exec(String(blob));
  return m ? m[1].trim() : '';
}

export function normalizeTagArray(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean).map((s) => String(s).trim());
  // 兼容中文逗号、分号、竖线
  return String(raw || '')
    .split(/[,\uFF0C;\uFF1B|]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* =========================================================
 * 8) 事件字段归一化 & 映射到 vis item
 *    - 优先使用 FIELD 映射；其次兼容旧键；最后尝试从 title blob 提取
 * ======================================================= */
function readByField(obj, fieldKey) {
  const name = FIELD[fieldKey];
  return obj?.[name];
}

function coalesce(...vals) {
  for (const v of vals) if (v != null && v !== '') return v;
  return '';
}

export function mapEventToItem(event, index = 0) {
  // 基本字段（优先 FIELD，其次兼容旧字段）
  const id = coalesce(readByField(event, 'id'), event.id, `auto-${index + 1}`);
  const titleText = coalesce(readByField(event, 'title'), event.title, event.content, '(无标题)');

  const Start = coalesce(readByField(event, 'start'), event.Start, event.start);
  const End = coalesce(readByField(event, 'end'), event.End, event.end);

  // 可能出现在 title 的“展示用块”
  const blob = String(coalesce(readByField(event, 'title'), event.title, ''));

  const EventType = coalesce(
    readByField(event, 'eventType'),
    event.EventType,
    event.eventType,
    pickLabeledFromBlob(blob, '事件类型'),
  );

  const Region = coalesce(
    readByField(event, 'region'),
    event.Region,
    event.region,
    pickLabeledFromBlob(blob, '地区'),
  );

  const Platform = coalesce(
    readByField(event, 'platform'),
    event.Platform,
    event.platform,
    pickLabeledFromBlob(blob, '平台类型'),
  );

  const Company = coalesce(
    readByField(event, 'company'),
    event.Company,
    event.company,
    pickLabeledFromBlob(blob, '公司'),
  );

  const Status = coalesce(
    readByField(event, 'status'),
    event.Status,
    event.status,
    pickLabeledFromBlob(blob, '状态'),
  );

  const ConsolePlatform = coalesce(
    readByField(event, 'consolePlatform'),
    event.ConsolePlatform,
    event.consolePlatform,
    pickLabeledFromBlob(blob, '主机类型'),
  );

  const TagRaw = coalesce(readByField(event, 'tag'), event.Tag, event.tag, pickLabeledFromBlob(blob, '标签'));
  const Tag = normalizeTagArray(TagRaw);

  const Desc = coalesce(readByField(event, 'desc'), event.Description, event.desc, '');

  const tooltipHtml =
    blob && blob.trim().length > 0
      ? blob.replace(/\n/g, '<br>')
      : [
          `事件名称：${titleText}`,
          `事件类型：${EventType || ''}`,
          `时间：${Start || ''}${End ? ' ~ ' + End : ''}`,
          `状态：${Status || ''}`,
          `地区：${Region || ''}`,
          `平台类型：${Platform || ''}`,
          `主机类型：${ConsolePlatform || ''}`,
          `公司：${Company || ''}`,
          Desc ? `描述：${Desc}` : '',
        ]
          .filter(Boolean)
          .join('<br>');

  return {
    id,
    content: titleText,
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

/* =========================================================
 * 9) vis Timeline 选项预设（可被全局覆盖）
 * ======================================================= */
export const TIMELINE_DEFAULT_OPTIONS = Object.freeze({
  locale: 'zh-cn',
  editable: false,
  margin: { item: 10, axis: 50 },
  orientation: { axis: 'bottom', item: 'bottom' },
  tooltip: { followMouse: true, overflowMethod: 'flip' },
  verticalScroll: true,
  zoomKey: 'ctrlKey',
  stack: true,
  ...(globalThis?.TIMELINE_OPTIONS || {}),
});

/* =========================================================
 * 10) 规则/工具函数
 * ======================================================= */
// 生成规则行 id（纯函数/无全局副作用）
export const createRowId = (() => {
  let counter = 0;
  return () => `row-${++counter}`;
})();

export function uniq(arr) {
  const set = new Set(arr || []);
  return Array.from(set);
}

// 同一 styleType 仅允许被一个 attr 绑定；但允许“同 attr 重复确认”
export function canBindStyleType(boundMap, attrKey, nextType) {
  if (nextType === 'none') return true;
  const owner = Object.entries(boundMap || {}).find(([k, v]) => v === nextType && k !== attrKey);
  return !owner;
}

// 生成稳定 id（尽量优先 crypto）
export function genId(prefix = 'r_') {
  if (typeof crypto !== 'undefined') {
    if (crypto.randomUUID) return prefix ? `${prefix}${crypto.randomUUID()}` : crypto.randomUUID();
    if (crypto.getRandomValues) {
      const a = new Uint32Array(2);
      crypto.getRandomValues(a);
      const uuid = `${a[0].toString(16)}${a[1].toString(16)}`;
      return prefix ? `${prefix}${uuid}` : uuid;
    }
  }
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function ensureBucketIn(rulesMap, attrKey) {
  if (!rulesMap[attrKey]) rulesMap[attrKey] = [];
  return rulesMap[attrKey];
}

export function findRuleIn(rulesMap, attrKey, rowId) {
  const bucket = (rulesMap && rulesMap[attrKey]) || [];
  return bucket.find((r) => r.id === rowId) || null;
}

export function uiTypeToInternal(t) {
  return t === 'font' ? 'fontFamily' : t;
}

export function createEmptyRuleForType(type, idFactory = () => `r_${Date.now()}`) {
  const rule = { id: idFactory(), type, style: {}, values: [] };
  if (type === 'fontFamily') {
    rule.style.fontFamily = '';
  } else {
    rule.style[type] = '#000000'; // 颜色默认黑
  }
  return rule;
}

/* =========================================================
 * 11) 样式键映射（前端面板 → 引擎）
 * ======================================================= */
export const ENGINE_KEY_MAP = Object.freeze({
  font: 'fontFamily',
  fontFamily: 'fontFamily',
  fontColor: 'textColor',
  backgroundColor: 'bgColor',
  borderColor: 'borderColor',
  haloColor: 'haloColor',
  none: 'none',
});

export function toEngineKey(t, map = ENGINE_KEY_MAP) {
  return map[t] || t;
}

/**
 * 将 UI 状态（绑定+规则）构造成引擎可直接消费的状态：
 * {
 *   version: 1,
 *   boundTypes: { EventType: 'textColor', ... },
 *   rules: {
 *     EventType: {
 *       '主机游戏': { textColor:'#fff', bgColor:'#000', ... },
 *       ...
 *     },
 *     ...
 *   }
 * }
 */
export function buildEngineStyleState(
  boundStyleType = {},
  styleRules = {},
  keyMap = ENGINE_KEY_MAP,
) {
  const map = (k) => toEngineKey(k, keyMap);

  // 1) 绑定类型转换
  const boundTypes = {};
  for (const [attr, t] of Object.entries(boundStyleType || {})) {
    boundTypes[attr] = map(t || 'none');
  }

  // 2) 规则展开：按 “属性 → 值 → style slots” 组织
  const rules = {};
  for (const [attr, rows] of Object.entries(styleRules || {})) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const mappedType = boundTypes[attr];
    if (!mappedType || mappedType === 'none') continue;

    for (const row of rows) {
      const k = map(row?.type);
      const st = row?.style || {};
      const vals = Array.isArray(row?.values) ? row.values : [];

      vals.forEach((val) => {
        if (!val) return;
        (rules[attr] ||= {});
        const slot = (rules[attr][val] ||= {});

        if (k === 'textColor' && st.fontColor) slot.textColor = st.fontColor;
        if (k === 'bgColor' && st.backgroundColor) slot.bgColor = st.backgroundColor;
        if (k === 'borderColor' && st.borderColor) slot.borderColor = st.borderColor;
        if (k === 'haloColor' && st.haloColor) slot.haloColor = st.haloColor;
        if (k === 'fontFamily' && st.fontFamily) slot.fontFamily = st.fontFamily;
      });
    }
  }

  return { version: 1, boundTypes, rules };
}
