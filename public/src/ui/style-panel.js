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

function genId() {
  return (crypto.randomUUID?.() || ('r_' + Date.now() + '_' + Math.random().toString(36).slice(2)));
}

// 取桶
function ensureBucket(attrKey) {
  if (!styleRules[attrKey]) styleRules[attrKey] = [];
  return styleRules[attrKey];
}

// 根据 id 找规则
function findRule(attrKey, rowId) {
  const bucket = styleRules[attrKey] || [];
  return bucket.find(r => r.id === rowId) || null;
}
  // UI 下拉的值 -> 内部键：'font' => 'fontFamily'
function uiTypeToInternal(t) { return (t === 'font') ? 'fontFamily' : t; }
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
function readRowStyleKey(rowEl) {
  const type = rowEl.querySelector('td:first-child')?.dataset?.styleType || ''; // 'fontFamily'/'fontColor'...
  let value = '';
  const td = rowEl.querySelector('td:first-child');
  if (!td) return `${type}|`;

  // 字体：select
  const sel = td.querySelector('select');
  if (sel) value = sel.value || '';

  // 颜色：input[type=color]
  const color = td.querySelector('input[type="color"]');
  if (color) value = color.value || value;

  return `${type}|${value}`;
}

// 集合相等：用于判断“同样式值 + 同一组属性值”是否重复
function isSameSet(a = [], b = []) {
  if (a.length !== b.length) return false;
  const sa = new Set(a), sb = new Set(b);
  for (const v of sa) if (!sb.has(v)) return false;
  return true;
}

