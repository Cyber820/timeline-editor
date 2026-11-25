
### matrix-filter-ui.js

定位：二维矩阵过滤/筛选界面接入模块。

依赖：
- ../filter/filter-ui.js
- ../filter/filter-state.js

#### initMatrixFilterUI({ getItems })

初始化二维矩阵的过滤界面。

参数：
- getItems：Function
- 返回未经筛选的标准化事件数组
- 默认返回空数组

返回：
- void

功能：
- 调用现有 initFilterUI() 创建过滤工具栏与面板
- 将过滤界面挂载在 #matrix 容器之前
- 复用现有的过滤字段、选项及搜索界面
- 登记和删除过滤规则
- 更新 AND/OR 状态
- 重置过滤规则

当前限制：
- 不调用 applyFilters()
- 不更新矩阵显示的事件
- 不保存规则到浏览器持久存储
- 每个页面生命周期只初始化一次

### matrix.js：本阶段新增依赖

新增：
- import initMatrixFilterUI()

initMatrix() 新增行为：
- 保存完整的标准化事件数组 allEvents
- 初始化过滤界面
- 将 getItems 回调提供给过滤面板
- 保持原矩阵渲染流程不变

### matrix.css：本阶段布局变更

- .matrix-main 使用纵向 Flex 布局
- .tl-toolbar 位于矩阵滚动区域上方
- .matrix-scroll 占用剩余高度
- 过滤面板的视觉样式仍由原有 filter-ui.js 提供
- 保留378列、无网格线及事件卡片样式
