const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { appendEventToSheet, verifyToken, appendAnonymousSubmission } = require('./google-api');
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

app.post('/api/submit', async (req, res) => {
  const token = req.query.token || '';
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const now = new Date().toISOString();

  const validToken = await verifyToken(token);

  try {
    if (validToken) {
      await appendEventToSheet(req.body, token, now);
    } else {
      await appendAnonymousSubmission(req.body, '', now, ip);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '提交失败', detail: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));