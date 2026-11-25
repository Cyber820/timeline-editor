
# Matrix：电子游戏史二维矩阵模块

**文件路径：`public/src/matrix/README.md`**  
**文档更新：2026-11-25**

## 1. 模块定位与架构

本目录实现独立于原有 vis.js 横向时间轴的“日期 × 年份”事件卡片矩阵。当前入口为：

`public/videogamematrix-world-zh.html`

- 数据源：原有世界电子游戏史中文版 Google Apps Script 数据源，调用 `action=matrix`。
- 横轴：378个固定月日列，包含每个月的`00日（日期未知）`。
- 纵轴：从新到旧、**连续排列的年份**；允许没有事件的年份。
- 事件：按 `year + columnIndex` 分组，同坐标可以显示多张卡片。
- 共享能力：事件读取、过滤状态／过滤引擎、样式规则转换／编译器。
- 边界：只修改二维矩阵的显示和交互，不修改原横向时间轴的布局、数据接口和绘制代码。

### 主要模块关系

```text
public/videogamematrix-world-zh.html
├── matrix.css
├── matrix-style-ui.css
├── matrix-date-jump.css
├── matrix-year-jump.css
├── matrix.js
│   ├── matrix-data.js
│   ├── matrix-filter-ui.js
│   │   └── ../filter/{filter-ui,filter-state}.js
│   ├── ../filter/filter-engine.js
│   ├── ../style/engine.js（事件data-*属性）
│   ├── ../timeline/fetch.js
│   └── ../variant/variant.js
├── matrix-style-ui.js
│   ├── ../timeline/fetch.js
│   ├── ../_staging/constants.js
│   └── ../style/engine.js（样式编译和注入）
├── matrix-date-jump.js
│   └── matrix-data.js
└── matrix-year-jump.js
    └── matrix.js（通过matrix:ensure-year自定义事件交互）
```

## 2. 文件清单

| 文件 | 功能 | 主要对外接口／产物 |
| --- | --- | --- |
| `matrix-data.js` | 精确日期、月度00日期解析与378列映射；按年份／日期分组 | `isLeapYear`、`getDaysInMonth`、`parseExactDate`、`parseMatrixDate`、`getDayIndex`、`buildDayColumns`、`buildMatrixData` |
| `matrix.js` | 读取事件，渲染矩阵，执行过滤，维护连续年份范围、响应扩展请求 | `renderMatrix`、`initMatrix`；监听 `matrix:ensure-year` |
| `matrix.css` | 矩阵整体布局、日期表头、年份标签、卡片样式 | `.matrix-grid`、`.matrix-cell`、`.matrix-card` 等 |
| `matrix-filter-ui.js` | 过滤面板、过滤规则操作与矩阵回调之间的桥接 | `initMatrixFilterUI` |
| `matrix-style-ui.js` | 五个样式窗口、规则状态、编译与应用 | `initMatrixStyleUI`、`getMatrixEngineStyleState`、`applyMatrixStyles` |
| `matrix-style-ui.css` | 五个样式窗口和候选属性值选择器的 UI | `.mx-style-*` |
| `matrix-date-jump.js` | 月份／日期选择、独立横向跳转、日期高亮 | `initMatrixDateJump`、`jumpToMatrixDate` |
| `matrix-date-jump.css` | 日期跳转按钮、面板、日期表头高亮 | `.mx-jump-*`、`.mx-jump-target` |
| `matrix-year-jump.js` | 年份输入、独立纵向跳转、请求扩展空白年份 | `initMatrixYearJump`、`jumpToMatrixYear` |
| `matrix-year-jump.css` | 年份跳转 UI、空白年份行、年份高亮 | `.mx-year-jump-*`、`.matrix-year-empty-fill` |

历史测试入口 `matrix-data-test.html` 用于单独验证日期映射；如已从部署目录删除，不属于正式页面的必需文件。

---

## 3. `matrix-data.js`：坐标与事件映射

**路径：** `public/src/matrix/matrix-data.js`  
**依赖：** 无外部模块；不发起请求，也不操作 DOM。

