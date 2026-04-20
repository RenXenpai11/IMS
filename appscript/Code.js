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
var TIME_LOGS_HEADERS_ = ['timelog_id', 'user_id', 'log_date', 'time_in', 'time_out', 'hours_rendered', 'entry_type', 'status', 'notes', 'created_at'];
var ACTIVE_SESSIONS_SHEET_ = 'active_sessions';
var ACTIVE_SESSIONS_HEADERS_ = ['session_id', 'user_id', 'log_date', 'time_in', 'time_out', 'hours_rendered', 'notes', 'created_at'];
var SUPERVISOR_ASSIGNMENTS_SHEET_ = 'supervisor_assignments';
var SUPERVISOR_ASSIGNMENTS_HEADERS_ = ['assignment_id', 'supervisor_user_id', 'student_user_id', 'company', 'department', 'status', 'created_at'];
var STUDENT_OJT_PROFILE_SHEET_ = 'student_ojt_profile';
var STUDENT_OJT_PROFILE_HEADERS_ = ['user_id', 'total_ojt_hours', 'start_date', 'estimated_end_date', 'course', 'school'];
var REQUESTS_SHEET_ = 'requests';
var REQUESTS_HEADERS_ = ['request_id', 'user_id', 'requester_name', 'request_type', 'request_date', 'request_time', 'start_time', 'end_time', 'total_hours', 'reason', 'status', 'rejection_remarks', 'created_at'];
var NOTIFICATIONS_SHEET_ = 'notifications';
var NOTIFICATIONS_HEADERS_ = ['notification_id', 'user_id', 'title', 'description', 'type', 'related_id', 'is_read', 'created_at'];
var USER_SETTINGS_SHEET_ = 'user_settings';
var USER_SETTINGS_HEADERS_ = ['user_id', 'settings_json', 'updated_at'];
var INTERN_SCHEDULES_SHEET_ = 'intern_schedules';
var INTERN_SCHEDULES_HEADERS_ = ['schedule_id', 'intern_id', 'supervisor_id', 'days_off', 'shift_start', 'shift_end', 'created_at', 'updated_at'];

