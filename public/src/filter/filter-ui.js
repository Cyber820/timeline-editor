// public/src/filter/filter-ui.js
// 面板：主按钮 + 子面板（新增过滤规则）
// 事件：
// - 'filter:add-rule'                → 打开新增规则子面板
// - 'filter:add-rule:confirm'        → { key, values } 确认新增/更新规则
// - 'filter:reset' / 'filter:set-logic' / 'filter:close-ui' 同之前
//
// 依赖（可选）：无须第三方，多选与检索为原生实现
import { getOptionKeys, getOptionsForKey } from './filter-engine.js';

export function initFilterUI({
  beforeElSelector = '#timeline',
  getItems = () => [],
  getCurrentRules = () => [],
} = {}) {
  ensureStylesInjected();

  const timelineEl = document.querySelector(beforeElSelector);
  if (!timelineEl) {
    console.warn('[filter-ui] 未找到插入参考元素：', beforeElSelector);
    return;
  }

  // 工具条容器
  let toolbar = document.querySelector('#timeline-toolbar');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = 'timeline-toolbar';
    toolbar.className = 'tl-toolbar';
    timelineEl.parentNode.insertBefore(toolbar, timelineEl);
  }

  // 触发按钮
  if (!toolbar.querySelector('.tl-filter-trigger')) {
    const triggerBtn = document.createElement('button');
    triggerBtn.type = 'button';
    triggerBtn.className = 'tl-filter-trigger';
    triggerBtn.textContent = '过滤/筛选';
    triggerBtn.setAttribute('aria-haspopup', 'dialog');
    triggerBtn.addEventListener('click', togglePanel);
    toolbar.appendChild(triggerBtn);
  }

  // 主面板
  function ensurePanel() {
    let panel = document.querySelector('#tl-filter-panel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'tl-filter-panel';
    panel.className = 'tl-filter-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', '过滤/筛选设置');
    panel.innerHTML = `
      <div class="tl-filter-panel__row">
        <button type="button" class="tl-btn" data-action="add">增加过滤/筛选标准</button>
        <button type="button" class="tl-btn" data-action="reset">复原过滤/筛选标准</button>
      </div>
      <div class="tl-filter-panel__row">
        <button type="button" class="tl-btn" data-action="and">用和逻辑过滤/筛选</button>
        <button type="button" class="tl-btn" data-action="or">用或逻辑过滤/筛选</button>
      </div>

      <!-- 子面板：新增规则 -->
      <div class="tl-filter-builder" id="tl-filter-builder" hidden>
        <div class="tl-filter-builder__row">
          <label class="tl-label">过滤属性</label>
          <select id="tl-attr-select" class="tl-input"></select>
        </div>
        <div class="tl-filter-builder__row">
          <label class="tl-label">过滤选项</label>
          <div class="tl-multi">
            <input id="tl-search" type="text" class="tl-input" placeholder="输入关键字检索" />
            <div id="tl-options" class="tl-options"></div>
          </div>
        </div>
        <div class="tl-filter-builder__row tl-filter-builder__row--end">
          <button type="button" class="tl-btn" data-action="confirm">确定</button>
          <button type="button" class="tl-btn tl-btn--ghost" data-action="cancel">取消</button>
        </div>
      </div>

      <div class="tl-filter-panel__row tl-filter-panel__row--end">
        <button type="button" class="tl-btn tl-btn--ghost" data-action="close">关闭窗口</button>
      </div>
    `;
    document.body.appendChild(panel);

    // 事件委托（主按钮们）
    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      if (action === 'add') {
        openBuilder();
      } else if (action === 'reset') {
        hideBuilder();
        window.dispatchEvent(new CustomEvent('filter:reset'));
      } else if (action === 'and') {
        window.dispatchEvent(new CustomEvent('filter:set-logic', { detail: { mode: 'AND' } }));
      } else if (action === 'or') {
        window.dispatchEvent(new CustomEvent('filter:set-logic', { detail: { mode: 'OR' } }));
      } else if (action === 'confirm') {
        const { key, values } = readBuilder();
        if (key && values.length) {
          window.dispatchEvent(new CustomEvent('filter:add-rule:confirm', { detail: { key, values } }));
          hideBuilder(); // 保留面板，关闭子面板
        }
      } else if (action === 'cancel') {
        hideBuilder();
      } else if (action === 'close') {
        hidePanel();
        window.dispatchEvent(new CustomEvent('filter:close-ui'));
      }
    });

    // 点击面板外区域关闭
    document.addEventListener('click', (evt) => {
      if (!panel.classList.contains('is-open')) return;
      const trigger = document.querySelector('.tl-filter-trigger');
      if (panel.contains(evt.target)) return;
      if (trigger && trigger.contains(evt.target)) return;
      hidePanel();
    });

    // 监听外部“打开新增规则”
    window.addEventListener('filter:add-rule', () => openBuilder());

    // 搜索
    panel.querySelector('#tl-search').addEventListener('input', () => {
      refreshOptions();
    });

    // 属性切换
    panel.querySelector('#tl-attr-select').addEventListener('change', () => {
      refreshOptions(true);
      restoreCheckedFromExistingRule(); // 同属性时回显已选
    });

    return panel;
  }

  function togglePanel() {
    const panel = ensurePanel();
    panel.classList.toggle('is-open');
    if (panel.classList.contains('is-open')) {
      positionPanel();
      // 每次打开时，同步一下 builder 的可选属性与回显
      prepareAttrOptions();
    }
  }

  function hidePanel() {
    const panel = document.querySelector('#tl-filter-panel');
    if (panel) panel.classList.remove('is-open');
  }

  function positionPanel() {
    const trigger = document.querySelector('.tl-filter-trigger');
    const panel = document.querySelector('#tl-filter-panel');
    if (!trigger || !panel) return;
    const rect = trigger.getBoundingClientRect();
    panel.style.top = `${rect.bottom + window.scrollY + 6}px`;
    panel.style.left = `${rect.left + window.scrollX}px`;
  }

  function openBuilder() {
    const panel = ensurePanel();
    prepareAttrOptions();
    restoreCheckedFromExistingRule();
    panel.querySelector('#tl-filter-builder').hidden = false;
  }
  function hideBuilder() {
    const panel = ensurePanel();
    panel.querySelector('#tl-filter-builder').hidden = true;
  }

  function prepareAttrOptions() {
    const sel = ensurePanel().querySelector('#tl-attr-select');
    const keys = getOptionKeys();
    const current = sel.value;
    sel.innerHTML = keys.map(k => `<option value="${k}">${k}</option>`).join('');
    if (keys.includes(current)) sel.value = current;

    // 初次/无当前值→默认第一个
    if (!sel.value && keys.length) sel.value = keys[0];
    refreshOptions(true);
  }

  function restoreCheckedFromExistingRule() {
    const rules = getCurrentRules() || [];
    const key = ensurePanel().querySelector('#tl-attr-select').value;
    const exists = rules.find(r => r.key === key);
    if (!exists) return;
    // 勾选现有 values
    const boxWrap = ensurePanel().querySelector('#tl-options');
    const checks = boxWrap.querySelectorAll('input[type="checkbox"][data-val]');
    const set = new Set((exists.values || []).map(v => String(v)));
    checks.forEach(ch => {
      const v = ch.getAttribute('data-val');
      ch.checked = set.has(v);
    });
  }

  function readBuilder() {
    const panel = ensurePanel();
    const key = panel.querySelector('#tl-attr-select').value;
    const nodeList = panel.querySelectorAll('#tl-options input[type="checkbox"]:checked');
    const values = Array.from(nodeList).map(ch => ch.getAttribute('data-val'));
    return { key, values };
  }

  function refreshOptions(resetScroll = false) {
    const panel = ensurePanel();
    const key = panel.querySelector('#tl-attr-select').value;
    const search = panel.querySelector('#tl-search').value.trim().toLowerCase();
    const items = getItems() || [];
    const options = getOptionsForKey(items, key);

    const box = panel.querySelector('#tl-options');
    box.innerHTML = '';
    const frag = document.createDocumentFragment();

    // 生成复选项
    options
      .filter(o => !search || String(o).toLowerCase().includes(search))
      .forEach(val => {
        const id = `opt-${key}-${btoa(unescape(encodeURIComponent(String(val)))).replace(/=/g,'')}`;
        const wrap = document.createElement('label');
        wrap.className = 'tl-opt';
        wrap.innerHTML = `
          <input type="checkbox" data-val="${val}" id="${id}" />
          <span>${val}</span>
        `;
        frag.appendChild(wrap);
      });

    box.appendChild(frag);
    if (resetScroll) box.scrollTop = 0;
  }
}

