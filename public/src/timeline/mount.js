// src/timeline/mount.js
// ✅ 职责：创建并挂载 vis Timeline；只负责渲染与交互
// 依赖：fetchAndNormalize() 返回“原始事件数组”（可是你接口直返的数据）
// 提供：mountTimeline(container, overrides?)、默认导出；并暴露调试句柄到 window

import { fetchAndNormalize } from './fetch.js';

// ======================
// ===== 小工具区 =======
// ======================

function log(...args) { try { console.log('[timeline]', ...args); } catch {} }

// 浅合并（仅一层），满足 vis options 的常见结构
function mergeOptions(...objs) {
  const out = {};
  for (const o of objs) {
    if (!o || typeof o !== 'object') continue;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = { ...(out[k] || {}), ...v };
      } else if (v !== undefined) {
        out[k] = v;
      }
    }
  }
  return out;
}

function toPlain(x) {
  if (x == null) return '';
  return String(x).replace(/<[^>]*>/g, '').trim();
}
function asDisplay(v) {
  const s = v == null ? '' : String(v).trim();
  return s ? s : '—';
}

// —— 从中文多行 blob 解析字段 ——
// 支持 “字段名：值”，中文或英文冒号；用“下一个字段名 / 结尾”做前瞻截断，杜绝串行
const FIELD_LABELS = ['事件名称','事件类型','时间','状态','地区','平台类型','主机类型','公司','标签','描述','贡献者'];
function parseBlobFields(blob) {
  const s = toPlain(blob);
  const out = {};
  if (!s) return out;

  const escaped = FIELD_LABELS.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const lookahead = `(?=\\s*(?:${escaped.join('|')})\\s*[:：]|$)`;

  for (const label of FIELD_LABELS) {
    const re = new RegExp(`${label}\\s*[:：]\\s*([\\s\\S]*?)${lookahead}`, 'i');
    const m = re.exec(s);
    if (m) out[label] = m[1].replace(/\\n/g, '\n').trim();
  }

  // 拆“时间”为 start/end
  const t = out['时间'];
  if (t) {
    const m1 = /([0-9]{4}-[0-9]{2}-[0-9]{2})\s*[~—–-]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(t);
    if (m1) { out.__start = m1[1]; out.__end = m1[2]; }
    else {
      const m2 = /([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(t);
      if (m2) out.__start = m2[1];
    }
  }
  return out;
}

function normalizeTags(v) {
  if (!v && v !== 0) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return String(v).split(',').map(s => s.trim()).filter(Boolean);
}

// 结构化弹窗（<dl> 行排版，空值用 “—”，从结构上杜绝串行）
function buildKvHTML(obj) {
  const kv = [
    ['事件名称', obj.title],
    ['开始时间', obj.start],
    ['结束时间', obj.end],
    ['事件类型', obj.EventType],
    ['地区', obj.Region],
    ['平台类型', obj.Platform],
    ['主机类型', obj.ConsolePlatform],
    ['公司', obj.Company],
    ['标签', Array.isArray(obj.Tag) ? obj.Tag.join('，') : (obj.Tag || '')],
    ['描述', obj.Description],
    ['贡献者', obj.Contributor || obj.Submitter],
  ];
  const rows = kv.map(([k,v]) =>
    `<div class="kv-row" style="display:flex;gap:8px;align-items:flex-start;">
       <dt class="kv-key" style="min-width:84px;flex:0 0 auto;font-weight:600;">${k}</dt>
       <dd class="kv-val" style="margin:0;white-space:pre-wrap;word-break:break-word;">${asDisplay(v)}</dd>
     </div>`
  ).join('');
  return `
    <div style="font-weight:700;margin-bottom:8px">${asDisplay(obj.title)}</div>
    <dl class="kv" style="display:flex;flex-direction:column;gap:6px;font-size:13px;line-height:1.6;">${rows}</dl>
  `;
}

function createLoadingOverlay() {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = '加载时间轴数据中…';
  el.style.cssText =
    'position:absolute;top:12px;left:12px;background:#fff;border:1px solid #e5e7eb;padding:6px 10px;border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,.04);z-index:10;font-size:12px;';
  return el;
}

function toMs(tsLike) {
  if (typeof tsLike === 'number') return tsLike;
  const n = +new Date(tsLike);
  return Number.isFinite(n) ? n : NaN;
}

// =============== 数据映射核心（修复点） ===============
// 把“原始事件 event” → “vis item”，并在此阶段解析 blob、回填字段、生成结构化弹窗 HTML
function normalizeEvent(event, i) {
  const fallbackContent = event.content ?? event.Title ?? '';
  const Start = event.Start ?? event.start ?? '';
  const End   = event.End   ?? event.end   ?? '';
  const blob  = (event.title || event.content || '').toString(); // content/title 任意处都尝试

  const parsed = parseBlobFields(blob);

  const title = toPlain(event.Title) || parsed['事件名称'] || toPlain(event.title) || toPlain(event.content) || '(无标题)';
  const start = Start || parsed.__start || '';
  const end   = End   || parsed.__end   || '';

  const EventType       = event.EventType       ?? event.eventType       ?? parsed['事件类型'] ?? '';
  const Region          = event.Region          ?? event.region          ?? parsed['地区'] ?? '';
  const Platform        = event.Platform        ?? event.platform        ?? parsed['平台类型'] ?? '';
  const Company         = event.Company         ?? event.company         ?? parsed['公司'] ?? '';
  const Status          = event.Status          ?? event.status          ?? parsed['状态'] ?? '';
  const ConsolePlatform = event.ConsolePlatform ?? event.consolePlatform ?? parsed['主机类型'] ?? '';
  const Desc            = event.Description     ?? event.Desc            ?? parsed['描述'] ?? '';
  const Contrib         = event.Contributor     ?? event.Submitter       ?? parsed['贡献者'] ?? '';

  const TagRaw = event.Tag ?? event.tag ?? parsed['标签'] ?? '';
  const Tag = normalizeTags(TagRaw);

  const contentText = fallbackContent || title;
  const detailHTML = buildKvHTML({
    title, start, end, EventType, Region, Platform, Company,
    ConsolePlatform, Tag, Description: Desc, Contributor: Contrib, Status
  });

  return {
    id: event.id || `auto-${i + 1}`,
    content: contentText || title,
    start: start || undefined,
    end: end || undefined,
    title: detailHTML,               // 👈 弹窗/tooltip 用结构化 HTML，不再用原 blob
    EventType, Region, Platform, Company, Status, ConsolePlatform,
    Tag,
    __raw: event                     // 调试保留
  };
}

// ======================
// ===== 主挂载流 =======
// ======================

export async function mountTimeline(container, overrides = {}) {
  log('mountTimeline start');

  if (!container) {
    console.error('mountTimeline: 容器不存在');
    return;
  }
  if (!window.vis || !window.vis.Timeline || !window.vis.DataSet) {
    console.error('mountTimeline: vis.js 未加载');
    container.innerHTML =
      '<div style="padding:12px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">vis.js 未加载，请检查脚本引入顺序。</div>';
    return;
  }

  // 调试句柄
  window.__timelineInit = 'mounting';
  window.__timeline = null;
  window.__timelineItems = null;

  // loading
  const loading = createLoadingOverlay();
  const originalPosition = container.style.position;
  const needRel = getComputedStyle(container).position === 'static';
  if (needRel) container.style.position = 'relative';
  container.appendChild(loading);

  let resizeHandler = null;
  let timeline = null;
  let items = null;

  function destroy() {
    try { if (resizeHandler) window.removeEventListener('resize', resizeHandler); } catch {}
    try { if (timeline && timeline.destroy) timeline.destroy(); } catch {}
    try { if (container.contains(loading)) loading.remove(); } catch {}
    if (needRel) container.style.position = originalPosition || '';
    window.__timelineInit = 'destroyed';
    window.__timeline = null;
    window.__timelineItems = null;
  }

  function setItems(nextItems = []) {
    if (!items) return;
    items.clear();
    if (Array.isArray(nextItems) && nextItems.length) items.add(nextItems);
    if (timeline?.redraw) requestAnimationFrame(() => timeline.redraw());
  }

  function setOptions(patch = {}) {
    if (timeline && patch && typeof patch === 'object') {
      timeline.setOptions(mergeOptions(timeline.options || {}, patch));
      if (timeline.redraw) requestAnimationFrame(() => timeline.redraw());
    }
  }

  try {
    // 取数（允许你在 fetchAndNormalize 内直接返回接口数据，本函数负责映射）
    const rawData = await fetchAndNormalize();
    const data = Array.isArray(rawData) ? rawData : [];
    if (data.length === 0) {
      container.innerHTML =
        '<div style="padding:12px;background:#fff3cd;border:1px solid #ffeeba;border-radius:8px;color:#856404;">接口返回 0 条记录：请检查 Title/Start 字段是否存在，以及 Start 是否为可解析日期（如 1998-10-21）。</div>';
      return { timeline: null, items: null, destroy, setItems, setOptions };
    }

    // —— 关键：在此映射并生成结构化弹窗 —— //
    const mapped = data.map((evt, i) => normalizeEvent(evt, i));

    items = new window.vis.DataSet(mapped);
    window.__timelineItems = items;

    // 自动时间范围（容错）
    const raw = items.get();
    const times = raw.map(it => toMs(it.start ?? it.end)).filter(Number.isFinite);
    let startDate, endDate;
    if (times.length) {
      const minT = Math.min(...times);
      const maxT = Math.max(...times);
      const DAY = 24 * 60 * 60 * 1000;
      const span = Math.max(0, maxT - minT);
      const pad = Math.max(7 * DAY, Math.round(span * 0.05));
      startDate = new Date(minT - pad);
      endDate   = new Date(maxT + pad);
    }

    // vis 选项（可被 overrides 覆盖）
    const baseDefaults = {
      locale: 'zh-cn',
      editable: false,
      margin: { item: 10, axis: 50 },
      orientation: { axis: 'bottom', item: 'bottom' },
      tooltip: { followMouse: true, overflowMethod: 'flip' },
      verticalScroll: true,
      zoomKey: "ctrlKey",
      stack: true,
      template: (item, element) => {
        const host = element?.closest?.('.vis-item') || element;
        if (host && window.__styleEngine) {
          window.__styleEngine.attachEventDataAttrs(host, item);
          host.classList.add('event'); // .vis-item.event
        }
        const root = document.createElement('div');
        const h4 = document.createElement('h4');
        h4.className = 'event-title';
        h4.textContent = item.content || '(无标题)';
        root.appendChild(h4);
        return root;
      }
    };
    const options = mergeOptions(baseDefaults, overrides);
    if (startDate instanceof Date) options.start = startDate;
    if (endDate instanceof Date) options.end = endDate;

    // 创建时间轴
    const vis = window.vis;
    timeline = new vis.Timeline(container, items, options);
    window.__timeline = timeline;

    // ============== 点击弹窗（仅点击，无悬停） ==============
    function ensurePopover() {
      let pop = container.querySelector('#event-popover');
      if (!pop) {
        pop = document.createElement('div');
        pop.id = 'event-popover';
        pop.style.cssText = [
          'position:absolute','z-index:1000','background:#fff',
          'border:1px solid #e5e7eb','box-shadow:0 8px 24px rgba(0,0,0,.15)',
          'border-radius:10px','padding:12px','overflow:auto','pointer-events:auto',
          'min-width:280px','min-height:140px','max-width:520px','max-height:60vh',
          'font-size:14px','line-height:1.5','display:none'
        ].join(';');
        container.appendChild(pop);
      }
      return pop;
    }
    const pop = ensurePopover();
    let currentAnchor = null;

    function hidePopover(){ pop.style.display = 'none'; currentAnchor = null; }

    function findAnchorFromProps(props){
      const t = props?.event?.target;
      const hit = t && t.closest ? t.closest('.vis-item') : null;
      if (hit) return hit;
      if (props?.item == null) return null;
      const idSel = (window.CSS && CSS.escape) ? CSS.escape(String(props.item)) : String(props.item).replace(/"/g,'\\"');
      return container.querySelector(`.vis-item[data-id="${idSel}"]`);
    }

    function showPopoverOverItem(props){
      const anchor = findAnchorFromProps(props);
      if (!anchor) return;

      // 用我们映射阶段生成的结构化 HTML
      const dsItem = items.get(props.item);
      pop.innerHTML = dsItem?.title || buildKvHTML({
        title: dsItem?.content || '(无标题)',
        start: dsItem?.start, end: dsItem?.end,
        EventType: dsItem?.EventType, Region: dsItem?.Region,
        Platform: dsItem?.Platform, Company: dsItem?.Company,
        ConsolePlatform: dsItem?.ConsolePlatform, Tag: dsItem?.Tag,
        Description: dsItem?.Description, Contributor: dsItem?.Contributor
      });

      const cb = container.getBoundingClientRect();
      const ib = anchor.getBoundingClientRect();

      const MIN_W = 280, MIN_H = 140;
      const MAX_W = Math.min(520, container.clientWidth);
      const MAX_H = Math.min(container.clientHeight * 0.6, 600);

      let left = ib.left - cb.left + container.scrollLeft;
      let top  = ib.top  - cb.top  + container.scrollTop;
      let width  = Math.min(Math.max(ib.width,  MIN_W), MAX_W);
      let height = Math.min(Math.max(ib.height, MIN_H), MAX_H);

      const maxLeft = container.scrollLeft + (container.clientWidth  - width  - 8);
      const maxTop  = container.scrollTop  + (container.clientHeight - height - 8);
      left = Math.max(container.scrollLeft, Math.min(left, maxLeft));
      top  = Math.max(container.scrollTop,  Math.min(top,  maxTop));

      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
      pop.style.width = width + 'px';
      pop.style.height = height + 'px';
      pop.style.display = 'block';
      currentAnchor = anchor;
    }

    timeline.on('click', (props) => {
      if (!props || props.item == null) { hidePopover(); return; }
      showPopoverOverItem(props);
    });

    function outsideClickHandler(e) {
      if (pop.style.display === 'none') return;
      const inPop = pop.contains(e.target);
      const onAnchor = currentAnchor && currentAnchor.contains && currentAnchor.contains(e.target);
      if (!inPop && !onAnchor) hidePopover();
    }
    document.addEventListener('mousedown', outsideClickHandler);

    // 自适应
    resizeHandler = () => { timeline.redraw(); hidePopover(); };
    window.addEventListener('resize', resizeHandler);

    // 完整销毁
    const _destroy = destroy;
    destroy = function () {
      document.removeEventListener('mousedown', outsideClickHandler);
      hidePopover();
      _destroy();
    };

    window.__timelineInit = 'mounted';
    log('mounted with items:', items.get().length);

    return { timeline, items, destroy, setItems, setOptions };
  } catch (err) {
    console.error(err);
    container.innerHTML =
      `<div style="padding:16px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">加载失败：${toPlain(err?.message || err)}</div>`;
    window.__timelineInit = 'error';
    return { timeline: null, items: null, destroy, setItems, setOptions };
  } finally {
    try { container.contains(loading) && loading.remove(); } catch {}
  }
}

export default mountTimeline;
