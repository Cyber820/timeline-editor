// public/src/filter/filter-state.js
// 轻状态：记录当前过滤逻辑与规则，并提供基本操作

export const filterState = {
  logic: 'AND',                   // 'AND' | 'OR'
  // 规则形如：{ key: 'Region', values: ['日本','韩国'] }
  rules: [],
};

export function setLogic(mode = 'AND') {
  filterState.logic = (mode === 'OR') ? 'OR' : 'AND';
  dispatchStateUpdated();
}

export function upsertRule(key, values = []) {
  const k = String(key || '').trim();
  const vals = Array.from(new Set((values || []).map(v => String(v).trim()).filter(Boolean)));
  if (!k || vals.length === 0) return;

  const idx = filterState.rules.findIndex(r => r.key === k);
  if (idx === -1) {
    filterState.rules.push({ key: k, values: vals });
  } else {
    // 覆盖为最新选择（若你想“并集合并”，把下面一行替换成并集逻辑）
    filterState.rules[idx].values = vals;
  }
  dispatchStateUpdated();
}

export function removeRule(key) {
  const k = String(key || '').trim();
  const before = filterState.rules.length;
  filterState.rules = filterState.rules.filter(r => r.key !== k);
  if (filterState.rules.length !== before) dispatchStateUpdated();
}

export function clearRules() {
  if (filterState.rules.length === 0) return;
  filterState.rules = [];
  dispatchStateUpdated();
}

export function getRule(key) {
  return filterState.rules.find(r => r.key === key) || null;
}

export function getState() {
  return { logic: filterState.logic, rules: filterState.rules.slice() };
}

function dispatchStateUpdated() {
  window.dispatchEvent(new CustomEvent('filter:state:updated', { detail: getState() }));
}
