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
var TIME_LOGS_SHEET_ = 'time_logs';
var TIME_LOGS_HEADERS_ = ['timelog_id', 'user_id', 'log_date', 'time_in', 'time_out', 'hours_rendered', 'status', 'notes', 'created_at'];
var SUPERVISOR_ASSIGNMENTS_SHEET_ = 'supervisor_assignments';
var SUPERVISOR_ASSIGNMENTS_HEADERS_ = ['assignment_id', 'supervisor_user_id', 'student_user_id', 'company', 'department', 'status', 'created_at'];
var STUDENT_OJT_PROFILE_SHEET_ = 'student_ojt_profile';
var STUDENT_OJT_PROFILE_HEADERS_ = ['user_id', 'total_ojt_hours', 'start_date', 'estimated_end_date', 'course', 'school'];
var REQUESTS_SHEET_ = 'requests';
var REQUESTS_HEADERS_ = ['request_id', 'user_id', 'requester_name', 'request_type', 'request_date', 'request_time', 'reason', 'status', 'created_at'];

function doPost(e) {
  try {
    var payload = parsePayload_(e);
    return jsonResponse_(dispatchAction_(payload));
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message || String(err) });
  }
}

function apiAction(action, payload) {
  try {
    var requestPayload = payload || {};
    requestPayload.action = String(action || '').trim();
    return dispatchAction_(requestPayload);
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
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

  if (action === 'get_user_by_id') {
    return handleGetUserById_(payload);
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

  if (action === 'list_students_for_assignment') {
    return handleListStudentsForAssignment_(payload);
  }

  if (action === 'assign_students_to_supervisor') {
    return handleAssignStudentsToSupervisor_(payload);
  }

  if (action === 'list_supervisor_assigned_students') {
    return handleListSupervisorAssignedStudents_(payload);
  }

  if (action === 'list_supervisor_time_logs') {
    return handleListSupervisorTimeLogs_(payload);
  }

  if (action === 'delete_supervisor_time_log') {
    return handleDeleteSupervisorTimeLog_(payload);
  }

  if (action === 'debug_supervisor_assignment') {
    return handleDebugSupervisorAssignment_(payload);
  }

  // --- Dashboard additions (additive) ---
  if (action === 'get_student_dashboard') {
    return handleGetStudentDashboard_(payload);
  }

  if (action === 'list_activity_logs_by_user') {
    return handleListActivityLogsByUser_(payload);
  }

  if (action === 'list_tasks_by_user') {
    return handleListTasksByUser_(payload);
  }

  // --- Document management actions ---
  if (action === 'get_all_documents') {
    return handleGetAllDocuments_(payload);
  }

  if (action === 'upload_document') {
    return handleUploadDocument_(payload);
  }

  if (action === 'delete_document') {
    return handleDeleteDocument_(payload);
  }

  if (action === 'share_document') {
    return handleShareDocument_(payload);
  }

  if (action === 'remove_share') {
    return handleRemoveShare_(payload);
  }

  if (action === 'create_folder') {
    return handleCreateFolder_(payload);
  }

  if (action === 'create_request') {
    return handleCreateRequest_(payload);
  }

  if (action === 'list_requests_by_user') {
    return handleListRequestsByUser_(payload);
  }

  if (action === 'list_assigned_student_requests') {
    return handleListAssignedStudentRequests_(payload);
  }

  if (action === 'update_request_status') {
    return handleUpdateRequestStatus_(payload);
  }

  return { ok: false, error: 'Unknown action: ' + action };
}

// --- Dashboard additions (additive) ---
function handleGetStudentDashboard_(payload) {
  var userId = String(payload.user_id || '').trim();
  if (!userId) {
    return { ok: false, error: 'user_id is required.' };
  }

  var userRecord = findUserRecordByUserId_(userId);
  if (!userRecord) {
    return { ok: false, error: 'User not found.' };
  }

  var profile = getStudentProfileByUserId_(userId);
  // Load only the most recent 10 time logs for display (much faster)
  var logsResult = handleListTimeLogsByUser_({ user_id: userId, limit: 10 });
  if (!logsResult || logsResult.ok !== true) {
    return { ok: false, error: logsResult && logsResult.error ? logsResult.error : 'Unable to load time logs.' };
  }

  // Calculate total hours_rendered from ALL time logs (efficient server-side calculation)
  var totalCompletedHours = getTotalCompletedHoursByUserId_(userId);

  var activityResult = handleListActivityLogsByUser_({ user_id: userId, limit: payload.limit || 10 });
  var tasksResult = handleListTasksByUser_({ user_id: userId, limit: payload.limit || 10 });

  return {
    ok: true,
    user: {
      user_id: String(userRecord.user.user_id || ''),
      full_name: String(userRecord.user.full_name || ''),
      email: String(userRecord.user.email || ''),
      role: String(userRecord.user.role || ''),
      status: String(userRecord.user.status || ''),
      department: String(userRecord.user.department || '')
    },
    profile: profile,
    total_completed_hours: totalCompletedHours,
    time_logs: Array.isArray(logsResult.logs) ? logsResult.logs : [],
    activity_logs: activityResult && activityResult.ok === true ? activityResult.logs : [],
    tasks: tasksResult && tasksResult.ok === true ? tasksResult.tasks : []
  };
}

function handleListActivityLogsByUser_(payload) {
  var userId = String(payload.user_id || '').trim();
  var limit = Number(payload.limit || 10);
  if (!userId) {
    return { ok: false, error: 'user_id is required.' };
  }

  try {
    var sheet = getSheet_('activity_logs');
    var rows = readSheetObjects_(sheet)
      .filter(function (row) {
        return String(serializeCellValue_(row.user_id) || '').trim() === userId;
      })
      .sort(function (a, b) {
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      })
      .slice(0, Math.max(0, limit))
      .map(function (row) {
        return sanitizeObjectForClient_(row);
      });

    return { ok: true, logs: rows };
  } catch (err) {
    // If sheet doesn't exist yet, return empty list (keeps dashboard working)
    var message = err && err.message ? err.message : String(err);
    if (String(message).indexOf('Sheet not found') === 0) {
      return { ok: true, logs: [] };
    }

    return { ok: false, error: 'Unable to load activity logs. ' + message };
  }
}

function handleListTasksByUser_(payload) {
  var userId = String(payload.user_id || '').trim();
  var limit = Number(payload.limit || 10);
  if (!userId) {
    return { ok: false, error: 'user_id is required.' };
  }

  try {
    var sheet = getSheet_('tasks');
    var rows = readSheetObjects_(sheet)
      .filter(function (row) {
        return String(serializeCellValue_(row.user_id) || '').trim() === userId;
      })
      .sort(function (a, b) {
        // Prefer due_date desc, fallback created_at
        var dueCmp = String(a.due_date || '').localeCompare(String(b.due_date || ''));
        if (dueCmp !== 0) return dueCmp;
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      })
      .slice(0, Math.max(0, limit))
      .map(function (row) {
        return sanitizeObjectForClient_(row);
      });

    return { ok: true, tasks: rows };
  } catch (err) {
    var message = err && err.message ? err.message : String(err);
    if (String(message).indexOf('Sheet not found') === 0) {
      return { ok: true, tasks: [] };
    }

    return { ok: false, error: 'Unable to load tasks. ' + message };
  }
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

  // Track first login: if first_login_date is not set, set it now
  var firstLoginDate = String(found.first_login_date || '').trim();
  if (!firstLoginDate) {
    firstLoginDate = isoNow_().slice(0, 10); // Get just the date part (YYYY-MM-DD)
    var userRecord = findUserRecordByUserId_(found.user_id);
    if (userRecord) {
      updateObjectRow_(userRecord.sheet, userRecord.rowIndex, {
        first_login_date: firstLoginDate
      });
    }
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
      first_login_date: firstLoginDate,
      profile_photo_url: String(found.profile_photo_url || ''),
      ojt: profile
    }
  };
}

function handleGetUserById_(payload) {
  var userId = String(payload.user_id || '').trim();

  if (!userId) {
    return { ok: false, error: 'user_id is required.' };
  }

  var record = findUserRecordByUserId_(userId);
  if (!record) {
    return { ok: false, error: 'User not found.' };
  }

  var profile = getStudentProfileByUserId_(String(record.user.user_id || ''));

  return {
    ok: true,
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
      first_login_date: String(record.user.first_login_date || ''),
      profile_photo_url: String(record.user.profile_photo_url || ''),
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
  var status = 'recorded';
  var notes = String(payload.notes || '').trim();
  var timelogId = String(payload.timelog_id || createId_('TL'));
  var createdAt = String(payload.created_at || isoNow_());
  var updateStartDate = payload.updateStartDate === true; // Allow first time log to set start date

  if (!userId || !logDate || !timeIn || !timeOut || !hoursRendered) {
    return { ok: false, error: 'user_id, log_date, time_in, time_out, and hours_rendered are required.' };
  }

  var userRecord = findUserRecordByUserId_(userId);
  if (!userRecord) {
    return { ok: false, error: 'User not found.' };
  }

  if (!isEmailVerifiedValue_(userRecord.user.email_verified, userRecord.user)) {
    return { ok: false, error: 'Please verify your email before creating a time log.' };
  }

  var sheet = getTimeLogsSheet_();
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

  // If this is the first time log and updateStartDate flag is set, update OJT profile start_date
  if (updateStartDate) {
    var profile = getStudentProfileByUserId_(userId);
    if (profile) {
      // Update the start date to the first time log date
      saveStudentOjtProfile_({
        user_id: userId,
        total_ojt_hours: profile.total_ojt_hours,
        start_date: logDate,
        estimated_end_date: profile.estimated_end_date,
        course: profile.course,
        school: profile.school
      });
    }
  }

  return {
    ok: true,
    message: 'Time log saved successfully.',
    timelog: rowObject,
  };
}

function handleListTimeLogsByUser_(payload) {
  var userId = String(payload.user_id || '').trim();
  var limit = Number(payload.limit || 0); // 0 means no limit
  
  if (!userId) {
    return { ok: false, error: 'user_id is required.' };
  }

  try {
    var sheet = getTimeLogsSheet_();
    var rows = readSheetObjects_(sheet).filter(function (row) {
      return String(serializeCellValue_(row.user_id) || '').trim() === userId;
    }).map(function (row) {
      return sanitizeObjectForClient_(row);
    }).sort(function (a, b) {
      // Sort by created_at descending (most recent first)
      var dateA = new Date(String(a.created_at || ''));
      var dateB = new Date(String(b.created_at || ''));
      return dateB.getTime() - dateA.getTime();
    });

    // Apply limit if specified
    if (limit > 0) {
      rows = rows.slice(0, limit);
    }

    return { ok: true, logs: rows };
  } catch (err) {
    return {
      ok: false,
      error: 'Unable to load time logs. ' + (err && err.message ? err.message : String(err))
    };
  }
}

function handleDeleteTimeLog_(payload) {
  var userId = String(payload.user_id || '').trim();
  var timelogId = String(payload.timelog_id || '').trim();

  if (!userId || !timelogId) {
    return { ok: false, error: 'user_id and timelog_id are required.' };
  }

  var sheet = getTimeLogsSheet_();
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

function handleListStudentsForAssignment_(payload) {
  var supervisorUserId = String(payload.supervisor_user_id || '').trim();

  if (!supervisorUserId) {
    return { ok: false, error: 'supervisor_user_id is required.' };
  }

  var supervisorRecord = findUserRecordByUserId_(supervisorUserId);
  if (!supervisorRecord) {
    return { ok: false, error: 'Supervisor not found.' };
  }

  if (String(supervisorRecord.user.role || '').trim() !== 'Supervisor') {
    return { ok: false, error: 'Only supervisors can assign students.' };
  }

  var usersSheet = getSheet_('users');
  ensureSheetColumns_(usersSheet, ['company']);

  var assignedIds = {};
  var assignments = getActiveSupervisorAssignments_(supervisorUserId);
  for (var i = 0; i < assignments.length; i++) {
    assignedIds[String(assignments[i].student_user_id || '').trim()] = true;
  }

  var users = readSheetObjects_(usersSheet);
  var students = users
    .filter(function (row) {
      var roleValue = String(row.role || '').trim().toLowerCase();
      var userId = String(row.user_id || '').trim();
      var fullName = String(row.full_name || '').trim();

      if (!userId || !fullName) {
        return false;
      }

      if (userId === supervisorUserId) {
        return false;
      }

      // Treat any non-supervisor account as assignable student to avoid role label mismatches.
      return roleValue !== 'supervisor';
    })
    .map(function (row) {
      var studentUserId = String(row.user_id || '').trim();
      return {
        user_id: studentUserId,
        full_name: String(row.full_name || ''),
        email: String(row.email || ''),
        profile_photo_url: String(row.profile_photo_url || ''),
        company: String(row.company || ''),
        department: String(row.department || ''),
        is_assigned: Boolean(assignedIds[studentUserId])
      };
    })
    .sort(function (a, b) {
      return String(a.full_name || '').localeCompare(String(b.full_name || ''));
    });

  return { ok: true, students: students };
}

function handleAssignStudentsToSupervisor_(payload) {
  var supervisorUserId = String(payload.supervisor_user_id || '').trim();
  var studentUserIdsInput = Array.isArray(payload.student_user_ids) ? payload.student_user_ids : [];

  if (!supervisorUserId) {
    return { ok: false, error: 'supervisor_user_id is required.' };
  }

  var supervisorRecord = findUserRecordByUserId_(supervisorUserId);
  if (!supervisorRecord) {
    return { ok: false, error: 'Supervisor not found.' };
  }

  if (String(supervisorRecord.user.role || '').trim() !== 'Supervisor') {
    return { ok: false, error: 'Only supervisors can assign students.' };
  }

  var studentUserIds = [];
  var seen = {};
  for (var i = 0; i < studentUserIdsInput.length; i++) {
    var studentUserId = String(studentUserIdsInput[i] || '').trim();
    if (!studentUserId || seen[studentUserId]) {
      continue;
    }
    seen[studentUserId] = true;
    studentUserIds.push(studentUserId);
  }

  var usersSheet = getSheet_('users');
  ensureSheetColumns_(usersSheet, ['company']);
  var users = readSheetObjects_(usersSheet);
  var validStudents = {};
  for (var j = 0; j < users.length; j++) {
    var roleValue = String(users[j].role || '').trim().toLowerCase();
    var rowUserId = String(users[j].user_id || '').trim();
    var fullName = String(users[j].full_name || '').trim();

    if (!rowUserId || !fullName || rowUserId === supervisorUserId) {
      continue;
    }

    if (roleValue !== 'supervisor') {
      validStudents[rowUserId] = users[j];
    }
  }

  for (var k = 0; k < studentUserIds.length; k++) {
    if (!validStudents[studentUserIds[k]]) {
      return { ok: false, error: 'Invalid student user_id: ' + studentUserIds[k] };
    }
  }

  var sheet = getSupervisorAssignmentsSheet_();
  var headers = getHeaders_(sheet);
  var values = getSheetValues_(sheet);
  var supervisorCol = findColumnIndex_(headers, 'supervisor_user_id');

  if (supervisorCol === 0) {
    throw new Error('supervisor_assignments sheet must include supervisor_user_id column.');
  }

  var rowsToDelete = [];
  for (var rowIndex = 1; rowIndex < values.length; rowIndex++) {
    if (String(values[rowIndex][supervisorCol - 1] || '').trim() === supervisorUserId) {
      rowsToDelete.push(rowIndex + 1);
    }
  }

  for (var r = rowsToDelete.length - 1; r >= 0; r--) {
    sheet.deleteRow(rowsToDelete[r]);
  }

  var createdAt = isoNow_();
  for (var s = 0; s < studentUserIds.length; s++) {
    var studentRow = validStudents[studentUserIds[s]];
    appendObjectRow_(sheet, {
      assignment_id: createId_('ASG'),
      supervisor_user_id: supervisorUserId,
      student_user_id: studentUserIds[s],
      company: String(studentRow.company || ''),
      department: String(studentRow.department || ''),
      status: 'active',
      created_at: createdAt,
    });
  }

  return {
    ok: true,
    message: 'Assigned students saved successfully.',
    assigned_count: studentUserIds.length,
  };
}

function handleListSupervisorAssignedStudents_(payload) {
  var supervisorUserId = String(payload.supervisor_user_id || '').trim();
  if (!supervisorUserId) {
    return { ok: false, error: 'supervisor_user_id is required.' };
  }

  var supervisorRecord = findUserRecordByUserId_(supervisorUserId);
  if (!supervisorRecord) {
    return { ok: false, error: 'Supervisor not found.' };
  }

  if (String(supervisorRecord.user.role || '').trim() !== 'Supervisor') {
    return { ok: false, error: 'Only supervisors can view assigned students.' };
  }

  var assignments = getActiveSupervisorAssignments_(supervisorUserId);
  if (!assignments.length) {
    return { ok: true, students: [] };
  }

  var studentIds = [];
  var seenIds = {};
  for (var i = 0; i < assignments.length; i++) {
    var studentId = String(assignments[i].student_user_id || '').trim();
    if (!studentId || seenIds[studentId]) {
      continue;
    }
    seenIds[studentId] = true;
    studentIds.push(studentId);
  }

  var users = readSheetObjects_(getSheet_('users'));
  var userLookup = {};
  for (var j = 0; j < users.length; j++) {
    userLookup[String(users[j].user_id || '').trim()] = users[j];
  }

  var completedHoursLookup = getCompletedHoursLookupByUserIds_(studentIds);
  var students = [];

  for (var k = 0; k < assignments.length; k++) {
    var assignment = assignments[k];
    var assignmentStudentId = String(assignment.student_user_id || '').trim();
    var student = userLookup[assignmentStudentId];

    if (!student) {
      continue;
    }

    if (String(student.role || '').trim().toLowerCase() === 'supervisor') {
      continue;
    }

    var profile = getStudentProfileByUserId_(assignmentStudentId);
    var requiredHours = Number(profile && profile.total_ojt_hours ? profile.total_ojt_hours : 0);
    var completedHours = Number(completedHoursLookup[assignmentStudentId] || 0);

    students.push({
      user_id: assignmentStudentId,
      full_name: String(student.full_name || ''),
      email: String(student.email || ''),
      profile_photo_url: String(student.profile_photo_url || ''),
      company: String(assignment.company || student.company || ''),
      department: String(assignment.department || student.department || ''),
      required_hours: requiredHours,
      completed_hours: completedHours,
      remaining_hours: Math.max(0, requiredHours - completedHours),
      estimated_end_date: String((profile && profile.estimated_end_date) || ''),
      assignment_id: String(assignment.assignment_id || ''),
    });
  }

  students.sort(function (a, b) {
    return String(a.full_name || '').localeCompare(String(b.full_name || ''));
  });

  return { ok: true, students: students };
}

function handleListSupervisorTimeLogs_(payload) {
  var supervisorUserId = String(payload.supervisor_user_id || '').trim();
  var studentUserId = String(payload.student_user_id || '').trim();

  if (!supervisorUserId || !studentUserId) {
    return { ok: false, error: 'supervisor_user_id and student_user_id are required.' };
  }

  var supervisorRecord = findUserRecordByUserId_(supervisorUserId);
  if (!supervisorRecord) {
    return { ok: false, error: 'Supervisor not found.' };
  }

  if (String(supervisorRecord.user.role || '').trim() !== 'Supervisor') {
    return { ok: false, error: 'Only supervisors can view student time logs.' };
  }

  if (!isStudentAssignedToSupervisor_(supervisorUserId, studentUserId)) {
    return { ok: false, error: 'This student is not assigned to you.' };
  }

  var sheet = getTimeLogsSheet_();
  var rows = readSheetObjects_(sheet)
    .filter(function (row) {
      return String(serializeCellValue_(row.user_id) || '').trim() === studentUserId;
    })
    .map(function (row) {
      return sanitizeObjectForClient_(row);
    });

  return { ok: true, logs: rows };
}

function handleDeleteSupervisorTimeLog_(payload) {
  var supervisorUserId = String(payload.supervisor_user_id || '').trim();
  var studentUserId = String(payload.student_user_id || '').trim();
  var timelogId = String(payload.timelog_id || '').trim();

  if (!supervisorUserId || !studentUserId || !timelogId) {
    return { ok: false, error: 'supervisor_user_id, student_user_id, and timelog_id are required.' };
  }

  var supervisorRecord = findUserRecordByUserId_(supervisorUserId);
  if (!supervisorRecord) {
    return { ok: false, error: 'Supervisor not found.' };
  }

  if (String(supervisorRecord.user.role || '').trim() !== 'Supervisor') {
    return { ok: false, error: 'Only supervisors can delete student time logs.' };
  }

  if (!isStudentAssignedToSupervisor_(supervisorUserId, studentUserId)) {
    return { ok: false, error: 'This student is not assigned to you.' };
  }

  var sheet = getTimeLogsSheet_();
  var headers = getHeaders_(sheet);
  var values = getSheetValues_(sheet);
  var timelogCol = findColumnIndex_(headers, 'timelog_id');
  var userCol = findColumnIndex_(headers, 'user_id');

  if (timelogCol === 0 || userCol === 0) {
    throw new Error('time_logs sheet must include timelog_id and user_id columns.');
  }

  var rowIndex = -1;
  for (var i = 1; i < values.length; i++) {
    var rowTimelogId = String(values[i][timelogCol - 1] || '').trim();
    var rowUserId = String(values[i][userCol - 1] || '').trim();
    if (rowTimelogId === timelogId && rowUserId === studentUserId) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex <= 0) {
    return { ok: false, error: 'Time log not found for selected student.' };
  }

  sheet.deleteRow(rowIndex);
  return { ok: true, message: 'Student time log deleted.' };
}

function handleDebugSupervisorAssignment_(payload) {
  var supervisorUserId = String(payload.supervisor_user_id || '').trim();
  var mainDbId = String(PropertiesService.getScriptProperties().getProperty('MAIN_DB') || '').trim();

  var users = [];
  try {
    users = readSheetObjects_(getSheet_('users'));
  } catch (err) {
    return {
      ok: true,
      debug: {
        main_db_id: mainDbId,
        users_count: 0,
        candidate_students_count: 0,
        supervisor_found: false,
        supervisor_role: '',
        sample_users: [],
        sheet_error: err && err.message ? String(err.message) : String(err),
      },
    };
  }

  var supervisorRecord = findUserRecordByUserId_(supervisorUserId);
  var candidateCount = 0;
  var sampleUsers = [];

  for (var i = 0; i < users.length; i++) {
    var rowUserId = String(users[i].user_id || '').trim();
    var roleValue = String(users[i].role || '').trim().toLowerCase();
    var fullName = String(users[i].full_name || '').trim();

    if (rowUserId && rowUserId !== supervisorUserId && roleValue !== 'supervisor') {
      candidateCount += 1;
    }

    if (sampleUsers.length < 8) {
      sampleUsers.push({
        user_id: rowUserId,
        full_name: fullName,
        role: String(users[i].role || ''),
      });
    }
  }

  return {
    ok: true,
    debug: {
      main_db_id: mainDbId,
      users_count: users.length,
      candidate_students_count: candidateCount,
      supervisor_found: Boolean(supervisorRecord),
      supervisor_role: supervisorRecord ? String(supervisorRecord.user.role || '') : '',
      sample_users: sampleUsers,
      sheet_error: '',
    },
  };
}

// --- Request handlers ---
function handleCreateRequest_(payload) {
  var userId = String(payload.user_id || '').trim();
  var requesterName = String(payload.requester_name || '').trim();
  var requestType = String(payload.request_type || '').trim();
  var requestDate = String(payload.request_date || '').trim();
  var requestTime = String(payload.request_time || '').trim();
  var reason = String(payload.reason || '').trim();

  if (!userId || !requestType || !requestDate || !reason) {
    return { ok: false, error: 'Missing required fields: user_id, request_type, request_date, reason' };
  }

  var requestId = 'REQ-' + Date.now();
  var createdAt = new Date().toISOString();

  var sheet = getRequestsSheet_();
  var headers = getHeaders_(sheet);
  var row = [];
  
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];
    if (header === 'request_id') {
      row.push(requestId);
    } else if (header === 'user_id') {
      row.push(userId);
    } else if (header === 'requester_name') {
      row.push(requesterName);
    } else if (header === 'request_type') {
      row.push(requestType);
    } else if (header === 'request_date') {
      row.push(requestDate);
    } else if (header === 'request_time') {
      row.push(requestTime);
    } else if (header === 'reason') {
      row.push(reason);
    } else if (header === 'status') {
      row.push('Pending');
    } else if (header === 'created_at') {
      row.push(createdAt);
    } else {
      row.push('');
    }
  }

  sheet.appendRow(row);

  return {
    ok: true,
    request: {
      id: requestId,
      requestType: requestType,
      date: requestDate,
      time: requestTime,
      reason: reason,
      status: 'Pending',
      requester_name: requesterName,
    },
  };
}

function handleListRequestsByUser_(payload) {
  var userId = String(payload.user_id || '').trim();

  if (!userId) {
    return { ok: false, error: 'user_id is required.' };
  }

  var sheet = getRequestsSheet_();
  var rows = readSheetObjects_(sheet);
  var userRequests = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (String(row.user_id || '').trim() === userId) {
      userRequests.push({
        id: String(row.request_id || ''),
        requestType: String(row.request_type || ''),
        date: formatDateValue_(row.request_date),
        time: String(row.request_time || ''),
        reason: String(row.reason || ''),
        status: String(row.status || 'Pending'),
        requester_name: String(row.requester_name || ''),
      });
    }
  }

  return { ok: true, requests: userRequests };
}

