// public/src/_staging/template.js
// ⚠️ 现在不被引用。以后把你的 vis Timeline template 函数移到这里复用。

/**
 * 占位：把 .vis-item 外层打 data-*，并渲染内容
 * @param {Object} item
 * @param {HTMLElement} element
 */
export function timelineItemTemplate(item, element) {
  const host = element?.closest?.('.vis-item') || element;
  if (host && window.__styleEngine?.attachEventDataAttrs) {
    window.__styleEngine.attachEventDataAttrs(host, item);
    host.classList.add('event');
  }
  const root = document.createElement('div');
  const h4 = document.createElement('h4');
  h4.className = 'event-title';
  h4.textContent = item.content || '(无标题)';
  root.appendChild(h4);
  return root;
}
