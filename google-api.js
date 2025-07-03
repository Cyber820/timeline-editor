const { google } = require('googleapis');
const { MAIN_SHEET_ID, MAIN_SHEET_NAME, TOKEN_SHEET_ID, TOKEN_SHEET_NAME, ANON_SHEET_ID, ANON_SHEET_NAME } = require('./config');
const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

async function getSheetsClient() {
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

async function verifyToken(token) {
  if (!token) return false;
  const sheets = await getSheetsClient();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: TOKEN_SHEET_ID,
    range: `${TOKEN_SHEET_NAME}!A:A`
  });
  const tokens = result.data.values ? result.data.values.flat() : [];
  return tokens.includes(token);
}

async function appendEventToSheet(data, token, timestamp) {
  const sheets = await getSheetsClient();
  const row = [
    data.Title || '',
    data.Start || '',
    data.End || '',
    data.Region || '',
    data.Platform || '',
    data.ConsolePlatform || '',
    data.EventType || '',
    data.Company || '',
    data.Description || '',
    (data.Tag || []).join(','),
    token,
    timestamp,
    'pending',
    ''
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId: MAIN_SHEET_ID,
    range: `${MAIN_SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
}

async function appendAnonymousSubmission(data, token, timestamp, ip) {
  const sheets = await getSheetsClient();
  const row = [
    data.Title || '',
    data.Start || '',
    data.End || '',
    data.Region || '',
    data.Platform || '',
    data.ConsolePlatform || '',
    data.EventType || '',
    data.Company || '',
    data.Description || '',
    (data.Tag || []).join(','),
    '',
    timestamp,
    'unverified',
    ip || ''
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId: ANON_SHEET_ID,
    range: `${ANON_SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
}

module.exports = {
  verifyToken,
  appendEventToSheet,
  appendAnonymousSubmission
};