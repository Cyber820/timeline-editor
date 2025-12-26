// public/src/ui/info-dialog.js
// ✅ Usage / Roadmap / Feedback 三个弹窗
// ✅ 文本全部走 ui-text 字典：t('info....')
// ✅ feedback endpoint：优先读 globalThis.TIMELINE_FEEDBACK_ENDPOINT
// ✅ 提交附带 variantKey/region/lang/pageUrl，便于 Doc 中区分来源

import { HOW_TO_USE_TEXT, ROADMAP_TEXT } from '../_staging/info-content.js';
import { t } from '../ui-text/index.js';

const REQUIRE_ID = false; // 如坚持“个人ID必填”，改为 true

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

let dialogRoot = null;   // 纯文本信息弹窗（Usage / Roadmap）
let feedbackRoot = null; // 反馈弹窗

/* ---------------- 纯文本信息弹窗（Usage / Roadmap） ---------------- */

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
  backdrop.addEventListener('click', hide);
  btnClose.addEventListener('click', hide);

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

/* ---------------- 反馈与建议弹窗 ---------------- */

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
  const idLabel = REQUIRE_ID ? t('info.form.idLabel') : t('info.form.idLabelOptional');
  // 注：如果你暂时没有 idLabelOptional 这个 key，会回退到中文（或显示 key）
  // 你也可以直接在 zh/en 字典里补上。

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
        <h2 style="margin:0;font-size:1.05rem;font-weight:600;">${t('info.dialogs.feedbackTitle')}</h2>
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
          <label style="display:block;font-size:13px;color:#374151;margin-bottom:2px;">${escapeHtml(idLabel)}</label>
          <input id="fb-id" type="text" style="
            width:100%;box-sizing:border-box;
            border:1px solid #e5e7eb;border-radius:8px;
            padding:6px 8px;font-size:13px;
          " placeholder="${escapeHtml(t('info.form.idPlaceholder'))}">
        </div>

        <div class="fb-field">
          <label style="display:block;font-size:13px;color:#374151;margin-bottom:2px;">${escapeHtml(t('info.form.contactLabel'))}</label>
          <input id="fb-contact" type="text" style="
            width:100%;box-sizing:border-box;
            border:1px solid #e5e7eb;border-radius:8px;
            padding:6px 8px;font-size:13px;
          " placeholder="${escapeHtml(t('info.form.contactPlaceholder'))}">
        </div>

        <div class="fb-field">
          <label style="display:block;font-size:13px;color:#374151;margin-bottom:2px;">${escapeHtml(t('info.form.contentLabel'))}</label>
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
  backdrop.addEventListener('click', hide);
  btnClose.addEventListener('click', hide);
  btnCancel.addEventListener('click', hide);

  const btnSubmit = root.querySelector('.fb-btn-submit');
  const idInput = root.querySelector('#fb-id');
  const contactInput = root.querySelector('#fb-contact');
  const contentInput = root.querySelector('#fb-content');

  btnSubmit.addEventListener('click', async () => {
    const id = (idInput?.value || '').trim();
    const contact = (contactInput?.value || '').trim();
    const content = (contentInput?.value || '').trim();

    if (REQUIRE_ID && !id) {
      alert(t('info.form.idRequiredAlert'));
      idInput && idInput.focus();
      return;
    }
    if (!content) {
      alert(t('info.form.contentRequiredAlert'));
      contentInput && contentInput.focus();
      return;
    }

    const endpoint = resolveFeedbackEndpoint();
    if (!endpoint) {
      alert(t('info.form.endpointMissingAlert'));
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

/* ---------------- 对外接口：初始化三个按钮 ---------------- */

export function initInfoDialogs() {
  const btnHelp = document.getElementById('btn-help');
  const btnRoadmap = document.getElementById('btn-roadmap');
  const btnFeedback = document.getElementById('btn-feedback');

  if (btnHelp) {
    btnHelp.textContent = t('info.buttons.usage');
    btnHelp.addEventListener('click', () => {
      openInfoDialog(t('info.dialogs.usageTitle'), HOW_TO_USE_TEXT);
    });
  }

  if (btnRoadmap) {
    btnRoadmap.textContent = t('info.buttons.roadmap');
    btnRoadmap.addEventListener('click', () => {
      openInfoDialog(t('info.dialogs.roadmapTitle'), ROADMAP_TEXT);
    });
  }

  if (btnFeedback) {
    btnFeedback.textContent = t('info.buttons.feedback');
    btnFeedback.addEventListener('click', () => {
      openFeedbackDialog();
    });
  }
}

/* ---------------- util ---------------- */

function escapeHtml(s) {
  // 防止 intro 文案里出现 < > 被当成 html（尤其未来你可能把 intro 改成含符号）
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
