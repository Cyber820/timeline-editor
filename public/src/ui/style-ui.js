// public/src/ui/style-ui.js
// 作用：在工具栏“筛选”按钮右侧，插入五个样式按钮；并提供对应的模态面板（仅UI骨架）。
// 事件：点击按钮 -> 打开对应面板；点击关闭/遮罩/ESC -> 关闭面板。
// 不包含：样式类型选择 & 具体值映射等业务逻辑（放到步骤2）。

const STYLE_BUTTONS = [
  { key: 'event',  label: '事件样式' },
  { key: 'platform', label: '平台样式' },
  { key: 'console',  label: '主机样式' },
  { key: 'company',  label: '公司样式' },
  { key: 'region',   label: '地区样式' }
];

const PANEL_TITLES = {
  event:   '事件样式设置',
  platform:'平台样式设置',
  console: '主机样式设置',
  company: '公司样式设置',
  region:  '地区样式设置',
};

let injectedStyleTag = false;

function ensureBaseStyles() {
  if (injectedStyleTag) return;
  const css = `
  .te-style-btn {
    display:inline-flex; align-items:center; gap:.25rem;
    padding:.35rem .6rem; border:1px solid var(--te-border, #dadde1);
    border-radius:.5rem; background:#fff; cursor:pointer; font-size:.9rem;
  }
  .te-style-btn + .te-style-btn { margin-left:.5rem; }
  .te-style-btn:hover { background:#f6f7f9; }

  .te-style-portal { position:fixed; inset:0; z-index:1000; display:none; }
  .te-style-portal.active { display:block; }

  .te-style-backdrop {
    position:absolute; inset:0; background:rgba(0,0,0,.35);
  }

  .te-style-dialog {
    position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
    width:min(900px, 92vw); max-height:80vh; overflow:auto;
    background:#fff; border-radius:12px; box-shadow:0 12px 40px rgba(0,0,0,.25);
    display:flex; flex-direction:column;
  }

  .te-style-header {
    padding:14px 18px; border-bottom:1px solid #eee; display:flex; align-items:center; justify-content:space-between;
  }
  .te-style-title { font-size:1.05rem; font-weight:600; }
  .te-style-close {
    border:none; background:transparent; font-size:1.25rem; cursor:pointer; line-height:1;
  }

  .te-style-body { padding:16px 18px; display:grid; gap:14px; }

  /* 占位布局：左侧“样式类型”/右侧“具体映射” */
  .te-style-grid {
    display:grid; grid-template-columns: 260px 1fr; gap:16px;
  }
  .te-style-card {
    border:1px solid #eee; border-radius:8px; padding:12px; background:#fafbfc;
  }
  .te-style-card h4 { margin:0 0 8px 0; font-size:.95rem; }
  .te-style-footer {
    border-top:1px solid #eee; padding:12px 18px; display:flex; justify-content:flex-end; gap:8px;
  }
  .te-style-link { background:transparent; border:none; color:#444; cursor:pointer; }
  .te-style-primary {
    background:#111; color:#fff; border:1px solid #111; border-radius:8px; padding:8px 12px; cursor:pointer;
  }
  .te-style-muted { color:#666; font-size:.9rem; }

  /* 小屏降级 */
  @media (max-width: 720px) {
    .te-style-grid { grid-template-columns: 1fr; }
  }
  `;
  const tag = document.createElement('style');
  tag.setAttribute('data-te-style-ui', 'true');
  tag.textContent = css;
  document.head.appendChild(tag);
  injectedStyleTag = true;
}

function createPanel(key) {
  const portal = document.createElement('div');
  portal.className = 'te-style-portal';
  portal.dataset.key = key;

  portal.innerHTML = `
    <div class="te-style-backdrop" data-role="backdrop"></div>
    <div class="te-style-dialog" role="dialog" aria-modal="true" aria-labelledby="te-style-title-${key}">
      <div class="te-style-header">
        <div class="te-style-title" id="te-style-title-${key}">${PANEL_TITLES[key] ?? '样式设置'}</div>
        <button class="te-style-close" title="关闭" aria-label="关闭">×</button>
      </div>

      <div class="te-style-body">
        <div class="te-style-grid">
          <section class="te-style-card" data-area="style-type">
            <h4>样式类型（占位）</h4>
            <div class="te-style-muted">此处将在步骤2中放入：为该属性<strong>选择唯一的样式类型</strong>（例如：字体颜色 / 背景色 / 边框色 / 字体粗细…）。</div>
          </section>

          <section class="te-style-card" data-area="style-mapping">
            <h4>属性值 → 样式映射（占位）</h4>
            <div class="te-style-muted">此处将在步骤2中放入：为该属性下<strong>各个具体值</strong>指定样式。同一种样式可复用到多个具体值。</div>
          </section>
        </div>
      </div>

      <div class="te-style-footer">
        <button class="te-style-link" data-role="clear" title="清除当前设置（占位，不生效）">清除</button>
        <button class="te-style-primary" data-role="ok">完成</button>
      </div>
    </div>
  `;

  // 关闭逻辑（仅UI）
  const close = () => portal.classList.remove('active');
  portal.querySelector('.te-style-backdrop')?.addEventListener('click', close);
  portal.querySelector('.te-style-close')?.addEventListener('click', close);
  portal.querySelector('[data-role="ok"]')?.addEventListener('click', close);

  // ESC 关闭
  const onKeydown = (e) => {
    if (e.key === 'Escape') close();
  };
  portal.addEventListener('te:open', () => {
    document.addEventListener('keydown', onKeydown);
  });
  portal.addEventListener('te:close', () => {
    document.removeEventListener('keydown', onKeydown);
  });

  // 打开/关闭时机的 CustomEvent 钩子（将来步骤2/3可用）
  portal.open = () => {
    portal.classList.add('active');
    portal.dispatchEvent(new Event('te:open'));
  };
  portal.close = () => {
    portal.classList.remove('active');
    portal.dispatchEvent(new Event('te:close'));
  };

  return portal;
}

function ensurePortalRoot() {
  let root = document.querySelector('#te-style-panels-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'te-style-panels-root';
    document.body.appendChild(root);
  }
  return root;
}

function makeButton({ key, label }, onClick) {
  const btn = document.createElement('button');
  btn.className = 'te-style-btn';
  btn.type = 'button';
  btn.textContent = label;
  btn.dataset.key = key;
  btn.addEventListener('click', onClick);
  return btn;
}

/**
 * 在“筛选/过滤”按钮右侧插入五个样式按钮，并创建对应面板（隐藏状态）。
 * @param {HTMLElement} toolbarEl 你现有的工具栏容器（包含“筛选”按钮的同一行）
 */
export function mountStyleUI(toolbarEl) {
  if (!toolbarEl) return;
  ensureBaseStyles();
  const portalRoot = ensurePortalRoot();

  // 先准备全部面板
  const panels = new Map();
  STYLE_BUTTONS.forEach(b => {
    const panel = createPanel(b.key);
    portalRoot.appendChild(panel);
    panels.set(b.key, panel);
  });

  // 插入按钮到“筛选”按钮右侧
  const frag = document.createDocumentFragment();
  STYLE_BUTTONS.forEach(b => {
    const btn = makeButton(b, () => {
      const p = panels.get(b.key);
      if (p) p.open();
    });
    frag.appendChild(btn);
  });

  // 将按钮挂到工具栏末尾（紧邻“筛选”后）
  toolbarEl.appendChild(frag);
}