function handleListAssignedStudentRequests_(payload) {
  var supervisorUserId = String(payload.supervisor_user_id || '').trim();

  if (!supervisorUserId) {
    return { ok: false, error: 'supervisor_user_id is required.' };
  }

  var assignmentSheet = getSupervisorAssignmentsSheet_();
  var assignments = readSheetObjects_(assignmentSheet);
  
  var assignedStudentIds = [];
  for (var i = 0; i < assignments.length; i++) {
    if (String(assignments[i].supervisor_user_id || '').trim() === supervisorUserId) {
      assignedStudentIds.push(String(assignments[i].student_user_id || '').trim());
    }
  }

  var requestSheet = getRequestsSheet_();
  var rows = readSheetObjects_(requestSheet);
  var studentRequests = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rowUserId = String(row.user_id || '').trim();
    
    if (assignedStudentIds.indexOf(rowUserId) !== -1) {
      studentRequests.push({
        id: String(row.request_id || ''),
        requestType: String(row.request_type || ''),
        date: formatDateValue_(row.request_date),
        time: String(row.request_time || ''),
        reason: String(row.reason || ''),
        status: String(row.status || 'Pending'),
        requester_name: String(row.requester_name || ''),
      });
    }
  }

  return { ok: true, requests: studentRequests };
}

