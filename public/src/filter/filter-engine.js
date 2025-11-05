// public/src/filter/filter-engine.js
// 过滤引擎：候选项生成 + 结果筛选（与 UI 解耦）

// ✅ 英文 key ↔ 中文显示文案（用于 UI）
export const KEY_LABEL = {
  Region: '地区',
  Platform: '平台类型',
  ConsolePlatform: '主机类型',
  EventType: '事件类型',
  Company: '公司',
  Tag: '标签',
};
export const LABEL_KEY = Object.fromEntries(Object.entries(KEY_LABEL).map(([k, v]) => [v, k]));
export function keyToLabel(k) { return KEY_LABEL[k] || k; }
export function labelToKey(l) { return LABEL_KEY[l] || l; }

export function getOptionKeys() {
  // 使用固定顺序，便于 UI 稳定展示
  return ['Region', 'Platform', 'ConsolePlatform', 'EventType', 'Company', 'Tag'];
}

export function normalizeValueByKey(key, v) {
  if (v == null) return '';
  if (key === 'Tag') {
    if (Array.isArray(v)) return v.map(s => String(s).trim()).filter(Boolean);
    return String(v).split(',').map(s => s.trim()).filter(Boolean);
  }
  return String(v).trim();
}

export function getOptionsForKey(items = [], key) {
  const K = String(key || '').trim();
  const set = new Set();
  for (const it of items) {
    if (!it) continue;
    const raw = it[K];
    if (K === 'Tag') {
      const arr = Array.isArray(raw) ? raw : normalizeValueByKey('Tag', raw);
      for (const t of (arr || [])) if (t) set.add(t);
    } else {
      const val = normalizeValueByKey(K, raw);
      if (val) set.add(val);
    }
  }
  return Array.from(set).sort((a,b) => a.localeCompare(b));
}

function matchOne(item, rule) {
  const { key, values } = rule || {};
  if (!key || !values || values.length === 0) return true;

  if (key === 'Tag') {
    const tags = Array.isArray(item.Tag) ? item.Tag : normalizeValueByKey('Tag', item.Tag);
    const bag = new Set((tags || []).map(s => String(s)));
    return values.some(v => bag.has(String(v)));
  }

  const left = normalizeValueByKey(key, item[key]);
  const want = new Set(values.map(v => String(v).trim()));
  return want.has(left);
}

export function applyFilters(items = [], { logic = 'AND', rules = [] } = {}) {
  if (!rules || rules.length === 0) return items.slice();
  const isAND = (logic !== 'OR');

  return items.filter(it => {
    let hits = 0;
    for (const r of rules) {
      const ok = matchOne(it, r);
      if (ok) {
        if (!isAND) return true;  // OR：命中即保留
        hits++;
      } else if (isAND) {
        return false;             // AND：有一条未命中即淘汰
      }
    }
    return isAND ? (hits === rules.length) : false;
  });
}