// Default intern work schedule (Monday-Friday, 9am-5pm)
var DEFAULT_WORK_DAYS_ = [1, 2, 3, 4, 5]; // 0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday
var DEFAULT_WORK_START_TIME_ = '09:00'; // 24-hour format
var DEFAULT_WORK_END_TIME_ = '17:00';   // 24-hour format

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

  if (action === 'start_session') {
    return handleStartSession_(payload);
  }

  if (action === 'end_session') {
    return handleEndSession_(payload);
  }

  if (action === 'get_active_session') {
    return handleGetActiveSession_(payload);
  }

  if (action === 'list_students_for_assignment') {
    return handleListStudentsForAssignment_(payload);
  }

  if (action === 'assign_students_to_supervisor') {
    return handleAssignStudentsToSupervisor_(payload);
  }

  if (action === 'save_intern_schedule') {
    return handleSaveInternSchedule_(payload);
  }

  if (action === 'list_supervisor_assigned_students') {
    return handleListSupervisorAssignedStudents_(payload);
  }

  if (action === 'list_supervisor_time_logs') {
    return handleListSupervisorTimeLogs_(payload);
  }

  if (action === 'list_supervisor_active_sessions') {
    return handleListSupervisorActiveSessions_(payload);
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

  if (action === 'get_document_folders') {
    return handleGetDocumentFolders_(payload);
  }

  if (action === 'get_documents_bootstrap_data') {
    return handleGetDocumentsBootstrapData_(payload);
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

  if (action === 'delete_request') {
    return handleDeleteRequest_(payload);
  }

  if (action === 'archive_request') {
    return handleArchiveRequest_(payload);
  }

  if (action === 'delete_archived_request') {
    return handleDeleteArchivedRequest_(payload);
  }

  if (action === 'update_student_ojt_profile') {
    return handleUpdateStudentOjtProfile_(payload);
  }

  if (action === 'list_notifications') {
    return handleListNotifications_(payload);
  }

  if (action === 'mark_notification_read') {
    return handleMarkNotificationRead_(payload);
  }

  if (action === 'mark_all_notifications_read') {
    return handleMarkAllNotificationsRead_(payload);
  }

  if (action === 'list_assigned_student_documents') {
    return handleListAssignedStudentDocuments_(payload);
  }

  if (action === 'debug_sessions_sheet') {
    return handleDebugSessionsSheet_(payload);
  }

  // --- Settings & Role Additions ---
  if (action === 'get_student_supervisor') {
    return handleGetStudentSupervisor_(payload);
  }

  if (action === 'get_notification_preferences') {
    return handleGetNotificationPreferences_(payload);
  }

  if (action === 'update_notification_preferences') {
    return handleUpdateNotificationPreferences_(payload);
  }

  if (action === 'change_password') {
    return handleChangePassword_(payload);
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

  // Get pending requests (Absence and Overtime) for "All" mode calculations
  var requestsResult = handleListRequestsByUser_({ user_id: userId });
  var pendingRequests = [];
  if (requestsResult && requestsResult.ok === true && Array.isArray(requestsResult.requests)) {
    pendingRequests = requestsResult.requests.filter(function(req) {
      return String(req.status || '').toLowerCase() === 'pending';
    });
  }

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
    tasks: tasksResult && tasksResult.ok === true ? tasksResult.tasks : [],
    pending_requests: pendingRequests
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

  MailApp.sendEmail(
    email,
    'Verify your Internship Management System account',
    '',
    {
      htmlBody: buildOtpEmailHtml_(fullName, otpCode, OTP_EXPIRY_MINUTES_),
      name: 'IMS'
    }
  );

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

    MailApp.sendEmail(
      email,
      'Your new OTP for Internship Management System',
      '',
      {
        htmlBody: buildOtpEmailHtml_(String(pending.full_name || 'User'), pendingOtpCode, OTP_EXPIRY_MINUTES_),
        name: 'IMS'
      }
    );

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

  MailApp.sendEmail(
    email,
    'Your new OTP for Internship Management System',
    '',
    {
      htmlBody: buildOtpEmailHtml_(String(record.user.full_name || 'User'), otpCode, OTP_EXPIRY_MINUTES_),
      name: 'IMS'
    }
  );

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
  var entryType = String(payload.entry_type || 'login').trim().toLowerCase(); // 'login' or 'logout'
  var hoursRendered = Number(payload.hours_rendered || 0);
  var status = 'recorded';
  var notes = String(payload.notes || '').trim();
  var timelogId = String(payload.timelog_id || createId_('TL'));
  var createdAt = String(payload.created_at || isoNow_());
  var updateStartDate = payload.updateStartDate === true;

  // Required: user_id, log_date, time_in, entry_type
  if (!userId || !logDate || !timeIn || !entryType) {
    return { ok: false, error: 'user_id, log_date, time_in, and entry_type are required.' };
  }

  // Validate entry_type
  if (entryType !== 'login' && entryType !== 'logout') {
    return { ok: false, error: 'entry_type must be either "login" or "logout".' };
  }

  var userRecord = findUserRecordByUserId_(userId);
  if (!userRecord) {
    return { ok: false, error: 'User not found.' };
  }

  if (!isEmailVerifiedValue_(userRecord.user.email_verified, userRecord.user)) {
    return { ok: false, error: 'Please verify your email before creating a time log.' };
  }

  var sheet = getTimeLogsSheet_();
  var headers = getHeaders_(sheet);
  var values = getSheetValues_(sheet);
  var userIdCol = findColumnIndex_(headers, 'user_id');
  var logDateCol = findColumnIndex_(headers, 'log_date');
  var entryTypeCol = findColumnIndex_(headers, 'entry_type');

  // For logout entries, validate that logout time is provided
  if (entryType === 'logout') {
    if (!timeOut) {
      return { ok: false, error: 'time_out is required for logout entries.' };
    }
    // No need to check for previous login - logout entries contain complete data (time_in + time_out)
  }

  // For login entries, prevent multiple logins without logout
  if (entryType === 'login') {
    // Check for existing unpaired login entry for today
    var hasUnpairedLogin = false;
    for (var i = 1; i < values.length; i++) {
      var rowUserId = String(values[i][userIdCol - 1] || '');
      var rowLogDate = formatCellDate_(values[i][logDateCol - 1]);
      var rowEntryType = String(values[i][entryTypeCol - 1] || 'login').toLowerCase();

      if (rowUserId === userId && rowLogDate === logDate && rowEntryType === 'login') {
        hasUnpairedLogin = true;
        break;
      }
    }

    if (hasUnpairedLogin) {
      return { ok: false, error: 'You are already logged in today. Please log out first before logging in again.' };
    }
  }

  var rowObject = {
    timelog_id: timelogId,
    user_id: userId,
    log_date: logDate,
    time_in: timeIn,
    time_out: timeOut,
    hours_rendered: entryType === 'logout' ? hoursRendered : 0,
    entry_type: entryType,
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
    // Read from active_sessions — completed sessions have time_out filled
    var sheet = getActiveSessionsSheet_();
    var rows = readSheetObjects_(sheet).filter(function (row) {
      var rowUserId = String(serializeCellValue_(row.user_id) || '').trim();
      var timeOut = String(serializeCellValue_(row.time_out) || '').trim();
      return rowUserId === userId && timeOut !== '';
    }).map(function (row) {
      var obj = sanitizeObjectForClient_(row);
      // Normalize log_date so it's always yyyy-MM-dd
      if (obj.log_date instanceof Date) {
        obj.log_date = Utilities.formatDate(obj.log_date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      // Add synthetic fields the frontend expects
      obj.timelog_id = obj.session_id || '';
      obj.entry_type = 'regular';
      obj.status = 'approved';
      return obj;
    }).sort(function (a, b) {
      var dateA = new Date(String(a.created_at || ''));
      var dateB = new Date(String(b.created_at || ''));
      return dateB.getTime() - dateA.getTime();
    });

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

function handleStartSession_(payload) {
  try {
    var userId = String(payload.user_id || '').trim();
    var logDate = String(payload.log_date || '').trim();
    var timeIn = String(payload.time_in || '').trim();

    Logger.log('DEBUG handleStartSession_ - Input: user_id=' + userId + ', log_date=' + logDate + ', time_in=' + timeIn);

    if (!userId || !logDate || !timeIn) {
      return { ok: false, error: 'user_id, log_date, and time_in are required.' };
    }

    var userRecord = findUserRecordByUserId_(userId);
    if (!userRecord) {
      return { ok: false, error: 'User not found.' };
    }

    if (!isEmailVerifiedValue_(userRecord.user.email_verified, userRecord.user)) {
      return { ok: false, error: 'Please verify your email before creating a time log.' };
    }

    // Check if user already has active session for this date
    var sheet = getActiveSessionsSheet_();
    Logger.log('DEBUG handleStartSession_ - Got active_sessions sheet: ' + sheet.getName());
    
    var headers = getHeaders_(sheet);
    var values = getSheetValues_(sheet);
    Logger.log('DEBUG handleStartSession_ - Sheet has ' + values.length + ' rows (including header)');
    
    var userIdCol = findColumnIndex_(headers, 'user_id');
    var logDateCol = findColumnIndex_(headers, 'log_date');

    for (var i = 1; i < values.length; i++) {
      var rowUserId = String(values[i][userIdCol - 1] || '').trim();
      var rowLogDate = formatCellDate_(values[i][logDateCol - 1]);
      if (rowUserId === userId && rowLogDate === logDate) {
        // Session already exists for this date
        return { ok: false, error: 'You already have an active session for today. Please log out first.' };
      }
    }

    var sessionId = createId_('SES');
    var createdAt = isoNow_();

    var sessionRow = {
      session_id: sessionId,
      user_id: userId,
      log_date: logDate,
      time_in: timeIn,
      time_out: '',
      hours_rendered: 0,
      notes: '',
      created_at: createdAt
    };

    Logger.log('DEBUG handleStartSession_ - About to save session: ' + JSON.stringify(sessionRow));
    appendObjectRow_(sheet, sessionRow);
    Logger.log('DEBUG handleStartSession_ - Session saved successfully');

    return {
      ok: true,
      message: 'Session started successfully.',
      session: sessionRow
    };
  } catch (e) {
    Logger.log('ERROR in handleStartSession_: ' + e.toString() + ' | Stack: ' + e.stack);
    return { ok: false, error: 'Error creating session: ' + e.toString() };
  }
}

function handleEndSession_(payload) {
  try {
    var userId = String(payload.user_id || '').trim();
    var logDate = String(payload.log_date || '').trim();
    var timeOut = String(payload.time_out || '').trim();
    var hours = Number(payload.hours_rendered || 0);

    Logger.log('DEBUG handleEndSession_ - Input: user_id=' + userId + ', log_date=' + logDate + ', time_out=' + timeOut);

    if (!userId || !logDate || !timeOut) {
      return { ok: false, error: 'user_id, log_date, and time_out are required.' };
    }

    var userRecord = findUserRecordByUserId_(userId);
    if (!userRecord) {
      return { ok: false, error: 'User not found.' };
    }

    if (!isEmailVerifiedValue_(userRecord.user.email_verified, userRecord.user)) {
      return { ok: false, error: 'Please verify your email before updating a time log.' };
    }

    // Find active session for this user on this date
    var sessionsSheet = getActiveSessionsSheet_();
    Logger.log('DEBUG handleEndSession_ - Got active_sessions sheet: ' + sessionsSheet.getName());
    
    var sessHeaders = getHeaders_(sessionsSheet);
    var sessValues = getSheetValues_(sessionsSheet);
    Logger.log('DEBUG handleEndSession_ - Sheet has ' + sessValues.length + ' rows (including header)');
    
    var userIdCol = findColumnIndex_(sessHeaders, 'user_id');
    var logDateCol = findColumnIndex_(sessHeaders, 'log_date');
    var sessionIdCol = findColumnIndex_(sessHeaders, 'session_id');
    var timeInCol = findColumnIndex_(sessHeaders, 'time_in');
    var timeOutCol = findColumnIndex_(sessHeaders, 'time_out');
    var hoursCol = findColumnIndex_(sessHeaders, 'hours_rendered');

    var sessionRow = -1;
    var sessionId = '';
    var timeIn = '';

    Logger.log('DEBUG handleEndSession_ - Looking for: user_id=' + userId + ', log_date=' + logDate);
    
    for (var i = 1; i < sessValues.length; i++) {
      var rowUserId = String(sessValues[i][userIdCol - 1] || '').trim();
      var rowLogDate = formatCellDate_(sessValues[i][logDateCol - 1]);
      Logger.log('DEBUG handleEndSession_ - Row ' + i + ': user_id=' + rowUserId + ', log_date=' + rowLogDate);
      
      if (rowUserId === userId && rowLogDate === logDate) {
        sessionRow = i + 1; // +1 because sheet rows are 1-indexed (row 1 is header)
        sessionId = String(sessValues[i][sessionIdCol - 1] || '').trim();
        timeIn = String(sessValues[i][timeInCol - 1] || '').trim();
        Logger.log('DEBUG handleEndSession_ - Found session! Row=' + sessionRow + ', session_id=' + sessionId + ', time_in=' + timeIn);
        break;
      }
    }

    if (sessionRow <= 0) {
      Logger.log('DEBUG handleEndSession_ - No session found for user=' + userId + ', date=' + logDate);
      return { ok: false, error: 'No active session found. Please log in first.' };
    }

    // Update the SAME row in active_sessions with time_out, hours, and notes
    Logger.log('DEBUG handleEndSession_ - Updating session row ' + sessionRow + ' with time_out=' + timeOut + ', hours=' + hours);
    
    sessionsSheet.getRange(sessionRow, timeOutCol).setValue(timeOut);
    sessionsSheet.getRange(sessionRow, hoursCol).setValue(hours);
    
    Logger.log('DEBUG handleEndSession_ - Session updated successfully');

    var updatedSession = {
      session_id: sessionId,
      user_id: userId,
      log_date: logDate,
      time_in: timeIn,
      time_out: timeOut,
      hours_rendered: hours,
      created_at: String(sessValues[sessionRow - 1][findColumnIndex_(sessHeaders, 'created_at') - 1] || '')
    };

    return {
      ok: true,
      message: 'Session ended successfully.',
      session: updatedSession
    };
  } catch (e) {
    Logger.log('ERROR in handleEndSession_: ' + e.toString() + ' | Stack: ' + e.stack);
    return { ok: false, error: 'Error ending session: ' + e.toString() };
  }
}

function handleGetActiveSession_(payload) {
  try {
    var userId = String(payload.user_id || '').trim();
    var logDate = String(payload.log_date || '').trim();

    Logger.log('DEBUG handleGetActiveSession_ - Input: user_id=' + userId + ', log_date=' + logDate);

    if (!userId || !logDate) {
      return { ok: false, error: 'user_id and log_date are required.' };
    }

    var sheet = getActiveSessionsSheet_();
    var headers = getHeaders_(sheet);
    var values = getSheetValues_(sheet);

    var userIdCol = findColumnIndex_(headers, 'user_id');
    var logDateCol = findColumnIndex_(headers, 'log_date');

    for (var i = 1; i < values.length; i++) {
      var rowUserId = String(values[i][userIdCol - 1] || '').trim();
      var rowLogDate = formatCellDate_(values[i][logDateCol - 1]);
      
      if (rowUserId === userId && rowLogDate === logDate) {
        // Found active session for this user on this date
        // Build object from row data using headers
        var sessionObj = {};
        for (var j = 0; j < headers.length; j++) {
          sessionObj[headers[j]] = values[i][j] || '';
        }
        
        Logger.log('DEBUG handleGetActiveSession_ - Found session: ' + JSON.stringify(sessionObj));
        
        return {
          ok: true,
          session: sessionObj
        };
      }
    }

    // No active session found
    Logger.log('DEBUG handleGetActiveSession_ - No active session found for user=' + userId + ', date=' + logDate);
    return {
      ok: true,
      session: null
    };
  } catch (e) {
    Logger.log('ERROR in handleGetActiveSession_: ' + e.toString() + ' | Stack: ' + e.stack);
    return { ok: false, error: 'Error retrieving active session: ' + e.toString() };
  }
}

function handleDebugSessionsSheet_(payload) {
  try {
    // Get active_sessions sheet
    var activeSessions = getActiveSessionsSheet_();
    var activeHeaders = getHeaders_(activeSessions);
    var activeValues = getSheetValues_(activeSessions);
    
    // Get time_logs sheet
    var timeLogs = getTimeLogsSheet_();
    var timeHeaders = getHeaders_(timeLogs);
    var timeValues = getSheetValues_(timeLogs);
    
    // Format the data for display
    var activeSessionsData = [];
    for (var i = 1; i < activeValues.length; i++) {
      var row = {};
      for (var j = 0; j < activeHeaders.length; j++) {
        row[activeHeaders[j]] = activeValues[i][j];
      }
      activeSessionsData.push(row);
    }
    
    var timeLogsData = [];
    for (var i = 1; i < timeValues.length; i++) {
      var row = {};
      for (var j = 0; j < timeHeaders.length; j++) {
        row[timeHeaders[j]] = timeValues[i][j];
      }
      timeLogsData.push(row);
    }
    
    return {
      ok: true,
      message: 'Sheet debugging info',
      active_sessions: {
        sheet_name: activeSessions.getName(),
        headers: activeHeaders,
        row_count: activeValues.length - 1,
        data: activeSessionsData
      },
      time_logs: {
        sheet_name: timeLogs.getName(),
        headers: timeHeaders,
        row_count: timeValues.length - 1,
        data: timeLogsData.slice(0, 10)
      }
    };
  } catch (e) {
    Logger.log('ERROR in handleDebugSessionsSheet_: ' + e.toString());
    return { ok: false, error: 'Debug error: ' + e.toString() };
  }
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

function handleSaveInternSchedule_(payload) {
  var supervisorUserId = String(payload.supervisor_user_id || '').trim();
  var internUserId = String(payload.intern_user_id || '').trim();
  var daysOffInput = Array.isArray(payload.days_off) ? payload.days_off : [];
  var shiftStart = String(payload.shift_start || '09:00').trim();
  var shiftEnd = String(payload.shift_end || '17:00').trim();

  if (!supervisorUserId) {
    return { ok: false, error: 'supervisor_user_id is required.' };
  }

  if (!internUserId) {
    return { ok: false, error: 'intern_user_id is required.' };
  }

  var supervisorRecord = findUserRecordByUserId_(supervisorUserId);
  if (!supervisorRecord) {
    return { ok: false, error: 'Supervisor not found.' };
  }

  if (String(supervisorRecord.user.role || '').trim() !== 'Supervisor') {
    return { ok: false, error: 'Only supervisors can save schedules.' };
  }

  // Validate days off (should be numbers 0-6)
  var daysOff = [];
  var seenDays = {};
  for (var i = 0; i < daysOffInput.length; i++) {
    var day = Number(daysOffInput[i]);
    if (!Number.isInteger(day) || day < 0 || day > 6 || seenDays[day]) {
      continue;
    }
    seenDays[day] = true;
    daysOff.push(day);
  }

  // Sort days off for consistency
  daysOff.sort(function(a, b) { return a - b; });

  var sheet = getSheet_(INTERN_SCHEDULES_SHEET_);
  var headers = getHeaders_(sheet);
  
  // Ensure required columns exist
  if (!headers || headers.length === 0) {
    appendHeaders_(sheet, INTERN_SCHEDULES_HEADERS_);
  }

  var internIdCol = findColumnIndex_(headers, 'intern_id');
  var supervisorIdCol = findColumnIndex_(headers, 'supervisor_id');
  var values = getSheetValues_(sheet);

  // Find and delete existing schedule for this intern (if any)
  var rowsToDelete = [];
  for (var rowIndex = 1; rowIndex < values.length; rowIndex++) {
    var rowInternId = String(values[rowIndex][internIdCol - 1] || '').trim();
    var rowSupervisorId = String(values[rowIndex][supervisorIdCol - 1] || '').trim();
    if (rowInternId === internUserId && rowSupervisorId === supervisorUserId) {
      rowsToDelete.push(rowIndex + 1);
    }
  }

  // Delete old records
  for (var r = rowsToDelete.length - 1; r >= 0; r--) {
    sheet.deleteRow(rowsToDelete[r]);
  }

  // Add new schedule record
  var now = isoNow_();
  appendObjectRow_(sheet, {
    schedule_id: createId_('SCH'),
    intern_id: internUserId,
    supervisor_id: supervisorUserId,
    days_off: JSON.stringify(daysOff),
    shift_start: shiftStart,
    shift_end: shiftEnd,
    created_at: now,
    updated_at: now,
  });

  return {
    ok: true,
    message: 'Schedule saved successfully.',
    schedule_id: createId_('SCH'),
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

  // Load intern schedules for all student IDs
  var scheduleSheet = getInternSchedulesSheet_();
  var scheduleRows = getSheetValues_(scheduleSheet);
  var scheduleHeaders = getHeaders_(scheduleSheet);
  var internIdColIndex = findColumnIndex_(scheduleHeaders, 'intern_id');
  var supervisorIdColIndex = findColumnIndex_(scheduleHeaders, 'supervisor_id');
  var shiftStartColIndex = findColumnIndex_(scheduleHeaders, 'shift_start');
  var shiftEndColIndex = findColumnIndex_(scheduleHeaders, 'shift_end');
  var daysOffColIndex = findColumnIndex_(scheduleHeaders, 'days_off');

  var schedulesByIntern = {};
  for (var s = 1; s < scheduleRows.length; s++) {
    var internId = String(scheduleRows[s][internIdColIndex - 1] || '').trim();
    var supId = String(scheduleRows[s][supervisorIdColIndex - 1] || '').trim();
    
    // Only include schedules for this supervisor
    if (internId && supId === supervisorUserId) {
      schedulesByIntern[internId] = {
        shift_start: String(scheduleRows[s][shiftStartColIndex - 1] || '').trim(),
        shift_end: String(scheduleRows[s][shiftEndColIndex - 1] || '').trim(),
        days_off: String(scheduleRows[s][daysOffColIndex - 1] || '').trim(),
      };
    }
  }

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
    
    // Get schedule data if it exists
    var scheduleData = schedulesByIntern[assignmentStudentId] || {};

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
      shift_start: scheduleData.shift_start || '',
      shift_end: scheduleData.shift_end || '',
      days_off: scheduleData.days_off || '',
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

function handleListSupervisorActiveSessions_(payload) {
  var supervisorUserId = String(payload.supervisor_user_id || '').trim();

  if (!supervisorUserId) {
    return { ok: false, error: 'supervisor_user_id is required.' };
  }

  var supervisorRecord = findUserRecordByUserId_(supervisorUserId);
  if (!supervisorRecord) {
    return { ok: false, error: 'Supervisor not found.' };
  }

  if (String(supervisorRecord.user.role || '').trim() !== 'Supervisor') {
    return { ok: false, error: 'Only supervisors can view active sessions.' };
  }

  // Get all students assigned to this supervisor
  var assignmentsSheet = getSheet_('supervisor_student_assignments');
  var assignmentRows = readSheetObjects_(assignmentsSheet);
  var assignedStudentIds = assignmentRows
    .filter(function (row) {
      return String(row.supervisor_user_id || '').trim() === supervisorUserId;
    })
    .map(function (row) {
      return String(row.student_user_id || '').trim();
    });

  // Get active sessions for these students (today's date)
  var todayDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var sessionsSheet = getActiveSessionsSheet_();
  var sessionRows = readSheetObjects_(sessionsSheet)
    .filter(function (row) {
      var studentId = String(row.user_id || '').trim();
      var logDate = String(row.log_date || '').trim();
      return assignedStudentIds.indexOf(studentId) >= 0 && logDate === todayDate && !row.time_out;
    })
    .map(function (row) {
      return sanitizeObjectForClient_(row);
    });

  return { ok: true, active_sessions: sessionRows };
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
  var startTime = String(payload.start_time || '').trim();
  var endTime = String(payload.end_time || '').trim();
  var totalHours = Number(payload.total_hours || 0);
  var reason = String(payload.reason || '').trim();

  if (!userId || !requestType || !requestDate || !reason) {
    return { ok: false, error: 'Missing required fields: user_id, request_type, request_date, reason' };
  }

  var requesterRecord = findUserRecordByUserId_(userId);
  if (!requesterRecord) {
    return { ok: false, error: 'User not found.' };
  }

  var requesterRole = String(requesterRecord.user.role || '').trim().toLowerCase();
  if (requesterRole === 'supervisor') {
    return { ok: false, error: 'Supervisor accounts cannot create requests.' };
  }

  if (!requesterName) {
    requesterName = String(requesterRecord.user.full_name || '').trim() || 'Student';
  }

  // Overtime-specific validation
  if (requestType === 'Overtime') {
    if (!startTime || !endTime) {
      return { ok: false, error: 'Start time and end time are required for overtime requests.' };
    }

    // Check if overtime overlaps with default work schedule
    var overlapError = checkOvertimeScheduleOverlap_(requestDate, startTime, endTime);
    if (overlapError) {
      return { ok: false, error: overlapError };
    }
  }

  // Absence-specific validation
  if (requestType === 'Absence') {
    var absenceError = checkAbsenceOnWeekend_(requestDate);
    if (absenceError) {
      return { ok: false, error: absenceError };
    }
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
    } else if (header === 'start_time') {
      row.push(startTime);
    } else if (header === 'end_time') {
      row.push(endTime);
    } else if (header === 'total_hours') {
      row.push(totalHours);
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

  // Notify the student's assigned supervisor
  var supervisorUserId = findSupervisorForStudent_(userId);
  if (supervisorUserId) {
    createNotification_(
      supervisorUserId,
      'New ' + requestType + ' Request',
      (requesterName || 'A student') + ' submitted a new ' + requestType.toLowerCase() + ' request for ' + requestDate + '.',
      'request',
      requestId
    );

    try {
      sendSupervisorRequestEmail_(supervisorUserId, {
        requestId: requestId,
        requesterName: requesterName,
        requestType: requestType,
        requestDate: requestDate,
        reason: reason,
        startTime: startTime,
        endTime: endTime,
        totalHours: totalHours,
      });
    } catch (mailErr) {
      Logger.log('Unable to send supervisor request email: ' + (mailErr && mailErr.message ? mailErr.message : String(mailErr)));
    }
  }

  return {
    ok: true,
    request: {
      id: requestId,
      requestType: requestType,
      date: requestDate,
      time: requestTime,
      start_time: startTime,
      end_time: endTime,
      total_hours: totalHours,
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
        start_time: String(row.start_time || ''),
        end_time: String(row.end_time || ''),
        total_hours: Number(row.total_hours || 0),
        reason: String(row.reason || ''),
        status: String(row.status || 'Pending'),
        requester_name: String(row.requester_name || ''),
        created_at: String(row.created_at || ''),
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

  var supervisorRecord = findUserRecordByUserId_(supervisorUserId);
  if (!supervisorRecord) {
    return { ok: false, error: 'Supervisor not found.' };
  }

  if (String(supervisorRecord.user.role || '').trim().toLowerCase() !== 'supervisor') {
    return { ok: false, error: 'Only supervisors can view assigned student requests.' };
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
        start_time: String(row.start_time || ''),
        end_time: String(row.end_time || ''),
        total_hours: Number(row.total_hours || 0),
        reason: String(row.reason || ''),
        status: String(row.status || 'Pending'),
        requester_name: String(row.requester_name || ''),
        created_at: String(row.created_at || ''),
        archived: row.archived === 'true' || row.archived === true,
      });
    }
  }

  return { ok: true, requests: studentRequests };
}

function handleUpdateRequestStatus_(payload) {
  var requestId = String(payload.request_id || '').trim();
  var newStatus = String(payload.status || '').trim();
  var supervisorUserId = String(payload.supervisor_user_id || '').trim();
  var rejectionRemarks = String(payload.rejection_remarks || '').trim();

  if (!requestId || !newStatus || !supervisorUserId) {
    return { ok: false, error: 'request_id, status, and supervisor_user_id are required.' };
  }

  var supervisorRecord = findUserRecordByUserId_(supervisorUserId);
  if (!supervisorRecord) {
    return { ok: false, error: 'Supervisor not found.' };
  }

  if (String(supervisorRecord.user.role || '').trim().toLowerCase() !== 'supervisor') {
    return { ok: false, error: 'Only supervisors can update request status.' };
  }

  var sheet = getRequestsSheet_();
  var rows = getSheetValues_(sheet);
  var headers = getHeaders_(sheet);
  var requestIdColIndex = findColumnIndex_(headers, 'request_id');
  var updateColIndex = findColumnIndex_(headers, 'status');
  var rejectionRemarksColIndex = findColumnIndex_(headers, 'rejection_remarks');
  var userIdColIndex = findColumnIndex_(headers, 'user_id');
  var requestTypeColIndex = findColumnIndex_(headers, 'request_type');
  var requesterNameColIndex = findColumnIndex_(headers, 'requester_name');

  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][requestIdColIndex - 1] || '').trim() === requestId) {
      var studentUserId = String(rows[i][userIdColIndex - 1] || '').trim();
      if (!isStudentAssignedToSupervisor_(supervisorUserId, studentUserId)) {
        return { ok: false, error: 'You are not assigned to this student request.' };
      }

      sheet.getRange(i + 1, updateColIndex, 1, 1).setValue(newStatus);
      
      // Store rejection remarks if rejecting
      if (rejectionRemarksColIndex > 0 && newStatus.toLowerCase() === 'rejected' && rejectionRemarks) {
        sheet.getRange(i + 1, rejectionRemarksColIndex, 1, 1).setValue(rejectionRemarks);
      }

      // Notify the student who created the request
      var requestType = String(rows[i][requestTypeColIndex - 1] || '').trim();
      if (studentUserId) {
        var notifType = newStatus.toLowerCase() === 'approved' ? 'approval' : 'rejection';
        var notifMessage = 'Your ' + requestType.toLowerCase() + ' request has been ' + newStatus.toLowerCase() + '.';
        if (newStatus.toLowerCase() === 'rejected' && rejectionRemarks) {
          notifMessage += ' Remarks: ' + rejectionRemarks;
        }
        createNotification_(
          studentUserId,
          requestType + ' Request ' + newStatus,
          notifMessage,
          notifType,
          requestId
        );
      }

      return { ok: true, message: 'Request status updated.' };
    }
  }

  return { ok: false, error: 'Request not found.' };
}

function handleDeleteRequest_(payload) {
  var requestId = String(payload.request_id || '').trim();

  if (!requestId) {
    return { ok: false, error: 'request_id is required.' };
  }

  try {
    var sheet = getRequestsSheet_();
    var rows = getSheetValues_(sheet);
    var headers = getHeaders_(sheet);
    var requestIdColIndex = findColumnIndex_(headers, 'request_id');

    // Find the row with matching request_id
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][requestIdColIndex - 1] || '').trim() === requestId) {
        // Delete the row (row numbers are 1-indexed)
        sheet.deleteRow(i + 1);
        return { ok: true, message: 'Request deleted permanently.' };
      }
    }

    return { ok: false, error: 'Request not found.' };
  } catch (e) {
    Logger.log('ERROR in handleDeleteRequest_: ' + e.toString());
    return { ok: false, error: 'Error deleting request: ' + e.toString() };
  }
  var userId = String(payload.user_id || '').trim();

  if (!requestId || !userId) {
    return { ok: false, error: 'request_id and user_id are required.' };
  }

  var requesterRecord = findUserRecordByUserId_(userId);
  if (!requesterRecord) {
    return { ok: false, error: 'User not found.' };
  }

  if (String(requesterRecord.user.role || '').trim().toLowerCase() === 'supervisor') {
    return { ok: false, error: 'Supervisor accounts cannot delete requests.' };
  }

  var sheet = getRequestsSheet_();
  var headers = getHeaders_(sheet);
  var values = getSheetValues_(sheet);
  var requestIdColIndex = findColumnIndex_(headers, 'request_id');
  var userIdColIndex = findColumnIndex_(headers, 'user_id');
  var statusColIndex = findColumnIndex_(headers, 'status');

  if (requestIdColIndex === 0 || userIdColIndex === 0 || statusColIndex === 0) {
    throw new Error('requests sheet must include request_id, user_id, and status columns.');
  }

  var rowIndex = -1;
  var requestStatus = '';

  for (var i = 1; i < values.length; i++) {
    var rowRequestId = String(values[i][requestIdColIndex - 1] || '').trim();
    var rowUserId = String(values[i][userIdColIndex - 1] || '').trim();

    if (rowRequestId === requestId && rowUserId === userId) {
      rowIndex = i + 1;
      requestStatus = String(values[i][statusColIndex - 1] || '').trim();
      break;
    }
  }

  if (rowIndex <= 0) {
    return { ok: false, error: 'Request not found.' };
  }

  if (requestStatus.toLowerCase() !== 'pending') {
    return { ok: false, error: 'Only pending requests can be deleted.' };
  }

  sheet.deleteRow(rowIndex);
  return { ok: true, message: 'Request deleted successfully.' };
}

function handleArchiveRequest_(payload) {
  var requestId = String(payload.request_id || '').trim();

  if (!requestId) {
    return { ok: false, error: 'request_id is required.' };
  }

  try {
    var sheet = getRequestsSheet_();
    var rows = getSheetValues_(sheet);
    var headers = getHeaders_(sheet);
    var requestIdColIndex = findColumnIndex_(headers, 'request_id');
    var archivedColIndex = findColumnIndex_(headers, 'archived');

    // If archived column doesn't exist, add it to the header row
    if (archivedColIndex === 0) {
      var lastCol = sheet.getLastColumn();
      sheet.getRange(1, lastCol + 1).setValue('archived');
      archivedColIndex = lastCol + 1;
    }

    // Find the row with matching request_id
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][requestIdColIndex - 1] || '').trim() === requestId) {
        // Toggle archived status
        var currentValue = String(rows[i][archivedColIndex - 1] || '').trim();
        var newValue = currentValue === 'true' ? 'false' : 'true';
        sheet.getRange(i + 1, archivedColIndex).setValue(newValue);
        return { ok: true, message: 'Request status updated successfully.' };
      }
    }

    return { ok: false, error: 'Request not found.' };
  } catch (e) {
    Logger.log('ERROR in handleArchiveRequest_: ' + e.toString());
    return { ok: false, error: 'Error archiving request: ' + e.toString() };
  }
}

