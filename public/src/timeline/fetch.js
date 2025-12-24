// public/src/timeline/fetch.js
// ✅ 职责：从当前页面配置的 endpoint 拉取事件数据，并做最小规范化
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

export async function fetchAndNormalize() {
  const ENDPOINT = getEndpoint();

  const res = await fetch(ENDPOINT, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const list = Array.isArray(data) ? data : [];

  return list.map((ev, i) => {
    // ✅ 兼容你当前 Apps Script 返回的字段（content/start/title/Importance）
    const content = ev.content ?? ev.Title ?? ev.title ?? '';
    const start = ev.start ?? ev.Start ?? '';
    const end = ev.end ?? ev.End ?? '';
    const hover = ev.title ?? ev.Description ?? ev.description ?? '';

    // ✅ 关键：Importance 必须透传，否则 mount.js 默认过滤会把全部过滤掉
    const importance = ev.Importance ?? ev.importance ?? '';

    return {
      id: ensureId(ev, i),

      // mount.js normalizeEvent() 会优先读这些“标准字段名”
      Title: content,                // 让事件标题显示为事件名，而不是整段 hover 文本
      Start: start,
      End: end || '',
      Description: hover,

      // 透传过滤/样式可能用到的字段
      Importance: importance,

      // Tag：若后端给的是字符串/数组都兼容
      Tag: normalizeTags(ev.Tag),

      __raw: ev,
    };
  });
}
