
# Timeline Editor

电子游戏史时间轴、二维矩阵及相关数据编辑工具。

## 1. 项目结构

### public/

静态页面和前端资源。

包含：
- 世界电子游戏史时间轴（中文、英文）
- 中国电子游戏史时间轴（中文、英文）
- 世界电子游戏史二维矩阵（中文）
- 数据编辑页面
- 其他测试及辅助页面

目录详细说明：
`public/README.md`

### public/src/

前端 JavaScript 模块。

包含：
- 时间轴绘制
- 二维矩阵绘制
- 数据读取
- 数据源配置
- 过滤
- 自定义格式
- UI 组件
- 通用工具

目录详细说明：
`public/src/README.md`

各模块的具体函数和参数，
由对应模块目录内的 README 负责记录。

### server/

服务端 API 及样式规则编译功能。

主要子目录：
- api/
- compiler/

### public/archive/

旧版页面及归档资源。

## 2. 根目录主要代码文件

### index.js

Express 服务器入口。

主要功能：
- 提供 public 目录的静态页面
- 提供服务器健康检查接口
- 提供样式编译 API
- 处理现有提交接口

### config.js

项目配置文件。

### google-api.js

现有 Google 相关接口代码。

### package.json

Node.js 依赖及运行脚本配置。

## 3. 项目文档

### README.md

本文件。

负责：
- 项目总体说明
- 各目录的职责
- 根目录代码文件的用途
- 其他说明文档的位置和职责
- 数据来源及接口约定

### public/README.md

说明 public 下各页面、资源和子目录。

### public/src/README.md

说明前端源代码各模块的职责。

### public/src/matrix/README.md

说明二维矩阵模块内部：
- 文件职责
- 函数
- 参数
- 返回值
- 依赖关系
- 扩展注意事项

### public/README.txt

原有编辑器部署说明。

### 代码说明.txt

现有历史代码说明文档。

记录部分旧时间轴模块的职责、
主要接口及修改注意事项。

在完成与分层 README 的核对之前保留，
不作为新模块函数文档的主要维护位置。

### server/代码描述.txt

现有服务器目录中的历史代码说明文件。

暂时保留，不与新模块 README 重复维护。

## 4. 当前展示页面

### 横向时间轴

- videogametimeline-world-zh.html
- videogametimeline-world-en.html
- videogametimeline-china-zh.html
- videogametimeline-china-en.html

### 二维矩阵

- videogamematrix-world-zh.html

二维矩阵当前为独立页面，
不替换原有横向时间轴。

## 5. 数据来源与接口

### 5.1 数据来源

当前时间轴通过 Google Apps Script Web App
读取 Google Sheets 中的事件数据。

地区和语言对应的数据源配置位于：

`public/src/variant/variant.js`

标准化数据读取模块位于：

`public/src/timeline/fetch.js`

二维矩阵复用以上模块。

Google Apps Script 是独立部署的服务，
不属于 Railway 项目的 Express 后端。

### 5.2 Google Apps Script 接口

当前 Viewer Apps Script 提供三个 GET 接口。

#### `/exec`

原有横向时间轴事件接口。

对应 Apps Script 函数：

`getTimelineData()`

功能：
- 读取 Events 工作表
- 处理 Start 和 End 日期
- 返回原时间轴使用的事件数据
- 不返回无法解析开始日期的事件

本次新增矩阵接口时，
保留了该函数原有的代码和处理方式。

#### `/exec?action=options`

原有过滤选项接口。

对应 Apps Script 函数：

`doGetOptions()`

功能：
- 读取过滤枚举工作表
- 返回 EventType、Region、Platform、
  Company、Tag 等选项
- 返回 ConsolePlatform 和
  ConsolePlatformFilter 相关数据

本次修改未改变该函数。

#### `/exec?action=matrix`

新增二维矩阵专用事件接口。

对应 Apps Script 函数：

`getMatrixData()`

功能：
- 读取相同的 Events 工作表
- 返回具有完整日期的事件
- 额外返回符合规定的月度日期事件
- 在事件 JSON 中增加日期精度字段

新增字段：

- datePrecision
- endDatePrecision

日期精度取值：

- "day"：普通日期
- "month"：只确定年份和月份

其中 endDatePrecision 仅在存在有效
End 日期时返回。

### 5.3 日期格式约定

普通日期使用：

`YYYY-MM-DD`

例如：

`2000-02-20`

表示：
2000 年 2 月 20 日。

