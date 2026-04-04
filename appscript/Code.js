function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Internship Management System');
}

var OTP_EXPIRY_MINUTES_ = 10;
var OTP_RESEND_COOLDOWN_SECONDS_ = 60;
var OTP_MAX_ATTEMPTS_ = 5;

function doPost(e) {
  try {
    var payload = parsePayload_(e);
    return jsonResponse_(dispatchAction_(payload));
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message || String(err) });
  }
}

function apiAction(action, payload) {
  var requestPayload = payload || {};
  requestPayload.action = String(action || '').trim();
  return dispatchAction_(requestPayload);
}

function dispatchAction_(payload) {
  var action = String(payload.action || '').trim();

  if (!action) {
    return { ok: false, error: 'Missing action.' };
  }

  if (action === 'register_account') {
    return handleRegisterAccount_(payload);
  }

  if (action === 'login_account') {
    return handleLoginAccount_(payload);
  }

  if (action === 'verify_email_otp') {
    return handleVerifyEmailOtp_(payload);
  }

  if (action === 'resend_email_otp') {
    return handleResendEmailOtp_(payload);
  }

  if (action === 'upsert_student_ojt_profile') {
    return handleUpsertStudentOjtProfile_(payload);
  }

  if (action === 'create_time_log') {
    return handleCreateTimeLog_(payload);
  }

  if (action === 'list_time_logs_by_user') {
    return handleListTimeLogsByUser_(payload);
  }

  if (action === 'delete_time_log') {
    return handleDeleteTimeLog_(payload);
  }

  return { ok: false, error: 'Unknown action: ' + action };
}

function handleRegisterAccount_(payload) {
  var fullName = String(payload.full_name || '').trim();
  var normalizedFullName = normalizeName_(fullName);
  var email = normalizeEmail_(payload.email);
  var password = String(payload.password || '');
  var role = String(payload.role || '').trim();
  var department = String(payload.department || '').trim();
  var status = String(payload.status || 'active').trim();
  var userId = String(payload.user_id || createId_('USR'));
  var now = isoNow_();
  var otpCode = generateOtpCode_();
  var otpHash = sha256Hex_(otpCode);
  var otpExpiresAt = addMinutesIso_(new Date(), OTP_EXPIRY_MINUTES_);

  if (!fullName || !email || !password || !role) {
    return { ok: false, error: 'full_name, email, password, and role are required.' };
  }

  var usersSheet = getSheet_('users');
  var users = readSheetObjects_(usersSheet);
  var existingByEmail = users.find(function (row) {
    return normalizeEmail_(row.email) === email;
  });
  var existingByName = users.find(function (row) {
    return normalizeName_(row.full_name) === normalizedFullName;
  });

  if (existingByEmail) {
    return { ok: false, error: 'Email already exists.' };
  }

  if (existingByName) {
    return { ok: false, error: 'An account with this full name already exists.' };
  }

  MailApp.sendEmail({
    to: email,
    subject: 'Verify your Internship Management System account',
    htmlBody: buildOtpEmailHtml_(fullName, otpCode, OTP_EXPIRY_MINUTES_)
  });

  appendObjectRow_(usersSheet, {
    user_id: userId,
    full_name: fullName,
    email: email,
    password_hash: sha256Hex_(password),
    department: department,
    status: status,
    role: role,
    created_at: now,
    email_verified: false,
    otp_hash: otpHash,
    otp_expires_at: otpExpiresAt,
    otp_attempts: 0,
    otp_last_sent_at: now
  });

  return {
    ok: true,
    message: 'Account created successfully. Please verify your email using the OTP sent to your inbox.',
    requires_verification: true,
    verification_email: email,
    user: {
      user_id: userId,
      full_name: fullName,
      email: email,
      role: role,
      status: status,
      created_at: now
    }
  };
}

function handleLoginAccount_(payload) {
  var email = normalizeEmail_(payload.email);
  var password = String(payload.password || '');

  if (!email || !password) {
    return { ok: false, error: 'email and password are required.' };
  }

  var usersSheet = getSheet_('users');
  var users = readSheetObjects_(usersSheet);
  var found = users.find(function (row) {
    return normalizeEmail_(row.email) === email;
  });

  if (!found) {
    return { ok: false, error: 'Invalid email or password.' };
  }

  if (String(found.password_hash || '') !== sha256Hex_(password)) {
    return { ok: false, error: 'Invalid email or password.' };
  }

  if (!isEmailVerifiedValue_(found.email_verified)) {
    return {
      ok: false,
      error: 'Please verify your email with the OTP code before logging in.',
      requires_verification: true,
      verification_email: String(found.email || '')
    };
  }

  var profile = getStudentProfileByUserId_(String(found.user_id || ''));

  return {
    ok: true,
    message: 'Login successful.',
    user: {
      user_id: String(found.user_id || ''),
      full_name: String(found.full_name || ''),
      email: String(found.email || ''),
      role: String(found.role || ''),
      status: String(found.status || ''),
      created_at: String(found.created_at || ''),
      ojt: profile
    }
  };
}

