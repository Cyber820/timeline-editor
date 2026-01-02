// public/src/filter/filter-engine.js
// =============================================================================
// Filter Engine (UI-agnostic)
// =============================================================================
// 职责：
// - 候选项生成：根据 items 计算每个字段的可选值列表（getOptionsForKey）
// - 结果筛选：根据 rules + logic(AND/OR) 返回筛选后的 items（applyFilters）
// - 字段 key ↔ label 的国际化映射（keyToLabel / labelToKey）
//
// 设计目标：
// - 与 UI 解耦：本模块不依赖 DOM、不触发事件，纯函数/可测试。
// - 兼容历史：保留 Tag 归一化与匹配逻辑（即便当前 UI 不展示 Tag）。
//
// 产品化/泛化方向：
// - 当前可过滤字段由 getOptionKeys() 写死返回固定顺序。
// - 若未来做“用户自定义列/表格字段”，应将字段定义下沉为 schema：
//   [{ key, labelKey, type, parseFn, optionsFn, matchFn, ...}]，
//   然后由 schema 驱动 getOptionKeys/getOptionsForKey/matchOne。
// =============================================================================

/* =============================================================================
 * 0) 语言判断（尽量不强依赖其他模块，避免循环依赖）
 * ============================================================================= */

/**
 * getLang()
 * - 优先读取你系统里的 variant（兼容多种全局挂载名）
 * - 次优先读取 TIMELINE_LANG
 * - 兜底 zh
 *
 * 注意：
 * - 这里返回的 lang 仅用于 key↔label 映射，不影响数据内容本身。
 */
function getLang() {
  // 1) 兼容：__variant.lang（你当前主线方案）
  const lang1 = globalThis?.__variant?.lang;
  if (typeof lang1 === 'string' && lang1) return lang1.toLowerCase();

  // 2) 兼容：VARIANT.lang（你当前代码里写的）
  const lang2 = globalThis?.VARIANT?.lang;
  if (typeof lang2 === 'string' && lang2) return lang2.toLowerCase();

  // 3) 兼容：TIMELINE_LANG（html/app.js 注入）
  const lang3 = globalThis?.TIMELINE_LANG;
  if (typeof lang3 === 'string' && lang3) return lang3.toLowerCase();

  return 'zh';
}

/* =============================================================================
 * 1) key ↔ label（国际化）
 * =============================================================================
 * - KEY_LABELS：不同语言下的 key->label 映射
 * - 对外 API：
 *   - keyToLabel(key): string
 *   - labelToKey(label): string
 * - 兼容旧导出：KEY_LABEL / LABEL_KEY（Proxy，动态读取）
 */

const KEY_LABELS = Object.freeze({
  zh: Object.freeze({
    Region: '地区',
    Platform: '平台类型',
    ConsolePlatform: '主机类型',
    EventType: '事件类型',
    Company: '公司',
    Importance: '重要性',
  }),
  en: Object.freeze({
    Region: 'Region',
    Platform: 'Platform',
    ConsolePlatform: 'Console Platform',
    EventType: 'Event Type',
    Company: 'Company',
    Importance: 'Importance',
  }),
});

/**
 * getKeyLabelMap()
 * - 默认中文；lang 为 'en' 时使用英文
 */
function getKeyLabelMap() {
  const lang = getLang();
  return lang === 'en' ? KEY_LABELS.en : KEY_LABELS.zh;
}

/**
 * 反向映射缓存（按语言缓存，避免每次 labelToKey 都重建）
 */
const _revCache = new Map(); // lang -> { [label]: key }

function getLabelKeyMap() {
  const lang = getLang() === 'en' ? 'en' : 'zh';
  const cached = _revCache.get(lang);
  if (cached) return cached;

  const m = lang === 'en' ? KEY_LABELS.en : KEY_LABELS.zh;
  const rev = Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
  _revCache.set(lang, rev);
  return rev;
}

/**
 * keyToLabel(key)
 * - 将内部字段 key 映射为当前语言 label（用于 UI 展示）
 */
export function keyToLabel(k) {
  const m = getKeyLabelMap();
  return m[k] || k;
}

/**
 * labelToKey(label)
 * - 将当前语言 UI label 映射回内部字段 key（用于 UI 回传）
 */
export function labelToKey(l) {
  const rev = getLabelKeyMap();
  return rev[l] || l;
}

/**
 * 兼容旧写法：KEY_LABEL / LABEL_KEY
 * - 通过 Proxy 动态返回当前语言下映射
 * - 注意：Proxy 的 ownKeys/getOwnPropertyDescriptor 仅用于枚举显示，不用于逻辑判断
 */
export const KEY_LABEL = new Proxy(
  {},
  {
    get(_t, prop) {
      const m = getKeyLabelMap();
      return m[prop] || prop;
    },
    ownKeys() {
      return Reflect.ownKeys(getKeyLabelMap());
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true };
    },
  },
);