// 统计同一属性(attrKey)下，除某行外已被占用的属性值（跨行去重）
function getTakenValues(attrKey, exceptRowId) {
  const taken = new Set();

  // 找到同一属性类别（如 'EventType'）下的所有样式行
  const rows = document.querySelectorAll(
    `#styleTableBody tr[data-attr-key="${attrKey}"]`
  );

  rows.forEach(tr => {
    const rid = tr.dataset.rowId;
    if (rid === exceptRowId) return;              // 跳过当前正在编辑的行

    // 关键：从全局行选择表里取出该行已选择的属性值数组
    const vals = (window.styleRowSelections?.[rid]) || [];

    // 累加到已占用集合
    vals.forEach(v => {
      if (v != null && v !== '') taken.add(String(v));
    });
  });

  return taken;
}
function openStyleWindow(attr) {
  currentStyleAttr = attr;
  document.getElementById('style-title').textContent =
    (attributeLabels[attr] || attr) + ' 样式';
  document.getElementById('style-window').style.display = 'block';

  const typeSel   = document.getElementById('style-type');
  const tbody     = document.getElementById('styleTableBody');
  const confirm   = document.getElementById('style-confirm-btn');
  const resetBtn  = document.getElementById('style-reset-btn');
  const addBtn    = document.getElementById('add-style-btn');
  const hint      = document.getElementById('bound-type-hint');

  typeSel.value = 'none';
  stagedType = 'none';

  tbody.innerHTML = '';

  const bound = boundStyleType[attr] || 'none';
  if (bound !== 'none') {
    if (hint)      hint.textContent = '当前样式：' + (typeof styleLabel === 'function' ? styleLabel(bound) : bound);
    if (confirm) { confirm.disabled = true; confirm.style.display = 'none'; }
    if (resetBtn)  resetBtn.style.display = 'inline-block';
    if (addBtn)    addBtn.disabled = false;
  } else {
    if (hint)      hint.textContent = '当前样式：无';
    if (confirm) { confirm.disabled = true; confirm.style.display = 'inline-block'; }
    if (resetBtn)  resetBtn.style.display = 'none';
    if (addBtn)    addBtn.disabled = true;
  }

  // ✅ 用内存里的规则重建表格
  renderStyleTable(attr);
}



  function onStyleTypeChange() {
  const typeSel = document.getElementById('style-type');
  const confirm = document.getElementById('style-confirm-btn');
  const hint    = document.getElementById('bound-type-hint');

  const mapped = uiTypeToInternal(typeSel.value); // 'font' -> 'fontFamily'
  stagedType = mapped;

  // 该属性已绑定某类型 -> 不允许在未重置前切换
  const already = (boundStyleType[currentStyleAttr] && boundStyleType[currentStyleAttr] !== 'none');
  if (already) {
    typeSel.value = 'none';
    stagedType = 'none';
    if (hint)    hint.textContent = '当前绑定：' + (typeof styleLabel === 'function' ? styleLabel(boundStyleType[currentStyleAttr]) : boundStyleType[currentStyleAttr]) + '（如需更改，请先“重置”）';
    if (confirm) confirm.disabled = true;
    return;
  }

  // ✅ 全局唯一：该样式类型是否已被其它属性占用
  if (mapped !== 'none') {
    const owner = styleTypeOwner[mapped];
    if (owner && owner !== currentStyleAttr) {
      alert(`“${(typeof styleLabel === 'function' ? styleLabel(mapped) : mapped)}” 已绑定到【${attributeLabels[owner] || owner}】。\n如需转移，请先到该属性中点击“重置”。`);
      typeSel.value = 'none';
      stagedType    = 'none';
      if (confirm) confirm.disabled = true;
      // 反映占用状态
      refreshStyleTypeOptions();
      return;
    }
  }

  if (confirm) confirm.disabled = (stagedType === 'none');
}


 function onConfirmBind() {
  if (stagedType === 'none') return;

  const tbody    = document.getElementById('styleTableBody');
  const confirm  = document.getElementById('style-confirm-btn');
  const resetBtn = document.getElementById('style-reset-btn');
  const addBtn   = document.getElementById('add-style-btn');
  const hint     = document.getElementById('bound-type-hint');

  // 再次确认全局唯一占用（防 race）
  const owner = styleTypeOwner[stagedType];
  if (owner && owner !== currentStyleAttr) {
    alert(`“${(typeof styleLabel === 'function' ? styleLabel(stagedType) : stagedType)}” 已绑定到【${attributeLabels[owner] || owner}】。\n如需转移，请先到该属性中点击“重置”。`);
    return;
  }

  const prev = boundStyleType[currentStyleAttr] || 'none';
  if (prev !== 'none' && prev !== stagedType) {
    const ok = window.confirm('切换样式类型将清空该属性下已添加的样式行，是否继续？');
    if (!ok) return;
    tbody.innerHTML = '';

    // 释放之前占用的类型
    if (styleTypeOwner[prev] === currentStyleAttr) {
      delete styleTypeOwner[prev];
    }
  }

  // 写入绑定与占用
  boundStyleType[currentStyleAttr] = stagedType;
  styleTypeOwner[stagedType] = currentStyleAttr;

  // UI 状态切换
  if (confirm)  { confirm.disabled = true; confirm.style.display = 'none'; }
  if (resetBtn)  resetBtn.style.display = 'inline-block';
  if (addBtn)    addBtn.disabled = false;
  if (hint)      hint.textContent = '当前样式：' + (typeof styleLabel === 'function' ? styleLabel(stagedType) : stagedType);

  // 更新下拉可用性（把该类型标记为“已被本属性占用”，其它属性会看到禁用）
  refreshStyleTypeOptions();

  // 自动新增一行（仅 UI）
  addStyleRow();
}


// 点击“重置”：清空该属性的绑定与行
function onResetBind() {
  const tbody    = document.getElementById('styleTableBody');
  const typeSel  = document.getElementById('style-type');
  const confirm  = document.getElementById('style-confirm-btn');
  const resetBtn = document.getElementById('style-reset-btn');
  const addBtn   = document.getElementById('add-style-btn');
  const hint     = document.getElementById('bound-type-hint');

  const hasRows = tbody.querySelectorAll('tr').length > 0;
  const ok = !hasRows || window.confirm('重置将清空该属性下所有样式行，是否继续？');
  if (!ok) return;

  // 释放占用者
  const prev = boundStyleType[currentStyleAttr] || 'none';
  if (prev !== 'none' && styleTypeOwner[prev] === currentStyleAttr) {
    delete styleTypeOwner[prev];
  }

  boundStyleType[currentStyleAttr] = 'none';
  tbody.innerHTML = '';
  typeSel.value = 'none';
  stagedType = 'none';

  if (confirm)  { confirm.disabled = true; confirm.style.display = 'inline-block'; }
  if (resetBtn)  resetBtn.style.display = 'none';
  if (addBtn)    addBtn.disabled = true;
  if (hint)      hint.textContent = '当前样式：无';

  // 让其它属性重新可选该类型
  refreshStyleTypeOptions();
}


