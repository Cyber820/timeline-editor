// src/style/engine.js
// ✅ 作用：将样式状态编译为 CSS，并注入到页面；必要时支持远程编译。
// ---------------------------------------------------------
// 依赖提示：建议与 constants.js 搭配使用（BORDER_WIDTH_PX 等）
// import { DEFAULTS } from '../_staging/constants.js';

export const ATTR_KEYS = ['EventType','Company','Tag','Platform','ConsolePlatform','Region'];

/**
 * 给事件外层元素打 data-* 标，供 CSS 规则匹配。
 * - Tag 使用空格分隔 token，便于用 [data-Tag~="xxx"] 选择器匹配（注意大小写）。
 */
export function attachEventDataAttrs(el, item) {
  if (!el || !item) return;
  for (const k of ATTR_KEYS) {
    const v = item[k];
    if (v == null) continue;

    if (k === 'Tag') {
      const tokens = Array.isArray(v)
        ? v
        : String(v || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
      if (tokens.length) el.setAttribute('data-Tag', tokens.join(' ')); // [data-Tag~="xxx"]
    } else {
      el.setAttribute(`data-${k}`, String(v));
    }
  }
  // 统一锚点：.vis-item.event
  el.classList.add('event');
}

/** 简易 CSS 字符串转义，确保能安全放入选择器引号内 */
function cssEscape(s) {
  return String(s).replace(/["\\\n\r\t]/g, m => ({
    '"': '\\"',
    '\\': '\\\\',
    '\n': '\\A ',
    '\r': '',
    '\t': '\\9 '
  })[m]);
}

/**
 * 颜色 hex → rgba 字符串
 * - 支持：#RGB / #RGBA / #RRGGBB / #RRGGBBAA
 * - alpha 取 0~1 之间
 */
function hexToRGBA(hex, aOverride) {
  let s = String(hex || '').trim();
  if (s.startsWith('#')) s = s.slice(1);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  let r=0,g=0,b=0,a=1;

  if (s.length === 3 || s.length === 4) {
    r = parseInt(s[0] + s[0], 16);
    g = parseInt(s[1] + s[1], 16);
    b = parseInt(s[2] + s[2], 16);
    if (s.length === 4) a = parseInt(s[3] + s[3], 16) / 255;
  } else if (s.length === 6 || s.length === 8) {
    r = parseInt(s.slice(0,2), 16);
    g = parseInt(s.slice(2,4), 16);
    b = parseInt(s.slice(4,6), 16);
    if (s.length === 8) a = parseInt(s.slice(6,8), 16) / 255;
  }

  const alpha = clamp01(aOverride != null ? aOverride : a);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * 将样式状态编译为一段 CSS 文本。
 * @param {Object} styleState 由 buildEngineStyleState() 返回：{ boundTypes, rules }
 * @param {Object} opts
 *  - selectorBase: 事件元素选择器基（默认 '.vis-item.event'）
 *  - titleSelector: 事件标题选择器（默认 '.event-title'）
 *  - attrPriority: 属性优先级数组（默认与 ATTR_KEYS 一致）
 *  - borderWidthPx: 边框宽度（默认 2 或 globalThis.DEFAULTS.BORDER_WIDTH_PX）
 * @returns {string} CSS
 */
export function compileStyleRules(styleState, opts = {}) {
  const selectorBase = opts.selectorBase || '.vis-item.event';
  const titleSel     = opts.titleSelector || '.event-title';
  const priority     = opts.attrPriority || ATTR_KEYS.slice();

  // 统一边框宽度，优先 opts，否则从全局 DEFAULTS 读取，最后回退 2
  const globalBorderPx =
    typeof opts.borderWidthPx === 'number' ? opts.borderWidthPx
    : (globalThis?.DEFAULTS?.BORDER_WIDTH_PX ?? 2);

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

      // 文本色 / 字体家族 —— 作用于标题元素
      if (type === 'textColor'   && conf.textColor)   css += `${baseSel} ${titleSel}{color:${conf.textColor} !important;}\n`;
      if (type === 'fontFamily'  && conf.fontFamily)  css += `${baseSel} ${titleSel}{font-family:${conf.fontFamily} !important;}\n`;

      // 背景色 —— 作用于卡片容器
      if (type === 'bgColor'     && conf.bgColor)     css += `${baseSel}{background-color:${conf.bgColor} !important;}\n`;

      // 边框（统一宽度；尽量不与 vis 自身样式打架）
      if (type === 'borderColor') {
        const parts = [];
        if (conf.borderColor) parts.push(`border-color:${conf.borderColor} !important`);
        parts.push('border-style:solid');
        parts.push(`border-width:${globalBorderPx}px`);
        parts.push('box-sizing:border-box');
        css += `${baseSel}{${parts.join(';')};}\n`;
      }

      // 光晕（halo）—— 多层阴影，提升显著度
      if (type === 'haloColor' && conf.haloColor) {
        const rgbaStrong = hexToRGBA(conf.haloColor, 0.35); // 贴边
        const rgbaSoft   = hexToRGBA(conf.haloColor, 0.20); // 柔光
        // 放开裁剪，避免阴影被截断
        css += `${baseSel}{overflow:visible !important;}\n`;
        css += `${baseSel}{box-shadow:0 0 0 0px ${rgbaStrong}, 0 0 0 6px ${rgbaSoft}, 0 0 18px 10px ${rgbaSoft} !important;}\n`;
        css += `${baseSel}.vis-selected{box-shadow:0 0 0 0px ${rgbaStrong}, 0 0 0 8px ${rgbaSoft}, 0 0 26px 14px ${rgbaSoft} !important;}\n`;
      }
    }
  }
  return css;
}

