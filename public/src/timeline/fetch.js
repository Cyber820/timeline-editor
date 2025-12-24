// public/src/timeline/fetch.js
// ✅ 职责：从当前页面配置的 endpoint 拉取事件数据，并做最小规范化（含从 hover 文本解析结构化字段）
// ✅ endpoint 读取顺序：TIMELINE_ENDPOINT（推荐） > ENDPOINT（兼容旧逻辑） > fallback（仅兜底）

function getEndpoint() {
  const ep = globalThis.TIMELINE_ENDPOINT || globalThis.ENDPOINT || null;
  return (
    ep ||
    'https://script.google.com/macros/s/AKfycbzap5kVZa7uqJRE47b-Bt5C4OmjnMhX-vIaOtRiSQko2eLcDe9zl3oc4U_Q66Uwkjex/exec'
  );
}

function normalizeTags(tagVal) {
  if (!tagVal && tagVal !== 0) return [];
  if (Array.isArray(tagVal)) return tagVal.filter(Boolean);
  return String(tagVal)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function ensureId(ev, i) {
  if (ev?.id) return ev.id;
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `auto-${Date.now()}-${i}`;
}

// ✅ 从 world-en 当前后端返回的 title(blob) 里解析结构化字段（字段名为中文）
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

function toPlain(x) {
  return x == null ? '' : String(x).replace(/<[^>]*>/g, '').trim();
}

/**
 * parseBlobFieldsCN
 * 输入示例（ev.title）：
 * 事件名称：xxx\n事件类型：社会事件\n时间：1950-08-25\n地区：加拿大\n...
 */
function parseBlobFieldsCN(blob) {
  const s = toPlain(blob);
  const out = {};
  if (!s) return out;

  const escaped = FIELD_LABELS_CN.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const lookahead = '(?=\\s*(?:' + escaped.join('|') + ')\\s*[:：]|$)';

  for (const label of FIELD_LABELS_CN) {
    const re = new RegExp(label + '\\s*[:：]\\s*([\\s\\S]*?)' + lookahead, 'i');
    const m = re.exec(s);
    if (m) out[label] = m[1].replace(/\\n/g, '\n').trim();
  }
  return out;
}

export async function fetchAndNormalize() {
  const ENDPOINT = getEndpoint();

  const res = await fetch(ENDPOINT, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const list = Array.isArray(data) ? data : [];

  return list.map((ev, i) => {
    // 后端常见字段
    const content = ev.content ?? ev.Title ?? ev.title ?? '';
    const start = ev.start ?? ev.Start ?? '';
    const end = ev.end ?? ev.End ?? '';
    const hoverBlob = ev.title ?? ev.Description ?? ev.description ?? '';

    // ✅ 从 hover 文本解析结构化字段（world-en 当前就是把属性塞在这里）
    const parsed = parseBlobFieldsCN(hoverBlob);

    // Importance：优先用后端字段，其次用解析结果
    const importanceRaw = ev.Importance ?? ev.importance ?? parsed['重要性'] ?? '';
    const Importance = importanceRaw === '' ? '' : String(importanceRaw).trim(); // 统一成字符串，便于过滤

    // 结构化字段：优先后端显式字段，其次用解析结果
    const EventType = ev.EventType ?? parsed['事件类型'] ?? '';
    const Region = ev.Region ?? parsed['地区'] ?? '';
    const Platform = ev.Platform ?? parsed['平台类型'] ?? '';
    const ConsolePlatform = ev.ConsolePlatform ?? parsed['主机类型'] ?? '';
    const Company = ev.Company ?? parsed['公司'] ?? '';
    const Contributor = ev.Contributor ?? ev.Submitter ?? parsed['贡献者'] ?? '';

    // Tag：优先后端 Tag，其次解析出来的“标签”
    const Tag = normalizeTags(ev.Tag ?? parsed['标签'] ?? '');

    // Description：尽量只取“描述”字段，而不是整坨 blob
    const Description = ev.Description ?? ev.description ?? parsed['描述'] ?? '';

    return {
      id: ensureId(ev, i),

      // mount.js normalizeEvent() 会读这些
      Title: content,
      Start: start,
      End: end || '',
      Description,

      // 过滤/样式所需字段（✅ 现在能“抓到属性”了）
      EventType,
      Region,
      Platform,
      ConsolePlatform,
      Company,
      Tag,
      Contributor,
      Importance,

      __raw: ev,
    };
  });
}
