<script>
  import { onDestroy, onMount } from 'svelte';
  import {
    getCurrentUser,
    subscribeToCurrentUser,
    getStudentDashboard,
    upsertStudentOjtProfile,
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

  // Editable form state
  let formStartDate = '';
  let formTotalOjtHours = 0;
  let readonlyCourse = '';
  let readonlySchool = '';

  function clearMessages() {
    errorMessage = '';
    successMessage = '';
  }

  function parseIsoDateOnly(value) {
    // Accepts "YYYY-MM-DD" and returns Date in local time.
    const raw = String(value || '').trim();
    if (!raw) return null;
    const m = raw.match(/^\d{4}-\d{2}-\d{2}$/);
    if (!m) return null;
    const [y, mo, d] = raw.split('-').map((n) => Number(n));
    const dt = new Date(y, mo - 1, d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  }

  function formatDateLong(dateInput) {
    if (!dateInput) return '';
    const dt = typeof dateInput === 'string' ? parseIsoDateOnly(dateInput) : dateInput;
    if (!dt) return '';
    // Use MM/DD/YYYY for clarity (local-independent)
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    const yyyy = String(dt.getFullYear());
    return `${mm}/${dd}/${yyyy}`;
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

  $: totalOjtHours = Number(formTotalOjtHours || profile?.total_ojt_hours || 0);
  $: hoursCompleted = totalCompletedHours;
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
  $: computedEstimatedEndDateObj = formStartDate
    ? addWorkingDays(parseIsoDateOnly(formStartDate), Math.max(0, totalWorkingDays - 1))
    : null;
  $: computedEstimatedEndDate = computedEstimatedEndDateObj ? toIsoDateOnly(computedEstimatedEndDateObj) : '';

  $: progressPercent = totalOjtHours > 0 ? Math.min(100, Math.round((hoursCompleted / totalOjtHours) * 100)) : 0;

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
      // Read completed hours from localStorage (synced by TimeLog page), fallback to backend if empty
      totalCompletedHours = Number(localStorage.getItem('ojt_completed_hours') ?? data.total_completed_hours ?? 0);
      tasks = data.tasks;

      // Create activity items from time logs (Logged In / Logged Out entries)
      const timeLogActivities = [];
      if (Array.isArray(data.time_logs)) {
        for (const log of data.time_logs) {
          const logDate = String(log?.log_date || '').trim();
          
          // Add "Logged Out" entry if time_out exists
          if (String(log?.time_out || '').trim()) {
            timeLogActivities.push({
              id: `logout-${logDate}`,
              type: 'logout',
              title: `Logged Out: ${String(log.time_out || '').trim()}`,
              created_at: `${logDate}T${String(log.time_out || '').trim()}:00`,
            });
          }
          
          // Add "Logged In" entry if time_in exists
          if (String(log?.time_in || '').trim()) {
            timeLogActivities.push({
              id: `login-${logDate}`,
              type: 'login',
              title: `Logged In: ${String(log.time_in || '').trim()}`,
              created_at: `${logDate}T${String(log.time_in || '').trim()}:00`,
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
      formStartDate = String(profile?.start_date || currentUser?.ojt?.start_date || formStartDate || '').slice(0, 10);
      formTotalOjtHours = Number(profile?.total_ojt_hours || formTotalOjtHours || 0);
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

<section class="page-shell">
  <div class="dashboard-container">
    <div class="welcome-banner">
      <div>
        <h2 class="welcome-title">Welcome back{currentUser?.full_name ? `, ${currentUser.full_name}` : ''}!</h2>
        <p class="welcome-subtitle">Here’s your OJT progress overview.</p>
      </div>

      <div class="mode-toggle">
        <span class="mode-label">Hours mode:</span>
        <button
          class:active={progressMode === PROGRESS_MODES.APPROVED}
          type="button"
          on:click={() => (progressMode = PROGRESS_MODES.APPROVED)}
        >
          Approved
        </button>
        <button
          class:active={progressMode === PROGRESS_MODES.ALL}
          type="button"
          on:click={() => (progressMode = PROGRESS_MODES.ALL)}
        >
          All
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
      <div class="summary-card">
        <div class="card-header">
          <h3>Hours Needed</h3>
          <span class="card-icon">🎯</span>
        </div>
        <div class="card-content">
          <div class="stat-value">{totalOjtHours || 0}</div>
          <div class="stat-label">total OJT hours</div>
        </div>
      </div>

      <div class="summary-card">
        <div class="card-header">
          <h3>Hours Completed</h3>
          <span class="card-icon">⏱️</span>
        </div>
        <div class="card-content">
          <div class="stat-value">{hoursCompleted}</div>
          <div class="stat-label">all rendered hours</div>
        </div>
      </div>

      <div class="summary-card">
        <div class="card-header">
          <h3>Hours Remaining</h3>
          <span class="card-icon">🧭</span>
        </div>
        <div class="card-content">
          <div class="stat-value">{hoursRemaining}</div>
          <div class="stat-label">left to finish</div>
        </div>
      </div>

      <div class="summary-card">
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
    <div class="wide-card">
      <div class="wide-left">
        <h3>Estimated End Date</h3>
        <div class="wide-value">{computedEstimatedEndDate ? formatDateLong(computedEstimatedEndDate) : '—'}</div>
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

    <!-- OJT Profile (read-only display) -->
    <div class="content-grid">
      <div class="card">
        <div class="card-header-main">
          <h3>OJT Profile</h3>
          <span class="muted">Your OJT details</span>
        </div>

        <div class="profile-grid">
          <label class="field">
            <span>Start Date</span>
            <input type="text" readonly value={formStartDate ? formatDateLong(parseIsoDateOnly(formStartDate)) : ''} />
          </label>

          <label class="field">
            <span>Course</span>
            <input type="text" readonly value={readonlyCourse} />
          </label>

          <label class="field">
            <span>School</span>
            <input type="text" readonly value={readonlySchool} />
          </label>
        </div>
      </div>

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
  .dashboard-container {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .welcome-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem 1.25rem;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: linear-gradient(135deg, #111827 0%, #4f46e5 50%, #7c3aed 100%);
    color: #ffffff;
    box-shadow: 0 12px 30px rgba(17, 24, 39, 0.18);
  }

  .welcome-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 0.2px;
  }

  .welcome-subtitle {
    margin: 0.25rem 0 0;
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.95rem;
  }

  .mode-label {
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.9rem;
  }

  /* Clock-in Status Styles */
  .mode-toggle button {
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
    padding: 0.45rem 0.65rem;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 700;
    font-size: 0.9rem;
    backdrop-filter: blur(8px);
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
    grid-template-columns: 1.1fr 0.9fr;
    gap: 1.25rem;
    padding: 1.25rem;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    background: #ffffff;
  }

  .wide-left h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: #111827;
  }

  .wide-value {
    margin-top: 0.5rem;
    font-size: 1.5rem;
    font-weight: 800;
    color: #111827;
  }

  .wide-meta {
    margin-top: 0.35rem;
    color: #6b7280;
    font-size: 0.9rem;
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
    color: #111827;
  }

  .progress-stats {
    color: #6b7280;
    font-size: 0.9rem;
  }

  .progress-percent {
    margin-top: 0.5rem;
    font-weight: 700;
    color: #111827;
  }

  .muted {
    color: #6b7280;
    font-size: 0.9rem;
  }

  .profile-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.9rem;
    margin-top: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .field span {
    font-size: 0.85rem;
    font-weight: 700;
    color: #111827;
  }

  .field input {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 0.65rem 0.75rem;
    font-size: 0.95rem;
    outline: none;
  }

  .field input[readonly] {
    background: #f9fafb;
    color: #6b7280;
  }

  .profile-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 1rem;
  }

  button.primary {
    background: #111827;
    color: #fff;
    border: 1px solid #111827;
    padding: 0.65rem 0.9rem;
    border-radius: 10px;
    font-weight: 800;
    cursor: pointer;
  }

  button.primary:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .empty {
    margin: 0.25rem 0 0;
    color: #6b7280;
    font-size: 0.95rem;
  }

  .save-debug {
    margin: 0.75rem 0 0;
    color: #6b7280;
    font-size: 0.8rem;
    word-break: break-word;
  }

  /* Original dashboard styles (kept so existing classes still look right) */
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
    margin-bottom: 0.25rem;
  }

  .summary-card {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 12px;
    padding: 1.5rem;
    color: white;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
  }

  .summary-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 10px 15px rgba(0, 0, 0, 0.2);
  }

  .summary-card:nth-child(2) {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  }

  .summary-card:nth-child(3) {
    background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  }

  .summary-card:nth-child(4) {
    background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .card-header h3 {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0;
    opacity: 0.95;
  }

  .card-icon {
    font-size: 1.5rem;
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
  }

  .stat-label {
    font-size: 0.9rem;
    opacity: 0.9;
  }

  .progress-bar {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
    overflow: hidden;
    margin: 0.5rem 0;
  }

  .progress-fill {
    height: 100%;
    background: rgba(255, 255, 255, 0.8);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .content-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 1.5rem;
  }

  .card {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    border: 1px solid #e5e7eb;
    transition: box-shadow 0.3s ease;
  }

  .card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .card-header-main {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .card-header-main h3 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0;
    color: #111827;
  }

  .view-all {
    color: #667eea;
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 500;
    transition: color 0.3s ease;
  }

  .view-all:hover {
    color: #764ba2;
  }

  .activity-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .activity-item {
    display: flex;
    gap: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #f3f4f6;
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
  }

  .activity-title {
    font-size: 0.95rem;
    font-weight: 500;
    color: #111827;
    margin: 0 0 0.25rem 0;
  }

  .activity-time {
    font-size: 0.85rem;
    color: #6b7280;
    margin: 0;
  }

  .tasks-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .task-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: #f9fafb;
    border-radius: 8px;
    transition: background 0.3s ease;
  }

  .task-item:hover {
    background: #f3f4f6;
  }

  .task-info {
    flex: 1;
  }

  .task-name {
    font-weight: 500;
    color: #111827;
    margin: 0 0 0.25rem 0;
    font-size: 0.95rem;
  }

  .task-deadline {
    font-size: 0.85rem;
    color: #6b7280;
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
    background: #fee2e2;
    color: #991b1b;
  }

  .priority-badge.medium {
    background: #fef3c7;
    color: #92400e;
  }

  .priority-badge.low {
    background: #dcfce7;
    color: #166534;
  }

  @media (max-width: 768px) {
    .welcome-banner {
      flex-direction: column;
      align-items: flex-start;
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
</style>