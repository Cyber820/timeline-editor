const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// ✅ 启用 CORS，允许所有来源访问（你也可以限制具体域名）
app.use(cors());

// ✅ 处理表单提交（如果需要支持 POST 请求中的表单数据）
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 示例 GET 路由（用于健康检查或测试）
app.get('/', (req, res) => {
  res.send('TimeLine API 正常运行中！');
});

// 示例 POST 接口（用于接收表单数据提交）
app.post('/submit', (req, res) => {
  const body = req.body;
  console.log('收到提交数据:', body);
  res.json({ success: true, message: '提交成功！' });
});

// 启动服务
app.listen(port, () => {
  console.log(`服务已启动，监听端口 ${port}`);
});
