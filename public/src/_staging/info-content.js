// public/src/_staging/info-contents.js
// =============================================================================
// Info Contents (How-to / Roadmap)
// =============================================================================
// 职责：
// - 维护“使用方法（howToUse）”与“开发计划与反馈（roadmap）”的纯文本内容
// - 按 variantKey（region-lang）返回不同版本内容
// - 兼容历史写法：仍导出 HOW_TO_USE_TEXT / ROADMAP_TEXT
//
// 变体选择优先级（resolveVariantKey）：
// 1) globalThis.__variant.key
// 2) globalThis.TIMELINE_VARIANT
// 3) globalThis.__variant.region + __variant.lang（或 TIMELINE_REGION/TIMELINE_LANG）
// 4) <html lang="..."> 推断（zh -> world-zh，否则 world-en）
// 5) 默认 world-zh
//
// 🔌 GENERALIZATION:
// - 若未来你的 variant 体系扩大（例如 japan-ja / usa-en），只需要在 CONTENTS 里新增键即可。
// - 若你希望“china-* 未维护时自动复用 world-*”，见 pickPack() 的 fallback 策略。
// =============================================================================

/** 将输入规范化为小写 key */
function norm(x) {
  return String(x ?? '').trim().toLowerCase();
}

/**
 * resolveVariantKey()
 * - 生成标准的 variantKey：region-lang，例如 china-zh / china-en / world-zh / world-en
 */
export function resolveVariantKey() {
  // 1) 优先：系统里已存在的 __variant.key
  const v = globalThis.__variant || {};
  const key1 = norm(v.key);
  if (key1) return key1;

  // 2) 次优先：TIMELINE_VARIANT
  const key2 = norm(globalThis.TIMELINE_VARIANT);
  if (key2) return key2;

  // 3) 再次：region + lang
  const region = norm(v.region || globalThis.TIMELINE_REGION);
  const lang = norm(v.lang || globalThis.TIMELINE_LANG);
  if (region && lang) return `${region}-${lang}`;

  // 4) 最后兜底：根据 <html lang="">
  const docLang = norm(document?.documentElement?.lang);
  if (docLang) {
    const short = docLang.startsWith('zh') ? 'zh' : 'en';
    return `world-${short}`;
  }

  return 'world-zh';
}

/**
 * =============================================================================
 * 内容字典：地区×语言 -> 文本包
 * =============================================================================
 * key 例：china-zh / china-en / world-zh / world-en
 *
 * 约定字段：
 * - howToUse: string
 * - roadmap:  string
 *
 * 注意：
 * - 文本将被 <pre> 保留换行与空行，所以这里用模板字符串最合适
 * - 每一段最终会 trim()，避免首尾多余空行
 */
