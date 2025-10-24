// src/style/stateMem.js
// ✅ 模块职责：
//    保存“样式编辑面板”的前端内存状态（非持久化）。
//    - 在 UI 编辑操作中快速读写（不触 localStorage）。
//    - 与 styleState.js 互不直接绑定，仅通过引擎层同步。
// -----------------------------------------------------------
// ⚙️ 数据流关系：
//    [UI操作] → stateMem → engine.buildEngineStyleState() → timeline渲染
//    [保存样式] ← styleState(localStorage)
//
// ⚠️ 仅在内存中存在，刷新页面即失效。

export const stateMem = {
  /**
   * 当前正在编辑的样式属性键。
   * 例如 "EventType" / "Region" / "Platform"。
   * 由 UI 面板中选中项更新。
   * @type {string|null}
   */
  currentStyleAttr: null,

  /**
   * 记录每个属性绑定的样式类型。
   * 例：{ EventType: 'fontColor', Region: 'borderColor' }
   * 用于限制同一属性只能绑定一种样式类型。
   * @type {Record<string, 'fontColor'|'borderColor'|'backgroundColor'|'fontFamily'|'haloColor'|'none'>}
   */
  boundStyleType: {},

  /**
   * 反向索引：样式类型归属的属性。
   * 例：{ fontColor: 'EventType' }
   * 用于防止同一样式类型被多个属性绑定。
   * @type {Record<string, string>}
   */
  styleTypeOwner: {},

  /**
   * 样式规则桶。
   * 按属性键（如 EventType）存储对应规则数组。
   * 每条规则包含：
   *   { id, type, style: {}, values: [] }
   *
   * 示例：
   *   {
   *     EventType: [
   *       { id:'r_123', type:'fontColor', style:{ fontColor:'#ff0' }, values:['主机游戏'] }
   *     ]
   *   }
   * @type {Record<string, Array<{id:string,type:string,style:Object,values:string[]}>>}
   */
  styleRules: {},

  /**
   * 样式表格中每行当前选择的值。
   * 例：
   *   { 'r_123': ['主机游戏', '掌机游戏'] }
   * 用于 UI 去重判断（防止重复选择同值）。
   * @type {Record<string, string[]>}
   */
  styleRowSelections: {},
};
