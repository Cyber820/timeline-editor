// public/src/ui/info-dialog.js
// 作用：创建“使用方法 / 开发计划 / 反馈与建议”三个信息弹窗按钮。
// - 使用方法 / 开发计划：使用 _staging/info-content.js 里的纯文本
// - 反馈与建议：前端表单（个人 ID / 联系方式 / 反馈内容），通过 Apps Script Web App 写入 Google Doc
//
// ✅ 多入口 variant 支持：
// 1) feedback endpoint 不再硬编码：优先读 globalThis.TIMELINE_FEEDBACK_ENDPOINT
// 2) 提交时附带 variantKey/region/lang/pageUrl，便于在同一 Google Doc 中区分来源
// 3) 个人 ID 默认改为“选填”（可通过 REQUIRE_ID 开关恢复必填）
//
// ✅ UI 文案国际化：
// - 优先使用 ui-text 的 t(key, params)
// - 若 t 不存在或 key 未命中：回退到中文默认文案（保证不阻塞运行）

import { HOW_TO_USE_TEXT, ROADMAP_TEXT } from '../_staging/info-content.js';

// ✅ NEW: ui-text
import { t as _t } from '../ui-text/index.js';

const REQUIRE_ID = false; // 如你坚持“个人ID必填”，改为 true

// 旧地址保留为兜底（避免你一时没把 variant.js 填好 feedback endpoint 就全挂）
const LEGACY_FALLBACK_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbwOFJP5nRI_zwU2fuY1uelyfvEYV8VeKMJbYRDWNHKG1RgurzZvwViw1ewFKpB6Td7-/exec';

// ---------- i18n / ui-text helpers ----------

function t(key, params) {
  // 若 ui-text 还没接好或 key 缺失，则回退到默认中文
  try {
    const out = typeof _t === 'function' ? _t(key, params) : '';
    if (out != null && String(out).trim() !== '' && out !== key) return out;
  } catch {}
  return fallbackCN(key, params);
}

function fallbackCN(key, params = {}) {
  // 仅用于 key 缺失时不阻塞运行；你后续补齐字典后，这些回退不会再被用到。
  const CN = {
    // info dialog
    'info.title.usage': '使用方法',
    'info.title.roadmap': '开发计划和反馈',
    'common.close': '关闭',
    'common.title.placeholder': '标题',

    // feedback dialog
    'fb.title': '反馈与建议',
    'fb.desc.1': '如果你在时间轴中发现了错误、遗漏，或者有补充的资料与建议，欢迎在这里填写。',
    'fb.desc.2': '个人 ID 可以是你的昵称、常用 ID，方便后续在版本日志中致谢。',
    'fb.label.id': `个人 ID（${params.required ? '必填' : '选填'}）`,
    'fb.label.contact': '联系方式（选填）',
    'fb.label.content': '反馈内容（必填）',

    'fb.placeholder.id': '昵称 / 常用ID（可留空）',
    'fb.placeholder.contact': '邮箱 / QQ / 社交账号（可留空）',
    'fb.placeholder.content': '请描述你想反馈的问题、建议或补充信息',

    'fb.btn.submit': '提交',
    'fb.btn.cancel': '取消',

    'fb.alert.requireId': '请填写“个人 ID”（可以是昵称、编号等）。',
    'fb.alert.requireContent': '请填写反馈内容。',
    'fb.alert.missingEndpoint': '反馈接口未配置（FEEDBACK_ENDPOINT 缺失）。',
    'fb.alert.success': '感谢你的反馈！信息已经发送到维护者的反馈文档。',
    'fb.alert.failed': '提交时出现了一些问题，可以稍后再试，或通过其他方式联系维护者。',

    // picker dialog
    'attr.picker.title': '选择属性值',
    'common.ok': '确定',
    'common.cancel': '取消',
    'common.empty': '（未选择）',
    'common.occupied': '（已被占用）',
  };
  const raw = CN[key];
  if (raw == null) return key;
  return String(raw);
}

// ---------- endpoint / variant helpers ----------

function resolveFeedbackEndpoint() {
  // ✅ 推荐：由 app.js 根据 variant 写入
  const ep1 = globalThis.TIMELINE_FEEDBACK_ENDPOINT;
  if (ep1) return ep1;

  // ✅ 次优：如果你有暴露 window.__variant
  const ep2 = globalThis.__variant?.endpoints?.feedback;
  if (ep2) return ep2;

  // ✅ 兜底：老地址
  return LEGACY_FALLBACK_ENDPOINT;
}

function getVariantMeta() {
  const v = globalThis.__variant || {};
  // 兼容你现在的 region/lang 注入方式
  const region = v.region || globalThis.TIMELINE_REGION || '';
  const lang = v.lang || globalThis.TIMELINE_LANG || '';
  const key = v.key || (region && lang ? `${String(region)}-${String(lang)}` : '');
  return { key, region, lang };
}

let dialogRoot = null; // 纯文本信息弹窗（使用方法 / 开发计划）
let feedbackRoot = null; // 反馈与建议弹窗