function handleVerifyEmailOtp_(payload) {
  var email = normalizeEmail_(payload.email);
  var otpCode = String(payload.otp_code || '').trim();

  if (!email || !otpCode) {
    return { ok: false, error: 'email and otp_code are required.' };
  }

  var record = findUserRecordByEmail_(email);
  if (!record) {
    return { ok: false, error: 'No account found for this email.' };
  }

  if (isEmailVerifiedValue_(record.user.email_verified)) {
    return { ok: true, message: 'Email is already verified.' };
  }

  var expiresAt = parseIsoDate_(record.user.otp_expires_at);
  if (!record.user.otp_hash || !expiresAt || expiresAt.getTime() < new Date().getTime()) {
    return { ok: false, error: 'OTP has expired. Please request a new code.' };
  }

  var attempts = Number(record.user.otp_attempts || 0);
  if (attempts >= OTP_MAX_ATTEMPTS_) {
    return { ok: false, error: 'Too many incorrect attempts. Please request a new OTP code.' };
  }

  if (sha256Hex_(otpCode) !== String(record.user.otp_hash || '')) {
    record.user.otp_attempts = attempts + 1;
    updateUserRecord_(record);
    return { ok: false, error: 'Invalid OTP code.' };
  }

  record.user.email_verified = true;
  record.user.otp_hash = '';
  record.user.otp_expires_at = '';
  record.user.otp_attempts = 0;
  record.user.otp_last_sent_at = '';
  updateUserRecord_(record);

  return { ok: true, message: 'Email verified successfully.' };
}

function handleResendEmailOtp_(payload) {
  var email = normalizeEmail_(payload.email);
  if (!email) {
    return { ok: false, error: 'email is required.' };
  }

  var record = findUserRecordByEmail_(email);
  if (!record) {
    return { ok: false, error: 'No account found for this email.' };
  }

  if (isEmailVerifiedValue_(record.user.email_verified)) {
    return { ok: true, message: 'Email is already verified.' };
  }

  var lastSentAt = parseIsoDate_(record.user.otp_last_sent_at);
  if (lastSentAt) {
    var elapsedSeconds = Math.floor((new Date().getTime() - lastSentAt.getTime()) / 1000);
    if (elapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS_) {
      return {
        ok: false,
        error: 'Please wait ' + (OTP_RESEND_COOLDOWN_SECONDS_ - elapsedSeconds) + ' seconds before requesting another OTP.'
      };
    }
  }

  var otpCode = generateOtpCode_();
  record.user.otp_hash = sha256Hex_(otpCode);
  record.user.otp_expires_at = addMinutesIso_(new Date(), OTP_EXPIRY_MINUTES_);
  record.user.otp_attempts = 0;
  record.user.otp_last_sent_at = isoNow_();
  updateUserRecord_(record);

  MailApp.sendEmail({
    to: email,
    subject: 'Your new OTP for Internship Management System',
    htmlBody: buildOtpEmailHtml_(String(record.user.full_name || 'User'), otpCode, OTP_EXPIRY_MINUTES_)
  });

  return { ok: true, message: 'A new OTP has been sent to your email.', verification_email: email };
}

function handleUpsertStudentOjtProfile_(payload) {
  var userId = String(payload.user_id || '').trim();
  var totalHours = Number(payload.total_ojt_hours || 0);
  var startDate = String(payload.start_date || '').trim();
  var estimatedEndDate = String(payload.estimated_end_date || '').trim();
  var course = String(payload.course || '').trim();
  var school = String(payload.school || '').trim();

  if (!userId || !totalHours || !startDate || !estimatedEndDate || !course || !school) {
    return { ok: false, error: 'user_id, total_ojt_hours, start_date, estimated_end_date, course, and school are required.' };
  }

  var sheet = getSheet_('student_ojt_profile');
  var headers = getHeaders_(sheet);
  var values = getSheetValues_(sheet);
  var userIdCol = findColumnIndex_(headers, 'user_id');

  if (userIdCol === 0) {
    throw new Error('student_ojt_profile must include user_id column.');
  }

  var rowIndex = -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][userIdCol - 1] || '') === userId) {
      rowIndex = i + 1;
      break;
    }
  }

  var rowObject = {
    user_id: userId,
    total_ojt_hours: totalHours,
    start_date: startDate,
    estimated_end_date: estimatedEndDate,
    course: course,
    school: school
  };

  if (rowIndex > 0) {
    updateObjectRow_(sheet, rowIndex, rowObject);
  } else {
    appendObjectRow_(sheet, rowObject);
  }

  return { ok: true, message: 'Student OJT profile saved.', profile: rowObject };
}

