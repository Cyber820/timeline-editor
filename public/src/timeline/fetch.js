// public/src/timeline/fetch.js
// =============================================================================
// Fetch & Normalize (Data Ingress)
// =============================================================================
// 职责：
// - 从当前页面配置的 endpoint 拉取事件数据
// - 将后端返回的“松散结构”最小规范化为前端统一结构（供 mount.js 使用）
// - 支持从 hover/title/blob 文本中解析出结构化字段（兼容“把字段塞在 title 里”的旧/临时后端）
//
// Endpoint 读取顺序：
// 1) globalThis.TIMELINE_ENDPOINT   (推荐：页面/variant 注入)
// 2) globalThis.ENDPOINT            (兼容旧逻辑)
// 3) FALLBACK_ENDPOINT              (仅兜底，不建议长期依赖)
//
// 输出契约（返回数组，每项至少包含）：
// - id, Title, Start, End, Description
// - EventType, Region, Platform, ConsolePlatform, Company, Tag, Contributor, Importance
// - __raw（保留原始对象，便于 debug/迁移）
//
// GENERALIZATION（产品化方向）：
// - 若未来时间轴列结构可变，应将“字段映射规则”外置为 schema：
//   { titleKey, startKey, endKey, fields: [{outKey, sources:[...], parseLabel?...}] }。
//   当前文件已把关键决策点集中，后续下沉比较容易。
// =============================================================================

/**
 * 推荐：你可以把默认兜底 endpoint 收敛到一个配置文件/variant.js 中，
 * 这里仅作为最终 fallback，避免页面忘记配置时直接崩溃。
 */
const FALLBACK_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbzap5kVZa7uqJRE47b-Bt5C4OmjnMhX-vIaOtRiSQko2eLcDe9zl3oc4U_Q66Uwkjex/exec';

/**
 * getEndpoint()
 * - 读取顺序：TIMELINE_ENDPOINT > ENDPOINT > FALLBACK_ENDPOINT
 */
function getEndpoint() {
  const ep = globalThis.TIMELINE_ENDPOINT || globalThis.ENDPOINT || null;
  return ep || FALLBACK_ENDPOINT;
}

/**
 * normalizeTags()
 * - 支持：数组 / 逗号分隔字符串 / 空值
 * - 输出：去空、trim 后的 string[]
 */
function normalizeTags(tagVal) {
  if (!tagVal && tagVal !== 0) return [];
  if (Array.isArray(tagVal)) return tagVal.filter(Boolean).map((x) => String(x).trim()).filter(Boolean);
  return String(tagVal)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * ensureId()
 * - 优先使用后端 id
 * - 次优先：crypto.randomUUID（若存在）
 * - 兜底：auto-<time>-<i>-<rand>（避免 Date.now+i 过于容易撞）
 */
function ensureId(ev, i) {
  if (ev?.id) return ev.id;

  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}

  const rand = Math.random().toString(36).slice(2, 8);
  return `auto-${Date.now()}-${i}-${rand}`;
}

/**
 * toPlain()
 * - 去掉 HTML tag，避免 hover/blob 中包含富文本时影响解析
 */
function toPlain(x) {
  return x == null ? '' : String(x).replace(/<[^>]*>/g, '').trim();
}

/* =============================================================================
 * Hover/Blob 文本解析（兼容：字段被塞进 title/hover 文本）
 * =============================================================================
 * 你当前 world-en 的后端返回习惯是：ev.title / ev.Description 里是一坨“字段：值”的文本。
 * 这不是理想结构，但作为过渡期策略可用。
 *
 * 为了未来泛化，本文件做了两套 label：中文标签/英文标签（可扩展）。
 * 如果你未来确认后端会直接返回结构化字段，这块可以逐步退场。
 */

// 常用中文标签（你当前表格字段标签就是这些）
const FIELD_LABELS_CN = [
  '事件名称',
  '事件类型',
  '时间',
  '状态',
  '地区',
  '平台类型',
  '主机类型',
  '公司',
  '标签',
  '重要性',
  '描述',
  '贡献者',
];

// 可选：英文标签（如果未来某些后端输出英文 blob，可以启用）
// 注意：这里只是“解析标签”，不代表最终字段名；最终字段仍用统一的 EventType/Region 等。
const FIELD_LABELS_EN = [
  'Event Name',
  'Event Type',
  'Time',
  'Status',
  'Region',
  'Platform',
  'Console Platform',
  'Company',
  'Tags',
  'Importance',
  'Description',
  'Contributor',
];

/**
 * parseBlobFields()
 * - 输入：blob 文本（可能含多段字段）
// - 输出：{ [label]: value } 的字典
 *
 * 解析规则：
 * - 支持 “字段: 值” 或 “字段：值”
 * - value 允许跨多行，直到遇到下一个已知字段标签或文本结束
 */
function parseBlobFields(blob, labels) {
  const s = toPlain(blob);
  const out = {};
  if (!s) return out;

  const escaped = (labels || []).map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escaped.length) return out;

  const lookahead = '(?=\\s*(?:' + escaped.join('|') + ')\\s*[:：]|$)';

  for (const label of labels) {
    const re = new RegExp(label + '\\s*[:：]\\s*([\\s\\S]*?)' + lookahead, 'i');
    const m = re.exec(s);
    if (m) out[label] = m[1].replace(/\\n/g, '\n').trim();
  }
  return out;
}

