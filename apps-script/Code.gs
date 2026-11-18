/**
 * Qubenix AI – Careers application backend (Google Apps Script)
 *
 * Receives applications from the Next.js API route (/api/careers/apply), never from browsers directly.
 * Stores each candidate as one row in Google Sheets and their resume as a private file in Google Drive.
 *
 * One-time setup (see apps-script/README.md):
 *   1. Run `setup` once from the editor and approve the permissions.
 *   2. Copy the SHARED_SECRET it logs into the Next.js env (APPS_SCRIPT_SHARED_SECRET).
 *   3. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 *      "Anyone" is required for a server-to-server call; every request must carry the shared secret.
 */

const CONFIG = {
  SPREADSHEET_NAME: 'Qubenix AI – Career Applications',
  SHEET_NAME: 'Applications',
  FOLDER_NAME: 'Qubenix AI – Candidate Resumes',
  DEFAULT_NOTIFY_EMAIL: 'hello.qubenix@gmail.com',
  DEFAULT_STATUS: 'New',
  STATUSES: ['New', 'Reviewing', 'Shortlisted', 'Interview', 'Offered', 'Hired', 'Rejected', 'Withdrawn'],
  MAX_FILE_BYTES: 5 * 1024 * 1024,
  DUPLICATE_WINDOW_DAYS: 30,
  IDEMPOTENCY_TTL_SECONDS: 6 * 60 * 60, // CacheService maximum
  LOCK_WAIT_MS: 30 * 1000,
  ID_PREFIX: 'QBX',
};

// Column order in the "Applications" sheet. Location and Availability come from the existing form.
const HEADERS = [
  'Application ID',
  'Submission Date',
  'Candidate Name',
  'Email Address',
  'Phone Number',
  'College / University',
  'Education',
  'Graduation Year',
  'Applied Position',
  'Skills',
  'LinkedIn URL',
  'Portfolio URL',
  'Motivation / Additional Information',
  'Resume Filename',
  'Resume Drive Link',
  'Application Status',
  'Location',
  'Availability',
];
const COL = HEADERS.reduce(function (acc, h, i) { acc[h] = i + 1; return acc; }, {});

const RESUME_TYPES = {
  pdf: { mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: [0x50, 0x4b, 0x03, 0x04] }, // ZIP
  doc: { mime: 'application/msword', magic: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }, // OLE2
};

const LIMITS = {
  full_name: 120, email: 200, phone: 30, position: 120, location: 120, college: 150, education: 150,
  graduation_year: 4, skills: 500, linkedin_url: 500, portfolio_url: 500, motivation: 4000, availability: 300,
};
const REQUIRED = ['full_name', 'email', 'phone', 'position', 'location', 'college', 'education', 'graduation_year', 'skills', 'motivation'];

/* ------------------------------------------------------------------------------------------------
 * Entry points
 * ---------------------------------------------------------------------------------------------- */

function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const secret = props.getProperty('SHARED_SECRET');
    if (!secret) return respond_({ ok: false, code: 'NOT_CONFIGURED', message: 'Backend is not set up. Run setup() first.' });

    let body;
    try {
      body = JSON.parse((e && e.postData && e.postData.contents) || '');
    } catch (err) {
      return respond_({ ok: false, code: 'BAD_REQUEST', message: 'Invalid request body.' });
    }
    if (!body || typeof body !== 'object') return respond_({ ok: false, code: 'BAD_REQUEST', message: 'Invalid request body.' });
    if (!safeEqual_(String(body.secret || ''), secret)) return respond_({ ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized.' });

    return respond_(handleApplication_(body));
  } catch (err) {
    console.error('doPost failed', err && err.stack ? err.stack : err);
    return respond_({ ok: false, code: 'SERVER_ERROR', message: 'Unexpected error while saving the application.' });
  }
}

/** Health check only; reveals nothing about stored data. */
function doGet() {
  return respond_({ ok: true, service: 'qubenix-careers', configured: !!PropertiesService.getScriptProperties().getProperty('SHARED_SECRET') });
}

