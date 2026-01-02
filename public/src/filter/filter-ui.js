// public/src/filter/filter-ui.js
// =============================================================================
// Filter UI (Panel + Builder + Summary)
// =============================================================================
// 面板：主按钮 + 子面板（新增过滤规则）+ 已选规则清单
//
// 事件（向外发出）：
// - 'filter:add-rule'                 → 打开新增规则子面板
// - 'filter:add-rule:confirm'         → { key, values } 仅更新规则，不立刻应用
// - 'filter:remove-rule'              → { key } 清空该属性已选项（仅更新规则）
// - 'filter:reset'                    → 清空所有规则（仅更新规则）
// - 'filter:set-logic'                → { mode: 'AND'|'OR' } 仅更新逻辑（仅更新规则）
// - 'filter:close-ui'                 → 主面板被关闭（可选）
//
// 依赖：
// - filter-engine.js：字段列表 getOptionKeys + 候选项 getOptionsForKey
// - ui-text/index.js：所有 UI 文案从 t('filter....') 获取
//
// 重要约定：
// - 过滤按钮必须提供稳定锚点：data-role="filter-toggle"（供 mount.js 插入样式按钮）
// =============================================================================

import { getOptionKeys, getOptionsForKey } from './filter-engine.js';
import { t } from '../ui-text/index.js';

/**
 * 防止 initFilterUI 被重复调用导致事件重复绑定：
 * - 使用 WeakMap 以 anchor element 为 key 做一次性初始化
 * - 典型情况：页面热更新、mountTimeline 重入、或多个入口误调用
 */
const _initedByAnchor = new WeakMap();

/**
 * initFilterUI({ beforeElSelector, getItems, getCurrentRules })
 * - beforeElSelector：用于找到 timeline 的 anchor（默认 '#timeline'）
 * - getItems()：返回所有 items（未过滤的原始数据）
 * - getCurrentRules()：返回当前规则列表（来自 filter-state.js）
 */
