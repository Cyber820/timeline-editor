
# 前端源代码目录（public/src）

本目录存放时间轴及相关页面的前端JavaScript模块。

## 1. 主要目录

### matrix/

二维电子游戏史矩阵模块。

职责：
- 日期与年份二维坐标
- 矩阵布局
- 事件卡片展示

详细函数、参数及依赖：
参见 `matrix/README.md`

### timeline/

原有横向时间轴模块。

主要功能：
- Google Apps Script事件数据读取
- 事件标准化
- vis.js时间轴绘制
- 时间轴相关交互

主要文件：
- fetch.js
- normalize.js
- data.js
- mount.js

### variant/

地区和语言配置。

主要文件：
- variant.js

负责根据页面设置选择：
- world-zh
- world-en
- china-zh
- china-en

同时提供对应的数据接口配置。

### filter/

事件过滤逻辑及过滤状态管理。

主要文件：
- filter-engine.js
- filter-state.js
- filter-ui.js

### style/

自定义事件格式相关功能。

包含：
- 样式规则编译
- 样式应用
- 样式状态相关处理

### state/

前端状态管理。

### ui/

工具栏、弹窗、过滤面板、
样式面板及其他UI组件。

### ui-text/

中英文界面文本。

### utils/

通用工具函数。

### config/

配置相关辅助模块。

### _staging/

现有暂存及兼容模块。

该目录包含仍被原时间轴使用的代码，
不得仅根据目录名称直接删除。

## 2. 根级代码文件

### app.js

原时间轴主入口。

负责组织：
- variant配置
- vis.js时间轴挂载
- 工具栏
- 过滤与样式功能

### bootstrap.js

现有启动辅助文件。

### app-temp.js

现有临时入口代码。

未确认其全部引用关系前不删除。

## 3. 二维矩阵与原时间轴的关系

原时间轴入口：
- app.js
- timeline/mount.js

二维矩阵入口：
- matrix/matrix.js

两者均可复用：
- variant/variant.js
- timeline/fetch.js

二维矩阵第一阶段不加载原app.js，
也不调用mountTimeline()。

## 4. 文档维护规则

1. 新增子目录时，在本README登记职责。
2. 每个新增业务代码目录建立自己的README。
3. 子目录README记录文件、函数、参数、
   返回值、依赖与注意事项。
4. 修改已有模块接口时，检查所有调用方。
5. 不在多个README中重复维护同一函数的完整说明。