| 导出函数 | 参数 | 返回值 | 功能 |
| --- | --- | --- | --- |
| `isLeapYear(year)` | `year: number` | `boolean` | 公历闰年判断 |
| `getDaysInMonth(year, month)` | `year: number`、`month: number` | `number`；参数无效返回`0` | 求指定年份月份的天数 |
| `parseExactDate(value)` | `value: string \| Date` | `{year,month,day} \| null` | 解析有效完整年月日；不接受`00`日 |
| `parseMatrixDate(value)` | `value: string \| Date` | `{year,month,day,precision} \| null` | 解析完整日期，或严格格式`YYYY-MM-00` |
| `getDayIndex(month,day)` | `month: 1..12`、`day: 0..该月最大日` | `number`，有效范围`0..377`，否则`-1` | 将月日映射到固定横轴列号 |
| `buildDayColumns()` | 无 | `Array<{index,month,day,label,precision}>` | 创建378个日期列元数据 |
| `buildMatrixData(events)` | `events: object[]`，标准化事件数组 | `{columns,years,cells,total,skipped}` | 将事件按年份和横轴列号分组 |

**坐标示例：**

| 月日 | 0起始索引 |
| --- | ---: |
| 1月00日 | 0 |
| 1月1日 | 1 |
| 2月00日 | 32 |
| 2月29日 | 61 |
| 3月00日 | 62 |
| 12月31日 | 377 |

横轴固定采用2000年作为闰年参考，因此有2月29日列；历史年份的实际日是否合法，仍由解析函数验证。`YYYY-MM-00` 必须为有效1—12月，00表示当月日期未知，不表示某一真实日期。

`buildMatrixData()` 的返回值含义：

- `columns`：全部378个日期列，始终存在，不受事件和过滤影响。
- `years`：**本次传入事件中有事件的年份**（降序）；它本身并不是最终页面的连续年份列表。
- `cells`：`Map<year, Map<columnIndex, event[]>>`。
- `total`：成功分配到单元格的事件数。
- `skipped`：传到前端后无法解析日期的事件数，**不含 Apps Script 已排除的记录**。

最终的连续年份范围由 `matrix.js` 的 `yearRange` 决定，而非此函数修改。

---

## 4. `matrix.js`：矩阵主程序

**路径：** `public/src/matrix/matrix.js`

**外部依赖：**

- `../variant/variant.js`：`getVariant()`。
- `../timeline/fetch.js`：`fetchAndNormalize()`。
- `../filter/filter-engine.js`：`applyFilters()`。
- `../style/engine.js`：`attachEventDataAttrs()`。
- `./matrix-data.js`：`buildMatrixData()`、`parseMatrixDate()`。
- `./matrix-filter-ui.js`：`initMatrixFilterUI()`。

### 4.1 函数说明

| 函数 | 参数 | 返回值 | 职责 |
| --- | --- | --- | --- |
| `createElement(tag,className,text)`（内部） | 标签、类名、纯文本 | `HTMLElement` | 创建 DOM 元素 |
| `createEventCard(event)`（内部） | 标准化事件对象 | `HTMLElement` | 绘制标题卡片，通过`attachEventDataAttrs`写入样式匹配属性 |
| `createHeaderRow(columns,highlightedIndex=-1)`（内部） | 日期列和需要高亮的列号 | `HTMLElement` | 绘制日期表头并恢复日期跳转高亮 |
| `createYearRow(year,columns,yearCells,highlighted=false)`（内部） | 年份、日期列、对应年份的事件 Map、是否高亮 | `HTMLElement` | 绘制有事件年份或轻量空白年份行 |
| `renderMatrix(container,matrixData,yearRange={})`（导出） | 滚动容器、矩阵数据、可选 `{minYear,maxYear}` | `void` | 绘制连续年份范围、378列及事件；恢复跳转高亮 |
| `setStatus(message,isError=false)`（内部） | 状态文字、是否错误 | `void` | 更新页面顶部状态 |
| `countMonthlyEvents(events)`（内部） | 事件数组 | `number` | 统计`YYYY-MM-00`事件 |
| `initMatrix()`（导出） | 无 | `Promise<void>` | 初始化过滤界面、数据接口、矩阵与年份扩展事件监听 |