const CONTENTS = Object.freeze({
  /* ---------------- world-zh ---------------- */
  'world-zh': {
    howToUse: `
【使用方法】
初次渲染的时候，默认只显示重要性为4和5的事件（事件分级标准在下文）

1. 基本操作
- 在时间轴上拖动：按住鼠标左键拖动时间轴。
- 缩放时间轴：按住 Ctrl 键滚动鼠标滚轮进行缩放。

2. 查看事件详情
- 点击时间轴上的事件卡片，会在页面中间弹出详情窗口。
- 再次点击空白区域，可以关闭详情窗口。

3. 筛选事件
- 点击「筛选」按钮，打开过滤面板。
- 可以按照地区、平台类型、事件类型等条件进行筛选。
- 筛选条件支持多选，部分条件之间支持 AND / OR 逻辑组合；
  当前“和”逻辑的意思是：同时满足过滤属性A中选择的过滤选项以及属性B中选择的过滤选项
  “或”逻辑的意思是：任意满足所选择的过滤选项。
  复杂的过滤/筛选功能暂时没有开发安排。

4. 样式调整（仅对当前浏览器生效）
- 在筛选按钮右侧，可以看到「事件样式 / 平台样式 / 主机样式 / 公司 / 地区」等按钮。
- 可以为不同类型的事件设置文字颜色、背景颜色、边框颜色等。
- 刷新页面后，样式会恢复为默认设置。

5. 关于重要性的打分（可能编者主观情绪比较重，有意见欢迎反馈）
- 5：世界性里程碑事件（比如PS、GBA等游戏主机的发售）
- 4：地区性里程碑事件/世界性重要事件：对某地区而言有巨大影响力或者引起重大连锁反应的事件；或者在世界范围内非常重要但未到里程碑性的事件（比如某区域性电子游戏媒体的发售）
- 3：地区性重要事件/世界性值得一提事件：对某地区在当时有巨大影响力但是不到开创性的高度；或者在世界范围在当初有影响力但是后续影响力不足的事件
- 2：地区性值得一提事件/世界性有特定影响事件：在某地区在当初有影响力但是后续影响力不足的事件；在世界范围内特定群体里有一定影响的事件
- 1：地区性有特定影响事件
- 0：特殊事件：一般是展现某种故事或者轶闻的事件，但往往缺少对行业的影响力
`.trim(),

    roadmap: `
【开发计划与反馈】
这个是当前的Beta版本，后续还有逐步的功能更新和完善。
无论是对时间轴的功能或者bug，还是对当前时间轴上的事件有反馈，都可以小红书联系“赛博820”或者微信号“TheCyber820”

已完成功能
- 时间轴基础展示（支持拖动与缩放）
- 事件详情点击弹窗
- 基于条件的筛选功能（地区 / 平台 / 主机 / 事件类型等）
- 简单的样式自定义功能（按事件属性设置颜色、字体）
- 根据重要性（主观）调整默认显示的事件（2025/11/21）
- 简易反馈功能（2025/11/25）

计划中功能
- 编辑者模式（方便提交有关事件的反馈）
- 加入标签功能（短期内可能不会实现，除了可能需要改变当前的一些数据结构之外，另一个原因是可能会让样式功能产生冲突）
`.trim(),
  },

  /* ---------------- world-en ---------------- */
  'world-en': {
    howToUse: `
Frankly speaking, this page is made for future update, I currently do not have a plan to translate this timeline yet.

[How to Use]
On first load, only events with Importance 4 or 5 are shown by default.

1. Basic navigation
- Drag the timeline: click and drag with the mouse.
- Zoom: hold Ctrl and scroll.

2. Event details
- Click an event card to open the details popover.
- Click outside to close.

3. Filters
- Click "Filter" to open the filter panel.
- Filter by Region / Platform / Event Type / Company / Console Platform / Importance.
- AND means: all selected rules must match.
- OR means: any selected rule matches.
  (Advanced filter features are not planned yet.)

4. Styles (local to this browser)
- Use the style buttons next to Filter (Event / Platform / Console / Company / Region).
- You can set text color / background / border color, etc.
- Refreshing the page resets styles.

5. Importance scale (subjective; feedback welcome)
- 5: global milestones (e.g., launch of major consoles)
- 4: regional milestones / globally important events
- 3: important regional events / notable global events
- 2: notable regional events / niche global impact
- 1: limited regional impact
- 0: anecdotal / special items with little industry impact
`.trim(),

    roadmap: `
[Roadmap & Feedback]
This is a Beta version and will be improved iteratively.
For feedback on features/bugs or event entries, you can reach out via:
- RedNote: "赛博820"
- WeChat: "TheCyber820"

Completed
- Basic timeline view (drag & zoom)
- Click-to-open event details
- Filter panel (Region / Platform / Console / Event Type, etc.)
- Basic style customization by attributes
- Default view based on Importance (2025/11/21)
- Simple feedback submission (2025/11/25)

Planned
- Editor mode (easier event corrections/submissions)
- Tag system (likely not soon; may conflict with styles and needs data changes)
`.trim(),
  },

  /* ---------------- china-zh ---------------- */
  'china-zh': {
    // 你目前内容与 world-zh 一致也完全 OK（未来再替换为“中文游戏时间轴”的定制说明）
    howToUse: `
【使用方法】
初次渲染的时候，默认只显示重要性为4和5的事件（事件分级标准在下文）

1. 基本操作
- 在时间轴上拖动：按住鼠标左键拖动时间轴。
- 缩放时间轴：按住 Ctrl 键滚动鼠标滚轮进行缩放。

2. 查看事件详情
- 点击时间轴上的事件卡片，会在页面中间弹出详情窗口。
- 再次点击空白区域，可以关闭详情窗口。

3. 筛选事件
- 点击「筛选」按钮，打开过滤面板。
- 可以按照地区、平台类型、事件类型等条件进行筛选。
- 筛选条件支持多选，部分条件之间支持 AND / OR 逻辑组合；
  当前“和”逻辑的意思是：同时满足过滤属性A中选择的过滤选项以及属性B中选择的过滤选项
  “或”逻辑的意思是：任意满足所选择的过滤选项。
  复杂的过滤/筛选功能暂时没有开发安排。

4. 样式调整（仅对当前浏览器生效）
- 在筛选按钮右侧，可以看到「事件样式 / 平台样式 / 主机样式 / 公司 / 地区」等按钮。
- 可以为不同类型的事件设置文字颜色、背景颜色、边框颜色等。
- 刷新页面后，样式会恢复为默认设置。

5. 关于重要性的打分（可能编者主观情绪比较重，有意见欢迎反馈）
- 5：世界性里程碑事件（比如PS、GBA等游戏主机的发售）
- 4：地区性里程碑事件/世界性重要事件：对某地区而言有巨大影响力或者引起重大连锁反应的事件；或者在世界范围内非常重要但未到里程碑性的事件（比如某区域性电子游戏媒体的发售）
- 3：地区性重要事件/世界性值得一提事件：对某地区在当时有巨大影响力但是不到开创性的高度；或者在世界范围在当初有影响力但是后续影响力不足的事件
- 2：地区性值得一提事件/世界性有特定影响事件：在某地区在当初有影响力但是后续影响力不足的事件；在世界范围内特定群体里有一定影响的事件
- 1：地区性有特定影响事件
- 0：特殊事件：一般是展现某种故事或者轶闻的事件，但往往缺少对行业的影响力
`.trim(),

    roadmap: `
【开发计划与反馈】
这个是当前的Beta版本，后续还有逐步的功能更新和完善。
无论是对时间轴的功能或者bug，还是对当前时间轴上的事件有反馈，都可以小红书联系“赛博820”或者微信号“TheCyber820”

已完成功能
- 时间轴基础展示（支持拖动与缩放）
- 事件详情点击弹窗
- 基于条件的筛选功能（地区 / 平台 / 主机 / 事件类型等）
- 简单的样式自定义功能（按事件属性设置颜色、字体）
- 根据重要性（主观）调整默认显示的事件（2025/11/21）
- 简易反馈功能（2025/11/25）

计划中功能
- 编辑者模式（方便提交有关事件的反馈）
- 加入标签功能（短期内可能不会实现，除了可能需要改变当前的一些数据结构之外，另一个原因是可能会让样式功能产生冲突）
`.trim(),
  },

  /* ---------------- china-en ---------------- */
  'china-en': {
    howToUse: `
Still gradually working on this timeline to translate from Chinese to English.

[How to Use]
On first load, only events with Importance 4 or 5 are shown by default.

1. Basic navigation
- Drag the timeline: click and drag with the mouse.
- Zoom: hold Ctrl and scroll.

2. Event details
- Click an event card to open the details popover.
- Click outside to close.

3. Filters
- Click "Filter" to open the filter panel.
- Filter by Region / Platform / Event Type / Company / Console Platform / Importance.
- AND means: all selected rules must match.
- OR means: any selected rule matches.
  (Advanced filter features are not planned yet.)

4. Styles (local to this browser)
- Use the style buttons next to Filter (Event / Platform / Console / Company / Region).
- You can set text color / background / border color, etc.
- Refreshing the page resets styles.

5. Importance scale (subjective; feedback welcome)
- 5: global milestones (e.g., launch of major consoles)
- 4: regional milestones / globally important events
- 3: important regional events / notable global events
- 2: notable regional events / niche global impact
- 1: limited regional impact
- 0: anecdotal / special items with little industry impact
`.trim(),

    roadmap: `
[Roadmap & Feedback]
This is a Beta version and will be improved iteratively.
For feedback on features/bugs or event entries, you can reach out via:
- RedNote: "赛博820"
- WeChat: "TheCyber820"

Completed
- Basic timeline view (drag & zoom)
- Click-to-open event details
- Filter panel (Region / Platform / Console / Event Type, etc.)
- Basic style customization by attributes
- Default view based on Importance (2025/11/21)
- Simple feedback submission (2025/11/25)

Planned
- Editor mode (easier event corrections/submissions)
- Tag system (likely not soon; may conflict with styles and needs data changes)
`.trim(),
  },
});