function handleUpdateRequestStatus_(payload) {
  var requestId = String(payload.request_id || '').trim();
  var newStatus = String(payload.status || '').trim();

  if (!requestId || !newStatus) {
    return { ok: false, error: 'request_id and status are required.' };
  }

  var sheet = getRequestsSheet_();
  var rows = getSheetValues_(sheet);
  var headers = getHeaders_(sheet);
  var statusColIndex = findColumnIndex_(headers, 'request_id');
  var updateColIndex = findColumnIndex_(headers, 'status');

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][statusColIndex - 1] || '').trim() === requestId) {
      sheet.getRange(i + 1, updateColIndex, 1, 1).setValue(newStatus);
      return { ok: true, message: 'Request status updated.' };
    }
  }

  return { ok: false, error: 'Request not found.' };
}

function getCompletedHoursLookupByUserIds_(userIds) {
  var lookup = {};
  if (!Array.isArray(userIds) || !userIds.length) {
    return lookup;
  }

  var allowed = {};
  for (var i = 0; i < userIds.length; i++) {
    var userId = String(userIds[i] || '').trim();
    if (userId) {
      allowed[userId] = true;
      lookup[userId] = 0;
    }
  }

  var rows = readSheetObjects_(getTimeLogsSheet_());
  for (var j = 0; j < rows.length; j++) {
    var rowUserId = String(rows[j].user_id || '').trim();
    if (!allowed[rowUserId]) {
      continue;
    }
    lookup[rowUserId] += Number(rows[j].hours_rendered || 0);
  }

  return lookup;
}

