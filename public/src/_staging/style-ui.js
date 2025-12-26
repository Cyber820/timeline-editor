// public/src/_staging/style-ui.js
// 🎯 目的：提供“样式相关 UI 的杂项工具 & 临时接线点”
// - bindToolbar(): 为页面上现有按钮做轻量绑定（若存在），无则保持占位逻辑
// - renderSimpleOptions(): 向 <select> 写入简单选项
// - buildStyleControl(type, deps): 返回一个颜色/字体的输入控件（不直接写规则，只分发事件）
// - applyCurrentStylesInjected(opts): 将 UI 态（boundStyleType/styleRules）构造成引擎态并应用
//
// ⚠️ 这里不包含编译器逻辑（编译在 style/engine.js 或远程服务）；不做数据拉取（fetch 可能在 app.js）。

import {
  buildEngineStyleState,
  // 可选：如需中文标签/预设色等，可解开并传给 buildStyleControl 的 deps
  // attributeLabels,
  // PRESET_COLORS,
  // styleLabel,
} from './constants.js';

import {
  openAttrPicker,
  confirmAttrPicker,
  closeAttrPicker,
  selectAllInAttrPicker,
  clearAttrPicker,
} from '../ui/attr-picker.js';

import { t } from '../ui-text/index.js';

// 供其它地方复用的小工具（保持原导出）
export { isSameSet } from '../utils/data.js';
export { getTakenValues, readRowStyleKey } from '../utils/dom.js';

/* =========================
 * 工具栏/弹窗：占位绑定（若页面存在这些 id）
 * ========================= */
function log(...args) {
  try {
    console.log('[style-ui]', ...args);
  } catch {}
}

function safeAlert(msgKey, fallback) {
  // msgKey 缺失时，t() 会回退到中文/或 key；这里再兜一层 fallback，保证可读
  const s = t(msgKey);
  alert(s && s !== msgKey ? s : (fallback || msgKey));
}

function applyTextToToolbarButtons() {
  // 统一让按钮文字由字典控制（即便 HTML 写死了，这里也会覆盖）
  const map = [
    ['btn-help', 'info.buttons.usage'],
    ['btn-roadmap', 'info.buttons.roadmap'],
    ['btn-feedback', 'info.buttons.feedback'],
  ];
  for (const [id, key] of map) {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  }
}

/**
 * 绑定页面上的若干按钮（若存在）。不存在则忽略。
 * - 过滤相关仍保留占位（你的过滤交互后面在 app.js 里接全）
 * - 属性选择弹窗按钮（#attr-picker-*）会接入 attr-picker 的真实逻辑
 */
export function bindToolbar() {
  // 让顶栏按钮文字也走字典（可选，但推荐）
  applyTextToToolbarButtons();

  // ===== 过滤区：占位（第二轮在 app.js 里接线） =====
  window.openFilterWindow = function () {
    const el = document.getElementById('filter-window');
    if (el) el.style.display = 'block';
  };
  window.openAddFilter = function () {
    const el = document.getElementById('add-filter-window');
    if (el) el.style.display = 'block';
  };
  window.resetFilters = function () {
    safeAlert('toolbar.placeholders.filtersReset', '已复原过滤标准（占位）');
  };
  window.applyFilters = function () {
    safeAlert('toolbar.placeholders.filtersAppliedAnd', '已应用 AND 逻辑（占位）');
  };
  window.applyFiltersOr = function () {
    safeAlert('toolbar.placeholders.filtersAppliedOr', '已应用 OR 逻辑（占位）');
  };

  // ===== 样式面板：占位（真实面板在 style-panel.js） =====
  window.openStyleWindow = function (attr) {
    const el = document.getElementById('style-window');
    if (!el) return;
    el.style.display = 'block';

    const titleEl = document.getElementById('style-title');
    if (titleEl) {
      const label = attr || t('common.attribute');
      titleEl.textContent = t('style.window.title', { attr: label });
    }

    const hint = document.getElementById('bound-type-hint');
    if (hint) hint.textContent = t('style.window.currentStyleNone');
  };

  window.closeStyleWindow = function () {
    const el = document.getElementById('style-window');
    if (el) el.style.display = 'none';
  };

  window.addStyleRow = function () {
    safeAlert('style.placeholders.addStyleRow', '新增样式（占位）');
  };

  window.confirmStyle = function () {
    safeAlert('style.placeholders.saved', '样式已保存（占位）');
    const el = document.getElementById('style-window');
    if (el) el.style.display = 'none';
  };

  // ===== 属性选择弹窗：若存在这些元素，则接入真实逻辑 =====
  const picker = document.getElementById('attr-picker-window');
  const confirmBtn = document.getElementById('attr-picker-confirm');
  const cancelBtn = document.getElementById('attr-picker-cancel');
  const selAllBtn = document.getElementById('attr-picker-select-all');
  const clearBtn = document.getElementById('attr-picker-clear');

  if (confirmBtn) confirmBtn.addEventListener('click', () => confirmAttrPicker());
  if (cancelBtn) cancelBtn.addEventListener('click', () => closeAttrPicker());
  if (selAllBtn) selAllBtn.addEventListener('click', () => selectAllInAttrPicker());
  if (clearBtn) clearBtn.addEventListener('click', () => clearAttrPicker());

  // 暴露一个“打开选择器”的全局函数（兼容你页面 onclick）
  window.openAttrPicker = function (rowId, attrKey) {
    if (!picker) return safeAlert('attrPicker.notReady', '属性选择弹窗未就绪（占位）');
    openAttrPicker(rowId, attrKey);
  };

  log('toolbar bound');
}

