// @ts-nocheck
let currentUser = null;
const AUTH_USER_CHANGED_EVENT = 'ims-auth-user-changed';

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
    if (!result?.ok) {
      throw new Error(result?.error || 'Request failed.');
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
    throw new Error(result?.error || 'Request failed.');
  }

  return result;
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
  notifyCurrentUserChanged();
}

export async function loginWithCredentials(emailInput, passwordInput) {
  const email = String(emailInput || '').trim().toLowerCase();
  const password = String(passwordInput || '');

  const result = await postAction('login_account', {
    email,
    password,
  });

  currentUser = result.user || null;
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
    currentUser = {
      ...currentUser,
      ...result.user,
    };
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
    currentUser = {
      ...currentUser,
      ...result.user,
    };
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
    status: String(logInput?.status || 'pending').trim(),
    notes: String(logInput?.notes || '').trim(),
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
