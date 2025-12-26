// public/src/ui-text/en.js
export default {
  common: {
    attribute: 'Attribute',
    close: 'Close',
  },
filter: {
  list: {
    empty: '(No active filters)',
    removeOneTitle: 'Remove this value',
    clearGroupTitle: 'Clear this group',
    clearGroup: 'Clear',
    removeGroupTitle: 'Remove this attribute filter',
  },
  attrSelect: {
    placeholder: 'Select an attribute',
  },
  options: {
    emptyOrLoading: '(No options / still loading)',
  },
},

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
      // ✅ 对齐你 zh 的“必填/选填”结构（info-dialog.js 会根据 REQUIRE_ID 选择）
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

      okToast: "Thanks! Your feedback has been sent.",
      failToast: 'Submission failed. Please try again later.',
      missingEndpoint: 'Feedback endpoint is not configured.',
    },
  },

  toolbar: {
    placeholders: {
      filtersReset: 'Filters reset (placeholder)',
      filtersAppliedAnd: 'Applied AND logic (placeholder)',
      filtersAppliedOr: 'Applied OR logic (placeholder)',
    },
  },

  attrPicker: {
    notReady: 'Attribute picker is not ready (placeholder)',
  },

  style: {
    // ✅ style-panel.js 用到的 key
    hint: {
      none: 'Current style: none',
      current: 'Current style: {type}',
      boundLocked: 'Current binding: {type} (to change it, please reset first)',
    },
    select: {
      occupiedSuffix: ' (bound to: {owner})',
    },
    alert: {
      occupied:
        '"{type}" is already bound to [{owner}].\nTo transfer it, please go to that attribute and click "Reset" first.',
    },
    confirm: {
      switchClears: 'Switching the style type will clear all style rows under this attribute. Continue?',
      resetClears: 'Reset will clear all style rows under this attribute. Continue?',
    },
    fallback: {
      title: 'Style Editor (temporary JSON panel)',
      apply: 'Save & Apply',
      reset: 'Clear & Apply',
      jsonParseFail: 'JSON parse failed: {msg}',
    },

    // ✅ 给 computeStyleWindowViewModel 用
    window: {
      title: '{attr} Styles',
      currentStyleNone: 'Current style: none',
    },

    placeholders: {
      addStyleRow: 'Add style (placeholder)',
      saved: 'Style saved (placeholder)',
    },

    controls: {
      fontFamily: {
        placeholder: 'Choose a font',
      },
      color: {
        ariaLabel: 'Pick a color',
      },
      todo: '{type} (TBD)',
    },

    // 颜色名（主要用于 title/tooltip，如果你后续把 palette 改成走字典）
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
