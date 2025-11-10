// public/src/timeline/mount.js
// ✅ 要点：
// - 仅点击弹窗（无 hover tooltip）
// - 事件卡片只显示标题
// - 过滤逻辑：确定=只更新规则；AND/OR 按钮才实际过滤
// - 样式系统：自包含面板（自动注入），5 个入口按钮 + 绑定/行编辑/保存&应用
// - 单属性只能绑定一种样式类型（字体颜色/背景颜色/边框颜色/字体/光晕颜色，绑定后禁用下拉；需“重置”解锁）

import { fetchAndNormalize } from './fetch.js';
import { initFilterUI } from '../filter/filter-ui.js';
import {
  setLogic,
  upsertRule,
  clearRules,
  removeRule,
  getState,
} from '../filter/filter-state.js';
import { applyFilters } from '../filter/filter-engine.js';

// —— 样式引擎关键引用（仅这些）
import { stateMem } from '../style/stateMem.js';
import {
  buildEngineStyleState,
  ENGINE_KEY_MAP,
  createEmptyRuleForType,
  ensureBucketIn,
} from '../_staging/constants.js';
import { setStyleState } from '../state/styleState.js';
import { applyStyleState } from '../style/engine.js';

/* ----------------------------------------------------------------
 * 显示参数
 * ---------------------------------------------------------------- */
const UI = {
  canvas: { height: 1000 },
  item: { fontSize: 10, paddingX: 10, paddingY: 6, borderRadius: 10, maxWidth: 320 },
  layout: { itemPosition: 'bottom', axisPosition: 'bottom', verticalItemGap: 5, stack: true },
  zoom: { key: 'ctrlKey', verticalScroll: true },
};

/* ----------------------------------------------------------------
 * 小工具
 * ---------------------------------------------------------------- */
const toPlain = (x) => (x == null ? '' : String(x).replace(/<[^>]*>/g, '').trim());
const asDisplay = (v) => { const s = v == null ? '' : String(v).trim(); return s ? s : '—'; };
const FIELD_LABELS = ['事件名称','事件类型','时间','状态','地区','平台类型','主机类型','公司','标签','描述','贡献者'];

