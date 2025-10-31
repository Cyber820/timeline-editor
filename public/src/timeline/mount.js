// public/src/mount.js
async function loadAndRender() {
// 取消上一次中的请求，避免竞态
if (inflight) inflight.abort();
inflight = createAborter();


// 记录弹窗焦点，防止刷新后丢失
const activeEl = document.activeElement;


try {
const data = await fetchTimelineData({ signal: inflight.signal });
ingestData(data);


// 首次挂载：初始化 Timeline（如已在别处完成初始化，可在此处省略）
if (!mounted) {
const container = document.getElementById('timeline');
if (container && window.vis && window.vis.Timeline) {
const dataset = new window.vis.DataSet(currentItems);
timeline = new window.vis.Timeline(container, dataset, {
// 这里保守设置，不去影响你的弹窗层；如需更多选项可自行补充
stack: true,
multiselect: true,
editable: false,
});
// 暴露给外部调试
globalThis.__TIMELINE_DATASET__ = dataset;
} else {
// 若你的实例化不在这里完成，也允许仅分发事件给其它模块
const evt = new CustomEvent('timeline:data', { detail: { items: currentItems, originalItems } });
window.dispatchEvent(evt);
}
mounted = true;
} else {
// 已挂载：仅更新数据集/分发事件
if (timeline && globalThis.__TIMELINE_DATASET__) {
const ds = globalThis.__TIMELINE_DATASET__;
ds.clear();
ds.add(currentItems);
} else {
const evt = new CustomEvent('timeline:data', { detail: { items: currentItems, originalItems } });
window.dispatchEvent(evt);
}
}
} catch (err) {
console.error('[mount.js] 载入失败：', err);
const evt = new CustomEvent('timeline:error', { detail: { error: err } });
window.dispatchEvent(evt);
} finally {
// 尝试恢复焦点，避免弹窗失焦
try { activeEl && activeEl.focus && activeEl.focus(); } catch (_) {}
inflight = null;
}
}


// 旧版逻辑：等样式系统 ready 再取数
window.addEventListener('style:ready', () => {
loadAndRender();
});


// 若你需要在外部手动刷新
export function refreshTimelineData() {
return loadAndRender();
}
