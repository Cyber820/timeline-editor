
# Matrix：电子游戏史二维矩阵模块

文件路径：public/src/matrix/README.md

## 1. 模块定位

本目录负责电子游戏史二维时间矩阵的展示及交互。

当前入口：

`public/videogamematrix-world-zh.html`

使用现有世界电子游戏史中文版 Google Sheets 数据源。

与原有 vis.js 横向时间轴独立运行，但复用现有的数据读取、过滤引擎及相关状态模块。

### 当前已实现

- 横轴378列：366个实际日期及12个月度日期未知位置
- 纵轴按年份从新到旧排列
- 同一单元格内支持多张事件卡片
- 横向、纵向滚动
- 隐藏矩阵网格线
- 过滤/筛选界面
- AND/OR事件过滤
- 删除规则及Reset
- 五个样式编辑按钮及对应窗口
- 样式类型绑定、属性值多选、颜色和字体编辑
- 样式行新增、删除及重置

### 尚未实现

- 将自定义样式实际应用到事件卡片
- 样式配置持久化
- 日期和年份跳转
- 横轴与纵轴独立缩放
- 事件详情展示
- 大数据量虚拟化渲染

---

## 2. 文件清单

### matrix-data.js

文件路径：

`public/src/matrix/matrix-data.js`

职责：

- 公历日期验证
- 闰年判断
- 精确日期解析
- 月度日期未知标记解析
- 378列横轴索引生成
- 按年份与日期分组事件

不负责网络请求或DOM渲染。

#### isLeapYear(year)

参数：
- year：number，年份

返回：
- boolean

判断指定年份是否为公历闰年。

#### getDaysInMonth(year, month)

参数：
- year：number
- month：number，1至12

返回：
- number
- 无效参数返回0

#### parseExactDate(value)

参数：
- value：string或Date

返回：
- `{year, month, day}`
- 无效日期返回null

只接受有效的完整年月日。

不接受日期00。

#### parseMatrixDate(value)

参数：
- value：string或Date

返回：
- `{year, month, day, precision}`
- 无法解析时返回null

支持两种精度：

1. day：完整且有效的年月日
2. month：YYYY-MM-00

其中month精度事件使用day=0。

#### getDayIndex(month, day)

参数：
- month：number
- day：number，可为0

返回：
- number，范围0至377
- 无效日期返回-1

坐标示例：

- 1月00日：0
- 1月1日：1
- 2月00日：32
- 2月29日：61
- 3月00日：62
- 12月31日：377

注意：

该函数以闰年2000年作为横轴参考。
它不负责判断指定历史年份是否为闰年。

#### buildDayColumns()

参数：无

返回：
- 378个日期列对象组成的数组

每个对象包含：
- index
- month
- day
- label
- precision

#### buildMatrixData(events)

参数：
- events：标准化事件数组

返回：
- columns：日期列数组
- years：按降序排列的年份数组
- cells：按年份及日期索引分组的Map
- total：成功收录事件数量
- skipped：前端收到但无法解析的事件数量

注意：

skipped不包括已经被Google Apps Script过滤的事件。

---

### matrix.js

文件路径：

`public/src/matrix/matrix.js`

职责：

- 初始化二维矩阵
- 获取world-zh数据接口
- 请求action=matrix
- 读取标准化事件
- 绘制日期标题与年份行
- 绘制事件卡片
- 调用过滤引擎
- 更新统计信息
- 保留重新筛选前的滚动位置

依赖：

- ../variant/variant.js
- ../timeline/fetch.js
- ../filter/filter-engine.js
- ./matrix-data.js
- ./matrix-filter-ui.js

#### createElement(tag, className, text)

参数：
- tag：string，HTML标签名
- className：string，CSS类名
- text：string，纯文本

返回：
- HTMLElement

内部函数。

#### createEventCard(event)

参数：
- event：标准化事件对象

返回：
- HTMLElement

当前仅显示Title。

内部函数。

#### createHeaderRow(columns)

参数：
- columns：378个日期列对象

返回：
- HTMLElement

生成日期标题行。

内部函数。

#### createYearRow(year, columns, yearCells)

参数：
- year：number
- columns：日期列数组
- yearCells：Map<number, object[]>

返回：
- HTMLElement

生成某一年的全部378个日期单元格。

