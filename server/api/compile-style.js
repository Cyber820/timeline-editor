// server/api/compile-style.js
// ⚠️ 现在先“放着不用”。等你准备好时，在 index.js 里用：app.use(require('./server/api/compile-style'));

const express = require('express');
const router = express.Router();
const { compileStyleRules } = require('../compiler/compileStyleRules');

router.post('/api/compile-style', (req, res) => {
  const { state, options } = req.body || {};
  if (!state || typeof state !== 'object') {
    return res.status(400).send('bad state');
  }
  try {
    const css = compileStyleRules(state, {
      selectorBase: options?.selectorBase || '.vis-item.event, .vis-item-content.event',
      titleSelector: options?.titleSelector || '.event-title',
      attrPriority: options?.attrPriority
    });
    res.type('text/css; charset=utf-8').send(css);
  } catch (e) {
    console.error('compile error:', e);
    res.status(500).send('compile error');
  }
});

module.exports = router;
