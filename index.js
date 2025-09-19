// index.js —— Express 入口（同源托管静态页面 + 样式编译 API）

const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// ✅ 从独立模块加载“编译器”
const { compileStyleRules } = require('./server/compiler/compileStyleRules');

// ====== 全局中间件 ======
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // 接收 JSON

// ====== 静态资源（前端页面） ======
// public/ 里放 viewer.html、以及 public/src/... 前端代码
app.use(express.static(path.join(__dirname, 'public')));

// ====== 健康检查 / 示例接口 ======
app.get('/api/ping', (req, res) => {
  res.json({ message: '服务器正常运行中' });
});

app.post('/submit', (req, res) => {
  console.log('接收到数据：', req.body);
  res.json({ success: true, message: '提交成功！' });
});

// ====== 样式编译 API（前端把 state 发过来，后端返回 text/css） ======
app.post('/api/compile-style', (req, res) => {
  const { state, options } = req.body || {};
  if (!state || typeof state !== 'object') {
    return res.status(400).send('bad state');
  }
  try {
    const css = compileStyleRules(state, {
      // 支持多基选择器：".vis-item.event, .vis-item-content.event"
      selectorBase: options?.selectorBase || '.vis-item.event, .vis-item-content.event',
      titleSelector: options?.titleSelector || '.event-title',
      // 也可传 attrPriority；未传则在模块内用默认值
      attrPriority: options?.attrPriority
    });
    res.type('text/css; charset=utf-8').send(css);
  } catch (e) {
    console.error('compile error:', e);
    res.status(500).send('compile error');
  }
});

// ====== 启动服务 ======
app.listen(port, () => {
  console.log(`服务运行在 http://localhost:${port}`);
});