function ensureStylesInjected() {
  if (document.getElementById('tl-filter-styles')) return;
  const style = document.createElement('style');
  style.id = 'tl-filter-styles';
  style.textContent = `
    .tl-toolbar {
      display: flex; align-items: center; justify-content: flex-start;
      gap: 8px; margin: 8px 0 12px;
    }
    .tl-filter-trigger, .tl-btn {
      padding: 6px 12px; border-radius: 8px; border: 1px solid #ddd;
      background: #fff; cursor: pointer; font-size: 14px; line-height: 1.2;
    }
    .tl-filter-trigger:hover, .tl-btn:hover { background: #f7f7f7; }
    .tl-btn--ghost { background: transparent; }

    .tl-filter-panel {
      position: absolute; top: 48px; left: 0; min-width: 320px; max-width: 92vw;
      background: #fff; border: 1px solid #e5e5e5; border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12); padding: 12px; display: none; z-index: 9999;
    }
    .tl-filter-panel.is-open { display: block; }
    .tl-filter-panel__row { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
    .tl-filter-panel__row--end { justify-content: flex-end; margin-bottom: 0; }

    /* builder */
    .tl-filter-builder { border-top: 1px dashed #e5e7eb; padding-top: 10px; margin-top: 6px; }
    .tl-filter-builder__row { display: flex; gap: 10px; align-items: center; margin: 8px 0; }
    .tl-label { min-width: 72px; font-size: 13px; color: #374151; }
    .tl-input { border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 8px; font-size: 13px; }
    .tl-multi { display: flex; flex-direction: column; gap: 6px; width: 100%; max-width: 460px; }
    .tl-options { border: 1px solid #e5e7eb; border-radius: 8px; max-height: 220px; overflow: auto; padding: 6px; display: grid; gap: 4px; grid-template-columns: 1fr 1fr; }
    .tl-opt { display: flex; gap: 6px; align-items: center; font-size: 13px; }
  `;
  document.head.appendChild(style);
}
