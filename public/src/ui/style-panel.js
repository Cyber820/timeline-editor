// src/ui/style-panel.js
import { getStyleState, setStyleState } from '../state/styleState.js';
import { applyStyleState } from '../style/engine.js';
import { genId } from '../utils/id.js';
import { uiTypeToInternal } from '../_staging/constants.js';

// —— 模块内状态（面板内部用，不再挂 window）——
let _mounted = false;
let _opts = { selectorBase: '.vis-item.event', titleSelector: '.event-title' };

// 你原来的内存结构先放这里（后续把原逻辑迁进来）
let currentStyleAttr = null;
const boundStyleType = {};        // { [attrKey]: 'fontColor' | 'borderColor' | 'fontFamily' | 'none' }
let stagedType = 'none';
const styleTypeOwner = {};
const styleRules = {};            // { [attrKey]: Array<{ id, type, style: {}, values: string[] }> }
const styleRowSelections = {};    // { [rowId]: string[] }

// ====== 对外导出（给 app.js 动态 import 调用） ======
export function openStylePanel(opts = {}) {
  _opts = { ..._opts, ...opts };
  const root = document.getElementById('style-window');

  if (root) {
    mountHandlersOnce(root);
    injectStateIntoPanel(getStyleState()); // ← 回填已保存状态到 UI
    root.style.display = '';               // 显示面板
    return;
  }

  // 如果页面暂时没有 #style-window，就用兜底 JSON 面板先验证链路
  openFallbackJsonPanel();
}

export function closeStylePanel() {
  const root = document.getElementById('style-window');
  if (root) root.style.display = 'none';
}

// ====== 事件绑定（把你原先的按钮监听迁过来）======
function mountHandlersOnce(root) {
  if (_mounted) return; _mounted = true;

  // 按你的真实按钮 id 调整这几行
  const btnSave   = root.querySelector('#style-save')   || document.getElementById('style-save');
  const btnReset  = root.querySelector('#style-reset')  || document.getElementById('style-reset');
  const btnClose  = root.querySelector('#style-close')  || document.getElementById('style-close');

  btnSave  && btnSave.addEventListener('click', onSaveFromPanel);
  btnReset && btnReset.addEventListener('click', onResetFromPanel);
  btnClose && btnClose.addEventListener('click', () => closeStylePanel());

  // 如果有“确认绑定/重置绑定/打开属性选择器”等按钮，也在这里绑定
  // 例如：root.querySelector('#style-confirm-btn')?.addEventListener('click', onConfirmBind);
  //       root.querySelector('#add-style-btn')?.addEventListener('click', addStyleRow);
  //       root.querySelector('#attr-picker-confirm')?.addEventListener('click', confirmAttrPicker);
  //       root.querySelector('#attr-picker-cancel') ?.addEventListener('click', closeAttrPicker);
  //       root.querySelector('#attr-picker-select-all')?.addEventListener('click', selectAllInAttrPicker);
  //       root.querySelector('#attr-picker-clear')     ?.addEventListener('click', clearAttrPicker);
}

// ====== 保存/重置：把面板内存 ↔ 引擎状态 对接 ======
function onSaveFromPanel() {
  const next = extractStateFromPanel();         // ← 用你面板里的内存拼出 {boundTypes, rules}
  const saved = setStyleState(next);
  applyStyleState(saved, _opts);                // 立即生效（编译 CSS + 注入）
}

function onResetFromPanel() {
  const empty = { version: 1, boundTypes: {}, rules: {} };
  const saved = setStyleState(empty);
  applyStyleState(saved, _opts);
  injectStateIntoPanel(saved);                  // 面板 UI 回显为空
}

// ====== 你把原“UI→状态 / 状态→UI”的逻辑粘到这两个函数 ======
function extractStateFromPanel() {
  // TODO：把你当前内存（boundStyleType/styleRules 等）转换为统一状态
  // 下面给一份常用映射示例，可直接用或按需改：
  const toEngineKey = (t) => ({
    font: 'fontFamily',
    fontFamily: 'fontFamily',
    fontColor: 'textColor',
    backgroundColor: 'bgColor',
    borderColor: 'borderColor',
    lineColor: 'borderColor',
    none: 'none'
  }[t] || t);

  const boundTypes = {};
  for (const [attr, t] of Object.entries(boundStyleType)) boundTypes[attr] = toEngineKey(t || 'none');

  const rules = {};
  for (const [attr, rows] of Object.entries(styleRules)) {
    if (!rows?.length) continue;
    const k = boundTypes[attr];
    if (!k || k === 'none') continue;

    for (const row of rows) {
      const type = toEngineKey(row.type);
      const valList = Array.isArray(row.values) ? row.values : [];
      valList.forEach((val) => {
        if (!val) return;
        rules[attr] ||= {}; rules[attr][val] ||= {};
        const st = row.style || {};
        if (type === 'textColor')   rules[attr][val].textColor   = st.fontColor || st.textColor || '#000000';
        if (type === 'bgColor')     rules[attr][val].bgColor     = st.backgroundColor || st.bgColor;
        if (type === 'borderColor') rules[attr][val].borderColor = st.borderColor || st.lineColor;
        if (type === 'fontFamily')  rules[attr][val].fontFamily  = st.fontFamily;
      });
    }
  }

  return { version: 1, boundTypes, rules };
}

