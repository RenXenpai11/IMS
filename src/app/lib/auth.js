// @ts-nocheck
let currentUser = null;
const AUTH_USER_CHANGED_EVENT = 'ims-auth-user-changed';
const AUTH_SESSION_STORAGE_KEY = 'ims-auth-session-user';

function normalizeStoredUser(user) {
  if (!user || typeof user !== 'object') {
    return null;
  }

  const userId = String(user.user_id || '').trim();
  if (!userId) {
    return null;
  }

  return {
    ...user,
    user_id: userId,
  };
}

function persistCurrentUser() {
  if (typeof window === 'undefined') {
    return;
  }

  if (currentUser) {
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(currentUser));
    return;
  }

  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

export function hydrateAuthSession() {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!raw) {
    currentUser = null;
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeStoredUser(parsed);

    if (!normalized) {
      currentUser = null;
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      return null;
    }

    currentUser = normalized;
    return currentUser;
  } catch {
    currentUser = null;
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  }
}

export async function restoreAuthSession() {
  var restoredUser = hydrateAuthSession();

  if (!restoredUser || !restoredUser.user_id) {
    return null;
  }

  // Broadcast hydrated local session right away to avoid UI fallback flicker on refresh.
  notifyCurrentUserChanged();

  try {
    const result = await postAction('get_user_by_id', {
      user_id: String(restoredUser.user_id || '').trim(),
    });

    if (result?.user) {
      currentUser = normalizeStoredUser({
        ...restoredUser,
        ...result.user,
      });
      persistCurrentUser();
      notifyCurrentUserChanged();
    }
  } catch {
    // Keep the restored local session even if profile refresh fails.
  }

  return currentUser;
}

function notifyCurrentUserChanged() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(AUTH_USER_CHANGED_EVENT, { detail: currentUser }));
}

function isAppsScriptHost() {
  return typeof window !== 'undefined' && /script\.googleusercontent\.com|script\.google\.com/.test(window.location.host);
}

function resolveApiUrl() {
  if (isAppsScriptHost()) {
    return window.location.href.split('#')[0];
  }

  const configured = String(import.meta.env.VITE_GAS_WEB_APP_URL || '').trim();
  if (configured) {
    return configured;
  }

  throw new Error('Missing Apps Script URL. Set VITE_GAS_WEB_APP_URL in your .env file.');
}

function canUseGoogleScriptRun() {
  return typeof window !== 'undefined' && typeof window.google !== 'undefined' && Boolean(window.google?.script?.run);
}

function waitForGoogleScriptRun(timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    function check() {
      if (canUseGoogleScriptRun()) {
        resolve(window.google.script.run);
        return;
      }

      if (Date.now() - started >= timeoutMs) {
        reject(new Error('Apps Script bridge is not ready. Refresh the page and open the deployed /exec URL.'));
        return;
      }

      setTimeout(check, 60);
    }

    check();
  });
}

async function callGoogleScriptAction(action, payload = {}) {
  const runner = await waitForGoogleScriptRun();

  return new Promise((resolve, reject) => {
    try {
      runner
        .withSuccessHandler((result) => resolve(result))
        .withFailureHandler((err) => {
          reject(new Error(err?.message || 'Apps Script action failed.'));
        })
        .apiAction(action, payload);
    } catch (err) {
      reject(new Error(err?.message || 'Apps Script action failed.'));
    }
  });
}

async function postAction(action, payload = {}) {
  if (isAppsScriptHost()) {
    const result = await callGoogleScriptAction(action, payload);
    if (!result || typeof result !== 'object') {
      throw new Error(`Invalid response while running ${action}.`);
    }

    if (result.ok !== true) {
      const errorMessage = typeof result.error === 'string' ? result.error.trim() : '';
      const fallbackMessage = typeof result.message === 'string' ? result.message.trim() : '';
      throw new Error(errorMessage || fallbackMessage || `Request failed while running ${action}.`);
    }
    return result;
  }

  const apiUrl = resolveApiUrl();
  const body = new URLSearchParams();
  body.set('action', action);
  body.set('payload', JSON.stringify(payload || {}));

  let response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      body,
    });
  } catch {
    throw new Error('Unable to reach Apps Script. Make sure your web app is deployed and accessible.');
  }

  const rawResponse = await response.text();

  let result;
  try {
    result = JSON.parse(rawResponse);
  } catch {
    if (rawResponse.includes('<!DOCTYPE html')) {
      throw new Error('Apps Script returned HTML instead of JSON. Verify deployment access and URL.');
    }
    throw new Error('Invalid API response from Apps Script.');
  }

  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || `Request failed while running ${action}.`);
  }

  return result;
}

