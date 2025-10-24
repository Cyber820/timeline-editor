// src/state/styleState.js
// ✅ 模块职责：管理“样式状态”的持久化与事件通知。
// ---------------------------------------------------------
// 存储键：localStorage['timelineStyle.v1']
// 存储内容结构：
//   {
//     version: 1,
//     boundTypes: { EventType: 'textColor', ... },
//     rules: {
//       EventType: { '主机游戏': { textColor:'#eab308' }, ... },
//       ...
//     }
//   }

const KEY = 'timelineStyle.v1';

const DEFAULT_STATE = Object.freeze({
  version: 1,
  boundTypes: {}, // 例：{ EventType: 'textColor' }
  rules: {},      // 例：{ EventType: { '主机游戏': { textColor:'#eab308' } } }
});

/**
 * 从 localStorage 读取当前样式状态。
 *  - 若存储损坏或不存在，返回默认状态。
 *  - 自动合并 DEFAULT_STATE（保证缺省字段存在）。
 * @returns {{version:number,boundTypes:Object,rules:Object}}
 */
export function getStyleState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_STATE };

    const obj = JSON.parse(raw);

    // 防御：防止被污染的 localStorage 结构
    if (typeof obj !== 'object' || obj === null) {
      console.warn('[styleState] invalid JSON, reset to default');
      return { ...DEFAULT_STATE };
    }

    return { ...DEFAULT_STATE, ...obj };
  } catch (err) {
    console.error('[styleState] load error:', err);
    return { ...DEFAULT_STATE };
  }
}

/**
 * 将最新样式状态写入 localStorage，并派发自定义事件通知其他模块。
 * @param {Object} next - 新状态（部分或完整）
 * @returns {Object} 保存后的安全副本
 */
export function setStyleState(next) {
  const safe = { ...DEFAULT_STATE, ...next };

  try {
    localStorage.setItem(KEY, JSON.stringify(safe));
  } catch (err) {
    console.error('[styleState] save error:', err);
  }

  // 广播事件（用于其他模块联动更新，如 UI 面板）
  window.dispatchEvent(
    new CustomEvent('timeline:styleState', { detail: safe }),
  );

  return safe;
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
 * 清除本地样式状态（可选辅助）。
 * 用于调试或重置功能。
 */
export function resetStyleState() {
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    console.error('[styleState] reset error:', err);
  }
  const fresh = { ...DEFAULT_STATE };
  window.dispatchEvent(
    new CustomEvent('timeline:styleState', { detail: fresh }),
  );
  return fresh;
}