function getTotalCompletedHoursByUserId_(userId) {
  var targetUserId = String(userId || '').trim();
  if (!targetUserId) {
    return 0;
  }

  var rows = readSheetObjects_(getTimeLogsSheet_());
  var total = 0;
  for (var i = 0; i < rows.length; i++) {
    var rowUserId = String(rows[i].user_id || '').trim();
    if (rowUserId === targetUserId) {
      total += Number(rows[i].hours_rendered || 0);
    }
  }

  return total;
}

function getActiveSupervisorAssignments_(supervisorUserId) {
  var targetSupervisorId = String(supervisorUserId || '').trim();
  if (!targetSupervisorId) {
    return [];
  }

  var rows = readSheetObjects_(getSupervisorAssignmentsSheet_());
  return rows.filter(function (row) {
    var status = String(row.status || 'active').trim().toLowerCase();
    return String(row.supervisor_user_id || '').trim() === targetSupervisorId && status !== 'inactive';
  });
}

function isStudentAssignedToSupervisor_(supervisorUserId, studentUserId) {
  var targetStudentId = String(studentUserId || '').trim();
  if (!targetStudentId) {
    return false;
  }

  var assignments = getActiveSupervisorAssignments_(supervisorUserId);
  for (var i = 0; i < assignments.length; i++) {
    if (String(assignments[i].student_user_id || '').trim() === targetStudentId) {
      return true;
    }
  }

  return false;
}