/**
 * pickLabelsForBlob()
 * - 如果 blob 中明显包含中文标签（例如“事件名称：”），优先按中文解析
 * - 否则尝试英文解析
 *
 * 说明：这是启发式策略，不完美，但对“同一套后端可能返回不同语言 blob”的过渡期很实用。
 */
function pickLabelsForBlob(blob) {
  const s = toPlain(blob);
  if (!s) return FIELD_LABELS_CN;

  // 出现“事件名称/事件类型/重要性”等任意一项，认为是中文 blob
  if (/(事件名称|事件类型|重要性|平台类型|主机类型)\s*[:：]/.test(s)) return FIELD_LABELS_CN;

  // 否则用英文
  return FIELD_LABELS_EN;
}

/* =============================================================================
 * 核心：fetchAndNormalize()
 * ============================================================================= */

/**
 * fetchAndNormalize()
 * 返回：规范化后的 event[]（供 mount.js 直接消费）
 *
 * 输入兼容来源（后端常见字段）：
 * - title/content/Title（事件名）
 * - start/Start（开始时间）
 * - end/End（结束时间）
 * - Description/description（描述 or hover blob）
 * - 以及可选的 EventType/Region/... 等结构化字段
 *
 * 输出字段：
 * - Title/Start/End/Description：给 mount.js.normalizeEvent() 使用
 * - EventType/Region/Platform/...：给过滤与样式系统使用
 */
export async function fetchAndNormalize() {
  const ENDPOINT = getEndpoint();

  let res;
  try {
    res = await fetch(ENDPOINT, { method: 'GET' });
  } catch (e) {
    // 网络层错误（断网、DNS、被拦截等）
    throw new Error(`fetch failed: network error (${String(e?.message || e)})`);
  }

  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    // 返回不是 JSON（或被代理/错误页替换）
    throw new Error(`fetch failed: invalid JSON (${String(e?.message || e)})`);
  }

  const list = Array.isArray(data) ? data : [];
  if (!Array.isArray(data)) {
    // 防御性：如果后端未来改成 {items:[...]}，这里能尽早暴露问题
    // 你也可以在这里加一层兼容：data.items
  }

  return list.map((ev, i) => {
    // ---------------- 事件名/时间等“主字段” ----------------
    // content（兼容：后端可能用 content/Title/title）
    const content = ev.content ?? ev.Title ?? ev.title ?? '';

    // start/end（兼容：后端可能用 start/Start/end/End）
    const start = ev.start ?? ev.Start ?? '';
    const end = ev.end ?? ev.End ?? '';

    // hoverBlob：用于解析“字段：值”结构（优先 title，其次 Description）
    const hoverBlob = ev.title ?? ev.Description ?? ev.description ?? '';

    // ---------------- 解析 blob 为结构化字段（可选） ----------------
    // 你目前 world-en 的后端把结构塞在这里，解析标签可能是中文或英文
    const labels = pickLabelsForBlob(hoverBlob);
    const parsed = parseBlobFields(hoverBlob, labels);

    // ---------------- Importance（统一为 string，便于过滤） ----------------
    // 优先：后端显式字段，其次：解析结果
    // 注意：解析 label 可能是中文“重要性”或英文“Importance”
    const importanceFromParsed = parsed['重要性'] ?? parsed['Importance'] ?? '';
    const importanceRaw = ev.Importance ?? ev.importance ?? importanceFromParsed ?? '';
    const Importance = importanceRaw === '' ? '' : String(importanceRaw).trim();

    // ---------------- 结构化字段（过滤/样式依赖） ----------------
    // 优先：后端显式字段，其次：解析结果（同样兼容中英文 label）
    const EventType =
      ev.EventType ??
      parsed['事件类型'] ??
      parsed['Event Type'] ??
      '';

    const Region =
      ev.Region ??
      parsed['地区'] ??
      parsed['Region'] ??
      '';

    const Platform =
      ev.Platform ??
      parsed['平台类型'] ??
      parsed['Platform'] ??
      '';

    const ConsolePlatform =
      ev.ConsolePlatform ??
      parsed['主机类型'] ??
      parsed['Console Platform'] ??
      '';

    const Company =
      ev.Company ??
      parsed['公司'] ??
      parsed['Company'] ??
      '';

    const Contributor =
      ev.Contributor ??
      ev.Submitter ??
      parsed['贡献者'] ??
      parsed['Contributor'] ??
      '';

    // ---------------- Tag（统一为 string[]） ----------------
    // label 可能是 “标签” 或 “Tags”
    const tagFromParsed = parsed['标签'] ?? parsed['Tags'] ?? '';
    const Tag = normalizeTags(ev.Tag ?? tagFromParsed ?? '');

    // ---------------- Description（尽量取“描述字段”，避免整坨 blob） ----------------
    // label 可能是 “描述” 或 “Description”
    const descFromParsed = parsed['描述'] ?? parsed['Description'] ?? '';
    const Description = ev.Description ?? ev.description ?? descFromParsed ?? '';

    // ---------------- 规范化输出（保持与 mount.js 契约一致） ----------------
    return {
      id: ensureId(ev, i),

      // mount.js.normalizeEvent() 会优先读 Title/Start/End/Description
      Title: content,
      Start: start,
      End: end || '',
      Description,

      // 过滤/样式所需字段
      EventType,
      Region,
      Platform,
      ConsolePlatform,
      Company,
      Tag,
      Contributor,
      Importance,

      // 保留原始对象：便于 debug、迁移、后续字段扩展
      __raw: ev,
    };
  });
}