/**
 * pickPack(key)
 * - 先按完整 key 精确匹配
 * - 再按 region-lang 拆解做 fallback
 * - 最后按语言 fallback 到 world-en / world-zh
 *
 * 说明：
 * - 你原本写了“如果存在但为 null 表示复用”，但 CONTENTS 里并未用到 null。
 * - 这里采用更明确的策略：若 key 命中则返回；否则按语言回退到 world-*。
 */
function pickPack(key) {
  const k = norm(key);

  // 1) 精确匹配
  if (k && CONTENTS[k]) return CONTENTS[k];

  // 2) region-lang fallback（比如传入 china-zh，但没维护时回退）
  if (k.includes('-')) {
    const [region, lang] = k.split('-');

    // 优先尝试 region-lang
    if (region && lang) {
      const direct = CONTENTS[`${region}-${lang}`];
      if (direct) return direct;

      // 再按语言回退到 world-*
      if (lang === 'en') return CONTENTS['world-en'];
      if (lang === 'zh') return CONTENTS['world-zh'];
    }
  }

  // 3) 最终兜底
  return CONTENTS['world-zh'];
}

/**
 * getInfoText(kind)
 * kind: 'howToUse' | 'roadmap'
 */
export function getInfoText(kind) {
  const key = resolveVariantKey();
  const pack = pickPack(key);
  if (!pack) return '';
  return String(pack[kind] || '').trim();
}

/**
 * 兼容旧写法：仍导出 HOW_TO_USE_TEXT / ROADMAP_TEXT
 * - 旧代码：import { HOW_TO_USE_TEXT } from '...'
 * - 新代码：建议用 getInfoText('howToUse'/'roadmap')
 *
 * 注意：
 * - 这两个常量在模块初始化时求值，因此若你在运行时动态改变 __variant，
 *   常量不会自动更新；此时应调用 getInfoText() 重新取值。
 */
export const HOW_TO_USE_TEXT = getInfoText('howToUse');
export const ROADMAP_TEXT = getInfoText('roadmap');