function parseBlobFields(blob) {
  const s = toPlain(blob); const out = {}; if (!s) return out;
  const escaped = FIELD_LABELS.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const lookahead = `(?=\\s*(?:${escaped.join('|')})\\s*[:：]|$)`;
  for (const label of FIELD_LABELS) {
    const re = new RegExp(`${label}\\s*[:：]\\s*([\\s\\S]*?)${lookahead}`, 'i');
    const m = re.exec(s); if (m) out[label] = m[1].replace(/\\n/g, '\n').trim();
  }
  const t = out['时间'];
  if (t) {
    const m1 = /([0-9]{4}-[0-9]{2}-[0-9]{2})\s*[~—–-]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(t);
    if (m1) { out.__start = m1[1]; out.__end = m1[2]; }
    else { const m2 = /([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(t); if (m2) out.__start = m2[1]; }
  }
  return out;
}
function normalizeTags(v){ if(!v&&v!==0)return[]; if(Array.isArray(v))return v.filter(Boolean);
  return String(v).split(',').map(s=>s.trim()).filter(Boolean); }
function toMs(tsLike){ if(typeof tsLike==='number')return tsLike; const n=+new Date(tsLike); return Number.isFinite(n)?n:NaN; }

function buildKvHTML(obj){
  const kv=[['事件名称',obj.title],['开始时间',obj.start],['结束时间',obj.end],['事件类型',obj.EventType],
    ['地区',obj.Region],['平台类型',obj.Platform],['主机类型',obj.ConsolePlatform],['公司',obj.Company],
    ['标签',Array.isArray(obj.Tag)?obj.Tag.join('，'):(obj.Tag||'')],['描述',obj.Description],['贡献者',obj.Contributor||obj.Submitter]];
  const rows=kv.map(([k,v])=>`<div class="kv-row" style="display:flex;gap:8px;align-items:flex-start;">
    <dt class="kv-key" style="min-width:84px;flex:0 0 auto;font-weight:600;">${k}</dt>
    <dd class="kv-val" style="margin:0;white-space:pre-wrap;word-break:break-word;">${asDisplay(v)}</dd></div>`).join('');
  return `<div style="font-weight:700;margin-bottom:8px">${asDisplay(obj.title)}</div>
    <dl class="kv" style="display:flex;flex-direction:column;gap:6px;font-size:13px;line-height:1.6;">${rows}</dl>`;
}

function injectScopedStyles(container, ui=UI){
  const scope=`tl-scope-${Math.random().toString(36).slice(2,8)}`; container.classList.add(scope);
  const css=`
    .${scope} .vis-item.event { border-radius:${ui.item.borderRadius}px; }
    .${scope} .vis-item .vis-item-content { padding:${ui.item.paddingY}px ${ui.item.paddingX}px; max-width:${ui.item.maxWidth}px; }
    .${scope} .event-title { font-size:${ui.item.fontSize}px; line-height:1.4; margin:0; max-width:${ui.item.maxWidth}px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .${scope} #event-popover { position:absolute; z-index:1000; background:#fff; border:1px solid #e5e7eb; box-shadow:0 8px 24px rgba(0,0,0,.15);
      border-radius:10px; padding:12px; overflow:auto; pointer-events:auto; min-width:280px; min-height:140px; max-width:700px; max-height:70vh; font-size:12px; line-height:1; display:none; }
    /* 样式面板基础样式 */
    .te-style-btn { display:inline-flex; align-items:center; gap:.25rem; padding:.35rem .6rem; border:1px solid #dadde1; border-radius:.5rem; background:#fff; cursor:pointer; font-size:.9rem; }
    .te-style-btn + .te-style-btn { margin-left:.5rem; } .te-style-btn:hover { background:#f6f7f9; }
    #style-window { position:fixed; inset:0; z-index:9999; display:none; }
    #style-window .sw-backdrop { position:absolute; inset:0; background:rgba(0,0,0,.35); }
    #style-window .sw-panel { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:min(980px,94vw); max-height:80vh; overflow:auto;
      background:#fff; border-radius:12px; box-shadow:0 12px 40px rgba(0,0,0,.25); }
    #style-window header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid #eee; }
    #style-window section { padding:16px 18px; } #style-window footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 18px; border-top:1px solid #eee; }
    #styleTable { width:100%; border-collapse:collapse; } #styleTable thead tr { border-bottom:1px solid #eee; } #styleTable th, #styleTable td { text-align:left; padding:8px 4px; }
    .attr-chips span { display:inline-block; padding:2px 6px; margin:2px; border:1px solid #ccc; border-radius:10px; font-size:12px; }
    .te-muted { color:#666; font-size:.9rem; }
  `;
  const styleEl=document.createElement('style'); styleEl.setAttribute('data-scope',scope); styleEl.textContent=css; container.appendChild(styleEl);
  return scope;
}

function createLoadingOverlay(){ const el=document.createElement('div');
  el.setAttribute('role','status'); el.setAttribute('aria-live','polite'); el.textContent='加载时间轴数据中…';
  el.style.cssText='position:absolute;top:12px;left:12px;background:#fff;border:1px solid #e5e7eb;padding:6px 10px;border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,.04);z-index:10;font-size:12px;'; return el; }

/* ----------------------------------------------------------------
 * 数据映射
 * ---------------------------------------------------------------- */
function normalizeEvent(event,i){
  const Start=event.Start??event.start??''; const End=event.End??event.end??''; const blob=(event.title||event.content||'').toString();
  const parsed=parseBlobFields(blob);
  const title=toPlain(event.Title)||parsed['事件名称']||toPlain(event.title)||toPlain(event.content)||'(无标题)';
  const start=Start||parsed.__start||''; const end=End||parsed.__end||'';
  const EventType=event.EventType??parsed['事件类型']??''; const Region=event.Region??parsed['地区']??'';
  const Platform=event.Platform??parsed['平台类型']??''; const Company=event.Company??parsed['公司']??'';
  const Status=event.Status??parsed['状态']??''; const ConsolePlatform=event.ConsolePlatform??parsed['主机类型']??'';
  const Desc=event.Description??parsed['描述']??''; const Contrib=event.Contributor??event.Submitter??parsed['贡献者']??'';
  const TagRaw=event.Tag??parsed['标签']??''; const Tag=normalizeTags(TagRaw);
  const detailHtml=buildKvHTML({title,start,end,EventType,Region,Platform,Company,ConsolePlatform,Tag,Description:Desc,Contributor:Contrib,Status});
  return { id:event.id||`auto-${i+1}`, content:title, start:start||undefined, end:end||undefined, detailHtml, titleText:title,
    EventType, Region, Platform, Company, Status, ConsolePlatform, Tag };
}

/* ----------------------------------------------------------------
 * 样式：面板注入 + 交互（完全自包含）
 * ---------------------------------------------------------------- */

// 5 个入口按钮与字段
const STYLE_ATTR_BTNS = [
  { label:'事件样式', field:'EventType' },
  { label:'平台样式', field:'Platform' },
  { label:'主机样式', field:'ConsolePlatform' },
  { label:'公司样式', field:'Company' },
  { label:'地区样式', field:'Region' },
];

// 支持的样式类型（UI 键）
const UI_STYLE_TYPES = [
  { key:'fontColor',       label:'字体颜色',     input:'color' },
  { key:'backgroundColor', label:'背景颜色',     input:'color' },
  { key:'borderColor',     label:'边框颜色',     input:'color' },
  { key:'fontFamily',      label:'字体',         input:'font'  },
  { key:'haloColor',       label:'光晕颜色',     input:'color' },
];

// 面板 DOM 注入（仅一次）
let panelInjected = false;
function ensureStylePanelInjected(){
  if (panelInjected) return;
  const host=document.createElement('div');
  host.id='style-window';
  host.innerHTML=`
    <div class="sw-backdrop"></div>
    <div class="sw-panel">
      <header>
        <div>
          <div id="style-title" style="font-weight:600;font-size:1.05rem;">样式</div>
          <div id="bound-type-hint" class="te-muted" style="margin-top:4px;">当前样式：无</div>
        </div>
        <button id="style-close" title="关闭" style="border:none;background:transparent;font-size:20px;cursor:pointer;">×</button>
      </header>
      <section>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
          <label>样式类型：</label>
          <select id="style-type-select">
            <option value="none">（未选择）</option>
            ${UI_STYLE_TYPES.map(t=>`<option value="${t.key}">${t.label}</option>`).join('')}
          </select>
          <button id="style-confirm" style="display:inline-block;" disabled>确认绑定</button>
          <button id="style-reset" style="display:none;">重置</button>
          <button id="style-add" disabled>新增样式行</button>
        </div>
        <table id="styleTable">
          <thead>
            <tr><th style="width:36%;">样式</th><th>作用属性值</th><th style="width:72px;">操作</th></tr>
          </thead>
          <tbody id="styleTableBody"></tbody>
        </table>
      </section>
      <footer>
        <button id="style-save" style="background:#111;color:#fff;border:1px solid #111;border-radius:8px;padding:8px 12px;cursor:pointer;">保存并应用</button>
      </footer>
    </div>
  `;
  document.body.appendChild(host);
  panelInjected = true;
}

function openStylePanelLight(){ ensureStylePanelInjected(); document.getElementById('style-window').style.display='block'; }
function closeStylePanelLight(){ const el=document.getElementById('style-window'); if(el) el.style.display='none'; }

function buildColorControl(rule){
  const wrap=document.createElement('div');
  const color=document.createElement('input'); color.type='color';
  const hex=document.createElement('input'); hex.type='text'; hex.placeholder='#RRGGBB'; hex.style.marginLeft='6px';
  const current=String(rule.style?.[rule.type]||'#000000').toUpperCase();
  color.value=/^#[0-9A-Fa-f]{6}$/.test(current)?current:'#000000'; hex.value=color.value;
  function norm(v){ let s=String(v||'').trim(); if(!s) return null; if(s[0]!=='#') s='#'+s; if(/^#([0-9a-fA-F]{3})$/.test(s)) s='#'+s.slice(1).split('').map(c=>c+c).join(''); if(/^#([0-9a-fA-F]{6})$/.test(s)) return s.toUpperCase(); return null; }
  color.addEventListener('input',()=>{ const v=color.value.toUpperCase(); hex.value=v; (rule.style ||= {})[rule.type]=v; });
  hex.addEventListener('change',()=>{ const v=norm(hex.value)||color.value.toUpperCase(); hex.value=v; color.value=v; (rule.style ||= {})[rule.type]=v; });
  wrap.appendChild(color); wrap.appendChild(hex); return wrap;
}
function buildFontControl(rule){
  const wrap=document.createElement('div');
  const sel=document.createElement('select');
  sel.innerHTML=`
    <option value="">（默认字体）</option>
    <option value="Microsoft YaHei, PingFang SC, Noto Sans SC, system-ui">微软雅黑 / 苹方 / 思源黑体</option>
    <option value="SimHei">黑体 (SimHei)</option>
    <option value="SimSun">宋体 (SimSun)</option>
    <option value="KaiTi">楷体 (KaiTi)</option>
    <option value="LiSu">隶书 (LiSu)</option>
    <option value="YouYuan">幼圆 (YouYuan)</option>
    <option value="STCaiyun">华文彩云 (STCaiyun)</option>
    <option value="FZShuTi">方正舒体 (FZShuTi)</option>
  `;
  sel.value = rule.style?.fontFamily || '';
  sel.addEventListener('change',()=>{ (rule.style ||= {}).fontFamily = sel.value || ''; });
  wrap.appendChild(sel); return wrap;
}
function buildStyleCellControl(rule){
  if (['fontColor','backgroundColor','borderColor','haloColor'].includes(rule.type)) return buildColorControl(rule);
  if (rule.type==='fontFamily') return buildFontControl(rule);
  const span=document.createElement('span'); span.textContent=rule.type; return span;
}

function uniqueSorted(list){ return Array.from(new Set(list.filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b))); }

function renderRow(containerTbody, attrKey, rule, allOptionsForAttr){
  const tr=document.createElement('tr'); tr.dataset.rowId=rule.id; tr.dataset.attrKey=attrKey;
  // 左：样式控件
  const tdStyle=document.createElement('td'); tdStyle.dataset.styleType=rule.type; tdStyle.appendChild(buildStyleCellControl(rule)); tr.appendChild(tdStyle);
  // 中：多选属性值
  const tdVals=document.createElement('td');
  const chips=document.createElement('div'); chips.className='attr-chips'; chips.style.minHeight='28px'; tdVals.appendChild(chips);
  const btnPick=document.createElement('button'); btnPick.type='button'; btnPick.textContent='添加/修改属性'; btnPick.style.marginLeft='8px'; tdVals.appendChild(btnPick);
  tr.appendChild(tdVals);
  // 初次 chips
  renderChips(chips, rule.values || []);
  // 选择器（简版弹窗）
  btnPick.addEventListener('click', ()=>{
    const list = uniqueSorted(allOptionsForAttr);
    const current = new Set(rule.values || []);
    const box = document.createElement('div');
    box.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;';
    const panel=document.createElement('div');
    panel.style.cssText='width:min(720px,92vw);max-height:70vh;overflow:auto;background:#fff;border-radius:10px;padding:12px;box-shadow:0 12px 40px rgba(0,0,0,.35);';
    panel.innerHTML='<div style="font-weight:600;margin-bottom:8px;">选择属性值</div>';
    const grid=document.createElement('div'); grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;';
    list.forEach(v=>{
      const label=document.createElement('label'); label.style.cssText='border:1px solid #e5e7eb;border-radius:8px;padding:6px;display:flex;gap:6px;align-items:center;';
      const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=current.has(v); cb.addEventListener('change',()=>{ if(cb.checked) current.add(v); else current.delete(v); });
      const span=document.createElement('span'); span.textContent=v;
      label.appendChild(cb); label.appendChild(span); grid.appendChild(label);
    });
    panel.appendChild(grid);
    const footer=document.createElement('div'); footer.style.cssText='display:flex;justify-content:flex-end;gap:8px;margin-top:10px;';
    // ✅ 调整按钮顺序：左“确定” 右“取消”
    const ok=document.createElement('button'); ok.textContent='确定';
    const cancel=document.createElement('button'); cancel.textContent='取消';
    ok.addEventListener('click',()=>{ rule.values = Array.from(current); renderChips(chips, rule.values); document.body.removeChild(box); });
    cancel.addEventListener('click',()=>document.body.removeChild(box));
    // 左确定右取消：先添加“确定”，后添加“取消”
    footer.appendChild(ok);
    footer.appendChild(cancel);
    panel.appendChild(footer);
    box.appendChild(panel); document.body.appendChild(box);
  });

  // 右：删除行
  const tdAction=document.createElement('td');
  const del=document.createElement('button'); del.type='button'; del.title='删除该样式行'; del.textContent='×';
  del.addEventListener('click', ()=>{
    const bucket = (stateMem.styleRules && stateMem.styleRules[attrKey]) || [];
    const idx = bucket.findIndex(r => r.id === rule.id);
    if (idx>=0) bucket.splice(idx,1);
    tr.remove();
  });
  tdAction.appendChild(del); tr.appendChild(tdAction);

  containerTbody.appendChild(tr);
}

function renderChips(container, values){
  container.innerHTML='';
  const list = Array.isArray(values) ? values : [];
  if (!list.length) { const s=document.createElement('span'); s.className='te-muted'; s.textContent='（未选择）'; container.appendChild(s); return; }
  list.forEach(v=>{ const tag=document.createElement('span'); tag.textContent=v; container.appendChild(tag); });
}

// 根据 attrKey 生成可选值（从已加载 mapped 列表收集）
function collectOptionsForAttr(mapped, attrKey){
  const vals = mapped.map(it => it?.[attrKey]).flatMap(v => Array.isArray(v)?v:[v]);
  return uniqueSorted(vals.filter(Boolean));
}

// 刷新类型下拉（全局唯一占用提示 + 本属性已绑定则禁用）
function refreshTypeOptions(selectEl){
  if (!selectEl) return;
  Array.from(selectEl.options).forEach(opt=>{
    if(!opt.dataset.baseText) opt.dataset.baseText = opt.textContent;
    const type = opt.value;
    if (type==='none') { opt.disabled=false; opt.textContent=opt.dataset.baseText; return; }
    const owner = stateMem.styleTypeOwner?.[type];
    const isMine = owner === stateMem.currentStyleAttr;
    opt.disabled = !!(owner && !isMine);
    opt.textContent = opt.dataset.baseText + (owner && !isMine ? `（已绑定：${owner}）` : '');
  });
}

// 把 UI 态保存 → 引擎态 → 持久化 → 应用
function persistAndApply(selectorBase, titleSelector){
  const engineState = buildEngineStyleState(stateMem.boundStyleType, stateMem.styleRules, ENGINE_KEY_MAP);
  const saved = setStyleState(engineState);
  applyStyleState(saved, { selectorBase, titleSelector });
}

/* ----------------------------------------------------------------
 * 样式按钮栏：插在“筛选/过滤”右侧
 * ---------------------------------------------------------------- */
function mountStyleButtonsRightOfFilter(container, mapped){
  const findFilterBtn = ()=>{
    let btn = document.querySelector('[data-role="filter-toggle"], [data-te-filter-toggle]');
    if (btn) return btn;
    const candidates = Array.from(document.querySelectorAll('button,[role="button"]'));
    return candidates.find(b=>/筛选|过滤/.test((b.textContent||'').trim())) || null;
  };
  const doAttach = ()=>{
    const filterBtn = findFilterBtn(); if (!filterBtn) return false;
    const frag=document.createDocumentFragment();
    STYLE_ATTR_BTNS.forEach(def=>{
      const b=document.createElement('button');
      b.type='button'; b.className='te-style-btn'; b.textContent=def.label;
      b.addEventListener('click', ()=> openStyleEditorFor(def.field, mapped));
      frag.appendChild(b);
    });
    if (filterBtn.nextSibling) filterBtn.parentElement.insertBefore(frag, filterBtn.nextSibling);
    else filterBtn.parentElement.appendChild(frag);
    return true;
  };
  if (doAttach()) return;
  const obs=new MutationObserver(()=>{ if (doAttach()) obs.disconnect(); });
  obs.observe(document.body,{childList:true,subtree:true});
  [120,400,1000].forEach(ms=>setTimeout(()=>doAttach(),ms));
}

/* ----------------------------------------------------------------
 * 打开样式编辑器（面板）for 指定属性
 * ---------------------------------------------------------------- */
function openStyleEditorFor(attrKey, mapped){
  ensureStylePanelInjected();

  // 绑定当前属性 & 初始化容器
  stateMem.currentStyleAttr = attrKey;
  stateMem.boundStyleType ||= {};
  stateMem.styleTypeOwner ||= {};
  stateMem.styleRules ||= {};
  stateMem.styleRowSelections ||= {};

  const root=document.getElementById('style-window');
  const titleEl=document.getElementById('style-title');
  const hintEl=document.getElementById('bound-type-hint');
  const typeSel=document.getElementById('style-type-select');
  const tbody=document.getElementById('styleTableBody');
  const btnClose=document.getElementById('style-close');
  const btnConfirm=document.getElementById('style-confirm');
  const btnReset=document.getElementById('style-reset');
  const btnAdd=document.getElementById('style-add');
  const btnSave=document.getElementById('style-save');

  titleEl.textContent = `${attrKey} 样式`;
  // 重绘行
  tbody.innerHTML='';
  (stateMem.styleRules[attrKey]||[]).forEach(rule=> renderRow(tbody, attrKey, rule, collectOptionsForAttr(mapped, attrKey)));

  // 读取“实时”已绑定类型（🚫 修复：避免使用初次打开时的闭包常量）
  const boundNow = () => stateMem.boundStyleType[attrKey] || 'none';

  // 状态初始化
  refreshTypeOptions(typeSel);
  typeSel.value = 'none';
  btnConfirm.disabled = true;

  const currentBound = boundNow();
  hintEl.textContent = currentBound==='none' ? '当前样式：无' : `当前样式：${currentBound}`;
  btnAdd.disabled = (currentBound==='none');
  btnReset.style.display = (currentBound==='none') ? 'none' : 'inline-block';
  // 🔒 若已绑定，禁用下拉，必须“重置”后才能换
  typeSel.disabled = currentBound !== 'none';

  // 交互：选择类型（实时读取 boundNow()）
  let stagedType='none';
  typeSel.onchange = ()=>{
    const current = boundNow();
    const val = typeSel.value || 'none';
    if (current !== 'none') {
      // 已绑定的属性，禁止切换
      typeSel.value = 'none';
      btnConfirm.disabled = true;
      hintEl.textContent = `当前绑定：${current}（如需更改，请先“重置”）`;
      return;
    }
    // 全局占用
    const owner = stateMem.styleTypeOwner[val];
    if (val!=='none' && owner && owner!==attrKey) {
      typeSel.value='none'; btnConfirm.disabled=true; hintEl.textContent=`“${val}”已绑定到【${owner}】`; return;
    }
    stagedType=val; btnConfirm.disabled = (stagedType==='none');
  };

  // 确认绑定
  btnConfirm.onclick = ()=>{
    const curr = boundNow();
    if (curr !== 'none') return;      // 二次校验
    if (stagedType==='none') return;

    // 写入占用与绑定
    stateMem.boundStyleType[attrKey] = stagedType;
    stateMem.styleTypeOwner[stagedType] = attrKey;

    // UI 禁用下拉，提示更新
    hintEl.textContent = `当前样式：${stagedType}`;
    btnConfirm.disabled = true;
    btnReset.style.display = 'inline-block';
    btnAdd.disabled = false;
    typeSel.disabled = true;

    // 默认新增一行
    const rule = createEmptyRuleForType(stagedType, () => `rule_${Math.random().toString(36).slice(2,8)}`);
    ensureBucketIn(stateMem.styleRules, attrKey).push(rule);
    renderRow(tbody, attrKey, rule, collectOptionsForAttr(mapped, attrKey));
  };

  // 重置/解绑（清空所有行）
  btnReset.onclick = ()=>{
    const bucketLen = (stateMem.styleRules[attrKey]||[]).length;
    if (bucketLen && !confirm('重置将清空该属性下所有样式行，是否继续？')) return;

    const prev = boundNow();
    if (prev !== 'none' && stateMem.styleTypeOwner[prev]===attrKey) delete stateMem.styleTypeOwner[prev];
    stateMem.boundStyleType[attrKey]='none';
    const bucket=stateMem.styleRules[attrKey]; if (bucket) bucket.length=0;

    // UI 复位
    tbody.innerHTML='';
    hintEl.textContent='当前样式：无';
    btnAdd.disabled=true;
    btnReset.style.display='none';
    typeSel.value='none';
    typeSel.disabled = false; // 解锁下拉
    btnConfirm.disabled = true;
  };

  // 新增一行
  btnAdd.onclick = ()=>{
    const t = boundNow();
    if (!t || t==='none') { alert('请先绑定样式类型'); return; }
    const rule = createEmptyRuleForType(t, () => `rule_${Math.random().toString(36).slice(2,8)}`);
    ensureBucketIn(stateMem.styleRules, attrKey).push(rule);
    renderRow(tbody, attrKey, rule, collectOptionsForAttr(mapped, attrKey));
  };

  // 保存并应用
  btnSave.onclick = ()=>{
    // 清理空行（无值或无样式值）
    const bucket = stateMem.styleRules[attrKey] || [];
    for (let i=bucket.length-1;i>=0;i--){
      const r=bucket[i];
      const hasStyle = (r.type==='fontFamily') ? !!(r.style&&('fontFamily'in r.style)) : !!(r.style&&r.style[r.type]);
      const hasValues = Array.isArray(r.values) && r.values.length>0;
      if (!hasStyle || !hasValues) bucket.splice(i,1);
    }
    persistAndApply('.vis-item.event', '.event-title');
    closeStylePanelLight();
  };

  // 关闭
  btnClose.onclick = ()=> closeStylePanelLight();
  root.querySelector('.sw-backdrop').onclick = ()=> closeStylePanelLight();

  openStylePanelLight();
}

/* ----------------------------------------------------------------
 * 主挂载
 * ---------------------------------------------------------------- */
export async function mountTimeline(container, overrides = {}) {
  if (typeof container === 'string') {
    const node=document.querySelector(container);
    if (!node) { console.error('mountTimeline: 未找到容器选择器：', container); return { timeline:null, items:null, destroy:()=>{} }; }
    container=node;
  }
  if (!container) { console.error('mountTimeline: 容器不存在'); return { timeline:null, items:null, destroy:()=>{} }; }
  if (!window.vis || !window.vis.Timeline || !window.vis.DataSet) {
    container.innerHTML='<div style="padding:12px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">vis.js 未加载，请检查脚本引入顺序。</div>';
    return { timeline:null, items:null, destroy:()=>{} };
  }

  const loading=createLoadingOverlay(); const needRel=getComputedStyle(container).position==='static';
  if (needRel) container.style.position='relative'; container.appendChild(loading);
  injectScopedStyles(container, UI);

  const beforeSelector = container.id ? `#${container.id}` : '#timeline';
  let timeline=null, dataset=null, mapped=null;

  try{
    const raw = await fetchAndNormalize();
    const data = Array.isArray(raw) ? raw : [];
    if (!data.length) { container.innerHTML='<div style="padding:12px;background:#fff3cd;border:1px solid #ffeeba;border-radius:8px;color:#856404;">接口返回 0 条记录。</div>'; return { timeline:null, items:null, destroy:()=>{} }; }

    mapped = data.map((evt,i)=>normalizeEvent(evt,i));
    dataset = new window.vis.DataSet(mapped);

    const tvals = mapped.map(it=>toMs(it.start??it.end)).filter(Number.isFinite);
    let startDate,endDate;
    if (tvals.length){
      const minT=Math.min(...tvals), maxT=Math.max(...tvals), DAY=86400000;
      const pad=Math.max(7*DAY, Math.round((maxT-minT)*0.05));
      startDate=new Date(minT-pad); endDate=new Date(maxT+pad);
    }

    const baseOptions={
      minHeight:UI.canvas.height, maxHeight:UI.canvas.height,
      orientation:{ item:UI.layout.itemPosition, axis:UI.layout.axisPosition },
      margin:{ item:UI.layout.verticalItemGap, axis:50 },
      locale:'en', editable:false, stack:UI.layout.stack,
      verticalScroll:UI.zoom.verticalScroll, zoomKey:UI.zoom.key,
      template:(item,element)=>{
        const host=element?.closest?.('.vis-item')||element; if (host) host.classList.add('event');
        const root=document.createElement('div'); const h4=document.createElement('h4'); h4.className='event-title';
        h4.textContent=item.titleText||item.content||'(无标题)'; root.appendChild(h4); return root;
      },
    };
    const options={...baseOptions,...overrides}; if(startDate) options.start=startDate; if(endDate) options.end=endDate;

    const vis=window.vis; timeline=new vis.Timeline(container,dataset,options);

    // 过滤 UI
    initFilterUI({ beforeElSelector: beforeSelector, getItems: ()=>mapped, getCurrentRules: ()=>getState().rules });

    // 样式按钮
    mountStyleButtonsRightOfFilter(container, mapped);

    // 点击弹窗
    function ensurePopover(){ let pop=container.querySelector('#event-popover');
      if(!pop){ pop=document.createElement('div'); pop.id='event-popover'; container.appendChild(pop); } return pop; }
    const pop=ensurePopover(); let currentAnchor=null;
    function hidePopover(){ pop.style.display='none'; currentAnchor=null; }
    function findAnchorFromProps(props){
      const t=props?.event?.target; const hit=t&&t.closest?t.closest('.vis-item'):null; if (hit) return hit;
      if (props?.item==null) return null; const idSel=(window.CSS&&CSS.escape)?CSS.escape(String(props.item)):String(props.item).replace(/"/g,'\\"');
      return container.querySelector(`.vis-item[data-id="${idSel}"]`);
    }
    function showPopoverOverItem(props){
      const anchor=findAnchorFromProps(props); if(!anchor) return;
      const dsItem=dataset.get(props.item); pop.innerHTML=dsItem?.detailHtml||'<div style="padding:8px;">（无详情）</div>';
      const cb=container.getBoundingClientRect(); const ib=anchor.getBoundingClientRect();
      const MIN_W=280, MIN_H=140; const MAX_W=Math.min(520,container.clientWidth); const MAX_H=Math.min(container.clientHeight*0.6,600);
      let left=ib.left-cb.left+container.scrollLeft; let top=ib.top-cb.top+container.scrollTop;
      const width=Math.min(Math.max(ib.width,MIN_W),MAX_W); const height=Math.min(Math.max(ib.height,MIN_H),MAX_H);
      const maxLeft=container.scrollLeft+(container.clientWidth-width-8); const maxTop=container.scrollTop+(container.clientHeight-height-8);
      left=Math.max(container.scrollLeft,Math.min(left,maxLeft)); top=Math.max(container.scrollTop,Math.min(top,maxTop));
      pop.style.left=`${left}px`; pop.style.top=`${top}px`; pop.style.width=`${width}px`; pop.style.height=`${height}px`; pop.style.display='block'; currentAnchor=anchor;
    }
    timeline.on('click',(props)=>{ if(!props||props.item==null){ hidePopover(); return; } showPopoverOverItem(props); });
    document.addEventListener('mousedown',(e)=>{ if(pop.style.display==='none')return; const inPop=pop.contains(e.target);
      const onAnchor=currentAnchor&&currentAnchor.contains(e.target); if(!inPop&&!onAnchor) hidePopover(); });
    window.addEventListener('resize',()=>{ timeline.redraw(); hidePopover(); });

    // 过滤事件
    window.addEventListener('filter:add-rule:confirm',(e)=>{ const {key,values}=e.detail||{}; upsertRule(key,values); });
    window.addEventListener('filter:set-logic',(e)=>{ const mode=e?.detail?.mode; setLogic(mode); const next=applyFilters(mapped,getState());
      dataset.clear(); dataset.add(next); });
    window.addEventListener('filter:reset',()=>{ clearRules(); dataset.clear(); dataset.add(mapped); });
    window.addEventListener('filter:remove-rule',(e)=>{ const key=e?.detail?.key; if(key) removeRule(key); });

    return { timeline, items: dataset, destroy: ()=> timeline.destroy() };
  } catch(err){
    console.error(err);
    container.innerHTML=`<div style="padding:16px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">加载失败：${toPlain(err?.message||err)}</div>`;
    return { timeline:null, items:null, destroy:()=>{} };
  } finally { try{ container.contains(loading)&&loading.remove(); }catch{} }
}

export default mountTimeline;
