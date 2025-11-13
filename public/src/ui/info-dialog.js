// public/src/ui/info-dialog.js
// 作用：创建“使用方法 / 开发计划与反馈”两个信息弹窗按钮，并在页面中间显示纯文本弹窗。

import { HOW_TO_USE_TEXT, ROADMAP_TEXT } from '../_staging/info-content.js';

let dialogRoot = null;

/** 创建 / 获取通用弹窗 DOM 结构 */
function ensureDialogRoot() {
  if (dialogRoot) return dialogRoot;

  const root = document.createElement('div');
  root.id = 'info-dialog-root';
  root.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9998;
    display: none;
    align-items: center;
    justify-content: center;
  `;

  root.innerHTML = `
    <div class="info-dialog-backdrop" style="
      position:absolute;inset:0;
      background:rgba(0,0,0,.35);
    "></div>
    <div class="info-dialog-panel" style="
      position:relative;
      width:min(720px, 94vw);
      max-height: 80vh;
      background:#fff;
      border-radius:12px;
      box-shadow:0 16px 40px rgba(0,0,0,.35);
      padding:16px 18px 12px;
      display:flex;
      flex-direction:column;
      gap:8px;
    ">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <h2 id="info-dialog-title" style="margin:0;font-size:1.05rem;font-weight:600;">标题</h2>
        <button id="info-dialog-close" title="关闭" style="
          border:none;background:transparent;
          font-size:20px;cursor:pointer;
        ">×</button>
      </div>
      <div id="info-dialog-body" style="
        margin-top:4px;
        padding:8px 4px 4px;
        border-top:1px solid #e5e7eb;
        overflow:auto;
        font-size:13px;
        line-height:1.6;
        white-space:pre-wrap;
      "></div>
    </div>
  `;

  document.body.appendChild(root);

  // 关闭逻辑
  const backdrop = root.querySelector('.info-dialog-backdrop');
  const btnClose = root.querySelector('#info-dialog-close');
  const hide = () => {
    root.style.display = 'none';
  };
  backdrop.addEventListener('click', hide);
  btnClose.addEventListener('click', hide);

  dialogRoot = root;
  return root;
}

/** 打开弹窗，title: 标题，text: 纯文本正文 */
function openInfoDialog(title, text) {
  const root = ensureDialogRoot();
  const titleEl = root.querySelector('#info-dialog-title');
  const bodyEl = root.querySelector('#info-dialog-body');

  if (titleEl) titleEl.textContent = title || '';
  if (bodyEl) {
    bodyEl.innerHTML = ''; // 清空旧内容
    const pre = document.createElement('pre');
    pre.textContent = text || '';
    pre.style.margin = '0';
    pre.style.whiteSpace = 'pre-wrap'; // 保留换行
    bodyEl.appendChild(pre);
  }

  root.style.display = 'flex';
}

/** 对外接口：初始化右上角按钮 + 绑定弹窗 */
export function initInfoDialogs() {
  // 假设按钮 id 为 btn-help / btn-roadmap
  const btnHelp = document.getElementById('btn-help');
  const btnRoadmap = document.getElementById('btn-roadmap');

  if (btnHelp) {
    btnHelp.addEventListener('click', () => {
      openInfoDialog('使用方法', HOW_TO_USE_TEXT);
    });
  }
  if (btnRoadmap) {
    btnRoadmap.addEventListener('click', () => {
      openInfoDialog('开发计划和反馈', ROADMAP_TEXT);
    });
  }
}
