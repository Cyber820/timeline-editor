// public/src/utils/id.js
// ✅ 统一 ID 生成工具：稳健、可配置、带良好注释。
// 用法：
//   genId();                    // "r_..."（默认前缀）
//   genId('ev_');               // "ev_..."
//   const makeRuleId = makeIdFactory('rule_');
//   makeRuleId();               // "rule_..."
//   shortId(8);                 // "k9x3f0qz"（适合做 UI 元素的短标签）

/**
 * 内部：检测 crypto 能力
 */
function getCrypto() {
  // Node / 浏览器兼容：globalThis 是最稳妥的宿主
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  return g.crypto || null;
}

/**
 * 内部：获取若干随机字节（优先 crypto.getRandomValues）
 */
function randomBytes(n) {
  const c = getCrypto();
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint8Array(n);
    c.getRandomValues(buf);
    return buf;
  }
  // 回退：用 Math.random 填充（低熵，但可用）
  const buf = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    buf[i] = Math.floor(Math.random() * 256);
  }
  return buf;
}

/**
 * 内部：把随机字节转为 base36 字符串（短、可读）
 */
function bytesToBase36(buf) {
  // 将每 4 字节拼成一个 32 位数，再转 36 进制，减小字符串长度
  let out = '';
  for (let i = 0; i < buf.length; i += 4) {
    const a = buf[i] ?? 0;
    const b = buf[i + 1] ?? 0;
    const c = buf[i + 2] ?? 0;
    const d = buf[i + 3] ?? 0;
    const num = (a << 24) | (b << 16) | (c << 8) | d;
    // >>> 0 转无符号，避免负数
    out += (num >>> 0).toString(36);
  }
  return out;
}

// 记录上一次生成的时间戳与自增计数，避免同毫秒“碰撞”
let _lastTs = 0;
let _inc    = 0;

/**
 * 生成一个高概率唯一的 ID。
 * 生成策略：
 *  - 优先使用 crypto.randomUUID()，并附带自增序列保障同毫秒内的单调性。
 *  - 否则使用：时间戳（base36） + 随机字节（base36） + 计数器。
 *
 * @param {string} [prefix='r_'] - 自定义前缀，便于区分实体类型
 * @returns {string} e.g. "r_ky3f7s1e-0" / "ev_lmno12-abc34-2"
 */
export function genId(prefix = 'r_') {
  const c = getCrypto();
  const ts = Date.now();

  if (ts === _lastTs) {
    _inc += 1;
  } else {
    _lastTs = ts;
    _inc = 0;
  }

  // 分支 1：最佳路径 randomUUID（最简最强）
  if (c && typeof c.randomUUID === 'function') {
    // 附加自增计数，避免极端情况下日志难以区分
    const base = c.randomUUID(); // 形如 "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    return `${prefix}${base}-${_inc}`;
  }

  // 分支 2：手动组装：时间戳 + 随机字节 + 计数器
  const time36 = ts.toString(36);
  const rand36 = bytesToBase36(randomBytes(8)); // 8 字节够用
  return `${prefix}${time36}-${rand36}-${_inc}`;
}

/**
 * 便捷工厂：生成带固定前缀的 ID 生成器
 * @param {string} prefix - 如 "ev_" | "rule_" | "row_"
 * @returns {() => string}
 */
export function makeIdFactory(prefix = 'r_') {
  return () => genId(prefix);
}

/**
 * 生成一段短 ID（适合 UI 控件/行内标签，不保证全局唯一性）
 * @param {number} len - 长度（默认 10）
 * @returns {string} 仅含 [0-9a-z] 的短串
 */
export function shortId(len = 10) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
