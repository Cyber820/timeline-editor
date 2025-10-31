// public/src/fetch.js
// 统一的取数封装，默认使用 constants.js 提供的 ENDPOINT（含兜底）


import { ENDPOINT as ENDPOINT_FROM_CONST } from './constants.js';


// 允许通过全局变量或 import 覆盖，但始终兜底
const ENDPOINT = (globalThis && globalThis.TIMELINE_ENDPOINT) || ENDPOINT_FROM_CONST;


if (!ENDPOINT || typeof ENDPOINT !== 'string') {
throw new Error('[fetch.js] 未检测到有效的 ENDPOINT。请确认 constants.js 已正确导出 ENDPOINT。');
}


// 通用 GET JSON
async function getJSON(url, { signal } = {}) {
const res = await fetch(url, { signal, credentials: 'omit', cache: 'no-store' });
if (!res.ok) {
const text = await res.text().catch(() => '');
throw new Error(`[fetch.js] 请求失败 ${res.status}: ${text || res.statusText}`);
}
return res.json();
}


// 拉取时间轴主数据（默认行为）
export async function fetchTimelineData({ params = {}, signal } = {}) {
const sp = new URLSearchParams({ _ts: String(Date.now()) });
for (const [k, v] of Object.entries(params)) {
if (v != null && v !== '') sp.set(k, String(v));
}
const url = `${ENDPOINT}?${sp.toString()}`;
return getJSON(url, { signal });
}


// 拉取筛选项（旧逻辑里 action=options）
export async function fetchTimelineOptions({ signal } = {}) {
const sp = new URLSearchParams({ action: 'options', _ts: String(Date.now()) });
const url = `${ENDPOINT}?${sp.toString()}`;
return getJSON(url, { signal });
}


// 便捷的可中断控制器工厂
export function createAborter() {
const controller = new AbortController();
return {
controller,
signal: controller.signal,
abort: () => controller.abort(),
};
}


export { ENDPOINT };