function saveStudentOjtProfile_(rowObject) {
  var sheet = getStudentOjtProfileSheet_();
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

  var sheet = getStudentOjtProfileSheet_();
  var rows = readSheetObjects_(sheet);
  var found = rows.find(function (row) {
    return String(row.user_id || '') === userId;
  });

  if (!found) {
    return null;
  }

  // If start_date is missing, try to get first_login_date from users sheet as fallback
  var startDate = String(found.start_date || '').trim();
  if (!startDate) {
    var userRecord = findUserRecordByUserId_(userId);
    if (userRecord && userRecord.user) {
      startDate = String(userRecord.user.first_login_date || '').slice(0, 10);
    }
  }

  return {
    user_id: String(found.user_id || ''),
    total_ojt_hours: Number(found.total_ojt_hours || 0),
    start_date: startDate,
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

function formatDateValue_(value) {
  var dateStr = String(value || '').trim();
  if (!dateStr) return '';
  
  // If it looks like a Date object's toString(), extract date portion
  if (dateStr.includes('GMT') || dateStr.length > 20) {
    try {
      var date = new Date(value);
      if (!isNaN(date.getTime())) {
        var year = date.getFullYear();
        var month = String(date.getMonth() + 1).padStart(2, '0');
        var day = String(date.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
      }
    } catch (e) {}
  }
  
  // If it's already in YYYY-MM-DD format, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  return dateStr;
}

function getSheet_(sheetName) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }
  return sheet;
}

function getOrCreateSheetWithHeaders_(sheetName, headers) {
  var spreadsheet = getSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  var expectedHeaders = Array.isArray(headers) ? headers : [];
  if (expectedHeaders.length) {
    if (sheet.getLastColumn() === 0) {
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    } else if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    }

    ensureSheetColumns_(sheet, expectedHeaders);
  }

  return sheet;
}

