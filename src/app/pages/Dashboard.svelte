<script>
  import { onDestroy, onMount } from 'svelte';
  import {
    getCurrentUser,
    subscribeToCurrentUser,
    getStudentDashboard,
  } from '../lib/auth.js';

  const PROGRESS_MODES = {
    APPROVED: 'APPROVED',
    ALL: 'ALL',
  };

  // Debounce visibility changes to avoid rapid reloads
  let visibilityChangeTimeout = null;
  const VISIBILITY_RELOAD_DELAY = 200; // ms - short delay for quick responsiveness

  let currentUser = getCurrentUser();
  let unsubscribeAuth = null;

  let loading = true;
  let errorMessage = '';
  let successMessage = '';

  let progressMode = PROGRESS_MODES.APPROVED;

  // Server data (raw)
  let profile = null;
  let timeLogs = [];
  let totalCompletedHours = 0;
  let activityLogs = [];
  let tasks = [];
  let pendingRequests = [];

  // Editable form state
  let formStartDate = '';
  let formTotalOjtHours = 0;
  let readonlyDepartment = '';
  let readonlyCourse = '';
  let readonlySchool = '';

  function clearMessages() {
    errorMessage = '';
    successMessage = '';
  }

  function toLocalIsoDate(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function normalizeDateOnly(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return toLocalIsoDate(value);
    }

    const text = String(value || '').trim();
    if (!text) return '';

    const isoDateMatch = text.match(/^\d{4}-\d{2}-\d{2}$/);
    if (isoDateMatch) {
      return text;
    }

    const isoDateWithTimeMatch = text.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
    if (isoDateWithTimeMatch) {
      return isoDateWithTimeMatch[1];
    }

    const serialDate = Number(value);
    if (Number.isFinite(serialDate) && serialDate > 1) {
      const millis = Math.round((serialDate - 25569) * 86400000);
      const dateFromSerial = new Date(millis);
      if (!Number.isNaN(dateFromSerial.getTime())) {
        return toLocalIsoDate(dateFromSerial);
      }
    }

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return toLocalIsoDate(parsed);
    }

    return '';
  }

  function parseIsoDateOnly(value) {
    // Accepts "YYYY-MM-DD" and returns Date in local time.
    const raw = normalizeDateOnly(value);
    if (!raw) return null;
    const [y, mo, d] = raw.split('-').map((n) => Number(n));
    const dt = new Date(y, mo - 1, d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  }

  function formatDateLong(dateInput) {
    if (!dateInput) return '';
    const dt = typeof dateInput === 'string' ? parseIsoDateOnly(dateInput) : dateInput;
    if (!dt) return '';
    // Format as: "May 25, 2026"
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const month = monthNames[dt.getMonth()];
    const day = dt.getDate();
    const year = dt.getFullYear();
    return `${month} ${day}, ${year}`;
  }

  function normalizeTimeTo24Hour(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
    }

    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) {
      const fraction = ((numeric % 1) + 1) % 1;
      const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    const text = String(value || '').trim();
    if (!text) return '';

    const isoTime = text.match(/T(\d{2}):(\d{2})/);
    if (isoTime) {
      return `${isoTime[1]}:${isoTime[2]}`;
    }

    const amPmTime = text.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)/i);
    if (amPmTime) {
      let hours = Number(amPmTime[1]);
      const minutes = Number(amPmTime[2]);
      const marker = String(amPmTime[3] || '').toUpperCase();
      if (marker === 'PM' && hours < 12) {
        hours += 12;
      }
      if (marker === 'AM' && hours === 12) {
        hours = 0;
      }
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    const h24Time = text.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
    if (h24Time) {
      const hours = Number(h24Time[1]);
      const minutes = Number(h24Time[2]);
      if (Number.isFinite(hours) && Number.isFinite(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }
    }

    return '';
  }

  function formatTime12Hour(value) {
    const normalized = normalizeTimeTo24Hour(value);
    if (!normalized) return '';
    const [h, m] = normalized.split(':').map((n) => Number(n));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  }

  function buildActivityDateTime(logDateValue, timeValue) {
    const dateOnly = normalizeDateOnly(logDateValue);
    const timeOnly = normalizeTimeTo24Hour(timeValue);
    if (dateOnly && timeOnly) {
      return `${dateOnly}T${timeOnly}:00`;
    }
    return dateOnly || String(logDateValue || '').trim();
  }

  function toIsoDateOnly(dateInput) {
    if (!dateInput) return '';
    const dt = dateInput instanceof Date ? dateInput : parseIsoDateOnly(dateInput);
    if (!dt) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function isWeekend(dt) {
    const day = dt.getDay();
    return day === 0 || day === 6;
  }

  function addWorkingDays(startDate, workingDays) {
    // workingDays: integer >= 0
    const start = startDate instanceof Date ? new Date(startDate) : parseIsoDateOnly(startDate);
    if (!start || Number.isNaN(start.getTime())) return null;

    let remaining = Math.max(0, Math.trunc(Number(workingDays || 0)));
    const cursor = new Date(start);

    // If start lands on weekend, move to next Monday
    while (isWeekend(cursor)) {
      cursor.setDate(cursor.getDate() + 1);
    }

    while (remaining > 0) {
      cursor.setDate(cursor.getDate() + 1);
      if (!isWeekend(cursor)) {
        remaining -= 1;
      }
    }

    return cursor;
  }

  function sumHours(logs, mode) {
    const rows = Array.isArray(logs) ? logs : [];
    return rows.reduce((acc, row) => {
      if (mode === PROGRESS_MODES.APPROVED && String(row?.status || '').toLowerCase() !== 'approved') {
        return acc;
      }
      const hours = Number(row?.hours_rendered || 0);
      return acc + (Number.isFinite(hours) ? hours : 0);
    }, 0);
  }

  function sumPendingRequestHours(requests) {
    // Sum up total_hours from pending Overtime requests
    const rows = Array.isArray(requests) ? requests : [];
    return rows.reduce((acc, req) => {
      if (String(req?.requestType || '').toLowerCase() === 'overtime') {
        const hours = Number(req?.total_hours || 0);
        return acc + (Number.isFinite(hours) ? hours : 0);
      }
      return acc;
    }, 0);
  }

  $: totalOjtHours = Number(formTotalOjtHours || profile?.total_ojt_hours || 0);
  $: pendingOvertimeHours = sumPendingRequestHours(pendingRequests);
  $: effectiveCompletedHours = progressMode === PROGRESS_MODES.ALL ? totalCompletedHours + pendingOvertimeHours : totalCompletedHours;
  $: hoursCompleted = effectiveCompletedHours;
  $: hoursRemaining = Math.max(0, totalOjtHours - hoursCompleted);
  $: workingDaysNeeded = Math.ceil(hoursRemaining / 8);
  // Calculate days and remaining hours (e.g., "54 days 4 hours")
  $: daysAndHoursNeeded = (() => {
    const fullDays = Math.floor(hoursRemaining / 8);
    const remainingHoursOnly = Math.round((hoursRemaining % 8) * 10) / 10;
    if (remainingHoursOnly === 0) {
      return `${fullDays} day${fullDays !== 1 ? 's' : ''}`;
    }
    return `${fullDays} day${fullDays !== 1 ? 's' : ''} ${remainingHoursOnly}h`;
  })();

  $: totalWorkingDays = Math.ceil(Math.max(0, totalOjtHours) / 8);
  $: remainingWorkingDays = Math.ceil(Math.max(0, hoursRemaining) / 8);
  $: computedEstimatedEndDateObj = formStartDate
    ? addWorkingDays(parseIsoDateOnly(formStartDate), Math.max(0, remainingWorkingDays - 1))
    : null;
  $: computedEstimatedEndDate = computedEstimatedEndDateObj ? toIsoDateOnly(computedEstimatedEndDateObj) : '';

  $: progressPercent = totalOjtHours > 0 ? Math.min(100, Math.round((hoursCompleted / totalOjtHours) * 100)) : 0;
  $: startDateDisplay = formStartDate ? formatDateLong(formStartDate) : 'Not set yet';

  function normalizeActivityDotKind(item) {
    const type = String(item?.type || item?.action || item?.status || '').toLowerCase();
    if (type.includes('login')) return 'submitted';
    if (type.includes('logout')) return 'completed';
    if (type.includes('complete')) return 'completed';
    if (type.includes('submit')) return 'submitted';
    if (type.includes('review')) return 'reviewed';
    if (type.includes('assign')) return 'assigned';
    return 'submitted';
  }

  function activityTitle(item) {
    return String(item?.title || item?.message || item?.details || item?.action || 'Activity').trim() || 'Activity';
  }

  function activityWhen(item) {
    const raw = String(item?.created_at || item?.log_date || '').trim();
    if (!raw) return '';
    // Keep it simple: show ISO date part if present
    const isoDate = raw.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? formatDateLong(isoDate) : raw;
  }

  async function loadDashboard() {
    clearMessages();

    if (!currentUser?.user_id) {
      loading = false;
      errorMessage = 'Please sign in to view your dashboard.';
      return;
    }

    loading = true;
    try {
      const data = await getStudentDashboard(currentUser.user_id, { limit: 10 });
      profile = data.profile;
      timeLogs = data.time_logs;
      // Use backend as source of truth, with optional user-scoped cache as a non-decreasing fallback.
      const serverCompletedHours = Number(data.total_completed_hours || 0);
      const storageKey = `ojt_completed_hours_${String(currentUser.user_id || '').trim()}`;
      const cachedHoursRaw = storageKey ? localStorage.getItem(storageKey) : null;
      const cachedHours = cachedHoursRaw === null ? NaN : Number(cachedHoursRaw);

      totalCompletedHours = Number.isFinite(serverCompletedHours) ? serverCompletedHours : 0;
      if (Number.isFinite(cachedHours) && cachedHours > totalCompletedHours) {
        totalCompletedHours = cachedHours;
      }

      if (storageKey) {
        localStorage.setItem(storageKey, String(totalCompletedHours));
      }

      // Clean up legacy global cache key to avoid cross-account leakage.
      localStorage.removeItem('ojt_completed_hours');
      tasks = data.tasks;
      pendingRequests = data.pending_requests || [];

      // Create activity items from time logs (Logged In / Logged Out entries)
      const timeLogActivities = [];
      if (Array.isArray(data.time_logs)) {
        for (const log of data.time_logs) {
          const logDate = normalizeDateOnly(log?.log_date);
          const timeOutLabel = formatTime12Hour(log?.time_out);
          const timeInLabel = formatTime12Hour(log?.time_in);
          
          // Add "Logged Out" entry if time_out exists
          if (timeOutLabel) {
            timeLogActivities.push({
              id: `logout-${String(log?.timelog_id || '') || `${logDate}-${String(log?.time_out || '').trim()}`}`,
              type: 'logout',
              title: `Logged Out: ${timeOutLabel}`,
              created_at: buildActivityDateTime(logDate, log?.time_out),
            });
          }
          
          // Add "Logged In" entry if time_in exists
          if (timeInLabel) {
            timeLogActivities.push({
              id: `login-${String(log?.timelog_id || '') || `${logDate}-${String(log?.time_in || '').trim()}`}`,
              type: 'login',
              title: `Logged In: ${timeInLabel}`,
              created_at: buildActivityDateTime(logDate, log?.time_in),
            });
          }
        }
      }

      // Merge time log activities with regular activity logs and sort by date (most recent first)
      const allActivities = [...timeLogActivities, ...(Array.isArray(data.activity_logs) ? data.activity_logs : [])];
      allActivities.sort((a, b) => {
        const dateA = String(a?.created_at || '').trim();
        const dateB = String(b?.created_at || '').trim();
        return dateB.localeCompare(dateA); // Most recent first
      });
      activityLogs = allActivities;

      // Initialize form fields (only if empty / first load)
      const rawStartDate = profile?.start_date || currentUser?.ojt?.start_date || currentUser?.first_login_date || '';
      formStartDate = normalizeDateOnly(rawStartDate) || '';
      formTotalOjtHours = Number(profile?.total_ojt_hours || formTotalOjtHours || 0);
      readonlyDepartment = String(currentUser?.department || '').trim();
      readonlyCourse = String(profile?.course || currentUser?.ojt?.course || '').trim();
      readonlySchool = String(profile?.school || currentUser?.ojt?.school || '').trim();
    } catch (err) {
      errorMessage = err?.message || 'Failed to load dashboard.';
    } finally {
      loading = false;
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      // Clear any pending reload
      if (visibilityChangeTimeout) clearTimeout(visibilityChangeTimeout);
      // Schedule reload with debounce
      visibilityChangeTimeout = setTimeout(() => {
        loadDashboard();
        visibilityChangeTimeout = null;
      }, VISIBILITY_RELOAD_DELAY);
    }
  }

  onMount(() => {
    unsubscribeAuth = subscribeToCurrentUser((user) => {
      currentUser = user;
      if (user?.user_id) {
        loadDashboard();
      }
    });

    document.addEventListener('visibilitychange', onVisibilityChange);
    // Only load if we already have a current user (avoid double load)
    if (currentUser?.user_id) {
      loadDashboard();
    }
  });

  onDestroy(() => {
    if (typeof unsubscribeAuth === 'function') unsubscribeAuth();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    // Clean up any pending visibility reload
    if (visibilityChangeTimeout) clearTimeout(visibilityChangeTimeout);
  });
</script>

<section class="dashboard-page-shell">
  <div class="dashboard-shell dashboard-container">
    <div class="welcome-banner">
      <div>
        <h2 class="welcome-title">Welcome back{currentUser?.full_name ? `, ${currentUser.full_name}` : ''}!</h2>
        <p class="welcome-subtitle">
          {#if currentUser?.role}
            <span class="profile-badge">Intern</span>
          {/if}
          {#if readonlyDepartment}
            <span class="profile-detail">• {readonlyDepartment}</span>
          {/if}
          {#if readonlyCourse}
            <span class="profile-detail">• {readonlyCourse}</span>
          {/if}
          {#if readonlySchool}
            <span class="profile-detail">• {readonlySchool}</span>
          {/if}
        </p>
      </div>

      <div class="mode-toggle">
        <span class="mode-label">View:</span>
        <button
          class:active={progressMode === PROGRESS_MODES.APPROVED}
          type="button"
          on:click={() => (progressMode = PROGRESS_MODES.APPROVED)}
          title="Show only approved hours"
        >
          Approved
        </button>
        <button
          class:active={progressMode === PROGRESS_MODES.ALL}
          type="button"
          on:click={() => (progressMode = PROGRESS_MODES.ALL)}
          title="Show approved hours + pending overtime requests"
        >
          All Requests
        </button>
      </div>
    </div>

    {#if errorMessage}
      <div class="banner error">{errorMessage}</div>
    {/if}
    {#if successMessage}
      <div class="banner success">{successMessage}</div>
    {/if}

    <!-- KPI Row -->
    <div class="summary-grid" aria-busy={loading}>
      <div class="summary-card summary-card-hours">
        <div class="card-header">
          <h3>Hours Needed</h3>
          <span class="card-icon">🎯</span>
        </div>
        <div class="card-content">
          <div class="stat-value">{totalOjtHours || 0}</div>
          <div class="stat-label">total OJT hours</div>
        </div>
      </div>

      <div class="summary-card summary-card-completed">
        <div class="card-header">
          <h3>Hours Completed</h3>
          <span class="card-icon">⏱️</span>
        </div>
        <div class="card-content">
          <div class="stat-value">{hoursCompleted}</div>
          <div class="stat-label">all rendered hours</div>
        </div>
      </div>

      <div class="summary-card summary-card-remaining">
        <div class="card-header">
          <h3>Hours Remaining</h3>
          <span class="card-icon">🧭</span>
        </div>
        <div class="card-content">
          <div class="stat-value">{hoursRemaining}</div>
          <div class="stat-label">left to finish</div>
        </div>
      </div>

      <div class="summary-card summary-card-days">
        <div class="card-header">
          <h3>Working Days Needed</h3>
          <span class="card-icon">📅</span>
        </div>
        <div class="card-content">
          <div class="stat-value">{daysAndHoursNeeded}</div>
          <div class="stat-label">to complete OJT</div>
        </div>
      </div>
    </div>

    <!-- Estimated end date + progress -->
    <div class="wide-card estimated-end-card">
      <div class="wide-left">
        <h3>Estimated End Date</h3>
        <div class="wide-value date-highlight">{computedEstimatedEndDate ? formatDateLong(computedEstimatedEndDate) : '—'}</div>
        <div class="wide-meta">
          Start: {formStartDate ? formatDateLong(formStartDate) : '—'} • Weekdays only (Mon–Fri)
        </div>
      </div>

      <div class="wide-right">
        <div class="progress-top">
          <span class="progress-label">Progress</span>
          <span class="progress-stats">{hoursCompleted} / {totalOjtHours || 0} hrs</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style={`width: ${progressPercent}%`}></div>
        </div>
        <div class="progress-percent">{progressPercent}%</div>
      </div>
    </div>

    <!-- Recent Activity, Tasks and other dashboard content -->
    <div class="content-grid">
      <div class="card">
        <div class="card-header-main">
          <h3>Recent Activity</h3>
          <a href="/activity" class="view-all">View All →</a>
        </div>

        <div class="activity-list">
          {#if Array.isArray(activityLogs) && activityLogs.length}
            {#each activityLogs as item (item.id || item.activity_id || item.created_at || activityTitle(item))}
              <div class="activity-item">
                <div class={`activity-dot ${normalizeActivityDotKind(item)}`}></div>
                <div class="activity-content">
                  <p class="activity-title">{activityTitle(item)}</p>
                  <p class="activity-time">{activityWhen(item)}</p>
                </div>
              </div>
            {/each}
          {:else}
            <p class="empty">No recent activity yet.</p>
          {/if}
        </div>
      </div>

      <div class="card">
        <div class="card-header-main">
          <h3>Upcoming Tasks</h3>
          <a href="/tasks" class="view-all">View All →</a>
        </div>

        <div class="tasks-list">
          {#if Array.isArray(tasks) && tasks.length}
            {#each tasks as task (task.task_id || task.id || task.due_date || task.title)}
              <div class="task-item">
                <div class="task-info">
                  <p class="task-name">{String(task.title || task.name || 'Task')}</p>
                  <p class="task-deadline">
                    {task.due_date ? `Due: ${formatDateLong(String(task.due_date).slice(0, 10))}` : 'No due date'}
                  </p>
                </div>
                <span class={`priority-badge ${(String(task.priority || 'medium')).toLowerCase()}`}>
                  {String(task.priority || 'Medium')}
                </span>
              </div>
            {/each}
          {:else}
            <p class="empty">No upcoming tasks yet.</p>
          {/if}
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  .dashboard-page-shell {
    min-height: 100%;
    width: 100%;
    min-width: 0;
  }

  .dashboard-shell {
    --db-surface: #ffffff;
    --db-surface-soft: #f3f8ff;
    --db-border: #d7e3f1;
    --db-heading: #0f172a;
    --db-text: #1f2937;
    --db-muted: #60748e;
    position: relative;
    border-radius: 1.25rem;
    padding: 0.35rem;
    isolation: isolate;
    width: calc(100% + 3rem);
    min-width: 0;
    box-sizing: border-box;
    margin-top: -1.5rem;
    margin-left: -1.5rem;
    margin-right: -1.5rem;
  }

  .dashboard-shell::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -2;
    border-radius: 1.25rem;
    background: radial-gradient(130% 130% at 0% 0%, #e4f1ff 0%, #f7fbff 58%, #eef4fb 100%);
  }

  .dashboard-shell::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: 1.25rem;
    background-image: linear-gradient(112deg, rgba(15, 108, 189, 0.08), transparent 52%);
    pointer-events: none;
  }

  .dashboard-container {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    min-width: 0;
  }

  .welcome-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem 1.25rem;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: linear-gradient(115deg, #0f172a 0%, #0f6cbd 52%, #0ea5e9 100%);
    color: #ffffff;
    box-shadow: 0 24px 42px -34px rgba(2, 8, 23, 0.92);
  }

  .welcome-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: #ffffff;
    letter-spacing: 0.2px;
    font-family: var(--font-sans);
  }

  .welcome-subtitle {
    margin: 0.25rem 0 0;
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.95rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .profile-badge {
    display: inline-block;
    background: rgba(255, 255, 255, 0.25);
    color: #ffffff;
    padding: 0.3rem 0.7rem;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.4);
  }

  .profile-detail {
    color: rgba(255, 255, 255, 0.8);
    font-weight: 500;
  }

  .mode-label {
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.9rem;
  }

  .mode-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: rgba(15, 23, 42, 0.2);
    padding: 0.2rem;
  }

  .mode-toggle button {
    border: 1px solid transparent;
    background: transparent;
    color: #ffffff;
    padding: 0.45rem 0.75rem;
    border-radius: 999px;
    cursor: pointer;
    font-weight: 700;
    font-size: 0.9rem;
    transition: all 0.2s ease;
  }

  .mode-toggle button:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .mode-toggle button.active {
    background: rgba(255, 255, 255, 0.92);
    color: #111827;
    border-color: rgba(255, 255, 255, 0.92);
  }

  .banner {
    padding: 0.75rem 1rem;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
    background: #fff;
    font-size: 0.95rem;
  }

  .banner.error {
    border-color: #fecaca;
    background: #fef2f2;
    color: #991b1b;
  }

  .banner.success {
    border-color: #bbf7d0;
    background: #f0fdf4;
    color: #166534;
  }

  .wide-card {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
    gap: 1.25rem;
    padding: 1.25rem;
    border-radius: 12px;
    border: 1px solid var(--db-border);
    background: var(--db-surface);
    box-shadow: 0 18px 36px -30px rgba(15, 23, 42, 0.42);
  }

  .estimated-end-card {
    background: linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%);
    border: 1px solid #c9dffe;
    position: relative;
    overflow: hidden;
  }

  .estimated-end-card::before {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 300px;
    height: 300px;
    background: radial-gradient(circle, rgba(15, 108, 189, 0.08) 0%, transparent 70%);
    border-radius: 50%;
    transform: translate(40%, -30%);
    pointer-events: none;
  }

  .wide-left h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: var(--db-heading);
  }

  .wide-left,
  .wide-right {
    min-width: 0;
  }

  .wide-value {
    margin-top: 0.5rem;
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--db-heading);
  }

  .date-highlight {
    background: linear-gradient(135deg, #0f6cbd 0%, #0ea5e9 100%);
    color: #ffffff;
    padding: 0.75rem 1rem;
    border-radius: 10px;
    display: inline-block;
    box-shadow: 0 8px 20px -8px rgba(15, 108, 189, 0.4);
    font-size: 1.375rem;
    font-weight: 700;
    letter-spacing: 0.3px;
  }

  .wide-meta {
    margin-top: 0.35rem;
    color: var(--db-muted);
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }

  .progress-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }

  .progress-label {
    font-weight: 700;
    color: var(--db-heading);
    font-size: 1.1rem;
  }

  .progress-stats {
    color: var(--db-muted);
    font-size: 0.9rem;
  }

  .progress-percent {
    margin-top: 0.5rem;
    font-weight: 700;
    color: var(--db-heading);
    font-size: 1.8rem;
  }

  .muted {
    color: var(--db-muted);
    font-size: 0.9rem;
  }

  .profile-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.9rem;
    margin-top: 1rem;
  }

  .field-display {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    border: 1px solid #bed2e8;
    border-radius: 0.85rem;
    background: #edf4fb;
    padding: 0.75rem 0.85rem;
  }

  .field-display span {
    font-size: 0.85rem;
    font-weight: 700;
    color: #34506e;
  }

  .field-display p {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--db-heading);
  }

  .empty {
    margin: 0.25rem 0 0;
    color: var(--db-muted);
    font-size: 0.95rem;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
    gap: 1.5rem;
    margin-bottom: 0.25rem;
    min-width: 0;
  }

  .summary-card {
    position: relative;
    overflow: hidden;
    background: var(--db-surface);
    border: 1px solid var(--db-border);
    border-radius: 12px;
    padding: 1.5rem;
    color: var(--db-heading);
    box-shadow: 0 18px 36px -30px rgba(15, 23, 42, 0.42);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
    min-width: 0;
  }

  .summary-card::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 3px;
  }

  .summary-card-hours::before {
    background: linear-gradient(90deg, #0f6cbd, #38bdf8);
  }

  .summary-card-completed::before {
    background: linear-gradient(90deg, #0f766e, #34d399);
  }

  .summary-card-remaining::before {
    background: linear-gradient(90deg, #9333ea, #6366f1);
  }

  .summary-card-days::before {
    background: linear-gradient(90deg, #d97706, #f59e0b);
  }

  .summary-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 18px 36px -26px rgba(15, 23, 42, 0.45);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .card-header h3 {
    font-size: 0.95rem;
    font-weight: 700;
    margin: 0;
    color: var(--db-heading);
  }

  .card-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 0.7rem;
    background: #e8f2fd;
    color: #0f6cbd;
    border: 1px solid #bfdbfe;
    font-size: 1rem;
  }

  .summary-card-completed .card-icon {
    background: #ddfbea;
    color: #0f766e;
    border-color: #86efac;
  }

  .summary-card-remaining .card-icon {
    background: #ede9fe;
    color: #6d28d9;
    border-color: #c4b5fd;
  }

  .summary-card-days .card-icon {
    background: #fff3dd;
    color: #b45309;
    border-color: #fcd34d;
  }

  .card-content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .stat-value {
    font-size: 2.5rem;
    font-weight: 700;
    line-height: 1;
    color: var(--db-heading);
  }

  .stat-label {
    font-size: 0.9rem;
    color: var(--db-muted);
  }

  .progress-bar {
    width: 100%;
    height: 6px;
    background: #dbe7f5;
    border-radius: 3px;
    overflow: hidden;
    margin: 0.5rem 0;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #0f6cbd, #0ea5e9);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .content-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
    gap: 1.5rem;
    min-width: 0;
  }

  .card {
    background: var(--db-surface);
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 18px 36px -30px rgba(15, 23, 42, 0.42);
    border: 1px solid var(--db-border);
    transition: box-shadow 0.3s ease;
    min-width: 0;
  }

  .card:hover {
    box-shadow: 0 18px 36px -26px rgba(15, 23, 42, 0.45);
  }

  .card-header-main {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--db-border);
  }

  .card-header-main h3 {
    font-size: 1.1rem;
    font-weight: 700;
    margin: 0;
    color: var(--db-heading);
  }

  .view-all {
    color: #0f6cbd;
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 700;
    transition: color 0.3s ease;
  }

  .view-all:hover {
    color: #0e7490;
  }

  .activity-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-height: 400px;
    overflow-y: auto;
    padding-right: 0.5rem;
  }

  .activity-item {
    display: flex;
    gap: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #e3eef9;
    min-width: 0;
  }

  .activity-item:last-child {
    border-bottom: none;
  }

  .activity-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 4px;
  }

  .activity-dot.completed {
    background: #22c55e;
  }

  .activity-dot.submitted {
    background: #3b82f6;
  }

  .activity-dot.reviewed {
    background: #f59e0b;
  }

  .activity-dot.assigned {
    background: #8b5cf6;
  }

  .activity-content {
    flex: 1;
    min-width: 0;
  }

  .activity-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--db-heading);
    margin: 0 0 0.25rem 0;
  }

  .activity-time {
    font-size: 0.85rem;
    color: var(--db-muted);
    margin: 0;
  }

  .tasks-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-height: 400px;
    overflow-y: auto;
    padding-right: 0.5rem;
  }

  .task-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: #edf4fb;
    border: 1px solid #bed2e8;
    border-radius: 8px;
    transition: background 0.3s ease, border-color 0.3s ease;
    min-width: 0;
    gap: 0.75rem;
  }

  .task-item:hover {
    background: #e7f1fb;
    border-color: #97badc;
  }

  .task-info {
    flex: 1;
    min-width: 0;
  }

  .task-name {
    font-weight: 600;
    color: var(--db-heading);
    margin: 0 0 0.25rem 0;
    font-size: 0.95rem;
    overflow-wrap: anywhere;
  }

  .task-deadline {
    font-size: 0.85rem;
    color: var(--db-muted);
    margin: 0;
  }

  .priority-badge {
    display: inline-block;
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: capitalize;
  }

  .priority-badge.high {
    background: #ffe4e6;
    color: #be123c;
    border: 1px solid #fecdd3;
  }

  .priority-badge.medium {
    background: #fff7d6;
    color: #92400e;
    border: 1px solid #fde68a;
  }

  .priority-badge.low {
    background: #dcfce7;
    color: #166534;
    border: 1px solid #86efac;
  }

  :global(.dark) .dashboard-shell {
    --db-surface: #162338;
    --db-surface-soft: #1b2a42;
    --db-border: #2b3c57;
    --db-heading: #e5edf8;
    --db-text: #cfdceb;
    --db-muted: #9ab0cb;
  }

  :global(.dark) .dashboard-shell::before {
    background: radial-gradient(130% 130% at 0% 0%, #173459 0%, #101a2b 48%, #0b1422 100%);
  }

  :global(.dark) .dashboard-shell::after {
    background-image: linear-gradient(112deg, rgba(91, 177, 255, 0.12), transparent 55%);
  }

  :global(.dark) .summary-card,
  :global(.dark) .wide-card,
  :global(.dark) .card {
    box-shadow: 0 20px 38px -30px rgba(2, 8, 23, 0.95);
  }

  :global(.dark) .estimated-end-card {
    background: linear-gradient(135deg, #1a2d45 0%, #162338 100%);
    border: 1px solid #2b4570;
  }

  :global(.dark) .date-highlight {
    background: linear-gradient(135deg, #3b82f6 0%, #0ea5e9 100%);
    color: #ffffff;
    box-shadow: 0 8px 20px -8px rgba(59, 130, 246, 0.5);
  }

  :global(.dark) .card-icon {
    background: rgba(91, 177, 255, 0.16);
    color: #93c5fd;
    border-color: rgba(125, 211, 252, 0.4);
  }

  :global(.dark) .summary-card-completed .card-icon {
    background: rgba(16, 185, 129, 0.2);
    color: #6ee7b7;
    border-color: rgba(16, 185, 129, 0.45);
  }

  :global(.dark) .summary-card-remaining .card-icon {
    background: rgba(167, 139, 250, 0.25);
    color: #c4b5fd;
    border-color: rgba(196, 181, 253, 0.45);
  }

  :global(.dark) .summary-card-days .card-icon {
    background: rgba(245, 158, 11, 0.2);
    color: #fcd34d;
    border-color: rgba(245, 158, 11, 0.45);
  }

  :global(.dark) .progress-bar {
    background: #1a2c45;
  }

  :global(.dark) .task-item,
  :global(.dark) .field-display {
    background: #1a2c45;
    border-color: #334b6b;
  }

  :global(.dark) .task-item:hover {
    background: #233652;
    border-color: #49678f;
  }

  :global(.dark) .field-display span {
    color: #b7cde8;
  }

  :global(.dark) .priority-badge.high {
    background: rgba(251, 113, 133, 0.18);
    color: #fda4af;
    border-color: rgba(251, 113, 133, 0.4);
  }

  :global(.dark) .priority-badge.medium {
    background: rgba(250, 204, 21, 0.18);
    color: #fde047;
    border-color: rgba(250, 204, 21, 0.4);
  }

  :global(.dark) .priority-badge.low {
    background: rgba(34, 197, 94, 0.18);
    color: #86efac;
    border-color: rgba(34, 197, 94, 0.4);
  }

  @media (max-width: 768px) {
    .dashboard-shell {
      width: 100%;
      margin-top: 0;
      margin-left: 0;
      margin-right: 0;
      border-radius: 1rem;
      padding: 0;
    }

    .welcome-banner {
      flex-direction: column;
      align-items: flex-start;
    }

    .mode-toggle {
      width: 100%;
      justify-content: center;
    }

    .wide-card {
      grid-template-columns: 1fr;
    }

    .summary-grid {
      grid-template-columns: 1fr;
    }

    .content-grid {
      grid-template-columns: 1fr;
    }

    .profile-grid {
      grid-template-columns: 1fr;
    }

    .stat-value {
      font-size: 2rem;
    }
  }

  /* Scrollbar styling */
  .activity-list::-webkit-scrollbar,
  .tasks-list::-webkit-scrollbar {
    width: 6px;
  }

  .activity-list::-webkit-scrollbar-track,
  .tasks-list::-webkit-scrollbar-track {
    background: #f0f0f0;
    border-radius: 10px;
  }

  .activity-list::-webkit-scrollbar-thumb,
  .tasks-list::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 10px;
  }

  .activity-list::-webkit-scrollbar-thumb:hover,
  .tasks-list::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }

  :global(.dark) .activity-list::-webkit-scrollbar-track,
  :global(.dark) .tasks-list::-webkit-scrollbar-track {
    background: #1e293b;
  }

  :global(.dark) .activity-list::-webkit-scrollbar-thumb,
  :global(.dark) .tasks-list::-webkit-scrollbar-thumb {
    background: #475569;
  }

  :global(.dark) .activity-list::-webkit-scrollbar-thumb:hover,
  :global(.dark) .tasks-list::-webkit-scrollbar-thumb:hover {
    background: #64748b;
  }

  @media (max-width: 1100px) {
    .wide-card {
      grid-template-columns: 1fr;
    }

    .content-grid {
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
    }
  }
</style>