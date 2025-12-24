// public/src/timeline/fetch.js
// ✅ 职责：从当前页面配置的 endpoint 拉取事件数据，并做最小规范化
// ✅ endpoint 读取顺序：TIMELINE_ENDPOINT（推荐） > ENDPOINT（兼容旧逻辑） > fallback（仅兜底）

function getEndpoint() {
  const ep =
    globalThis.TIMELINE_ENDPOINT ||
    globalThis.ENDPOINT ||
    null;

  // ⚠️ 最终兜底：防止“完全没注入 endpoint”时页面直接不可用（开发期友好）
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

export async function fetchAndNormalize() {
  const ENDPOINT = getEndpoint();

  const res = await fetch(ENDPOINT, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const list = Array.isArray(data) ? data : [];

  // ✅ 注意：这里返回的字段尽量贴近后端原字段名，
  // 以保证你当前 mount.js 的 normalizeEvent() 逻辑不需要改动。
  return list.map((ev, i) => ({
    id: ensureId(ev, i),

    Title: ev.Title ?? ev.title ?? '',
    Start: ev.Start ?? ev.start ?? '',
    End: ev.End ?? ev.end ?? '',
    Description: ev.Description ?? ev.description ?? '',

    EventType: ev.EventType ?? '',
    Region: ev.Region ?? '',
    Platform: ev.Platform ?? '',
    Company: ev.Company ?? '',
    ConsolePlatform: ev.ConsolePlatform ?? '',
    Tag: normalizeTags(ev.Tag),

    // 可选：保留原始对象，方便排查字段问题
    __raw: ev,
  }));
}
