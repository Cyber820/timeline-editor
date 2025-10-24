// src/timeline/normalize.js
// 将“表单/接口行”规范化为 vis item（只做展示，不含样式绑定）
// - 输入：后端行对象（任意命名的字段组合）
// - 输出：vis.js 可消费的 item（含 content/start/end 等）
// - 兼容策略：尽量容错字段大小写与别名；保留元数据键，便于后续样式系统使用

import { toISO } from '../utils/data.js';
import { escapeHtml } from '../utils/dom.js';

/** 取多个候选键中第一个有值的 */
function pick(obj, ...keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && v !== '') return v;
  }
  return undefined;
}

/** 解析标签为数组：支持中英逗号/分号/竖线 */
function parseTags(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(s => String(s).trim());
  const s = String(raw ?? '').trim();
  if (!s) return [];
  return s.split(/[,\uFF0C;\uFF1B|]/g).map(t => t.trim()).filter(Boolean);
}

/**
 * 将“后端行”转换为 vis item。
 * 注意：这里只做展示层面的结构与 HTML 组装，不做样式绑定计算。
 * 为了兼容样式系统，仍会把关键元数据字段透传到返回对象（供 attachEventDataAttrs 使用）。
 */
export function normalizeItem(row, idx) {
  if (!row) return null;

  // 如果已经是 vis 结构（至少有 start 和 content），直接返回
  if (row.start && row.content) return row;

  // 固定字段读取（不依赖 FIELD；兼容常见别名与大小写）
  const id = pick(row, 'id', 'ID') ?? (idx + 1);
  const title = pick(row, 'Title', 'title', 'name') ?? `事件 ${id}`;
  const startRaw = pick(row, 'Start', 'start');
  const endRaw = pick(row, 'End', 'end');

  // 展示用元信息（用于副标题一行）
  const company  = pick(row, 'Company', 'company')  ?? '';
  const region   = pick(row, 'Region', 'region')    ?? '';
  const platform = pick(row, 'Platform', 'platform') ?? '';
  const consolePlatform = pick(row, 'ConsolePlatform', 'consolePlatform') ?? '';
  const eventType = pick(row, 'EventType', 'eventType') ?? '';
  const desc = pick(row, 'Description', 'description', 'Desc', 'desc') ?? '';

  // 标签（透传数组，便于样式系统）
  const tagRaw = pick(row, 'Tag', 'tag', 'Tags', 'tags');
  const Tag = parseTags(tagRaw);

  // 用于内容区域的“meta 副标题”
  const metaLine = [eventType, company, region, (platform || consolePlatform)]
    .filter(Boolean)
    .join(' · ');

  // 可选：tooltip（title 属性），若你有富文本 blob 可放在这里
  const tooltip = [
    `事件名称：${title}`,
    eventType ? `事件类型：${eventType}` : '',
    (startRaw || endRaw) ? `时间：${startRaw || ''}${endRaw ? ' ~ ' + endRaw : ''}` : '',
    company ? `公司：${company}` : '',
    region ? `地区：${region}` : '',
    platform ? `平台类型：${platform}` : '',
    consolePlatform ? `主机类型：${consolePlatform}` : '',
    Tag.length ? `标签：${Tag.join(', ')}` : '',
    desc ? `描述：${desc}` : '',
  ].filter(Boolean).join('\n');

  // 组装 content（可展示的 HTML）
  const contentHtml = [
    `<h4 class="event-title">${escapeHtml(title)}</h4>`,
    metaLine ? `<div class="event-meta">${escapeHtml(metaLine)}</div>` : '',
    desc ? `<div class="event-desc">${escapeHtml(desc)}</div>` : '',
  ].join('');

  return {
    // vis.js 标准字段
    id,
    content: contentHtml,
    start: startRaw ? toISO(startRaw) : undefined,
    end: endRaw ? toISO(endRaw) : undefined,
    title: tooltip ? escapeHtml(tooltip) : undefined, // 鼠标悬浮时的原生 tooltip

    // 透传元数据（供样式系统 attachEventDataAttrs 使用；不做计算）
    EventType: eventType,
    Company: company,
    Region: region,
    Platform: platform,
    ConsolePlatform: consolePlatform,
    Tag,
  };
}
