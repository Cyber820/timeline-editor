// public/src/filter/filter-ui.js
// 面板：主按钮 + 子面板（新增过滤规则）+ 已选规则清单
// 事件：
// - 'filter:add-rule'                 → 打开新增规则子面板
// - 'filter:add-rule:confirm'         → { key, values } 仅更新规则，不立刻应用
// - 'filter:remove-rule'              → { key } 清空该属性已选项（仅更新规则）
// - 'filter:reset' / 'filter:set-logic' / 'filter:close-ui'
import { getOptionKeys, getOptionsForKey } from './filter-engine.js';
import { t } from '../ui-text/index.js';

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

  // 工具条容器
  let toolbar = document.querySelector('#timeline-toolbar');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = 'timeline-toolbar';
    toolbar.className = 'tl-toolbar';
    timelineEl.parentNode.insertBefore(toolbar, timelineEl);
  }

  // 触发按钮（必须提供稳定锚点，供 mount.js 插入样式按钮）
  if (!toolbar.querySelector('.tl-filter-trigger')) {
    const triggerBtn = document.createElement('button');
    triggerBtn.type = 'button';
    triggerBtn.className = 'tl-filter-trigger';
    triggerBtn.textContent = t('filter.trigger');
    triggerBtn.setAttribute('aria-haspopup', 'dialog');

    // ✅ 关键：跨语言稳定锚点（mount.js 会用这个选择器找过滤按钮）
    triggerBtn.setAttribute('data-role', 'filter-toggle');
    triggerBtn.setAttribute('data-te-filter-toggle', '1');

    triggerBtn.addEventListener('click', togglePanel);
    toolbar.appendChild(triggerBtn);
  }

  function keyToLabelI18n(k) {
    // ✅ 统一从 ui-text 取字段显示名（中英文各自维护）
    return t(`filter.fields.${k}`) || String(k);
  }

  // 主面板构建
  function ensurePanel() {
    let panel = document.querySelector('#tl-filter-panel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'tl-filter-panel';
    panel.className = 'tl-filter-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', t('filter.panel.ariaLabel'));

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

    // 主按钮区域的事件委托
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
        window.dispatchEvent(
          new CustomEvent('filter:set-logic', { detail: { mode: 'AND' } }),
        );
      } else if (action === 'or') {
        window.dispatchEvent(
          new CustomEvent('filter:set-logic', { detail: { mode: 'OR' } }),
        );
      } else if (action === 'confirm') {
        // ✅ 仅更新规则，不立刻应用（dataset 更新在 mount.js 的监听里做）
        const { key, values } = readBuilder();
        if (key && values.length) {
          window.dispatchEvent(
            new CustomEvent('filter:add-rule:confirm', { detail: { key, values } }),
          );
          hideBuilder();
          renderRuleSummary();
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

    // 外部事件：打开新增规则
    window.addEventListener('filter:add-rule', () => openBuilder());

    // 外部状态更新（来自 state.js）
    window.addEventListener('filter:state:updated', () => renderRuleSummary());

    // 搜索与属性切换
    panel.querySelector('#tl-search')?.addEventListener('input', () => refreshOptions());
    panel.querySelector('#tl-attr-select')?.addEventListener('change', () => {
      refreshOptions(true);
      restoreCheckedFromExistingRule();
    });

    // 清单里的“×”按钮（清空该属性）
    panel.addEventListener('click', (e) => {
      const x = e.target.closest('button[data-clear-key]');
      if (!x) return;
      const key = x.getAttribute('data-clear-key');
      window.dispatchEvent(new CustomEvent('filter:remove-rule', { detail: { key } }));
      renderRuleSummary();
    });

    return panel;
  }

  function togglePanel() {
    const panel = ensurePanel();
    panel.classList.toggle('is-open');
    if (panel.classList.contains('is-open')) {
      positionPanel();
      prepareAttrOptions();
      renderRuleSummary();
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

  /* ---------- 新增规则子面板 ---------- */
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

  /**
   * 准备“过滤属性”下拉选项：
   * - 基于 getOptionKeys()
   * - UI 层强制：移除 Tag；确保包含 Importance
   */
  function prepareAttrOptions() {
    const sel = ensurePanel().querySelector('#tl-attr-select');
    let keys = getOptionKeys() || [];
    const current = sel.value;

    // ❌ 从属性列表中移除 Tag
    keys = keys.filter((k) => k !== 'Tag');

    // ✅ 确保 Importance 出现在属性列表中
    if (!keys.includes('Importance')) keys.push('Importance');

    // ✅ 用 i18n 文案展示（避免英文页出现中文）
    sel.innerHTML = keys
      .map((k) => `<option value="${k}">${keyToLabelI18n(k)}</option>`)
      .join('');

    if (keys.includes(current)) sel.value = current;
    if (!sel.value && keys.length) sel.value = keys[0];

    refreshOptions(true);
  }

  // 根据现有规则，恢复勾选状态
  function restoreCheckedFromExistingRule() {
    const rules = getCurrentRules() || [];
    const key = ensurePanel().querySelector('#tl-attr-select').value;
    const exists = rules.find((r) => r.key === key);
    if (!exists) return;

    const boxWrap = ensurePanel().querySelector('#tl-options');
    const checks = boxWrap.querySelectorAll('input[type="checkbox"][data-val]');
    const set = new Set((exists.values || []).map((v) => String(v)));

    checks.forEach((ch) => {
      const v = ch.getAttribute('data-val');
      ch.checked = set.has(v);
    });
  }

  // 从子面板读取当前选择
  function readBuilder() {
    const panel = ensurePanel();
    const key = panel.querySelector('#tl-attr-select').value;
    const nodeList = panel.querySelectorAll('#tl-options input[type="checkbox"]:checked');
    const values = Array.from(nodeList).map((ch) => ch.getAttribute('data-val'));
    return { key, values };
  }

  // 刷新“过滤选项”列表（支持搜索）
  function refreshOptions(resetScroll = false) {
    const panel = ensurePanel();
    const key = panel.querySelector('#tl-attr-select').value;
    const search = panel.querySelector('#tl-search').value.trim().toLowerCase();
    const items = getItems() || [];
    const options = getOptionsForKey(items, key);

    const box = panel.querySelector('#tl-options');
    box.innerHTML = '';
    const frag = document.createDocumentFragment();

    options
      .filter((o) => !search || String(o).toLowerCase().includes(search))
      .forEach((val) => {
        const id = `opt-${key}-${btoa(unescape(encodeURIComponent(String(val)))).replace(
          /=/g,
          '',
        )}`;
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

  /* ---------- 已选规则清单 ---------- */
  function renderRuleSummary() {
    const host = ensurePanel().querySelector('#tl-rule-summary');
    const rules = getCurrentRules() || [];

    if (!rules.length) {
      host.innerHTML = `<div class="tl-hint">${t('filter.summary.empty')}</div>`;
      return;
    }

    const html = rules
      .map((r) => {
        const chips = (r.values || [])
          .map((v) => `<span class="chip">${String(v)}</span>`)
          .join('');
        return `
        <div class="rule-row">
          <div class="rule-left">
            <span class="rule-key">${keyToLabelI18n(r.key)}</span>
            <div class="rule-values">
              ${chips || `<span class="chip chip--empty">${t('filter.summary.emptyChip')}</span>`}
            </div>
          </div>
          <div class="rule-right">
            <button type="button" class="tl-x" title="${t(
              'filter.summary.clearAttrTitle',
            )}" data-clear-key="${r.key}">×</button>
          </div>
        </div>
      `;
      })
      .join('');

    host.innerHTML = `<div class="rule-list">${html}</div>`;
  }
}

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