// 仅更新临时选择；未确认前不写入绑定
function closeStyleWindow() {
  document.getElementById('style-window').style.display = 'none';
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
function renderStyleTable(attrKey) {
  const tbody = document.getElementById('styleTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const rules = styleRules[attrKey] || [];
  rules.forEach(rule => renderRuleRow(attrKey, rule));
}

// 渲染单行（可复用：新增/修改后都可以只重绘本行）
function renderRuleRow(attrKey, rule) {
  const tbody = document.getElementById('styleTableBody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.dataset.rowId  = rule.id;
  tr.dataset.attrKey = attrKey;

  // —— 左：样式控件
  const tdContent = document.createElement('td');
  tdContent.dataset.styleType = rule.type;
  const ctrl = buildStyleControl(rule.type); // 你已有的构造 UI
  tdContent.appendChild(ctrl);
  tr.appendChild(tdContent);

  // 初始化控件的“当前值” + 监听修改写回内存
  if (rule.type === 'fontFamily') {
    const sel = tdContent.querySelector('select');
    if (sel) {
      sel.value = rule.style.fontFamily || '';
      sel.addEventListener('change', () => {
        rule.style.fontFamily = sel.value || '';
      });
    }
  } else if (
    rule.type === 'fontColor' ||
    rule.type === 'borderColor' ||
    rule.type === 'backgroundColor' ||
    rule.type === 'lineColor'
  ) {
    const color = tdContent.querySelector('input[type="color"]');
    const hex   = tdContent.querySelector('input[type="text"]');

    const current = rule.style[rule.type] || '#000000';
    if (color) color.value = current;
    if (hex)   hex.value   = current;

    // 同步两边并写回
    if (color && hex) {
      color.addEventListener('input', () => {
        hex.value = color.value.toUpperCase();
        rule.style[rule.type] = color.value.toUpperCase();
      });
      hex.addEventListener('change', () => {
        // 已在 buildStyleControl 里做过规范化，这里只写回
        rule.style[rule.type] = hex.value.toUpperCase();
        if (color.value.toUpperCase() !== hex.value.toUpperCase()) {
          color.value = hex.value;
        }
      });
    }
  }

  // —— 中：已选标签 + “添加/修改属性”
  const tdAttr = document.createElement('td');

  const chips = document.createElement('div');
  chips.className = 'attr-chips';
  chips.style.minHeight = '28px';
  tdAttr.appendChild(chips);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.textContent = '添加/修改属性';
  editBtn.style.marginLeft = '8px';
  editBtn.addEventListener('click', () => {
    openAttrPicker(rule.id, attrKey);
  });
  tdAttr.appendChild(editBtn);

  tr.appendChild(tdAttr);

  // 首次渲染标签
  renderRowAttrChips(rule.id, rule.values || []);

  // —— 右：删除该行
  const tdAction = document.createElement('td');
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.textContent = '×';
  delBtn.title = '删除该样式行';
  delBtn.addEventListener('click', () => {
    const bucket = styleRules[attrKey] || [];
    const idx = bucket.findIndex(r => r.id === rule.id);
    if (idx >= 0) bucket.splice(idx, 1);
    tr.remove();
  });
  tdAction.appendChild(delBtn);
  tr.appendChild(tdAction);

  tbody.appendChild(tr);
}
function renderRowAttrChips(rowId, values) {
  const tr  = document.querySelector(`#styleTableBody tr[data-row-id="${rowId}"]`);
  if (!tr) return;
  const box = tr.querySelector('.attr-chips');
  if (!box) return;

  const list = Array.isArray(values) ? values : [];
  box.innerHTML = '';

  if (list.length === 0) {
    box.innerHTML = '<span style="color:#999;">（未选择）</span>';
    return;
  }

  list.forEach(v => {
    const tag = document.createElement('span');
    tag.textContent = v;
    tag.style.cssText = 'display:inline-block;padding:2px 6px;margin:2px;border:1px solid #ccc;border-radius:10px;font-size:12px;';
    box.appendChild(tag);
  });
}


// 绑定弹窗按钮
document.getElementById('attr-picker-confirm')?.addEventListener('click', confirmAttrPicker);
document.getElementById('attr-picker-cancel') ?.addEventListener('click', closeAttrPicker);

  // 根据类型构造控件（这里只造 UI，暂不写任何样式）
function buildStyleControl(type) {
  const wrap = document.createElement('div');

  if (type === 'fontFamily') {
    const fontSel = document.createElement('select');
    fontSel.innerHTML = `
      <option value="">请选择字体</option>
      <option value="STCaiyun">华文彩云 (STCaiyun)</option>
      <option value="FZShuTi">方正舒体 (FZShuTi)</option>
      <option value="FZYaoti">方正姚体 (FZYaoti)</option>
      <option value='"Microsoft YaHei"'>微软雅黑 (Microsoft YaHei)</option>
      <option value="DengXian">等线 (DengXian)</option>
      <!-- 已按你的计划替换：隶书 / 幼圆 -->
      <option value="LiSu">隶书 (LiSu)</option>
      <option value="YouYuan">幼圆 (YouYuan)</option>
      <option value="SimSun">宋体 (SimSun)</option>
      <option value="SimHei">黑体 (SimHei)</option>
      <option value="KaiTi">楷体 (KaiTi)</option>
    `;
    wrap.appendChild(fontSel);
    return wrap;
  }

  // 颜色相关：提供 取色器 + HEX 文本框 + 预设色块（仅交互，不应用）
  if (type === 'fontColor' || type === 'borderColor' || type === 'backgroundColor' || type === 'lineColor') {
    wrap.className = 'color-ui';

    // 1) 原生取色器
    const color = document.createElement('input');
    color.type = 'color';
    color.value = '#000000';

    // 2) HEX 输入
    const hex = document.createElement('input');
    hex.type = 'text';
    hex.placeholder = '#RRGGBB';
    hex.value = color.value.toUpperCase();

    // 同步：取色器 -> HEX
    color.addEventListener('input', () => {
      hex.value = color.value.toUpperCase();
    });

function buildAttrMultiSelect(attrKey) {
  const sel = document.createElement('select');
  sel.multiple = true;
  sel.className = 'style-attr-select'; // 可选：便于加样式

  // 用过滤系统的取值逻辑复用现有候选
  const opts = (typeof getFilterOptionsForKey === 'function')
    ? getFilterOptionsForKey(attrKey)
    : (allOptions?.[attrKey] || []);

  if (!opts || opts.length === 0) {
    const o = new Option('（暂无可选项 / 仍在加载）', '');
    o.disabled = true;
    sel.appendChild(o);
  } else {
    opts.forEach(v => sel.appendChild(new Option(v, v)));
  }

  // 可选：如果已引入 Choices.js，让多选更好用
  if (window.Choices) {
    sel._choices = new Choices(sel, {
      removeItemButton: true,
      shouldSort: false,
      searchPlaceholderValue: '搜索…',
      position: 'bottom'
    });
  }
  return sel;
}

// 新增一行（整合第②步颜色 UI + 第③步属性值多选；仅 UI，不应用样式）
function addStyleRow() {
  const bound = boundStyleType[currentStyleAttr];
  if (!bound || bound === 'none') {
    alert('请先选择样式类型并“确认绑定”。');
    return;
  }

  const bucket = ensureBucket(currentStyleAttr);
  const rule = {
    id: genId(),
    type: bound,            // 'fontFamily' | 'fontColor' | ...
    style: {},              // 样式值（字体名 / 颜色 HEX）
    values: []              // 应用到的“属性值”集合（多选）
  };

  // 给新行一个合理的默认值，便于直观可见
  if (bound === 'fontFamily') {
    rule.style.fontFamily = ''; // 让用户自己选
  } else {
    rule.style[bound] = '#000000'; // 颜色默认黑
  }

  bucket.push(rule);
  renderRuleRow(currentStyleAttr, rule);
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







