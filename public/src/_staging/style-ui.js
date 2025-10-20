// public/src/_staging/style-ui.js
// 当前以“显示时间轴”为目标：拉数据 → 规范化 → 渲染 vis.Timeline
// 保留你现有的样式/筛选占位逻辑；后续再逐步拆分

import {
  getFilterOptionsForKeyFrom,
  createEmptyRuleForType,
  ensureBucketIn,
  buildEngineStyleState,
  // 如需中文标签/颜色/样式名，可按需解开：
  // attributeLabels,
  // PRESET_COLORS,
  // styleLabel,
} from './constants.js';

import { toISO } from '../utils/data.js';
import { escapeHtml } from '../utils/dom.js';


import { fetchAndNormalize } from './fetch.js';

import { openAttrPicker } from '../ui/attr-picker.js';

export { isSameSet } from '../utils/data.js';
export { getTakenValues, readRowStyleKey } from '../utils/dom.js';




// 根据 rowId 在给定 tbody 内找到 .attr-chips 渲染（避免依赖全局 #styleTableBody）


// 依赖注入版：只构造 UI，不直接写 rule.style，不依赖 window.*
// 用法（第二遍时）：buildStyleControl('fontColor', { PRESET_COLORS })




/**
 * 依赖注入版：应用当前样式（可选持久化）
 * —— 不直接访问 window/localStorage/DOM；由调用方注入
 */
export function applyCurrentStylesInjected({
  // 必需内存
  boundStyleType = {},
  styleRules = {},

  // 引擎调用
  applyEngine = (state, opts) => {},

  // 选择器（与现网保持一致，便于第二遍替换）
  selectorBase = '.vis-item.event, .vis-item-content.event',
  titleSelector = '.event-title',

  // 持久化
  persist = true,
  storageKey = 'timelineStyle.v1',
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
} = {}) {
  const state = buildEngineStyleState(boundStyleType, styleRules);

  if (persist && storage && typeof storage.setItem === 'function') {
    try { storage.setItem(storageKey, JSON.stringify(state)); } catch {}
  }

  applyEngine(state, { selectorBase, titleSelector });
  return state;
}

/*==================
staging-ui.js保留位置
  ===================*/
/* =========================
 * —— 新增：按钮/弹窗占位绑定 —— 
 *   保持与你页面 onclick 兼容（可在 app.js 调用）
 * ========================= */
export function bindToolbar() {
  // 过滤
  window.openFilterWindow = function () {
    const el = document.getElementById('filter-window');
    if (el) el.style.display = 'block';
  };
  window.openAddFilter = function () {
    const el = document.getElementById('add-filter-window');
    if (el) el.style.display = 'block';
  };
  window.resetFilters = function () { alert('已复原过滤标准（占位）'); };
  window.applyFilters = function () { alert('已应用 AND 逻辑（占位）'); };
  window.applyFiltersOr = function () { alert('已应用 OR 逻辑（占位）'); };

  // 样式
  window.openStyleWindow = function (attr) {
    const el = document.getElementById('style-window');
    if (!el) return;
    el.style.display = 'block';
    const title = document.getElementById('style-title');
    if (title) title.textContent = (attr || '属性') + ' 样式';
    const hint = document.getElementById('bound-type-hint');
    if (hint) hint.textContent = '当前样式：无';
  };
  window.closeStyleWindow = function () {
    const el = document.getElementById('style-window');
    if (el) el.style.display = 'none';
  };
  window.addStyleRow = function () { alert('新增样式（占位）'); };
  window.confirmStyle = function () {
    alert('样式已保存（占位）');
    const el = document.getElementById('style-window');
    if (el) el.style.display = 'none';
  };

  // 属性选择弹窗按钮
  const picker = document.getElementById('attr-picker-window');
  const confirmBtn = document.getElementById('attr-picker-confirm');
  const cancelBtn = document.getElementById('attr-picker-cancel');
  const selAllBtn = document.getElementById('attr-picker-select-all');
  const clearBtn = document.getElementById('attr-picker-clear');
  if (confirmBtn) confirmBtn.addEventListener('click', () => { alert('已选择（占位）'); if (picker) picker.style.display = 'none'; });
  if (cancelBtn) cancelBtn.addEventListener('click', () => { if (picker) picker.style.display = 'none'; });
  if (selAllBtn) selAllBtn.addEventListener('click', () => alert('全选（占位）'));
  if (clearBtn) clearBtn.addEventListener('click', () => alert('全不选（占位）'));

  log('toolbar bound');
}

export function renderSimpleOptions(selectEl, list) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  (list || []).forEach(opt => {
    const o = document.createElement('option');
    o.value = o.textContent = opt;
    selectEl.appendChild(o);
  });
}

