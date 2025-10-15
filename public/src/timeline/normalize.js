// 将“表单/接口行”规范化为 vis item（只做展示，不含样式绑定）
import { toISO } from '../utils/data.js';
import { escapeHtml } from '../utils/dom.js';

export function normalizeItem(row, idx) {
  if (!row) return null;
  if (row.start && row.content) return row; // 已是 vis 结构

  // 固定字段读取（不依赖 FIELD）
  const id = row.id || row.ID || idx + 1;
  const title = row.Title || row.title || row.name || `事件 ${id}`;
  const start = row.Start || row.start;
  const end   = row.End || row.end;
  const company = row.Company || row.company || '';
  const region  = row.Region || row.region || '';
  const platform = row.Platform || row.platform || '';
  const consolePlatform = row.ConsolePlatform || row.consolePlatform || '';
  const eventType = row.EventType || row.eventType || '';
  const desc = row.Description || row.description || '';

  const metaLine = [eventType, company, region, platform || consolePlatform]
    .filter(Boolean)
    .join(' · ');

  return {
    id,
    content: [
      `<h4 class="event-title">${escapeHtml(title)}</h4>`,
      metaLine ? `<div class="event-meta">${escapeHtml(metaLine)}</div>` : '',
      desc ? `<div class="event-desc">${escapeHtml(desc)}</div>` : '',
    ].join(''),
    start: start ? toISO(start) : undefined,
    end: end ? toISO(end) : undefined,
  };
}
