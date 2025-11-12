// public/src/timeline/mount.js
// 修复要点：
// - 属性选择器「唯一占用」：同一属性的值不会在多行重复占用（除当前行已选）
// - 初次挂载 & 保存后都会 applyStyleState；selectorBase 固定 .vis-item.event
// - 事件卡只显示标题；点击弹窗分栏显示
// - 样式按钮挂在过滤按钮右侧；字体含“隶书/幼圆”

import { fetchAndNormalize } from './fetch.js';
import { initFilterUI } from '../filter/filter-ui.js';
import { setLogic, upsertRule, clearRules, removeRule, getState } from '../filter/filter-state.js';
import { applyFilters } from '../filter/filter-engine.js';

import { stateMem } from '../style/stateMem.js';
import { buildEngineStyleState, ENGINE_KEY_MAP, createEmptyRuleForType, ensureBucketIn } from '../_staging/constants.js';
import { setStyleState, getStyleState } from '../state/styleState.js';
import { applyStyleState, attachEventDataAttrs } from '../style/engine.js';

const UI = {
  canvas: { height: 1000 },
  item: { fontSize: 10, paddingX: 10, paddingY: 6, borderRadius: 10, maxWidth: 320 },
  layout: { itemPosition: 'bottom', axisPosition: 'bottom', verticalItemGap: 5, stack: true },
  zoom: { key: 'ctrlKey', verticalScroll: true },
};

function toPlain(x){ return x==null?'':String(x).replace(/<[^>]*>/g,'').trim(); }
function asDisplay(v){ const s=v==null?'':String(v).trim(); return s?s:'—'; }

const FIELD_LABELS = ['事件名称','事件类型','时间','状态','地区','平台类型','主机类型','公司','标签','描述','贡献者'];

