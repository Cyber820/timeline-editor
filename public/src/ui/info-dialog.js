// public/src/ui/info-dialog.js
// =============================================================================
// Info Dialogs
// =============================================================================
// 职责：
// - 管理三个弹窗：Usage / Roadmap / Feedback
// - Usage/Roadmap 的正文通过 getInfoText(kind) 按 variantKey 动态取（见 _staging/info-contents.js）
// - Feedback 提交到后端 endpoint（优先 globalThis.TIMELINE_FEEDBACK_ENDPOINT），并附带 variant 元信息
//
// 设计要点：
// - 纯文本弹窗（Usage/Roadmap）：复用一个 dialogRoot，展示 <pre> 文本
// - 反馈弹窗：独立 feedbackRoot，提交用 URLSearchParams（表单编码）
// - i18n：按钮标题与表单文案走 ui-text：t('info....')
//
// 可泛化点（产品化思路）：
// - 若未来把“反馈”改成可配置字段（例如不同时间轴产品收集不同字段），
//   建议将 form schema 下沉为 JSON 配置，当前文件只做渲染与提交。
// =============================================================================

import { getInfoText } from '../_staging/info-content.js';
import { t } from '../ui-text/index.js';

/**
 * REQUIRE_ID
 * - false：个人 ID 可选（当前建议）
// - true：强制个人 ID 必填
 */
const REQUIRE_ID = false;

/**
 * LEGACY_FALLBACK_ENDPOINT
 * - 当未设置 TIMELINE_FEEDBACK_ENDPOINT 且 __variant.endpoints.feedback 也不存在时使用
 * - 建议：生产环境尽量通过 TIMELINE_FEEDBACK_ENDPOINT 或 __variant.endpoints.feedback 显式指定
 */
const LEGACY_FALLBACK_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbwOFJP5nRI_zwU2fuY1uelyfvEYV8VeKMJbYRDWNHKG1RgurzZvwViw1ewFKpB6Td7-/exec';

/**
 * resolveFeedbackEndpoint()
 * 反馈端点选择优先级：
 * 1) globalThis.TIMELINE_FEEDBACK_ENDPOINT（页面级配置 / 环境变量注入）
 * 2) globalThis.__variant.endpoints.feedback（variant 驱动配置）
 * 3) LEGACY_FALLBACK_ENDPOINT（兜底，不建议长期依赖）
 */
function resolveFeedbackEndpoint() {
  const ep1 = globalThis.TIMELINE_FEEDBACK_ENDPOINT;
  if (ep1) return ep1;

  const ep2 = globalThis.__variant?.endpoints?.feedback;
  if (ep2) return ep2;

  return LEGACY_FALLBACK_ENDPOINT;
}

/**
 * getVariantMeta()
 * 用于给反馈提交附加来源信息，便于你在后端/Doc 里按来源区分。
 *
 * 返回：
 * - key：优先 __variant.key，否则 region-lang 拼接
 * - region/lang：优先 __variant.region/lang，否则读取 TIMELINE_REGION/TIMELINE_LANG
 *
 * 注意：
 * - 这里不做 lower/trim，因为你后端可能希望保留原始大小写；如需统一，可在后端处理。
 */
function getVariantMeta() {
  const v = globalThis.__variant || {};
  const region = v.region || globalThis.TIMELINE_REGION || '';
  const lang = v.lang || globalThis.TIMELINE_LANG || '';
  const key = v.key || (region && lang ? `${String(region)}-${String(lang)}` : '');
  return { key, region, lang };
}

/**
 * 缓存根节点
 * - dialogRoot：Usage/Roadmap 共用
 * - feedbackRoot：Feedback 独立
 *
 * 原则：只创建一次 DOM（lazy init），后续只切换 display 并更新内容。
 */
let dialogRoot = null;
let feedbackRoot = null;

/* =============================================================================
 * 纯文本信息弹窗（Usage / Roadmap）
 * ============================================================================= */

/**
 * ensureDialogRoot()
 * 创建并挂载纯文本弹窗根节点，包含：
 * - backdrop（点击关闭）
 * - panel（title + close button + body）
 */
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

  // 注意：这里 title 的 “Close” 未来也可以走 t()，但并非关键 UI。
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

  // 点击遮罩关闭；点击 × 关闭
  backdrop.addEventListener('click', hide);
  btnClose.addEventListener('click', hide);

  dialogRoot = root;
  return root;
}

