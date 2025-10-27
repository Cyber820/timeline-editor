// src/timeline/fetch.js
export async function fetchAndNormalize() {
  const ENDPOINT =
    'https://script.google.com/macros/s/AKfycbxe-P-iT8Jv8xSNTqdYB7SMi4sy2pPl8lLZ2EWqaXsP-jz6nfsxdJ1a0lzNSGB-e_1U/exec';
  const res = await fetch(ENDPOINT);
  const data = await res.json();

  // 确保日期可解析
  return data.map(ev => ({
    id: ev.id || crypto.randomUUID(),
    content: ev.Title || ev.title || '(未命名事件)',
    start: ev.Start || ev.start || '',
    end: ev.End || ev.end || undefined,
    title: ev.Description || ev.description || '',
    EventType: ev.EventType,
    Region: ev.Region,
    Platform: ev.Platform,
    Company: ev.Company,
    ConsolePlatform: ev.ConsolePlatform,
    Tag: Array.isArray(ev.Tag)
      ? ev.Tag
      : String(ev.Tag || '').split(',').map(s => s.trim()).filter(Boolean)
  }));
}
