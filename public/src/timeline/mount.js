// public/src/timeline/mount.js
import { fetchAndNormalize } from './fetch.js';
import { initFilterUI } from '../filter/filter-ui.js';
import { filterState, setLogic, upsertRule, clearRules, removeRule, getState } from '../filter/filter-state.js';
import { applyFilters } from '../filter/filter-engine.js';

/* === 显示参数，与之前一致（略可调） === */
const UI = {
  canvas: { height: 1000 },
  item: { fontSize: 10, paddingX: 10, paddingY: 6, borderRadius: 10, maxWidth: 320 },
  layout: { itemPosition: 'bottom', axisPosition: 'bottom', verticalItemGap: 5, stack: true },
  zoom: { key: 'ctrlKey', verticalScroll: true },
};

/* ——工具函数、normalizeEvent、样式注入等与先前版本一致，省略注释以节省篇幅—— */
const toPlain=(x)=>(x==null?'':String(x).replace(/<[^>]*>/g,'').trim());
const asDisplay=(v)=>{const s=v==null?'':String(v).trim();return s?s:'—';};
const FIELD_LABELS=['事件名称','事件类型','时间','状态','地区','平台类型','主机类型','公司','标签','描述','贡献者'];
function parseBlobFields(blob){const s=toPlain(blob);const out={};if(!s)return out;const esc=FIELD_LABELS.map(l=>l.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));const look=`(?=\\s*(?:${esc.join('|')})\\s*[:：]|$)`;for(const l of FIELD_LABELS){const re=new RegExp(`${l}\\s*[:：]\\s*([\\s\\S]*?)${look}`,'i');const m=re.exec(s);if(m)out[l]=m[1].replace(/\\n/g,'\n').trim();}const t=out['时间'];if(t){const m1=/([0-9]{4}-[0-9]{2}-[0-9]{2})\\s*[~—–-]\\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(t);if(m1){out.__start=m1[1];out.__end=m1[2];}else{const m2=/([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(t);if(m2)out.__start=m2[1];}}return out;}
function normalizeTags(v){if(!v&&v!==0)return[];if(Array.isArray(v))return v.filter(Boolean);return String(v).split(',').map(s=>s.trim()).filter(Boolean);}
function buildKvHTML(obj){const kv=[['事件名称',obj.title],['开始时间',obj.start],['结束时间',obj.end],['事件类型',obj.EventType],['地区',obj.Region],['平台类型',obj.Platform],['主机类型',obj.ConsolePlatform],['公司',obj.Company],['标签',Array.isArray(obj.Tag)?obj.Tag.join('，'):(obj.Tag||'')],['描述',obj.Description],['贡献者',obj.Contributor||obj.Submitter],];const rows=kv.map(([k,v])=>`<div class="kv-row" style="display:flex;gap:8px;align-items:flex-start;"><dt class="kv-key" style="min-width:84px;flex:0 0 auto;font-weight:600;">${k}</dt><dd class="kv-val" style="margin:0;white-space:pre-wrap;word-break:break-word;">${asDisplay(v)}</dd></div>`).join('');return `<div style="font-weight:700;margin-bottom:8px">${asDisplay(obj.title)}</div><dl class="kv" style="display:flex;flex-direction:column;gap:6px;font-size:13px;line-height:1.6;">${rows}</dl>`;}
function createLoadingOverlay(){const el=document.createElement('div');el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.textContent='加载时间轴数据中…';el.style.cssText='position:absolute;top:12px;left:12px;background:#fff;border:1px solid #e5e7eb;padding:6px 10px;border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,.04);z-index:10;font-size:12px;';return el;}
function toMs(tsLike){if(typeof tsLike==='number')return tsLike;const n=+new Date(tsLike);return Number.isFinite(n)?n:NaN;}
function injectScopedStyles(container,ui=UI){const scope=`tl-scope-${Math.random().toString(36).slice(2,8)}`;container.classList.add(scope);const css=`.${scope} .vis-item.event{border-radius:${ui.item.borderRadius}px;} .${scope} .vis-item .vis-item-content{padding:${ui.item.paddingY}px ${ui.item.paddingX}px;max-width:${ui.item.maxWidth}px;} .${scope} .event-title{font-size:${ui.item.fontSize}px;line-height:1.4;margin:0;max-width:${ui.item.maxWidth}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .${scope} #event-popover{position:absolute;z-index:1000;background:#fff;border:1px solid #e5e7eb;box-shadow:0 8px 24px rgba(0,0,0,.15);border-radius:10px;padding:12px;overflow:auto;pointer-events:auto;min-width:280px;min-height:140px;max-width:700px;max-height:70vh;font-size:12px;line-height:1;display:none;}`.trim();const styleEl=document.createElement('style');styleEl.setAttribute('data-scope',scope);styleEl.textContent=css;container.appendChild(styleEl);return scope;}
function normalizeEvent(event,i){const Start=event.Start??event.start??'';const End=event.End??event.end??'';const blob=(event.title||event.content||'').toString();const parsed=parseBlobFields(blob);const title=toPlain(event.Title)||parsed['事件名称']||toPlain(event.title)||toPlain(event.content)||'(无标题)';const start=Start||parsed.__start||'';const end=End||parsed.__end||'';const EventType=event.EventType??event.eventType??parsed['事件类型']??'';const Region=event.Region??event.region??parsed['地区']??'';const Platform=event.Platform??event.platform??parsed['平台类型']??'';const Company=event.Company??event.company??parsed['公司']??'';const Status=event.Status??event.status??parsed['状态']??'';const ConsolePlatform=event.ConsolePlatform??event.consolePlatform??parsed['主机类型']??'';const Desc=event.Description??event.Desc??parsed['描述']??'';const Contrib=event.Contributor??event.Submitter??parsed['贡献者']??'';const TagRaw=event.Tag??event.tag??parsed['标签']??'';const Tag=normalizeTags(TagRaw);const detailHtml=buildKvHTML({title,start,end,EventType,Region,Platform,Company,ConsolePlatform,Tag,Description:Desc,Contributor:Contrib,Status});return {id:event.id||`auto-${i+1}`,content:title,start:start||undefined,end=end||undefined,detailHtml,titleText:title,EventType,Region,Platform,Company,Status,ConsolePlatform,Tag};}

export async function mountTimeline(container, overrides = {}) {
  if (typeof container === 'string') {
    const node = document.querySelector(container);
    if (!node) { console.error('mountTimeline: 未找到容器选择器：', container); return { timeline:null, items:null, destroy:()=>{} }; }
    container = node;
  }
  if (!container) { console.error('mountTimeline: 容器不存在'); return { timeline:null, items:null, destroy:()=>{} }; }
  if (!window.vis || !window.vis.Timeline || !window.vis.DataSet) {
    container.innerHTML = '<div style="padding:12px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">vis.js 未加载，请检查脚本引入顺序。</div>';
    return { timeline:null, items:null, destroy:()=>{} };
  }

  const loading = createLoadingOverlay();
  const originalPosition = container.style.position;
  const needRel = getComputedStyle(container).position === 'static';
  if (needRel) container.style.position = 'relative';
  container.appendChild(loading);

  injectScopedStyles(container, UI);

  const beforeSelector = container.id ? `#${container.id}` : '#timeline';

  let timeline = null, dataset = null, mapped = null;
  let resizeHandler = null;

  function destroy() {
    try { if (resizeHandler) window.removeEventListener('resize', resizeHandler); } catch {}
    try { timeline?.destroy && timeline.destroy(); } catch {}
    try { container.contains(loading) && loading.remove(); } catch {}
    if (needRel) container.style.position = originalPosition || '';
  }

  try {
    const raw = await fetchAndNormalize();
    const data = Array.isArray(raw) ? raw : [];
    if (!data.length) {
      container.innerHTML = '<div style="padding:12px;background:#fff3cd;border:1px solid #ffeeba;border-radius:8px;color:#856404;">接口返回 0 条记录。</div>';
      return { timeline:null, items:null, destroy };
    }

    mapped = data.map((evt, i) => normalizeEvent(evt, i));
    dataset = new window.vis.DataSet(mapped);

    // 自动范围
    const tvals = mapped.map(it => toMs(it.start ?? it.end)).filter(Number.isFinite);
    let startDate, endDate;
    if (tvals.length) {
      const minT = Math.min(...tvals), maxT = Math.max(...tvals);
      const DAY = 86400000, pad = Math.max(7 * DAY, Math.round((maxT - minT) * 0.05));
      startDate = new Date(minT - pad); endDate = new Date(maxT + pad);
    }

    const baseOptions = {
      minHeight: UI.canvas.height, maxHeight: UI.canvas.height,
      orientation: { item: UI.layout.itemPosition, axis: UI.layout.axisPosition },
      margin: { item: UI.layout.verticalItemGap, axis: 50 },
      locale: 'en', editable: false, stack: UI.layout.stack,
      verticalScroll: UI.zoom.verticalScroll, zoomKey: UI.zoom.key,
      template: (item, element) => {
        const host = element?.closest?.('.vis-item') || element;
        if (host) host.classList.add('event');
        const root = document.createElement('div');
        const h4 = document.createElement('h4');
        h4.className = 'event-title';
        h4.textContent = item.titleText || item.content || '(无标题)';
        root.appendChild(h4);
        return root;
      }
    };
    const options = { ...baseOptions, ...overrides };
    if (startDate) options.start = startDate;
    if (endDate) options.end = endDate;

    const vis = window.vis;
    timeline = new vis.Timeline(container, dataset, options);

    // 初始化过滤 UI（提供 getter 以便 UI 生成候选项 & 回显）
    initFilterUI({
      beforeElSelector: beforeSelector,
      getItems: () => mapped,
      getCurrentRules: () => getState().rules,
    });

    /* ===== 点击弹窗 ===== */
    function ensurePopover(){let pop=container.querySelector('#event-popover');if(!pop){pop=document.createElement('div');pop.id='event-popover';container.appendChild(pop);}return pop;}
    const pop=ensurePopover(); let currentAnchor=null;
    function hidePopover(){pop.style.display='none'; currentAnchor=null;}
    function findAnchorFromProps(props){const t=props?.event?.target;const hit=t&&t.closest?t.closest('.vis-item'):null;if(hit)return hit;if(props?.item==null)return null;const idSel=(window.CSS&&CSS.escape)?CSS.escape(String(props.item)):String(props.item).replace(/"/g,'\\"');return container.querySelector(`.vis-item[data-id="${idSel}"]`);}
    function showPopoverOverItem(props){const anchor=findAnchorFromProps(props);if(!anchor)return;const dsItem=dataset.get(props.item);pop.innerHTML=dsItem?.detailHtml||'<div style="padding:8px;">（无详情）</div>';const cb=container.getBoundingClientRect();const ib=anchor.getBoundingClientRect();const MIN_W=280,MIN_H=140;const MAX_W=Math.min(520,container.clientWidth);const MAX_H=Math.min(container.clientHeight*0.6,600);let left=ib.left-cb.left+container.scrollLeft;let top=ib.top-cb.top+container.scrollTop;let width=Math.min(Math.max(ib.width,MIN_W),MAX_W);let height=Math.min(Math.max(ib.height,MIN_H),MAX_H);const maxLeft=container.scrollLeft+(container.clientWidth-width-8);const maxTop=container.scrollTop+(container.clientHeight-height-8);left=Math.max(container.scrollLeft,Math.min(left,maxLeft));top=Math.max(container.scrollTop,Math.min(top,maxTop));pop.style.left=left+'px';pop.style.top=top+'px';pop.style.width=width+'px';pop.style.height=height+'px';pop.style.display='block';currentAnchor=anchor;}
    timeline.on('click',(props)=>{if(!props||props.item==null){hidePopover();return;}showPopoverOverItem(props);});
    function outsideClickHandler(e){if(pop.style.display==='none')return;const inPop=pop.contains(e.target);const onAnchor=currentAnchor&&currentAnchor.contains&&currentAnchor.contains(e.target);if(!inPop&&!onAnchor)hidePopover();}
    document.addEventListener('mousedown', outsideClickHandler);
    const resizeHandlerImpl=()=>{timeline.redraw();hidePopover();}; resizeHandler=resizeHandlerImpl; window.addEventListener('resize', resizeHandlerImpl);

    /* ===== 过滤事件语义（按你的新规则） ===== */

    // 1) “确定” 仅更新规则，不应用过滤
    window.addEventListener('filter:add-rule:confirm', (e) => {
      const { key, values } = e.detail || {};
      upsertRule(key, values);
      // 不更新 dataset；等用户点击 AND/OR 才应用
    });

    // 2) “和 / 或” 才真正应用过滤
    window.addEventListener('filter:set-logic', (e) => {
      const mode = e?.detail?.mode;
      setLogic(mode);
      const next = applyFilters(mapped, getState());
      dataset.clear(); dataset.add(next);
    });

    // 3) “复原” 清空规则并恢复原始数据
    window.addEventListener('filter:reset', () => {
      clearRules();
      dataset.clear(); dataset.add(mapped);
    });

    // 4) 清单里的“×”按钮：仅更新规则，不应用过滤
    window.addEventListener('filter:remove-rule', (e) => {
      const key = e?.detail?.key;
      if (key) removeRule(key);
      // 不更新 dataset；等用户点击 AND/OR 才应用
    });

    return { timeline, items: dataset, destroy };
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div style="padding:16px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">加载失败：${toPlain(err?.message || err)}</div>`;
    return { timeline:null, items:null, destroy };
  } finally {
    try { container.contains(loading) && loading.remove(); } catch {}
  }
}

export default mountTimeline;