/**
 * 将 CSS 文本注入/更新到 <style id="user-style-rules">（总在 <head> 末尾）
 */
export function injectUserStyle(css) {
  let el = document.getElementById('user-style-rules');
  if (!el) {
    el = document.createElement('style');
    el.id = 'user-style-rules';
  } else if (el.parentNode) {
    el.parentNode.removeChild(el);
  }
  el.textContent = css || '';
  (document.head || document.documentElement).appendChild(el);
}

/**
 * 入口：根据状态直接应用样式（优先远程编译，失败则本地兜底）
 * @param {Object} styleState 由 buildEngineStyleState() 生成
 * @param {Object} opts
 *  - selectorBase/titleSelector/attrPriority/borderWidthPx：传给本地编译
 *  - remoteCompileUrl：远程编译服务地址（默认 globalThis.STYLE_COMPILE_ENDPOINT 或 '/api/compile-style'）
 *  - timeoutMs：远程编译超时时间（默认 7000ms）
 *  - fetchImpl：自定义 fetch 实现（用于测试/Polyfill）
 */
export async function applyStyleState(styleState, opts = {}) {
  const payload = {
    state: styleState,
    engineVersion: 1,
    options: {
      selectorBase: opts.selectorBase || '.vis-item.event, .vis-item-content.event',
      titleSelector: opts.titleSelector || '.event-title'
    }
  };

  const endpoint =
    opts.remoteCompileUrl ||
    globalThis?.STYLE_COMPILE_ENDPOINT ||
    '/api/compile-style';

  const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 7000;
  const fetchImpl = typeof opts.fetchImpl === 'function' ? opts.fetchImpl : fetch;

  // 远程优先
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const css = await res.text();
    injectUserStyle(css);
    return;
  } catch (e) {
    console.warn('[style] remote compile failed, fallback to local:', e);
  }

  // 本地兜底
  try {
    const css = compileStyleRules(styleState, opts);
    injectUserStyle(css);
  } catch (e2) {
    console.error('[style] local compile also failed:', e2);
  }
}
