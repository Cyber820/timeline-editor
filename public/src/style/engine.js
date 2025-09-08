// src/style/engine.js
export const ATTR_KEYS = ['EventType','Company','Tag','Platform','ConsolePlatform','Region'];

/** 给事件外层元素打 data-* 标，供 CSS 规则匹配 */
export function attachEventDataAttrs(el, item) {
  if (!el || !item) return;
  for (const k of ATTR_KEYS) {
    const v = item[k];
    if (v == null) continue;
    if (k === 'Tag') {
      const tokens = Array.isArray(v) ? v
        : String(v || '').split(',').map(s => s.trim()).filter(Boolean);
      if (tokens.length) el.setAttribute('data-Tag', tokens.join(' ')); // [data-Tag~="xxx"]
    } else {
      el.setAttribute(`data-${k}`, String(v));
    }
  }
  el.classList.add('event'); // 统一锚点：.vis-item.event
}

/** 简易转义，保证值能放进 CSS 选择器引号里 */
function cssEscape(s){ return String(s).replace(/["\\]/g, '\\$&'); }

/** 把样式状态编译成一段 CSS 文本 */
export function compileStyleRules(styleState, opts = {}) {
  const selectorBase = opts.selectorBase || '.vis-item.event';
  const titleSel     = opts.titleSelector || '.event-title';
  const priority     = opts.attrPriority || ['EventType','Company','Tag','Platform','ConsolePlatform','Region'];

  let css = '';
  for (const attr of priority) {
    const type = styleState?.boundTypes?.[attr];
    if (!type || type === 'none') continue;
    const map = styleState?.rules?.[attr] || {};
    for (const [val, conf] of Object.entries(map)) {
      const v = `"${cssEscape(val)}"`;
      const baseSel = attr === 'Tag'
        ? `${selectorBase}[data-Tag~=${v}]`
        : `${selectorBase}[data-${attr}=${v}]`;

      if (type === 'textColor'   && conf.textColor)   css += `${baseSel} ${titleSel}{color:${conf.textColor};}\n`;
      if (type === 'bgColor'     && conf.bgColor)     css += `${baseSel}{background-color:${conf.bgColor};}\n`;
      if (type === 'borderColor' && conf.borderColor) css += `${baseSel}{border-color:${conf.borderColor};border-style:solid;}\n`;
      if (type === 'fontFamily'  && conf.fontFamily)  css += `${baseSel} ${titleSel}{font-family:${conf.fontFamily};}\n`; // ← 新增
      if (type === 'fontWeight'  && conf.fontWeight)  css += `${baseSel} ${titleSel}{font-weight:${conf.fontWeight};}\n`;
    }
  }
  return css;
}


/** 把 CSS 文本注入/更新到 <style id="user-style-rules"> */
export function injectUserStyle(css) {
  let el = document.getElementById('user-style-rules');
  if (!el) {
    el = document.createElement('style');
    el.id = 'user-style-rules';
    document.head.appendChild(el);
  }
  el.textContent = css || '';
}

/** 入口：根据状态直接应用样式（编译 + 注入） */
export function applyStyleState(styleState, opts) {
  injectUserStyle(compileStyleRules(styleState, opts));
}