export async function callApiAction(action, payload = {}) {
  return postAction(action, payload);
}

export function getCurrentUser() {
  return currentUser;
}

export function subscribeToCurrentUser(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }

  listener(currentUser);

  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event) => {
    listener(event?.detail ?? null);
  };

  window.addEventListener(AUTH_USER_CHANGED_EVENT, handler);

  return () => {
    window.removeEventListener(AUTH_USER_CHANGED_EVENT, handler);
  };
}

export function isAuthenticated() {
  return Boolean(currentUser);
}

export function signOut() {
  currentUser = null;
  persistCurrentUser();
  notifyCurrentUserChanged();
}

export async function loginWithCredentials(emailInput, passwordInput) {
  const email = String(emailInput || '').trim().toLowerCase();
  const password = String(passwordInput || '');

  const result = await postAction('login_account', {
    email,
    password,
  });

  currentUser = normalizeStoredUser(result.user) || null;
  persistCurrentUser();
  notifyCurrentUserChanged();
  return currentUser;
}

export async function updateProfilePhoto(photoInput) {
  const result = await postAction('update_profile_photo', {
    user_id: String(photoInput?.user_id || '').trim(),
    image_data_url: String(photoInput?.image_data_url || '').trim(),
    mime_type: String(photoInput?.mime_type || '').trim(),
    file_name: String(photoInput?.file_name || '').trim(),
  });

  if (result?.user && currentUser && String(currentUser.user_id || '') === String(result.user.user_id || '')) {
    currentUser = normalizeStoredUser({
      ...currentUser,
      ...result.user,
    });
    persistCurrentUser();
    notifyCurrentUserChanged();
  }

  return result;
}

export async function updateUserProfile(profileInput) {
  const result = await postAction('update_user_profile', {
    user_id: String(profileInput?.user_id || '').trim(),
    full_name: String(profileInput?.full_name || '').trim(),
    phone: String(profileInput?.phone || '').trim(),
    department: String(profileInput?.department || '').trim(),
    location: String(profileInput?.location || '').trim(),
    bio: String(profileInput?.bio || '').trim(),
  });

  if (result?.user && currentUser && String(currentUser.user_id || '') === String(result.user.user_id || '')) {
    currentUser = normalizeStoredUser({
      ...currentUser,
      ...result.user,
    });
    persistCurrentUser();
    notifyCurrentUserChanged();
  }

  return result;
}

export async function registerAccount(accountInput) {
  const rawOjtProfile = accountInput?.ojtProfile;
  const hasOjtProfile = rawOjtProfile && typeof rawOjtProfile === 'object';

  const result = await postAction('register_account', {
    full_name: String(accountInput?.name || '').trim(),
    email: String(accountInput?.email || '').trim().toLowerCase(),
    password: String(accountInput?.password || ''),
    role: accountInput?.role === 'Supervisor' ? 'Supervisor' : 'Student',
    department: String(accountInput?.department || '').trim(),
    status: String(accountInput?.status || 'active').trim(),
    ojt_profile: hasOjtProfile
      ? {
          total_ojt_hours: Number(rawOjtProfile?.total_ojt_hours || 0),
          start_date: String(rawOjtProfile?.start_date || '').trim(),
          estimated_end_date: String(rawOjtProfile?.estimated_end_date || '').trim(),
          course: String(rawOjtProfile?.course || '').trim(),
          school: String(rawOjtProfile?.school || '').trim(),
        }
      : null,
  });

  return result;
}

export async function verifyEmailOtp(emailInput, otpInput) {
  const result = await postAction('verify_email_otp', {
    email: String(emailInput || '').trim().toLowerCase(),
    otp_code: String(otpInput || '').trim(),
  });

  return result;
}

export async function resendEmailOtp(emailInput) {
  const result = await postAction('resend_email_otp', {
    email: String(emailInput || '').trim().toLowerCase(),
  });

  return result;
}

export async function upsertStudentOjtProfile(profileInput) {
  const result = await postAction('upsert_student_ojt_profile', {
    user_id: String(profileInput?.user_id || '').trim(),
    total_ojt_hours: Number(profileInput?.total_ojt_hours || 0),
    start_date: String(profileInput?.start_date || '').trim(),
    estimated_end_date: String(profileInput?.estimated_end_date || '').trim(),
    course: String(profileInput?.course || '').trim(),
    school: String(profileInput?.school || '').trim(),
  });

  return result.profile;
}