function handleDeleteArchivedRequest_(payload) {
  var requestId = String(payload.request_id || '').trim();

  if (!requestId) {
    return { ok: false, error: 'request_id is required.' };
  }

  try {
    var sheet = getRequestsSheet_();
    var rows = getSheetValues_(sheet);
    var headers = getHeaders_(sheet);
    var requestIdColIndex = findColumnIndex_(headers, 'request_id');

    // Find the row with matching request_id (search from end to avoid index issues)
    for (var i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][requestIdColIndex - 1] || '').trim() === requestId) {
        // Delete the row (row numbers are 1-indexed, add 1 for header row)
        sheet.deleteRow(i + 1);
        return { ok: true, message: 'Request deleted permanently.' };
      }
    }

    return { ok: false, error: 'Request not found.' };
  } catch (e) {
    Logger.log('ERROR in handleDeleteArchivedRequest_: ' + e.toString());
    return { ok: false, error: 'Error deleting request: ' + e.toString() };
  }
}

function handleUpdateStudentOjtProfile_(payload) {
  var userId = String(payload.user_id || '').trim();
  var estimatedEndDate = String(payload.estimated_end_date || '').trim();

  if (!userId) {
    return { ok: false, error: 'user_id is required.' };
  }

  if (!estimatedEndDate) {
    return { ok: false, error: 'estimated_end_date is required.' };
  }

  try {
    var sheet = getStudentOjtProfileSheet_();
    var rows = getSheetValues_(sheet);
    var headers = getHeaders_(sheet);
    var userIdColIndex = findColumnIndex_(headers, 'user_id');
    var estimatedEndDateColIndex = findColumnIndex_(headers, 'estimated_end_date');

    if (userIdColIndex === 0 || estimatedEndDateColIndex === 0) {
      return { ok: false, error: 'Student OJT Profile sheet must include user_id and estimated_end_date columns.' };
    }

    // Find the row with matching user_id
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][userIdColIndex - 1] || '').trim() === userId) {
        // Update the estimated_end_date
        sheet.getRange(i + 1, estimatedEndDateColIndex).setValue(estimatedEndDate);
        return { ok: true, message: 'Student OJT profile updated successfully.' };
      }
    }

    // If user not found, create a new row
    var newRow = [];
    for (var j = 0; j < headers.length; j++) {
      if (j === userIdColIndex - 1) {
        newRow.push(userId);
      } else if (j === estimatedEndDateColIndex - 1) {
        newRow.push(estimatedEndDate);
      } else {
        newRow.push('');
      }
    }
    sheet.appendRow(newRow);
    return { ok: true, message: 'Student OJT profile created and updated successfully.' };
  } catch (e) {
    Logger.log('ERROR in handleUpdateStudentOjtProfile_: ' + e.toString());
    return { ok: false, error: 'Error updating profile: ' + e.toString() };
  }
}

