
# Public：静态页面与前端资源

本目录由项目Express服务器作为静态目录提供。

服务器配置见项目根目录：
`index.js`

## 1. 电子游戏史展示页面

### videogametimeline-world-zh.html

世界电子游戏史横向时间轴（中文）。

### videogametimeline-world-en.html

世界电子游戏史横向时间轴（英文）。

### videogametimeline-china-zh.html

中国电子游戏史横向时间轴（中文）。

### videogametimeline-china-en.html

中国电子游戏史横向时间轴（英文）。

### videogamematrix-world-zh.html

世界电子游戏史二维矩阵（中文）。

当前功能：
- 横轴固定366天
- 纵轴按年份排列
- 事件以标题卡片展示
- 读取与世界中文版时间轴相同的数据源

主程序：
`src/matrix/matrix.js`

样式：
`src/matrix/matrix.css`

暂不支持旧时间轴的过滤及格式编辑功能。

## 2. 编辑与其他页面

### editor.html

现有时间轴数据编辑入口。

### submit.html

现有事件提交相关页面。

### beta.html / beta-en.html

现有测试页面。

### test.html / theview.html

现有辅助或测试页面。

### archive0721.html

现有历史版本页面。

## 3. 主要目录

### src/

前端JavaScript源代码。

详细目录结构：
`src/README.md`

### archive/

历史页面及归档文件。

### server/

public目录内的现有服务器相关代码。

注意：
此目录与项目根目录下的server/不同。

## 4. 其他资源

### moment.min.js

现有Moment.js脚本。

### moment-zh-cn.js

Moment.js中文本地化资源。

### vis-timeline-graph2d.min.js

现有vis-timeline本地脚本。

### vis-timeline-graph2d.min.css

现有vis-timeline本地样式。

这些资源目前继续保留，
新二维矩阵第一阶段不依赖vis.js。

## 5. 其他文档

### README.txt

原有时间轴编辑器部署指南。

包含：
- 编辑器访问方法
- Token访问说明
- 编辑器数据源替换说明

该文件并非本目录的代码结构说明，
因此与本README.md分别保留。

## 6. 开发约定

- 新增HTML页面时更新本README。
- 页面依赖关系以实际import和script标签为准。
- 不擅自更改既有数据接口。
- 新功能优先通过独立模块实现。
- 模块内部的函数文档维护在所属目录README。