export async function createTimeLog(logInput) {
  const result = await postAction('create_time_log', {
    user_id: String(logInput?.user_id || '').trim(),
    log_date: String(logInput?.log_date || '').trim(),
    time_in: String(logInput?.time_in || '').trim(),
    time_out: String(logInput?.time_out || '').trim(),
    hours_rendered: Number(logInput?.hours_rendered || 0),
    status: String(logInput?.status || 'recorded').trim(),
    notes: String(logInput?.notes || '').trim(),
    updateStartDate: logInput?.updateStartDate === true,
  });

  return result.timelog;
}

export async function listTimeLogsByUser(userId) {
  const result = await postAction('list_time_logs_by_user', {
    user_id: String(userId || '').trim(),
  });

  return Array.isArray(result.logs) ? result.logs : [];
}

export async function deleteTimeLog(userId, timelogId) {
  const result = await postAction('delete_time_log', {
    user_id: String(userId || '').trim(),
    timelog_id: String(timelogId || '').trim(),
  });

  return result;
}

export async function listStudentsForAssignment(supervisorUserId) {
  const result = await postAction('list_students_for_assignment', {
    supervisor_user_id: String(supervisorUserId || '').trim(),
  });

  return Array.isArray(result.students) ? result.students : [];
}

export async function assignStudentsToSupervisor(supervisorUserId, studentUserIds) {
  const result = await postAction('assign_students_to_supervisor', {
    supervisor_user_id: String(supervisorUserId || '').trim(),
    student_user_ids: Array.isArray(studentUserIds)
      ? studentUserIds.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
  });

  return result;
}

export async function listSupervisorAssignedStudents(supervisorUserId) {
  const result = await postAction('list_supervisor_assigned_students', {
    supervisor_user_id: String(supervisorUserId || '').trim(),
  });

  return Array.isArray(result.students) ? result.students : [];
}

export async function listSupervisorTimeLogs(supervisorUserId, studentUserId) {
  const result = await postAction('list_supervisor_time_logs', {
    supervisor_user_id: String(supervisorUserId || '').trim(),
    student_user_id: String(studentUserId || '').trim(),
  });

  return Array.isArray(result.logs) ? result.logs : [];
}

export async function deleteSupervisorTimeLog(supervisorUserId, studentUserId, timelogId) {
  const result = await postAction('delete_supervisor_time_log', {
    supervisor_user_id: String(supervisorUserId || '').trim(),
    student_user_id: String(studentUserId || '').trim(),
    timelog_id: String(timelogId || '').trim(),
  });

  return result;
}

export async function debugSupervisorAssignment(supervisorUserId) {
  const result = await postAction('debug_supervisor_assignment', {
    supervisor_user_id: String(supervisorUserId || '').trim(),
  });

  return result?.debug || null;
}

export async function getStudentDashboard(userId, options = {}) {
  const result = await postAction('get_student_dashboard', {
    user_id: String(userId || '').trim(),
    limit: Number(options?.limit || 10),
  });

  return {
    user: result.user || null,
    profile: result.profile || null,
    total_completed_hours: Number(result.total_completed_hours || 0),
    time_logs: Array.isArray(result.time_logs) ? result.time_logs : [],
    activity_logs: Array.isArray(result.activity_logs) ? result.activity_logs : [],
    tasks: Array.isArray(result.tasks) ? result.tasks : [],
  };
}

export async function getStudentOjtProfile(userId) {
  const dashboard = await getStudentDashboard(userId, { limit: 1 });
  return dashboard.profile;
}

export async function listActivityLogsByUser(userId, options = {}) {
  const result = await postAction('list_activity_logs_by_user', {
    user_id: String(userId || '').trim(),
    limit: Number(options?.limit || 10),
  });

  return Array.isArray(result.logs) ? result.logs : [];
}

export async function listTasksByUser(userId, options = {}) {
  const result = await postAction('list_tasks_by_user', {
    user_id: String(userId || '').trim(),
    limit: Number(options?.limit || 10),
  });

  return Array.isArray(result.tasks) ? result.tasks : [];
}

export async function listNotifications(userId) {
  const result = await postAction('list_notifications', {
    user_id: String(userId || '').trim(),
  });

  return Array.isArray(result.notifications) ? result.notifications : [];
}

export async function markNotificationRead(notificationId) {
  const result = await postAction('mark_notification_read', {
    notification_id: String(notificationId || '').trim(),
  });

  return result;
}

export async function markAllNotificationsRead(userId) {
  const result = await postAction('mark_all_notifications_read', {
    user_id: String(userId || '').trim(),
  });

  return result;
}