// --- Notification handlers ---
function handleListNotifications_(payload) {
  var userId = String(payload.user_id || '').trim();
  if (!userId) {
    return { ok: false, error: 'user_id is required.' };
  }

  try {
    var sheet = getNotificationsSheet_();
    var rows = readSheetObjects_(sheet)
      .filter(function (row) {
        return String(serializeCellValue_(row.user_id) || '').trim() === userId;
      })
      .sort(function (a, b) {
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      })
      .slice(0, 50)
      .map(function (row) {
        return {
          id: String(serializeCellValue_(row.notification_id) || ''),
          title: String(serializeCellValue_(row.title) || ''),
          description: String(serializeCellValue_(row.description) || ''),
          type: String(serializeCellValue_(row.type) || 'system'),
          related_id: String(serializeCellValue_(row.related_id) || ''),
          unread: String(serializeCellValue_(row.is_read) || '').toLowerCase() !== 'true',
          time: formatRelativeTime_(serializeCellValue_(row.created_at)),
          created_at: String(serializeCellValue_(row.created_at) || '')
        };
      });

    return { ok: true, notifications: rows };
  } catch (err) {
    var message = err && err.message ? err.message : String(err);
    if (String(message).indexOf('Sheet not found') === 0) {
      return { ok: true, notifications: [] };
    }
    return { ok: false, error: 'Unable to load notifications. ' + message };
  }
}

function handleMarkNotificationRead_(payload) {
  var notificationId = String(payload.notification_id || '').trim();
  if (!notificationId) {
    return { ok: false, error: 'notification_id is required.' };
  }

  var sheet = getNotificationsSheet_();
  var headers = getHeaders_(sheet);
  var values = getSheetValues_(sheet);
  var notifIdCol = findColumnIndex_(headers, 'notification_id');
  var isReadCol = findColumnIndex_(headers, 'is_read');

  if (notifIdCol === 0 || isReadCol === 0) {
    return { ok: false, error: 'Notifications sheet is missing required columns.' };
  }

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][notifIdCol - 1] || '').trim() === notificationId) {
      sheet.getRange(i + 1, isReadCol, 1, 1).setValue('true');
      return { ok: true, message: 'Notification marked as read.' };
    }
  }

  return { ok: false, error: 'Notification not found.' };
}

function handleMarkAllNotificationsRead_(payload) {
  var userId = String(payload.user_id || '').trim();
  if (!userId) {
    return { ok: false, error: 'user_id is required.' };
  }

  var sheet = getNotificationsSheet_();
  var headers = getHeaders_(sheet);
  var values = getSheetValues_(sheet);
  var userIdCol = findColumnIndex_(headers, 'user_id');
  var isReadCol = findColumnIndex_(headers, 'is_read');

  if (userIdCol === 0 || isReadCol === 0) {
    return { ok: false, error: 'Notifications sheet is missing required columns.' };
  }

  var updated = 0;
  for (var i = 1; i < values.length; i++) {
    var rowUserId = String(values[i][userIdCol - 1] || '').trim();
    var isRead = String(values[i][isReadCol - 1] || '').trim().toLowerCase();
    if (rowUserId === userId && isRead !== 'true') {
      sheet.getRange(i + 1, isReadCol, 1, 1).setValue('true');
      updated++;
    }
  }

  return { ok: true, message: updated + ' notifications marked as read.' };
}

function createNotification_(userId, title, description, type, relatedId) {
  var sheet = getNotificationsSheet_();
  appendObjectRow_(sheet, {
    notification_id: createId_('NOTIF'),
    user_id: userId,
    title: title,
    description: description,
    type: type || 'system',
    related_id: relatedId || '',
    is_read: 'false',
    created_at: isoNow_()
  });
}

function getAppBaseUrl_() {
  var configured = String(PropertiesService.getScriptProperties().getProperty('APP_BASE_URL') || '').trim();
  if (configured) {
    return configured;
  }

  try {
    var serviceUrl = String(ScriptApp.getService().getUrl() || '').trim();
    if (serviceUrl) {
      return serviceUrl;
    }
  } catch (err) {
    // Ignore and use empty fallback.
  }

  return '';
}

function buildRequestDeepLinkUrl_(requestId) {
  var baseUrl = getAppBaseUrl_();
  if (!baseUrl) {
    return '';
  }

  var params = ['page=requests'];
  var cleanRequestId = String(requestId || '').trim();
  if (cleanRequestId) {
    params.push('requestId=' + encodeURIComponent(cleanRequestId));
  }

  var separator = baseUrl.indexOf('?') === -1 ? '?' : '&';
  return baseUrl + separator + params.join('&');
}