### 4.2 `initMatrix()` 内部函数

| 函数 | 参数 | 返回值 | 职责 |
| --- | --- | --- | --- |
| `updateMatrixStatus(matrixData)` | `{total,years,skipped,...}` | `void` | 更新已显示总数／原始总数、月度事件数、有事件年份数、前端跳过记录数 |
| `redrawCurrentEvents()` | 无 | `void` | 依当前筛选重建矩阵，尽可能保留双向滚动位置和跳转高亮 |
| `applyMatrixFilter(state)` | 原过滤状态对象 | `void` | 使用共享`applyFilters`更新`currentEvents`并重绘 |
| `ensureYear(year)` | `year: number`，1至9999整数 | `boolean` | 确保该年位于连续纵轴；范围外扩展并重绘，范围内只更新高亮 |

### 4.3 年份范围规则

初始化时，`yearRange.minYear` 与 `yearRange.maxYear` 取自**未经筛选的全部有效事件**；渲染时从 `maxYear` 一直排列到 `minYear`，包括无事件年份。

- 过滤只修改`currentEvents`，不会缩短`yearRange`。
- 目标年份已经在范围内：更新对应年份标签的高亮，无需整体重绘。
- 目标年份在范围外：扩展`yearRange`，生成此前不存在的连续年份，再进行定位。
- 完全空白的年份使用 `.matrix-year-row-empty` 和一个横跨全部日期列的 `.matrix-year-empty-fill`；不会为该年生成378张空单元格 DOM。
- 已有事件的年份继续生成378列，每个日期单元格可有多张卡片。
- 过度扩展年份范围会增加 DOM 数量；极端年份跨度的性能优化尚未实现。

### 4.4 `matrix:ensure-year` 通信协议

`matrix.js` 在 `document` 上监听以下事件：

```javascript
document.dispatchEvent(
  new CustomEvent('matrix:ensure-year', {
    detail: { year: 1985, ready: false }
  })
);
```

实际调用者将 `detail` 对象保存在变量中，利用同步 `dispatchEvent()`：

1. `matrix-year-jump.js` 创建 `{year,ready:false}` 请求对象。
2. `matrix.js` 的监听器执行 `ensureYear(detail.year)`。
3. 监听器将布尔结果写入同一对象的 `detail.ready`。
4. 年份跳转模块据此判断能否继续滚动。

这不是独立网络接口，也不改变源事件数据。

### 4.5 与自定义样式的关系

`createEventCard()` 调用公共 `attachEventDataAttrs()` 为新卡片附加 EventType、Platform、ConsolePlatform、Company、Region 等样式匹配属性。过滤后重新绘制产生的新卡片仍可被已注入 CSS 匹配；不需要重复编译样式。

---

## 5. `matrix-filter-ui.js`：过滤桥接

**路径：** `public/src/matrix/matrix-filter-ui.js`  
**依赖：** `../filter/filter-ui.js`、`../filter/filter-state.js`。

### `initMatrixFilterUI({getItems,onApply})`

- `getItems: () => object[]`：提供未经筛选的完整事件数组，供过滤 UI 收集候选项。
- `onApply: (state) => void`：通知 `matrix.js` 按指定状态执行过滤。
- 返回：`void`。

操作规则：新增规则只更新状态；选择 AND／OR、删除规则或 Reset 时立即应用。Reset 恢复全部事件，且不清除自定义样式。筛选引擎由原有 `../filter/filter-engine.js` 实现。

---

## 6. `matrix-style-ui.js`：五个样式编辑窗口

**路径：** `public/src/matrix/matrix-style-ui.js`

**依赖：** `../timeline/fetch.js`、`../_staging/constants.js`（`ENGINE_KEY_MAP`、`buildEngineStyleState`）、`../style/engine.js`（`compileStyleRules`、`injectUserStyle`）、`matrix-style-ui.css`。

