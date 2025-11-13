// src/state/styleState.js
// ✅ 模块职责：管理“样式状态”的内存态与事件通知。
// ---------------------------------------------------------
// ❌ 不再使用 localStorage，页面刷新后样式自动恢复为默认。
// 状态结构：
//   {
//     version: 1,
//     boundTypes: { EventType: 'textColor', ... },
//     rules: {
//       EventType: { '主机游戏': { textColor:'#eab308' }, ... },
//       ...
//     }
//   }

const DEFAULT_STATE = Object.freeze({
  version: 1,
  boundTypes: {}, // 例：{ EventType: 'textColor' }
  rules: {},      // 例：{ EventType: { '主机游戏': { textColor:'#eab308' } } }
});

// 当前会话内存中的样式状态（页面刷新后会自然丢失）
let CURRENT_STATE = { ...DEFAULT_STATE };

/**
 * 获取当前样式状态（内存态）。
 *  - 不再从 localStorage 读取。
 *  - 返回一个浅拷贝，避免外部直接修改内部引用。
 * @returns {{version:number,boundTypes:Object,rules:Object}}
 */
export function getStyleState() {
  return {
    ...CURRENT_STATE,
    boundTypes: { ...CURRENT_STATE.boundTypes },
    rules: { ...CURRENT_STATE.rules },
  };
}

/**
 * 更新当前样式状态，并派发自定义事件通知其他模块。
 *  - 不再写入 localStorage。
 * @param {Object} next - 新状态（部分或完整）
 * @returns {Object} 保存后的安全副本
 */
export function setStyleState(next) {
  CURRENT_STATE = {
    ...DEFAULT_STATE,
    ...next,
    boundTypes: { ...(next?.boundTypes || {}) },
    rules: { ...(next?.rules || {}) },
  };

  // 广播事件（用于其他模块联动更新，如 UI 面板）
  window.dispatchEvent(
    new CustomEvent('timeline:styleState', { detail: getStyleState() }),
  );

  return getStyleState();
}

/**
 * 监听样式状态变更事件。
 *  - 每次调用 setStyleState() 都会触发。
 *  - handler 接收最新的 state 作为参数。
 * @param {(state:Object)=>void} handler 回调函数
 */
export function onStyleStateChange(handler) {
  if (typeof handler !== 'function') return;
  window.addEventListener('timeline:styleState', (e) => {
    handler(e.detail);
  });
}

/**
 * 重置为默认样式状态（内存态）。
 *  - 不再操作 localStorage。
 */
export function resetStyleState() {
  CURRENT_STATE = { ...DEFAULT_STATE };
  const fresh = getStyleState();
  window.dispatchEvent(
    new CustomEvent('timeline:styleState', { detail: fresh }),
  );
  return fresh;
}
