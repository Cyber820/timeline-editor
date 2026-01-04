// public/src/ui/info-dialog.js
// =============================================================================
// Info Dialogs
// =============================================================================
// 职责：
// - 管理三个弹窗：Usage / Roadmap / Feedback
// - Usage/Roadmap 的正文通过 getInfoText(kind) 动态取（见 _staging/info-content(s).js）
// - Feedback 提交到后端 endpoint（优先 globalThis.TIMELINE_FEEDBACK_ENDPOINT），并附带 variant 元信息
//
// 设计要点：
// - 纯文本弹窗（Usage/Roadmap）：复用一个 dialogRoot，展示 <pre> 文本
// - 反馈弹窗：独立 feedbackRoot，提交用 URLSearchParams（表单编码）
// - i18n：按钮标题与表单文案走 ui-text：t('info....')
// =============================================================================

import { getInfoText } from '../_staging/info-content.js';
import { t } from '../ui-text/index.js';

/**
 * REQUIRE_ID
 * - false：个人 ID 可选（当前建议）
 * - true：强制个人 ID 必填
 */
const REQUIRE_ID = false;

/**
 * LEGACY_FALLBACK_ENDPOINT
 * - 当未设置 TIMELINE_FEEDBACK_ENDPOINT 且 __variant.endpoints.feedback 也不存在时使用
 * - 建议：生产环境尽量通过 TIMELINE_FEEDBACK_ENDPOINT 或 __variant.endpoints.feedback 显式指定
 */
const LEGACY_FALLBACK_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbwOFJP5nRI_zwU2fuY1uelyfvEYV8VeKMJbYRDWNHKG1RgurzZvwViw1ewFKpB6Td7-/exec';

function resolveFeedbackEndpoint() {
  const ep1 = globalThis.TIMELINE_FEEDBACK_ENDPOINT;
  if (ep1) return ep1;

  const ep2 = globalThis.__variant?.endpoints?.feedback;
  if (ep2) return ep2;

  return LEGACY_FALLBACK_ENDPOINT;
}

function getVariantMeta() {
  const v = globalThis.__variant || {};
  const region = v.region || globalThis.TIMELINE_REGION || '';
  const lang = v.lang || globalThis.TIMELINE_LANG || '';
  const key = v.key || (region && lang ? `${String(region)}-${String(lang)}` : '');
  return { key, region, lang };
}

let dialogRoot = null;
let feedbackRoot = null;

/* =============================================================================
 * 纯文本信息弹窗（Usage / Roadmap）
 * ============================================================================= */

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
        <h2 id="info-dialog-title" style="margin:0;font-size:1.05rem;font-weight:600;"></h2>
        <button id="info-dialog-close" title="Close" style="
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

  const backdrop = root.querySelector('.info-dialog-backdrop');
  const btnClose = root.querySelector('#info-dialog-close');

  const hide = () => (root.style.display = 'none');

  backdrop?.addEventListener('click', hide);
  btnClose?.addEventListener('click', hide);

  dialogRoot = root;
  return root;
}

function openInfoDialog(title, text) {
  const root = ensureDialogRoot();
  const titleEl = root.querySelector('#info-dialog-title');
  const bodyEl = root.querySelector('#info-dialog-body');

  if (titleEl) titleEl.textContent = title || '';

  if (bodyEl) {
    bodyEl.innerHTML = '';
    const pre = document.createElement('pre');
    pre.textContent = text || '';
    pre.style.margin = '0';
    pre.style.whiteSpace = 'pre-wrap';
    bodyEl.appendChild(pre);
  }

  root.style.display = 'flex';
}