function getTimeLogsSheet_() {
  return getOrCreateSheetWithHeaders_(TIME_LOGS_SHEET_, TIME_LOGS_HEADERS_);
}

function getSupervisorAssignmentsSheet_() {
  return getOrCreateSheetWithHeaders_(SUPERVISOR_ASSIGNMENTS_SHEET_, SUPERVISOR_ASSIGNMENTS_HEADERS_);
}

function getStudentOjtProfileSheet_() {
  return getOrCreateSheetWithHeaders_(STUDENT_OJT_PROFILE_SHEET_, STUDENT_OJT_PROFILE_HEADERS_);
}

function getRequestsSheet_() {
  return getOrCreateSheetWithHeaders_(REQUESTS_SHEET_, REQUESTS_HEADERS_);
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
  var existingRow = getSheetValues_(sheet)[rowIndex - 1]; // Get the actual row (0-indexed)
  
  if (!existingRow) {
    throw new Error('Row ' + rowIndex + ' does not exist.');
  }
  
  var row = headers.map(function (header, colIndex) {
    var normalized = normalizeHeader_(header);
    
    // Check if the object has a value for this header
    if (Object.prototype.hasOwnProperty.call(obj, normalized)) {
      return obj[normalized];
    }
    if (Object.prototype.hasOwnProperty.call(obj, header)) {
      return obj[header];
    }
    
    // IMPORTANT: Keep existing data, don't overwrite with empty string
    return existingRow[colIndex] || '';
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

function sanitizeObjectForClient_(obj) {
  var clean = {};
  if (!obj || typeof obj !== 'object') {
    return clean;
  }

  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clean[key] = serializeCellValue_(obj[key]);
    }
  }

  return clean;
}

function serializeCellValue_(value) {
  if (value === null || typeof value === 'undefined') {
    return '';
  }

  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) {
      return '';
    }
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  return String(value);
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

// Document Management Functions
var DOCUMENTS_SHEET_ = 'documents';
var DOCUMENTS_HEADERS_ = ['id', 'user_id', 'name', 'folder', 'category', 'type', 'size', 'url', 'is_link', 'uploaded_date', 'access_level', 'shared_with', 'created_by', 'created_date'];

function handleGetAllDocuments_(payload) {
  try {
    var userId = String(payload.user_id || '').trim();
    if (!userId) {
      return { ok: false, error: 'Missing user_id.' };
    }

    var sheet = getSheet_(DOCUMENTS_SHEET_);
    if (!sheet) {
      return { ok: false, error: 'Documents sheet not found.' };
    }

    var data = sheet.getDataRange().getValues();
    var headers = data[0] || [];
    var documents = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var doc = {
        id: row[0],
        user_id: row[1],
        name: row[2],
        folder: row[3],
        category: row[4],
        type: row[5],
        size: row[6],
        url: row[7],
        is_link: row[8],
        uploaded_date: row[9],
        access_level: row[10],
        shared_with: row[11] ? JSON.parse(String(row[11])) : [],
        created_by: row[12],
        created_date: row[13]
      };

      if (doc.user_id === userId) {
        documents.push(doc);
      }
    }

    return { ok: true, documents: documents };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

function handleUploadDocument_(payload) {
  try {
    var userId = String(payload.user_id || '').trim();
    var name = String(payload.name || '').trim();
    var folder = String(payload.folder || '/').trim();
    var category = String(payload.category || 'Other').trim();
    var type = String(payload.type || 'file').trim();
    var size = String(payload.size || '0').trim();
    var url = String(payload.url || '#').trim();
    var isLink = Boolean(payload.is_link || false);
    var uploadedDate = String(payload.uploaded_date || new Date().toISOString().split('T')[0]).trim();

    if (!userId || !name) {
      return { ok: false, error: 'Missing user_id or name.' };
    }

    var docId = 'doc' + Date.now();
    var sheet = getSheet_(DOCUMENTS_SHEET_);
    if (!sheet) {
      sheet = createSheet_(DOCUMENTS_SHEET_, DOCUMENTS_HEADERS_);
    }

    var newRow = [
      docId,
      userId,
      name,
      folder,
      category,
      type,
      size,
      url,
      isLink ? 'true' : 'false',
      uploadedDate,
      'private',
      '[]',
      userId,
      new Date().toISOString().split('T')[0]
    ];

    sheet.appendRow(newRow);

    return {
      ok: true,
      document: {
        id: docId,
        user_id: userId,
        name: name,
        folder: folder,
        category: category,
        type: type,
        size: size,
        url: url,
        is_link: isLink,
        uploaded_date: uploadedDate,
        access_level: 'private',
        shared_with: [],
        created_by: userId,
        created_date: new Date().toISOString().split('T')[0]
      }
    };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

function handleDeleteDocument_(payload) {
  try {
    var docId = String(payload.doc_id || '').trim();
    var userId = String(payload.user_id || '').trim();

    if (!docId || !userId) {
      return { ok: false, error: 'Missing doc_id or user_id.' };
    }

    var sheet = getSheet_(DOCUMENTS_SHEET_);
    if (!sheet) {
      return { ok: false, error: 'Documents sheet not found.' };
    }

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (row[0] === docId && row[1] === userId) {
        sheet.deleteRow(i + 1);
        return { ok: true, message: 'Document deleted.' };
      }
    }

    return { ok: false, error: 'Document not found.' };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

function handleShareDocument_(payload) {
  try {
    var docId = String(payload.doc_id || '').trim();
    var userId = String(payload.user_id || '').trim();
    var email = String(payload.email || '').trim();
    var role = String(payload.role || 'Viewer').trim();

    if (!docId || !userId || !email) {
      return { ok: false, error: 'Missing docId, userId, or email.' };
    }

    var sheet = getSheet_(DOCUMENTS_SHEET_);
    if (!sheet) {
      return { ok: false, error: 'Documents sheet not found.' };
    }

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (row[0] === docId && row[1] === userId) {
        var sharedWith = row[11] ? JSON.parse(String(row[11])) : [];
        
        // Check if already shared
        var alreadyShared = sharedWith.some(function(s) { return s.email === email; });
        if (!alreadyShared) {
          sharedWith.push({
            email: email,
            role: role,
            sharedDate: new Date().toISOString().split('T')[0]
          });
        }

        sheet.getRange(i + 1, 12).setValue(JSON.stringify(sharedWith));
        sheet.getRange(i + 1, 11).setValue('shared');

        return { ok: true, message: 'Document shared.' };
      }
    }

    return { ok: false, error: 'Document not found.' };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

function handleRemoveShare_(payload) {
  try {
    var docId = String(payload.doc_id || '').trim();
    var userId = String(payload.user_id || '').trim();
    var email = String(payload.email || '').trim();

    if (!docId || !userId || !email) {
      return { ok: false, error: 'Missing docId, userId, or email.' };
    }

    var sheet = getSheet_(DOCUMENTS_SHEET_);
    if (!sheet) {
      return { ok: false, error: 'Documents sheet not found.' };
    }

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (row[0] === docId && row[1] === userId) {
        var sharedWith = row[11] ? JSON.parse(String(row[11])) : [];
        sharedWith = sharedWith.filter(function(s) { return s.email !== email; });

        sheet.getRange(i + 1, 12).setValue(JSON.stringify(sharedWith));
        if (sharedWith.length === 0) {
          sheet.getRange(i + 1, 11).setValue('private');
        }

        return { ok: true, message: 'Share removed.' };
      }
    }

    return { ok: false, error: 'Document not found.' };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

function handleCreateFolder_(payload) {
  try {
    var userId = String(payload.user_id || '').trim();
    var folderName = String(payload.folder_name || '').trim();

    if (!userId || !folderName) {
      return { ok: false, error: 'Missing user_id or folder_name.' };
    }

    // For now, folders are managed in the frontend
    // This is a placeholder for future backend folder management
    return {
      ok: true,
      folder: {
        name: folderName,
        user_id: userId,
        path: '/' + folderName,
        created_date: new Date().toISOString().split('T')[0],
        is_default: false
      }
    };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
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
