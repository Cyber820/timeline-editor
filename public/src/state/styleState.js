// src/state/styleState.js
const KEY = 'timelineStyle.v1';

const DEFAULT_STATE = {
  version: 1,
  boundTypes: {},   // 例：{ EventType: 'textColor' }
  rules: {}         // 例：{ EventType: { '主机游戏': { textColor:'#eab308' } } }
};

export function getStyleState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const obj = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...obj };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function setStyleState(next) {
  const safe = { ...DEFAULT_STATE, ...next };
  localStorage.setItem(KEY, JSON.stringify(safe));
  window.dispatchEvent(new CustomEvent('timeline:styleState', { detail: safe }));
  return safe;
}

export function onStyleStateChange(handler) {
  window.addEventListener('timeline:styleState', e => handler(e.detail));
}