export const LABEL_KEY = new Proxy(
  {},
  {
    get(_t, prop) {
      const rev = getLabelKeyMap();
      return rev[prop] || prop;
    },
    ownKeys() {
      // 让 UI 在枚举 LABEL_KEY 时能拿到 labels
      const m = getKeyLabelMap();
      return Object.values(m);
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true };
    },
  },
);

/* =============================================================================
 * 2) 可供选择的过滤字段（顺序固定，便于 UI 稳定展示）
 * ============================================================================= */

/**
 * getOptionKeys()
 * - 当前是产品决策：固定顺序 + 固定字段集合
 * - 若未来做“自定义列”：
 *   - 改为读取 schema 或读取后端提供的字段清单
 */
export function getOptionKeys() {
  // ✅ 已移除 'Tag'，新增 'Importance'
  return ['Region', 'Platform', 'ConsolePlatform', 'EventType', 'Company', 'Importance'];
}

/* =============================================================================
 * 3) 值归一化
 * ============================================================================= */

/**
 * normalizeValueByKey(key, value)
 * - 将事件项中某字段的原始值规范化为用于比较/展示的形式
 *
 * 约定：
 * - Tag：输出 string[]
 * - 其他字段：输出 string（trim 后）
 */
export function normalizeValueByKey(key, v) {
  if (v == null) return '';

  if (key === 'Tag') {
    if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
    return String(v)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Importance / Region / Platform / ConsolePlatform / EventType / Company
  return String(v).trim();
}

/* =============================================================================
 * 4) 候选项生成
 * ============================================================================= */

/**
 * sortOptions(a, b)
 * - 若均为纯数字字符串：按数值排序（避免 '10' < '2'）
 * - 否则：按 localeCompare 排序
 */
function sortOptions(a, b) {
  const as = String(a);
  const bs = String(b);
  const an = /^\d+$/.test(as) ? Number(as) : NaN;
  const bn = /^\d+$/.test(bs) ? Number(bs) : NaN;

  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  return as.localeCompare(bs);
}

/**
 * getOptionsForKey(items, key)
 * - 从全部事件 items 中收集某字段的所有可选值
 * - 去重、排序后返回 string[]
 */
export function getOptionsForKey(items = [], key) {
  const K = String(key || '').trim();
  const set = new Set();

  for (const it of items) {
    if (!it) continue;
    const raw = it[K];

    if (K === 'Tag') {
      // 当前 UI 已不暴露 Tag；保留兼容逻辑
      const arr = Array.isArray(raw) ? raw : normalizeValueByKey('Tag', raw);
      for (const t of arr || []) {
        if (t) set.add(String(t));
      }
    } else {
      const val = normalizeValueByKey(K, raw);
      if (val) set.add(val);
    }
  }

  return Array.from(set).sort(sortOptions);
}

/* =============================================================================
 * 5) 过滤匹配 + 应用规则
 * ============================================================================= */

/**
 * matchOne(item, rule)
 * - 判断 item 是否命中单条规则
 *
 * rule 结构约定：
 * - { key: string, values: string[] }
 *
 * 匹配规则：
 * - Tag：values 中任意一个出现在 item.Tag 中即命中（OR within Tag）
 * - 其他字段：item[key] 规范化后必须完全等于 values 之一
 *
 * 注意：
 * - 当 rule 缺少 key 或 values 为空时，视为“无约束”返回 true
 */
function matchOne(item, rule) {
  const { key, values } = rule || {};
  if (!key || !values || values.length === 0) return true;

  if (key === 'Tag') {
    const tags = Array.isArray(item.Tag) ? item.Tag : normalizeValueByKey('Tag', item.Tag);
    const bag = new Set((tags || []).map((s) => String(s).trim()).filter(Boolean));
    return values.some((v) => bag.has(String(v).trim()));
  }

  const left = normalizeValueByKey(key, item[key]);
  const want = new Set(values.map((v) => String(v).trim()));
  return want.has(left);
}

/**
 * applyFilters(items, state)
 * - 按 state.rules + state.logic 返回筛选后的 items
 *
 * state 约定：
 * - { logic: 'AND'|'OR', rules: Array<{key, values}> }
 *
 * AND：所有规则都命中才保留
 * OR ：任意一条规则命中即保留
 */
export function applyFilters(items = [], { logic = 'AND', rules = [] } = {}) {
  if (!rules || rules.length === 0) return items.slice();

  const isAND = logic !== 'OR';

  return items.filter((it) => {
    let hits = 0;

    for (const r of rules) {
      const ok = matchOne(it, r);

      if (ok) {
        if (!isAND) return true; // OR：命中即保留
        hits++;
      } else if (isAND) {
        return false; // AND：有一条未命中即淘汰
      }
    }

    return isAND ? hits === rules.length : false;
  });
}