### 6.1 属性绑定与样式类型

| 样式窗口 | 数据属性 | 可绑定的样式效果 |
| --- | --- | --- |
| 事件样式 | `EventType` | 字体颜色／背景颜色／边框颜色／字体／光晕颜色之一 |
| 平台样式 | `Platform` | 同上 |
| 主机样式 | `ConsolePlatform` | 同上 |
| 公司样式 | `Company` | 同上 |
| 地区样式 | `Region` | 同上 |

每个属性一次只能绑定一种样式类型；同一种样式类型只能分配给一个属性。同一属性的不同规则行不能重复占用属性值。

### 6.2 主要对外接口

| 函数 | 参数 | 返回值 | 职责 |
| --- | --- | --- | --- |
| `initMatrixStyleUI()` | 无 | `void` | 等待过滤按钮出现，在其右侧插入五个样式按钮并初始化编辑窗口 |
| `getMatrixEngineStyleState()` | 无 | 样式引擎状态对象 | 排除无效规则，利用公共映射把 UI 字段转换为引擎字段 |
| `applyMatrixStyles()` | 无 | `void` | 调用`compileStyleRules()`生成 CSS，再由`injectUserStyle()`注入当前页面 |

### 6.3 内部函数

| 函数 | 参数 | 返回值／作用 |
| --- | --- | --- |
| `el(tag,className,text)` | HTML 标签、类名、文字 | 创建`HTMLElement` |
| `button(text,handler,className)` | 按钮文本、回调、类名 | 创建`HTMLButtonElement` |
| `getAttribute(key)` | 属性名 | 属性配置或`undefined` |
| `getType(key)` | 样式类型名 | 类型配置或`undefined` |
| `getBoundType(key)` | 属性名 | 已绑定类型或`null` |
| `getRules(key)` | 属性名 | 该属性的规则数组 |
| `getOwner(type)` | 样式类型名 | 当前占用此类型的属性或`undefined` |
| `createRule(type)` | 样式类型 | 新规则 `{id,type,style,values}` |
| `normalizeHex(input)` | 颜色文本 | 六位 HEX 或`null` |
| `splitValues(value)` | 字符串或数组 | 拆分后的字符串数组 |
| `getEvents()` | 无 | `Promise<object[]>`；缓存读取的标准化事件 |
| `collectOptions(key)` | 数据属性名 | 去重、排序后的候选值数组 |
| `createStyleControl(rule)` | 规则对象 | 颜色／HEX／字体输入控件 |
| `createValueChips(rule)` | 规则对象 | 已选择属性值的标签容器 |
| `openValuePicker(attributeKey,rule)` | 属性名、规则 | 打开搜索／多选弹窗；返回`void` |
| `renderRules(attributeKey,tbody)` | 属性名、`HTMLElement` | 重绘样式表格；返回`void` |
| `renderEditor()` | 无 | 重绘当前样式编辑窗口 |
| `closeEditor()` | 无 | 关闭窗口并尝试恢复焦点 |
| `openEditor(attributeKey)` | 属性名 | `Promise<void>`；打开窗口并按需获取候选数据 |
| `createDialog()` | 无 | 共用弹窗的`HTMLElement` |
| `start()` | 无 | 初始化等待逻辑（如有需要则使用`MutationObserver`） |

### 6.4 应用时机与状态

- 选择样式类型、编辑规则、选择属性值时先更新 UI 内存状态。
- 点击“保存并应用”后转换规则、生成 CSS 并更新矩阵卡片效果。
- 点击样式重置，清空该属性下的规则并重新应用剩余样式。
- 五种效果：标题字体颜色、卡片背景色、卡片边框色、标题字体、卡片光晕。
- 状态不写入原时间轴的共享 `styleState` 或 `localStorage`；刷新页面后恢复默认。
- 自定义样式与过滤互不清除，也不会影响日期／年份跳转逻辑。

---