export function initFilterUI({
  beforeElSelector = '#timeline',
  getItems = () => [],
  getCurrentRules = () => [],
} = {}) {
  ensureStylesInjected();

  const timelineEl = document.querySelector(beforeElSelector);
  if (!timelineEl) {
    console.warn('[filter-ui] Missing anchor element:', beforeElSelector);
    return;
  }

  // guard：同一个 timelineEl 只初始化一次，避免重复绑定
  if (_initedByAnchor.get(timelineEl)) {
    return;
  }
  _initedByAnchor.set(timelineEl, true);

  // -----------------------------
  // 1) 工具条容器（放在 timeline 之前）
  // -----------------------------
  let toolbar = document.querySelector('#timeline-toolbar');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = 'timeline-toolbar';
    toolbar.className = 'tl-toolbar';
    timelineEl.parentNode.insertBefore(toolbar, timelineEl);
  }

  // -----------------------------
  // 2) Filter 触发按钮（稳定锚点）
  // -----------------------------
  let triggerBtn = toolbar.querySelector('.tl-filter-trigger');
  if (!triggerBtn) {
    triggerBtn = document.createElement('button');
    triggerBtn.type = 'button';
    triggerBtn.className = 'tl-filter-trigger';
    triggerBtn.textContent = t('filter.trigger');
    triggerBtn.setAttribute('aria-haspopup', 'dialog');

    // ✅ 关键：跨语言稳定锚点（mount.js 会用这个选择器找过滤按钮）
    triggerBtn.setAttribute('data-role', 'filter-toggle');
    triggerBtn.setAttribute('data-te-filter-toggle', '1');

    toolbar.appendChild(triggerBtn);
  } else {
    // 语言切换/重复渲染时更新文案
    triggerBtn.textContent = t('filter.trigger');
  }

  // -----------------------------
  // 3) i18n：字段显示名
  // -----------------------------
  function keyToLabelI18n(k) {
    // ✅ 统一从 ui-text 取字段显示名（中英文各自维护）
    const v = t(`filter.fields.${k}`);
    return v && v !== `filter.fields.${k}` ? v : String(k);
  }

  // -----------------------------
  // 4) Panel/Builder 状态
  // -----------------------------
  let panel = null;
  let isOpen = false;

  // 为了避免多处 querySelector 重复查找，集中引用常用元素
  let elBuilder = null;
  let elAttrSelect = null;
  let elSearch = null;
  let elOptions = null;
  let elSummary = null;

  // 绑定在 document/window 的监听器引用，用于未来可选的 destroy()
  const disposers = [];

  // -----------------------------
  // 5) Panel 构建与事件绑定（一次性）
  // -----------------------------
  function ensurePanel() {
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'tl-filter-panel';
    panel.className = 'tl-filter-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', t('filter.panel.ariaLabel'));

    // 注意：panel 内部结构用 DOM API 拼装更安全，但这里模板本身是静态的 i18n 文案，
    // 且不含用户输入。为了便于阅读，此处仍使用 innerHTML。
    panel.innerHTML = `
      <div class="tl-filter-panel__row">
        <button type="button" class="tl-btn" data-action="add">${t('filter.panel.add')}</button>
        <button type="button" class="tl-btn" data-action="reset">${t('filter.panel.reset')}</button>
      </div>
      <div class="tl-filter-panel__row">
        <button type="button" class="tl-btn" data-action="and">${t('filter.panel.logicAnd')}</button>
        <button type="button" class="tl-btn" data-action="or">${t('filter.panel.logicOr')}</button>
      </div>

      <!-- ✅ 已选规则清单 -->
      <div id="tl-rule-summary" class="tl-rule-summary"></div>

      <!-- 子面板：新增规则 -->
      <div class="tl-filter-builder" id="tl-filter-builder" hidden>
        <div class="tl-filter-builder__row">
          <label class="tl-label">${t('filter.builder.attrLabel')}</label>
          <select id="tl-attr-select" class="tl-input"></select>
        </div>
        <div class="tl-filter-builder__row">
          <label class="tl-label">${t('filter.builder.optionsLabel')}</label>
          <div class="tl-multi">
            <input id="tl-search" type="text" class="tl-input" placeholder="${t(
              'filter.builder.searchPlaceholder',
            )}" />
            <div id="tl-options" class="tl-options"></div>
          </div>
        </div>
        <div class="tl-filter-builder__row tl-filter-builder__row--end">
          <button type="button" class="tl-btn" data-action="confirm">${t(
            'filter.builder.confirm',
          )}</button>
          <button type="button" class="tl-btn tl-btn--ghost" data-action="cancel">${t(
            'filter.builder.cancel',
          )}</button>
        </div>
      </div>

      <div class="tl-filter-panel__row tl-filter-panel__row--end">
        <button type="button" class="tl-btn tl-btn--ghost" data-action="close">${t(
          'filter.panel.close',
        )}</button>
      </div>
    `;

    document.body.appendChild(panel);

    // 取常用节点引用
    elBuilder = panel.querySelector('#tl-filter-builder');
    elAttrSelect = panel.querySelector('#tl-attr-select');
    elSearch = panel.querySelector('#tl-search');
    elOptions = panel.querySelector('#tl-options');
    elSummary = panel.querySelector('#tl-rule-summary');

    // 事件：panel 内部按钮（事件委托）
    panel.addEventListener('click', onPanelClick);

    // 事件：点击面板外关闭
    const onDocClick = (evt) => {
      if (!isOpen) return;
      if (!panel) return;
      if (panel.contains(evt.target)) return;
      if (triggerBtn && triggerBtn.contains(evt.target)) return;
      hidePanel();
    };
    document.addEventListener('click', onDocClick);
    disposers.push(() => document.removeEventListener('click', onDocClick));

    // 事件：外部打开 builder
    const onOpenBuilder = () => openBuilder();
    window.addEventListener('filter:add-rule', onOpenBuilder);
    disposers.push(() => window.removeEventListener('filter:add-rule', onOpenBuilder));

    // 事件：外部规则状态变化（来自 filter-state.js）
    const onStateUpdated = () => renderRuleSummary();
    window.addEventListener('filter:state:updated', onStateUpdated);
    disposers.push(() => window.removeEventListener('filter:state:updated', onStateUpdated));

    // 事件：搜索与属性切换
    elSearch?.addEventListener('input', () => refreshOptions());
    elAttrSelect?.addEventListener('change', () => {
      refreshOptions(true);
      restoreCheckedFromExistingRule();
    });

    // 事件：清单里的“×”按钮（清空该属性）
    panel.addEventListener('click', (e) => {
      const x = e.target.closest('button[data-clear-key]');
      if (!x) return;
      const key = x.getAttribute('data-clear-key');
      window.dispatchEvent(new CustomEvent('filter:remove-rule', { detail: { key } }));
      renderRuleSummary();
    });

    return panel;
  }

  // -----------------------------
  // 6) Panel 交互
  // -----------------------------
  function togglePanel() {
    ensurePanel();

    if (isOpen) {
      hidePanel();
      return;
    }

    showPanel();
  }

  function showPanel() {
    ensurePanel();
    isOpen = true;
    panel.classList.add('is-open');

    positionPanel();
    prepareAttrOptions();
    renderRuleSummary();

    // 打开期间跟随滚动/resize 重新定位
    bindAutoReposition();
  }

  function hidePanel() {
    if (!panel) return;
    isOpen = false;
    panel.classList.remove('is-open');
    hideBuilder();
    unbindAutoReposition();

    window.dispatchEvent(new CustomEvent('filter:close-ui'));
  }

  function bindAutoReposition() {
    const onReposition = () => {
      if (!isOpen) return;
      positionPanel();
    };
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);

    // 保存 disposer
    const off = () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
    // 为避免重复绑定，先卸载再绑定
    unbindAutoReposition();
    _autoRepositionDisposer = off;
  }

  let _autoRepositionDisposer = null;
  function unbindAutoReposition() {
    try {
      _autoRepositionDisposer && _autoRepositionDisposer();
    } catch {}
    _autoRepositionDisposer = null;
  }

  function positionPanel() {
    if (!triggerBtn || !panel) return;

    const rect = triggerBtn.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 6;
    const left = rect.left + window.scrollX;

    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
  }

  // -----------------------------
  // 7) Builder（新增规则子面板）
  // -----------------------------
  function openBuilder() {
    ensurePanel();
    prepareAttrOptions();
    restoreCheckedFromExistingRule();
    if (elBuilder) elBuilder.hidden = false;
  }

  function hideBuilder() {
    ensurePanel();
    if (elBuilder) elBuilder.hidden = true;
  }

  /**
   * prepareAttrOptions()
   * - 获取可过滤字段 key 列表
   * - 移除 Tag（UI 层决策）
   * - 确保包含 Importance（防御性）
   * - 生成下拉选项并保留当前选择
   */
  function prepareAttrOptions() {
    ensurePanel();
    if (!elAttrSelect) return;

    let keys = getOptionKeys() || [];
    const current = elAttrSelect.value;

    // UI 决策：不暴露 Tag
    keys = keys.filter((k) => k !== 'Tag');

    // 防御性：确保 Importance 存在
    if (!keys.includes('Importance')) keys.push('Importance');

    // 重建下拉选项（使用 DOM API，避免 HTML 注入问题）
    elAttrSelect.innerHTML = '';
    for (const k of keys) {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = keyToLabelI18n(k);
      elAttrSelect.appendChild(opt);
    }

    if (keys.includes(current)) elAttrSelect.value = current;
    if (!elAttrSelect.value && keys.length) elAttrSelect.value = keys[0];

    refreshOptions(true);
  }

  /**
   * restoreCheckedFromExistingRule()
   * - 当用户切换属性时，如果该属性已经存在规则，
   *   则在 options 列表中恢复已选中项。
   */
  function restoreCheckedFromExistingRule() {
    ensurePanel();
    const rules = getCurrentRules() || [];
    const key = elAttrSelect?.value;
    if (!key) return;

    const exists = rules.find((r) => r.key === key);
    if (!exists) return;

    const set = new Set((exists.values || []).map((v) => String(v)));

    const checks = elOptions?.querySelectorAll('input[type="checkbox"][data-val]') || [];
    checks.forEach((ch) => {
      const v = ch.getAttribute('data-val');
      ch.checked = set.has(String(v));
    });
  }

  /**
   * readBuilder()
   * - 读取当前 builder 的 key 与勾选 values
   */
  function readBuilder() {
    ensurePanel();
    const key = elAttrSelect?.value || '';
    const nodeList =
      panel.querySelectorAll('#tl-options input[type="checkbox"]:checked') || [];
    const values = Array.from(nodeList).map((ch) => ch.getAttribute('data-val'));
    return { key, values };
  }

  /**
   * refreshOptions(resetScroll)
   * - 根据当前属性 key，计算候选 options
   * - 支持 search 过滤
   * - 用 DOM API 渲染 checkbox 列表，避免 data-val/innerHTML 注入问题
   */
  function refreshOptions(resetScroll = false) {
    ensurePanel();
    if (!elAttrSelect || !elOptions || !elSearch) return;

    const key = elAttrSelect.value;
    const search = (elSearch.value || '').trim().toLowerCase();

    const items = getItems() || [];
    const options = getOptionsForKey(items, key) || [];

    // 清空并重建
    elOptions.innerHTML = '';
    const frag = document.createDocumentFragment();

    for (const rawVal of options) {
      const valStr = String(rawVal);

      if (search && !valStr.toLowerCase().includes(search)) continue;

      // 构建：<label><input><span></span></label>
      const wrap = document.createElement('label');
      wrap.className = 'tl-opt';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('data-val', valStr); // data-* 赋值是安全的（不走 HTML 解析）

      // label 文案必须走 textContent，防止 val 中含 <script> 之类被当 HTML
      const span = document.createElement('span');
      span.textContent = valStr;

      // 生成一个相对稳定的 id（只用于 label/可访问性，不参与逻辑）
      // 注意：不再使用 btoa/unescape 这类对 unicode 容易踩坑的方法
      input.id = `opt-${key}-${hashForId(valStr)}`;

      wrap.appendChild(input);
      wrap.appendChild(span);
      frag.appendChild(wrap);
    }

    elOptions.appendChild(frag);

    if (resetScroll) elOptions.scrollTop = 0;

    // 刷新后恢复勾选（避免重建 DOM 导致勾选丢失）
    restoreCheckedFromExistingRule();
  }

  /**
   * hashForId()
   * - 将任意字符串生成短 hash，用于 element.id
   * - 不要求密码学强度，只要稳定且不含特殊字符
   */
  function hashForId(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  // -----------------------------
  // 8) Rule Summary（已选规则清单）
  // -----------------------------
  function renderRuleSummary() {
    ensurePanel();
    if (!elSummary) return;

    const rules = getCurrentRules() || [];

    if (!rules.length) {
      elSummary.innerHTML = '';
      const hint = document.createElement('div');
      hint.className = 'tl-hint';
      hint.textContent = t('filter.summary.empty');
      elSummary.appendChild(hint);
      return;
    }

    const list = document.createElement('div');
    list.className = 'rule-list';

    for (const r of rules) {
      const row = document.createElement('div');
      row.className = 'rule-row';

      const left = document.createElement('div');
      left.className = 'rule-left';

      const keySpan = document.createElement('span');
      keySpan.className = 'rule-key';
      keySpan.textContent = keyToLabelI18n(r.key);

      const valuesWrap = document.createElement('div');
      valuesWrap.className = 'rule-values';

      const vals = Array.isArray(r.values) ? r.values : [];
      if (!vals.length) {
        const emptyChip = document.createElement('span');
        emptyChip.className = 'chip chip--empty';
        emptyChip.textContent = t('filter.summary.emptyChip');
        valuesWrap.appendChild(emptyChip);
      } else {
        for (const v of vals) {
          const chip = document.createElement('span');
          chip.className = 'chip';
          chip.textContent = String(v);
          valuesWrap.appendChild(chip);
        }
      }

      left.appendChild(keySpan);
      left.appendChild(valuesWrap);

      const right = document.createElement('div');
      right.className = 'rule-right';

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'tl-x';
      clearBtn.title = t('filter.summary.clearAttrTitle');
      clearBtn.textContent = '×';
      clearBtn.setAttribute('data-clear-key', r.key);

      right.appendChild(clearBtn);

      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    }

    elSummary.innerHTML = '';
    elSummary.appendChild(list);
  }

  // -----------------------------
  // 9) Panel click handler（按钮 action）
  // -----------------------------
  function onPanelClick(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const action = btn.getAttribute('data-action');

    if (action === 'add') {
      openBuilder();
      return;
    }

    if (action === 'reset') {
      hideBuilder();
      window.dispatchEvent(new CustomEvent('filter:reset'));
      return;
    }

    if (action === 'and') {
      window.dispatchEvent(new CustomEvent('filter:set-logic', { detail: { mode: 'AND' } }));
      return;
    }

    if (action === 'or') {
      window.dispatchEvent(new CustomEvent('filter:set-logic', { detail: { mode: 'OR' } }));
      return;
    }

    if (action === 'confirm') {
      // ✅ 仅更新规则，不立刻应用（dataset 更新在 mount.js 的监听里做）
      const { key, values } = readBuilder();
      if (key && values.length) {
        window.dispatchEvent(
          new CustomEvent('filter:add-rule:confirm', { detail: { key, values } }),
        );
        hideBuilder();
        renderRuleSummary();
      }
      return;
    }

    if (action === 'cancel') {
      hideBuilder();
      return;
    }

    if (action === 'close') {
      hidePanel();
      return;
    }
  }

  // -----------------------------
  // 10) 绑定 trigger
  // -----------------------------
  triggerBtn.addEventListener('click', togglePanel);

  // -----------------------------
  // 11)（可选）对外暴露 destroy
  // -----------------------------
  // 当前你主线代码未使用 destroy，但加上可提升“交接可维护性”：
  // - 如果未来需要卸载/重建 UI，可调用返回对象的 destroy()
  return {
    destroy() {
      try {
        triggerBtn?.removeEventListener('click', togglePanel);
      } catch {}

      try {
        unbindAutoReposition();
      } catch {}

      try {
        disposers.forEach((fn) => fn());
      } catch {}

      try {
        panel?.remove();
      } catch {}

      panel = null;
      isOpen = false;

      // 允许未来重新 init（解除 guard）
      try {
        _initedByAnchor.delete(timelineEl);
      } catch {}
    },
  };
}

