// public/src/ui-text/zh.js
export default {
  common: {
    attribute: '属性',
    close: '关闭',
  },
  
filter: {
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

  // 样式相关（style-ui.js / style-panel.js 使用）
  style: {
    // ✅ style-panel.js 用到的 key（新增）
    hint: {
      none: '当前样式：无',
      current: '当前样式：{type}',
      boundLocked: '当前绑定：{type}（如需更改，请先“重置”）',
    },
    select: {
      occupiedSuffix: '（已绑定：{owner}）',
    },
    alert: {
      occupied: '“{type}” 已绑定到【{owner}】。\n如需转移，请先到该属性中点击“重置”。',
    },
    confirm: {
      switchClears: '切换样式类型将清空该属性下已添加的样式行，是否继续？',
      resetClears: '重置将清空该属性下所有样式行，是否继续？',
    },
    fallback: {
      title: '样式编辑器（临时 JSON 面板）',
      apply: '保存并应用',
      reset: '清空并应用',
      jsonParseFail: 'JSON 解析失败：{msg}',
    },

    // ✅ 你原来的结构（保留）
    window: {
      title: '{attr} 样式',
      currentStyleNone: '当前样式：无',
    },
    placeholders: {
      addStyleRow: '新增样式（占位）',
      saved: '样式已保存（占位）',
    },
    controls: {
      fontFamily: {
        placeholder: '请选择字体',
      },
      color: {
        ariaLabel: '选择颜色',
      },
      todo: '{type}（待配置）',
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
