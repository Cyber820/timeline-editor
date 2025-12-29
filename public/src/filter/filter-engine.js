// public/src/filter/filter-engine.js
// 过滤引擎：候选项生成 + 结果筛选（与 UI 解耦）
// ✅ 合并版：保留原版 applyFilters/normalize 等完整逻辑，并加入国际化 key→label

/* ---------------------------------------------------------
 * 0) 语言判断（尽量不强依赖其他模块，避免循环依赖）
 * ------------------------------------------------------- */
function getLang() {
  // 优先：globalThis.VARIANT?.lang（如果你有把 variant 挂到全局）
  const vLang = globalThis?.VARIANT?.lang;
  if (typeof vLang === 'string' && vLang) return vLang.toLowerCase();

  // 其次：globalThis.TIMELINE_LANG（你自己在 html / app.js 里注入的语言）
  const gLang = globalThis?.TIMELINE_LANG;
  if (typeof gLang === 'string' && gLang) return gLang.toLowerCase();

  // 兜底：中文
  return 'zh';
}

/* ---------------------------------------------------------
 * 1) key ↔ label（国际化）
 *  - 注意：这里已移除 Tag，新增 Importance
 * ------------------------------------------------------- */
const KEY_LABELS = Object.freeze({
  zh: Object.freeze({
    Region: '地区',
    Platform: '平台类型',
    ConsolePlatform: '主机类型',
    EventType: '事件类型',
    Company: '公司',
    Importance: '重要性',
  }),
  en: Object.freeze({
    Region: 'Region',
    Platform: 'Platform',
    ConsolePlatform: 'Console Platform',
    EventType: 'Event Type',
    Company: 'Company',
    Importance: 'Importance',
  }),
});

/**
 * 获取当前语言的 KEY_LABEL 映射
 * - 默认中文；lang 为 'en' 时使用英文
 */
function getKeyLabelMap() {
  const lang = getLang();
  return lang === 'en' ? KEY_LABELS.en : KEY_LABELS.zh;
}

// ✅ 对外导出：当前语言下的 KEY_LABEL / LABEL_KEY
// 注意：为了让外部在运行期切换语言后也能得到最新映射，
// KEY_LABEL/LABEL_KEY 不做 Object.freeze 常量快照，而是通过 getter 函数动态返回。
export function keyToLabel(k) {
  const m = getKeyLabelMap();
  return m[k] || k;
}

export function labelToKey(l) {
  const m = getKeyLabelMap();
  // 反向映射：同语言下 label -> key
  const rev = Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
  return rev[l] || l;
}

// 兼容你原本的导出形态（有些地方可能直接用 KEY_LABEL / LABEL_KEY）
export const KEY_LABEL = new Proxy(
  {},
  {
    get(_t, prop) {
      const m = getKeyLabelMap();
      return m[prop] || prop;
    },
    ownKeys() {
      return Reflect.ownKeys(getKeyLabelMap());
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true };
    },
  },
);

export const LABEL_KEY = new Proxy(
  {},
  {
    get(_t, prop) {
      const m = getKeyLabelMap();
      const rev = Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
      return rev[prop] || prop;
    },
    ownKeys() {
      const m = getKeyLabelMap();
      return Object.values(m);
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true };
    },
  },
);

/* ---------------------------------------------------------
 * 2) 可供选择的过滤字段（顺序固定，便于 UI 稳定展示）
 * ------------------------------------------------------- */
export function getOptionKeys() {
  // ✅ 已移除 'Tag'，新增 'Importance'
  return ['Region', 'Platform', 'ConsolePlatform', 'EventType', 'Company', 'Importance'];
}

/* ---------------------------------------------------------
 * 3) 值归一化
 * ------------------------------------------------------- */
/**
 * 按字段归一化值：
 * - Tag：拆成数组（虽然当前 UI 已不再使用 Tag，但保留逻辑不影响）
 * - 其他：统一转成去空格字符串
 */
export function normalizeValueByKey(key, v) {
  if (v == null) return '';

  if (key === 'Tag') {
    if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
    return String(v)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Importance / Region / Platform / ConsolePlatform / EventType / Company
  return String(v).trim();
}

/* ---------------------------------------------------------
 * 4) 候选项生成
 * ------------------------------------------------------- */
/**
 * 从全部事件 items 中收集某个字段的所有可选值，
 * 去重后按字典序排序。
 */
export function getOptionsForKey(items = [], key) {
  const K = String(key || '').trim();
  const set = new Set();

  for (const it of items) {
    if (!it) continue;
    const raw = it[K];

    if (K === 'Tag') {
      // 当前 UI 已不再暴露 Tag 作为过滤字段，这一支逻辑基本不会走到，
      // 但保留兼容性，以防后续复用。
      const arr = Array.isArray(raw) ? raw : normalizeValueByKey('Tag', raw);
      for (const t of arr || []) {
        if (t) set.add(t);
      }
    } else {
      const val = normalizeValueByKey(K, raw);
      if (val) set.add(val);
    }
  }

  // Importance 目前是 0/1/2/3/4/5，字符串排序正好就是 0–5
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/* ---------------------------------------------------------
 * 5) 过滤匹配 + 应用规则
 * ------------------------------------------------------- */
/**
 * 判断单条规则是否命中
 * - Tag：支持多标签包含（尽管当前 UI 已不再使用 Tag）
 * - 其他字段：完全匹配其字符串值
 */
function matchOne(item, rule) {
  const { key, values } = rule || {};
  if (!key || !values || values.length === 0) return true;

  if (key === 'Tag') {
    const tags = Array.isArray(item.Tag)
      ? item.Tag
      : normalizeValueByKey('Tag', item.Tag);
    const bag = new Set((tags || []).map((s) => String(s)));
    return values.some((v) => bag.has(String(v)));
  }

  const left = normalizeValueByKey(key, item[key]);
  const want = new Set(values.map((v) => String(v).trim()));
  return want.has(left);
}

/**
 * 应用过滤规则：
 * - logic = 'AND'（默认）：所有规则都命中才保留
 * - logic = 'OR'          ：任意命中一条即保留
 */
export function applyFilters(items = [], { logic = 'AND', rules = [] } = {}) {
  if (!rules || rules.length === 0) return items.slice();
  const isAND = logic !== 'OR';

  return items.filter((it) => {
    let hits = 0;
    for (const r of rules) {
      const ok = matchOne(it, r);
      if (ok) {
        if (!isAND) return true; // OR：命中即保留
        hits++;
      } else if (isAND) {
        return false; // AND：有一条未命中即淘汰
      }
    }
    return isAND ? hits === rules.length : false;
  });
}
