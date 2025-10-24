// src/ui/style-panel.js
// ✅ 职责：样式编辑面板（UI 层）
// - 打开/关闭面板
// - 将 stateMem 中的“编辑中内存态” ↔ 持久化 styleState（localStorage）进行同步
// - 保存后触发样式引擎编译 + 注入（远程优先/本地兜底，见 engine.js）
//
// 依赖：
//   - 状态：stateMem（运行时内存） + styleState（持久化）
//   - 引擎：buildEngineStyleState（构造引擎态）+ applyStyleState（应用）
//   - UI：style-table（表格渲染与行渲染）
//   - 工具：genId（生成行 id）
//
// 说明：本模块不实现“属性选择弹窗”等复杂 UI，保留钩子，第二轮再接。

import { getStyleState, setStyleState } from '../state/styleState.js';
import { applyStyleState } from '../style/engine.js';
import { stateMem } from '../style/stateMem.js';
import {
  uiTypeToInternal,
  ENGINE_KEY_MAP,
  buildEngineStyleState,
  ensureBucketIn,
  createEmptyRuleForType,
  attributeLabels,
  styleLabel as styleLabelText,
} from '../_staging/constants.js';
import { genId } from '../utils/id.js';
import { renderStyleTable, renderRuleRow } from './style-table.js';

// —— 模块内轻量状态（仅面板视图配置）
let _mounted = false;
let _opts = { selectorBase: '.vis-item.event', titleSelector: '.event-title' };

/** ========== 对外导出：打开/关闭面板 ========== */
export function openStylePanel(opts = {}) {
  _opts = { ..._opts, ...opts };
  const root = document.getElementById('style-window');

  if (root) {
    mountHandlersOnce(root);
    // 将持久化状态回填到 stateMem + 表格
    injectStateIntoPanel(getStyleState());
    root.style.display = '';
    return;
  }

  // 若页面尚无真实面板，启用临时 JSON 面板以验证保存/应用链路
  openFallbackJsonPanel();
}

export function closeStylePanel() {
  const root = document.getElementById('style-window');
  if (root) root.style.display = 'none';
}

/** ========== 一次性事件绑定（按钮等） ========== */
function mountHandlersOnce(root) {
  if (_mounted) return;
  _mounted = true;

  const btnSave  = root.querySelector('#style-save')  || document.getElementById('style-save');
  const btnReset = root.querySelector('#style-reset') || document.getElementById('style-reset');
  const btnClose = root.querySelector('#style-close') || document.getElementById('style-close');

  btnSave  && btnSave.addEventListener('click', onSaveFromPanel);
  btnReset && btnReset.addEventListener('click', onResetFromPanel);
  btnClose && btnClose.addEventListener('click', () => closeStylePanel());
}

/** ========== 保存/重置：把 stateMem ↔ 持久态/引擎态 对接 ========== */
function onSaveFromPanel() {
  // 通过 constants.js 的构造器，把 UI 内存（stateMem）转为引擎态
  const engineState = buildEngineStyleState(
    stateMem.boundStyleType,
    stateMem.styleRules,
    ENGINE_KEY_MAP,
  );

  const saved = setStyleState(engineState);
  applyStyleState(saved, _opts); // 立即生效（编译 CSS + 注入）
}

function onResetFromPanel() {
  // 清空运行时内存
  stateMem.currentStyleAttr = null;
  stateMem.boundStyleType = {};
  stateMem.styleTypeOwner = {};
  stateMem.styleRules = {};
  stateMem.styleRowSelections = {};

  const empty = { version: 1, boundTypes: {}, rules: {} };
  const saved = setStyleState(empty);
  applyStyleState(saved, _opts);
  // UI 清空
  const tbody = document.getElementById('styleTableBody');
  if (tbody) tbody.innerHTML = '';
}

