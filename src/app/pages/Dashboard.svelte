<script>
  import { onDestroy, onMount } from 'svelte';
  import {
    getCurrentUser,
    subscribeToCurrentUser,
    getStudentDashboard,
  } from '../lib/auth.js';
  import { Target, CheckCircle, Hourglass, CalendarDays, ClipboardList, ArrowRight } from 'lucide-svelte';
  import { getEstimatedCompletionDate } from '../lib/getEstimatedCompletionDate.js';
  
  const PROGRESS_MODES = {
    APPROVED: 'APPROVED',
    ALL: 'ALL',
  };

  let visibilityChangeTimeout = null;
  const VISIBILITY_RELOAD_DELAY = 200;
  let lastLoadTime = 0;
  const RELOAD_COOLDOWN = 5 * 60 * 1000;

  let currentUser = getCurrentUser();
  let unsubscribeAuth = null;

  let loading = true;
  let errorMessage = '';
  let successMessage = '';

  let progressMode = PROGRESS_MODES.APPROVED;
  let profile = null;
  let timeLogs = [];
  let totalCompletedHours = 0;
  let activityLogs = [];
  let tasks = [];
  let pendingRequests = [];

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
  $: avgDailyHours = 8; // You can make this dynamic if needed
  $: totalWorkingDays = Math.ceil(Math.max(0, totalOjtHours) / avgDailyHours);
  $: remainingWorkingDays = Math.ceil(Math.max(0, hoursRemaining) / avgDailyHours);
  $: estimatedEndDateDisplay = (formStartDate && hoursRemaining > 0)
    ? getEstimatedCompletionDate(hoursRemaining, avgDailyHours)
    : 'Not available yet';
  $: startDateDisplay = formStartDate ? formatDateLong(formStartDate) : 'Not set yet';
  $: progressPercent = totalOjtHours > 0 ? Math.min(100, Math.round((hoursCompleted / totalOjtHours) * 100)) : 0;
  $: progressFooterRemaining = `${Number(hoursRemaining || 0).toFixed(1)}h remaining`;

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

    try {
      lastLoadTime = Date.now();
    } catch (e) {
      // ignore
    }

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
      const now = Date.now();
      if (now - lastLoadTime <= RELOAD_COOLDOWN) {
        return;
      }
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
  <section class="dashboard-shell">
    {#if errorMessage}
      <div class="error-banner">{errorMessage}</div>
    {/if}

    {#if successMessage}
      <div class="success-banner">{successMessage}</div>
    {/if}

    {#if loading}
      <div class="dash-banner dash-banner-skeleton">
        <div class="dash-banner-copy">
          <div class="skeleton skeleton-text" style="width: 240px; height: 24px;"></div>
          <div class="dash-banner-tags">
            <div class="skeleton skeleton-text" style="width: 68px; height: 26px; border-radius: 999px;"></div>
            <div class="skeleton skeleton-text" style="width: 260px; height: 14px;"></div>
          </div>
        </div>
        <div class="dash-view-toggle">
          <div class="skeleton skeleton-text" style="width: 90px; height: 30px; border-radius: 999px;"></div>
          <div class="skeleton skeleton-text" style="width: 108px; height: 30px; border-radius: 999px;"></div>
        </div>
      </div>

      <div class="dash-stat-grid">
        {#each [1, 2, 3, 4] as _}
          <div class="dash-stat-card skeleton-stat">
            <div class="skeleton skeleton-icon"></div>
            <div class="dash-stat-body">
              <div class="skeleton-text" style="width: 80px; height: 11px;"></div>
              <div class="skeleton-text" style="width: 60px; height: 24px; margin: 8px 0 4px;"></div>
              <div class="skeleton-text" style="width: 100px; height: 12px;"></div>
            </div>
          </div>
        {/each}
      </div>

      <div class="dash-mid-grid">
        <div class="dash-card">
          <div class="skeleton skeleton-text" style="width: 120px; height: 11px;"></div>
          <div class="skeleton skeleton-text" style="width: 190px; height: 34px;"></div>
          <div class="skeleton skeleton-text" style="width: 250px; height: 14px;"></div>
        </div>
        <div class="dash-card">
          <div class="dash-progress-top">
            <div class="skeleton skeleton-text" style="width: 80px; height: 14px;"></div>
            <div class="skeleton skeleton-text" style="width: 95px; height: 14px;"></div>
          </div>
          <div class="skeleton skeleton-text" style="width: 100%; height: 8px; border-radius: 999px;"></div>
          <div class="skeleton skeleton-text" style="width: 64px; height: 30px;"></div>
          <div class="dash-progress-footer">
            <div class="skeleton skeleton-text" style="width: 30px; height: 12px;"></div>
            <div class="skeleton skeleton-text" style="width: 98px; height: 12px;"></div>
            <div class="skeleton skeleton-text" style="width: 40px; height: 12px;"></div>
          </div>
        </div>
      </div>

      <div class="dash-bottom-grid">
        <div class="dash-panel skeleton-card">
          <div class="dash-panel-header">
            <div class="skeleton skeleton-text" style="width: 100px; height: 16px;"></div>
            <div class="skeleton skeleton-text" style="width: 80px; height: 14px;"></div>
          </div>
          {#each [1, 2, 3] as _}
            <div class="dash-activity-item">
              <div class="skeleton" style="width: 8px; height: 8px; border-radius: 50%; margin-top: 4px;"></div>
              <div style="flex: 1;">
                <div class="skeleton skeleton-text" style="width: 120px; height: 16px; margin-bottom: 4px;"></div>
                <div class="skeleton skeleton-text" style="width: 80px; height: 12px;"></div>
              </div>
            </div>
          {/each}
        </div>

        <div class="dash-panel skeleton-card">
          <div class="dash-panel-header">
            <div class="skeleton skeleton-text" style="width: 100px; height: 16px;"></div>
            <div class="skeleton skeleton-text" style="width: 80px; height: 14px;"></div>
          </div>
          {#each [1, 2] as _}
            <div class="dash-task-item">
              <div style="flex: 1;">
                <div class="skeleton skeleton-text" style="width: 140px; height: 16px; margin-bottom: 4px;"></div>
                <div class="skeleton skeleton-text" style="width: 90px; height: 12px;"></div>
              </div>
              <div class="skeleton skeleton-text" style="width: 70px; height: 24px; border-radius: 999px;"></div>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="dash-banner">
        <div class="dash-banner-copy">
          <div class="dash-banner-title">Welcome back, {currentUser?.full_name || 'Intern'}!</div>
          <div class="dash-banner-tags">
            <span class="dash-badge">Intern</span>
            <div class="dash-banner-meta">
              {#if readonlyDepartment}
                <span>{normalizeDepartment(readonlyDepartment)}</span>
              {/if}
              {#if readonlyCourse}
                <span>{readonlyCourse}</span>
              {/if}
              {#if readonlySchool}
                <span>{readonlySchool}</span>
              {/if}
            </div>
          </div>
        </div>

        <div class="dash-view-toggle">
          <button
            type="button"
            class="dash-view-btn"
            class:active={progressMode === PROGRESS_MODES.APPROVED}
            on:click={() => progressMode = PROGRESS_MODES.APPROVED}
          >
            Approved
          </button>
          <button
            type="button"
            class="dash-view-btn"
            class:active={progressMode === PROGRESS_MODES.ALL}
            on:click={() => progressMode = PROGRESS_MODES.ALL}
          >
            All Requests
          </button>
        </div>
      </div>

      <div class="dash-stat-grid">
        <div class="dash-stat-card">
          <div class="dash-stat-icon tone-blue">
            <Target size={16} />
          </div>
          <div class="dash-stat-body">
            <div class="dash-stat-label">Hours Needed</div>
            <div class="dash-stat-value">{totalOjtHours || 0}</div>
            <div class="dash-stat-sub">total OJT hours</div>
          </div>
        </div>

        <div class="dash-stat-card">
          <div class="dash-stat-icon tone-green">
            <CheckCircle size={16} />
          </div>
          <div class="dash-stat-body">
            <div class="dash-stat-label">Hours Completed</div>
            <div class="dash-stat-value">{Number(hoursCompleted || 0).toFixed(1)}</div>
            <div class="dash-stat-sub">all rendered hours</div>
          </div>
        </div>

        <div class="dash-stat-card">
          <div class="dash-stat-icon tone-amber">
            <Hourglass size={16} />
          </div>
          <div class="dash-stat-body">
            <div class="dash-stat-label">Hours Remaining</div>
            <div class="dash-stat-value">{Number(hoursRemaining || 0).toFixed(1)}</div>
            <div class="dash-stat-sub">left to finish</div>
          </div>
        </div>

        <div class="dash-stat-card">
          <div class="dash-stat-icon tone-purple">
            <CalendarDays size={16} />
          </div>
          <div class="dash-stat-body">
            <div class="dash-stat-label">Working Days Needed</div>
            <div class="dash-stat-value">{remainingWorkingDays} <span class="dash-stat-unit">days</span></div>
            <div class="dash-stat-sub">to complete OJT</div>
          </div>
        </div>
      </div>

      <div class="dash-mid-grid">
        <div class="dash-card dash-progress-card">
          <div class="dash-progress-top">
            <span class="dash-progress-label">Progress</span>
            <span class="dash-progress-count dash-progress-yellow">{Number(hoursCompleted || 0).toFixed(1)} / {totalOjtHours || 0} hrs</span>
          </div>
          <div class="dash-progress-track">
            <div class="dash-progress-fill" style="width: {Math.max(progressPercent, 0.5)}%;"></div>
          </div>
          <div class="dash-progress-percent">{progressPercent}%</div>
          <div class="dash-progress-footer">
            <span>0h</span>
            <span class="dash-progress-remaining">{progressFooterRemaining}</span>
            <span>{totalOjtHours || 0}h</span>
          </div>
        </div>

        <div class="dash-card">
          <div class="dash-section-label">Estimated End Date</div>
          <div class="dash-end-value">{estimatedEndDateDisplay}</div>
          <div class="dash-end-meta">Start: {startDateDisplay} · Weekdays only (Mon-Fri)</div>
        </div>
      </div>

      <div class="dash-bottom-grid">
        <div class="dash-panel">
          <div class="dash-panel-header">
            <span class="dash-panel-title">Recent Activity</span>
          </div>
          <div class="dash-panel-body">
            {#if Array.isArray(activityLogs) && activityLogs.length}
              {#each activityLogs as item (item.id || item.activity_id || item.created_at || activityTitle(item))}
                <div class="dash-activity-item">
                  <div class="dash-activity-dot dash-activity-{normalizeActivityDotKind(item)}"></div>
                  <div>
                    <div class="dash-activity-title">{activityTitle(item)}</div>
                    <div class="dash-activity-date">{activityWhen(item)}</div>
                  </div>
                </div>
              {/each}
            {:else}
              <div class="dash-empty-state">
                <div class="dash-empty-icon">
                  <ClipboardList size={20} />
                </div>
                <div class="dash-empty-text">No recent activity yet.</div>
                <div class="dash-empty-sub">Your logged actions and updates will appear here.</div>
              </div>
            {/if}
          </div>
        </div>

        <div class="dash-panel">
          <div class="dash-panel-header">
            <span class="dash-panel-title">Upcoming Tasks</span>
          </div>
          <div class="dash-panel-body">
            {#if Array.isArray(tasks) && tasks.length}
              {#each tasks as task (task.task_id || task.id || task.due_date || task.title)}
                <div class="dash-task-item">
                  <div class="dash-task-info">
                    <div class="dash-task-name">{String(task.title || task.name || 'Task')}</div>
                    <div class="dash-task-deadline">
                      {task.due_date ? `Due: ${formatDateLong(String(task.due_date).slice(0, 10))}` : 'No due date'}
                    </div>
                  </div>
                  <span class="dash-priority-badge dash-priority-{String(task.priority || 'medium').toLowerCase()}">
                    {String(task.priority || 'Medium')}
                  </span>
                </div>
              {/each}
            {:else}
              <div class="dash-empty-state">
                <div class="dash-empty-icon">
                  <ClipboardList size={20} />
                </div>
                <div class="dash-empty-text">No upcoming tasks yet.</div>
                <div class="dash-empty-sub">Tasks assigned to you will appear here.</div>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </section>
</div>

<style>
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  .dashboard-root {
    min-height: 100%;
    background: var(--color-app-bg);
    color: #0f172a;
    font-family: 'DM Sans', sans-serif;
  }

  :global(.dark) .dashboard-root {
    color: #f1f5f9;
  }

  .dashboard-shell {
    display: flex;
    flex-direction: column;
    gap: 20px;
    min-width: 0;
  }

  .error-banner,
  .success-banner {
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
  }

  .error-banner {
    background: rgba(220, 38, 38, 0.12);
    border: 1px solid rgba(220, 38, 38, 0.25);
    color: #dc2626;
  }

  .success-banner {
    background: rgba(22, 163, 74, 0.12);
    border: 1px solid rgba(22, 163, 74, 0.22);
    color: #15803d;
  }

  :global(.dark) .error-banner {
    color: #f87171;
  }

  :global(.dark) .success-banner {
    color: #4ade80;
  }

  .dash-banner {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    padding: 24px 28px;
    border-radius: 14px;
    background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #3b82f6 100%);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
    color: #ffffff;
  }

  .dash-banner::before {
    content: '';
    position: absolute;
    top: -40px;
    right: -40px;
    width: 200px;
    height: 200px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.04);
  }

  .dash-banner::after {
    content: '';
    position: absolute;
    bottom: -60px;
    right: 80px;
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.03);
  }

  :global(.dark) .dash-banner {
    background: linear-gradient(135deg, #0f1b35 0%, #1a2d5a 60%, #1e3a8a 100%);
  }

  .dash-banner-copy,
  .dash-view-toggle {
    position: relative;
    z-index: 1;
  }

  .dash-banner-copy {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .dash-banner-title {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.3px;
  }

  .dash-banner-tags {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .dash-badge {
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 600;
    color: #ffffff;
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.25);
  }

  .dash-banner-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 12.5px;
    color: rgba(255, 255, 255, 0.72);
  }

  .dash-banner-meta span::before {
    content: '•';
    margin-right: 8px;
    opacity: 0.55;
  }

  .dash-banner-meta span:first-child::before {
    display: none;
  }

  .dash-view-toggle {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .dash-view-btn {
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.66);
    padding: 5px 14px;
    border-radius: 999px;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .dash-view-btn.active {
    background: rgba(255, 255, 255, 0.95);
    color: #1e3a8a;
  }

  .dash-stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
  }

  .dash-stat-card,
  .dash-card,
  .dash-panel {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03);
  }

  :global(.dark) .dash-stat-card,
  :global(.dark) .dash-card,
  :global(.dark) .dash-panel {
    background: #161c27;
    border-color: rgba(255, 255, 255, 0.06);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  }

  .dash-stat-card {
    position: relative;
    overflow: hidden;
    padding: 18px 20px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    transition: box-shadow 0.2s, transform 0.2s;
  }

  .dash-stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  }

  :global(.dark) .dash-stat-card:hover {
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
  }

  .dash-stat-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .dash-stat-label,
  .dash-section-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #000000;
  }

  :global(.dark) .dash-stat-label,
  :global(.dark) .dash-section-label {
    color: #ffffff;
  }

  .dash-stat-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  .dash-stat-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tone-blue {
    background: rgba(37, 99, 235, 0.12);
    color: #2563eb;
  }

  .tone-green {
    background: rgba(22, 163, 74, 0.12);
    color: #16a34a;
  }

  .tone-amber {
    background: rgba(217, 119, 6, 0.12);
    color: #d97706;
  }

  .tone-purple {
    background: rgba(124, 58, 237, 0.12);
    color: #7c3aed;
  }

  :global(.dark) .tone-blue {
    background: rgba(59, 130, 246, 0.18);
    color: #60a5fa;
  }

  :global(.dark) .tone-green {
    background: rgba(34, 197, 94, 0.14);
    color: #22c55e;
  }

  :global(.dark) .tone-amber {
    background: rgba(245, 158, 11, 0.12);
    color: #f59e0b;
  }

  :global(.dark) .tone-purple {
    background: rgba(167, 139, 250, 0.14);
    color: #a78bfa;
  }

  .dash-stat-value {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.8px;
    line-height: 1;
    color: #0f172a;
  }

  :global(.dark) .dash-stat-value {
    color: #f1f5f9;
  }

  .dash-stat-unit {
    font-size: 16px;
    font-weight: 500;
    color: #64748b;
  }

  .dash-stat-sub {
    margin-top: 4px;
    font-size: 11.5px;
    color: #64748b;
  }

  :global(.dark) .dash-stat-sub,
  :global(.dark) .dash-stat-unit {
    color: #94a3b8;
  }

  .dash-mid-grid {
    display: grid;
    grid-template-columns: 1.6fr 1fr;
    gap: 14px;
  }

  .dash-card {
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .dash-end-value {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.8px;
    color: #0f172a;
  }

  :global(.dark) .dash-end-value {
    color: #f1f5f9;
  }

  .dash-end-meta {
    font-size: 12.5px;
    color: #64748b;
  }

  :global(.dark) .dash-end-meta {
    color: #94a3b8;
  }

  .dash-progress-card {
    gap: 10px;
  }

  .dash-progress-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .dash-progress-label {
    font-size: 14px;
    font-weight: 600;
    color: #0f172a;
  }

  .dash-progress-count {
    font-size: 12px;
    font-family: 'DM Mono', monospace;
    color: #64748b;
  }

  .dash-progress-track {
    height: 8px;
    background: #f0f4f8;
    border: 1px solid #e2e8f0;
    border-radius: 999px;
    overflow: hidden;
  }

  :global(.dark) .dash-progress-track {
    background: #0d1117;
    border-color: rgba(255, 255, 255, 0.06);
  }

  .dash-progress-fill {
    height: 100%;
    min-width: 2px;
    border-radius: 999px;
    background: linear-gradient(90deg, #2563eb, #3b82f6);
    box-shadow: 0 0 8px rgba(37, 99, 235, 0.12);
  }

  :global(.dark) .dash-progress-fill {
    background: linear-gradient(90deg, #3b82f6, #60a5fa);
    box-shadow: 0 0 8px rgba(59, 130, 246, 0.18);
  }

  .dash-progress-percent {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.6px;
    color: #0f172a;
  }

  :global(.dark) .dash-progress-percent,
  :global(.dark) .dash-progress-label {
    color: #f1f5f9;
  }

  .dash-progress-footer {
    display: flex;
    justify-content: space-between;
    font-size: 11.5px;
    font-family: 'DM Mono', monospace;
    color: #94a3b8;
  }

  .dash-progress-remaining {
    color: #2563eb;
  }

  :global(.dark) .dash-progress-count,
  :global(.dark) .dash-progress-footer {
    color: #94a3b8;
  }

  :global(.dark) .dash-progress-remaining {
    color: #60a5fa;
  }

  .dash-bottom-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    align-items: stretch;
  }

  .dash-panel {
    min-height: 340px;
    max-height: 340px;
    height: 340px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .dash-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 22px;
    border-bottom: 1px solid #e2e8f0;
  }

  :global(.dark) .dash-panel-header {
    border-color: rgba(255, 255, 255, 0.06);
  }

  .dash-panel-title {
    font-size: 14px;
    font-weight: 600;
    color: #0f172a;
  }

  :global(.dark) .dash-panel-title {
    color: #f1f5f9;
  }

  .dash-panel-link {
    display: flex;
    align-items: center;
    gap: 4px;
    color: #3b82f6;
    font-size: 12px;
    font-weight: 600;
    text-decoration: none;
    transition: opacity 0.15s ease;
  }

  .dash-panel-link:hover {
    opacity: 0.78;
  }

  .dash-panel-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    overflow-y: auto;
    min-height: 0;
  }

  .dash-activity-item,
  .dash-task-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 22px;
    border-bottom: 1px solid #e2e8f0;
    transition: background 0.15s ease;
    min-height: 48px;
  }

  .dash-task-item {
    align-items: center;
    justify-content: space-between;
  }

  .dash-activity-item:hover,
  .dash-task-item:hover {
    background: rgba(37, 99, 235, 0.08);
  }

  :global(.dark) .dash-activity-item,
  :global(.dark) .dash-task-item {
    border-color: rgba(255, 255, 255, 0.06);
  }

  :global(.dark) .dash-activity-item:hover,
  :global(.dark) .dash-task-item:hover {
    background: rgba(59, 130, 246, 0.12);
  }

  .dash-activity-item:last-child,
  .dash-task-item:last-child {
    border-bottom: none;
  }

  .dash-activity-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-top: 4px;
    flex-shrink: 0;
  }

  .dash-activity-submitted {
    background: #3b82f6;
  }

  .dash-activity-completed {
    background: #22c55e;
  }

  .dash-activity-reviewed {
    background: #f59e0b;
  }

  .dash-activity-assigned {
    background: #a78bfa;
  }

  .dash-activity-title,
  .dash-task-name {
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
  }

  :global(.dark) .dash-activity-title,
  :global(.dark) .dash-task-name {
    color: #f1f5f9;
  }

  .dash-activity-date,
  .dash-task-deadline {
    margin-top: 2px;
    font-size: 11.5px;
    color: #64748b;
  }

  :global(.dark) .dash-activity-date,
  :global(.dark) .dash-task-deadline {
    color: #94a3b8;
  }

  .dash-task-info {
    flex: 1;
  }

  .dash-priority-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    text-transform: capitalize;
  }

  .dash-priority-high {
    background: #ffe4e6;
    color: #be123c;
    border: 1px solid #fecdd3;
  }

  .dash-priority-medium {
    background: #fff7d6;
    color: #92400e;
    border: 1px solid #fde68a;
  }

  .dash-priority-low {
    background: #dcfce7;
    color: #166534;
    border: 1px solid #86efac;
  }

  :global(.dark) .dash-priority-high {
    background: rgba(251, 113, 133, 0.18);
    color: #fda4af;
    border-color: rgba(251, 113, 133, 0.4);
  }

  :global(.dark) .dash-priority-medium {
    background: rgba(250, 204, 21, 0.18);
    color: #fde047;
    border-color: rgba(250, 204, 21, 0.4);
  }

  :global(.dark) .dash-priority-low {
    background: rgba(34, 197, 94, 0.18);
    color: #86efac;
    border-color: rgba(34, 197, 94, 0.4);
  }

  .dash-empty-state {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 32px 10px;
    color: #94a3b8;
    min-height: 0;
  }

  .dash-empty-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
  }

  .dash-empty-text {
    font-size: 13px;
    font-weight: 500;
    color: #000000;
  }

  .dash-empty-sub {
    font-size: 11.5px;
    text-align: center;
    color: #000000;
  }

  :global(.dark) .dash-empty-text,
  :global(.dark) .dash-empty-sub {
    color: #ffffff;
  }

  :global(.dark) .dash-empty-state {
    color: #4b5563;
  }

  :global(.dark) .dash-empty-icon {
    background: #1e2736;
    border-color: rgba(255, 255, 255, 0.06);
  }

  .skeleton {
    position: relative;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.08);
    border-radius: 6px;
  }

  :global(.dark) .skeleton {
    background: rgba(255, 255, 255, 0.06);
  }

  .skeleton::after {
    content: "";
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background-image: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0) 0,
      rgba(255, 255, 255, 0.3) 20%,
      rgba(255, 255, 255, 0.6) 60%,
      rgba(255, 255, 255, 0) 100%
    );
    animation: shimmer 1.5s infinite;
  }

  :global(.dark) .skeleton::after {
    background-image: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0) 0,
      rgba(255, 255, 255, 0.05) 20%,
      rgba(255, 255, 255, 0.1) 60%,
      rgba(255, 255, 255, 0) 100%
    );
  }

  .skeleton-text {
    background: rgba(0, 0, 0, 0.08);
    border-radius: 6px;
    height: 1em;
  }

  :global(.dark) .skeleton-text {
    background: rgba(255, 255, 255, 0.06);
  }

  .skeleton-icon { width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0; }
  .skeleton-icon-sm { width: 28px; height: 28px; border-radius: 6px; }
  .skeleton-field { height: 44px; border-radius: 8px; margin: 4px 0; }
  .skeleton-btn { height: 44px; border-radius: 8px; margin-top: 8px; }
  .skeleton-chart { height: 160px; border-radius: 8px; margin-top: 8px; }
  .skeleton-progress-track { height: 8px; border-radius: 999px; margin: 12px 0 8px; }
  .skeleton-stat .dash-stat-body { flex: 1; }
  .skeleton-stat { display: flex; align-items: flex-start; gap: 14px; }

  .dash-banner-skeleton {
    background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #3b82f6 100%);
  }

  :global(.dark) .dash-banner-skeleton {
    background: linear-gradient(135deg, #0f1b35 0%, #1a2d5a 60%, #1e3a8a 100%);
  }

  @keyframes shimmer {
    100% {
      transform: translateX(100%);
    }
  }

  @media (max-width: 1024px) {
    .dash-stat-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .dash-mid-grid,
    .dash-bottom-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .dashboard-shell {
      gap: 16px;
    }

    .dash-banner {
      padding: 20px;
      flex-direction: column;
      align-items: stretch;
    }
  }

  @media (max-width: 560px) {
    .dash-stat-grid {
      grid-template-columns: 1fr;
    }

    .dash-banner-title {
      font-size: 18px;
    }


    .dash-end-value,
    .dash-progress-percent,
    .dash-stat-value {
      font-size: 24px;
    }
  }

  .dash-progress-yellow {
    color: #facc15 !important; /* Tailwind yellow-400 */
  }
  :global(.dark) .dash-progress-yellow {
    color: #fde047 !important; /* Tailwind yellow-300 for dark mode */
  }
</style>
