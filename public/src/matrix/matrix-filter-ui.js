
// public/src/matrix/matrix-filter-ui.js
// =============================================================================
// 二维矩阵：过滤/筛选 UI 接入（第一阶段）
//
// 复用原有：
// - filter/filter-ui.js
// - filter/filter-state.js
//
// 当前只实现界面交互和规则状态。
// 不执行事件过滤，不修改 matrix 的显示数据。
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
 * 初始化二维矩阵过滤界面。
 *
 * @param {Object} options
 * @param {Function} options.getItems
 *   返回矩阵读取的原始标准化事件数组。
 *
 * @returns {void}
 */
export function initMatrixFilterUI({
  getItems = () => []
} = {}) {
  if (initialized) return;
  initialized = true;

  // UI 使用已有过滤面板。
  // 这里提供矩阵容器作为工具栏插入位置。
  initFilterUI({
    beforeElSelector: '#matrix',
    getItems,
    getCurrentRules: () => getState().rules
  });

  // 新增规则：仅更新规则状态。
  window.addEventListener(
    'filter:add-rule:confirm',
    (event) => {
      const { key, values } = event.detail || {};

      if (key && Array.isArray(values)) {
        upsertRule(key, values);
      }
    }
  );

  // 移除某个属性的过滤规则。
  window.addEventListener(
    'filter:remove-rule',
    (event) => {
      const key = event.detail?.key;

      if (key) {
        removeRule(key);
      }
    }
  );

  // 清空过滤规则。
  window.addEventListener(
    'filter:reset',
    () => {
      clearRules();
    }
  );

  // 更新 AND / OR 逻辑。
  // 暂时不触发矩阵重新绘制。
  window.addEventListener(
    'filter:set-logic',
    (event) => {
      setLogic(event.detail?.mode);
    }
  );

  console.info(
    '[matrix-filter-ui] UI initialized; ' +
    'event filtering is not connected.'
  );
}