## 7. `matrix-date-jump.js`：横轴日期跳转

**路径：** `public/src/matrix/matrix-date-jump.js`  
**依赖：** `./matrix-data.js` 中的 `getDayIndex()`、`getDaysInMonth()`，以及 `matrix-date-jump.css`。

### 7.1 对外接口

| 函数 | 参数 | 返回值 | 职责 |
| --- | --- | --- | --- |
| `initMatrixDateJump()` | 无 | `void` | 在工具栏插入按钮、月份／日期选择面板并绑定关闭操作 |
| `jumpToMatrixDate(month,day)` | `month: number`(1—12)、`day: number`(0—当月最后一天) | `boolean` | 根据固定横轴索引定位列，尽量水平居中，并高亮日期表头 |

### 7.2 内部函数

| 函数 | 参数 | 返回值／作用 |
| --- | --- | --- |
| `createElement(tag,className,text)` | 标签、类名、文字 | `HTMLElement` |
| `createButton(text,className)` | 文字、类名 | `HTMLButtonElement` |
| `updateDayOptions(month)` | 月份 | `void`；按闰年2000年更新日期候选，包含00日 |
| `formatCoordinate(month,day)` | 月份、日期 | `string`；返回`MM-DD` |
| `openPanel()` | 无 | `void`；展开面板 |
| `closePanel()` | 无 | `void`；关闭面板 |
| `togglePanel()` | 无 | `void`；切换面板 |
| `createJumpPanel()` | 无 | `HTMLElement`；创建选择面板 |
| `start()` | 无 | `void`；等待过滤按钮出现后初始化 |

### 7.3 日期规则与跳转行为

- 日期选择只涉及横轴，**不需要年份输入**。
- 每月首列是`00日（日期未知）`，例如6月00日对应`06-00`，不是6月1日。
- 2月29日在378列中始终存在，因为横轴固定采用闰年参考。
- `jumpToMatrixDate()` 使用`getDayIndex()`寻找坐标，不读取事件，因此目标日期没有事件也能跳转。
- 通过目标日期表头的实际 DOM 位置和宽度计算滚动量，不把列宽写死成220px。
- 尽可能把目标日期放在固定年份栏右侧的可视区中心；两端日期受滚动边界限制可能无法完全居中。
- 只修改`scrollLeft`，不修改`scrollTop`。
- 成功时为标题添加`.mx-jump-target`并写入滚动容器的`data-jump-month`、`data-jump-day`、`data-jump-index`。
- 过滤重绘后，`matrix.js` 根据`data-jump-index`恢复日期高亮。

---

## 8. `matrix-year-jump.js`：纵轴年份跳转

**路径：** `public/src/matrix/matrix-year-jump.js`  
**依赖：** `matrix.js` 的 `matrix:ensure-year` 事件处理器，以及 `matrix-year-jump.css`。

### 8.1 对外接口

| 函数 | 参数 | 返回值 | 职责 |
| --- | --- | --- | --- |
| `initMatrixYearJump()` | 无 | `void` | 在日期跳转按钮后插入年份跳转按钮和输入面板 |
| `jumpToMatrixYear(year)` | `year: number`，1至9999整数 | `boolean` | 请求补足目标年份，查找年份行，尽量纵向居中并仅滚动纵轴 |

### 8.2 内部函数

| 函数 | 参数 | 返回值／作用 |
| --- | --- | --- |
| `el(tag,className,text)` | 标签、类名、文字 | `HTMLElement` |
| `makeButton(text,className)` | 文字、类名 | `HTMLButtonElement` |
| `validateYear(value)` | 文本或数字输入 | 合法的整数年份或`null`；范围1—9999 |
| `closePanel()` | 无 | 关闭年份面板；返回`void` |
| `openPanel()` | 无 | 打开面板，优先预填上一次跳转年份；返回`void` |
| `createPanel()` | 无 | `HTMLElement`；创建年份输入面板及确认／取消操作 |
| `performJump()`（`createPanel`内部） | 无 | `void`；验证输入后调用`jumpToMatrixYear()` |
| `start()` | 无 | `void`；等待日期跳转控件出现后初始化 |

