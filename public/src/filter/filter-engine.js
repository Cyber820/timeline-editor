// public/src/filter/filter-engine.js
// 过滤引擎：候选项生成 + 结果筛选（与 UI 解耦）

// ✅ 英文 key ↔ 中文显示文案（用于 UI）
//   注意：这里已移除 Tag，新增 Importance
export const KEY_LABEL = {
  Region: '地区',
  Platform: '平台类型',
  ConsolePlatform: '主机类型',
  EventType: '事件类型',
  Company: '公司',
  Importance: '重要性', // ✅ 新增
};

export const LABEL_KEY = Object.fromEntries(
  Object.entries(KEY_LABEL).map(([k, v]) => [v, k]),
);

export function keyToLabel(k) {
  return KEY_LABEL[k] || k;
}

export function labelToKey(l) {
  return LABEL_KEY[l] || l;
}

// 返回可供选择的过滤字段（顺序固定，便于 UI 稳定展示）
export function getOptionKeys() {
  // ✅ 已移除 'Tag'，新增 'Importance'
  return ['Region', 'Platform', 'ConsolePlatform', 'EventType', 'Company', 'Importance'];
}

/**
 * 按字段归一化值：
 * - Tag：拆成数组（虽然当前 UI 已不再使用 Tag，但保留逻辑不影响）
 * - 其他：统一转成去空格字符串
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

/**
 * 从全部事件 items 中收集某个字段的所有可选值，
 * 去重后按字典序排序。
 */
export function getOptionsForKey(items = [], key) {
  const K = String(key || '').trim();
  const set = new Set();

  for (const it of items) {
    if (!it) continue;
    const raw = it[K];

    if (K === 'Tag') {
      // 当前 UI 已不再暴露 Tag 作为过滤字段，这一支逻辑基本不会走到，
      // 但保留兼容性，以防后续复用。
      const arr = Array.isArray(raw) ? raw : normalizeValueByKey('Tag', raw);
      for (const t of arr || []) {
        if (t) set.add(t);
      }
    } else {
      const val = normalizeValueByKey(K, raw);
      if (val) set.add(val);
    }
  }

  // Importance 目前是 0/1/2/3/4/5，字符串排序正好就是 0–5
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * 判断单条规则是否命中
 * - Tag：支持多标签包含（尽管当前 UI 已不再使用 Tag）
 * - 其他字段：完全匹配其字符串值
 */
function matchOne(item, rule) {
  const { key, values } = rule || {};
  if (!key || !values || values.length === 0) return true;

  if (key === 'Tag') {
    const tags = Array.isArray(item.Tag)
      ? item.Tag
      : normalizeValueByKey('Tag', item.Tag);
    const bag = new Set((tags || []).map((s) => String(s)));
    return values.some((v) => bag.has(String(v)));
  }

  const left = normalizeValueByKey(key, item[key]);
  const want = new Set(values.map((v) => String(v).trim()));
  return want.has(left);
}

/**
 * 应用过滤规则：
 * - logic = 'AND'（默认）：所有规则都命中才保留
 * - logic = 'OR'          ：任意命中一条即保留
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