/**
 * Run once from the Apps Script editor. Safe to run again: it reuses the existing sheet, folder and secret.
 */
function setup() {
  const props = PropertiesService.getScriptProperties();
  const sheet = getSheet_();
  const folder = getFolder_();
  if (!props.getProperty('SHARED_SECRET')) {
    props.setProperty('SHARED_SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  }
  if (!props.getProperty('NOTIFY_EMAIL')) props.setProperty('NOTIFY_EMAIL', CONFIG.DEFAULT_NOTIFY_EMAIL);
  if (!props.getProperty('SEND_CANDIDATE_EMAIL')) props.setProperty('SEND_CANDIDATE_EMAIL', 'true');

  console.log('Spreadsheet: ' + sheet.getParent().getUrl());
  console.log('Resume folder: ' + folder.getUrl());
  console.log('SHARED_SECRET (put this in APPS_SCRIPT_SHARED_SECRET on the Next.js server): ' + props.getProperty('SHARED_SECRET'));
  console.log('Notification email: ' + props.getProperty('NOTIFY_EMAIL'));
}

/* ------------------------------------------------------------------------------------------------
 * Application handling
 * ---------------------------------------------------------------------------------------------- */

function handleApplication_(body) {
  const submissionId = String(body.submission_id || '');
  if (!/^[A-Za-z0-9-]{16,64}$/.test(submissionId)) {
    return { ok: false, code: 'BAD_REQUEST', message: 'Missing submission ID.' };
  }

  // Honeypot is checked by Next.js too; a second check costs nothing.
  if (body.website) return { ok: false, code: 'REJECTED', message: 'Submission rejected.' };

  const v = validateFields_(body.fields || {});
  if (!v.ok) return { ok: false, code: 'VALIDATION', message: 'Please fix the highlighted fields.', errors: v.errors };

  const r = validateResume_(body.resume);
  if (!r.ok) return { ok: false, code: 'VALIDATION', message: r.message, errors: { resume: r.message } };

  const cache = CacheService.getScriptCache();
  const cacheKey = 'sub:' + submissionId;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(CONFIG.LOCK_WAIT_MS)) {
    return { ok: false, code: 'BUSY', message: 'We are receiving a lot of applications right now. Please try again in a minute.' };
  }

  let result;
  let file = null;
  try {
    // Idempotency: the same submission retried (double click, network retry) returns the original result.
    const prior = cache.get(cacheKey);
    if (prior) return JSON.parse(prior);

    const sheet = getSheet_();
    const f = v.value;

    if (isDuplicate_(sheet, f.email, f.position)) {
      return {
        ok: false,
        code: 'DUPLICATE',
        message: 'You have already applied for ' + f.position + ' with this email address. Our team will review your existing application.',
      };
    }

    const appId = nextApplicationId_();
    const now = new Date();
    const ext = r.ext;
    const fileName = appId + '_' + slug_(f.full_name) + '_Resume.' + ext;

    // 1. Resume → Drive (private).
    try {
      const blob = Utilities.newBlob(r.bytes, RESUME_TYPES[ext].mime, fileName);
      file = getFolder_().createFile(blob);
      file.setDescription('Resume for ' + appId + ' (' + f.position + ')');
      try {
        file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      } catch (shareErr) {
        // Files inherit the private folder's access; log and continue.
        console.warn('setSharing failed for ' + appId, shareErr);
      }
    } catch (driveErr) {
      console.error('Resume upload failed', driveErr && driveErr.stack ? driveErr.stack : driveErr);
      return { ok: false, code: 'UPLOAD_FAILED', message: 'We could not save your resume. Please try again.' };
    }

    // 2. Candidate → Sheets. If this fails, remove the orphaned resume so nothing is half-saved.
    const row = [];
    row[COL['Application ID'] - 1] = appId;
    row[COL['Submission Date'] - 1] = now;
    row[COL['Candidate Name'] - 1] = f.full_name;
    row[COL['Email Address'] - 1] = f.email;
    row[COL['Phone Number'] - 1] = f.phone;
    row[COL['College / University'] - 1] = f.college;
    row[COL['Education'] - 1] = f.education;
    row[COL['Graduation Year'] - 1] = f.graduation_year;
    row[COL['Applied Position'] - 1] = f.position;
    row[COL['Skills'] - 1] = f.skills;
    row[COL['LinkedIn URL'] - 1] = f.linkedin_url;
    row[COL['Portfolio URL'] - 1] = f.portfolio_url;
    row[COL['Motivation / Additional Information'] - 1] = f.motivation;
    row[COL['Resume Filename'] - 1] = fileName;
    row[COL['Resume Drive Link'] - 1] = file.getUrl();
    row[COL['Application Status'] - 1] = CONFIG.DEFAULT_STATUS;
    row[COL['Location'] - 1] = f.location;
    row[COL['Availability'] - 1] = f.availability;

    try {
      // Grow the sheet *inside* the filter range so new rows stay filterable, formatted and validated.
      if (sheet.getLastRow() >= sheet.getMaxRows() - 5) sheet.insertRowsBefore(sheet.getMaxRows(), 500);
      sheet.appendRow(row.map(function (cell, i) { return i === COL['Submission Date'] - 1 ? cell : sheetSafe_(cell); }));
      SpreadsheetApp.flush();
    } catch (sheetErr) {
      console.error('Sheet write failed', sheetErr && sheetErr.stack ? sheetErr.stack : sheetErr);
      try { file.setTrashed(true); } catch (trashErr) { console.error('Could not trash orphaned resume', trashErr); }
      return { ok: false, code: 'SAVE_FAILED', message: 'We could not save your application. Please try again.' };
    }

    result = { ok: true, applicationId: appId, position: f.position };
    cache.put(cacheKey, JSON.stringify(result), CONFIG.IDEMPOTENCY_TTL_SECONDS);
  } finally {
    lock.releaseLock();
  }

  // 3. Emails — best effort. A quota or mail failure never invalidates a saved application.
  sendEmails_(result.applicationId, v.value, file);
  return result;
}

function validateFields_(raw) {
  const errors = {};
  const value = {};
  Object.keys(LIMITS).forEach(function (k) {
    value[k] = typeof raw[k] === 'string' ? raw[k].replace(/\u0000/g, '').trim() : '';
  });

  REQUIRED.forEach(function (k) { if (!value[k]) errors[k] = 'This field is required.'; });
  Object.keys(LIMITS).forEach(function (k) {
    if (value[k].length > LIMITS[k]) errors[k] = 'Please keep this under ' + LIMITS[k] + ' characters.';
  });

  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) errors.email = 'Enter a valid email address.';
  if (value.phone && !/^\+?[0-9 ()\-.]{7,30}$/.test(value.phone)) errors.phone = 'Enter a valid phone number.';
  if (value.phone && value.phone.replace(/\D/g, '').length < 7) errors.phone = 'Enter a valid phone number.';

  const thisYear = new Date().getFullYear();
  if (value.graduation_year) {
    const y = Number(value.graduation_year);
    if (!/^\d{4}$/.test(value.graduation_year) || y < thisYear - 40 || y > thisYear + 8) errors.graduation_year = 'Enter a valid graduation year.';
  }
  if (value.linkedin_url && !isHttpUrl_(value.linkedin_url, /(^|\.)linkedin\.com$/i)) errors.linkedin_url = 'Enter a valid LinkedIn profile URL.';
  if (value.portfolio_url && !isHttpUrl_(value.portfolio_url)) errors.portfolio_url = 'Enter a valid URL, starting with https://';

  value.email = value.email.toLowerCase();
  return { ok: Object.keys(errors).length === 0, errors: errors, value: value };
}

