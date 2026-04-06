function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Internship Management System');
}

var OTP_EXPIRY_MINUTES_ = 10;
var OTP_RESEND_COOLDOWN_SECONDS_ = 60;
var OTP_MAX_ATTEMPTS_ = 5;
var PENDING_REG_PREFIX_ = 'PENDING_REG_';
var PENDING_REG_TTL_HOURS_ = 24;
var PROFILE_PHOTO_MAX_BYTES_ = 5 * 1024 * 1024;
var PROFILE_PHOTO_MAX_MB_ = Math.floor(PROFILE_PHOTO_MAX_BYTES_ / (1024 * 1024));
var PROFILE_PHOTOS_FOLDER_NAME_ = 'IMS Profile Photos';

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

  if (action === 'update_user_profile') {
    return handleUpdateUserProfile_(payload);
  }

  if (action === 'update_profile_photo') {
    return handleUpdateProfilePhoto_(payload);
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
  var roleInput = String(payload.role || '').trim();
  var role = roleInput === 'Supervisor' ? 'Supervisor' : roleInput === 'Student' ? 'Student' : '';
  var department = String(payload.department || '').trim();
  var status = String(payload.status || 'active').trim();
  var pendingByEmail = getPendingRegistration_(email);
  var userId = String(payload.user_id || (pendingByEmail && pendingByEmail.user_id) || createId_('USR'));
  var ojtProfilePayload = payload.ojt_profile || payload.ojtProfile || null;
  var ojtProfile = normalizeStudentProfilePayload_(ojtProfilePayload);
  var now = isoNow_();
  var otpCode = generateOtpCode_();
  var otpHash = sha256Hex_(otpCode);
  var otpExpiresAt = addMinutesIso_(new Date(), OTP_EXPIRY_MINUTES_);

  if (!fullName || !email || !password || !role) {
    return { ok: false, error: 'full_name, email, password, and role are required.' };
  }

  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters long.' };
  }

  if (role === 'Student' && !ojtProfile) {
    return {
      ok: false,
      error: 'Students must provide total_ojt_hours, start_date, estimated_end_date, course, and school.'
    };
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

  var existingPendingByName = findPendingRegistrationByName_(normalizedFullName);
  if (existingPendingByName && normalizeEmail_(existingPendingByName.email) !== email) {
    return { ok: false, error: 'A pending account with this full name already exists.' };
  }

  var pendingRecord = {
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
    otp_last_sent_at: now,
    ojt_profile: role === 'Student' ? ojtProfile : null
  };

  savePendingRegistration_(pendingRecord);

  MailApp.sendEmail({
    to: email,
    subject: 'Verify your Internship Management System account',
    htmlBody: buildOtpEmailHtml_(fullName, otpCode, OTP_EXPIRY_MINUTES_)
  });

  return {
    ok: true,
    message: 'Email verification started. Your account will be created after OTP verification.',
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
  var passwordHash = sha256Hex_(password);

  if (!email || !password) {
    return { ok: false, error: 'email and password are required.' };
  }

  var usersSheet = getSheet_('users');
  var users = readSheetObjects_(usersSheet);
  var found = users.find(function (row) {
    return normalizeEmail_(row.email) === email;
  });

  if (!found) {
    var pending = getPendingRegistration_(email);
    if (pending && String(pending.password_hash || '') === passwordHash) {
      return {
        ok: false,
        error: 'Please verify your email with the OTP code before logging in.',
        requires_verification: true,
        verification_email: email
      };
    }

    return { ok: false, error: 'Invalid email or password.' };
  }

  if (String(found.password_hash || '') !== passwordHash) {
    return { ok: false, error: 'Invalid email or password.' };
  }

  if (!isEmailVerifiedValue_(found.email_verified, found)) {
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
      phone: String(found.phone || ''),
      department: String(found.department || ''),
      location: String(found.location || ''),
      bio: String(found.bio || ''),
      role: String(found.role || ''),
      status: String(found.status || ''),
      created_at: String(found.created_at || ''),
      profile_photo_url: String(found.profile_photo_url || ''),
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

  var pending = getPendingRegistration_(email);
  if (pending) {
    var pendingExpiresAt = parseIsoDate_(pending.otp_expires_at);
    if (!pending.otp_hash || !pendingExpiresAt || pendingExpiresAt.getTime() < new Date().getTime()) {
      return { ok: false, error: 'OTP has expired. Please request a new code.' };
    }

    var pendingAttempts = Number(pending.otp_attempts || 0);
    if (pendingAttempts >= OTP_MAX_ATTEMPTS_) {
      return { ok: false, error: 'Too many incorrect attempts. Please request a new OTP code.' };
    }

    if (sha256Hex_(otpCode) !== String(pending.otp_hash || '')) {
      pending.otp_attempts = pendingAttempts + 1;
      savePendingRegistration_(pending);
      return { ok: false, error: 'Invalid OTP code.' };
    }

    var usersSheet = getSheet_('users');
    var users = readSheetObjects_(usersSheet);
    var existingByEmail = users.find(function (row) {
      return normalizeEmail_(row.email) === email;
    });
    if (existingByEmail) {
      clearPendingRegistration_(email);
      return { ok: true, message: 'Email is already verified. You can now log in.' };
    }

    var existingByName = users.find(function (row) {
      return normalizeName_(row.full_name) === normalizeName_(pending.full_name);
    });
    if (existingByName) {
      return { ok: false, error: 'An account with this full name already exists.' };
    }

    var userRow = {
      user_id: String(pending.user_id || createId_('USR')),
      full_name: String(pending.full_name || ''),
      email: email,
      password_hash: String(pending.password_hash || ''),
      phone: '',
      department: String(pending.department || ''),
      location: '',
      bio: '',
      status: String(pending.status || 'active'),
      role: String(pending.role || 'Student'),
      created_at: String(pending.created_at || isoNow_()),
      profile_photo_url: '',
      profile_photo_file_id: '',
      profile_photo_updated_at: '',
      email_verified: true,
      otp_hash: '',
      otp_expires_at: '',
      otp_attempts: 0,
      otp_last_sent_at: ''
    };

    appendObjectRow_(usersSheet, userRow);

    if (String(userRow.role || '') === 'Student' && pending.ojt_profile) {
      saveStudentOjtProfile_({
        user_id: String(userRow.user_id || ''),
        total_ojt_hours: Number(pending.ojt_profile.total_ojt_hours || 0),
        start_date: String(pending.ojt_profile.start_date || ''),
        estimated_end_date: String(pending.ojt_profile.estimated_end_date || ''),
        course: String(pending.ojt_profile.course || ''),
        school: String(pending.ojt_profile.school || '')
      });
    }

    clearPendingRegistration_(email);

    return {
      ok: true,
      message: 'Email verified successfully. Your account is now active.',
      user: {
        user_id: String(userRow.user_id || ''),
        full_name: String(userRow.full_name || ''),
        email: String(userRow.email || ''),
        phone: String(userRow.phone || ''),
        department: String(userRow.department || ''),
        location: String(userRow.location || ''),
        bio: String(userRow.bio || ''),
        role: String(userRow.role || ''),
        status: String(userRow.status || ''),
        created_at: String(userRow.created_at || ''),
        profile_photo_url: String(userRow.profile_photo_url || '')
      }
    };
  }

  var record = findUserRecordByEmail_(email);
  if (!record) {
    return { ok: false, error: 'No account found for this email.' };
  }

  if (isEmailVerifiedValue_(record.user.email_verified, record.user)) {
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

  var pending = getPendingRegistration_(email);
  if (pending) {
    var pendingLastSentAt = parseIsoDate_(pending.otp_last_sent_at);
    if (pendingLastSentAt) {
      var pendingElapsedSeconds = Math.floor((new Date().getTime() - pendingLastSentAt.getTime()) / 1000);
      if (pendingElapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS_) {
        return {
          ok: false,
          error: 'Please wait ' + (OTP_RESEND_COOLDOWN_SECONDS_ - pendingElapsedSeconds) + ' seconds before requesting another OTP.'
        };
      }
    }

    var pendingOtpCode = generateOtpCode_();
    pending.otp_hash = sha256Hex_(pendingOtpCode);
    pending.otp_expires_at = addMinutesIso_(new Date(), OTP_EXPIRY_MINUTES_);
    pending.otp_attempts = 0;
    pending.otp_last_sent_at = isoNow_();
    savePendingRegistration_(pending);

    MailApp.sendEmail({
      to: email,
      subject: 'Your new OTP for Internship Management System',
      htmlBody: buildOtpEmailHtml_(String(pending.full_name || 'User'), pendingOtpCode, OTP_EXPIRY_MINUTES_)
    });

    return {
      ok: true,
      message: 'A new OTP has been sent to your email.',
      verification_email: email
    };
  }

  var record = findUserRecordByEmail_(email);
  if (!record) {
    return { ok: false, error: 'No account found for this email.' };
  }

  if (isEmailVerifiedValue_(record.user.email_verified, record.user)) {
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

function handleUpdateUserProfile_(payload) {
  var userId = String(payload.user_id || '').trim();
  var fullName = String(payload.full_name || '').trim().replace(/\s+/g, ' ');
  var phone = String(payload.phone || '').trim();
  var department = String(payload.department || '').trim();
  var location = String(payload.location || '').trim();
  var bio = String(payload.bio || '').trim();

  if (!userId || !fullName) {
    return { ok: false, error: 'user_id and full_name are required.' };
  }

  var record = findUserRecordByUserId_(userId);
  if (!record) {
    return { ok: false, error: 'User not found.' };
  }

  if (!isEmailVerifiedValue_(record.user.email_verified, record.user)) {
    return { ok: false, error: 'Please verify your email before updating your profile.' };
  }

  var usersSheet = record.sheet;
  ensureSheetColumns_(usersSheet, ['phone', 'location', 'bio', 'updated_at']);

  record.user.full_name = fullName;
  record.user.phone = phone;
  record.user.department = department;
  record.user.location = location;
  record.user.bio = bio;
  record.user.updated_at = isoNow_();
  updateUserRecord_(record);

  return {
    ok: true,
    message: 'Profile updated successfully.',
    user: {
      user_id: String(record.user.user_id || ''),
      full_name: String(record.user.full_name || ''),
      email: String(record.user.email || ''),
      phone: String(record.user.phone || ''),
      department: String(record.user.department || ''),
      location: String(record.user.location || ''),
      bio: String(record.user.bio || ''),
      role: String(record.user.role || ''),
      status: String(record.user.status || ''),
      created_at: String(record.user.created_at || ''),
      profile_photo_url: String(record.user.profile_photo_url || '')
    }
  };
}

function handleUpdateProfilePhoto_(payload) {
  var userId = String(payload.user_id || '').trim();
  var imageDataUrl = String(payload.image_data_url || '').trim();
  var mimeTypeInput = String(payload.mime_type || '').trim().toLowerCase();
  var fileNameInput = String(payload.file_name || '').trim();

  if (!userId || !imageDataUrl) {
    return { ok: false, error: 'user_id and image_data_url are required.' };
  }

  var record = findUserRecordByUserId_(userId);
  if (!record) {
    return { ok: false, error: 'User not found.' };
  }

  if (!isEmailVerifiedValue_(record.user.email_verified, record.user)) {
    return { ok: false, error: 'Please verify your email before uploading a profile photo.' };
  }

  var parsedDataUrl = parseDataUrl_(imageDataUrl);
  var mimeType = mimeTypeInput || parsedDataUrl.mimeType;

  if (!isAllowedImageMimeType_(mimeType)) {
    return { ok: false, error: 'Only JPG, PNG, WEBP, and GIF images are supported.' };
  }

  var photoBytes;
  try {
    photoBytes = Utilities.base64Decode(parsedDataUrl.base64Data);
  } catch (err) {
    return { ok: false, error: 'Invalid image format.' };
  }

  if (!photoBytes || !photoBytes.length) {
    return { ok: false, error: 'Image file is empty.' };
  }

  if (photoBytes.length > PROFILE_PHOTO_MAX_BYTES_) {
    return { ok: false, error: 'Image is too large. Maximum file size is ' + PROFILE_PHOTO_MAX_MB_ + ' MB.' };
  }

  var extension = mimeType.split('/')[1] || 'jpg';
  if (extension === 'jpeg') {
    extension = 'jpg';
  }

  var safeBaseName = String(record.user.user_id || userId).replace(/[^a-zA-Z0-9_-]/g, '_');
  var fileName = fileNameInput || ('profile_' + safeBaseName + '_' + new Date().getTime() + '.' + extension);
  var photoBlob = Utilities.newBlob(photoBytes, mimeType, fileName);
  var photosFolder = getProfilePhotosFolder_();
  var uploadedFile = photosFolder.createFile(photoBlob);
  uploadedFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var previousFileId = String(record.user.profile_photo_file_id || '').trim();
  if (previousFileId) {
    try {
      DriveApp.getFileById(previousFileId).setTrashed(true);
    } catch (err) {
      // Ignore cleanup errors for old files.
    }
  }

  var usersSheet = record.sheet;
  ensureSheetColumns_(usersSheet, ['profile_photo_url', 'profile_photo_file_id', 'profile_photo_updated_at']);

  record.user.profile_photo_url = 'https://drive.google.com/thumbnail?id=' + uploadedFile.getId() + '&sz=w512';
  record.user.profile_photo_file_id = uploadedFile.getId();
  record.user.profile_photo_updated_at = isoNow_();
  updateUserRecord_(record);

  return {
    ok: true,
    message: 'Profile photo updated successfully.',
    user: {
      user_id: String(record.user.user_id || ''),
      full_name: String(record.user.full_name || ''),
      email: String(record.user.email || ''),
      department: String(record.user.department || ''),
      role: String(record.user.role || ''),
      status: String(record.user.status || ''),
      created_at: String(record.user.created_at || ''),
      profile_photo_url: String(record.user.profile_photo_url || '')
    }
  };
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

  var userRecord = findUserRecordByUserId_(userId);
  if (!userRecord) {
    return { ok: false, error: 'User not found.' };
  }

  if (!isEmailVerifiedValue_(userRecord.user.email_verified, userRecord.user)) {
    return { ok: false, error: 'Please verify your email before saving your OJT profile.' };
  }

  var rowObject = {
    user_id: userId,
    total_ojt_hours: totalHours,
    start_date: startDate,
    estimated_end_date: estimatedEndDate,
    course: course,
    school: school
  };

  saveStudentOjtProfile_(rowObject);

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

function saveStudentOjtProfile_(rowObject) {
  var sheet = getSheet_('student_ojt_profile');
  var headers = getHeaders_(sheet);
  var values = getSheetValues_(sheet);
  var userIdCol = findColumnIndex_(headers, 'user_id');

  if (userIdCol === 0) {
    throw new Error('student_ojt_profile must include user_id column.');
  }

  var rowIndex = -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][userIdCol - 1] || '') === String(rowObject.user_id || '')) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex > 0) {
    updateObjectRow_(sheet, rowIndex, rowObject);
  } else {
    appendObjectRow_(sheet, rowObject);
  }
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

function getPendingRegistrationKey_(email) {
  return PENDING_REG_PREFIX_ + sha256Hex_(normalizeEmail_(email));
}

function savePendingRegistration_(pendingRecord) {
  if (!pendingRecord || !pendingRecord.email) {
    throw new Error('Pending registration record requires an email.');
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperty(getPendingRegistrationKey_(pendingRecord.email), JSON.stringify(pendingRecord));
}

function clearPendingRegistration_(email) {
  PropertiesService.getScriptProperties().deleteProperty(getPendingRegistrationKey_(email));
}

function getPendingRegistration_(email) {
  var normalizedEmail = normalizeEmail_(email);
  if (!normalizedEmail) {
    return null;
  }

  var props = PropertiesService.getScriptProperties();
  var key = getPendingRegistrationKey_(normalizedEmail);
  var rawValue = props.getProperty(key);
  if (!rawValue) {
    return null;
  }

  try {
    var parsed = JSON.parse(rawValue);
    if (!parsed || normalizeEmail_(parsed.email) !== normalizedEmail) {
      props.deleteProperty(key);
      return null;
    }

    if (isPendingRegistrationExpired_(parsed)) {
      props.deleteProperty(key);
      return null;
    }

    return parsed;
  } catch (err) {
    props.deleteProperty(key);
    return null;
  }
}

function listPendingRegistrations_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var list = [];

  for (var key in props) {
    if (key.indexOf(PENDING_REG_PREFIX_) !== 0) {
      continue;
    }

    try {
      var parsed = JSON.parse(props[key]);
      if (!parsed || !parsed.email || isPendingRegistrationExpired_(parsed)) {
        continue;
      }
      list.push(parsed);
    } catch (err) {
      // Ignore malformed pending records.
    }
  }

  return list;
}

function findPendingRegistrationByName_(normalizedFullName) {
  var target = normalizeName_(normalizedFullName);
  if (!target) {
    return null;
  }

  var pending = listPendingRegistrations_();
  for (var i = 0; i < pending.length; i++) {
    if (normalizeName_(pending[i].full_name) === target) {
      return pending[i];
    }
  }

  return null;
}

function isPendingRegistrationExpired_(pendingRecord) {
  var createdAt = parseIsoDate_(pendingRecord && pendingRecord.created_at);
  if (!createdAt) {
    return false;
  }

  var expiresAt = new Date(createdAt.getTime() + PENDING_REG_TTL_HOURS_ * 3600000);
  return expiresAt.getTime() < new Date().getTime();
}

function getSheet_(sheetName) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }
  return sheet;
}

function ensureSheetColumns_(sheet, columnNames) {
  if (!sheet || !columnNames || !columnNames.length) {
    return;
  }

  var headers = getHeaders_(sheet);
  var missingColumns = [];

  for (var i = 0; i < columnNames.length; i++) {
    if (findColumnIndex_(headers, columnNames[i]) === 0) {
      missingColumns.push(columnNames[i]);
    }
  }

  if (!missingColumns.length) {
    return;
  }

  var startCol = headers.length + 1;
  sheet.getRange(1, startCol, 1, missingColumns.length).setValues([missingColumns]);
}

function getProfilePhotosFolder_() {
  var props = PropertiesService.getScriptProperties();
  var configuredFolderId = String(props.getProperty('PROFILE_PHOTOS_FOLDER_ID') || '').trim();

  if (configuredFolderId) {
    try {
      return DriveApp.getFolderById(configuredFolderId);
    } catch (err) {
      props.deleteProperty('PROFILE_PHOTOS_FOLDER_ID');
    }
  }

  var existingFolders = DriveApp.getFoldersByName(PROFILE_PHOTOS_FOLDER_NAME_);
  var folder = existingFolders.hasNext() ? existingFolders.next() : DriveApp.createFolder(PROFILE_PHOTOS_FOLDER_NAME_);
  props.setProperty('PROFILE_PHOTOS_FOLDER_ID', folder.getId());

  return folder;
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

function findUserRecordByUserId_(userId) {
  var targetUserId = String(userId || '').trim();
  if (!targetUserId) {
    return null;
  }

  var sheet = getSheet_('users');
  var headers = getHeaders_(sheet);
  var values = getSheetValues_(sheet);
  var userIdCol = findColumnIndex_(headers, 'user_id');

  if (userIdCol === 0) {
    throw new Error('users sheet must include a user_id column.');
  }

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][userIdCol - 1] || '').trim() === targetUserId) {
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

function normalizeStudentProfilePayload_(profileInput) {
  if (!profileInput || typeof profileInput !== 'object') {
    return null;
  }

  var totalHours = Number(profileInput.total_ojt_hours || 0);
  var startDate = String(profileInput.start_date || '').trim();
  var estimatedEndDate = String(profileInput.estimated_end_date || '').trim();
  var course = String(profileInput.course || '').trim();
  var school = String(profileInput.school || '').trim();

  if (!totalHours || !startDate || !estimatedEndDate || !course || !school) {
    return null;
  }

  return {
    total_ojt_hours: totalHours,
    start_date: startDate,
    estimated_end_date: estimatedEndDate,
    course: course,
    school: school
  };
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

function parseDataUrl_(dataUrl) {
  var raw = String(dataUrl || '').trim();
  var match = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image data URL.');
  }

  return {
    mimeType: String(match[1] || '').toLowerCase(),
    base64Data: String(match[2] || '').replace(/\s/g, '')
  };
}

function isAllowedImageMimeType_(mimeType) {
  var normalized = String(mimeType || '').trim().toLowerCase();
  return normalized === 'image/jpeg' || normalized === 'image/png' || normalized === 'image/webp' || normalized === 'image/gif';
}

function isEmailVerifiedValue_(value, userRecord) {
  if (value === true) {
    return true;
  }

  var normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    var hasPendingOtp = false;
    if (userRecord && typeof userRecord === 'object') {
      hasPendingOtp = Boolean(String(userRecord.otp_hash || '').trim());
    }
    return !hasPendingOtp;
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

function authorizeImsScopes_() {
  // Run once from Apps Script editor to grant Spreadsheet, Mail, and Drive scopes.
  getSpreadsheet_().getId();
  MailApp.getRemainingDailyQuota();
  DriveApp.getRootFolder().getId();
  return 'Authorization complete.';
}

function authorizeImsScopes() {
  return authorizeImsScopes_();
}