/* =============================================================================
 * 反馈与建议弹窗（Feedback）
 * ============================================================================= */

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

  const introText = t('info.dialogs.intro');

  // ✅ 对齐 ui-text：zh.js/en.js 当前提供的是 idLabelRequired / idLabelOptional
  const idLabel = REQUIRE_ID ? t('info.form.idLabelRequired') : t('info.form.idLabelOptional');

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
        <h2 style="margin:0;font-size:1.05rem;font-weight:600;">${escapeHtml(
          t('info.dialogs.feedbackTitle'),
        )}</h2>
        <button class="fb-dialog-close" title="Close" style="
          border:none;background:transparent;
          font-size:20px;cursor:pointer;
        ">×</button>
      </div>

      <div style="font-size:13px;color:#4b5563;margin-bottom:4px;line-height:1.6;white-space:pre-wrap;">
        ${escapeHtml(introText)}
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;overflow:auto;padding-right:2px;">
        <div class="fb-field">
          <label style="display:block;font-size:13px;color:#374151;margin-bottom:2px;">
            ${escapeHtml(idLabel)}
          </label>
          <input id="fb-id" type="text" style="
            width:100%;box-sizing:border-box;
            border:1px solid #e5e7eb;border-radius:8px;
            padding:6px 8px;font-size:13px;
          " placeholder="${escapeHtml(t('info.form.idPlaceholder'))}">
        </div>

        <div class="fb-field">
          <label style="display:block;font-size:13px;color:#374151;margin-bottom:2px;">
            ${escapeHtml(t('info.form.contactLabel'))}
          </label>
          <input id="fb-contact" type="text" style="
            width:100%;box-sizing:border-box;
            border:1px solid #e5e7eb;border-radius:8px;
            padding:6px 8px;font-size:13px;
          " placeholder="${escapeHtml(t('info.form.contactPlaceholder'))}">
        </div>

        <div class="fb-field">
          <label style="display:block;font-size:13px;color:#374151;margin-bottom:2px;">
            ${escapeHtml(t('info.form.contentLabel'))}
          </label>
          <textarea id="fb-content" rows="4" style="
            width:100%;box-sizing:border-box;
            border:1px solid #e5e7eb;border-radius:8px;
            padding:6px 8px;font-size:13px;
            resize:vertical;min-height:80px;
          " placeholder="${escapeHtml(t('info.form.contentPlaceholder'))}"></textarea>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px;">
        <button type="button" class="fb-btn-submit" style="
          padding:6px 12px;border-radius:8px;
          border:1px solid #111827;background:#111827;
          color:#fff;cursor:pointer;font-size:13px;
        ">${escapeHtml(t('info.form.submit'))}</button>
        <button type="button" class="fb-btn-cancel" style="
          padding:6px 12px;border-radius:8px;
          border:1px solid #d1d5db;background:#fff;
          cursor:pointer;font-size:13px;
        ">${escapeHtml(t('info.form.cancel'))}</button>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  const backdrop = root.querySelector('.fb-dialog-backdrop');
  const btnClose = root.querySelector('.fb-dialog-close');
  const btnCancel = root.querySelector('.fb-btn-cancel');

  const hide = () => (root.style.display = 'none');

  backdrop?.addEventListener('click', hide);
  btnClose?.addEventListener('click', hide);
  btnCancel?.addEventListener('click', hide);

  const btnSubmit = root.querySelector('.fb-btn-submit');
  const idInput = root.querySelector('#fb-id');
  const contactInput = root.querySelector('#fb-contact');
  const contentInput = root.querySelector('#fb-content');

  btnSubmit?.addEventListener('click', async () => {
    const id = (idInput?.value || '').trim();
    const contact = (contactInput?.value || '').trim();
    const content = (contentInput?.value || '').trim();

    if (REQUIRE_ID && !id) {
      alert(t('info.form.idRequiredAlert'));
      idInput?.focus();
      return;
    }
    if (!content) {
      alert(t('info.form.contentRequiredAlert'));
      contentInput?.focus();
      return;
    }

    const endpoint = resolveFeedbackEndpoint();
    if (!endpoint) {
      // ✅ 对齐 ui-text：missingEndpoint
      alert(t('info.form.missingEndpoint'));
      return;
    }

    const { key: variantKey, region, lang } = getVariantMeta();

    const payload = new URLSearchParams({
      id,
      contact,
      content,
      variantKey,
      region,
      lang,
      pageUrl: location.href,
    });

    try {
      await fetch(endpoint, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: payload.toString(),
      });

      alert(t('info.form.okToast'));

      if (idInput) idInput.value = '';
      if (contactInput) contactInput.value = '';
      if (contentInput) contentInput.value = '';

      hide();
    } catch (err) {
      console.error('feedback submit failed:', err);
      alert(t('info.form.failToast'));
    }
  });

  feedbackRoot = root;
  return root;
}

function openFeedbackDialog() {
  const root = ensureFeedbackRoot();
  root.style.display = 'flex';
  const contentInput = root.querySelector('#fb-content');
  if (contentInput) setTimeout(() => contentInput.focus(), 20);
}

export function initInfoDialogs() {
  const btnHelp = document.getElementById('btn-help');
  const btnRoadmap = document.getElementById('btn-roadmap');
  const btnFeedback = document.getElementById('btn-feedback');

  if (btnHelp) {
    btnHelp.textContent = t('info.buttons.usage');
    btnHelp.addEventListener('click', () => {
      openInfoDialog(t('info.dialogs.usageTitle'), getInfoText('howToUse'));
    });
  }

  if (btnRoadmap) {
    btnRoadmap.textContent = t('info.buttons.roadmap');
    btnRoadmap.addEventListener('click', () => {
      openInfoDialog(t('info.dialogs.roadmapTitle'), getInfoText('roadmap'));
    });
  }

  if (btnFeedback) {
    btnFeedback.textContent = t('info.buttons.feedback');
    btnFeedback.addEventListener('click', () => openFeedbackDialog());
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