function validateResume_(resume) {
  if (!resume || typeof resume !== 'object' || !resume.data || !resume.name) {
    return { ok: false, message: 'Please attach your resume.' };
  }
  const name = String(resume.name);
  const ext = (name.split('.').pop() || '').toLowerCase();
  const type = RESUME_TYPES[ext];
  if (!type || name.indexOf('.') === -1) return { ok: false, message: 'Resume must be a PDF, DOC or DOCX file.' };

  // Rough pre-check on the base64 length before decoding.
  if (String(resume.data).length > Math.ceil(CONFIG.MAX_FILE_BYTES / 3) * 4 + 4) {
    return { ok: false, message: 'Resume must be 5 MB or smaller.' };
  }

  let bytes;
  try {
    bytes = Utilities.base64Decode(String(resume.data));
  } catch (err) {
    return { ok: false, message: 'Resume file could not be read.' };
  }
  if (!bytes || bytes.length === 0) return { ok: false, message: 'Resume file is empty.' };
  if (bytes.length > CONFIG.MAX_FILE_BYTES) return { ok: false, message: 'Resume must be 5 MB or smaller.' };

  // Check the file's real content matches its extension (Apps Script bytes are signed).
  for (let i = 0; i < type.magic.length; i++) {
    if (((bytes[i] + 256) % 256) !== type.magic[i]) {
      return { ok: false, message: 'The resume file does not look like a valid ' + ext.toUpperCase() + ' file.' };
    }
  }
  return { ok: true, ext: ext, bytes: bytes };
}