/* ---------------- 纯文本信息弹窗（使用方法 / 开发计划） ---------------- */

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
        <h2 id="info-dialog-title" style="margin:0;font-size:1.05rem;font-weight:600;">${t(
          'common.title.placeholder',
        )}</h2>
        <button id="info-dialog-close" title="${t('common.close')}" style="
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
  const hide = () => {
    root.style.display = 'none';
  };
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
        <h2 style="margin:0;font-size:1.05rem;font-weight:600;">${t('fb.title')}</h2>
        <button class="fb-dialog-close" title="${t('common.close')}" style="
          border:none;background:transparent;
          font-size:20px;cursor:pointer;
        ">×</button>
      </div>

      <div style="font-size:13px;color:#4b5563;margin-bottom:4px;line-height:1.6;">
        ${t('fb.desc.1')}<br>
        ${t('fb.desc.2')}
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;overflow:auto;padding-right:2px;">
        <div class="fb-field">
          <label style="display:block;font-size:13px;color:#374151;margin-bottom:2px;">
            ${t('fb.label.id', { required: REQUIRE_ID })}
          </label>
          <input id="fb-id" type="text" style="
            width:100%;box-sizing:border-box;
            border:1px solid #e5e7eb;border-radius:8px;
            padding:6px 8px;font-size:13px;
          " placeholder="${t('fb.placeholder.id')}">
        </div>

        <div class="fb-field">
          <label style="display:block;font-size:13px;color:#374151;margin-bottom:2px;">
            ${t('fb.label.contact')}
          </label>
          <input id="fb-contact" type="text" style="
            width:100%;box-sizing:border-box;
            border:1px solid #e5e7eb;border-radius:8px;
            padding:6px 8px;font-size:13px;
          " placeholder="${t('fb.placeholder.contact')}">
        </div>

        <div class="fb-field">
          <label style="display:block;font-size:13px;color:#374151;margin-bottom:2px;">
            ${t('fb.label.content')}
          </label>
          <textarea id="fb-content" rows="4" style="
            width:100%;box-sizing:border-box;
            border:1px solid #e5e7eb;border-radius:8px;
            padding:6px 8px;font-size:13px;
            resize:vertical;min-height:80px;
          " placeholder="${t('fb.placeholder.content')}"></textarea>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px;">
        <button type="button" class="fb-btn-submit" style="
          padding:6px 12px;border-radius:8px;
          border:1px solid #111827;background:#111827;
          color:#fff;cursor:pointer;font-size:13px;
        ">${t('fb.btn.submit')}</button>

        <button type="button" class="fb-btn-cancel" style="
          padding:6px 12px;border-radius:8px;
          border:1px solid #d1d5db;background:#fff;
          cursor:pointer;font-size:13px;
        ">${t('fb.btn.cancel')}</button>
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

  btnSubmit.addEventListener('click', async () => {
    const id = (idInput?.value || '').trim();
    const contact = (contactInput?.value || '').trim();
    const content = (contentInput?.value || '').trim();

    if (REQUIRE_ID && !id) {
      alert(t('fb.alert.requireId'));
      idInput && idInput.focus();
      return;
    }
    if (!content) {
      alert(t('fb.alert.requireContent'));
      contentInput && contentInput.focus();
      return;
    }

    const endpoint = resolveFeedbackEndpoint();
    if (!endpoint) {
      alert(t('fb.alert.missingEndpoint'));
      return;
    }

    const { key: variantKey, region, lang } = getVariantMeta();

    // ✅ 保持兼容旧后端：仍然发 id/contact/content
    // ✅ 新增字段：variantKey/region/lang/pageUrl
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

      alert(t('fb.alert.success'));

      if (idInput) idInput.value = '';
      if (contactInput) contactInput.value = '';
      if (contentInput) contentInput.value = '';

      hide();
    } catch (err) {
      console.error('反馈提交失败：', err);
      alert(t('fb.alert.failed'));
    }
  });

  feedbackRoot = root;
  return root;
}

function openFeedbackDialog() {
  const root = ensureFeedbackRoot();
  root.style.display = 'flex';

  // 默认聚焦到内容输入框（更符合“反馈”场景）
  const contentInput = root.querySelector('#fb-content');
  if (contentInput) setTimeout(() => contentInput.focus(), 20);
}

/* ---------------- 对外接口：初始化三个按钮 ---------------- */

export function initInfoDialogs() {
  // 按钮 id：btn-help / btn-roadmap / btn-feedback
  const btnHelp = document.getElementById('btn-help');
  const btnRoadmap = document.getElementById('btn-roadmap');
  const btnFeedback = document.getElementById('btn-feedback');

  if (btnHelp) {
    btnHelp.addEventListener('click', () => {
      openInfoDialog(t('info.title.usage'), HOW_TO_USE_TEXT);
    });
  }
  if (btnRoadmap) {
    btnRoadmap.addEventListener('click', () => {
      openInfoDialog(t('info.title.roadmap'), ROADMAP_TEXT);
    });
  }
  if (btnFeedback) {
    btnFeedback.addEventListener('click', () => {
      openFeedbackDialog();
    });
  }
}