内部函数。

#### renderMatrix(container, matrixData)

参数：
- container：HTMLElement
- matrixData：buildMatrixData()的返回值

返回：
- void

功能：
- 清空原容器
- 绘制日期标题
- 绘制年份行
- 创建事件卡片

对外导出。

#### setStatus(message, isError)

参数：
- message：string
- isError：boolean，默认false

返回：
- void

更新页面顶部状态文本。

#### countMonthlyEvents(events)

参数：
- events：事件数组

返回：
- number

统计YYYY-MM-00事件数量。

#### initMatrix()

参数：无

返回：
- Promise<void>

对外导出。

执行顺序：

1. 获取矩阵容器
2. 初始化过滤界面
3. 获取world-zh数据接口
4. 添加action=matrix参数
5. 调用fetchAndNormalize()
6. 保存allEvents
7. 调用buildMatrixData()
8. 绘制矩阵
9. 更新统计信息

内部过滤管理函数：

#### applyMatrixFilter(state)

参数：
- state：过滤状态对象

功能：
- 调用现有applyFilters()
- 更新currentEvents
- 重新绘制矩阵

#### redrawCurrentEvents()

参数：无

功能：
- 使用当前事件数组重建矩阵
- 尽可能恢复横纵滚动位置
- 更新统计信息

#### updateMatrixStatus(matrixData)

参数：
- matrixData：矩阵数据对象

功能：
- 更新展示事件数量
- 更新月度事件数量
- 更新年份数量
- 更新跳过事件数量

---

### matrix-filter-ui.js

文件路径：

`public/src/matrix/matrix-filter-ui.js`

职责：

- 接入原有过滤界面
- 维护过滤规则交互
- 通知matrix.js执行筛选

依赖：

- ../filter/filter-ui.js
- ../filter/filter-state.js

#### initMatrixFilterUI({getItems, onApply})

参数：

- getItems：Function
  返回未经筛选的全部事件。

- onApply：Function
  接收过滤状态，并通知矩阵执行筛选。

返回：
- void

当前交互规则：

- 新增规则：保存规则，不立即筛选
- 点击AND：应用交集过滤
- 点击OR：应用并集过滤
- 删除规则：立即重新筛选
- Reset：清空规则，恢复全部事件

实际过滤判断复用：

`../filter/filter-engine.js`

不在本模块中重新实现过滤算法。

---

### matrix.css

文件路径：

`public/src/matrix/matrix.css`

职责：

- 页面基础布局
- 378列CSS Grid
- 固定日期表头
- 固定年份标签
- 双向滚动
- 事件卡片样式
- 过滤工具栏容纳布局

主要CSS变量：

- --matrix-column-count
- --matrix-cell-width
- --matrix-year-width
- --matrix-header-height
- --matrix-card-background
- --matrix-card-border

主要选择器：

- .matrix-page
- .matrix-topbar
- .matrix-main
- .matrix-scroll
- .matrix-grid
- .matrix-header-row
- .matrix-corner
- .matrix-day-header
- .matrix-month-header
- .matrix-year-row
- .matrix-year-label
- .matrix-cell
- .matrix-month-cell
- .matrix-card
- .event-title
- .matrix-message

布局规则：

- 横轴固定378列
- 纵轴按照年份排列
- 同一日期单元格支持多张事件卡
- 不绘制矩阵网格分隔线
- 保留事件卡片自身边框
- 月度日期未知标题采用独立背景色
- 日期标题和年份标签保持固定
- 过滤工具栏位于矩阵滚动区域上方

---

### matrix-style-ui.js

文件路径：

`public/src/matrix/matrix-style-ui.js`

职责：

- 创建五个样式按钮
- 创建共用样式编辑窗口
- 维护样式类型绑定
- 新增及删除样式行
- 编辑颜色与字体
- 选择作用属性值
- 防止重复绑定及重复选择
- 在页面内存中保留临时样式设置

依赖：

- ../timeline/fetch.js
- DOM API
- matrix-style-ui.css

当前不调用原样式引擎，
也不将样式应用到矩阵事件。

#### ATTRIBUTES

常量数组。

定义五个样式按钮：

- EventType：事件样式
- Platform：平台样式
- ConsolePlatform：主机样式
- Company：公司样式
- Region：地区样式

