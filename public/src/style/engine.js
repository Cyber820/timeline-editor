// src/style/engine.js
export const ATTR_KEYS = ['EventType','Company','Tag','Platform','ConsolePlatform','Region'];
const DEFAULT_BORDER_WIDTH = 2; // ← 想要的全局边框粗细（px）

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




// ---- 你的函数（放在 src/style/engine.js，作为 ESM 导出）----
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

      // 文字/背景/字体粗细/字体族
      if (type === 'textColor'   && conf.textColor)   css += `${baseSel} ${titleSel}{color:${conf.textColor};}\n`;
      if (type === 'bgColor'     && conf.bgColor)     css += `${baseSel}{background-color:${conf.bgColor};}\n`;
      if (type === 'fontFamily'  && conf.fontFamily)  css += `${baseSel} ${titleSel}{font-family:${conf.fontFamily};}\n`;
      if (type === 'fontWeight'  && conf.fontWeight)  css += `${baseSel} ${titleSel}{font-weight:${conf.fontWeight};}\n`;

      // 统一边框宽度（即便只想加粗不改色也适用）
      if (type === 'borderColor') {
        const parts = [];
        if (conf.borderColor) parts.push(`border-color:${conf.borderColor};`);
        parts.push('border-style:solid;');
        parts.push(`border-width:${DEFAULT_BORDER_WIDTH}px;`);
        parts.push('box-sizing:border-box;');
        css += `${baseSel}{${parts.join('')}}\n`;
      }

      // 光晕（halo）
// CSS box-shadow 语法回顾：
// box-shadow: offset-x offset-y blur-radius spread-radius color
//             水平偏移  垂直偏移   模糊半径     扩散半径     颜色
// - offset 为 0 表示环绕四周的“外发光”（不偏移）
// - blur 越大越柔，spread 越大越“向外扩张”（变粗）
// - 可以叠加多层，用逗号分隔；后面的层会叠在前面之上

if (type === 'haloColor' && conf.haloColor) {
  // rgbaStrong：较“实”的内圈颜色（高透明度）
  // rgbaSoft  ：较“柔”的外圈颜色（低透明度）
  const rgbaStrong = hexToRGBA(conf.haloColor, 0.2); // α=0.45（更亮）
  const rgbaSoft   = hexToRGBA(conf.haloColor, 0.30); // α=0.30（更柔）

  // 一些主题会给 .vis-item 设置 overflow:hidden，导致阴影被裁掉
  // 这里强制允许阴影溢出，确保光晕可见
  css += `${baseSel}{overflow:visible !important;}\n`;

  // 普通态的三层光晕（由内到外）：
  // 1) 0 0 0 0px rgbaStrong : 贴边的描边层（不扩散，纯“描边”效果）
  // 2) 0 0 0 10px rgbaSoft  : 近光环（无模糊，只向外扩张 10px，形成明显外圈）
  // 3) 0 0 24px 12px rgbaSoft : 远光环（24px 模糊 + 12px 扩散，形成柔和过渡）
  css +=
    `${baseSel}{` +
      `box-shadow:` +
        `0 0 0 0px ${rgbaStrong}, ` +   // 内圈描边：清晰、贴边
        `0 0 0 0px ${rgbaSoft}, ` +    // 近光环：粗一些
        `0 0 12px 6px ${rgbaSoft}` +   // 外圈柔光：更柔、更外扩
      ` !important;` +
    `}\n`;

  // 选中态（.vis-selected）稍微增强一点：
  // - 内圈描边从 0px -> 5px（更明显）
  // - 近光环从 10px -> 12px（更粗）
  // - 远光环从 24/12 -> 28/14（更远更柔）
  css +=
    `${baseSel}.vis-selected{` +
      `box-shadow:` +
        `0 0 0 0px ${rgbaStrong}, ` +  // 更粗的内圈描边
        `0 0 0 6px ${rgbaSoft}, ` +   // 更粗的近光环
        `0 0 28px 14px ${rgbaSoft}` +  // 更外扩的柔光
      ` !important;` +
    `}\n`;
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
// 远程优先 + 本地兜底
export async function applyStyleState(styleState, opts = {}) {
  const payload = {
    state: styleState,
    engineVersion: 1,
    options: {
      selectorBase: opts.selectorBase || '.vis-item.event, .vis-item-content.event',
      titleSelector: opts.titleSelector || '.event-title'
    }
  };

  try {
    const res = await fetch('/api/compile-style', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const css = await res.text();
    injectUserStyle(css);                    // ✅ 使用后端返回的 CSS
  } catch (e) {
    console.warn('[style] remote compile failed, fallback to local:', e);
    try {
      const css = compileStyleRules(styleState, opts); // 🛟 兜底：沿用你现在的本地编译
      injectUserStyle(css);
    } catch (e2) {
      console.error('[style] local compile also failed:', e2);
    }
  }
}






















