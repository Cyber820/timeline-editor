
const fetch = require('node-fetch');

const VALID_TOKENS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1Sb-hzZ2XWxY1My0FOhy-i-VbUOz4kctdlWtwempmlk0/edit';
const ANONYMOUS_SUBMIT_URL = 'https://script.google.com/macros/s/AKfycbxcv6GqP5USv3zOn2pepoT3mke2fdZuWsoInq6qkDx-2LUMBQTcJpahOtRqUHqBYMjs/exec';

async function verifyToken(token) {
  if (!token) return false;
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/1Sb-hzZ2XWxY1My0FOhy-i-VbUOz4kctdlWtwempmlk0/values/ValidTokens!A:A?key=${process.env.GOOGLE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    const tokens = data.values.flat();
    return tokens.includes(token);
  } catch (e) {
    console.error('Token verification failed:', e);
    return false;
  }
}

async function appendEventToSheet(event, token, timestamp) {
  // 保留 stub；实际可填入主表逻辑
  console.log('Verified event submitted. Not yet implemented.');
}

async function appendAnonymousSubmission(event, token, timestamp, ip) {
  try {
    const url = `${ANONYMOUS_SUBMIT_URL}?token=${encodeURIComponent(token || '')}&ip=${encodeURIComponent(ip || '')}`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
  } catch (e) {
    console.error('Anonymous submission failed:', e);
    throw e;
  }
}

module.exports = { verifyToken, appendEventToSheet, appendAnonymousSubmission };
