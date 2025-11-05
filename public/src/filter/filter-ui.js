// public/src/filter/ui.js
// 作用：在时间轴上方插入“过滤/筛选”按钮；点击后弹出面板（含5个操作按钮）
// 事件约定：
// - window.dispatchEvent(new CustomEvent('filter:add-rule'))
// - window.dispatchEvent(new CustomEvent('filter:reset'))
// - window.dispatchEvent(new CustomEvent('filter:set-logic', { detail: { mode: 'AND'|'OR' }}))
// - window.dispatchEvent(new CustomEvent('filter:close-ui'))

export function initFilterUI({ beforeElSelector = '#timeline' } = {}) {
  ensureStylesInjected();

  // 找到插入位置（默认在 #timeline 之前插入工具条）
  const timelineEl = document.querySelector(beforeElSelector);
  if (!timelineEl) {
    console.warn('[filter/ui] 未找到插入参考元素：', beforeElSelector);
    return;
  }

  // 工具条容器（若不存在则创建）
  let toolbar = document.querySelector('#timeline-toolbar');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = 'timeline-toolbar';
    toolbar.className = 'tl-toolbar';
    timelineEl.parentNode.insertBefore(toolbar, timelineEl);
  }

  // 主按钮（若已存在则不重复添加）
  if (!toolbar.querySelector('.tl-filter-trigger')) {
    const triggerBtn = document.createElement('button');
    triggerBtn.type = 'button';
    triggerBtn.className = 'tl-filter-trigger';
    triggerBtn.textContent = '过滤/筛选';
    triggerBtn.setAttribute('aria-haspopup', 'dialog');
    triggerBtn.addEventListener('click', togglePanel);
    toolbar.appendChild(triggerBtn);
  }

  // 面板（懒创建）
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
      <div class="tl-filter-panel__row tl-filter-panel__row--end">
        <button type="button" class="tl-btn tl-btn--ghost" data-action="close">关闭窗口</button>
      </div>
    `;
    document.body.appendChild(panel);

    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      if (action === 'add') {
        window.dispatchEvent(new CustomEvent('filter:add-rule'));
      } else if (action === 'reset') {
        window.dispatchEvent(new CustomEvent('filter:reset'));
      } else if (action === 'and') {
        window.dispatchEvent(new CustomEvent('filter:set-logic', { detail: { mode: 'AND' } }));
      } else if (action === 'or') {
        window.dispatchEvent(new CustomEvent('filter:set-logic', { detail: { mode: 'OR' } }));
      } else if (action === 'close') {
        hidePanel();
        window.dispatchEvent(new CustomEvent('filter:close-ui'));
      }
    });

    // 点击面板外区域关闭
    document.addEventListener('click', (evt) => {
      const trigger = document.querySelector('.tl-filter-trigger');
      if (!panel.classList.contains('is-open')) return;
      if (panel.contains(evt.target)) return;
      if (trigger && trigger.contains(evt.target)) return;
      hidePanel();
    });

    return panel;
  }

  function togglePanel() {
    const panel = ensurePanel();
    panel.classList.toggle('is-open');
    if (panel.classList.contains('is-open')) {
      positionPanel();
    }
  }

  function hidePanel() {
    const panel = document.querySelector('#tl-filter-panel');
    if (panel) panel.classList.remove('is-open');
  }

  // 简单的定位：跟随触发按钮，出现在其下方
  function positionPanel() {
    const trigger = document.querySelector('.tl-filter-trigger');
    const panel = document.querySelector('#tl-filter-panel');
    if (!trigger || !panel) return;

    const rect = trigger.getBoundingClientRect();
    panel.style.top = `${rect.bottom + window.scrollY + 6}px`;
    panel.style.left = `${rect.left + window.scrollX}px`;
  }

  window.addEventListener('resize', () => {
    const panel = document.querySelector('#tl-filter-panel');
    if (panel && panel.classList.contains('is-open')) {
      positionPanel();
    }
  });
}

function ensureStylesInjected() {
  if (document.getElementById('tl-filter-styles')) return;
  const style = document.createElement('style');
  style.id = 'tl-filter-styles';
  style.textContent = `
    .tl-toolbar {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 8px;
      margin: 8px 0 12px;
    }
    .tl-filter-trigger, .tl-btn {
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid #ddd;
      background: #fff;
      cursor: pointer;
      font-size: 14px;
      line-height: 1.2;
    }
    .tl-filter-trigger:hover, .tl-btn:hover {
      background: #f7f7f7;
    }
    .tl-btn--ghost {
      background: transparent;
    }

    .tl-filter-panel {
      position: absolute;
      top: 48px;
      left: 0;
      min-width: 280px;
      max-width: 92vw;
      background: #fff;
      border: 1px solid #e5e5e5;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      padding: 12px;
      display: none;
      z-index: 9999;
    }
    .tl-filter-panel.is-open { display: block; }
    .tl-filter-panel__row {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    .tl-filter-panel__row--end {
      justify-content: flex-end;
      margin-bottom: 0;
    }
  `;
  document.head.appendChild(style);
}