月度日期使用：

`YYYY-MM-00`

例如：

`2000-02-00`

表示：
事件发生在 2000 年 2 月，
但无法确定具体日期。

注意：

1. 日期 00 不属于合法公历日期。
2. 00 是本项目自定义的日期精度标记。
3. Google Sheets 中的特殊日期必须以纯文本保存。
4. 特殊日期不应直接交给 JavaScript Date 解析。
5. 当前只支持两位月份的 YYYY-MM-00 格式。
6. 其他非法日期不应被视为日期不详的标记。

例如：

`2000-02-30`

不属于项目定义的月度日期格式。

### 5.4 Apps Script 日期处理

普通时间轴使用：

- parseDate(value)
- formatDate(value)

矩阵接口额外使用：

- parseMatrixDate(value)

parseMatrixDate(value) 返回：

{
  date: string | null,
  precision: "day" | "month" | null
}

处理规则：

1. 如果输入为有效 YYYY-MM-00 字符串，
   保留该字符串并标记 precision="month"。
2. 其他日期交给原有 parseDate()。
3. 成功解析的普通日期标记 precision="day"。
4. 无法解析的日期不返回有效日期值。

### 5.5 前端接口选择

原有时间轴继续请求：

`/exec`

新二维矩阵计划请求：

`/exec?action=matrix`

可在新矩阵模块中通过 URL 参数指定：

endpoint.searchParams.set('action', 'matrix');

注意：

该代码属于新矩阵前端的接口配置，
不需要添加到原时间轴的 app.js，
也不需要添加到 Railway 后端 index.js。

### 5.6 当前开发状态

已完成：
- 新建矩阵独立页面
- 实现366天 × 年份基础卡片布局
- Apps Script 新增 matrix 数据接口
- 初步测试原有时间轴接口
- 初步测试 matrix 数据接口

尚未完成：
- 新矩阵前端调用 action=matrix
- 识别 YYYY-MM-00 月度事件
- 从366列扩展为378列
- 验证月度事件在矩阵中的显示
- 过滤功能
- 自定义格式
- 单轴缩放
- 日期及年份跳转

因此，目前 Apps Script 已支持返回月度事件，
但二维矩阵页面尚未正式使用新的数据接口。

## 6. 代码开发与文档规范

### 6.1 模块化

按功能划分代码目录。

不同展示模块可以复用公共业务逻辑，
但应避免直接依赖其他视图的内部绘制代码。

### 6.2 根目录 README

负责描述：
- 项目结构
- 各目录职责
- 根目录代码及说明文档用途
- 主要入口和依赖关系
- 数据接口约定

### 6.3 子目录 README

负责描述：
- 每个代码文件的功能
- 主要函数及接口
- 参数及其类型
- 返回值
- 依赖模块
- 重要约定
- 扩展和修改注意事项

### 6.4 新增代码

新增代码目录时：

1. 在上一级 README 登记。
2. 创建该目录的 README。
3. 记录该目录中每个文件的职责。
4. 记录主要函数及参数。

### 6.5 修改代码

修改现有代码时：

1. 确认可能受影响的调用方。
2. 检查是否改变公开接口。
3. 更新所在目录 README。
4. 如目录职责发生变化，更新上级 README。
5. 测试通过后再提交和部署。

### 6.6 稳定性原则

- 不为新增视图随意修改旧视图。
- 尽量复用既有的数据与业务模块。
- 不擅自改变现有 Google Sheets 数据结构。
- 不擅自改变已有过滤与格式功能的行为。
- 不删除仍被引用的历史兼容模块。
- 每完成一个独立阶段，进行功能验证。

## 7. 二维矩阵开发阶段

### 第一阶段：基础矩阵

已实现：
- 独立世界中文版页面
- 366天横轴
- 年份纵轴
- 确定日期的事件卡片
- 基本滚动浏览

### 第二阶段：月度日期支持

Apps Script 接口已初步完成。

待实现：
- 矩阵前端调用 action=matrix
- 378列横轴
- 每个月增加一个日期未知单元格
- YYYY-MM-00 日期解析
- 月度事件卡片显示
- 与原时间轴的兼容性验证

### 后续阶段（尚未实现）

- 横轴与纵轴独立缩放
- 日期及年份跳转
- 过滤功能
- 自定义事件格式
- 事件详情
- 大数据量渲染性能优化

后续功能应根据实际开发结果逐步补充，
不得提前标记为已经实现。
