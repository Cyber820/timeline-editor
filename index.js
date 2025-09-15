const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// ✅ 启用 CORS
app.use(cors());

// ✅ 接收 JSON 和表单数据
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ====== 样式编译器（与前端一致的实现，搬到后端）======
const ATTR_KEYS = ['EventType','Company','Tag','Platform','ConsolePlatform','Region'];
const DEFAULT_BORDER_WIDTH = 2;

function cssEscape(s){ return String(s).replace(/["\\]/g, '\\$&'); }
function hexToRGBA(hex, a = 0.35) {
  const s = String(hex || '').replace('#','').trim();
  const to255 = (h) => parseInt(h.length===1 ? h+h : h, 16);
  const r = to255(s.slice(0,2) || '0');
  const g = to255(s.slice(2,4) || '0');
  const b = to255(s.slice(4,6) || '0');
  return `rgba(${r},${g},${b},${a})`;
}
function compileStyleRules(styleState, opts = {}) {
  const selectorBase = opts.selectorBase || '.vis-item.event';
  const titleSel     = opts.titleSelector || '.event-title';
  const priority     = opts.attrPriority || ATTR_KEYS;

  // 把基选择器拆成数组（支持 ".vis-item.event, .vis-item-content.event"）
  const baseList = String(selectorBase).split(',').map(s => s.trim()).filter(Boolean);

  let css = '';
  for (const attr of priority) {
    const type = styleState?.boundTypes?.[attr];
    if (!type || type === 'none') continue;
    const map = styleState?.rules?.[attr] || {};

    for (const [val, conf] of Object.entries(map)) {
      const v = `"${cssEscape(val)}"`;

      // 逐个基选择器拼接属性过滤（Tag 用 ~=，其余用 =）
      const filteredList = (attr === 'Tag')
        ? baseList.map(b => `${b}[data-Tag~=${v}]`)
        : baseList.map(b => `${b}[data-${attr}=${v}]`);

      // 容器自身生效的规则（背景、边框、光晕等）
      const sel = filteredList.join(', ');
      // 作用到标题子的规则（文本色、字体族、粗细）
      const selTitle = filteredList.map(s => `${s} ${titleSel}`).join(', ');

      if (type === 'textColor'   && conf.textColor)   css += `${selTitle}{color:${conf.textColor};}\n`;
      if (type === 'bgColor'     && conf.bgColor)     css += `${sel}{background-color:${conf.bgColor};}\n`;
      if (type === 'fontFamily'  && conf.fontFamily)  css += `${selTitle}{font-family:${conf.fontFamily};}\n`;
      if (type === 'fontWeight'  && conf.fontWeight)  css += `${selTitle}{font-weight:${conf.fontWeight};}\n`;

      if (type === 'borderColor') {
        const parts = [];
        if (conf.borderColor) parts.push(`border-color:${conf.borderColor};`);
        parts.push('border-style:solid;');
        parts.push(`border-width:${DEFAULT_BORDER_WIDTH}px;`);
        parts.push('box-sizing:border-box;');
        css += `${sel}{${parts.join('')}}\n`;
      }

      if (type === 'haloColor' && conf.haloColor) {
        const rgbaStrong = hexToRGBA(conf.haloColor, 0.2);
        const rgbaSoft   = hexToRGBA(conf.haloColor, 0.30);
        css += `${sel}{overflow:visible !important;}\n`;
        css += `${sel}{box-shadow:0 0 0 0px ${rgbaStrong}, 0 0 0 0px ${rgbaSoft}, 0 0 12px 6px ${rgbaSoft} !important;}\n`;
        css += `${sel}.vis-selected{box-shadow:0 0 0 0px ${rgbaStrong}, 0 0 0 6px ${rgbaSoft}, 0 0 28px 14px ${rgbaSoft} !important;}\n`;
      }
    }
  }
  return css;
}


// ✅ 静态文件（public 里放 viewer.html 等）
app.use(express.static(path.join(__dirname, 'public')));

// 示例接口
app.get('/api/ping', (req, res) => {
  res.json({ message: '服务器正常运行中' });
});

app.post('/submit', (req, res) => {
  console.log('接收到数据：', req.body);
  res.json({ success: true, message: '提交成功！' });
});

// ✅ 新增：样式编译 API（前端把 state 发过来，后端返回 CSS）
app.post('/api/compile-style', (req, res) => {
  const { state, options } = req.body || {};
  if (!state || typeof state !== 'object') {
    return res.status(400).send('bad state');
  }
  try {
    const css = compileStyleRules(state, {
      selectorBase: options?.selectorBase || '.vis-item.event, .vis-item-content.event',
      titleSelector: options?.titleSelector || '.event-title'
    });
    res.type('text/css; charset=utf-8').send(css);
  } catch (e) {
    console.error('compile error:', e);
    res.status(500).send('compile error');
  }
});

app.listen(port, () => {
  console.log(`服务运行在 http://localhost:${port}`);
});
