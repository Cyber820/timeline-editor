// public/src/timeline/fetch.js
// Step 1: 提供可直接给 vis.Timeline 使用的 items（不依赖后端，先跑通页面）
// 注意：start/end 用毫秒时间戳（number），避免 Date/realm 判定问题

export async function fetchAndNormalize() {
  const U = Date.UTC; // U(Y, M(0-based), D)
  return [
    {
      id: 1,
      content:
        '<h4 class="event-title">Project Kickoff</h4>' +
        '<div class="event-meta">地区：日本 · 平台：PC</div>',
      start: U(2023, 10, 1), // 2023-11-01
    },
    {
      id: 2,
      content:
        '<h4 class="event-title">Alpha Internal</h4>' +
        '<div class="event-meta">公司：Acorn Games</div>',
      start: U(2024, 2, 12), // 2024-03-12
    },
    {
      id: 3,
      content:
        '<h4 class="event-title">Closed Beta</h4>' +
        '<div class="event-meta">主机：Switch</div>',
      start: U(2024, 6, 5), // 2024-07-05
    },
    {
      id: 4,
      content:
        '<h4 class="event-title">Launch</h4>' +
        '<div class="event-meta">地区：北美</div>',
      start: U(2025, 1, 18), // 2025-02-18
    },
  ];
}

