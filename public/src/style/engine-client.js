// src/style/engine-client.js
// ✅ 职责：前端“可见功能”——注入/更新用户样式、对 DOM 打 data-* 标记。
// ⚠️ 不包含编译器逻辑（compile）；编译在 engine.js 或远端完成。
//
// - injectUserStyle(css, opts)     将 CSS 文本注入 <style>，并保证在 <head> 末尾（优先级更高）
// - getUserStyleText()             读取当前已注入的 CSS 文本（调试/对账）
// - setUserStyleDisabled(flag)     快速启/停用户样式（不移除节点）
// - attachEventDataAttrs           从 engine.js 复用（给事件元素打 data-*，供选择器匹配）

import { attachEventDataAttrs } from './engine.js';

const STYLE_TAG_ID = 'user-style-rules';

/**
 * 内部：获取或创建 <style id="user-style-rules">。
 * - 默认将其放到 <head> 尾部，确保覆盖其他样式。
 * - 可选支持 CSP nonce。
 */
function ensureStyleTag({ id = STYLE_TAG_ID, nonce, moveToEnd = true } = {}) {
  let el = document.getElementById(id);

  if (!el) {
    el = document.createElement('style');
    el.id = id;
  } else if (moveToEnd && el.parentNode) {
    // 移除后再 append，保证总在 <head> 最后，提高权重
    el.parentNode.removeChild(el);
  }

  if (nonce && !el.nonce) {
    // 兼容 CSP：若页面启用了 Content-Security-Policy 且要求 nonce，则传入
    el.setAttribute('nonce', nonce);
  }

  (document.head || document.documentElement).appendChild(el);
  return el;
}

/**
 * 注入/更新用户 CSS。
 * @param {string} css              要注入的 CSS 文本
 * @param {object} [opts]
 *  - id: string                    style 节点 id（默认 'user-style-rules'）
 *  - nonce: string                 CSP nonce（如页面启用 CSP）
 *  - moveToEnd: boolean            是否移动到 <head> 尾部（默认 true，确保权重）
 */
export function injectUserStyle(css, opts = {}) {
  const el = ensureStyleTag(opts);
  el.textContent = css || '';
}

/**
 * 读取当前注入的 CSS 文本（便于调试或导出）。
 */
export function getUserStyleText(id = STYLE_TAG_ID) {
  const el = document.getElementById(id);
  return el ? el.textContent || '' : '';
}

/**
 * 快速启/停用户样式，而不移除节点（便于调试“开关效果”）。
 * @param {boolean} disabled
 * @param {string} [id]
 */
export function setUserStyleDisabled(disabled, id = STYLE_TAG_ID) {
  const el = document.getElementById(id) || ensureStyleTag({ id, moveToEnd: false });
  el.disabled = !!disabled;
}

// 之后：如果还有更多“仅前端可见”的小功能（如批量为列表元素打 data-*），可继续集中在此文件。
// 从 engine.js 复用 DOM 标记函数，避免重复实现：
export { attachEventDataAttrs };
