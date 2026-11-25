
// public/src/matrix/matrix-filter-ui.js
// =============================================================================
// 二维矩阵：过滤/筛选 UI 接线模块
//
// 复用现有模块：
// - filter/filter-ui.js
// - filter/filter-state.js
//
// 交互约定：
// 1. 新增规则：只保存，不立即应用。
// 2. 选择 AND/OR：立即应用全部现有规则。
// 3. 删除规则：立即应用剩余规则。
// 4. Reset：清空规则，立即恢复全部事件。
//
// 不直接操作矩阵 DOM。
// 实际筛选与绘制由 matrix.js 负责。
// =============================================================================

import { initFilterUI } from '../filter/filter-ui.js';

import {
  getState,
  setLogic,
  upsertRule,
  removeRule,
  clearRules
} from '../filter/filter-state.js';

let initialized = false;

/**
 * 初始化二维矩阵过滤界面及事件桥接。
 *
 * @param {Object} options
 *
 * @param {Function} options.getItems
 * 返回全部未经筛选的标准化事件数组。
 *
 * @param {Function} options.onApply
 * 当需要真正执行筛选时调用。
 * 接收当前过滤状态快照。
 *
 * @returns {void}
 */
export function initMatrixFilterUI({
  getItems = () => [],
  onApply = () => {}
} = {}) {
  if (initialized) {
    console.warn(
      '[matrix-filter-ui] Already initialized.'
    );
    return;
  }

  initialized = true;

  // ---------------------------------------------------------------------------
  // 1. 初始化原有过滤 UI
  //
  // 此处只负责创建面板。
  // 过滤状态变化通过下面的事件处理。
  // ---------------------------------------------------------------------------

  initFilterUI({
    beforeElSelector: '#matrix',

    getItems,

    getCurrentRules: () => getState().rules
  });

  // ---------------------------------------------------------------------------
  // 2. 应用当前过滤状态
  //
  // onApply 由 matrix.js 提供。
  // 本模块不直接调用 applyFilters()。
  // ---------------------------------------------------------------------------

  function applyCurrentState() {
    const state = getState();
    onApply(state);
  }

  // ---------------------------------------------------------------------------
  // 3. 增加规则
  //
  // 与原时间轴一致：
  // 仅保存规则，不立即更新矩阵。
  // ---------------------------------------------------------------------------

  function handleAddRule(event) {
    const { key, values } = event.detail || {};

    if (
      !key ||
      !Array.isArray(values) ||
      values.length === 0
    ) {
      return;
    }

    upsertRule(key, values);

    // 不调用 applyCurrentState()。
    // 等待用户点击 AND 或 OR。
  }

  window.addEventListener(
    'filter:add-rule:confirm',
    handleAddRule
  );

  // ---------------------------------------------------------------------------
  // 4. 删除规则
  //
  // 删除后立即重新应用剩余规则。
  // ---------------------------------------------------------------------------

  function handleRemoveRule(event) {
    const key = event.detail?.key;

    if (!key) return;

    removeRule(key);

    applyCurrentState();
  }

  window.addEventListener(
    'filter:remove-rule',
    handleRemoveRule
  );

  // ---------------------------------------------------------------------------
  // 5. 重置规则
  //
  // 清空全部过滤条件。
  // 立即恢复全部事件。
  // ---------------------------------------------------------------------------

  function handleReset() {
    clearRules();

    applyCurrentState();
  }

  window.addEventListener(
    'filter:reset',
    handleReset
  );

  // ---------------------------------------------------------------------------
  // 6. AND / OR
  //
  // 先更新过滤逻辑，再立即执行筛选。
  //
  // 即使再次点击当前已经选择的 AND 或 OR，
  // 仍然会执行筛选。
  //
  // 这是因为用户可能刚添加规则，
  // 但尚未应用。
  // ---------------------------------------------------------------------------

  function handleSetLogic(event) {
    const mode = event.detail?.mode;

    if (mode !== 'AND' && mode !== 'OR') {
      return;
    }

    setLogic(mode);

    applyCurrentState();
  }

  window.addEventListener(
    'filter:set-logic',
    handleSetLogic
  );

  console.info(
    '[matrix-filter-ui] Filtering connected.'
  );
}
