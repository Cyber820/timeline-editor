const express = require('express');
const path = require('path');
const compression = require('compression');

const app = express();
app.use(compression());
app.use(express.json({ limit: '200kb' }));

// 占位编译API：先返回一段可见效果的CSS（把页面#app变绿）
// 之后我们会把真正的“state→CSS 编译器”搬进来
app.post('/api/compile-style', (req, res) => {
  res.type('text/css; charset=utf-8').send(`
    /* placeholder from server */
    #app { color:#10B981; font-weight:600; }
  `);
});

// 托管静态页面（public）
// 注意：Railway 会在根目录执行；这里回溯到 ../public
app.use('/', express.static(path.join(__dirname, '..', 'public'), {
  maxAge: '1h',
  setHeaders(res, filePath) {
    if (filePath.endsWith('viewer.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// SPA 兜底（可选）：把未知路由回到 viewer.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'viewer.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('Server running on :' + port);
});
