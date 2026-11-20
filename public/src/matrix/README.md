
# Matrix：电子游戏史二维矩阵模块

## 1. 模块定位

本目录负责二维时间矩阵的展示。

与原有 vis.js 横向时间轴独立运行，共用现有的数据读取和数据源配置模块。

当前入口页面：

`public/videogamematrix-world-zh.html`

当前展示方式：

- 横轴：1月1日至12月31日，固定366列
- 纵轴：年份，从新到旧排列
- 事件：按实际年月日进入相应单元格
- 同一单元格：支持多张事件卡片
- 暂不支持过滤、格式编辑、缩放及时间跳转

本模块不得直接修改 Google Sheets 的数据。

## 2. 文件清单

### matrix-data.js

定位：日期解析与二维数据分组。

不负责页面绘制，不直接读取网络数据。

#### isLeapYear(year)

判断公历闰年。

参数：
- year：number，完整年份

返回：
- boolean

#### getDaysInMonth(year, month)

返回指定年份、月份的天数。

参数：
- year：number
- month：number，1至12

返回：
- number；月份无效时返回0

#### parseExactDate(value)

解析包含完整年月日的日期。

参数：
- value：string或Date

返回：
- `{ year, month, day }`
- 解析失败返回null

支持：
- YYYY-MM-DD
- YYYY/MM/DD
- YYYY.MM.DD
- YYYY年M月D日
- 合法日期之后附带时间信息的格式
- 有效Date对象

不支持：
- 只有年份
- 只有年月
- 日期范围
- 模糊日期
- 不合法的年月日

此函数不会将不完整日期自动补成某月1日。

#### getDayIndex(month, day)

计算固定366天横轴的列索引。

参数：
- month：number，1至12
- day：number

返回：
- number，0至365
- 无效日期返回-1

坐标采用闰年2000年的月日顺序。

注意：此函数只验证月日组合，
不验证该日期在某一个具体年份是否存在。

#### buildDayColumns()

生成366个日期列对象。

参数：无

返回：
- Array<{index, month, day, label}>

#### buildMatrixData(events)

将标准化事件按年份和日期坐标分组。

参数：
- events：Array<object>
- 数据结构应符合 fetchAndNormalize() 的输出

返回：
- columns：366个日期列对象
- years：降序排列的年份数组
- cells：Map<year, Map<dayIndex, events[]>>
- total：成功收录的事件数量
- skipped：因日期无法解析而跳过的事件数量

只建立存在有效事件的年份行。
不会改变传入事件的原始数据。

### matrix.js

定位：二维矩阵页面主程序。

依赖：
- ../variant/variant.js
- ../timeline/fetch.js
- ./matrix-data.js

#### createElement(tag, className, text)

创建普通DOM元素。

参数：
- tag：string，HTML标签
- className：string，CSS类名
- text：string，纯文本

返回：
- HTMLElement

内部函数，不导出。

#### createEventCard(event)

为一个事件生成标题卡片。

参数：
- event：object，标准化事件对象

返回：
- HTMLElement

当前只显示Title。

内部函数，不导出。

#### createHeaderRow(columns)

生成日期表头及左上角标签。

参数：
- columns：Array<object>，日期列数组

返回：
- HTMLElement

内部函数，不导出。

#### createYearRow(year, columns, yearCells)

生成某一年的完整矩阵行。

参数：
- year：number
- columns：Array<object>
- yearCells：Map<number, object[]>

返回：
- HTMLElement

每行包含年份标签与366个日期单元格。

内部函数，不导出。

#### renderMatrix(container, matrixData)

将矩阵渲染到指定DOM容器。

参数：
- container：HTMLElement
- matrixData：buildMatrixData()的返回值

返回：
- void

会替换容器的全部已有子节点。

对外导出。

#### setStatus(message, isError)

更新页面顶部状态文本。

参数：
- message：string
- isError：boolean，默认false

返回：
- void

内部函数，不导出。

#### initMatrix()

初始化矩阵页面。

参数：无

返回：
- Promise<void>

执行顺序：

1. 获取#matrix容器
2. 调用getVariant()
3. 获取events endpoint
4. 设置TIMELINE_ENDPOINT
5. 调用fetchAndNormalize()
6. 调用buildMatrixData()
7. 调用renderMatrix()
8. 显示统计结果

对外导出。

页面加载时会自动执行。

### matrix.css

定位：二维矩阵的视觉布局。

主要选择器：

- .matrix-page：页面整体布局
- .matrix-topbar：页面标题及状态信息
- .matrix-main：矩阵区域
- .matrix-scroll：双向滚动容器
- .matrix-grid：366列主网格
- .matrix-header-row：日期表头行
- .matrix-corner：左上角标签
- .matrix-day-header：日期列标题
- .matrix-year-row：年份行
- .matrix-year-label：年份标签
- .matrix-cell：日期与年份交叉单元格
- .matrix-card：事件卡片
- .event-title：事件标题
- .matrix-message：空数据与错误信息
- 布局规则：
- 横轴固定366个日期列。
- 纵轴按照年份排列。
- 不绘制日期单元格和年份行之间的网格线。
- 保留事件卡片自身的边框。
- 日期标题和年份标签仍使用独立背景色。

主要CSS变量：

- --matrix-cell-width：日期列宽度
- --matrix-year-width：年份列宽度
- --matrix-header-height：日期表头高度

当前默认日期列宽度为220px。

使用CSS Grid和subgrid。
浏览器需支持CSS subgrid。

## 3. 外部模块依赖

### variant/variant.js

调用：
- getVariant()

功能：
- 根据页面指定的world/zh获取events endpoint

不修改该模块。

### timeline/fetch.js

调用：
- fetchAndNormalize()

功能：
- 读取Google Apps Script返回的数据
- 将数据整理为统一事件字段

不修改该模块。

## 4. 数据字段

当前矩阵直接依赖：

- Start：事件开始日期
- Title：事件标题

其他字段由fetchAndNormalize()保留，
本阶段暂不展示。

将来接入过滤与自定义格式时，
应继续使用原有标准化字段。

## 5. 扩展原则

1. 不直接修改原时间轴的app.js和mount.js。
2. 优先复用现有数据读取、过滤和样式模块。
3. 二维展示特有的功能放在matrix目录。
4. 保持日期分组与页面渲染分离。
5. 不将日期不确定的事件伪装为确定日期。
6. 新增或修改函数后，同步维护此README。
7. 修改HTML入口或外部依赖时，检查上级README。

## 6. 当前限制

- 只支持精确日期事件。
- 不显示日期范围对应的全部日期。
- 不显示只有年月的事件。
- 未应用原时间轴默认重要性过滤。
- 暂无事件详情弹窗。
- 暂无筛选、自定义格式、缩放与时间跳转。
- 首版一次性生成全部年份和日期单元格，
  尚未进行虚拟化性能优化。

上述限制属于第一阶段的明确开发范围，
不是已经实现的功能。

## 7. 第一阶段验收

- 页面能够通过现有world-zh接口获取数据。
- 横轴准确生成366列。
- 2月29日有独立列。
- 不同年份的同一月日位于相同横轴位置。
- 多张同日同年事件卡片不会互相覆盖。
- 日期不完整的记录不会被错误定位。
- 原始时间轴页面不受影响。
