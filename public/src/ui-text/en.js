// public/src/ui-text/en.js
export default {
  common: {
    attribute: 'Attribute',
  },

  // 顶部信息按钮 + 弹窗 + 反馈表单
  info: {
    buttons: {
      usage: 'Usage',
      roadmap: 'Roadmap',
      feedback: 'Feedback',
    },
    dialogs: {
      usageTitle: 'Usage',
      roadmapTitle: 'Roadmap & Feedback',
      feedbackTitle: 'Feedback',
      intro:
        'If you find errors, missing items, or have suggestions, please leave feedback here.\n' +
        'Your ID can be a nickname or handle so we can credit you in the changelog.',
    },
    form: {
      // 注意：你的 info-dialog.js 里 REQUIRE_ID 可能为 false
      // 这里仍提供“required”文案，REQUIRE_ID=true 时会用到
      idLabelRequired: 'Your ID (required)',
      idLabelOptional: 'Your ID (optional)',
      idPlaceholder: 'Nickname / handle (optional)',
      idRequiredAlert: 'Please enter your ID (nickname/handle is fine).',

      contactLabel: 'Contact (optional)',
      contactPlaceholder: 'Email / social handle (optional)',

      contentLabel: 'Message (required)',
      contentPlaceholder: 'Describe the issue, suggestion, or additional info',
      contentRequiredAlert: 'Please enter your message.',

      submit: 'Submit',
      cancel: 'Cancel',

      okToast: 'Thanks! Your feedback has been sent.',
      failToast: 'Submission failed. Please try again later.',
      missingEndpoint: 'Feedback endpoint is not configured.',
    },
  },

  // 过滤/工具栏占位提示（style-ui.js 里使用）
  toolbar: {
    placeholders: {
      filtersReset: 'Filters reset (placeholder).',
      filtersAppliedAnd: 'Applied AND logic (placeholder).',
      filtersAppliedOr: 'Applied OR logic (placeholder).',
    },
  },

  // 属性选择器
  attrPicker: {
    notReady: 'Attribute picker is not ready (placeholder).',
  },

  // 样式窗口 & 控件文本（style-ui.js 里使用）
  style: {
    window: {
      title: '{attr} Styles',
      currentStyleNone: 'Current style: none',
    },
    placeholders: {
      addStyleRow: 'Add style row (placeholder).',
      saved: 'Style saved (placeholder).',
    },
    controls: {
      fontFamily: {
        placeholder: 'Select a font',
      },
      color: {
        ariaLabel: 'Pick a color',
      },
      todo: '{type} (to be configured)',
    },
    palette: {
      amber: 'Amber',
      indigo: 'Indigo',
      emerald: 'Emerald',
      rose: 'Rose',
      sky: 'Sky',
      violet: 'Violet',
      lime: 'Lime',
      orange: 'Orange',
      magenta: 'Magenta',
    },
  },
};