/** ========== 状态注入：持久态 → stateMem + UI重建 ========== */
function injectStateIntoPanel(state) {
  // 1) 清空 stateMem
  stateMem.currentStyleAttr = null;
  stateMem.boundStyleType = {};
  stateMem.styleTypeOwner = {};
  stateMem.styleRules = {};
  stateMem.styleRowSelections = {};

  // 2) 引擎键 → UI 键的映射
  const fromEngineKey = (t) =>
    ({
      textColor: 'fontColor',
      bgColor: 'backgroundColor',
      borderColor: 'borderColor',
      fontFamily: 'fontFamily',
      haloColor: 'haloColor',
      none: 'none',
    }[t] || t);

  // 3) 写回绑定（boundTypes）
  const boundTypes = state?.boundTypes || {};
  for (const [attr, engKey] of Object.entries(boundTypes)) {
    const uiKey = fromEngineKey(engKey || 'none');
    stateMem.boundStyleType[attr] = uiKey;
    if (uiKey && uiKey !== 'none') {
      // 占用表
      const internal = uiTypeToInternal(uiKey);
      stateMem.styleTypeOwner[internal] = attr;
    }
  }

  // 4) 写回规则（rules）→ 生成行
  const rules = state?.rules || {};
  for (const [attr, valMap] of Object.entries(rules)) {
    const uiType = stateMem.boundStyleType[attr] || 'none';
    if (uiType === 'none') continue;

    // 将相同 style 的值合并为一行
    const groups = new Map(); // key(JSON) -> { style, values:[] }
    for (const [val, conf] of Object.entries(valMap || {})) {
      const st = {};
      if (uiType === 'fontColor' && conf.textColor) st.fontColor = conf.textColor;
      if (uiType === 'backgroundColor' && conf.bgColor) st.backgroundColor = conf.bgColor;
      if (uiType === 'borderColor' && conf.borderColor) st.borderColor = conf.borderColor;
      if (uiType === 'fontFamily' && conf.fontFamily) st.fontFamily = conf.fontFamily;
      if (uiType === 'haloColor' && conf.haloColor) st.haloColor = conf.haloColor;

      const key = JSON.stringify(st);
      if (!groups.has(key)) groups.set(key, { style: st, values: [] });
      groups.get(key).values.push(val);
    }

    const bucket = ensureBucketIn(stateMem.styleRules, attr);
    for (const { style, values } of groups.values()) {
      bucket.push({
        id: genId('rule_'),
        type: uiType,
        style,
        values,
      });
    }
  }

  // 5) 如已有当前属性，重绘表格（否则由用户选择时再绘）
  if (stateMem.currentStyleAttr) {
    renderStyleTable(stateMem.currentStyleAttr);
  }
}

/** ========== 下方是面板交互可以复用的通用小函数 ========== */

/**
 * 刷新“样式类型”下拉的可用项与提示文案：
 * - 全局唯一型（如字体、颜色类）若已被占用，则在文案后标注“已绑定：xxx”
 * - 当前属性已绑定时，禁止再切换（使用 reset 解锁）
 */
export function refreshStyleTypeOptionsInSelect(selectEl, deps) {
  if (!selectEl || !selectEl.options) return;
  const {
    uiTypeToInternal,
    styleTypeOwner = stateMem.styleTypeOwner,
    currentStyleAttr = stateMem.currentStyleAttr,
    attributeLabels = attributeLabels,
  } = deps || {};

  Array.from(selectEl.options).forEach((opt) => {
    if (!opt.dataset.baseText) opt.dataset.baseText = opt.textContent;
    const internal = uiTypeToInternal ? uiTypeToInternal(opt.value) : opt.value;

    if (internal === 'none') {
      opt.disabled = false;
      opt.textContent = opt.dataset.baseText;
      return;
    }

    const owner = styleTypeOwner[internal];
    const isMine = owner === currentStyleAttr;

    opt.disabled = !!(owner && !isMine);
    opt.textContent =
      opt.dataset.baseText +
      (owner && !isMine ? `（已绑定：${attributeLabels[owner] || owner}）` : '');
  });
}

