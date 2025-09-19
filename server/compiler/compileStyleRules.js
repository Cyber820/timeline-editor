// server/compiler/compileStyleRules.js

// 常量（与前端保持一致）
const DEFAULT_BORDER_WIDTH = 2;
const ATTR_KEYS = ['EventType','Company','Tag','Platform','ConsolePlatform','Region'];

// 简易转义：放进 CSS 选择器引号里安全
function cssEscape(s) {
  return String(s).replace(/["\\]/g, '\\$&');
}

// #RRGGBB → rgba(r,g,b,a)
function hexToRGBA(hex, a = 0.35) {
  const s = String(hex || '').replace('#', '').trim();
  const to255 = (h) => parseInt(h.length === 1 ? h + h : h, 16);
  const r = to255(s.slice(0, 2) || '0');
  const g = to255(s.slice(2, 4) || '0');
  const b = to255(s.slice(4, 6) || '0');
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * 编译 state → CSS 文本（纯函数，无 DOM 依赖）
 * @param {Object} styleState - { version, boundTypes, rules }
 * @param {Object} opts - { selectorBase, titleSelector, attrPriority }
 */
function compileStyleRules(styleState = {}, opts = {}) {
  const selectorBase = opts.selectorBase || '.vis-item.event';
  const titleSel     = opts.titleSelector || '.event-title';
  const priority     = opts.attrPriority || ATTR_KEYS;

  // 支持多基选择器（例如 ".vis-item.event, .vis-item-content.event"）
  const baseList = String(selectorBase).split(',').map(s => s.trim()).filter(Boolean);

  let css = '';
  for (const attr of priority) {
    const type = styleState?.boundTypes?.[attr];
    if (!type || type === 'none') continue;

    const map = styleState?.rules?.[attr] || {};
    for (const [val, conf] of Object.entries(map)) {
      const v = `"${cssEscape(val)}"`;

      // 为每个基选择器分别拼接属性过滤
      const filteredList = (attr === 'Tag')
        ? baseList.map(b => `${b}[data-Tag~=${v}]`)
        : baseList.map(b => `${b}[data-${attr}=${v}]`);

      // 容器规则（背景/边框/光晕）
      const sel = filteredList.join(', ');
      // 子元素标题规则（文字色/字体/粗细）
      const selTitle = filteredList.map(s => `${s} ${titleSel}`).join(', ');

      // 文本色 / 背景 / 字体族 / 字重
      if (type === 'textColor'   && conf.textColor)   css += `${selTitle}{color:${conf.textColor};}\n`;
      if (type === 'bgColor'     && conf.bgColor)     css += `${sel}{background-color:${conf.bgColor};}\n`;
      if (type === 'fontFamily'  && conf.fontFamily)  css += `${selTitle}{font-family:${conf.fontFamily};}\n`;
      if (type === 'fontWeight'  && conf.fontWeight)  css += `${selTitle}{font-weight:${conf.fontWeight};}\n`;

      // 边框（统一边框宽度）
      if (type === 'borderColor') {
        const parts = [];
        if (conf.borderColor) parts.push(`border-color:${conf.borderColor};`);
        parts.push('border-style:solid;');
        parts.push(`border-width:${DEFAULT_BORDER_WIDTH}px;`);
        parts.push('box-sizing:border-box;');
        css += `${sel}{${parts.join('')}}\n`;
      }

      // 光晕（halo）
      if (type === 'haloColor' && conf.haloColor) {
        const rgbaStrong = hexToRGBA(conf.haloColor, 0.2);
        const rgbaSoft   = hexToRGBA(conf.haloColor, 0.30);
        css += `${sel}{overflow:visible !important;}\n`;
        css += `${sel}{box-shadow:0 0 0 0px ${rgbaStrong}, 0 0 0 0px ${rgbaSoft}, 0 0 12px 6px ${rgbaSoft} !important;}\n`;
        css += `${sel}.vis-selected{box-shadow:0 0 0 0px ${rgbaStrong}, 0 0 0 6px ${rgbaSoft}, 0 0 28px 14px ${rgbaSoft} !important;}\n`;
      }
    }
  }
  return css;
}

module.exports = {
  compileStyleRules,
  DEFAULT_BORDER_WIDTH, // 如需在路由中引用，可导出
};