function isDuplicate_(sheet, email, position) {
  const last = sheet.getLastRow();
  if (last < 2) return false;
  const cutoff = Date.now() - CONFIG.DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const width = Math.max(COL['Submission Date'], COL['Email Address'], COL['Applied Position']);
  const rows = sheet.getRange(2, 1, last - 1, width).getValues();
  const e = email.toLowerCase();
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const rowEmail = String(row[COL['Email Address'] - 1]).replace(/^'/, '').toLowerCase();
    const rowPos = String(row[COL['Applied Position'] - 1]).replace(/^'/, '');
    const when = row[COL['Submission Date'] - 1];
    const t = when instanceof Date ? when.getTime() : Date.parse(when);
    if (rowEmail === e && rowPos === position && (!t || t >= cutoff)) return true;
  }
  return false;
}

/** QBX-2026-00042. Sequence kept in Script Properties; caller holds the script lock. */
function nextApplicationId_() {
  const props = PropertiesService.getScriptProperties();
  const seq = Number(props.getProperty('APP_SEQ') || '0') + 1;
  props.setProperty('APP_SEQ', String(seq));
  const year = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy');
  return CONFIG.ID_PREFIX + '-' + year + '-' + ('00000' + seq).slice(-5);
}

/* ------------------------------------------------------------------------------------------------
 * Storage
 * ---------------------------------------------------------------------------------------------- */

function getSheet_() {
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  const id = props.getProperty('SPREADSHEET_ID');
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (err) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(CONFIG.SPREADSHEET_NAME);
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }

  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    const sheets = ss.getSheets();
    // A brand-new spreadsheet has one empty "Sheet1": reuse it.
    if (sheets.length === 1 && sheets[0].getLastRow() === 0) sheet = sheets[0].setName(CONFIG.SHEET_NAME);
    else sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) formatSheet_(sheet);
  return sheet;
}

function formatSheet_(sheet) {
  const n = HEADERS.length;
  sheet.getRange(1, 1, 1, n).setValues([HEADERS]).setFontWeight('bold').setBackground('#3C32A3').setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);

  const body = sheet.getRange(2, 1, sheet.getMaxRows() - 1, n);
  body.setNumberFormat('@'); // keep phone numbers, years and IDs as typed
  sheet.getRange(2, COL['Submission Date'], sheet.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange(2, COL['Motivation / Additional Information'], sheet.getMaxRows() - 1, 1).setWrap(true);

  const status = SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.STATUSES, true).setAllowInvalid(true).build();
  sheet.getRange(2, COL['Application Status'], sheet.getMaxRows() - 1, 1).setDataValidation(status);

  if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), n).createFilter();

  const widths = { 'Application ID': 130, 'Submission Date': 140, 'Candidate Name': 170, 'Email Address': 220, 'Skills': 240,
    'Motivation / Additional Information': 360, 'Resume Drive Link': 260, 'Applied Position': 190 };
  Object.keys(widths).forEach(function (h) { sheet.setColumnWidth(COL[h], widths[h]); });
}

function getFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* deleted or no access: recreate */ }
  }
  const folder = DriveApp.createFolder(CONFIG.FOLDER_NAME);
  try { folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (err) { console.warn('Folder setSharing failed', err); }
  folder.setDescription('Candidate resumes from the Qubenix AI careers page. Share only with the hiring team.');
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

/* ------------------------------------------------------------------------------------------------
 * Email (optional, best effort)
 * ---------------------------------------------------------------------------------------------- */

function sendEmails_(appId, f, file) {
  const props = PropertiesService.getScriptProperties();
  const notify = props.getProperty('NOTIFY_EMAIL') || CONFIG.DEFAULT_NOTIFY_EMAIL;
  const sendCandidate = props.getProperty('SEND_CANDIDATE_EMAIL') !== 'false';
  let quota = 0;
  try { quota = MailApp.getRemainingDailyQuota(); } catch (err) { console.warn('Mail quota check failed', err); return; }

  if (notify && quota > 0) {
    try {
      const sheetUrl = props.getProperty('SPREADSHEET_ID') ? 'https://docs.google.com/spreadsheets/d/' + props.getProperty('SPREADSHEET_ID') : '';
      MailApp.sendEmail({
        to: notify,
        replyTo: f.email,
        subject: 'New Career Application – ' + f.position + ' – ' + f.full_name,
        htmlBody:
          '<p>A new application was submitted on the Qubenix AI careers page.</p>' +
          '<table cellpadding="4" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">' +
          [['Application ID', appId], ['Position', f.position], ['Name', f.full_name], ['Email', f.email], ['Phone', f.phone],
            ['College / University', f.college], ['Education', f.education], ['Graduation Year', f.graduation_year],
            ['Skills', f.skills], ['Location', f.location], ['LinkedIn', f.linkedin_url], ['Portfolio', f.portfolio_url],
            ['Availability', f.availability]]
            .filter(function (p) { return p[1]; })
            .map(function (p) { return '<tr><td><b>' + esc_(p[0]) + '</b></td><td>' + esc_(p[1]) + '</td></tr>'; }).join('') +
          '</table>' +
          '<p><b>Motivation</b><br>' + esc_(f.motivation).replace(/\n/g, '<br>') + '</p>' +
          (file ? '<p><a href="' + esc_(file.getUrl()) + '">Open resume in Drive</a> (team access only)</p>' : '') +
          (sheetUrl ? '<p><a href="' + sheetUrl + '">Open the applications sheet</a></p>' : ''),
      });
      quota--;
    } catch (err) {
      console.warn('Team notification failed for ' + appId, err);
    }
  }

  if (sendCandidate && quota > 0) {
    try {
      MailApp.sendEmail({
        to: f.email,
        replyTo: notify || undefined,
        name: 'Qubenix AI Careers',
        subject: 'We received your application – ' + f.position + ' (' + appId + ')',
        htmlBody:
          '<p>Hi ' + esc_(f.full_name.split(' ')[0]) + ',</p>' +
          '<p>Thank you for your interest in joining Qubenix AI. We have received your application for <b>' + esc_(f.position) +
          '</b> and our team will review your profile.</p>' +
          '<p>Your application ID is <b>' + esc_(appId) + '</b>. Please mention it if you contact us about your application.</p>' +
          '<p>— The Qubenix AI team</p>',
      });
    } catch (err) {
      console.warn('Candidate confirmation failed for ' + appId, err);
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------------------------------- */

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Stops spreadsheet formula injection (=, +, -, @ at the start of a cell). */
function sheetSafe_(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function isHttpUrl_(v, hostPattern) {
  const m = /^https?:\/\/([^\/?#:\s]+)(:\d+)?([\/?#]\S*)?$/i.exec(v);
  if (!m) return false;
  return hostPattern ? hostPattern.test(m[1]) : m[1].indexOf('.') > 0;
}

function slug_(s) {
  const out = String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (out || 'Candidate').slice(0, 60);
}

function esc_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