/** 计算面板标题/按钮初始可见性等（供渲染层使用） */
export function computeStyleWindowViewModel(attr, deps = {}) {
  const {
    boundStyleType = stateMem.boundStyleType,
    attributeLabels = attributeLabels,
    styleLabel = styleLabelText,
  } = deps;

  const titleText = `${attributeLabels[attr] || attr} 样式`;
  const bound = boundStyleType[attr] || 'none';
  const hasBound = bound !== 'none';

  return {
    titleText,
    hintText: hasBound ? `当前样式：${styleLabel(bound)}` : '当前样式：无',
    ui: {
      confirm: { disabled: true, display: hasBound ? 'none' : 'inline-block' },
      reset: { display: hasBound ? 'inline-block' : 'none' },
      add: { disabled: !hasBound },
      typeSelDefault: 'none',
      tbodyClear: true,
      windowDisplay: 'block',
    },
  };
}

/**
 * 将 VM 应用到真实 DOM（独立出来，便于重用与测试）
 */
export function applyStyleWindowView(rootEls, vm) {
  const { styleTitleEl, styleWindowEl, typeSelEl, tbodyEl, confirmBtnEl, resetBtnEl, addBtnEl, hintEl } = rootEls;

  if (styleTitleEl) styleTitleEl.textContent = vm.titleText;
  if (hintEl) hintEl.textContent = vm.hintText;
  if (styleWindowEl && styleWindowEl.style) styleWindowEl.style.display = vm.ui.windowDisplay;

  if (typeSelEl) typeSelEl.value = vm.ui.typeSelDefault;
  if (tbodyEl && vm.ui.tbodyClear) tbodyEl.innerHTML = '';

  if (confirmBtnEl) {
    confirmBtnEl.disabled = vm.ui.confirm.disabled;
    confirmBtnEl.style.display = vm.ui.confirm.display;
  }
  if (resetBtnEl) resetBtnEl.style.display = vm.ui.reset.display;
  if (addBtnEl) addBtnEl.disabled = vm.ui.add.disabled;
}

/**
 * 监听“样式类型选择”变更；返回本次阶段选择的结果（stagedType）
 * - 若该类型被其它属性占用，则阻止并提示
 * - 若当前属性已绑定且未重置，也阻止切换
 */
export function onStyleTypeChangeInSelect(selectEl, deps = {}) {
  if (!selectEl) return { stagedType: 'none', blockedBy: 'no-select' };

  const {
    uiTypeToInternal = (v) => v,
    boundStyleType = stateMem.boundStyleType,
    currentStyleAttr = stateMem.currentStyleAttr,
    styleTypeOwner = stateMem.styleTypeOwner,
    attributeLabels = attributeLabels,
    styleLabel = styleLabelText,
    confirmBtnEl = null,
    hintEl = null,
    refreshOptions = null,
    notify = null,
  } = deps;

  const disableConfirm = (yes) => {
    if (confirmBtnEl) confirmBtnEl.disabled = !!yes;
  };
  const setHint = (txt) => {
    if (hintEl) hintEl.textContent = txt;
  };

  let mapped = uiTypeToInternal(selectEl.value) || 'none';
  let stagedType = mapped;

  // 当前属性已绑定：必须先“重置”
  const already = boundStyleType[currentStyleAttr] && boundStyleType[currentStyleAttr] !== 'none';
  if (already) {
    selectEl.value = 'none';
    stagedType = 'none';
    setHint(`当前绑定：${styleLabel(boundStyleType[currentStyleAttr])}（如需更改，请先“重置”）`);
    disableConfirm(true);
    return { stagedType, blockedBy: 'self-bound' };
  }

  // 全局唯一型占用判断
  if (mapped !== 'none') {
    const owner = styleTypeOwner[mapped];
    const isMine = owner === currentStyleAttr;
    if (owner && !isMine) {
      const msg = `“${styleLabel(mapped)}” 已绑定到【${attributeLabels[owner] || owner}】。\n如需转移，请先到该属性中点击“重置”。`;
      if (typeof notify === 'function') notify(msg);
      selectEl.value = 'none';
      stagedType = 'none';
      disableConfirm(true);
      if (typeof refreshOptions === 'function') refreshOptions();
      return { stagedType, blockedBy: 'occupied', owner };
    }
  }

  // 正常可选
  disableConfirm(stagedType === 'none');
  return { stagedType, blockedBy: null };
}

