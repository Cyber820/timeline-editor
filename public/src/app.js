// src/app.js
import { attachEventDataAttrs, applyStyleState } from './style/engine.js';
import { getStyleState, setStyleState, onStyleStateChange } from './state/styleState.js';

// 暴露给现有内联代码使用（避免你现在就重写那段脚本）
window.__styleEngine = { attachEventDataAttrs, applyStyleState };
window.__styleState  = { getStyleState, setStyleState, onStyleStateChange };

console.log('app.js loaded (style engine + state ready)');
