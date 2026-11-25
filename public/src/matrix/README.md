
### matrix-filter-ui.js

定位：二维矩阵过滤界面及事件桥接模块。

依赖：
- ../filter/filter-ui.js
- ../filter/filter-state.js

#### initMatrixFilterUI({ getItems, onApply })

参数：
- getItems：Function
  返回全部未经筛选的标准化事件数组。
- onApply：Function
  在需要实际执行筛选时调用，参数为当前过滤状态快照。

返回：
- void

交互规则：
- 新增规则：仅更新规则状态，不立即筛选。
- AND/OR：立即应用全部规则。
- 删除规则：立即重新筛选。
- Reset：清空规则并恢复全部事件。

### matrix.js：过滤功能

新增依赖：
- ../filter/filter-engine.js
- ./matrix-filter-ui.js

新增内部函数：

#### applyMatrixFilter(state)

参数：
- state：过滤状态对象，包含logic和rules。

功能：
- 调用现有applyFilters()。
- 保存筛选结果。
- 重新绘制矩阵。

#### redrawCurrentEvents()

参数：无。

功能：
- 使用当前事件数组重建矩阵。
- 尽可能保留原有滚动位置。
- 更新事件数量统计。

#### updateMatrixStatus(matrixData)

参数：
- matrixData：buildMatrixData()返回的数据。

功能：
- 显示当前事件数量及原始事件数量。
- 显示月度事件数量、年份数量和跳过记录数。

过滤状态由原有filter-state.js管理。
过滤判断由原有filter-engine.js执行。

当前默认显示全部事件，不预设重要性过滤。
```