export function buildStyleControl(type, deps = {}) {
  const { PRESET_COLORS = [] } = deps;
  const wrap = document.createElement('div');

  // ====== 字体族 ======
  if (type === 'fontFamily') {
    const fontSel = document.createElement('select');
    fontSel.innerHTML = `
      <option value="">请选择字体</option>
      <option value="STCaiyun">华文彩云 (STCaiyun)</option>
      <option value="FZShuTi">方正舒体 (FZShuTi)</option>
      <option value="FZYaoti">方正姚体 (FZYaoti)</option>
      <option value='"Microsoft YaHei"'>微软雅黑 (Microsoft YaHei)</option>
      <option value="DengXian">等线 (DengXian)</option>
      <option value="LiSu">隶书 (LiSu)</option>
      <option value="YouYuan">幼圆 (YouYuan)</option>
      <option value="SimSun">宋体 (SimSun)</option>
      <option value="SimHei">黑体 (SimHei)</option>
      <option value="KaiTi">楷体 (KaiTi)</option>
    `;
    wrap.appendChild(fontSel);
    return wrap;
  }

  // ====== 颜色类：fontColor / borderColor / backgroundColor / haloColor ======
  if (['fontColor', 'borderColor', 'backgroundColor', 'haloColor'].includes(type)) {
    wrap.className = 'color-ui';

    // 1) 原生取色器
    const color = document.createElement('input');
    color.type = 'color';
    color.value = '#000000';
    color.setAttribute('aria-label', '选择颜色');

    // 2) HEX 输入
    const hex = document.createElement('input');
    hex.type = 'text';
    hex.placeholder = '#RRGGBB';
    hex.value = color.value.toUpperCase();
    hex.inputMode = 'text';
    hex.pattern = '^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$';
        // —— 工具：HEX 规范化 + 文本可读色 + 预览 —— //
    function normalizeHex(v) {
      let s = String(v || '').trim();
      if (!s) return null;
      if (s[0] !== '#') s = '#' + s;
      if (/^#([0-9a-fA-F]{3})$/.test(s)) s = '#' + s.slice(1).split('').map(ch => ch + ch).join('');
      if (/^#([0-9a-fA-F]{6})$/.test(s)) return s.toUpperCase();
      return null;
    }
    function textOn(bg) {
      const n = normalizeHex(bg);
      if (!n) return '#111';
      const r = parseInt(n.slice(1,3),16), g = parseInt(n.slice(3,5),16), b = parseInt(n.slice(5,7),16);
      const L = 0.299*r + 0.587*g + 0.114*b;
      return L > 180 ? '#111' : '#fff';
    }
    function applyPreview(v) {
      hex.style.background = v;
      hex.style.color = textOn(v);
    }
    applyPreview(hex.value);

    // —— 同步：取色器 -> HEX（实时）——
    color.addEventListener('input', () => {
      const v = color.value.toUpperCase();
      hex.value = v;
      applyPreview(v);
      // 只分发事件给外层；本函数不直接写 rule.style
      hex.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // —— 同步：HEX 输入预览 + 同步取色器 —— 
    hex.addEventListener('input', () => {
      const n = normalizeHex(hex.value);
      if (n) {
        color.value = n;
        applyPreview(n);
      }
    });
    // 失焦校正
    hex.addEventListener('change', () => {
      const n = normalizeHex(hex.value);
      if (n) {
        hex.value = n;
        color.value = n;
        applyPreview(n);
      } else {
        hex.value = color.value.toUpperCase();
        applyPreview(hex.value);
      }
    });

    // —— 点击/聚焦 HEX 时唤起取色器 —— 
    hex.addEventListener('focus', () => color.focus());
    hex.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof color.showPicker === 'function') color.showPicker();
      else color.click();
    });

    wrap.appendChild(color);
    wrap.appendChild(hex);

    // 3) 预设色块（9 个非黑白）
    const sw = document.createElement('div');
    sw.className = 'swatches';

    const palette = (Array.isArray(PRESET_COLORS) && PRESET_COLORS.length)
      ? PRESET_COLORS
      : [
          { name: '琥珀',   hex: '#F59E0B' },
          { name: '靛蓝',   hex: '#6366F1' },
          { name: '祖母绿', hex: '#10B981' },
          { name: '玫红',   hex: '#F43F5E' },
          { name: '天青',   hex: '#0EA5E9' },
          { name: '紫罗兰', hex: '#8B5CF6' },
          { name: '青柠',   hex: '#84CC16' },
          { name: '橙',     hex: '#F97316' },
          { name: '洋红',   hex: '#D946EF' }
        ];

    palette.forEach(c => {
      const s = document.createElement('div');
      s.className = 'swatch';
      s.title = `${c.name} ${c.hex}`;
      s.style.cssText = 'display:inline-block;width:18px;height:18px;border-radius:4px;margin:4px;cursor:pointer;border:1px solid rgba(0,0,0,.15);';
      s.style.background = c.hex;
      s.addEventListener('click', () => {
        const val = String(c.hex).toUpperCase();
        color.value = val;
        hex.value = val;
        applyPreview(val);
        color.dispatchEvent(new Event('input',  { bubbles: true }));
        hex.dispatchEvent(new Event('change', { bubbles: true }));
      });
      sw.appendChild(s);
    });
    wrap.appendChild(sw);

    return wrap;
  }

  // 其他类型占位
  wrap.textContent = type + '（待配置）';
  return wrap;
}