function handleCreateTimeLog_(payload) {
  var userId = String(payload.user_id || '').trim();
  var logDate = String(payload.log_date || '').trim();
  var timeIn = String(payload.time_in || '').trim();
  var timeOut = String(payload.time_out || '').trim();
  var hoursRendered = Number(payload.hours_rendered || 0);
  var status = String(payload.status || 'pending').trim();
  var notes = String(payload.notes || '').trim();
  var timelogId = String(payload.timelog_id || createId_('TL'));
  var createdAt = String(payload.created_at || isoNow_());

  if (!userId || !logDate || !timeIn || !timeOut || !hoursRendered) {
    return { ok: false, error: 'user_id, log_date, time_in, time_out, and hours_rendered are required.' };
  }

  var sheet = getSheet_('time_logs');
  var rowObject = {
    timelog_id: timelogId,
    user_id: userId,
    log_date: logDate,
    time_in: timeIn,
    time_out: timeOut,
    hours_rendered: hoursRendered,
    status: status,
    notes: notes,
    created_at: createdAt
  };

  appendObjectRow_(sheet, rowObject);

  return { ok: true, message: 'Time log saved.', timelog: rowObject };
}

function handleListTimeLogsByUser_(payload) {
  var userId = String(payload.user_id || '').trim();
  if (!userId) {
    return { ok: false, error: 'user_id is required.' };
  }

  var sheet = getSheet_('time_logs');
  var rows = readSheetObjects_(sheet).filter(function (row) {
    return String(row.user_id || '') === userId;
  });

  return { ok: true, logs: rows };
}

function handleDeleteTimeLog_(payload) {
  var userId = String(payload.user_id || '').trim();
  var timelogId = String(payload.timelog_id || '').trim();

  if (!userId || !timelogId) {
    return { ok: false, error: 'user_id and timelog_id are required.' };
  }

  var sheet = getSheet_('time_logs');
  var headers = getHeaders_(sheet);
  var values = getSheetValues_(sheet);
  var timelogCol = findColumnIndex_(headers, 'timelog_id');
  var userCol = findColumnIndex_(headers, 'user_id');

  if (timelogCol === 0 || userCol === 0) {
    throw new Error('time_logs sheet must include timelog_id and user_id columns.');
  }

  var rowIndex = -1;
  for (var i = 1; i < values.length; i++) {
    var rowTimelogId = String(values[i][timelogCol - 1] || '');
    var rowUserId = String(values[i][userCol - 1] || '');

    if (rowTimelogId === timelogId && rowUserId === userId) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex <= 0) {
    return { ok: false, error: 'Time log not found.' };
  }

  sheet.deleteRow(rowIndex);
  return { ok: true, message: 'Time log deleted.' };
}

function getStudentProfileByUserId_(userId) {
  if (!userId) {
    return null;
  }

  var sheet = getSheet_('student_ojt_profile');
  var rows = readSheetObjects_(sheet);
  var found = rows.find(function (row) {
    return String(row.user_id || '') === userId;
  });

  if (!found) {
    return null;
  }

  return {
    user_id: String(found.user_id || ''),
    total_ojt_hours: Number(found.total_ojt_hours || 0),
    start_date: String(found.start_date || ''),
    estimated_end_date: String(found.estimated_end_date || ''),
    course: String(found.course || ''),
    school: String(found.school || '')
  };
}

function parsePayload_(e) {
  if (!e) {
    return {};
  }

  var params = e.parameter || {};
  if (params.action) {
    var parsedPayload = {};
    if (params.payload) {
      try {
        parsedPayload = JSON.parse(String(params.payload));
      } catch (err) {
        throw new Error('Invalid payload JSON.');
      }
    }
    parsedPayload.action = String(params.action);
    return parsedPayload;
  }

  if (e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (err) {
      throw new Error('Invalid request JSON body.');
    }
  }

  return {};
}

function getSpreadsheet_() {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('MAIN_DB');
  if (!spreadsheetId) {
    throw new Error('Missing MAIN_DB in Script Properties.');
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

function getSheet_(sheetName) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }
  return sheet;
}

function getHeaders_(sheet) {
  var headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  return headerRange.getValues()[0].map(function (h) {
    return String(h || '').trim();
  });
}

