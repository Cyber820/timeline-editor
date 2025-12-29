// public/src/ui-text/en.js
export default {
  common: {
    attribute: 'Attribute',
  },

  // Top info buttons + dialogs + feedback form
  info: {
    buttons: {
      usage: 'How to use',
      roadmap: 'Roadmap',
      feedback: 'Feedback',
    },
    dialogs: {
      usageTitle: 'How to use',
      roadmapTitle: 'Roadmap & Feedback',
      feedbackTitle: 'Feedback & Suggestions',
      intro:
        'If you find any mistakes, missing entries, or have suggestions, please leave them here.\n' +
        'Your Personal ID can be a nickname or handle so we can credit you in the changelog.',
    },
    form: {
      idLabelRequired: 'Personal ID (Required)',
      idLabelOptional: 'Personal ID (Optional)',
      idPlaceholder: 'Nickname / Handle (optional)',
      idRequiredAlert: 'Please fill in “Personal ID” (nickname / handle / ID).',

      contactLabel: 'Contact (Optional)',
      contactPlaceholder: 'Email / Social handle (optional)',

      contentLabel: 'Feedback (Required)',
      contentPlaceholder: 'Describe the issue / suggestion / additional info',
      contentRequiredAlert: 'Please fill in the feedback content.',

      submit: 'Submit',
      cancel: 'Cancel',

      okToast: 'Thanks! Your feedback has been sent to the maintainer.',
      failToast: 'Submission failed. Please try again later.',
      missingEndpoint: 'Feedback endpoint is not configured (FEEDBACK_ENDPOINT missing).',
    },
  },

  // Toolbar placeholders (used in style-ui.js)
  toolbar: {
    placeholders: {
      filtersReset: 'Filters reset (placeholder)',
      filtersAppliedAnd: 'AND logic applied (placeholder)',
      filtersAppliedOr: 'OR logic applied (placeholder)',
    },
  },

  // Attribute picker
  attrPicker: {
    notReady: 'Attribute picker is not ready (placeholder)',
  },

  // ✅ Filter panel (used in filter-ui.js / filter/filter-ui.js)
  filter: {
    trigger: 'Filter',
    panel: {
      ariaLabel: 'Filter settings',
      add: 'Add filter rule',
      reset: 'Reset filters',
      logicAnd: 'Apply filters with AND',
      logicOr: 'Apply filters with OR',
      close: 'Close',
    },
    builder: {
      attrLabel: 'Field',
      optionsLabel: 'Options',
      searchPlaceholder: 'Search',
      confirm: 'Confirm',
      cancel: 'Cancel',
      // needSelect: 'Please select at least one option.', // optional
    },
    summary: {
      empty: '(No filters added yet)',
      emptyChip: '(Empty)',
      clearAttrTitle: 'Clear this field',
    },

    // 兼容你之前为“另一套 filter UI（src/ui/filter-ui.js）”准备的 key
    list: {
      empty: '(No active filters)',
      removeOneTitle: 'Remove this item',
      clearGroupTitle: 'Clear this group',
      clearGroup: 'Clear',
      removeGroupTitle: 'Remove filters for this field',
    },
    attrSelect: {
      placeholder: 'Select a field',
    },
    options: {
      emptyOrLoading: '(No options / still loading)',
    },
  },

  // ✅ Detail popover (used by timeline/mount.js buildKvHTML via t('detail.fields.*'))
  detail: {
    fields: {
      eventName: 'Event',
      start: 'Start',
      end: 'End',
      eventType: 'Event Type',
      region: 'Region',
      platform: 'Platform',
      consolePlatform: 'Console Platform',
      company: 'Company',
      importance: 'Importance',
      tag: 'Tags',
      description: 'Description',
      contributor: 'Contributor',
    },
  },

  // Style window & controls (used in style-ui.js / style-panel.js, etc.)
  style: {
    window: {
      title: '{attr} Styles',
      currentStyleNone: 'Current style: none',
    },
    placeholders: {
      addStyleRow: 'Add style row (placeholder)',
      saved: 'Styles saved (placeholder)',
    },
    controls: {
      fontFamily: {
        placeholder: 'Choose a font',
      },
      color: {
        ariaLabel: 'Pick a color',
      },
      todo: '{type} (todo)',
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
