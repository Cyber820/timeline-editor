// public/src/filter/filter-state.js
// =============================================================================
// Filter State (Lightweight, UI-agnostic)
// =============================================================================
// 职责：
// - 维护当前过滤逻辑（AND / OR）与规则列表
// - 提供基本操作：setLogic / upsertRule / removeRule / clearRules / getState
// - 在状态变更后派发统一事件：'filter:state:updated'
//
// 设计原则：
// - 轻状态、无外部依赖：不依赖 UI、不依赖 filter-engine。
// - 规则结构固定：{ key: string, values: string[] }
// - 对外输出“快照”：避免外部误改内部引用。
// - 未来产品化：可轻松加入持久化（URL/LocalStorage/Presets）。
// =============================================================================

/**
 * 内部状态容器（保持简单可读）
 * 注意：
 * - rules 使用数组以保留 UI 的展示顺序（插入顺序）
 */
export const filterState = {
  logic: 'AND', // 'AND' | 'OR'
  rules: [], // rule: { key: 'Region', values: ['Japan','Korea'] }
};

/* =============================================================================
 * 0) 规范化工具：key / values
 * ============================================================================= */

/**
 * normalizeKey()
 * - 将 key 统一为 trim 后的字符串
 */
function normalizeKey(key) {
  return String(key ?? '').trim();
}

/**
 * normalizeValues()
 * - values -> string[]（去空、trim、去重）
 * - 保持稳定顺序：按输入出现的顺序保留第一份
 */
function normalizeValues(values) {
  const out = [];
  const seen = new Set();

  for (const v of values || []) {
    const s = String(v ?? '').trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/* =============================================================================
 * 1) 对外 API：setLogic / upsertRule / removeRule / clearRules / getState
 * ============================================================================= */

/**
 * setLogic(mode)
 * - mode 只接受 'OR' 或其他（默认 AND）
 */
export function setLogic(mode = 'AND') {
  const next = mode === 'OR' ? 'OR' : 'AND';
  if (filterState.logic === next) return;

  filterState.logic = next;
  dispatchStateUpdated();
}

/**
 * upsertRule(key, values)
 * - 插入或更新某个 key 的规则
 *
 * 语义约定（产品化友好）：
 * - values 为空数组 => 等价 removeRule(key)
 *   （调用方可统一用 upsertRule 来“设值/清空”，减少分支）
 *
 * 当前策略：
 * - 更新规则时“覆盖为最新选择”
 *   若未来希望“并集合并”，可在此处改为 union 逻辑
 */
export function upsertRule(key, values = []) {
  const k = normalizeKey(key);
  const vals = normalizeValues(values);

  if (!k) return;

  // ✅ values 为空：视为清空该 key 规则
  if (vals.length === 0) {
    removeRule(k);
    return;
  }

  const idx = filterState.rules.findIndex((r) => r.key === k);
  if (idx === -1) {
    filterState.rules.push({ key: k, values: vals });
  } else {
    filterState.rules[idx] = { key: k, values: vals };
  }

  dispatchStateUpdated();
}

/**
 * removeRule(key)
 * - 移除指定 key 的规则（若不存在则无变化）
 */
export function removeRule(key) {
  const k = normalizeKey(key);
  if (!k) return;

  const before = filterState.rules.length;
  filterState.rules = filterState.rules.filter((r) => r.key !== k);

  if (filterState.rules.length !== before) dispatchStateUpdated();
}

/**
 * clearRules()
 * - 清空所有规则
 */
export function clearRules() {
  if (!filterState.rules.length) return;

  filterState.rules = [];
  dispatchStateUpdated();
}

/**
 * getRule(key)
 * - 返回内部规则引用的“拷贝”（避免外部改写内部）
 */
export function getRule(key) {
  const k = normalizeKey(key);
  if (!k) return null;

  const r = filterState.rules.find((x) => x.key === k);
  return r ? { key: r.key, values: r.values.slice() } : null;
}

/**
 * getState()
 * - 返回当前状态快照（深拷贝）
 * - 交接/维护时非常关键：外部拿到的是 immutable-ish 数据
 */
export function getState() {
  return {
    logic: filterState.logic,
    rules: filterState.rules.map((r) => ({ key: r.key, values: r.values.slice() })),
  };
}

/* =============================================================================
 * 2) 事件派发：filter:state:updated（轻量节流）
 * =============================================================================
 *
 * 目的：
 * - 某些场景（未来批量勾选/导入 preset）会产生连续多次 set/upsert/remove。
 * - 同步连发事件会让 UI 重绘频繁、体验抖动。
 * - 这里用 queueMicrotask 聚合到一次派发（不改变最终状态）。
 */

let _pendingDispatch = false;

function dispatchStateUpdated() {
  if (_pendingDispatch) return;
  _pendingDispatch = true;

  queueMicrotask(() => {
    _pendingDispatch = false;
    window.dispatchEvent(new CustomEvent('filter:state:updated', { detail: getState() }));
  });
}

/* =============================================================================
 * 3) （可选）序列化/反序列化：为产品化预留
 * =============================================================================
 * 典型用途：
 * - URL 分享：?filters=...
 * - localStorage：保存用户上次的过滤条件
 * - 预设模板：点击按钮应用一组规则
 */

/**
 * serializeState(state?)
 * - 返回可 JSON.stringify 的对象
 * - 若不传入参数，则序列化当前 state
 */
export function serializeState(state = getState()) {
  const logic = state?.logic === 'OR' ? 'OR' : 'AND';
  const rules = Array.isArray(state?.rules)
    ? state.rules
        .map((r) => ({
          key: normalizeKey(r?.key),
          values: normalizeValues(r?.values || []),
        }))
        .filter((r) => r.key && r.values.length)
    : [];

  return { logic, rules };
}

/**
 * hydrateState(payload)
 * - 用外部 payload 覆盖当前 filterState（用于加载 preset/URL/localStorage）
 * - 会触发一次 state updated 事件
 */
export function hydrateState(payload) {
  const next = serializeState(payload);

  const logicChanged = filterState.logic !== next.logic;

  // 简单比较：长度/每条规则 key/values 是否一致（足够用于“是否派发更新”判断）
  const before = getState();
  const beforeSig = JSON.stringify(serializeState(before));
  const nextSig = JSON.stringify(next);

  if (!logicChanged && beforeSig === nextSig) return;

  filterState.logic = next.logic;
  filterState.rules = next.rules.map((r) => ({ key: r.key, values: r.values.slice() }));

  dispatchStateUpdated();
}
