// src/style/engine-client.js
// ✅ 职责：前端“可见功能”容器（不含编译）。统一从 engine.js 再导出权威实现。
// - injectUserStyle：从 ./engine.js 再导出；不接受额外 options
// - attachEventDataAttrs：从 ./engine.js 再导出
// - getUserStyleText：读取当前注入 CSS（调试/导出）
// - setUserStyleDisabled：快速启/停样式（不移除节点）

export { injectUserStyle, attachEventDataAttrs } from './engine.js';

const STYLE_TAG_ID = 'user-style-rules';

/** 内部：获取或创建 <style id="user-style-rules">（供 setUserStyleDisabled 使用） */
function ensureStyleTag({ id = STYLE_TAG_ID, nonce, moveToEnd = true } = {}) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
  } else if (moveToEnd && el.parentNode) {
    el.parentNode.removeChild(el);
  }
  if (nonce && !el.nonce) el.setAttribute('nonce', nonce);
  (document.head || document.documentElement).appendChild(el);
  return el;
}

/** 读取当前注入的 CSS 文本（便于调试或导出）。 */
export function getUserStyleText(id = STYLE_TAG_ID) {
  const el = document.getElementById(id);
  return el ? el.textContent || '' : '';
}

/** 快速启/停用户样式，而不移除节点（便于对比效果）。 */
export function setUserStyleDisabled(disabled, id = STYLE_TAG_ID) {
  const el = document.getElementById(id) || ensureStyleTag({ id, moveToEnd: false });
  el.disabled = !!disabled;
}
