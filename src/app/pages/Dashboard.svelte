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
  const VISIBILITY_RELOAD_DELAY = 200;

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
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const month = monthNames[dt.getMonth()];
    const day = dt.getDate();
    const year = dt.getFullYear();
    return `${month} ${day}, ${year}`;
  }

  function normalizeDepartment(dept) {
    const d = String(dept || '').trim();
    if (d.toUpperCase() === 'INTERNATIONAL NOC') return 'ISOC';
    return d;
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
    const start = startDate instanceof Date ? new Date(startDate) : parseIsoDateOnly(startDate);
    if (!start || Number.isNaN(start.getTime())) return null;

    let remaining = Math.max(0, Math.trunc(Number(workingDays || 0)));
    const cursor = new Date(start);

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

      localStorage.removeItem('ojt_completed_hours');
      tasks = data.tasks;
      pendingRequests = data.pending_requests || [];

      const timeLogActivities = [];
      if (Array.isArray(data.time_logs)) {
        for (const log of data.time_logs) {
          const logDate = normalizeDateOnly(log?.log_date);
          const timeOutLabel = formatTime12Hour(log?.time_out);
          const timeInLabel = formatTime12Hour(log?.time_in);
          
          if (timeOutLabel) {
            timeLogActivities.push({
              id: `logout-${String(log?.timelog_id || '') || `${logDate}-${String(log?.time_out || '').trim()}`}`,
              type: 'logout',
              title: `Logged Out: ${timeOutLabel}`,
              created_at: buildActivityDateTime(logDate, log?.time_out),
            });
          }
          
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

      const allActivities = [...timeLogActivities, ...(Array.isArray(data.activity_logs) ? data.activity_logs : [])];
      allActivities.sort((a, b) => {
        const dateA = String(a?.created_at || '').trim();
        const dateB = String(b?.created_at || '').trim();
        return dateB.localeCompare(dateA);
      });
      activityLogs = allActivities;

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
      if (visibilityChangeTimeout) clearTimeout(visibilityChangeTimeout);
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
    if (currentUser?.user_id) {
      loadDashboard();
    }
  });

  onDestroy(() => {
    if (typeof unsubscribeAuth === 'function') unsubscribeAuth();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (visibilityChangeTimeout) clearTimeout(visibilityChangeTimeout);
  });
</script>

<div class="dashboard-root">
  <div class="body">
    {#if errorMessage}
      <div class="error-banner">{errorMessage}</div>
    {/if}
    {#if successMessage}
      <div class="success-banner">{successMessage}</div>
    {/if}

    {#if loading}
      <!-- Skeleton Loading State -->
      <!-- Welcome Banner Skeleton -->
      <div class="welcome-card skeleton-welcome">
        <div>
          <div class="skeleton skeleton-text" style="width: 200px; height: 24px; margin-bottom: 8px;"></div>
          <div class="skeleton skeleton-text" style="width: 300px; height: 16px;"></div>
        </div>
        <div class="view-toggle">
          <div class="skeleton skeleton-text" style="width: 60px; height: 32px; border-radius: 20px;"></div>
          <div class="skeleton skeleton-text" style="width: 80px; height: 32px; border-radius: 20px;"></div>
        </div>
      </div>

      <!-- Stat Cards Skeletons -->
      <div class="stat-grid">
        {#each [1,2,3,4] as _}
          <div class="stat-card skeleton-stat">
            <div class="skeleton skeleton-text" style="width: 60px; height: 12px; margin-bottom: 12px;"></div>
            <div class="skeleton skeleton-text" style="width: 50px; height: 32px;"></div>
            <div class="skeleton skeleton-text" style="width: 80px; height: 12px; margin-top: 8px;"></div>
          </div>
        {/each}
      </div>

      <!-- Mid Card Skeleton -->
      <div class="mid-card skeleton-mid">
        <div class="mid-left">
          <div class="skeleton skeleton-text" style="width: 100px; height: 11px; margin-bottom: 8px;"></div>
          <div class="skeleton skeleton-text" style="width: 140px; height: 28px; margin-bottom: 6px;"></div>
          <div class="skeleton skeleton-text" style="width: 250px; height: 14px;"></div>
        </div>
        <div class="mid-right mid-divider">
          <div class="skeleton skeleton-text" style="width: 80px; height: 14px; margin-bottom: 8px;"></div>
          <div class="skeleton skeleton-text" style="width: 100%; height: 6px; margin-bottom: 8px;"></div>
          <div class="skeleton skeleton-text" style="width: 50px; height: 28px;"></div>
        </div>
      </div>

      <!-- Bottom Grid Skeletons -->
      <div class="bottom-grid">
        <div class="bottom-card skeleton-bottom">
          <div class="bottom-card-header">
            <div class="skeleton skeleton-text" style="width: 100px; height: 16px;"></div>
            <div class="skeleton skeleton-text" style="width: 60px; height: 14px;"></div>
          </div>
          {#each [1,2,3] as _}
            <div class="activity-item">
              <div class="skeleton" style="width: 8px; height: 8px; border-radius: 50%; margin-top: 4px;"></div>
              <div style="flex: 1;">
                <div class="skeleton skeleton-text" style="width: 120px; height: 16px; margin-bottom: 4px;"></div>
                <div class="skeleton skeleton-text" style="width: 80px; height: 12px;"></div>
              </div>
            </div>
          {/each}
        </div>

        <div class="bottom-card skeleton-bottom">
          <div class="bottom-card-header">
            <div class="skeleton skeleton-text" style="width: 100px; height: 16px;"></div>
            <div class="skeleton skeleton-text" style="width: 60px; height: 14px;"></div>
          </div>
          {#each [1,2] as _}
            <div class="task-item">
              <div style="flex: 1;">
                <div class="skeleton skeleton-text" style="width: 140px; height: 16px; margin-bottom: 4px;"></div>
                <div class="skeleton skeleton-text" style="width: 90px; height: 12px;"></div>
              </div>
              <div class="skeleton skeleton-text" style="width: 50px; height: 24px; border-radius: 6px;"></div>
            </div>
          {/each}
        </div>
      </div>

    {:else}
      <!-- Actual Content (unchanged) -->
      <!-- Welcome banner -->
      <div class="welcome-card">
        <div>
          <div class="welcome-name">Welcome back, {currentUser?.full_name || 'Intern'}!</div>
          <div class="welcome-meta">
            <span class="badge">Intern</span>
            {#if readonlyDepartment}
              <span class="welcome-info">• {normalizeDepartment(readonlyDepartment)}</span>
            {/if}
            {#if readonlyCourse}
              <span class="welcome-info">• {readonlyCourse}</span>
            {/if}
            {#if readonlySchool}
              <span class="welcome-info">• {readonlySchool}</span>
            {/if}
          </div>
        </div>
        <div class="view-toggle">
          <span class="view-label">View:</span>
          <div class="toggle-group">
            <button
              class="toggle-btn"
              class:active={progressMode === PROGRESS_MODES.APPROVED}
              on:click={() => progressMode = PROGRESS_MODES.APPROVED}
            >Approved</button>
            <button
              class="toggle-btn"
              class:active={progressMode === PROGRESS_MODES.ALL}
              on:click={() => progressMode = PROGRESS_MODES.ALL}
            >All Requests</button>
          </div>
        </div>
      </div>

      <!-- Stat cards -->
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-top-bar bar-blue"></div>
          <div class="stat-label">Hours Needed</div>
          <div class="stat-icon icon-blue">🎯</div>
          <div class="stat-value">{totalOjtHours || 0}</div>
          <div class="stat-desc">total OJT hours</div>
        </div>
        <div class="stat-card">
          <div class="stat-top-bar bar-green"></div>
          <div class="stat-label">Hours Completed</div>
          <div class="stat-icon icon-green">✅</div>
          <div class="stat-value">{hoursCompleted}</div>
          <div class="stat-desc">all rendered hours</div>
        </div>
        <div class="stat-card">
          <div class="stat-top-bar bar-purple"></div>
          <div class="stat-label">Hours Remaining</div>
          <div class="stat-icon icon-purple">⏱️</div>
          <div class="stat-value">{hoursRemaining}</div>
          <div class="stat-desc">left to finish</div>
        </div>
        <div class="stat-card">
          <div class="stat-top-bar bar-amber"></div>
          <div class="stat-label">Working Days Needed</div>
          <div class="stat-icon icon-amber">📅</div>
          <div class="stat-value">{daysAndHoursNeeded}</div>
          <div class="stat-desc">to complete OJT</div>
        </div>
      </div>

      <!-- Mid card -->
      <div class="mid-card">
        <div class="mid-left">
          <div class="mid-section-label">Estimated End Date</div>
          <div class="mid-date">{computedEstimatedEndDate ? formatDateLong(computedEstimatedEndDate) : '—'}</div>
          <div class="mid-meta">Start: {startDateDisplay} • Weekdays only (Mon–Fri)</div>
        </div>
        <div class="mid-right mid-divider">
          <div class="progress-header">
            <span class="progress-label">Progress</span>
            <span class="progress-count">{hoursCompleted} / {totalOjtHours || 0} hrs</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: {progressPercent}%;"></div>
          </div>
          <div class="progress-pct">{progressPercent}%</div>
        </div>
      </div>

      <!-- Bottom grid -->
      <div class="bottom-grid">
        <div class="bottom-card">
          <div class="bottom-card-header">
            <span class="bottom-card-title">Recent Activity</span>
            <a href="/activity" class="view-all">View All →</a>
          </div>
          <div class="activity-list">
            {#if Array.isArray(activityLogs) && activityLogs.length}
              {#each activityLogs as item (item.id || item.activity_id || item.created_at || activityTitle(item))}
                <div class="activity-item">
                  <div class="dot {item.type === 'logout' ? 'dot-green' : 'dot-blue'}"></div>
                  <div>
                    <div class="activity-text">{activityTitle(item)}</div>
                    <div class="activity-date">{activityWhen(item)}</div>
                  </div>
                </div>
              {/each}
            {:else}
              <div class="empty-state">No recent activity yet.</div>
            {/if}
          </div>
        </div>

        <div class="bottom-card">
          <div class="bottom-card-header">
            <span class="bottom-card-title">Upcoming Tasks</span>
            <a href="/tasks" class="view-all">View All →</a>
          </div>
          <div class="tasks-list">
            {#if Array.isArray(tasks) && tasks.length}
              {#each tasks as task (task.task_id || task.id || task.due_date || task.title)}
                <div class="task-item">
                  <div class="task-info">
                    <div class="task-name">{String(task.title || task.name || 'Task')}</div>
                    <div class="task-deadline">
                      {task.due_date ? `Due: ${formatDateLong(String(task.due_date).slice(0, 10))}` : 'No due date'}
                    </div>
                  </div>
                  <span class="priority-badge priority-{String(task.priority || 'medium').toLowerCase()}">
                    {String(task.priority || 'Medium')}
                  </span>
                </div>
              {/each}
            {:else}
              <div class="empty-state">No upcoming tasks yet.</div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Reset and base */
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  .dashboard-root {
    font-family: var(--font-sans, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
    min-height: 100vh;
    background: #f0f2f8;
    transition: background 0.2s, color 0.2s;
  }

  /* Dark mode styles - triggered by parent .dark class */
  :global(.dark) .dashboard-root {
    background: #0f1929;
    color: #e2e8f0;
  }

  .body {
    padding: 20px;
  }

  /* Error / Success banners */
  .error-banner, .success-banner {
    padding: 10px 16px;
    border-radius: 12px;
    margin-bottom: 16px;
    font-size: 14px;
  }
  .error-banner {
    background: #fee2e2;
    border: 0.5px solid #fecaca;
    color: #991b1b;
  }
  .success-banner {
    background: #e0f2e7;
    border: 0.5px solid #bbf7d0;
    color: #166534;
  }
  :global(.dark) .error-banner {
    background: #2d1a1a;
    border-color: #5c2a2a;
    color: #fca5a5;
  }
  :global(.dark) .success-banner {
    background: #1a2a1f;
    border-color: #2a5c3a;
    color: #86efac;
  }

  /* Welcome card */
  .welcome-card {
    border-radius: 12px;
    padding: 18px 20px;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    background: #2355e8;
    color: #ffffff;
  }
  :global(.dark) .welcome-card {
    background: #1a2a5e;
    color: #e2e8f0;
    border: 0.5px solid #2a3a6e;
  }
  .welcome-name {
    font-size: 18px;
    font-weight: 500;
    margin-bottom: 6px;
  }
  .welcome-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .badge {
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
    background: rgba(255,255,255,0.2);
    color: #fff;
  }
  :global(.dark) .badge {
    background: rgba(255,255,255,0.1);
    color: #c9d3e0;
  }
  .welcome-info {
    font-size: 13px;
    color: rgba(255,255,255,0.85);
  }
  :global(.dark) .welcome-info {
    color: #8892a4;
  }
  .view-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .view-label {
    font-size: 13px;
    color: rgba(255,255,255,0.75);
  }
  .toggle-group {
    display: flex;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.3);
  }
  :global(.dark) .toggle-group {
    border-color: #2a3a6e;
  }
  .toggle-btn {
    padding: 5px 14px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    background: transparent;
    transition: background 0.15s;
    color: rgba(255,255,255,0.7);
  }
  .toggle-btn.active {
    background: rgba(255,255,255,0.25);
    color: #fff;
  }
  :global(.dark) .toggle-btn {
    color: #8892a4;
  }
  :global(.dark) .toggle-btn.active {
    background: #2a3a6e;
    color: #e2e8f0;
  }

  /* Stat grid */
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }
  .stat-card {
    border-radius: 12px;
    padding: 16px;
    border: 0.5px solid #e2e6f0;
    background: #ffffff;
    position: relative;
    overflow: hidden;
  }
  :global(.dark) .stat-card {
    background: #161b2e;
    border-color: #2a3050;
  }
  .stat-top-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    border-radius: 12px 12px 0 0;
  }
  .bar-blue { background: #2355e8; }
  .bar-green { background: #22c55e; }
  .bar-purple { background: #8b5cf6; }
  .bar-amber { background: #f59e0b; }
  .stat-label {
    font-size: 12px;
    font-weight: 500;
    margin-bottom: 10px;
    margin-top: 4px;
    color: #6b7280;
  }
  :global(.dark) .stat-label {
    color: #8892a4;
  }
  .stat-icon {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
  }
  .icon-blue { background: #eff6ff; }
  .icon-green { background: #f0fdf4; }
  .icon-purple { background: #faf5ff; }
  .icon-amber { background: #fffbeb; }
  :global(.dark) .icon-blue { background: #1e2a4a; }
  :global(.dark) .icon-green { background: #14291e; }
  :global(.dark) .icon-purple { background: #1e1a2e; }
  :global(.dark) .icon-amber { background: #2a2010; }
  .stat-value {
    font-size: 26px;
    font-weight: 500;
    margin-bottom: 4px;
  }
  .stat-desc {
    font-size: 12px;
    color: #9ca3af;
  }
  :global(.dark) .stat-desc {
    color: #4a5568;
  }

  /* Mid card */
  .mid-card {
    border-radius: 12px;
    padding: 18px 20px;
    margin-bottom: 16px;
    border: 0.5px solid #e2e6f0;
    background: #ffffff;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  :global(.dark) .mid-card {
    background: #161b2e;
    border-color: #2a3050;
  }
  .mid-divider {
    border-left: 0.5px solid #e2e6f0;
  }
  :global(.dark) .mid-divider {
    border-color: #2a3050;
  }
  .mid-left {
    padding-right: 24px;
  }
  .mid-right {
    padding-left: 24px;
  }
  .mid-section-label {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
    color: #9ca3af;
  }
  :global(.dark) .mid-section-label {
    color: #4a5568;
  }
  .mid-date {
    font-size: 22px;
    font-weight: 500;
    margin-bottom: 4px;
  }
  .mid-meta {
    font-size: 13px;
    color: #6b7280;
  }
  :global(.dark) .mid-meta {
    color: #8892a4;
  }
  .progress-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .progress-label {
    font-size: 13px;
    font-weight: 500;
  }
  .progress-count {
    font-size: 13px;
    color: #6b7280;
  }
  :global(.dark) .progress-count {
    color: #8892a4;
  }
  .progress-bar-bg {
    height: 6px;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
    background: #e2e6f0;
  }
  :global(.dark) .progress-bar-bg {
    background: #2a3050;
  }
  .progress-bar-fill {
    height: 100%;
    border-radius: 4px;
    background: #2355e8;
    width: 0%;
    transition: width 0.2s ease;
  }
  .progress-pct {
    font-size: 22px;
    font-weight: 500;
  }

  /* Bottom grid */
  .bottom-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .bottom-card {
    border-radius: 12px;
    padding: 18px 20px;
    border: 0.5px solid #e2e6f0;
    background: #ffffff;
  }
  :global(.dark) .bottom-card {
    background: #161b2e;
    border-color: #2a3050;
  }
  .bottom-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .bottom-card-title {
    font-size: 14px;
    font-weight: 500;
  }
  .view-all {
    font-size: 13px;
    color: #2355e8;
    cursor: pointer;
    text-decoration: none;
  }
  .activity-list, .tasks-list {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .activity-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 0.5px solid #f3f4f6;
  }
  :global(.dark) .activity-item {
    border-color: #1e2438;
  }
  .activity-item:last-child {
    border-bottom: none;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-top: 4px;
    flex-shrink: 0;
  }
  .dot-green { background: #22c55e; }
  .dot-blue { background: #3b82f6; }
  .activity-text {
    font-size: 14px;
    font-weight: 500;
  }
  .activity-date {
    font-size: 12px;
    margin-top: 2px;
    color: #9ca3af;
  }
  :global(.dark) .activity-date {
    color: #4a5568;
  }
  .task-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 0.5px solid #f3f4f6;
  }
  :global(.dark) .task-item {
    border-color: #1e2438;
  }
  .task-item:last-child {
    border-bottom: none;
  }
  .task-info {
    flex: 1;
  }
  .task-name {
    font-weight: 500;
    font-size: 14px;
    margin-bottom: 2px;
  }
  .task-deadline {
    font-size: 12px;
    color: #9ca3af;
  }
  :global(.dark) .task-deadline {
    color: #4a5568;
  }
  .priority-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    text-transform: capitalize;
  }
  .priority-high {
    background: #ffe4e6;
    color: #be123c;
    border: 1px solid #fecdd3;
  }
  .priority-medium {
    background: #fff7d6;
    color: #92400e;
    border: 1px solid #fde68a;
  }
  .priority-low {
    background: #dcfce7;
    color: #166534;
    border: 1px solid #86efac;
  }
  :global(.dark) .priority-high {
    background: rgba(251, 113, 133, 0.18);
    color: #fda4af;
    border-color: rgba(251, 113, 133, 0.4);
  }
  :global(.dark) .priority-medium {
    background: rgba(250, 204, 21, 0.18);
    color: #fde047;
    border-color: rgba(250, 204, 21, 0.4);
  }
  :global(.dark) .priority-low {
    background: rgba(34, 197, 94, 0.18);
    color: #86efac;
    border-color: rgba(34, 197, 94, 0.4);
  }
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 80px;
    font-size: 14px;
    color: #9ca3af;
  }
  :global(.dark) .empty-state {
    color: #4a5568;
  }

  /* ===== Skeleton Loading Styles ===== */
  .skeleton {
    position: relative;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.08);
    border-radius: 4px;
  }
  :global(.dark) .skeleton {
    background: rgba(255, 255, 255, 0.06);
  }

  .skeleton::after {
    content: "";
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    transform: translateX(-100%);
    background-image: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0) 0,
      rgba(255, 255, 255, 0.3) 20%,
      rgba(255, 255, 255, 0.6) 60%,
      rgba(255, 255, 255, 0)
    );
    animation: shimmer 1.5s infinite;
  }
  :global(.dark) .skeleton::after {
    background-image: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0) 0,
      rgba(255, 255, 255, 0.05) 20%,
      rgba(255, 255, 255, 0.1) 60%,
      rgba(255, 255, 255, 0)
    );
  }

  @keyframes shimmer {
    100% {
      transform: translateX(100%);
    }
  }

  .skeleton-text {
    background: rgba(0, 0, 0, 0.08);
    border-radius: 6px;
    height: 1em;
  }
  :global(.dark) .skeleton-text {
    background: rgba(255, 255, 255, 0.06);
  }

  .skeleton-welcome {
    background: #2355e8;
  }
  :global(.dark) .skeleton-welcome {
    background: #1a2a5e;
    border: 0.5px solid #2a3a6e;
  }

  .skeleton-stat {
    background: #ffffff;
  }
  :global(.dark) .skeleton-stat {
    background: #161b2e;
    border-color: #2a3050;
  }

  .skeleton-mid {
    background: #ffffff;
  }
  :global(.dark) .skeleton-mid {
    background: #161b2e;
    border-color: #2a3050;
  }

  .skeleton-bottom {
    background: #ffffff;
  }
  :global(.dark) .skeleton-bottom {
    background: #161b2e;
    border-color: #2a3050;
  }

  /* Responsive */
  @media (max-width: 600px) {
    .stat-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .mid-card {
      grid-template-columns: 1fr;
    }
    .bottom-grid {
      grid-template-columns: 1fr;
    }
    .mid-divider {
      border-left: none;
      border-top: 0.5px solid #e2e6f0;
      padding-top: 16px;
      padding-left: 0;
      margin-top: 12px;
    }
    :global(.dark) .mid-divider {
      border-color: #2a3050;
    }
  }
</style>