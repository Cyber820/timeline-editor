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

// ✅ 设置静态文件夹，比如 public 文件夹中放置 editor.html/test.html
app.use(express.static(path.join(__dirname, 'public')));

// 示例接口
app.get('/api/ping', (req, res) => {
  res.json({ message: '服务器正常运行中' });
});

app.post('/submit', (req, res) => {
  console.log('接收到数据：', req.body);
  res.json({ success: true, message: '提交成功！' });
});

app.listen(port, () => {
  console.log(`服务运行在 http://localhost:${port}`);
});
