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
      feedbackTitle: 'Feedback',
      intro:
        'If you find errors, missing items, or have additional sources/suggestions, please submit them here.\n' +
        'Your Personal ID can be a nickname or any identifier for credit in future changelogs.',
    },
    form: {
      idLabelRequired: 'Personal ID (required)',
      idLabelOptional: 'Personal ID (optional)',
      idPlaceholder: 'Nickname / ID (optional)',
      idRequiredAlert: 'Please fill in your Personal ID (nickname / identifier).',

      contactLabel: 'Contact (optional)',
      contactPlaceholder: 'Email / social handle (optional)',

      contentLabel: 'Feedback (required)',
      contentPlaceholder: 'Describe the issue / suggestion / additional info',
      contentRequiredAlert: 'Please fill in the feedback content.',

      submit: 'Submit',
      cancel: 'Cancel',

      okToast: 'Thanks! Your feedback has been sent to the maintainer document.',
      failToast: 'Submission failed. Please try again later.',
      missingEndpoint: 'Feedback endpoint is not configured (FEEDBACK_ENDPOINT missing).',
    },
  },

  // Toolbar placeholders (used by style-ui.js)
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

  // ✅ Filter UI (used by src/ui/filter-ui.js)
  filter: {
    list: {
      empty: '(No active filters)',
      removeOneTitle: 'Remove this value',
      clearGroupTitle: 'Clear this group',
      clearGroup: 'Clear',
      removeGroupTitle: 'Remove this filter group',
    },
    attrSelect: {
      placeholder: 'Select an attribute',
    },
    options: {
      emptyOrLoading: '(No options / still loading)',
    },
  },

  // ✅ Detail popover field labels (used by timeline/mount.js buildKvHTML)
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

  // Style window & controls (used by style-ui.js)
  style: {
    window: {
      title: '{attr} Style',
      currentStyleNone: 'Current style: None',
    },
    placeholders: {
      addStyleRow: 'Add style (placeholder)',
      saved: 'Style saved (placeholder)',
    },
    controls: {
      fontFamily: {
        placeholder: 'Select a font',
      },
      color: {
        ariaLabel: 'Choose a color',
      },
      todo: '{type} (TBD)',
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
