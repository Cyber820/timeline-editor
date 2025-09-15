// 只保留前端需要的“可见”功能（注入CSS、给DOM打data-*）；编译器不在这里
export function injectUserStyle(css) {
  let el = document.getElementById('user-style-rules');
  if (!el) {
    el = document.createElement('style');
    el.id = 'user-style-rules';
    document.head.appendChild(el);
  }
  el.textContent = css || '';
}

// 之后：attachEventDataAttrs 等也会放在这里