function buildRequestEmailText_(requestDetails, deepLinkUrl) {
  var lines = [
    'A new request has been submitted.',
    '',
    'Student: ' + String(requestDetails.requesterName || 'Student'),
    'Request Type: ' + String(requestDetails.requestType || ''),
    'Date: ' + String(requestDetails.requestDate || ''),
    'Reason/Notes: ' + String(requestDetails.reason || ''),
  ];

  var requestType = String(requestDetails.requestType || '').trim().toLowerCase();
  if (requestType === 'overtime') {
    lines.push('Start Time: ' + String(requestDetails.startTime || '-'));
    lines.push('End Time: ' + String(requestDetails.endTime || '-'));
    lines.push('Total Hours: ' + String(requestDetails.totalHours || 0));
  }

  if (deepLinkUrl) {
    lines.push('');
    lines.push('View Request: ' + deepLinkUrl);
  }

  return lines.join('\n');
}

function buildRequestEmailHtml_(requestDetails, deepLinkUrl) {
  var requestType = String(requestDetails.requestType || '').trim();
  var reasonHtml = escapeHtml_(String(requestDetails.reason || '')).replace(/\n/g, '<br>');
  var overtimeRows = '';

  if (requestType.toLowerCase() === 'overtime') {
    overtimeRows = [
      '<tr><td style="padding:6px 0;color:#475569;font-weight:600;">Start Time</td><td style="padding:6px 0;color:#0f172a;">' + escapeHtml_(requestDetails.startTime || '-') + '</td></tr>',
      '<tr><td style="padding:6px 0;color:#475569;font-weight:600;">End Time</td><td style="padding:6px 0;color:#0f172a;">' + escapeHtml_(requestDetails.endTime || '-') + '</td></tr>',
      '<tr><td style="padding:6px 0;color:#475569;font-weight:600;">Total Hours</td><td style="padding:6px 0;color:#0f172a;">' + escapeHtml_(String(requestDetails.totalHours || 0)) + '</td></tr>',
    ].join('');
  }

  var actionBlock = deepLinkUrl
    ? '<a href="' + deepLinkUrl + '" style="display:inline-block;margin-top:14px;padding:10px 16px;background:#0f6cbd;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;">View Request</a>'
    : '<p style="margin:14px 0 0;color:#64748b;font-size:13px;">Request link unavailable. Open the IMS app and go to Requests.</p>';

  return [
    '<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.45">',
    '<h2 style="margin:0 0 12px;color:#1d4ed8;">Internship Management System</h2>',
    '<p style="margin:0 0 12px;">A new request has been submitted and is waiting for your review.</p>',
    '<table style="border-collapse:collapse;min-width:320px;">',
    '<tr><td style="padding:6px 0;color:#475569;font-weight:600;">Student</td><td style="padding:6px 0;color:#0f172a;">' + escapeHtml_(requestDetails.requesterName || 'Student') + '</td></tr>',
    '<tr><td style="padding:6px 0;color:#475569;font-weight:600;">Request Type</td><td style="padding:6px 0;color:#0f172a;">' + escapeHtml_(requestType) + '</td></tr>',
    '<tr><td style="padding:6px 0;color:#475569;font-weight:600;">Date</td><td style="padding:6px 0;color:#0f172a;">' + escapeHtml_(requestDetails.requestDate || '') + '</td></tr>',
    '<tr><td style="padding:6px 0;color:#475569;font-weight:600;vertical-align:top;">Reason/Notes</td><td style="padding:6px 0;color:#0f172a;">' + reasonHtml + '</td></tr>',
    overtimeRows,
    '</table>',
    actionBlock,
    '<p style="margin:14px 0 0;color:#64748b;font-size:12px;">If you are not logged in, you will be redirected to login first, then back to Requests.</p>',
    '</div>',
  ].join('');
}

function sendSupervisorRequestEmail_(supervisorUserId, requestDetails) {
  var supervisorRecord = findUserRecordByUserId_(supervisorUserId);
  if (!supervisorRecord) {
    return;
  }

  var supervisorEmail = normalizeEmail_(supervisorRecord.user.email);
  if (!supervisorEmail) {
    return;
  }

  var deepLinkUrl = buildRequestDeepLinkUrl_(requestDetails.requestId);
  var subject = 'New ' + String(requestDetails.requestType || 'Request') + ' Request - ' + String(requestDetails.requesterName || 'Student');

  MailApp.sendEmail(
    supervisorEmail,
    subject,
    buildRequestEmailText_(requestDetails, deepLinkUrl),
    {
      htmlBody: buildRequestEmailHtml_(requestDetails, deepLinkUrl),
      name: 'IMS'
    }
  );
}

// Validates that overtime doesn't overlap with default work schedule (Mon-Fri, 9am-5pm)
function checkOvertimeScheduleOverlap_(requestDate, startTime, endTime) {
  // Parse the date to check what day of week it is
  var dateObj = new Date(requestDate + 'T00:00:00');
  var dayOfWeek = dateObj.getDay(); // 0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday

  // Check if the requested date is a work day (Monday-Friday)
  if (DEFAULT_WORK_DAYS_.indexOf(dayOfWeek) === -1) {
    // It's a weekend, no conflict with default work schedule
    return '';
  }

  // It's a work day, check if overtime overlaps with 9am-5pm
  var overtimeStart = timeToMinutes_(startTime);
  var overtimeEnd = timeToMinutes_(endTime);
  var workStart = timeToMinutes_(DEFAULT_WORK_START_TIME_);
  var workEnd = timeToMinutes_(DEFAULT_WORK_END_TIME_);

  // Check for overlap: if overtime is completely outside work hours, it's OK
  // Overlap occurs if: overtimeStart < workEnd AND overtimeEnd > workStart
  if (overtimeStart < workEnd && overtimeEnd > workStart) {
    return 'Overtime cannot be scheduled during default work hours (9:00 AM - 5:00 PM on weekdays). Please schedule overtime outside these hours.';
  }

  return '';
}

// Helper function to convert HH:MM time string to minutes since midnight
function timeToMinutes_(timeStr) {
  var parts = String(timeStr || '').split(':');
  var hours = Number(parts[0] || 0);
  var minutes = Number(parts[1] || 0);
  return hours * 60 + minutes;
}

// Validates that absence is not requested on a weekend (Saturday or Sunday)
function checkAbsenceOnWeekend_(requestDate) {
  var dateObj = new Date(requestDate + 'T00:00:00');
  var dayOfWeek = dateObj.getDay(); // 0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday
  var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    // It's a weekend
    return dayNames[dayOfWeek] + 's are your days off. Please select a weekday (Monday-Friday) for your absence request.';
  }

  return '';
}

function findSupervisorForStudent_(studentUserId) {
  var targetStudentId = String(studentUserId || '').trim();
  if (!targetStudentId) {
    return null;
  }

  var rows = readSheetObjects_(getSupervisorAssignmentsSheet_());
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].student_user_id || '').trim() === targetStudentId &&
        String(rows[i].status || 'active').trim().toLowerCase() !== 'inactive') {
      return String(rows[i].supervisor_user_id || '').trim();
    }
  }
  return null;
}