function normalizeHeader_(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function findColumnIndex_(headers, key) {
  var normalizedTarget = normalizeHeader_(key);
  for (var i = 0; i < headers.length; i++) {
    if (normalizeHeader_(headers[i]) === normalizedTarget) {
      return i + 1;
    }
  }
  return 0;
}

function getSheetValues_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow === 0 || lastCol === 0) {
    return [];
  }

  return sheet.getRange(1, 1, lastRow, lastCol).getValues();
}

function readSheetObjects_(sheet) {
  var values = getSheetValues_(sheet);
  if (values.length < 2) {
    return [];
  }

  var headers = values[0].map(function (h) {
    return normalizeHeader_(h);
  });

  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var rowValues = values[i];
    var isBlank = rowValues.every(function (cell) {
      return String(cell || '').trim() === '';
    });

    if (isBlank) {
      continue;
    }

    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = rowValues[c];
    }
    rows.push(obj);
  }

  return rows;
}

function appendObjectRow_(sheet, obj) {
  var headers = getHeaders_(sheet);
  var row = headers.map(function (header) {
    var normalized = normalizeHeader_(header);
    if (Object.prototype.hasOwnProperty.call(obj, normalized)) {
      return obj[normalized];
    }
    if (Object.prototype.hasOwnProperty.call(obj, header)) {
      return obj[header];
    }
    return '';
  });
  sheet.appendRow(row);
}

function updateObjectRow_(sheet, rowIndex, obj) {
  var headers = getHeaders_(sheet);
  var row = headers.map(function (header) {
    var normalized = normalizeHeader_(header);
    if (Object.prototype.hasOwnProperty.call(obj, normalized)) {
      return obj[normalized];
    }
    if (Object.prototype.hasOwnProperty.call(obj, header)) {
      return obj[header];
    }
    return '';
  });
  sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
}

function createId_(prefix) {
  return prefix + '_' + Utilities.getUuid().split('-')[0] + '_' + new Date().getTime();
}

function findUserRecordByEmail_(email) {
  var normalizedEmail = normalizeEmail_(email);
  var sheet = getSheet_('users');
  var headers = getHeaders_(sheet);
  var values = getSheetValues_(sheet);
  var emailCol = findColumnIndex_(headers, 'email');

  if (emailCol === 0) {
    throw new Error('users sheet must include an email column.');
  }

  for (var i = 1; i < values.length; i++) {
    var rowEmail = normalizeEmail_(values[i][emailCol - 1]);
    if (rowEmail === normalizedEmail) {
      return {
        sheet: sheet,
        rowIndex: i + 1,
        user: mapRowValuesToObject_(headers, values[i])
      };
    }
  }

  return null;
}

function updateUserRecord_(record) {
  updateObjectRow_(record.sheet, record.rowIndex, record.user);
}

function mapRowValuesToObject_(headers, rowValues) {
  var obj = {};
  for (var i = 0; i < headers.length; i++) {
    obj[normalizeHeader_(headers[i])] = rowValues[i];
  }
  return obj;
}

function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeName_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function sha256Hex_(plainText) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(plainText || ''), Utilities.Charset.UTF_8);
  return digest.map(function (byte) {
    var value = (byte < 0 ? byte + 256 : byte).toString(16);
    return value.length === 1 ? '0' + value : value;
  }).join('');
}

function generateOtpCode_() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function addMinutesIso_(date, minutes) {
  var target = new Date(date.getTime() + minutes * 60000);
  return Utilities.formatDate(target, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

function parseIsoDate_(value) {
  var raw = String(value || '').trim();
  if (!raw) {
    return null;
  }
  return new Date(raw.replace(' ', 'T'));
}

function isEmailVerifiedValue_(value) {
  if (value === true) {
    return true;
  }

  var normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function buildOtpEmailHtml_(fullName, otpCode, expiresInMinutes) {
  var displayName = String(fullName || '').trim() || 'User';
  return [
    '<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.45">',
    '<h2 style="margin:0 0 12px;color:#1d4ed8;">Internship Management System</h2>',
    '<p style="margin:0 0 10px;">Hi ' + escapeHtml_(displayName) + ',</p>',
    '<p style="margin:0 0 10px;">Use this one-time password to verify your account:</p>',
    '<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:10px 0 14px;color:#312e81;">' + otpCode + '</p>',
    '<p style="margin:0 0 10px;">This code will expire in ' + expiresInMinutes + ' minutes.</p>',
    '<p style="margin:0;color:#475569;font-size:12px;">If you did not request this, you can ignore this email.</p>',
    '</div>'
  ].join('');
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isoNow_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
