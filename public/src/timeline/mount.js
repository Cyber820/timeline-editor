window.addEventListener('style:ready', () => {
  fetch(ENDPOINT)
    .then(res => res.json())
    .then(data => {
      originalItems = data.map((event, i) => {
        const contentText = event.content ?? event.Title ?? '(无标题)';
        const Start = event.Start ?? event.start ?? '';
        const End   = event.End   ?? event.end   ?? '';
        const blob  = (event.title ?? '').toString();

        const pick = (label) => {
          if (!blob) return '';
          const m = new RegExp(label + '：([^\\n]+)').exec(blob);
          return m ? m[1].trim() : '';
        };

        const EventType       = event.EventType       ?? event.eventType       ?? pick('事件类型');
        const Region          = event.Region          ?? event.region          ?? pick('地区');
        const Platform        = event.Platform        ?? event.platform        ?? pick('平台类型');
        const Company         = event.Company         ?? event.company         ?? pick('公司');
        const Status          = event.Status          ?? event.status          ?? pick('状态');
        const ConsolePlatform = event.ConsolePlatform ?? event.consolePlatform ?? pick('主机类型');

        const TagRaw = event.Tag ?? event.tag ?? pick('标签');
        const Tag = Array.isArray(TagRaw)
          ? TagRaw
          : String(TagRaw || '').split(',').map(s => s.trim()).filter(Boolean);

        const tooltipHtml = blob
          ? blob.replace(/\n/g, '<br>')
          : [
              `事件名称：${contentText}`,
              `事件类型：${EventType || ''}`,
              `时间：${Start || ''}${End ? ' ~ ' + End : ''}`,
              `状态：${Status || ''}`,
              `地区：${Region || ''}`,
              `平台类型：${Platform || ''}`,
              `主机类型：${ConsolePlatform || ''}`,
              `公司：${Company || ''}`
            ].join('<br>');

        return {
          id: event.id || `auto-${i + 1}`,
          content: contentText,
          start: Start,
          end: End || undefined,
          title: tooltipHtml,
          EventType, Region, Platform, Company, Status, ConsolePlatform,
          Tag
        };
      });

      // 初始化 Timeline：把标记打到外层 .vis-item
      timeline = new vis.Timeline(
        document.getElementById("timeline"),
        originalItems,
        {
          locale: "zh-cn",
          editable: false,
          margin: { item: 10, axis: 50 },
          orientation: { axis: 'bottom', item: 'bottom' },
          tooltip: { followMouse: true, overflowMethod: 'flip' },
          verticalScroll: true,
          zoomKey: "ctrlKey",
          stack: true,
          template: (item, element) => {
            const host = element?.closest?.('.vis-item') || element; // 外层容器
            if (host && window.__styleEngine) {
              window.__styleEngine.attachEventDataAttrs(host, item);
              host.classList.add('event'); // .vis-item.event
            }
            const root = document.createElement('div');
            const h4 = document.createElement('h4');
            h4.className = 'event-title';
            h4.textContent = item.content || '(无标题)';
            root.appendChild(h4);
            return root;
          }
        }
      );

      // 🔧 TEMP：清掉旧版样式配置（只为迁移一次，刷新后请删除此行）
      localStorage.removeItem('timelineStyle.v1');

      // 初始化后先应用一次已保存样式（若有）
      try {
        const saved = localStorage.getItem('timelineStyle.v1');
        if (saved) {
          const state = JSON.parse(saved);
          window.__styleEngine?.applyStyleState(state, {
            selectorBase: '.vis-item.event, .vis-item-content.event',
            titleSelector: '.event-title'
          });
        }
      } catch (e) {
        console.warn('[style] load saved style failed:', e);
      }
    });
});


// ← 正确关闭 then(data => { ... })

/* -------- 获取下拉选项 -------- */
fetch(ENDPOINT + '?action=options')
  .then(res => res.json())
  .then(options => {
    allOptions = options;

    const fill = (id, list) => {
      const select = document.getElementById(id);
      if (!select) return;   // 元素不存在就直接跳过
      select.innerHTML = ''; // 清空原有内容
      (list || []).forEach(opt => {
        const o = document.createElement('option');
        o.value = o.textContent = opt;
        select.appendChild(o);
      });
    };



   

    // 初始化“新增过滤标准”的属性下拉
    const attrSel = document.getElementById("filter-attribute");
    attrSel.innerHTML = '';
    Object.keys(attributeLabels).forEach(key => {
      const o = document.createElement("option");
      o.value = key;
      o.textContent = attributeLabels[key];
      attrSel.appendChild(o);
    });
attrSel.addEventListener("change", () => {
  const key = attrSel.value;
  const opts = getFilterOptionsForKey(key);  // ✅ 统一拿到数组
  const sel = document.getElementById("filter-options");
  sel.innerHTML = '';
  opts.forEach(opt => {
    const o = document.createElement("option");
    o.value = o.textContent = opt;
    sel.appendChild(o);
  });
  if (filterOptionsChoices) filterOptionsChoices.destroy();
  filterOptionsChoices = new Choices(sel, { removeItemButton: true, shouldSort: false });
});
    attrSel.dispatchEvent(new Event("change"));
  });
