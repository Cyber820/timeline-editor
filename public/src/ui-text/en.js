// public/src/ui-text/en.js
export default {
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
        'If you find errors, missing items, or have suggestions, please leave feedback here.\nYour ID is optional (nickname/handle), which helps us credit you in the changelog.',
    },
    form: {
      // ID
      idLabel: 'Your ID (required)',
      idLabelOptional: 'Your ID (optional)',
      idPlaceholder: 'Nickname / handle (optional)',
      idRequiredAlert: 'Please enter your ID (nickname/handle is fine).',

      // Contact
      contactLabel: 'Contact (optional)',
      contactPlaceholder: 'Email / social handle (optional)',

      // Content
      contentLabel: 'Message (required)',
      contentPlaceholder: 'Describe the issue, suggestion, or additional info',
      contentRequiredAlert: 'Please enter your message.',

      // Buttons
      submit: 'Submit',
      cancel: 'Cancel',

      // Toast / alerts
      endpointMissingAlert: 'Feedback endpoint is not configured.',
      okToast: 'Thanks! Your feedback has been sent.',
      failToast: 'Submission failed. Please try again later.',
    },
  },
};