### 8.3 无事件年份的定位规则

1. 用户输入1—9999的整数年份；非法输入显示提示，不执行跳转。
2. `jumpToMatrixYear()` 发出 `matrix:ensure-year` 自定义事件。
3. `matrix.js` 的 `ensureYear()` 判断目标是否在当前连续范围内。
4. 若目标在范围内，即使该年没有事件，也能找到 `.matrix-year-row[data-year="YYYY"]`。
5. 若目标不在范围内，先扩展`yearRange`并创建所缺年份的轻量空白行，再进行定位。
6. 以当前年份行的实际 DOM 位置和高度计算滚动量；尽可能把它放在固定日期表头下方的可视区域中心。
7. 只修改`scrollTop`，不修改`scrollLeft`；成功时年份标签添加`.mx-year-jump-target`。
8. 矩阵重绘后，`matrix.js` 使用滚动容器的`data-jump-year`恢复年份高亮。

说明：空白年份默认具有最小高度，因此年份坐标可被浏览、定位并为后续截图取景提供坐标基础；但当前没有实现独立截图导出。

---

## 9. CSS 文件与主要选择器

### 9.1 `matrix.css`

**路径：** `public/src/matrix/matrix.css`  
**职责：** 378列 Grid、年份／日期双向布局、粘性标签、无网格线的事件卡片展示。

主要 CSS 变量：

- `--matrix-column-count`：378。
- `--matrix-cell-width`：日期列宽，现阶段固定默认值。
- `--matrix-year-width`：年份固定栏宽度。
- `--matrix-header-height`：日期标题高度。
- `--matrix-card-background`、`--matrix-card-border`：默认事件卡片样式。

主要选择器：`.matrix-page`、`.matrix-topbar`、`.matrix-main`、`.matrix-scroll`、`.matrix-grid`、`.matrix-header-row`、`.matrix-corner`、`.matrix-day-header`、`.matrix-month-header`、`.matrix-year-row`、`.matrix-year-label`、`.matrix-cell`、`.matrix-month-cell`、`.matrix-card`、`.event-title`、`.matrix-message`。

### 9.2 `matrix-style-ui.css`

**路径：** `public/src/matrix/matrix-style-ui.css`  
**职责：** 五个样式按钮、共用编辑窗口、颜色/字体控件、规则表格、属性值选择窗口。

主要选择器：`.mx-style-trigger`、`.mx-style-overlay`、`.mx-style-panel`、`.mx-style-actions`、`.mx-style-table`、`.mx-style-control`、`.mx-style-color`、`.mx-style-hex`、`.mx-style-chips`、`.mx-style-picker-overlay`、`.mx-style-value-grid`、`.mx-style-value-item`。

### 9.3 `matrix-date-jump.css`

**路径：** `public/src/matrix/matrix-date-jump.css`  
**职责：** 日期跳转按钮与弹层、选项控件、目标日期表头高亮。

主要选择器：`.mx-jump-wrap`、`.mx-jump-trigger`、`.mx-jump-panel`、`.mx-jump-heading`、`.mx-jump-hint`、`.mx-jump-fields`、`.mx-jump-field`、`.mx-jump-select`、`.mx-jump-actions`、`.mx-jump-primary`、`.mx-jump-target`、`.mx-jump-sr-only`。

### 9.4 `matrix-year-jump.css`

**路径：** `public/src/matrix/matrix-year-jump.css`  
**职责：** 年份跳转按钮与弹层、年份输入控件、空白年份占位和高亮。

主要选择器：`.mx-year-jump-wrap`、`.mx-year-jump-trigger`、`.mx-year-jump-panel`、`.mx-year-jump-heading`、`.mx-year-jump-field`、`.mx-year-jump-input`、`.mx-year-jump-message`、`.mx-year-jump-actions`、`.mx-year-jump-primary`、`.mx-year-jump-target`、`.matrix-year-row-empty`（JS设置）、`.matrix-year-empty-fill`。