/* =========================
 * 选项渲染（简单 <select>）
 * ========================= */
export function renderSimpleOptions(selectEl, list) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  (list || []).forEach((opt) => {
    const o = document.createElement('option');
    o.value = o.textContent = opt;
    selectEl.appendChild(o);
  });
}

/* =========================
 * 样式控件工厂（字体 / 颜色）
 * - 返回 DOM，但不直接写 rule.style；通过触发 change/input 事件交由外层同步
 * ========================= */
export function buildStyleControl(type, deps = {}) {
  const { PRESET_COLORS = [] } = deps;
  const wrap = document.createElement('div');

  // ====== 字体族 ======
  if (type === 'fontFamily') {
    const fontSel = document.createElement('select');
    fontSel.innerHTML = `
      <option value="">${t('style.controls.fontFamily.placeholder')}</option>
      <option value="STCaiyun">华文彩云 (STCaiyun)</option>
      <option value="FZShuTi">方正舒体 (FZShuTi)</option>
      <option value="FZYaoti">方正姚体 (FZYaoti)</option>
      <option value="Microsoft YaHei, PingFang SC, Noto Sans SC, system-ui">微软雅黑 / 苹方 / 思源黑体</option>
      <option value="DengXian">等线 (DengXian)</option>
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
    color.setAttribute('aria-label', t('style.controls.color.ariaLabel'));

    // 2) HEX 输入（带预览）
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
      if (/^#([0-9a-fA-F]{3})$/.test(s)) s = '#' + s.slice(1).split('').map((ch) => ch + ch).join('');
      if (/^#([0-9a-fA-F]{6})$/.test(s)) return s.toUpperCase();
      return null;
    }

    function textOn(bg) {
      const n = normalizeHex(bg);
      if (!n) return '#111';
      const r = parseInt(n.slice(1, 3), 16);
      const g = parseInt(n.slice(3, 5), 16);
      const b = parseInt(n.slice(5, 7), 16);
      const L = 0.299 * r + 0.587 * g + 0.114 * b;
      return L > 180 ? '#111' : '#fff';
    }

    function applyPreview(v) {
      hex.style.background = v;
      hex.style.color = textOn(v);
    }
    applyPreview(hex.value);

    // —— 同步：取色器 → HEX（实时）——
    color.addEventListener('input', () => {
      const v = color.value.toUpperCase();
      hex.value = v;
      applyPreview(v);
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

    // 3) 预设色块
    const sw = document.createElement('div');
    sw.className = 'swatches';

    // 默认调色板：以前是中文名；现在改为可翻译 label + hex
    const palette =
      Array.isArray(PRESET_COLORS) && PRESET_COLORS.length
        ? PRESET_COLORS
        : [
            { labelKey: 'style.palette.amber', hex: '#F59E0B' },
            { labelKey: 'style.palette.indigo', hex: '#6366F1' },
            { labelKey: 'style.palette.emerald', hex: '#10B981' },
            { labelKey: 'style.palette.rose', hex: '#F43F5E' },
            { labelKey: 'style.palette.sky', hex: '#0EA5E9' },
            { labelKey: 'style.palette.violet', hex: '#8B5CF6' },
            { labelKey: 'style.palette.lime', hex: '#84CC16' },
            { labelKey: 'style.palette.orange', hex: '#F97316' },
            { labelKey: 'style.palette.magenta', hex: '#D946EF' },
          ];

    palette.forEach((c) => {
      const s = document.createElement('div');
      s.className = 'swatch';

      const name = c.name || (c.labelKey ? t(c.labelKey) : '');
      s.title = `${name ? name + ' ' : ''}${c.hex}`;

      s.style.cssText =
        'display:inline-block;width:18px;height:18px;border-radius:4px;margin:4px;cursor:pointer;border:1px solid rgba(0,0,0,.15);';
      s.style.background = c.hex;

      s.addEventListener('click', () => {
        const val = String(c.hex).toUpperCase();
        color.value = val;
        hex.value = val;
        applyPreview(val);
        color.dispatchEvent(new Event('input', { bubbles: true }));
        hex.dispatchEvent(new Event('change', { bubbles: true }));
      });

      sw.appendChild(s);
    });

    wrap.appendChild(sw);
    return wrap;
  }

  // 其他类型占位
  wrap.textContent = t('style.controls.todo', { type });
  return wrap;
}

/* =========================
 * 一键构建并应用当前样式（UI 态 → 引擎态 → 可选持久化 → 应用）
 * ========================= */
export function applyCurrentStylesInjected({
  // 必需内存（来自面板/表格）
  boundStyleType = {},
  styleRules = {},

  // 引擎调用：将状态交给编译器/注入器
  applyEngine = (state, opts) => {},

  // 选择器（与现网保持一致，便于第二轮替换）
  selectorBase = '.vis-item.event, .vis-item-content.event',
  titleSelector = '.event-title',

  // 持久化
  persist = true,
  storageKey = 'timelineStyle.v1',
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
} = {}) {
  const state = buildEngineStyleState(boundStyleType, styleRules);

  if (persist && storage && typeof storage.setItem === 'function') {
    try {
      storage.setItem(storageKey, JSON.stringify(state));
    } catch {}
  }

  applyEngine(state, { selectorBase, titleSelector });
  return state;
}
