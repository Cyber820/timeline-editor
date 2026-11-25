
## 自定义样式接线

### matrix-style-ui.js

新增外部依赖：

- ../_staging/constants.js
  - ENGINE_KEY_MAP
  - buildEngineStyleState()

- ../style/engine.js
  - compileStyleRules()
  - injectUserStyle()

#### getMatrixEngineStyleState()

参数：无

返回：
- EngineStyleState

功能：
- 读取当前样式UI的boundTypes和rules
- 排除缺少属性值或有效样式值的规则
- 调用现有buildEngineStyleState()
- 将fontColor转换为textColor
- 将backgroundColor转换为bgColor
- 转换其余样式类型及属性值规则

对外导出。

#### applyMatrixStyles()

参数：无

返回：
- void

功能：
- 获取当前样式引擎状态
- 调用原有compileStyleRules()
- 使用.matrix-card.event作为选择器
- 使用.event-title作为标题选择器
- 调用injectUserStyle()更新页面CSS

对外导出。

样式保存方式：
- 只保存在当前页面内存中
- 不使用localStorage
- 不写入原时间轴的styleState
- 不请求远程样式编译API
- 刷新后恢复默认

交互规则：
- 确认绑定：创建样式规则，不立即应用
- 修改颜色或字体：更新UI规则，不立即应用
- 新增或删除样式行：更新UI规则
- 保存并应用：编译并应用全部有效样式规则
- 重置：清空当前属性的规则并立即重新应用样式

五种可用样式：
- 字体颜色
- 背景颜色
- 边框颜色
- 字体
- 光晕颜色

### matrix.js

新增依赖：

- ../style/engine.js
  - attachEventDataAttrs()

#### createEventCard(event)

新增行为：
- 创建事件标题卡片
- 调用attachEventDataAttrs(card, event)
- 为卡片附加data-*属性

样式匹配属性：
- EventType
- Company
- Tag
- Platform
- ConsolePlatform
- Region

样式引擎根据这些属性匹配事件卡片。

过滤与样式的关系：

- 过滤引擎决定哪些事件显示
- 样式引擎决定已显示事件的视觉效果
- 过滤时重新创建事件卡片
- 新卡片自动重新附加data-*属性
- 原有注入的样式CSS继续匹配新卡片
- 过滤操作不需要重新编译样式

### matrix.css

本阶段无修改。

继续负责：
- 378列矩阵
- 年份纵轴
- 无网格线布局
- 默认事件卡片样式

自定义样式规则由原样式引擎生成，
在CSS层覆盖默认卡片外观。

### matrix-style-ui.css

本阶段无修改。

继续负责：
- 五个样式按钮
- 样式编辑窗口
- 属性值多选窗口
- 颜色及字体控件
- 样式规则表格

## 本阶段验收项目

- 五种样式均可应用到对应事件
- 字体颜色仅改变标题颜色
- 背景颜色改变卡片背景
- 边框颜色改变卡片边框
- 字体选择能够改变标题字体
- 光晕颜色能够产生卡片阴影效果
- 删除规则后保存，旧样式消失
- 重置后恢复默认效果
- 过滤后保留有效样式
- Reset过滤器不会清除样式
- 刷新页面后样式恢复默认
- 原横向时间轴保持正常
```
