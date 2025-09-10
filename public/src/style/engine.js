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

function hexToRGBA(hex, a = 0.35) {
  const s = String(hex || '').replace('#','').trim();
  const to255 = (h) => parseInt(h.length===1 ? h+h : h, 16);
  const r = to255(s.slice(0,2) || '0');
  const g = to255(s.slice(2,4) || '0');
  const b = to255(s.slice(4,6) || '0');
  return `rgba(${r},${g},${b},${a})`;
}
/** 把样式状态编译成一段 CSS 文本 */
// src/style/engine.js
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

      // 文字/背景/边框/字体
      if (type === 'textColor'   && conf.textColor)   css += `${baseSel} ${titleSel}{color:${conf.textColor};}\n`;
      if (type === 'bgColor'     && conf.bgColor)     css += `${baseSel}{background-color:${conf.bgColor};}\n`;
      if (type === 'borderColor' && conf.borderColor) css += `${baseSel}{border-color:${conf.borderColor};border-style:solid;}\n`;
      if (type === 'fontFamily'  && conf.fontFamily)  css += `${baseSel} ${titleSel}{font-family:${conf.fontFamily};}\n`;
      if (type === 'fontWeight'  && conf.fontWeight)  css += `${baseSel} ${titleSel}{font-weight:${conf.fontWeight};}\n`;

      // ✅ 光晕颜色（halo）
      if (type === 'haloColor' && conf.haloColor) {
        const rgba = hexToRGBA(conf.haloColor, 0.35); // 透明度可调
        // 外发光 + 细描边
        css += `${baseSel}{box-shadow: 0 0 0 2px ${rgba}, 0 0 12px 2px ${rgba};}\n`;
        // 选中态略强化，避免被主题覆盖
        css += `${baseSel}.vis-selected{box-shadow: 0 0 0 2px ${rgba}, 0 0 14px 3px ${rgba};}\n`;
      }
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
  } else if (el.parentNode) {
    // 先移除，等会儿再 append，确保总是在 <head> 的最后
    el.parentNode.removeChild(el);
  }
  el.textContent = css || '';
  document.head.appendChild(el); // 放到最后，压过其它样式
}


/** 入口：根据状态直接应用样式（编译 + 注入） */
export function applyStyleState(styleState, opts) {
  injectUserStyle(compileStyleRules(styleState, opts));
}





