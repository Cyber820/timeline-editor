// src/ui/style-panel.js
import { getStyleState, setStyleState } from '../state/styleState.js';
import { applyStyleState } from '../style/engine.js';

let _mounted = false;
let _opts = { selectorBase: '.vis-item.event', titleSelector: '.event-title' };
let currentStyleAttr = null;         // 当前正在编辑的属性
const boundStyleType = {};           // { [attrKey]: 'fontFamily' | 'fontColor' | ... | 'none' }
let stagedType = 'none';             // 下拉的临时选择（未确认前）
// 全局：样式类型当前被哪个属性占用（如 { fontFamily: 'EventType' }）
const styleTypeOwner = {};
/*** 规则内存：每个属性对应一组规则行 ***/
// 结构：styleRules = { [attrKey]: Array<{ id, type, style: {}, values: string[] }> }
const styleRules = {};
// 每一行样式行里被选中的属性值集合：{ [rowId]: string[] }
const styleRowSelections = window.styleRowSelections || (window.styleRowSelections = {});
// 生成行 id（与 <tr data-row-id> 对应）
/** 公开：打开样式面板（优先使用你页面里的 #style-window） */
export function openStylePanel(opts = {}) {
  _opts = { ..._opts, ...opts };

  // 1) 优先寻找你已有的面板 DOM
  const root = document.getElementById('style-window');
  if (root) {
    mountHandlersOnce(root);
    // 把当前状态写回 UI（TODO: 你稍后把原来的“状态→UI”代码搬到这里）
    injectStateIntoPanel(getStyleState());
    root.style.display = ''; // 显示
    return;
  }

  // 2) 如果没有 #style-window，就用一个临时 JSON 面板（不改你页面结构）
  openFallbackJsonPanel();
}

/** 公开：关闭样式面板（仅当存在 #style-window 时有用） */
export function closeStylePanel() {
  const root = document.getElementById('style-window');
  if (root) root.style.display = 'none';
}

/** 只挂一次事件监听，避免重复绑定 */
function mountHandlersOnce(root) {
  if (_mounted) return;
  _mounted = true;

  // 你页面里用于“保存/应用/关闭/重置”的按钮（按需改成你的真实 ID）
  const btnSave  = root.querySelector('#style-save')  || document.getElementById('style-save');
  const btnClose = root.querySelector('#style-close') || document.getElementById('style-close');
  const btnReset = root.querySelector('#style-reset') || document.getElementById('style-reset');

  if (btnSave)  btnSave.addEventListener('click', onSaveFromPanel);
  if (btnClose) btnClose.addEventListener('click', () => closeStylePanel());
  if (btnReset) btnReset.addEventListener('click', onResetFromPanel);

  // 如果你的面板里还有“添加/修改属性”“打开属性选择器”等按钮，也把监听搬到这里来
  // 例如：
  // const btnAttrPicker = root.querySelector('#open-attr-picker');
  // if (btnAttrPicker) btnAttrPicker.addEventListener('click', openAttrPicker);
}

/** 点击“保存并应用”时：从 UI 读状态 -> 保存 -> 应用 */
function onSaveFromPanel() {
  const next = extractStateFromPanel();              // ← TODO: 你把“UI→状态”的逻辑粘到这里
  const saved = setStyleState(next);
  applyStyleState(saved, _opts);
}

/** 点击“清空并应用” */
function onResetFromPanel() {
  const empty = { version: 1, boundTypes: {}, rules: {} };
  const saved = setStyleState(empty);
  applyStyleState(saved, _opts);
  injectStateIntoPanel(saved);                       // ← TODO: 把空状态写回 UI
}

/** ========= 下面两个函数是你粘贴原逻辑的落脚点 ========= */

/** TODO: 把“把 UI 各字段读出来 -> 组装为 {boundTypes, rules}” 的原函数体复制到这里 */
function extractStateFromPanel() {
  // 占位：当前先返回已保存的状态，保证不报错
  // 请把你原来的收集逻辑粘贴进来，最后 return 出组合好的 state：
  // { version: 1, boundTypes: {...}, rules: {...} }
  return getStyleState();
}

/** TODO: 把“把 state 写回 UI 控件”的原函数体复制到这里（用于回显/加载） */
function injectStateIntoPanel(state) {
  // 占位：如果你已经有渲染面板的逻辑，请把它粘贴到这里
  // 示例：根据 state.boundTypes[attr] 选中样式类型；根据 state.rules[attr][value] 填颜色/粗细等
}

/** ========= 兜底：没有 #style-window 时的临时 JSON 面板 ========= */

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
      <p style="margin:6px 0;color:#555">你的页面没有 #style-window，先用 JSON 面板验证“保存→生效”。</p>
      <textarea id="sp-json" style="width:100%;height:260px;white-space:pre; font-family:ui-monospace,Consolas,monospace;"></textarea>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button id="sp-apply">保存并应用</button>
        <button id="sp-reset">清空并应用</button>
      </div>
    `;
    document.body.appendChild(host);

    host.querySelector('#sp-close').onclick = () => host.remove();
    host.querySelector('#sp-reset').onclick = () => {
      const empty = { version: 1, boundTypes: {}, rules: {} };
      const saved = setStyleState(empty);
      applyStyleState(saved, _opts);
      host.querySelector('#sp-json').value = JSON.stringify(saved, null, 2);
    };
    host.querySelector('#sp-apply').onclick = () => {
      try {
        const val = host.querySelector('#sp-json').value;
        const next = JSON.parse(val);
        const saved = setStyleState(next);
        applyStyleState(saved, _opts);
      } catch (e) {
        alert('JSON 解析失败：' + e.message);
      }
    };
  }
  host.querySelector('#sp-json').value = JSON.stringify(getStyleState(), null, 2);
}

