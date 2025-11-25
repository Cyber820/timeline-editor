// public/src/ui/info-dialog.js
// 作用：创建“使用方法 / 开发计划 / 反馈与建议”三个信息弹窗按钮。
// - 使用方法 / 开发计划：继续使用 _staging/info-content.js 里的纯文本
// - 反馈与建议：在前端显示表单（ID / 联系方式 / 反馈内容），当前只写入 console.log

import { HOW_TO_USE_TEXT, ROADMAP_TEXT } from '../_staging/info-content.js';

let dialogRoot = null;      // 纯文本信息弹窗（使用方法 / 开发计划）
let feedbackRoot = null;    // 反馈与建议弹窗

/** 创建 / 获取通用“纯文本弹窗” DOM 结构（使用方法 / 开发计划） */
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

/** 打开“纯文本信息”弹窗，title: 标题，text: 纯文本正文 */
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

/* ---------------- 反馈与建议弹窗相关 ---------------- */

/** 创建 / 获取“反馈与建议”弹窗 DOM 结构 */
function ensureFeedbackRoot() {
  if (feedbackRoot) return feedbackRoot;

  const root = document.createElement('div');
  root.id = 'feedback-dialog-root';
  root.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: none;
    align-items: center;
    justify-content: center;
  `;

  root.innerHTML = `
    <div class="fb-dialog-backdrop" style="
      position:absolute;inset:0;
      background:rgba(0,0,0,.35);
    "></div>
    <div class="fb-dialog-panel" style="
      position:relative;
      width:min(640px, 94vw);
      max-height: 80vh;
      background:#fff;
      border-radius:12px;
      box-shadow:0 16px 40px rgba(0,0,0,.35);
      padding:14px 16px 12px;
      display:flex;
      flex-direction:column;
      gap:8px;
      font-size:14px;
    ">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <h2 style="margin:0;font-size:1.05rem;font-weight:600;">反馈与建议</h2>
        <button class="fb-dialog-close" title="关闭" style="
          border:none;background:transparent;
          font-size:20px;cursor:pointer;
        ">×</button>
      </div>
      <div style="font-size:13px;color:#4b5563;margin-bottom:4px;line-height:1.6;">
        如果你在时间轴中发现了错误、遗漏，或者有补充的资料与建议，欢迎在这里填写。<br>
        “事件 ID” 可以是事件的自动编号（如 <code>auto-24</code>），也可以是事件名称或大致时间描述。
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;overflow:auto;padding-right:2px;">
        <div class="fb-field">
          <label style="display:block;font-size:13px;color:#374151;margin-bottom:2px;">事件 ID（必填）</label>
          <input id="fb-id" type="text" style="
            width:100%;box-sizing:border-box;
            border:1px solid #e5e7eb;border-radius:8px;
            padding:6px 8px;font-size:13px;
          " placeholder="例如：auto-24 / 1980 年某事件 / 事件名称">
        </div>
        <div class="fb-field">
          <label style="display:block;font-size:13px;color:#374151;margin-bottom:2px;">联系方式（选填）</label>
          <input id="fb-contact" type="text" style="
            width:100%;box-sizing:border-box;
            border:1px solid #e5e7eb;border-radius:8px;
            padding:6px 8px;font-size:13px;
          " placeholder="邮箱 / QQ / 社交账号（可留空）">
        </div>
        <div class="fb-field">
          <label style="display:block;font-size:13px;color:#374151;margin-bottom:2px;">反馈内容（必填）</label>
          <textarea id="fb-content" rows="4" style="
            width:100%;box-sizing:border-box;
            border:1px solid #e5e7eb;border-radius:8px;
            padding:6px 8px;font-size:13px;
            resize:vertical;min-height:80px;
          " placeholder="请描述你想反馈的问题、建议或补充信息"></textarea>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px;">
        <button type="button" class="fb-btn-submit" style="
          padding:6px 12px;border-radius:8px;
          border:1px solid #111827;background:#111827;
          color:#fff;cursor:pointer;font-size:13px;
        ">提交</button>
        <button type="button" class="fb-btn-cancel" style="
          padding:6px 12px;border-radius:8px;
          border:1px solid #d1d5db;background:#fff;
          cursor:pointer;font-size:13px;
        ">取消</button>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  // 关闭逻辑
  const backdrop = root.querySelector('.fb-dialog-backdrop');
  const btnClose = root.querySelector('.fb-dialog-close');
  const btnCancel = root.querySelector('.fb-btn-cancel');

  const hide = () => {
    root.style.display = 'none';
  };
  backdrop.addEventListener('click', hide);
  btnClose.addEventListener('click', hide);
  btnCancel.addEventListener('click', hide);

  // 提交逻辑
  const btnSubmit = root.querySelector('.fb-btn-submit');
  const idInput = root.querySelector('#fb-id');
  const contactInput = root.querySelector('#fb-contact');
  const contentInput = root.querySelector('#fb-content');

  btnSubmit.addEventListener('click', () => {
    const id = (idInput?.value || '').trim();
    const contact = (contactInput?.value || '').trim();
    const content = (contentInput?.value || '').trim();

    if (!id) {
      alert('请填写“事件 ID”（可以是编号、名称或大致时间描述）。');
      idInput && idInput.focus();
      return;
    }
    if (!content) {
      alert('请填写反馈内容。');
      contentInput && contentInput.focus();
      return;
    }

    // 当前阶段：仅打印到控制台，后续可接入 Apps Script / Drive 写入文本文件
    console.log('[timeline-feedback]', {
      id,
      contact,
      content,
      ts: new Date().toISOString(),
    });

    alert('感谢你的反馈！当前版本尚未接入后台存储，只在浏览器控制台记录了一份。');

    if (idInput) idInput.value = '';
    if (contactInput) contactInput.value = '';
    if (contentInput) contentInput.value = '';

    hide();
  });

  feedbackRoot = root;
  return root;
}

function openFeedbackDialog() {
  const root = ensureFeedbackRoot();
  root.style.display = 'flex';

  // 默认聚焦到 ID 输入框
  const idInput = root.querySelector('#fb-id');
  if (idInput) {
    setTimeout(() => idInput.focus(), 20);
  }
}

/** 对外接口：初始化右上角按钮 + 绑定三个弹窗 */
export function initInfoDialogs() {
  // 按钮 id：btn-help / btn-roadmap / btn-feedback
  const btnHelp = document.getElementById('btn-help');
  const btnRoadmap = document.getElementById('btn-roadmap');
  const btnFeedback = document.getElementById('btn-feedback');

  if (btnHelp) {
    btnHelp.addEventListener('click', () => {
      openInfoDialog('使用方法', HOW_TO_USE_TEXT);
    });
  }
  if (btnRoadmap) {
    btnRoadmap.addEventListener('click', () => {
      // 保持原来的标题与文案来源
      openInfoDialog('开发计划和反馈', ROADMAP_TEXT);
    });
  }
  if (btnFeedback) {
    btnFeedback.addEventListener('click', () => {
      openFeedbackDialog();
    });
  }
}
