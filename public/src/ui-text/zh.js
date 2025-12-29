// public/src/ui-text/zh.js
export default {
  common: {
    attribute: '属性',
  },

  // 顶部信息按钮 + 弹窗 + 反馈表单
  info: {
    buttons: {
      usage: '使用方法',
      roadmap: '开发计划',
      feedback: '反馈',
    },
    dialogs: {
      usageTitle: '使用方法',
      roadmapTitle: '开发计划和反馈',
      feedbackTitle: '反馈与建议',
      intro:
        '如果你在时间轴中发现了错误、遗漏，或者有补充的资料与建议，欢迎在这里填写。\n' +
        '个人 ID 可以是你的昵称、常用 ID，方便后续在版本日志中致谢。',
    },
    form: {
      idLabelRequired: '个人 ID（必填）',
      idLabelOptional: '个人 ID（选填）',
      idPlaceholder: '昵称 / 常用ID（可留空）',
      idRequiredAlert: '请填写“个人 ID”（可以是昵称、编号等）。',

      contactLabel: '联系方式（选填）',
      contactPlaceholder: '邮箱 / QQ / 社交账号（可留空）',

      contentLabel: '反馈内容（必填）',
      contentPlaceholder: '请描述你想反馈的问题、建议或补充信息',
      contentRequiredAlert: '请填写反馈内容。',

      submit: '提交',
      cancel: '取消',

      okToast: '感谢你的反馈！信息已经发送到维护者的反馈文档。',
      failToast: '提交失败，请稍后再试。',
      missingEndpoint: '反馈接口未配置（FEEDBACK_ENDPOINT 缺失）。',
    },
  },

  // 过滤/工具栏占位提示（style-ui.js 里使用）
  toolbar: {
    placeholders: {
      filtersReset: '已复原过滤标准（占位）',
      filtersAppliedAnd: '已应用 AND 逻辑（占位）',
      filtersAppliedOr: '已应用 OR 逻辑（占位）',
    },
  },

  // 属性选择器
  attrPicker: {
    notReady: '属性选择弹窗未就绪（占位）',
  },

  // 过滤面板（filter/filter-ui.js 使用）
  filter: {
    trigger: '过滤/筛选',
    panel: {
      ariaLabel: '过滤/筛选设置',
      add: '增加过滤/筛选标准',
      reset: '复原过滤/筛选标准',
      logicAnd: '用“和”逻辑过滤/筛选',
      logicOr: '用“或”逻辑过滤/筛选',
      close: '关闭窗口',
    },
    builder: {
      attrLabel: '过滤属性',
      optionsLabel: '过滤选项',
      searchPlaceholder: '输入关键字检索',
      confirm: '确定',
      cancel: '取消',
    },
    summary: {
      empty: '（尚未添加任何过滤/筛选标准）',
      emptyChip: '（空）',
      clearAttrTitle: '清空该属性',
    },

    // ✅ key -> 显示名
    fields: {
      EventType: '事件类型',
      Region: '地区',
      Platform: '平台类型',
      ConsolePlatform: '主机类型',
      Company: '公司',
      Importance: '重要性',
      Tag: '标签',
      Status: '状态',
    },

    list: {
      empty: '（暂无过滤条件）',
      removeOneTitle: '移除此项',
      clearGroupTitle: '清空该组',
      clearGroup: '清空',
      removeGroupTitle: '移除该属性的过滤',
    },
    attrSelect: {
      placeholder: '选择属性',
    },
    options: {
      emptyOrLoading: '（暂无可选项 / 仍在加载）',
    },
  },

  // 详情弹窗字段名（mount.js 使用）
  detail: {
    fields: {
      eventName: '事件名称',
      start: '开始时间',
      end: '结束时间',
      eventType: '事件类型',
      region: '地区',
      platform: '平台类型',
      consolePlatform: '主机类型',
      company: '公司',
      importance: '重要性',
      tag: '标签',
      description: '描述',
      contributor: '贡献者',
    },
  },

  // ✅ 样式 UI（timeline/mount.js 使用）
  style: {
    buttons: {
      event: '事件样式',
      platform: '平台样式',
      console: '主机样式',
      company: '公司样式',
      region: '地区样式',
    },

    window: {
      title: '{attr} 样式',
      currentStyleNone: '当前样式：无',
      currentStyle: '当前样式：{style}',
      currentBound: '当前绑定：{style}（如需更改，请先“重置”）',
      boundHint: '“{style}”已绑定到【{attr}】',
    },

    panel: {
      baseTitle: '样式',
      styleTypeLabel: '样式类型',
      noneOption: '（未选择）',
      confirmBind: '确认绑定',
      reset: '重置',
      addRow: '新增样式行',
      saveApply: '保存并应用',
      close: '关闭',

      table: {
        style: '样式',
        values: '作用属性值',
        action: '操作',
      },

      pickValues: '添加/修改属性',
      pickDialogTitle: '选择属性值',
      takenSuffix: '（已被占用）',
      ok: '确定',
      cancel: '取消',
      deleteRowTitle: '删除该样式行',

      resetConfirm: '重置将清空该属性下所有样式行，是否继续？',
      needBindAlert: '请先绑定样式类型',
      conflictAlert:
        '“{value}” 已被同属性的其他样式行占用，请取消或更换。',
    },

    types: {
      fontColor: '字体颜色',
      backgroundColor: '背景颜色',
      borderColor: '边框颜色',
      fontFamily: '字体',
      haloColor: '光晕颜色',
      none: '无',
    },

    controls: {
      fontFamily: {
        placeholder: '请选择字体',
        default: '（默认字体）',
      },
      color: {
        ariaLabel: '选择颜色',
      },
    },

    palette: {
      amber: '琥珀',
      indigo: '靛蓝',
      emerald: '祖母绿',
      rose: '玫红',
      sky: '天青',
      violet: '紫罗兰',
      lime: '青柠',
      orange: '橙',
      magenta: '洋红',
    },
  },
};