#### STYLE_TYPES

常量数组。

定义五种样式类型：

- fontColor：字体颜色
- backgroundColor：背景颜色
- borderColor：边框颜色
- fontFamily：字体
- haloColor：光晕颜色

#### FONTS

常量数组。

定义字体下拉框的候选字体。

#### uiState

模块内部临时状态。

包含：

- boundTypes：属性与样式类型的绑定关系
- rules：各属性的样式规则数组

当前只保存在页面内存中。
刷新页面会丢失设置。

#### el(tag, className, text)

参数：
- tag：string
- className：string
- text：string

返回：
- HTMLElement

创建DOM元素。

#### button(text, handler, className)

参数：
- text：string，按钮文字
- handler：Function，点击回调
- className：string，CSS类名

返回：
- HTMLButtonElement

#### getAttribute(key)

参数：
- key：string，属性名称

返回：
- 对应属性配置对象或undefined

#### getType(key)

参数：
- key：string，样式类型名称

返回：
- 对应样式类型对象或undefined

#### getBoundType(key)

参数：
- key：string，属性名称

返回：
- 已绑定的样式类型
- 未绑定时返回null

#### getRules(key)

参数：
- key：string，属性名称

返回：
- 对应属性的样式规则数组

#### getOwner(type)

参数：
- type：string，样式类型

返回：
- 当前占用该样式类型的属性名称
- 未占用时返回undefined

用于阻止不同属性重复绑定同一种样式类型。

#### createRule(type)

参数：
- type：string，样式类型

返回：
- 新建样式规则对象

包含：
- id
- type
- style
- values

#### normalizeHex(input)

参数：
- input：string，颜色值

返回：
- 标准化的六位HEX颜色
- 无效颜色返回null

#### splitValues(value)

参数：
- value：string或Array

返回：
- string[]

将属性值整理为字符串数组。

#### getEvents()

参数：无

返回：
- Promise<Array<object>>

首次使用时通过fetchAndNormalize()
获取候选数据。

具有页面内缓存机制，
避免反复请求。

#### collectOptions(key)

参数：
- key：string，事件属性名称

返回：
- string[]

收集指定属性的候选值，
并保留当前UI已选择的值。

#### createStyleControl(rule)

参数：
- rule：样式规则对象

返回：
- HTMLElement

根据样式类型创建：
- 颜色选择器及HEX输入框
- 或字体下拉框

#### createValueChips(rule)

参数：
- rule：样式规则对象

返回：
- HTMLElement

生成已选择属性值的标签。

#### openValuePicker(attributeKey, rule)

参数：
- attributeKey：string
- rule：样式规则对象

返回：
- void

打开属性值多选窗口。

支持：
- 搜索
- 多选
- 已占用值禁用
- 确认及取消

#### renderRules(attributeKey, tbody)

参数：
- attributeKey：string
- tbody：HTMLElement

返回：
- void

绘制当前属性下的全部样式规则行。

#### renderEditor()

参数：无

返回：
- void

重新绘制当前样式编辑窗口。

#### closeEditor()

参数：无

返回：
- void

关闭当前样式编辑窗口，
并尝试恢复之前的键盘焦点。

#### openEditor(attributeKey)

参数：
- attributeKey：string

返回：
- Promise<void>

打开指定属性的样式窗口，
并按需读取候选数据。

#### createDialog()

参数：无

返回：
- HTMLElement

创建五个样式按钮共用的编辑窗口。

#### initMatrixStyleUI()

参数：无

返回：
- void

对外导出。

功能：
- 查找现有过滤按钮
- 在其右侧插入五个样式按钮
- 初始化样式弹窗
- 绑定按钮点击事件

同一页面生命周期仅初始化一次。

#### start()

参数：无

返回：
- void

启动UI初始化。

如果过滤按钮尚未建立，
使用MutationObserver等待其出现。

### 样式UI交互约定

1. 每种样式类型只能绑定一个属性。
2. 每个属性同时只能绑定一种样式类型。
3. 同一属性的不同样式行不能重复占用属性值。
4. 绑定成功后可以继续新增同类型样式行。
5. 重置会解除绑定并清空该属性的规则。
6. 保存并应用当前只关闭窗口并保留内存状态。
7. 所有操作暂时不改变事件卡片。
8. 不修改原有styleState。
9. 当前尚无样式持久化。