/**
 * 确认绑定动作：写入 stateMem.boundStyleType / styleTypeOwner，并更新按钮可用态
 */
export function confirmBindAction(deps = {}) {
  const {
    stagedType = 'none',
    currentStyleAttr = stateMem.currentStyleAttr,
    boundStyleType = stateMem.boundStyleType,
    styleTypeOwner = stateMem.styleTypeOwner,
    attributeLabels = attributeLabels,
    styleLabel = styleLabelText,
    tbodyEl = null,
    confirmBtnEl = null,
    resetBtnEl = null,
    addBtnEl = null,
    hintEl = null,
    refreshOptions = null,
    addStyleRow = () => {}, // 注入自定义新增行逻辑（通常来自 style-table.js）
    notify = (msg) => alert(msg),
    confirmDialog = (msg) => window.confirm(msg),
  } = deps;

  if (stagedType === 'none') return { ok: false, reason: 'none' };

  // 再验占用
  const owner = styleTypeOwner[stagedType];
  if (owner && owner !== currentStyleAttr) {
    notify(`“${styleLabel(stagedType)}” 已绑定到【${attributeLabels[owner] || owner}】。\n如需转移，请先到该属性中点击“重置”。`);
    return { ok: false, reason: 'occupied', owner };
  }

  // 若此前有绑定且不同，需清空原规则
  const prev = boundStyleType[currentStyleAttr] || 'none';
  if (prev !== 'none' && prev !== stagedType) {
    const ok = confirmDialog('切换样式类型将清空该属性下已添加的样式行，是否继续？');
    if (!ok) return { ok: false, reason: 'cancelled' };
    if (tbodyEl) tbodyEl.innerHTML = '';
    if (styleTypeOwner[prev] === currentStyleAttr) delete styleTypeOwner[prev];
    // 同时清空 stateMem.styleRules[attr]
    const bucket = stateMem.styleRules[currentStyleAttr];
    if (bucket) bucket.length = 0;
  }

  // 写入绑定与占用
  boundStyleType[currentStyleAttr] = stagedType;
  styleTypeOwner[stagedType] = currentStyleAttr;

  // UI
  if (confirmBtnEl) {
    confirmBtnEl.disabled = true;
    confirmBtnEl.style.display = 'none';
  }
  if (resetBtnEl) resetBtnEl.style.display = 'inline-block';
  if (addBtnEl) addBtnEl.disabled = false;
  if (hintEl) hintEl.textContent = `当前样式：${styleLabel(stagedType)}`;

  if (typeof refreshOptions === 'function') refreshOptions();
  if (typeof addStyleRow === 'function') addStyleRow();

  return { ok: true, bound: stagedType, attr: currentStyleAttr };
}

