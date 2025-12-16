export async function getVariant() {
  // 兼容：不设置任何东西时，默认 world-zh
  const key =
    globalThis.TIMELINE_VARIANT ||
    new URLSearchParams(location.search).get('variant') ||
    'world-zh';

  // 显式映射，避免动态 import 路径带来的部署问题
  const map = {
    'world-zh': () => import('../variants/world-zh.js'),
    'world-en': () => import('../variants/world-en.js'),
    'cn-zh':    () => import('../variants/cn-zh.js'),
    'cn-en':    () => import('../variants/cn-en.js'),
  };

  const loader = map[key] || map['world-zh'];
  const mod = await loader();
  return mod.default;
}