/* =============================================================================
 * Styles (Injected once)
 * ============================================================================= */

function ensureStylesInjected() {
  if (document.getElementById('tl-filter-styles')) return;

  const style = document.createElement('style');
  style.id = 'tl-filter-styles';
  style.textContent = `
    .tl-toolbar { display:flex; align-items:center; gap:8px; margin:8px 0 12px; }
    .tl-filter-trigger, .tl-btn {
      padding:6px 12px; border-radius:8px; border:1px solid #ddd; background:#fff; cursor:pointer; font-size:14px; line-height:1.2;
    }
    .tl-filter-trigger:hover, .tl-btn:hover { background:#f7f7f7; }
    .tl-btn--ghost { background:transparent; }

    .tl-filter-panel {
      position:absolute; top:48px; left:0; min-width:360px; max-width:92vw; background:#fff;
      border:1px solid #e5e5e5; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.12);
      padding:12px; display:none; z-index:9999;
    }
    .tl-filter-panel.is-open { display:block; }
    .tl-filter-panel__row { display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
    .tl-filter-panel__row--end { justify-content:flex-end; margin-bottom:0; }

    .tl-rule-summary { border-top:1px dashed #e5e7eb; padding-top:10px; margin-top:6px; }
    .rule-list { display:flex; flex-direction:column; gap:6px; }
    .rule-row { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:6px; border:1px solid #eef2f7; border-radius:8px; }
    .rule-key { font-weight:600; color:#111827; margin-right:8px; }
    .rule-values { display:flex; flex-wrap:wrap; gap:6px; }
    .chip { display:inline-block; padding:2px 6px; border-radius:999px; border:1px solid #e5e7eb; font-size:12px; background:#f9fafb; }
    .chip--empty { color:#6b7280; }
    .tl-x { border:1px solid #e5e7eb; background:#fff; border-radius:6px; width:24px; height:24px; cursor:pointer; }

    .tl-filter-builder { border-top:1px dashed #e5e7eb; padding-top:10px; margin-top:10px; }
    .tl-filter-builder__row { display:flex; gap:10px; align-items:center; margin:8px 0; }
    .tl-label { min-width:72px; font-size:13px; color:#374151; }
    .tl-input { border:1px solid #e5e7eb; border-radius:8px; padding:6px 8px; font-size:13px; }
    .tl-multi { display:flex; flex-direction:column; gap:6px; width:100%; max-width:480px; }
    .tl-options { border:1px solid #e5e7eb; border-radius:8px; max-height:220px; overflow:auto; padding:6px; display:grid; gap:4px; grid-template-columns: 1fr 1fr; }
    .tl-opt { display:flex; gap:6px; align-items:center; font-size:13px; }
    .tl-hint { font-size:12px; color:#6b7280; }
  `;
  document.head.appendChild(style);
}