---

### matrix-style-ui.css

文件路径：

`public/src/matrix/matrix-style-ui.css`

职责：

- 五个样式按钮外观
- 样式编辑窗口
- 颜色及字体编辑控件
- 样式规则表格
- 属性值选择窗口
- 已选属性值标签
- 窄屏幕布局

主要选择器：

- .mx-style-trigger
- .mx-style-overlay
- .mx-style-backdrop
- .mx-style-panel
- .mx-style-panel-header
- .mx-style-panel-body
- .mx-style-panel-footer
- .mx-style-actions
- .mx-style-table
- .mx-style-control
- .mx-style-color
- .mx-style-hex
- .mx-style-chips
- .mx-style-chip
- .mx-style-picker-overlay
- .mx-style-picker
- .mx-style-value-grid
- .mx-style-value-item

该CSS只负责样式编辑界面，
不负责改变矩阵事件卡片的视觉规则。

---

## 3. 外部依赖

### variant/variant.js

通过getVariant()获取world-zh事件接口。

### timeline/fetch.js

通过fetchAndNormalize()获取标准化事件数组。

### filter/filter-ui.js

提供现有过滤面板。

### filter/filter-state.js

保存过滤条件及AND/OR状态。

### filter/filter-engine.js

执行实际过滤判断。

### Google Apps Script

当前矩阵请求：

`/exec?action=matrix`

原时间轴继续请求：

`/exec`

矩阵接口额外支持：

`YYYY-MM-00`

表示只确定年份和月份的事件。

---

## 4. 当前模块加载关系

入口页面：

`public/videogamematrix-world-zh.html`

加载：

1. matrix.css
2. matrix-style-ui.css
3. matrix.js
4. matrix-style-ui.js

matrix.js负责：
- 数据读取
- 过滤器初始化
- 矩阵渲染

matrix-style-ui.js负责：
- 等待过滤按钮初始化
- 添加五个样式按钮
- 管理样式编辑窗口

两个模块暂时不共享样式状态。

---

## 5. 已完成测试

### 日期映射测试

测试结果：

23项通过，0项失败。

覆盖：
- 378列坐标
- 月度00日期
- 闰年
- 非法日期
- 同日多事件
- 年份分组

### 矩阵接口测试

已确认：
- Apps Script matrix接口正常响应
- 1984-06-00可以正确显示
- 原时间轴不受特殊月度日期影响
- 非法月份不破坏矩阵渲染

### 过滤界面与接线

已完成过滤UI和实际过滤功能代码。

### 五个样式编辑窗口

已通过UI交互测试。

包括：
- 五个按钮
- 样式类型绑定
- 属性候选值选择
- 新增及删除样式行
- HEX颜色编辑
- 字体选择
- 重置与保存关闭

当前尚未接入实际样式应用。

---

## 6. 后续开发顺序

### 下一阶段：样式引擎接线

目标：

- 将当前临时UI规则转换为现有样式引擎使用的规则结构
- 复用原有样式编译逻辑
- 将生成的CSS应用到.matrix-card
- 保持过滤操作不受影响
- 确认是否需要单独的矩阵样式持久化

注意：

当前matrix-style-ui.js的uiState属于临时结构，
不应直接假定它与原styleState完全兼容。

接线前必须核对原有样式规则的数据结构。

### 后续阶段：时间跳转

目标：

- 日期定位
- 年份定位
- 指定年月日定位
- 上一天/下一天
- 保持未指定坐标轴的滚动位置

### 最后阶段：独立缩放

目标：

- 横轴单独缩放
- 纵轴单独缩放
- 自定义日期单元格宽度
- 自定义年份行高度
- 控制当前可见日期及年份范围

---

## 7. 代码与文档维护规范

1. 每个代码文件开头标明完整相对路径。
2. 文件头注释说明主要职责。
3. 新增函数时记录参数、返回值及依赖。
4. 修改函数接口时同步更新本README。
5. 新增子目录时同步更新public/src/README.md。
6. 改变HTML入口时更新public/README.md。
7. 不为新增二维功能直接修改原时间轴绘制代码。
8. 优先复用现有公共模块。
9. 每完成一个独立阶段先验证，再继续开发。
10. 未实现的功能不得在文档中标记为已完成。
