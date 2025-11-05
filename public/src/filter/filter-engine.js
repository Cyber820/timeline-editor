// public/src/filter/filter-engine.js
// 过滤引擎：候选项生成 + 结果筛选（与 UI 解耦）

export function getOptionKeys() {
  return ['Region', 'Platform', 'ConsolePlatform', 'EventType', 'Company', 'Tag'];
}

export function normalizeValueByKey(key, v) {
  if (v == null) return '';
  if (key === 'Tag') {
    // 可能是数组或逗号字符串
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

  // 等值匹配（大小写严格，若要忽略大小写可统一 toLowerCase）
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
        if (!isAND) return true;  // OR：命中其一即可
        hits++;
      } else if (isAND) {
        return false;             // AND：有一条未命中即淘汰
      }
    }
    return isAND ? (hits === rules.length) : false;
  });
}