function injectStateIntoPanel(state) {
  // TODO：把 {boundTypes, rules} 写回你的 UI，并重建表格
  // 先清空内存
  for (const k of Object.keys(boundStyleType)) delete boundStyleType[k];
  for (const k of Object.keys(styleRules)) delete styleRules[k];

  const fromEngineKey = (t) => ({
    textColor: 'fontColor',
    bgColor: 'backgroundColor',
    borderColor: 'borderColor',
    fontFamily: 'fontFamily',
    none: 'none'
  }[t] || t);

  // 1) 回写绑定类型
  for (const [attr, t] of Object.entries(state?.boundTypes || {})) {
    boundStyleType[attr] = fromEngineKey(t || 'none');
  }

  // 2) 根据 rules 生成行并渲染
  const rules = state?.rules || {};
  for (const [attr, valMap] of Object.entries(rules)) {
    const bucket = ensureBucket(attr);
    const typeUI = boundStyleType[attr] || 'none';
    if (typeUI === 'none') continue;

    // 合并相同样式值的属性项
    const groups = new Map(); // key -> { style, values:[] }
    for (const [val, conf] of Object.entries(valMap || {})) {
      const st = {};
      if (typeUI === 'fontColor' && conf.textColor)      st.fontColor      = conf.textColor;
      if (typeUI === 'backgroundColor' && conf.bgColor)  st.backgroundColor = conf.bgColor;
      if (typeUI === 'borderColor' && conf.borderColor)  st.borderColor     = conf.borderColor;
      if (typeUI === 'fontFamily' && conf.fontFamily)    st.fontFamily      = conf.fontFamily;

      const key = JSON.stringify(st);
      if (!groups.has(key)) groups.set(key, { style: st, values: [] });
      groups.get(key).values.push(val);
    }

    for (const { style, values } of groups.values()) {
      bucket.push({ id: genId(), type: typeUI, style, values });
    }
  }

  // 如果你有当前激活的属性（currentStyleAttr），可以重绘表格
  if (currentStyleAttr) renderStyleTable(currentStyleAttr);
}

// ====== 下面是你面板用到的工具 & 渲染函数骨架（把原函数搬进来即可） ======

export function ensureBucket(attrKey) {
  if (!stateMem.styleRules[attrKey]) stateMem.styleRules[attrKey] = [];
  return stateMem.styleRules[attrKey];
}
export function findRule(attrKey, rowId) {
  const bucket = stateMem.styleRules[attrKey] || [];
  return bucket.find(r => r.id === rowId) || null;
}


function renderStyleTable(attrKey) {
  const tbody = document.getElementById('styleTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  (styleRules[attrKey] || []).forEach(rule => renderRuleRow(attrKey, rule));
}

function renderRuleRow(attrKey, rule) {
  // ← 把你原来的 renderRuleRow 全部搬进来
  // 注意：不要再挂 window，保持模块内私有
}

function buildStyleControl(type) {
  // ← 把你原来的 buildStyleControl 函数体搬进来
}

function renderRowAttrChips(rowId, values) {
  // ← 把你原来的 renderRowAttrChips 函数体搬进来
}

function openAttrPicker(rowId, attrKey) {
  // ← 搬原来的 openAttrPicker
}
function confirmAttrPicker() {
  // ← 搬原来的 confirmAttrPicker
}
function closeAttrPicker() {
  // ← 搬原来的 closeAttrPicker
}
function selectAllInAttrPicker() {
  // ← 搬原来的 selectAllInAttrPicker
}
function clearAttrPicker() {
  // ← 搬原来的 clearAttrPicker
}

// （如需）其它工具
function readRowStyleKey(rowEl){/* 可按需搬 */} 
function isSameSet(a=[],b=[]){ if(a.length!==b.length) return false; const sa=new Set(a),sb=new Set(b); for(const v of sa) if(!sb.has(v)) return false; return true; }
function getTakenValues(attrKey, exceptRowId){
  const taken = new Set();
  const rows = document.querySelectorAll(`#styleTableBody tr[data-attr-key="${attrKey}"]`);
  rows.forEach(tr => {
    const rid = tr.dataset.rowId;
    if (rid === exceptRowId) return;
    const vals = styleRowSelections?.[rid] || [];
    vals.forEach(v => { if (v) taken.add(String(v)); });
  });
  return taken;
}

// ====== 兜底 JSON 面板（当没有 #style-window 时临时使用） ======
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
      } catch (e) { alert('JSON 解析失败：' + e.message); }
    };
  }
  host.querySelector('#sp-json').value = JSON.stringify(getStyleState(), null, 2);
}




