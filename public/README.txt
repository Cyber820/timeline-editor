
# 时间轴编辑器部署指南

## 使用方法：
1. 将所有文件上传到 Railway 项目的 public 文件夹。
2. 匿名用户访问：https://你的域名/editor.html
3. 有 Token 用户访问：https://你的域名/editor.html?token=你的token值

## 更换数据源方法：
编辑 editor.html 中：
  const dataEndpoint = ...
替换为你自己的 Apps Script 接口 URL。