/**
 * openInfoDialog(title, text)
 * - title：弹窗标题（走 t()）
 * - text：纯文本内容（通过 <pre> 渲染）
 *
 * 安全性：
 * - 使用 pre.textContent，避免任何注入问题（即使文本里出现 <script> 也不会执行）
 */
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

/**
 * ensureFeedbackRoot()
 * 创建并挂载反馈弹窗根节点，包含：
 * - intro 文案（可包含符号，需要 escapeHtml 防注入）
 * - ID（可选/必填取决于 REQUIRE_ID）
 * - 联系方式
 * - 反馈内容
 * - Submit/Cancel
 *
 * 注意：
 * - 提交使用 fetch + mode:no-cors：这意味着你无法读取响应内容/状态码，
 *   只能认为“请求已发出”。这符合你当前 Apps Script Web App 的典型用法。
 * - 若未来你想显示更准确的成功/失败提示，建议后端支持 CORS 并返回 JSON。
 */
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

  // ID 标题根据 REQUIRE_ID 切换（必填/选填）
  const idLabel = REQUIRE_ID ? t('info.form.idLabel') : t('info.form.idLabelOptional');

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

  // 关闭行为：backdrop、×、cancel 都关闭
  const backdrop = root.querySelector('.fb-dialog-backdrop');
  const btnClose = root.querySelector('.fb-dialog-close');
  const btnCancel = root.querySelector('.fb-btn-cancel');

  const hide = () => (root.style.display = 'none');

  backdrop.addEventListener('click', hide);
  btnClose.addEventListener('click', hide);
  btnCancel.addEventListener('click', hide);

  // 提交行为
  const btnSubmit = root.querySelector('.fb-btn-submit');
  const idInput = root.querySelector('#fb-id');
  const contactInput = root.querySelector('#fb-contact');
  const contentInput = root.querySelector('#fb-content');

  btnSubmit.addEventListener('click', async () => {
    // 读取输入值（trim 规整）
    const id = (idInput?.value || '').trim();
    const contact = (contactInput?.value || '').trim();
    const content = (contentInput?.value || '').trim();

    // 表单校验
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

    // endpoint
    const endpoint = resolveFeedbackEndpoint();
    if (!endpoint) {
      // 理论上不会发生（因为有 legacy 兜底），但保留防御性提示
      alert(t('info.form.endpointMissingAlert'));
      return;
    }

    // variant meta（用于后端区分来源）
    const { key: variantKey, region, lang } = getVariantMeta();

    // 提交 payload（application/x-www-form-urlencoded）
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
      // 注意：no-cors 下无法读取 response.ok/状态码/内容
      await fetch(endpoint, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: payload.toString(),
      });

      // UX：认为请求已发送成功（典型 Apps Script WebApp 方案）
      alert(t('info.form.okToast'));

      // 清空输入
      if (idInput) idInput.value = '';
      if (contactInput) contactInput.value = '';
      if (contentInput) contentInput.value = '';

      hide();
    } catch (err) {
      // 只有网络层/浏览器层异常才会进入 catch（no-cors 的服务端失败并不一定触发）
      console.error('feedback submit failed:', err);
      alert(t('info.form.failToast'));
    }
  });

  feedbackRoot = root;
  return root;
}

/**
 * openFeedbackDialog()
 * 打开反馈弹窗并聚焦内容输入框（轻微延迟，确保 DOM 已渲染）
 */
function openFeedbackDialog() {
  const root = ensureFeedbackRoot();
  root.style.display = 'flex';
  const contentInput = root.querySelector('#fb-content');
  if (contentInput) setTimeout(() => contentInput.focus(), 20);
}

/* =============================================================================
 * 对外接口：初始化三个按钮
 * =============================================================================
 * 约定：
 * - 页面中存在三个按钮：
 *   #btn-help     -> Usage
 *   #btn-roadmap  -> Roadmap
 *   #btn-feedback -> Feedback
 *
 * 注意：
 * - Usage/Roadmap 的正文通过 getInfoText(kind) 动态取值，
 *   因此切换 variant（若你未来做运行时切换）也能拿到最新文本。
 */
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

/* =============================================================================
 * util
 * ============================================================================= */

/**
 * escapeHtml(s)
 * 用途：
 * - 防止 intro 文案/label 文案中出现 < > & 等字符时，被 innerHTML 当成 HTML 解析
 *
 * 说明：
 * - Usage/Roadmap 正文不需要 escape，因为它用 textContent 写入 <pre>。
 * - 反馈弹窗的标题/intro/labels 用 innerHTML 模板拼接，因此需要 escape。
 */
function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