function formatRelativeTime_(dateValue) {
  var raw = serializeCellValue_(dateValue);
  var dateStr = String(raw || '').trim();
  if (!dateStr) return '';

  var past = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(past.getTime())) return dateStr;

  var now = new Date();
  var diffMs = now.getTime() - past.getTime();
  var diffSec = Math.floor(diffMs / 1000);
  var diffMin = Math.floor(diffSec / 60);
  var diffHr = Math.floor(diffMin / 60);
  var diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return diffMin + ' min ago';
  if (diffHr < 24) return diffHr + ' hour' + (diffHr !== 1 ? 's' : '') + ' ago';
  if (diffDay < 7) return diffDay + ' day' + (diffDay !== 1 ? 's' : '') + ' ago';

  return Utilities.formatDate(past, Session.getScriptTimeZone(), 'MMM d, yyyy');
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

  // Read completed sessions (time_out filled) from active_sessions
  var rows = readSheetObjects_(getActiveSessionsSheet_());
  for (var j = 0; j < rows.length; j++) {
    var rowUserId = String(rows[j].user_id || '').trim();
    var timeOut = String(serializeCellValue_(rows[j].time_out) || '').trim();
    if (!allowed[rowUserId] || timeOut === '') {
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

  // Read completed sessions (time_out filled) from active_sessions
  var rows = readSheetObjects_(getActiveSessionsSheet_());
  var total = 0;
  for (var i = 0; i < rows.length; i++) {
    var rowUserId = String(rows[i].user_id || '').trim();
    var timeOut = String(serializeCellValue_(rows[i].time_out) || '').trim();
    if (rowUserId === targetUserId && timeOut !== '') {
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
  var startDate = formatDateValue_(found.start_date);
  if (!startDate) {
    var userRecord = findUserRecordByUserId_(userId);
    if (userRecord && userRecord.user) {
      startDate = formatDateValue_(userRecord.user.first_login_date);
    }
  }

  return {
    user_id: String(found.user_id || ''),
    total_ojt_hours: Number(found.total_ojt_hours || 0),
    start_date: formatDateValue_(startDate),
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

function getActiveSessionsSheet_() {
  return getOrCreateSheetWithHeaders_(ACTIVE_SESSIONS_SHEET_, ACTIVE_SESSIONS_HEADERS_);
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

function getNotificationsSheet_() {
  return getOrCreateSheetWithHeaders_(NOTIFICATIONS_SHEET_, NOTIFICATIONS_HEADERS_);
}

function getUserSettingsSheet_() {
  return getOrCreateSheetWithHeaders_(USER_SETTINGS_SHEET_, USER_SETTINGS_HEADERS_);
}

function getInternSchedulesSheet_() {
  return getOrCreateSheetWithHeaders_(INTERN_SCHEDULES_SHEET_, INTERN_SCHEDULES_HEADERS_);
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

/**
 * Generates a sequential ID (e.g., user_0001, TL_0005) by scanning the corresponding sheet.
 * Falls back to random ID if sheet scanning fails or prefix is unknown.
 */
function createId_(prefix) {
  var config = {
    'USR': { sheet: 'users', col: 'user_id', digits: 4, label: 'user' },
    'TL': { sheet: 'time_logs', col: 'timelog_id', digits: 4, label: 'TL' },
    'SES': { sheet: 'active_sessions', col: 'session_id', digits: 4, label: 'SES' },
    'ASG': { sheet: 'supervisor_assignments', col: 'assignment_id', digits: 4, label: 'ASG' },
    'NOTIF': { sheet: 'notifications', col: 'notification_id', digits: 4, label: 'NOT' },
    'REQ': { sheet: 'requests', col: 'request_id', digits: 4, label: 'REQ' }
  };

  // Add supervisor task ID sequence generator (SUP_0001...)
  config['SUP'] = { sheet: 'supervisor_task', col: 'sup_taskid', digits: 4, label: 'SUP' };

  var settings = config[prefix];
  if (settings) {
    // If the user specifically wanted "user_" prefix, we use it for USR
    var activePrefix = (prefix === 'USR') ? 'user' : settings.label;
    return getNextSequenceId_(settings.sheet, activePrefix, settings.col, settings.digits);
  }

  // Fallback for unknown prefixes
  return prefix + '_' + Utilities.getUuid().split('-')[0] + '_' + new Date().getTime();
}

/**
 * Scans a sheet to find the next available sequential ID.
 */
function getNextSequenceId_(sheetName, prefix, idColumnName, digits) {
  try {
    var sheet = getSheet_(sheetName);
    var headers = getHeaders_(sheet);
    var colIndex = findColumnIndex_(headers, idColumnName);
    if (colIndex === 0) return prefix + '_' + '1'.padStart(digits || 4, '0');

    var values = getSheetValues_(sheet);
    var maxIdNum = 0;
    var regex = new RegExp('^' + prefix + '_(\\d+)', 'i');

    for (var i = 1; i < values.length; i++) {
        var val = values[i][colIndex - 1];
        if (val === undefined || val === null) continue;
        var idVal = String(val).trim();
        var match = idVal.match(regex);
        if (match) {
            var num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxIdNum) {
                maxIdNum = num;
            }
        }
    }

    var nextNum = maxIdNum + 1;
    // Special case for starting at 000 if the sheet is empty and user requested it
    // But usually 0001 is safer for loops. 
    // If user specifically said user_000 first, I will start from 0 if maxIdNum is 0 and sheet is empty.
    if (maxIdNum === 0 && values.length <= 1 && prefix === 'user') {
        return 'user_0000';
    }

    var paddedNum = String(nextNum).padStart(digits || 4, '0');
    return prefix + '_' + paddedNum;
  } catch (err) {
    console.error('Error in getNextSequenceId_:', err);
    return prefix + '_' + Utilities.getUuid().split('-')[0];
  }
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
  // Use space-separated timestamp (no 'T') to match UI expectation: "YYYY-MM-DD HH:MM:SS"
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
}

// Normalize created_at/updated_at values in `activity_logs` to 'YYYY-MM-DD HH:MM:SS'
function standardizeActivityLogTimestamps() {
  try {
    var sheet = getSheet_('activity_logs');
    var vals = getSheetValues_(sheet);
    if (!vals || vals.length < 2) return { ok: true, message: 'No rows to process.' };

    var headers = vals[0].map(function(h){ return String(h||'').trim(); });
    var idxCreated = findColumnIndex_(headers, 'created_at');
    var idxUpdated = findColumnIndex_(headers, 'updated_at');

    if (!idxCreated && !idxUpdated) {
      return { ok: false, error: 'No timestamp columns found.' };
    }

    var updatedCount = 0;
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      var changed = false;

      var fixCell = function(colIdx) {
        if (!colIdx) return false;
        var raw = row[colIdx - 1];
        if (!raw) return false;
        // If it's already a Date object, format directly
        if (raw instanceof Date) {
          row[colIdx - 1] = Utilities.formatDate(raw, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
          return true;
        }
        var s = String(raw).trim();
        // If already in desired format, skip
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return false;

        // Try ISO-like parse
        var parsed = new Date(s);
        if (!isNaN(parsed.getTime())) {
          row[colIdx - 1] = Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
          return true;
        }

        // Try to extract a datetime substring like '2026-04-17 15:33:53' from larger strings
        var m = s.match(/(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})/);
        if (m) {
          var p = new Date(m[1].replace(' ', 'T'));
          if (!isNaN(p.getTime())) {
            row[colIdx - 1] = Utilities.formatDate(p, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
            return true;
          }
        }

        // As a last resort, try parsing common localized formats by Date constructor
        var alt = new Date(s.replace(/\(.*\)/, '').trim());
        if (!isNaN(alt.getTime())) {
          row[colIdx - 1] = Utilities.formatDate(alt, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
          return true;
        }

        return false;
      };

      if (fixCell(idxCreated)) changed = true;
      if (fixCell(idxUpdated)) changed = true;

      if (changed) {
        sheet.getRange(r + 1, 1, 1, row.length).setValues([row]);
        updatedCount++;
      }
    }

    return { ok: true, updated: updatedCount };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Safely converts a Google Sheets cell value (which may be a Date object)
 * to a "yyyy-MM-dd" string for reliable comparisons.
 */
function formatCellDate_(cellValue) {
  if (!cellValue) return '';
  if (cellValue instanceof Date) {
    return Utilities.formatDate(cellValue, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(cellValue).trim();
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Document Management Functions
var DOCUMENTS_SHEET_ = 'documents';
var DOCUMENTS_HEADERS_ = ['id', 'user_id', 'name', 'folder', 'type', 'size', 'url', 'is_link', 'uploaded_date', 'access_level', 'shared_with', 'created_by', 'created_date'];
var ACT_ATTACHMENTS_SHEET_ = 'act_attachments';
// include task_id and file_name so attachments can be associated with a task
var ACT_ATTACHMENTS_HEADERS_ = ['id', 'task_id', 'user_id', 'file_type', 'file_size', 'file_name', 'link', 'uploaded_at', 'uploaded_by'];
var DOCUMENT_FOLDERS_SHEET_ = 'document_folders';
var DOCUMENT_FOLDERS_HEADERS_ = ['id', 'user_id', 'folder_name', 'path', 'created_date', 'is_default'];
var DOCUMENT_UPLOADS_FOLDER_ = 'IMS Documents Uploads';
var WORKLOG_ATTACHMENTS_FOLDER_ = 'IMS Worklog Attachments';

// Add a new attachment to act_attachments with sequential ATT_0001 IDs
function addActivityTaskAttachment(payload) {
  try {
    var taskId = String(payload.task_id || '').trim();
    var userId = String(payload.user_id || '').trim();
    var fileType = String(payload.file_type || '').trim();
    var fileSize = String(payload.file_size || '').trim();
    var fileName = String(payload.file_name || '').trim();
    var link = String(payload.link || '').trim();
    // normalize uploaded_at to 'YYYY-MM-DD HH:MM:SS'
    var uploadedAt = Utilities.formatDate(new Date(payload.uploaded_at || new Date()), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    var uploadedBy = String(payload.uploaded_by || '').trim();

    if (!userId) {
      return { ok: false, error: 'user_id is required.' };
    }

    var sheet = getOrCreateSheetWithHeaders_(ACT_ATTACHMENTS_SHEET_, ACT_ATTACHMENTS_HEADERS_);
    // Generate sequential ATT_0001 ID
    var lastId = 0;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var val = String(data[i][0] || '');
      if (/^ATT_\d+$/.test(val)) {
        var num = parseInt(val.replace('ATT_', ''), 10);
        if (!isNaN(num) && num > lastId) lastId = num;
      }
    }
    var attId = 'ATT_' + String(lastId + 1).padStart(4, '0');

    // Append with new columns: id, task_id, user_id, file_type, file_size, file_name, link, uploaded_at, uploaded_by
    // write formatted timestamp string to sheet so it appears as 'YYYY-MM-DD HH:MM:SS'
    sheet.appendRow([
      attId,
      taskId,
      userId,
      fileType,
      fileSize,
      fileName,
      link,
      uploadedAt,
      uploadedBy,
    ]);

    // If a task_id and file_name were provided, also update the corresponding activity_logs row
    // to include the new file name inside the attachments JSON so the UI can read it.
    try {
      if (taskId && fileName) {
        var activitySheet = getSheet_('activity_logs');
        if (activitySheet) {
          var vals = getSheetValues_(activitySheet);
          if (vals && vals.length > 0) {
            var headers = vals[0].map(function(h){ return String(h||'').trim(); });
            var idIdx = headers.indexOf('id');
            var attachmentsIdx = headers.indexOf('attachments');
            if (idIdx !== -1 && attachmentsIdx !== -1) {
              for (var r = 1; r < vals.length; r++) {
                if (String(vals[r][idIdx] || '').trim() === taskId) {
                  var existingRaw = String(vals[r][attachmentsIdx] || '').trim();
                  var existing = parseActivityJsonArray_(existingRaw);
                  if (!Array.isArray(existing)) existing = [];
                  if (existing.indexOf(fileName) === -1) {
                    existing.push(fileName);
                    updateObjectRow_(activitySheet, r + 1, { attachments: JSON.stringify(existing) });
                  }
                  break;
                }
              }
            }
          }
        }
      }
    } catch (e) {
      // non-fatal - we still return success for the attachment write
    }

    return {
      ok: true,
      attachment: {
        id: attId,
        task_id: taskId,
        user_id: userId,
        file_type: fileType,
        file_size: fileSize,
        file_name: fileName,
        link: link,
        uploaded_at: uploadedAt,
        uploaded_by: uploadedBy
      }
    };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}


// Migration helper: fix rows in act_attachments where columns got shifted.
// Heuristics: detects ISO timestamps, user_id patterns (e.g., user_0001 or emails), and task id patterns (ACT_, WL_, ATT_, WLA_)
function migrateActAttachmentsColumns() {
  try {
    var sheet = getSheet_(ACT_ATTACHMENTS_SHEET_);
    var values = getSheetValues_(sheet);
    if (!values || values.length < 2) return { ok: true, message: 'No rows to migrate.' };

    var headers = values[0].map(function(h){ return String(h||'').trim(); });
    var idx = {};
    headers.forEach(function(h, i){ idx[normalizeHeader_(h)] = i; });

    var uploadedAtIdx = (idx['uploaded_at'] !== undefined) ? idx['uploaded_at'] : -1;
    var uploadedByIdx = (idx['uploaded_by'] !== undefined) ? idx['uploaded_by'] : -1;
    var taskIdIdx = (idx['task_id'] !== undefined) ? idx['task_id'] : -1;
    var fileNameIdx = (idx['file_name'] !== undefined) ? idx['file_name'] : -1;

    if (uploadedAtIdx === -1 || uploadedByIdx === -1 || taskIdIdx === -1) {
      return { ok: false, error: 'Sheet missing required columns for migration.' };
    }

    var updates = 0;
    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      // normalize values
      var uploadedAtVal = String(row[uploadedAtIdx] || '').trim();
      var uploadedByVal = String(row[uploadedByIdx] || '').trim();
      var taskIdVal = String(row[taskIdIdx] || '').trim();
      var fileNameVal = fileNameIdx !== -1 ? String(row[fileNameIdx] || '').trim() : '';

      var changed = false;

      var isIso = function(v) { return /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v); };
      var isUser = function(v) { return /^user_\w+/i.test(v) || /@/.test(v); };
      var isTaskId = function(v) { return /^(ACT_|WL_|ATT_|WLA_|TASK_|TL_)/i.test(v); };

      // If uploadedBy contains an ISO timestamp and uploadedAt contains a user id, swap them
      if (!uploadedAtVal && isIso(uploadedByVal)) {
        // uploaded_at empty but uploaded_by has timestamp -> move it
        row[uploadedAtIdx] = uploadedByVal;
        row[uploadedByIdx] = '';
        changed = true;
      } else if (isIso(uploadedByVal) && isUser(uploadedAtVal)) {
        // swapped: uploadedAt has user, uploadedBy has timestamp -> swap
        row[uploadedAtIdx] = uploadedByVal;
        row[uploadedByIdx] = uploadedAtVal;
        changed = true;
      }

      // If taskId column contains a timestamp or user id, try to move values to correct columns
      if (taskIdVal && isIso(taskIdVal)) {
        // task_id contains timestamp, move to uploaded_at if empty
        if (!row[uploadedAtIdx]) {
          row[uploadedAtIdx] = taskIdVal;
          row[taskIdIdx] = '';
          changed = true;
        }
      } else if (taskIdVal && isUser(taskIdVal) && !row[uploadedByIdx]) {
        row[uploadedByIdx] = taskIdVal;
        row[taskIdIdx] = '';
        changed = true;
      } else if (taskIdVal && isTaskId(taskIdVal)) {
        // looks fine
      }

      // If file_name is empty but another column contains a filename-like string (has a dot), move it
      if (fileNameIdx !== -1 && !fileNameVal) {
        for (var c = 0; c < row.length; c++) {
          var v = String(row[c] || '').trim();
          if (v && /\.[a-z0-9]{1,6}$/i.test(v) && c !== fileNameIdx) {
            row[fileNameIdx] = v;
            row[c] = '';
            changed = true;
            break;
          }
        }
      }

      if (changed) {
        // write back the corrected row (r+1 because sheet is 1-indexed)
        sheet.getRange(r + 1, 1, 1, row.length).setValues([row]);
        updates++;
      }
    }

    return { ok: true, updated: updates };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
function getOrCreateDocumentUploadsFolder_() {
  var folders = DriveApp.getFoldersByName(DOCUMENT_UPLOADS_FOLDER_);
  if (folders.hasNext()) {
    return folders.next();
  }

  return DriveApp.createFolder(DOCUMENT_UPLOADS_FOLDER_);
}

function getOrCreateWorklogAttachmentsFolder_() {
  var folders = DriveApp.getFoldersByName(WORKLOG_ATTACHMENTS_FOLDER_);
  if (folders.hasNext()) {
    return folders.next();
  }

  return DriveApp.createFolder(WORKLOG_ATTACHMENTS_FOLDER_);
}

function handleGetAllDocuments_(payload) {
  try {
    var userId = String(payload.user_id || '').trim();
    if (!userId) {
      return { ok: false, error: 'Missing user_id.' };
    }

    var groupMemberIds = getGroupMemberIds_(userId);
    
    var sheet = getOrCreateSheetWithHeaders_(DOCUMENTS_SHEET_, DOCUMENTS_HEADERS_);
    var rows = readSheetObjects_(sheet);
    var filteredDocs = [];
    var authorIds = [];

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var docUserId = String(row.user_id || '').trim();
      
      // If the document belongs to anyone in the group
      if (groupMemberIds.indexOf(docUserId) !== -1) {
        filteredDocs.push(row);
        var createdById = String(row.created_by || '').trim();
        if (createdById && authorIds.indexOf(createdById) === -1) {
          authorIds.push(createdById);
        }
      }
    }

    // Combined user names map (group members + anyone who authored a doc)
    var allIdsToLookup = groupMemberIds.concat(authorIds).filter(function(id, idx, self) {
      return self.indexOf(id) === idx;
    });
    var userNamesMap = getUserNamesMap_(allIdsToLookup);

    var documents = filteredDocs.map(function(row) {
      return {
        id: String(row.id || '').trim(),
        user_id: String(row.user_id || '').trim(),
        name: String(row.name || '').trim(),
        folder: String(row.folder || '/').trim() || '/',
        type: String(row.type || 'file').trim() || 'file',
        size: String(row.size || '').trim(),
        url: String(row.url || '').trim(),
        is_link: String(row.is_link || '').trim(),
        uploaded_date: String(row.uploaded_date || '').trim(),
        access_level: String(row.access_level || 'private').trim() || 'private',
        shared_with: (function() {
          if (!row.shared_with) return [];
          try {
            return JSON.parse(String(row.shared_with));
          } catch (e) {
            return [];
          }
        })(),
        created_by: String(row.created_by || '').trim(),
        created_date: String(row.created_date || '').trim(),
        created_by_name: userNamesMap[String(row.created_by || '').trim()] || 'Unknown'
      };
    });

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
    var type = String(payload.type || 'file').trim().toLowerCase();
    var size = String(payload.size || '').trim();
    var url = String(payload.url || '#').trim();
    var isLink = payload.is_link === true || String(payload.is_link || '').toLowerCase() === 'true';
    var fileDataBase64 = String(payload.file_data_base64 || '').trim();
    var mimeType = String(payload.mime_type || 'application/octet-stream').trim();
    var fileName = String(payload.file_name || name || 'upload').trim();
    var uploadedDate = String(payload.uploaded_date || new Date().toISOString().split('T')[0]).trim();

    if (!userId || !name) {
      return { ok: false, error: 'Missing user_id or name.' };
    }

    if (isLink) {
      type = 'link';
      if (!url || url === '#') {
        return { ok: false, error: 'Missing link URL.' };
      }
    } else {
      if (fileDataBase64) {
        try {
          var bytes = Utilities.base64Decode(fileDataBase64);
          var blob = Utilities.newBlob(bytes, mimeType, fileName || name);
          var uploadFolder = getOrCreateDocumentUploadsFolder_();
          var createdFile = uploadFolder.createFile(blob);

          url = createdFile.getUrl();
          if (!size) {
            size = (createdFile.getSize() / 1024 / 1024).toFixed(1) + ' MB';
          }
        } catch (uploadErr) {
          return { ok: false, error: 'Unable to save uploaded file: ' + (uploadErr.message || String(uploadErr)) };
        }
      }

      if (!url || url === '#') {
        return { ok: false, error: 'Missing uploaded file data.' };
      }

      if (!size) {
        size = '0 MB';
      }
    }

    var docId = 'doc' + Date.now();
    var sheet = getOrCreateSheetWithHeaders_(DOCUMENTS_SHEET_, DOCUMENTS_HEADERS_);

    var newRow = [
      docId,
      userId,
      name,
      folder,
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
      var rowDocId = String(row[0] || '').trim();
      var rowUserId = String(row[1] || '').trim();
      if (rowDocId === docId && rowUserId === userId) {
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
      var rowDocId = String(row[0] || '').trim();
      var rowUserId = String(row[1] || '').trim();
      if (rowDocId === docId && rowUserId === userId) {
        var sharedWith = [];
        if (row[11]) {
          try {
            sharedWith = JSON.parse(String(row[11]));
          } catch (e) {
            sharedWith = [];
          }
        }
        
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
      var rowDocId = String(row[0] || '').trim();
      var rowUserId = String(row[1] || '').trim();
      if (rowDocId === docId && rowUserId === userId) {
        var sharedWith = [];
        if (row[11]) {
          try {
            sharedWith = JSON.parse(String(row[11]));
          } catch (e) {
            sharedWith = [];
          }
        }
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

    var sheet = getOrCreateSheetWithHeaders_(DOCUMENT_FOLDERS_SHEET_, DOCUMENT_FOLDERS_HEADERS_);
    var rows = readSheetObjects_(sheet);
    var normalizedFolderName = folderName.toLowerCase();

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (String(row.user_id || '').trim() !== userId) {
        continue;
      }

      var existingName = String(row.folder_name || '').trim().toLowerCase();
      if (existingName === normalizedFolderName) {
        return { ok: false, error: 'Folder already exists.' };
      }
    }

    var folderId = 'fld_' + Date.now();
    var folderPath = '/' + folderName;
    var createdDate = new Date().toISOString().split('T')[0];

    sheet.appendRow([
      folderId,
      userId,
      folderName,
      folderPath,
      createdDate,
      'false'
    ]);

    return {
      ok: true,
      folder: {
        id: folderId,
        name: folderName,
        user_id: userId,
        path: folderPath,
        created_date: createdDate,
        is_default: false
      }
    };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

function handleGetDocumentFolders_(payload) {
  try {
    var userId = String(payload.user_id || '').trim();
    if (!userId) {
      return { ok: false, error: 'Missing user_id.' };
    }

    var groupMemberIds = getGroupMemberIds_(userId);
    return { ok: true, folders: getFoldersByGroupMemberIds_(groupMemberIds) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

function getFoldersByGroupMemberIds_(groupMemberIds) {
  var sheet = getOrCreateSheetWithHeaders_(DOCUMENT_FOLDERS_SHEET_, DOCUMENT_FOLDERS_HEADERS_);
  var rows = readSheetObjects_(sheet);
  var folders = [];
  var seen = {};

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var folderUserId = String(row.user_id || '').trim();
    
    if (groupMemberIds.indexOf(folderUserId) === -1) {
      continue;
    }

    var name = String(row.folder_name || '').trim();
    if (!name) {
      continue;
    }

    var key = name.toLowerCase();
    if (seen[key]) {
      continue;
    }
    seen[key] = true;
    folders.push(name);
  }
  return folders;
}

function handleGetDocumentsBootstrapData_(payload) {
  try {
    var userId = String(payload.user_id || '').trim();
    if (!userId) {
      return { ok: false, error: 'Missing user_id.' };
    }

    var groupMemberIds = getGroupMemberIds_(userId);
    
    // Get Folders
    var folders = getFoldersByGroupMemberIds_(groupMemberIds);
    
    // Get Documents (Reuse logic from handleGetAllDocuments_)
    var docResponse = handleGetAllDocuments_(payload);
    
    return {
      ok: true,
      folders: folders,
      documents: docResponse.ok ? docResponse.documents : []
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
  return authorizeImsScopes_()
}


function getGroupMemberIds_(userId) {
  var targetUserId = String(userId || '').trim();
  if (!targetUserId) return [];

  var userRecord = findUserRecordByUserId_(targetUserId);
  if (!userRecord) return [targetUserId];

  var role = String(userRecord.user.role || '').trim();
  var supervisorId = null;

  if (role === 'Supervisor') {
    supervisorId = targetUserId;
  } else {
    supervisorId = findSupervisorForStudent_(targetUserId);
  }

  if (!supervisorId) {
    return [targetUserId];
  }

  var assignments = getActiveSupervisorAssignments_(supervisorId);
  var memberIds = assignments.map(function (a) {
    return String(a.student_user_id || '').trim();
  });
  memberIds.push(supervisorId);

  return memberIds.filter(function (id, index, self) {
    return id && self.indexOf(id) === index;
  });
}

function getUserNamesMap_(userIds) {
  var names = {};
  if (!userIds || !userIds.length) return names;

  var sheet = getSheet_('users');
  var headers = getHeaders_(sheet);
  var values = getSheetValues_(sheet);
  var userIdCol = findColumnIndex_(headers, 'user_id');
  var nameCol = findColumnIndex_(headers, 'full_name');

  if (userIdCol === 0 || nameCol === 0) return names;

  for (var i = 1; i < values.length; i++) {
    var uid = String(values[i][userIdCol - 1] || '').trim();
    if (userIds.indexOf(uid) !== -1) {
      names[uid] = String(values[i][nameCol - 1] || '').trim();
    }
  }

  return names;
}

// --- Settings & Role Enhancements ---

function handleGetStudentSupervisor_(payload) {
  var studentId = String(payload.student_user_id || '').trim();
  if (!studentId) {
    return { ok: false, error: 'student_user_id is required.' };
  }

  var assignments = readSheetObjects_(getSheet_(SUPERVISOR_ASSIGNMENTS_SHEET_));
  var activeAssignment = null;
  for (var i = 0; i < assignments.length; i++) {
    if (String(assignments[i].student_user_id || '').trim() === studentId && String(assignments[i].status || '').trim() !== 'inactive') {
      activeAssignment = assignments[i];
      break;
    }
  }

  if (!activeAssignment) {
    return { ok: true, supervisor: null }; // No supervisor assigned
  }

  var supervisorId = String(activeAssignment.supervisor_user_id || '').trim();
  var supervisorRecord = findUserRecordByUserId_(supervisorId);
  if (!supervisorRecord) {
    return { ok: true, supervisor: null };
  }

  return {
    ok: true,
    supervisor: {
      user_id: supervisorId,
      full_name: String(supervisorRecord.user.full_name || ''),
      email: String(supervisorRecord.user.email || ''),
      department: String(activeAssignment.department || supervisorRecord.user.department || ''),
      profile_photo_url: String(supervisorRecord.user.profile_photo_url || '')
    }
  };
}

function handleGetNotificationPreferences_(payload) {
  var userId = String(payload.user_id || '').trim();
  if (!userId) {
    return { ok: false, error: 'user_id is required.' };
  }

  var sheet = getUserSettingsSheet_();
  var settingsRows = readSheetObjects_(sheet);
  var userSettings = null;
  for (var i = 0; i < settingsRows.length; i++) {
    if (String(settingsRows[i].user_id || '').trim() === userId) {
      try {
        userSettings = JSON.parse(settingsRows[i].settings_json || '{}');
      } catch (e) {
        userSettings = {};
      }
      break;
    }
  }

  return { ok: true, settings: userSettings || {} };
}

function handleUpdateNotificationPreferences_(payload) {
  var userId = String(payload.user_id || '').trim();
  var settingsObj = payload.settings || {};
  if (!userId) {
    return { ok: false, error: 'user_id is required.' };
  }

  var sheet = getUserSettingsSheet_();
  var settingsRows = readSheetObjects_(sheet);
  var rowIndex = -1;
  for (var i = 0; i < settingsRows.length; i++) {
    if (String(settingsRows[i].user_id || '').trim() === userId) {
      rowIndex = i + 2; // +1 for 0-index, +1 for header
      break;
    }
  }

  var rowData = {
    user_id: userId,
    settings_json: JSON.stringify(settingsObj),
    updated_at: isoNow_()
  };

  if (rowIndex > -1) {
    updateObjectRow_(sheet, rowIndex, rowData);
  } else {
    appendObjectRow_(sheet, rowData);
  }

  return { ok: true, message: 'Settings updated successfully.' };
}

function handleChangePassword_(payload) {
  var userId = String(payload.user_id || '').trim();
  var currentPassword = String(payload.current_password || '');
  var newPassword = String(payload.new_password || '');

  if (!userId || !currentPassword || !newPassword) {
    return { ok: false, error: 'user_id, current_password, and new_password are required.' };
  }

  var record = findUserRecordByUserId_(userId);
  if (!record) {
    return { ok: false, error: 'User not found.' };
  }

  if (String(record.user.password_hash || '') !== sha256Hex_(currentPassword)) {
    return { ok: false, error: 'Incorrect current password.' };
  }

  if (newPassword.length < 8) {
    return { ok: false, error: 'New password must be at least 8 characters long.' };
  }

  updateObjectRow_(record.sheet, record.rowIndex, {
    password_hash: sha256Hex_(newPassword)
  });

  return { ok: true, message: 'Password updated successfully.' };
}

function sendDailyTimeLogReminders() {
  var todayISOStr = new Date().toISOString().slice(0, 10);
  
  var logsSheet = getSheet_(TIME_LOGS_SHEET_);
  var logs = readSheetObjects_(logsSheet);
  var incompleteLogsUsers = [];
  
  for (var i = 0; i < logs.length; i++) {
    var logDate = String(logs[i].log_date || '').trim();
    var timeOut = String(logs[i].time_out || '').trim();
    if (logDate === todayISOStr && !timeOut && String(logs[i].status || '').trim() !== 'deleted') {
      var uid = String(logs[i].user_id || '').trim();
      if (incompleteLogsUsers.indexOf(uid) === -1) {
        incompleteLogsUsers.push(uid);
      }
    }
  }

  if (incompleteLogsUsers.length === 0) return;

  var usersSheet = getSheet_('users');
  var usersList = readSheetObjects_(usersSheet);
  
  var settingsSheet = getSheet_('user_settings');
  var settingsRows = readSheetObjects_(settingsSheet);
  
  var activeEmailsSent = 0;
  
  for (var j = 0; j < incompleteLogsUsers.length; j++) {
    var uid = incompleteLogsUsers[j];
    
    var hasReminderEnabled = false;
    for (var k = 0; k < settingsRows.length; k++) {
      if (String(settingsRows[k].user_id || '').trim() === uid) {
        try {
          var prefs = JSON.parse(settingsRows[k].settings_json || '{}');
          if (prefs.time_log_reminder === true) {
            hasReminderEnabled = true;
          }
        } catch(e) {}
        break;
      }
    }
    
    if (!hasReminderEnabled) continue;
    
    var uRecord = null;
    for (var l = 0; l < usersList.length; l++) {
      if (String(usersList[l].user_id || '').trim() === uid) {
        uRecord = usersList[l];
        break;
      }
    }
    
    if (uRecord && uRecord.email) {
      var subject = "IMS Time Log Reminder";
      var body = "Hi " + (uRecord.full_name || 'Student') + ",\n\n" +
                 "This is a reminder that you have not logged your time out yet for today (" + todayISOStr + "). " +
                 "Please log out as soon as possible to keep your time records accurate.\n\n" +
                 "— Internship Management System";
      MailApp.sendEmail(uRecord.email, subject, body);
      activeEmailsSent++;
    }
  }
}

/**
 * MIGRATION TOOL:
 * Converts all existing long UUID-based User IDs to sequential 'user_0000' format.
 * Updates all related records in all sheets to maintain data integrity.
 * 
 * WARNING: This is a destructive operation. Back up your spreadsheet first.
 * To run: Copy this function into a temporary script or run directly from Apps Script editor.
 */
function migrateAllToSequentialIDs() {
  var usersSheet = getSheet_('users');
  var usersHeaders = getHeaders_(usersSheet);
  var userIdCol = findColumnIndex_(usersHeaders, 'user_id');
  var usersValues = getSheetValues_(usersSheet);
  
  if (usersValues.length <= 1) return "No users found to migrate.";
  
  var idMap = {};
  var nextNum = 0;
  
  // 1. Generate Mappings
  for (var r = 1; r < usersValues.length; r++) {
    var oldId = String(usersValues[r][userIdCol - 1]).trim();
    if (!oldId) continue;
    
    // If already in new format, just track it to avoid collisions but keep it
    if (/^user_\d+$/i.test(oldId)) {
      idMap[oldId] = oldId;
      var num = parseInt(oldId.split('_')[1], 10);
      if (num >= nextNum) nextNum = num + 1;
      continue;
    }
    
    var newId = 'user_' + String(nextNum).padStart(4, '0');
    idMap[oldId] = newId;
    nextNum++;
  }
  
  console.log('ID Mapping generated:', idMap);
  
  // 2. Update Users Sheet
  for (var r = 1; r < usersValues.length; r++) {
    var oldIdRow = String(usersValues[r][userIdCol - 1]).trim();
    if (idMap[oldIdRow]) {
      usersValues[r][userIdCol - 1] = idMap[oldIdRow];
    }
  }
  usersSheet.getRange(1, 1, usersValues.length, usersValues[0].length).setValues(usersValues);
  
  // 3. Update all dependent sheets
  var targets = [
    { sheet: 'time_logs', cols: ['user_id'] },
    { sheet: 'active_sessions', cols: ['user_id'] },
    { sheet: 'supervisor_assignments', cols: ['supervisor_user_id', 'student_user_id'] },
    { sheet: 'student_ojt_profile', cols: ['user_id'] },
    { sheet: 'requests', cols: ['user_id'] },
    { sheet: 'notifications', cols: ['user_id'] },
    { sheet: 'activity_logs', cols: ['user_id'] },
    { sheet: 'tasks', cols: ['user_id'] },
    { sheet: 'documents', cols: ['user_id', 'created_by'] },
    { sheet: 'act_attachments', cols: ['user_id', 'uploaded_by'] },
    { sheet: 'document_folders', cols: ['user_id'] }
  ];
  
  targets.forEach(function(target) {
    try {
      var sheet = getSheet_(target.sheet);
      var headers = getHeaders_(sheet);
      var values = getSheetValues_(sheet);
      if (values.length <= 1) return;
      
      var colIndices = target.cols.map(function(c) { 
        return findColumnIndex_(headers, c); 
      }).filter(function(idx) { 
        return idx > 0; 
      });
      
      if (colIndices.length === 0) return;
      
      var changed = false;
      for (var r = 1; r < values.length; r++) {
        colIndices.forEach(function(cIdx) {
          var valInside = String(values[r][cIdx - 1]).trim();
          if (idMap[valInside]) {
            values[r][cIdx - 1] = idMap[valInside];
            changed = true;
          }
        });
      }
      
      if (changed) {
        sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
        console.log('Updated sheet: ' + target.sheet);
      }
    } catch (e) {
      console.warn('Could not update sheet: ' + target.sheet + ' - ' + e.message);
    }
  });
  
  return "Migration Complete. Sync your Svelte app to see changes.";
}

// Ensure the act_attachments sheet has the exact desired headers and reorder rows to match.
function standardizeActAttachmentsSheet() {
  try {
    var desired = ACT_ATTACHMENTS_HEADERS_.slice(); // e.g. ['id','task_id','user_id',...]
    var sheet = getSheet_(ACT_ATTACHMENTS_SHEET_);
    var vals = getSheetValues_(sheet);
    if (!vals || vals.length === 0) {
      // create header if missing
      sheet.getRange(1, 1, 1, desired.length).setValues([desired]);
      return { ok: true, message: 'Header created.' };
    }

    var existingHeaders = vals[0].map(function(h){ return String(h||'').trim(); });

    // Build map of normalized existing header -> first column index
    var existingMap = {};
    for (var i = 0; i < existingHeaders.length; i++) {
      var key = normalizeHeader_(existingHeaders[i]);
      if (!existingMap.hasOwnProperty(key)) existingMap[key] = i;
    }

    // Prepare new data rows mapped to desired headers
    var newRows = [];
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      var newRow = new Array(desired.length).fill('');
      for (var c = 0; c < desired.length; c++) {
        var header = desired[c];
        var norm = normalizeHeader_(header);
        if (existingMap.hasOwnProperty(norm)) {
          var srcIdx = existingMap[norm];
          newRow[c] = row[srcIdx] !== undefined ? row[srcIdx] : '';
        } else {
          // Try to find likely candidates: for file_name, look for any column with dot
          if (norm === 'file_name') {
            for (var cc = 0; cc < row.length; cc++) {
              var v = String(row[cc] || '').trim();
              if (v && /\.[a-z0-9]{1,6}$/i.test(v)) { newRow[c] = v; break; }
            }
          }
        }
      }
      newRows.push(newRow);
    }

    // Write header + newRows back to sheet (resize sheet columns to desired length)
    // Clear sheet and rewrite to avoid leftover columns
    sheet.clearContents();
    var out = [desired].concat(newRows);
    sheet.getRange(1, 1, out.length, desired.length).setValues(out);

    return { ok: true, rows: newRows.length };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}