空白年份高度变量：`--matrix-empty-year-height`，默认使用80px。

以上四份 CSS 不在本次 README 更新中修改；后续缩放功能如改变变量或类名，须同步更新本节。

---

## 10. 数据接口及边界

### 10.1 Google Apps Script

- 原时间轴：`/exec`，保留历史行为。
- 过滤候选列表的已有接口：`/exec?action=options`，保留历史行为。
- 二维矩阵：`/exec?action=matrix`，新增对`YYYY-MM-00`的支持。

日期的合法性初检可能发生在 Apps Script 层；未传给前端的非法记录不会出现在`buildMatrixData().skipped`里。例如 `1984-00-00` 和 `1984-13-00` 不应视为合法月度日期。

### 10.2 当前可支持的范围与限制

- 日期跳转始终按378列固定坐标计算，与事件是否存在无关。
- 年份跳转允许没有事件的年份，范围1—9999。
- 年份行高度仍受卡片内容影响，有事件的年份可能高于空白年份；跳转使用真实 DOM 测量而非假定所有行等高。
- 对年份范围极端扩展时，仍需评估性能。
- 当前未实现图片截取、区域选择、独立横纵缩放、虚拟化渲染。

---

## 11. 测试记录

| 阶段 | 验收内容 | 状态 |
| --- | --- | --- |
| 日期映射单元测试 | 378列、日期00、闰年、非法日期、同日多事件、年份分组 | 已通过：23项通过、0项失败 |
| 矩阵接口测试 | `1984-06-00` 能进入6月00列；非法月份不破坏矩阵 | 已验证 |
| 过滤 UI | 按钮、规则、候选项搜索、AND／OR与Reset | 已确认 |
| 过滤接线 | 复用过滤引擎并刷新矩阵显示 | 已接线；此前反馈正常 |
| 五个样式窗口 | 绑定、颜色／字体、属性值、规则增删／重置 | 已通过 UI 验收 |
| 样式接线 | 规则转换、CSS编译注入、卡片数据属性 | 已接线；用户反馈正常 |
| 日期跳转 | 可跳到无事件日期、`00`日、2月29日；仅横向滚动 | 已通过 |
| 年份跳转 | 连续年份、空白年份、范围外扩展、仅纵向滚动 | 本轮实现已交付；本 README 不代表重新执行了自动测试 |

---

## 12. 后续阶段：截图取景与缩放（尚未实现）

下一阶段**先定义交互效果，再实现代码**，重点区分：

- **定位：** 日期与年份跳转已经具备；日期／年份不必有事件。
- **构图：** 日期列宽、年份行高、卡片可读性、视野范围，需要明确缩放策略。
- **取景：** 选择固定月日区间与年份区间，既支持单日纵向，也支持连续年份横向。
- **导出：** 保留所选坐标的日期标题、年份标签、事件卡片及当前过滤／自定义样式；不以浏览器可视区域截图作为唯一方案。

当前不应将缩放、坐标范围选择、PNG导出标记为已完成。后续需进一步讨论：输出尺寸与纵横比、跨很多年份／日期的版式、卡片换行和截断规则、空白日期／年份的取舍、浏览器与导出绘制技术、性能边界。

---

## 13. 开发与文档维护约定

1. 新增或替换每个 JavaScript、CSS、HTML 文件时，在文件顶部注释写明**相对项目根目录的完整路径**。
2. 优先提供完整文件替换内容，而非不易定位的代码片段。
3. 优先复用原有公共模块，避免对原时间轴进行矩阵专用修改。
4. 每次只验证一个独立功能阶段；先明确 UI／行为，再接线。
5. 变更函数时更新参数、返回值、依赖和自定义事件协议。
6. 新增本目录文件时更新本 README，并在 `public/src/README.md` 维持目录入口；入口页面变化时更新 `public/README.md`。
7. 保持日期00约定、378列定义、连续年份和空白坐标跳转能力。
8. 未实现功能必须明确标识为待开发，不应与已验收功能混写。
