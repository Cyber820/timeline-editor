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
      missingEndpoint:
        'Feedback endpoint is not configured (FEEDBACK_ENDPOINT missing).',
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

  // Filter panel (used in filter/filter-ui.js)
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
    },
    summary: {
      empty: '(No filters added yet)',
      emptyChip: '(Empty)',
      clearAttrTitle: 'Clear this field',
    },

    // ✅ key -> display label
    fields: {
      EventType: 'Event Type',
      Region: 'Region',
      Platform: 'Platform',
      ConsolePlatform: 'Console Platform',
      Company: 'Company',
      Importance: 'Importance',
      Tag: 'Tags',
      Status: 'Status',
    },

    // compatibility keys
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

  // Detail popover (event click)
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

  // ✅ Style UI (used by timeline/mount.js)
  style: {
    buttons: {
      event: 'Event Styles',
      platform: 'Platform Styles',
      console: 'Console Styles',
      company: 'Company Styles',
      region: 'Region Styles',
    },

    window: {
      title: '{attr} Styles',
      currentStyleNone: 'Current style: none',
      currentStyle: 'Current style: {style}',
      currentBound: 'Current binding: {style} (reset required to change)',
      boundHint: '“{style}” is already bound to [{attr}]',
    },

    panel: {
      baseTitle: 'Styles',
      styleTypeLabel: 'Style type',
      noneOption: '(Not selected)',
      confirmBind: 'Bind',
      reset: 'Reset',
      addRow: 'Add row',
      saveApply: 'Save & Apply',
      close: 'Close',

      table: {
        style: 'Style',
        values: 'Applied to values',
        action: 'Action',
      },

      pickValues: 'Pick / Edit values',
      pickDialogTitle: 'Select values',
      takenSuffix: '(taken)',
      ok: 'OK',
      cancel: 'Cancel',
      deleteRowTitle: 'Delete this row',

      resetConfirm:
        'Reset will clear all rows under this field. Continue?',
      needBindAlert: 'Please bind a style type first.',
      conflictAlert:
        '“{value}” is already taken by another row under the same field. Please deselect or change it.',
    },

    types: {
      fontColor: 'Text color',
      backgroundColor: 'Background color',
      borderColor: 'Border color',
      fontFamily: 'Font',
      haloColor: 'Halo color',
      none: 'None',
    },

    controls: {
      fontFamily: {
        placeholder: 'Choose a font',
        default: '(Default font)',
      },
      color: {
        ariaLabel: 'Pick a color',
      },
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