function parseBlobFields(blob){
  const s=toPlain(blob); const out={}; if(!s) return out;
  const escaped=FIELD_LABELS.map(l=>l.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const lookahead='(?=\\s*(?:'+escaped.join('|')+')\\s*[:：]|$)';
  for(const label of FIELD_LABELS){
    const re=new RegExp(label+'\\s*[:：]\\s*([\\s\\S]*?)'+lookahead,'i');
    const m=re.exec(s); if(m) out[label]=m[1].replace(/\\n/g,'\n').trim();
  }
  const t=out['时间'];
  if(t){
    const m1=/([0-9]{4}-[0-9]{2}-[0-9]{2})\s*[~—–-]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(t);
    if(m1){ out.__start=m1[1]; out.__end=m1[2]; }
    else{ const m2=/([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(t); if(m2) out.__start=m2[1]; }
  }
  return out;
}
function normalizeTags(v){ if(!v&&v!==0) return []; if(Array.isArray(v)) return v.filter(Boolean);
  return String(v).split(',').map(s=>s.trim()).filter(Boolean); }
function toMs(ts){ if(typeof ts==='number') return ts; const n=+new Date(ts); return Number.isFinite(n)?n:NaN; }

function buildKvHTML(obj){
  const kv=[
    ['事件名称',obj.title],['开始时间',obj.start],['结束时间',obj.end],['事件类型',obj.EventType],
    ['地区',obj.Region],['平台类型',obj.Platform],['主机类型',obj.ConsolePlatform],['公司',obj.Company],
    ['标签',Array.isArray(obj.Tag)?obj.Tag.join('，'):(obj.Tag||'')],['描述',obj.Description],['贡献者',obj.Contributor||obj.Submitter]
  ];
  const rows=kv.map(([k,v])=>(
    '<div class="kv-row" style="display:flex;gap:8px;align-items:flex-start;">' +
    '<dt class="kv-key" style="min-width:84px;flex:0 0 auto;font-weight:600;">'+k+'</dt>' +
    '<dd class="kv-val" style="margin:0;white-space:pre-wrap;word-break:break-word;">'+asDisplay(v)+'</dd>' +
    '</div>'
  )).join('');
  return '<div style="font-weight:700;margin-bottom:8px">'+asDisplay(obj.title)+'</div>' +
         '<dl class="kv" style="display:flex;flex-direction:column;gap:6px;font-size:13px;line-height:1.6;">'+rows+'</dl>';
}

function injectScopedStyles(container, ui){
  const scope='tl-scope-'+Math.random().toString(36).slice(2,8);
  container.classList.add(scope);
  const css =
    '.'+scope+' .vis-item.event{border-radius:'+ui.item.borderRadius+'px;}' +
    '.'+scope+' .vis-item .vis-item-content{padding:'+ui.item.paddingY+'px '+ui.item.paddingX+'px;max-width:'+ui.item.maxWidth+'px;}' +
    '.'+scope+' .event-title{font-size:'+ui.item.fontSize+'px;line-height:1.4;margin:0;max-width:'+ui.item.maxWidth+'px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.'+scope+' #event-popover{position:absolute;z-index:1000;background:#fff;border:1px solid #e5e7eb;box-shadow:0 8px 24px rgba(0,0,0,.15);' +
    'border-radius:10px;padding:12px;overflow:auto;pointer-events:auto;min-width:280px;min-height:140px;max-width:700px;max-height:70vh;font-size:12px;line-height:1;display:none;}' +
    '.te-style-btn{display:inline-flex;align-items:center;gap:.25rem;padding:.35rem .6rem;border:1px solid #dadde1;border-radius:.5rem;background:#fff;cursor:pointer;font-size:.9rem;}' +
    '.te-style-btn+.te-style-btn{margin-left:.5rem}.te-style-btn:hover{background:#f6f7f9}' +
    '#style-window{position:fixed;inset:0;z-index:9999;display:none}' +
    '#style-window .sw-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.35)}' +
    '#style-window .sw-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(980px,94vw);max-height:80vh;overflow:auto;background:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.25)}' +
    '#style-window header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #eee}' +
    '#style-window section{padding:16px 18px}#style-window footer{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid #eee}' +
    '#styleTable{width:100%;border-collapse:collapse}#styleTable thead tr{border-bottom:1px solid #eee}#styleTable th,#styleTable td{text-align:left;padding:8px 4px}' +
    '.attr-chips span{display:inline-block;padding:2px 6px;margin:2px;border:1px solid #ccc;border-radius:10px;font-size:12px}' +
    '.te-muted{color:#666;font-size:.9rem}';
  const styleEl=document.createElement('style'); styleEl.textContent=css; styleEl.setAttribute('data-scope',scope);
  container.appendChild(styleEl);
  return scope;
}

function createLoadingOverlay(){
  const el=document.createElement('div');
  el.setAttribute('role','status'); el.setAttribute('aria-live','polite'); el.textContent='加载时间轴数据中…';
  el.style.cssText='position:absolute;top:12px;left:12px;background:#fff;border:1px solid #e5e7eb;padding:6px 10px;border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,.04);z-index:10;font-size:12px;';
  return el;
}

/* 数据映射 */
function normalizeEvent(event,i){
  const Start=event.Start??event.start??''; const End=event.End??event.end??'';
  const blob=(event.title||event.content||'').toString();
  const parsed=parseBlobFields(blob);

  const title=toPlain(event.Title)||parsed['事件名称']||toPlain(event.title)||toPlain(event.content)||'(无标题)';
  const start=Start||parsed.__start||''; const end=End||parsed.__end||'';
  const EventType=event.EventType??parsed['事件类型']||''; const Region=event.Region??parsed['地区']||'';
  const Platform=event.Platform??parsed['平台类型']||''; const Company=event.Company??parsed['公司']||'';
  const Status=event.Status??parsed['状态']||''; const ConsolePlatform=event.ConsolePlatform??parsed['主机类型']||'';
  const Desc=event.Description??parsed['描述']||''; const Contrib=event.Contributor??event.Submitter??parsed['贡献者']||'';
  const Tag=normalizeTags(event.Tag??parsed['标签']||'');

  const detailHtml=buildKvHTML({ title, start, end, EventType, Region, Platform, Company, ConsolePlatform, Tag, Description:Desc, Contributor:Contrib, Status });

  return {
    id: event.id || `auto-${i+1}`,
    content: title, titleText: title,
    start: start || undefined, end: end || undefined,
    detailHtml,
    EventType, Region, Platform, Company, Status, ConsolePlatform, Tag
  };
}

/* ============== 样式面板（简化自包含版本） ============== */
const STYLE_ATTR_BTNS = [
  { label:'事件样式', field:'EventType' },
  { label:'平台样式', field:'Platform' },
  { label:'主机样式', field:'ConsolePlatform' },
  { label:'公司样式', field:'Company' },
  { label:'地区样式', field:'Region' },
];

const UI_STYLE_TYPES = [
  { key:'fontColor', label:'字体颜色' },
  { key:'backgroundColor', label:'背景颜色' },
  { key:'borderColor', label:'边框颜色' },
  { key:'fontFamily', label:'字体' },
  { key:'haloColor', label:'光晕颜色' },
];

let panelInjected=false;
function ensureStylePanelInjected(){
  if(panelInjected) return;
  const host=document.createElement('div');
  host.id='style-window';
  host.innerHTML =
    '<div class="sw-backdrop"></div>' +
    '<div class="sw-panel">' +
      '<header>' +
        '<div><div id="style-title" style="font-weight:600;font-size:1.05rem;">样式</div>' +
        '<div id="bound-type-hint" class="te-muted" style="margin-top:4px;">当前样式：无</div></div>' +
        '<button id="style-close" title="关闭" style="border:none;background:transparent;font-size:20px;cursor:pointer;">×</button>' +
      '</header>' +
      '<section>' +
        '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">' +
          '<label>样式类型：</label>' +
          '<select id="style-type-select"><option value="none">（未选择）</option>' +
          UI_STYLE_TYPES.map(t=>'<option value="'+t.key+'">'+t.label+'</option>').join('') +
          '</select>' +
          '<button id="style-confirm" style="display:inline-block;" disabled>确认绑定</button>' +
          '<button id="style-reset" style="display:none;">重置</button>' +
          '<button id="style-add" disabled>新增样式行</button>' +
        '</div>' +
        '<table id="styleTable"><thead><tr>' +
        '<th style="width:36%;">样式</th><th>作用属性值</th><th style="width:72px;">操作</th>' +
        '</tr></thead><tbody id="styleTableBody"></tbody></table>' +
      '</section>' +
      '<footer><button id="style-save" style="background:#111;color:#fff;border:1px solid #111;border-radius:8px;padding:8px 12px;cursor:pointer;">保存并应用</button></footer>' +
    '</div>';
  document.body.appendChild(host);
  panelInjected=true;
}

function openStylePanelLight(){ ensureStylePanelInjected(); document.getElementById('style-window').style.display='block'; }
function closeStylePanelLight(){ const el=document.getElementById('style-window'); if(el) el.style.display='none'; }

function buildColorControl(rule){
  const wrap=document.createElement('div');
  const color=document.createElement('input'); color.type='color';
  const hex=document.createElement('input'); hex.type='text'; hex.placeholder='#RRGGBB'; hex.style.marginLeft='6px';
  const current=String(rule.style?.[rule.type]||'#000000').toUpperCase();
  color.value=/^#[0-9A-Fa-f]{6}$/.test(current)?current:'#000000'; hex.value=color.value;
  function norm(v){ let s=String(v||'').trim(); if(!s) return null; if(s[0]!=='#') s='#'+s;
    if(/^#([0-9a-fA-F]{3})$/.test(s)) s='#'+s.slice(1).split('').map(c=>c+c).join('');
    if(/^#([0-9a-fA-F]{6})$/.test(s)) return s.toUpperCase(); return null; }
  color.addEventListener('input',()=>{ const v=color.value.toUpperCase(); hex.value=v; (rule.style ||= {})[rule.type]=v; });
  hex.addEventListener('change',()=>{ const v=norm(hex.value)||color.value.toUpperCase(); hex.value=v; color.value=v; (rule.style ||= {})[rule.type]=v; });
  wrap.appendChild(color); wrap.appendChild(hex); return wrap;
}
function buildFontControl(rule){
  const wrap=document.createElement('div');
  const sel=document.createElement('select');
  sel.innerHTML =
    '<option value="">（默认字体）</option>' +
    '<option value="Microsoft YaHei, PingFang SC, Noto Sans SC, system-ui">微软雅黑 / 苹方 / 思源黑体</option>' +
    '<option value="SimHei">黑体 (SimHei)</option>' +
    '<option value="SimSun">宋体 (SimSun)</option>' +
    '<option value="KaiTi">楷体 (KaiTi)</option>' +
    '<option value="LiSu">隶书 (LiSu)</option>' +
    '<option value="YouYuan">幼圆 (YouYuan)</option>' +
    '<option value="STCaiyun">华文彩云 (STCaiyun)</option>' +
    '<option value="FZShuTi">方正舒体 (FZShuTi)</option>';
  sel.value=rule.style?.fontFamily||'';
  sel.addEventListener('change',()=>{ (rule.style ||= {}).fontFamily = sel.value || ''; });
  wrap.appendChild(sel); return wrap;
}
function buildStyleCellControl(rule){
  if(['fontColor','backgroundColor','borderColor','haloColor'].includes(rule.type)) return buildColorControl(rule);
  if(rule.type==='fontFamily') return buildFontControl(rule);
  const span=document.createElement('span'); span.textContent=rule.type; return span;
}

function uniqueSorted(list){ return Array.from(new Set((list||[]).filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b))); }

function renderChips(container, values){
  container.innerHTML='';
  const list=Array.isArray(values)?values:[];
  if(!list.length){ const s=document.createElement('span'); s.className='te-muted'; s.textContent='（未选择）'; container.appendChild(s); return; }
  list.forEach(v=>{ const tag=document.createElement('span'); tag.textContent=v; container.appendChild(tag); });
}

/** —— 关键修复：计算「已被其它行占用」的值（同一属性内唯一） —— */
function getTakenValuesForAttr(attrKey, exceptRowId){
  const taken=new Set();
  const bucket = (stateMem.styleRules && stateMem.styleRules[attrKey]) || [];
  for(const r of bucket){
    if(exceptRowId && r.id===exceptRowId) continue;
    const vals = Array.isArray(r.values) ? r.values : [];
    for(const v of vals) taken.add(v);
  }
  return taken;
}

function renderRow(containerTbody, attrKey, rule, allOptionsForAttr){
  const tr=document.createElement('tr');
  tr.dataset.rowId=rule.id; tr.dataset.attrKey=attrKey;

  const tdStyle=document.createElement('td');
  tdStyle.dataset.styleType=rule.type;
  tdStyle.appendChild(buildStyleCellControl(rule));
  tr.appendChild(tdStyle);

  const tdVals=document.createElement('td');
  const chips=document.createElement('div'); chips.className='attr-chips'; chips.style.minHeight='28px';
  tdVals.appendChild(chips);

  const btnPick=document.createElement('button'); btnPick.type='button'; btnPick.textContent='添加/修改属性'; btnPick.style.marginLeft='8px';
  tdVals.appendChild(btnPick);
  tr.appendChild(tdVals);

  renderChips(chips, rule.values || []);

  // 选择器 —— 左“确定”右“取消”，并且禁选已被其它行占用的值
  btnPick.addEventListener('click', ()=>{
    const list = uniqueSorted(allOptionsForAttr);
    const current = new Set(Array.isArray(rule.values)?rule.values:[]);
    const taken = getTakenValuesForAttr(attrKey, rule.id); // 👈 除当前行之外的占用

    const box=document.createElement('div');
    box.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;';
    const panel=document.createElement('div');
    panel.style.cssText='width:min(720px,92vw);max-height:70vh;overflow:auto;background:#fff;border-radius:10px;padding:12px;box-shadow:0 12px 40px rgba(0,0,0,.35);';
    panel.innerHTML='<div style="font-weight:600;margin-bottom:8px;">选择属性值</div>';

    const grid=document.createElement('div'); grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;';

    list.forEach(v=>{
      const label=document.createElement('label'); label.style.cssText='border:1px solid #e5e7eb;border-radius:8px;padding:6px;display:flex;gap:6px;align-items:center;';
      const cb=document.createElement('input'); cb.type='checkbox';

      const isTaken = taken.has(v) && !current.has(v); // 仅当“被他行占用且当前行未选”时禁选
      cb.checked = current.has(v);
      cb.disabled = isTaken;

      cb.addEventListener('change',()=>{
        if(cb.checked) current.add(v); else current.delete(v);
      });
      const span=document.createElement('span'); span.textContent = isTaken ? (v + '（已被占用）') : v;
      span.style.opacity = isTaken ? '0.55' : '1';

      label.appendChild(cb); label.appendChild(span);
      grid.appendChild(label);
    });

    panel.appendChild(grid);

    const footer=document.createElement('div'); footer.style.cssText='display:flex;justify-content:flex-end;gap:8px;margin-top:10px;';
    const ok=document.createElement('button'); ok.textContent='确定';
    const cancel=document.createElement('button'); cancel.textContent='取消';

    ok.addEventListener('click',()=>{
      // 最终再做一次冲突校验，防御性
      const finalSelected = Array.from(current);
      const finalTaken = getTakenValuesForAttr(attrKey, rule.id);
      const conflict = finalSelected.find(v=> finalTaken.has(v));
      if(conflict){ alert('“'+conflict+'” 已被同属性的其他样式行占用，请取消或更换。'); return; }

      rule.values = finalSelected;
      renderChips(chips, rule.values);
      document.body.removeChild(box);
    });
    cancel.addEventListener('click',()=>document.body.removeChild(box));

    // 左确定，右取消
    footer.appendChild(ok); footer.appendChild(cancel);
    panel.appendChild(footer);
    box.appendChild(panel); document.body.appendChild(box);
  });

  // 删除行
  const tdAction=document.createElement('td');
  const del=document.createElement('button'); del.type='button'; del.title='删除该样式行'; del.textContent='×';
  del.addEventListener('click',()=>{
    const bucket=(stateMem.styleRules && stateMem.styleRules[attrKey]) || [];
    const idx=bucket.findIndex(r=>r.id===rule.id);
    if(idx>=0) bucket.splice(idx,1);
    tr.remove();
  });
  tdAction.appendChild(del); tr.appendChild(tdAction);

  containerTbody.appendChild(tr);
}

function collectOptionsForAttr(mapped, attrKey){
  const vals = mapped.map(it => it?.[attrKey]).flatMap(v => Array.isArray(v)?v:[v]);
  return uniqueSorted(vals.filter(Boolean));
}

function refreshTypeOptions(selectEl){
  if(!selectEl) return;
  Array.from(selectEl.options).forEach(opt=>{
    if(!opt.dataset.baseText) opt.dataset.baseText = opt.textContent;
    const type = opt.value;
    if(type==='none'){ opt.disabled=false; opt.textContent=opt.dataset.baseText; return; }
    const owner = stateMem.styleTypeOwner?.[type];
    const isMine = owner === stateMem.currentStyleAttr;
    opt.disabled = !!(owner && !isMine);
    opt.textContent = opt.dataset.baseText + (owner && !isMine ? `（已绑定：${owner}）` : '');
  });
}

function persistAndApply(){
  const engineState = buildEngineStyleState(stateMem.boundStyleType, stateMem.styleRules, ENGINE_KEY_MAP);
  const saved = setStyleState(engineState);
  // 用与 template 同步的选择器：只针对外层 .vis-item.event
  applyStyleState(saved, { selectorBase: '.vis-item.event', titleSelector: '.event-title' });
}

/* 样式按钮挂载到过滤按钮右侧 */
function mountStyleButtonsRightOfFilter(container, mapped){
  function findFilterBtn(){
    let btn=document.querySelector('[data-role="filter-toggle"],[data-te-filter-toggle]');
    if(btn) return btn;
    const cands=Array.from(document.querySelectorAll('button,[role="button"]'));
    return cands.find(b=>/筛选|过滤/.test((b.textContent||'').trim())) || null;
  }
  function doAttach(){
    const filterBtn=findFilterBtn(); if(!filterBtn) return false;
    const frag=document.createDocumentFragment();
    STYLE_ATTR_BTNS.forEach(def=>{
      const b=document.createElement('button');
      b.type='button'; b.className='te-style-btn'; b.textContent=def.label;
      b.addEventListener('click',()=>openStyleEditorFor(def.field, mapped));
      frag.appendChild(b);
    });
    filterBtn.parentElement && (filterBtn.nextSibling
      ? filterBtn.parentElement.insertBefore(frag, filterBtn.nextSibling)
      : filterBtn.parentElement.appendChild(frag));
    return true;
  }
  if(doAttach()) return;
  const obs=new MutationObserver(()=>{ if(doAttach()) obs.disconnect(); });
  obs.observe(document.body,{childList:true,subtree:true});
  [120,400,1000].forEach(ms=>setTimeout(()=>doAttach(),ms));
}

function openStyleEditorFor(attrKey, mapped){
  ensureStylePanelInjected();

  stateMem.currentStyleAttr = attrKey;
  stateMem.boundStyleType ||= {};
  stateMem.styleTypeOwner ||= {};
  stateMem.styleRules ||= {};
  stateMem.styleRowSelections ||= {};

  const titleEl=document.getElementById('style-title');
  const hintEl=document.getElementById('bound-type-hint');
  const typeSel=document.getElementById('style-type-select');
  const tbody=document.getElementById('styleTableBody');
  const btnClose=document.getElementById('style-close');
  const btnConfirm=document.getElementById('style-confirm');
  const btnReset=document.getElementById('style-reset');
  const btnAdd=document.getElementById('style-add');
  const btnSave=document.getElementById('style-save');

  titleEl && (titleEl.textContent = `${attrKey} 样式`);

  // 绘制现有行
  if(tbody){
    tbody.innerHTML='';
    const bucket=stateMem.styleRules[attrKey]||[];
    const opts=collectOptionsForAttr(mapped, attrKey);
    bucket.forEach(rule=>renderRow(tbody, attrKey, rule, opts));
  }

  const boundNow=()=> stateMem.boundStyleType[attrKey] || 'none';
  refreshTypeOptions(typeSel);
  if(typeSel) typeSel.value='none';
  btnConfirm && (btnConfirm.disabled=true);

  const currentBound=boundNow();
  hintEl && (hintEl.textContent = currentBound==='none' ? '当前样式：无' : `当前样式：${currentBound}`);
  btnAdd && (btnAdd.disabled = currentBound==='none');
  btnReset && (btnReset.style.display = currentBound==='none' ? 'none' : 'inline-block');
  typeSel && (typeSel.disabled = currentBound!=='none');

  let stagedType='none';
  if(typeSel){
    typeSel.onchange=()=>{
      const current=boundNow();
      const val=typeSel.value||'none';
      if(current!=='none'){
        typeSel.value='none'; btnConfirm && (btnConfirm.disabled=true);
        hintEl && (hintEl.textContent=`当前绑定：${current}（如需更改，请先“重置”）`);
        return;
      }
      const owner=stateMem.styleTypeOwner?.[val];
      if(val!=='none' && owner && owner!==attrKey){
        typeSel.value='none'; btnConfirm && (btnConfirm.disabled=true);
        hintEl && (hintEl.textContent=`“${val}”已绑定到【${owner}】`); return;
      }
      stagedType=val; btnConfirm && (btnConfirm.disabled = (stagedType==='none'));
    };
  }

  btnConfirm && (btnConfirm.onclick=()=>{
    const curr=boundNow(); if(curr!=='none'||stagedType==='none') return;
    stateMem.boundStyleType[attrKey]=stagedType;
    stateMem.styleTypeOwner[stagedType]=attrKey;

    hintEl && (hintEl.textContent=`当前样式：${stagedType}`);
    btnConfirm.disabled=true; btnReset && (btnReset.style.display='inline-block');
    btnAdd && (btnAdd.disabled=false); typeSel && (typeSel.disabled=true);

    const rule=createEmptyRuleForType(stagedType, ()=> 'rule_'+Math.random().toString(36).slice(2,8));
    ensureBucketIn(stateMem.styleRules, attrKey).push(rule);
    tbody && renderRow(tbody, attrKey, rule, collectOptionsForAttr(mapped, attrKey));
  });

  btnReset && (btnReset.onclick=()=>{
    const bucketLen=(stateMem.styleRules[attrKey]||[]).length;
    if(bucketLen && !confirm('重置将清空该属性下所有样式行，是否继续？')) return;
    const prev=boundNow();
    if(prev!=='none' && stateMem.styleTypeOwner[prev]===attrKey) delete stateMem.styleTypeOwner[prev];
    stateMem.boundStyleType[attrKey]='none';
    const bucket=stateMem.styleRules[attrKey]; if(bucket) bucket.length=0;

    tbody && (tbody.innerHTML='');
    hintEl && (hintEl.textContent='当前样式：无');
    btnAdd && (btnAdd.disabled=true);
    btnReset.style.display='none';
    if(typeSel){ typeSel.value='none'; typeSel.disabled=false; }
    btnConfirm && (btnConfirm.disabled=true);

    // 即刻应用清空后的样式
    persistAndApply();
  });

  btnAdd && (btnAdd.onclick=()=>{
    const t=boundNow(); if(!t||t==='none'){ alert('请先绑定样式类型'); return; }
    const rule=createEmptyRuleForType(t, ()=> 'rule_'+Math.random().toString(36).slice(2,8));
    ensureBucketIn(stateMem.styleRules, attrKey).push(rule);
    tbody && renderRow(tbody, attrKey, rule, collectOptionsForAttr(mapped, attrKey));
  });

  btnSave && (btnSave.onclick=()=>{
    const bucket=stateMem.styleRules[attrKey]||[];
    for(let i=bucket.length-1;i>=0;i--){
      const r=bucket[i];
      const hasStyle = (r.type==='fontFamily') ? !!(r.style && ('fontFamily' in r.style)) : !!(r.style && r.style[r.type]);
      const hasValues = Array.isArray(r.values) && r.values.length>0;
      if(!hasStyle || !hasValues) bucket.splice(i,1);
    }
    persistAndApply();
    closeStylePanelLight();
  });

  const closeBtn=document.getElementById('style-close');
  closeBtn && (closeBtn.onclick=()=>closeStylePanelLight());
  const backdrop=document.querySelector('#style-window .sw-backdrop');
  backdrop && (backdrop.onclick=()=>closeStylePanelLight());

  openStylePanelLight();
}

/* ============== 主挂载 ============== */
export async function mountTimeline(container, overrides = {}){
  if(typeof container==='string'){
    const node=document.querySelector(container);
    if(!node){ console.error('mountTimeline: 未找到容器选择器：', container); return { timeline:null, items:null, destroy(){}}; }
    container=node;
  }
  if(!container){ console.error('mountTimeline: 容器不存在'); return { timeline:null, items:null, destroy(){}}; }
  if(!window.vis || !window.vis.Timeline || !window.vis.DataSet){
    container.innerHTML='<div style="padding:12px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">vis.js 未加载，请检查脚本引入顺序。</div>';
    return { timeline:null, items:null, destroy(){} };
  }

  const loading=createLoadingOverlay();
  const needRel=getComputedStyle(container).position==='static';
  if(needRel) container.style.position='relative';
  container.appendChild(loading);
  injectScopedStyles(container, UI);

  const beforeSelector = container.id ? `#${container.id}` : '#timeline';
  let timeline=null, dataset=null, mapped=null;

  try{
    const raw=await fetchAndNormalize();
    const data=Array.isArray(raw)?raw:[];
    if(!data.length){
      container.innerHTML='<div style="padding:12px;background:#fff3cd;border:1px solid #ffeeba;border-radius:8px;color:#856404;">接口返回 0 条记录。</div>';
      return { timeline:null, items:null, destroy(){} };
    }

    mapped=data.map((evt,i)=>normalizeEvent(evt,i));
    dataset=new window.vis.DataSet(mapped);

    const tvals=mapped.map(it=>toMs(it.start??it.end)).filter(Number.isFinite);
    let startDate,endDate;
    if(tvals.length){
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
        const host=element?.closest?.('.vis-item')||element;
        if(host){ host.classList.add('event'); try{ attachEventDataAttrs(host, item); }catch{} }
        const root=document.createElement('div');
        const h4=document.createElement('h4'); h4.className='event-title'; h4.textContent=item.titleText||item.content||'(无标题)';
        root.appendChild(h4); return root;
      }
    };
    const options={...baseOptions, ...overrides};
    if(startDate) options.start=startDate; if(endDate) options.end=endDate;

    const vis=window.vis; timeline=new vis.Timeline(container,dataset,options);

    // 顶部过滤 UI
    initFilterUI({ beforeElSelector: beforeSelector, getItems: ()=>mapped, getCurrentRules: ()=>getState().rules });

    // 样式按钮
    mountStyleButtonsRightOfFilter(container, mapped);

    // 初次挂载：应用已有样式（修复“样式未显示”）
    const saved = getStyleState();
    if (saved && saved.boundTypes) {
      applyStyleState(saved, { selectorBase: '.vis-item.event', titleSelector: '.event-title' });
    }

    // 点击弹窗（仅点击）
    function ensurePopover(){ let pop=container.querySelector('#event-popover');
      if(!pop){ pop=document.createElement('div'); pop.id='event-popover'; container.appendChild(pop); } return pop; }
    const pop=ensurePopover(); let currentAnchor=null;
    function hidePopover(){ pop.style.display='none'; currentAnchor=null; }
    function findAnchorFromProps(props){
      const t=props?.event?.target; const hit=t&&t.closest?t.closest('.vis-item'):null;
      if(hit) return hit;
      if(props?.item==null) return null;
      const idStr=String(props.item).replace(/"/g,'\\"');
      return container.querySelector('.vis-item[data-id="'+idStr+'"]');
    }
    function showPopoverOverItem(props){
      const anchor=findAnchorFromProps(props); if(!anchor) return;
      const dsItem=dataset.get(props.item);
      pop.innerHTML=dsItem?.detailHtml||'<div style="padding:8px;">（无详情）</div>';
      const cb=container.getBoundingClientRect(); const ib=anchor.getBoundingClientRect();
      const MIN_W=280, MIN_H=140; const MAX_W=Math.min(520,container.clientWidth); const MAX_H=Math.min(container.clientHeight*0.6,600);
      let left=ib.left-cb.left+container.scrollLeft; let top=ib.top-cb.top+container.scrollTop;
      const width=Math.min(Math.max(ib.width,MIN_W),MAX_W); const height=Math.min(Math.max(ib.height,MIN_H),MAX_H);
      const maxLeft=container.scrollLeft+(container.clientWidth-width-8); const maxTop=container.scrollTop+(container.clientHeight-height-8);
      if(left<container.scrollLeft) left=container.scrollLeft; if(left>maxLeft) left=maxLeft;
      if(top<container.scrollTop) top=container.scrollTop; if(top>maxTop) top=maxTop;
      pop.style.left=left+'px'; pop.style.top=top+'px'; pop.style.width=width+'px'; pop.style.height=height+'px'; pop.style.display='block'; currentAnchor=anchor;
    }
    timeline.on('click',(props)=>{ if(!props||props.item==null){ hidePopover(); return; } showPopoverOverItem(props); });
    document.addEventListener('mousedown',(e)=>{ if(pop.style.display==='none') return; const inPop=pop.contains(e.target); const onAnchor=currentAnchor&&currentAnchor.contains(e.target); if(!inPop&&!onAnchor) hidePopover(); });
    window.addEventListener('resize',()=>{ try{ timeline.redraw(); }catch{} hidePopover(); });

    // 过滤对接
    window.addEventListener('filter:add-rule:confirm',(e)=>{ const {key,values}=e.detail||{}; upsertRule(key,values); });
    window.addEventListener('filter:set-logic',(e)=>{ const mode=e?.detail?.mode; setLogic(mode); const next=applyFilters(mapped,getState()); dataset.clear(); dataset.add(next); });
    window.addEventListener('filter:reset',()=>{ clearRules(); dataset.clear(); dataset.add(mapped); });
    window.addEventListener('filter:remove-rule',(e)=>{ const key=e?.detail?.key; if(key) removeRule(key); });

    return { timeline, items: dataset, destroy(){ try{ timeline.destroy(); }catch{} } };
  } catch(err){
    console.error(err);
    container.innerHTML=`<div style="padding:16px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">加载失败：${toPlain(err?.message||err)}</div>`;
    return { timeline:null, items:null, destroy(){} };
  } finally {
    try{ container.contains(loading)&&loading.remove(); }catch{}
  }
}

export default mountTimeline;