/** 重置绑定：释放占用、清空行、复位按钮，并立即“保存+应用” */
export function resetBindAction(deps = {}) {
  const {
    currentStyleAttr = stateMem.currentStyleAttr,
    boundStyleType = stateMem.boundStyleType,
    styleTypeOwner = stateMem.styleTypeOwner,
    styleRulesRef = stateMem.styleRules,
    tbodyEl = null,
    typeSelEl = null,
    confirmBtnEl = null,
    resetBtnEl = null,
    addBtnEl = null,
    hintEl = null,
    refreshOptions = null,
    applyCurrentStyles = quickApplyCurrentStyles,
    confirmDialog = (msg) => window.confirm(msg),
  } = deps;

  // 是否有行，二次确认
  const hasRows = !!tbodyEl && tbodyEl.querySelectorAll('tr').length > 0;
  const ok = !hasRows || confirmDialog('重置将清空该属性下所有样式行，是否继续？');
  if (!ok) return { ok: false, reason: 'cancelled' };

  // 释放占用者
  const prev = boundStyleType[currentStyleAttr] || 'none';
  if (prev !== 'none' && styleTypeOwner[prev] === currentStyleAttr) {
    delete styleTypeOwner[prev];
  }

  // 清空规则与绑定
  boundStyleType[currentStyleAttr] = 'none';
  if (styleRulesRef[currentStyleAttr]) styleRulesRef[currentStyleAttr].length = 0;
  if (tbodyEl) tbodyEl.innerHTML = '';

  // 复位控件与提示
  if (typeSelEl) typeSelEl.value = 'none';
  if (confirmBtnEl) {
    confirmBtnEl.disabled = true;
    confirmBtnEl.style.display = 'inline-block';
  }
  if (resetBtnEl) resetBtnEl.style.display = 'none';
  if (addBtnEl) addBtnEl.disabled = true;
  if (hintEl) hintEl.textContent = '当前样式：无';

  if (typeof refreshOptions === 'function') refreshOptions();

  // 立即保存并应用
  applyCurrentStyles({ persist: true });

  return { ok: true, stagedType: 'none' };
}

/** ========== 便捷：根据 stateMem 立即构建并应用（可选持久化） ========== */
function quickApplyCurrentStyles({ persist = false } = {}) {
  const engineState = buildEngineStyleState(
    stateMem.boundStyleType,
    stateMem.styleRules,
    ENGINE_KEY_MAP,
  );
  const next = persist ? setStyleState(engineState) : engineState;
  applyStyleState(next, _opts);
}

/** ========== 兜底 JSON 面板（当没有 #style-window 时临时使用） ========== */
function openFallbackJsonPanel() {
  let host = document.getElementById('style-panel-fallback');
  if (!host) {
    host = document.createElement('div');
    host.id = 'style-panel-fallback';
    host.style.cssText = `
      position:fixed; right:16px; top:16px; width:420px; max-height:70vh;
      background:#fff; border:1px solid #ccc; box-shadow:0 6px 24px rgba(0,0,0,.2);
      padding:12px; overflow:auto; z-index:9999; font-family:system-ui, sans-serif;
    `;
    host.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong>样式编辑器（临时 JSON 面板）</strong>
        <button id="sp-close">关闭</button>
      </div>
      <textarea id="sp-json" style="width:100%;height:260px;white-space:pre;font-family:ui-monospace,Consolas,monospace;"></textarea>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button id="sp-apply">保存并应用</button>
        <button id="sp-reset">清空并应用</button>
      </div>
    `;
    document.body.appendChild(host);
    host.querySelector('#sp-close').onclick = () => host.remove();
    host.querySelector('#sp-reset').onclick = () => {
      stateMem.currentStyleAttr = null;
      stateMem.boundStyleType = {};
      stateMem.styleTypeOwner = {};
      stateMem.styleRules = {};
      stateMem.styleRowSelections = {};
      const empty = { version: 1, boundTypes: {}, rules: {} };
      const saved = setStyleState(empty);
      applyStyleState(saved, _opts);
      host.querySelector('#sp-json').value = JSON.stringify(saved, null, 2);
    };
    host.querySelector('#sp-apply').onclick = () => {
      try {
        const next = JSON.parse(host.querySelector('#sp-json').value);
        const saved = setStyleState(next);
        applyStyleState(saved, _opts);
      } catch (e) {
        alert('JSON 解析失败：' + e.message);
      }
    };
  }
  host.querySelector('#sp-json').value = JSON.stringify(getStyleState(), null, 2);
}
