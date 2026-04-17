<script>
// @ts-nocheck
  import { CheckCircle, AlertCircle, FileText, Users, Clock3 } from 'lucide-svelte';
  import { subscribeToCurrentUser, listSupervisorAssignedStudents, listSupervisorTimeLogs, listAssignedStudentRequests, listTasksByUser } from '../lib/auth.js';

  export let currentUser = null;

  let loading = true;
  let errorMessage = '';

  let pendingRequests = [];
  let recentSubmissions = [];

  let assignedStudents = [];
  let assignedRequests = [];
  let today = '';

  // keyed by student_user_id -> { time_in, time_out }
  let todayTimelogByStudent = {};
  let tasksSummaryByStudent = {};

  function normalizeDate(value) {
    // Handles Date objects, ISO strings, and legacy date-time strings.
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return '-';
      return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(value);
    }

    const text = String(value || '').trim();
    if (!text) return '-';

    // If backend sends full Date.toString() values ("Thu Apr 16 2026 00:00:00 GMT+0800 ...")
    // parse directly.
    const parsedDirect = new Date(text);
    if (!Number.isNaN(parsedDirect.getTime())) {
      return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsedDirect);
    }

    // Fallback: treat as date-only.
    const parsed = new Date(`${text}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return text;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
  }

  function getPendingTaskCount(studentUserId) {
    const row = tasksSummaryByStudent[String(studentUserId || '').trim()] || null;
    return Number(row?.pendingCount || 0);
  }

  function getToday() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function isWeekend(dateOnly) {
    const parsed = new Date(`${dateOnly}T00:00:00`);
    const day = parsed.getDay();
    return day === 0 || day === 6;
  }

  function daysUntil(dateOnly) {
    const raw = String(dateOnly || '').trim();
    if (!raw) return null;
    const end = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(end.getTime())) return null;
    const start = new Date();
    const startOnly = new Date(`${getToday()}T00:00:00`);
    const diffMs = end.getTime() - startOnly.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  function requestMatchesToday(req) {
    const reqDate = String(req?.request_date || req?.date || '').trim();
    if (!reqDate) return false;
    const dateOnly = reqDate.includes('T') ? reqDate.split('T')[0] : reqDate.split(' ')[0];
    return dateOnly === today;
  }

  function getStudentRequestsToday(studentUserId) {
    const id = String(studentUserId || '').trim();
    if (!id) return [];
    return assignedRequests.filter((req) => String(req?.user_id || '').trim() === id).filter(requestMatchesToday);
  }

  function isApprovedAbsenceToday(studentUserId) {
    const todays = getStudentRequestsToday(studentUserId);
    return todays.some((req) => String(req?.request_type || '').toLowerCase() === 'absence' && String(req?.status || '').toLowerCase() === 'approved');
  }

  function hasApprovedOvertimeToday(studentUserId) {
    const todays = getStudentRequestsToday(studentUserId);
    return todays.some((req) => String(req?.request_type || '').toLowerCase() === 'overtime' && String(req?.status || '').toLowerCase() === 'approved');
  }

  function getClockStatus(studentUserId) {
    const row = todayTimelogByStudent[String(studentUserId || '').trim()] || null;
    const timeIn = String(row?.time_in || '').trim();
    const timeOut = String(row?.time_out || '').trim();

    if (timeIn && timeOut) {
      return { label: `Clocked out (${timeOut})`, tone: 'success' };
    }

    if (timeIn) {
      return { label: `Clocked in (${timeIn})`, tone: 'warning' };
    }

    return { label: 'No clock-in yet', tone: 'muted' };
  }

  function getAttendanceStatus(student) {
    const studentId = String(student?.user_id || '').trim();

    if (isWeekend(today)) {
      return { label: 'Weekend', tone: 'muted' };
    }

    if (isApprovedAbsenceToday(studentId)) {
      return { label: 'Approved absence', tone: 'danger' };
    }

    // Expected to be present on weekdays unless approved absence.
    const clock = getClockStatus(studentId);
    if (clock.label.startsWith('No clock')) {
      return { label: 'Should be present today', tone: 'info' };
    }

    return { label: 'Present today', tone: 'success' };
  }

  async function loadData() {
    loading = true;
    errorMessage = '';
    today = getToday();

    try {
      const supervisorId = String(currentUser?.user_id || '').trim();
      const roleNow = String(currentUser?.role || '').trim().toLowerCase();

      if (!supervisorId || roleNow !== 'supervisor') {
        assignedStudents = [];
        assignedRequests = [];
        pendingRequests = [];
        recentSubmissions = [];
        todayTimelogByStudent = {};
        return;
      }

      assignedStudents = await listSupervisorAssignedStudents(supervisorId);
      assignedRequests = await listAssignedStudentRequests(supervisorId);

      const pending = assignedRequests.filter((req) => String(req?.status || '').toLowerCase() === 'pending');
      pendingRequests = pending.slice(0, 6).map((req) => ({
        id: String(req?.request_id || ''),
        student_name: String(req?.requester_name || req?.student_name || '').trim() || 'Student',
        type: String(req?.request_type || '').trim() || 'Request',
        date: String(req?.request_date || '').trim(),
      }));

      // Placeholder until documents/submissions endpoint is connected.
      recentSubmissions = [];

      // Load today's timelog per assigned student
      const timelogEntries = await Promise.all(
        assignedStudents.map(async (student) => {
          const studentUserId = String(student?.user_id || '').trim();
          if (!studentUserId) return [studentUserId, null];

          try {
            const logs = await listSupervisorTimeLogs(supervisorId, studentUserId);
            const todayLog = Array.isArray(logs)
              ? logs.find((log) => {
                  const raw = String(log?.log_date || '').trim();
                  const dateOnly = raw.includes('T') ? raw.split('T')[0] : raw.split(' ')[0];
                  return dateOnly === today;
                })
              : null;

            return [studentUserId, todayLog || null];
          } catch {
            return [studentUserId, null];
          }
        })
      );

      todayTimelogByStudent = Object.fromEntries(timelogEntries.filter((entry) => entry && entry[0]));

      // Task counts per assigned student (pending / not completed)
      const taskEntries = await Promise.all(
        assignedStudents.map(async (student) => {
          const studentUserId = String(student?.user_id || '').trim();
          if (!studentUserId) return [studentUserId, { pendingCount: 0, total: 0 }];

          try {
            const tasks = await listTasksByUser(studentUserId, { limit: 200 });
            const list = Array.isArray(tasks) ? tasks : [];
            const pendingCount = list.filter((task) => String(task?.status || '').toLowerCase() !== 'completed').length;
            return [studentUserId, { pendingCount, total: list.length }];
          } catch {
            return [studentUserId, { pendingCount: 0, total: 0 }];
          }
        })
      );

      tasksSummaryByStudent = Object.fromEntries(taskEntries.filter((entry) => entry && entry[0]));
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      errorMessage = err?.message || 'Unable to load dashboard.';
    } finally {
      loading = false;
    }
  }

  const onMount = () => {
    unsubscribe = subscribeToCurrentUser(() => {
      loadData();
    });
    loadData();
  };

  const onDestroy = () => {
    if (typeof unsubscribe === 'function') unsubscribe();
  };

  let unsubscribe;
  onMount();

  $: weekend = Boolean(today) ? isWeekend(today) : isWeekend(getToday());
  $: totalAssigned = assignedStudents.length;
  $: expectedToday = weekend ? 0 : assignedStudents.filter((s) => !isApprovedAbsenceToday(s?.user_id)).length;
  $: clockedInToday = assignedStudents.filter((s) => {
    const id = String(s?.user_id || '').trim();
    const row = todayTimelogByStudent[id] || null;
    return Boolean(String(row?.time_in || '').trim());
  }).length;
  $: onApprovedLeaveToday = assignedStudents.filter((s) => isApprovedAbsenceToday(s?.user_id)).length;
</script>

<div class="content">
  {#if errorMessage}
    <section class="warning-alert">{errorMessage}</section>
  {/if}

  <div class="stats-grid">
    <div class="stat-card stat-blue">
      <div class="stat-icon"><Users size={18} /></div>
      <p class="stat-value">{totalAssigned}</p>
      <p class="stat-label">Assigned Interns</p>
    </div>

    <div class="stat-card stat-info">
      <div class="stat-icon"><Clock3 size={18} /></div>
      <p class="stat-value">{expectedToday}</p>
      <p class="stat-label">Should be present today</p>
    </div>

    <div class="stat-card stat-success">
      <div class="stat-icon"><CheckCircle size={18} /></div>
      <p class="stat-value">{clockedInToday}</p>
      <p class="stat-label">Clocked in today</p>
    </div>

    <div class="stat-card stat-warning">
      <div class="stat-icon"><AlertCircle size={18} /></div>
      <p class="stat-value">{onApprovedLeaveToday}</p>
      <p class="stat-label">Approved absence today</p>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div>
        <h3 class="card-title">Assigned Interns</h3>
        <p class="today-heading">{normalizeDate(today)}</p>
        <p class="text-muted text-sm">Status and clock in/out summary for today.</p>
      </div>
    </div>

    {#if loading}
      <p class="text-muted">Loading...</p>
    {:else if assignedStudents.length === 0}
      <p class="text-muted">No interns assigned to you yet.</p>
    {:else}
      <div class="intern-grid">
        {#each assignedStudents as intern (intern.user_id)}
          {@const remainingDays = daysUntil(intern?.estimated_end_date)}
          {@const attendance = getAttendanceStatus(intern)}
          {@const clock = getClockStatus(intern?.user_id)}
          {@const hasOvertime = hasApprovedOvertimeToday(intern?.user_id)}
          {@const pendingTasks = getPendingTaskCount(intern?.user_id)}

          <article class="intern-card">
            <header class="intern-head">
              <div class="intern-title">
                <p class="intern-name">{intern.full_name}</p>
                <p class="intern-meta text-xs text-muted">
                  Internship ends {normalizeDate(intern.estimated_end_date)}
                  {#if remainingDays !== null}
                    • {remainingDays <= 0 ? 'Due' : `${remainingDays} days left`}
                  {/if}
                </p>
              </div>
              <div class={`pill tone-${attendance.tone}`}>{attendance.label}</div>
            </header>

            <div class="intern-body">
              <div class="intern-row">
                <span class="row-label">Clock</span>
                <span class={`row-value tone-${clock.tone}`}>{clock.label}</span>
              </div>
              <div class="intern-row">
                <span class="row-label">Tasks</span>
                <span class="row-value">{pendingTasks} pending</span>
              </div>
              <div class="intern-row">
                <span class="row-label">Overtime</span>
                <span class="row-value">{hasOvertime ? 'Approved today' : '—'}</span>
              </div>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </div>

  <div class="card">
    <h3 class="card-title">Pending Requests</h3>
    {#if loading}
      <p class="text-muted">Loading...</p>
    {:else if pendingRequests.length === 0}
      <p class="text-muted">No pending requests.</p>
    {:else}
      {#each pendingRequests as req (req.id)}
        <div class="list-item">
          <div>
            <p class="font-semibold text-sm">{req.student_name}</p>
            <p class="text-xs text-muted">{req.type} • {normalizeDate(req.date)}</p>
          </div>
          <a class="btn btn-sm" href="#/supervisor/requests">Review</a>
        </div>
      {/each}
    {/if}
  </div>

  <div class="card">
    <h3 class="card-title">Recent Submissions</h3>
    <p class="text-muted">Coming soon.</p>
  </div>
</div>

<style>
  :root {
    --text-primary: #0f172a;
    --text-secondary: #1f2937;
    --text-muted: #6b7280;
    --border: #d7e3f1;
    --surface: #ffffff;
    --surface-soft: #f9fbff;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .warning-alert {
    border-radius: 0.75rem;
    border: 1px solid;
    padding: 1rem;
    background: #fef3c7;
    border-color: #fcd34d;
    color: #92400e;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 1rem;
    padding: 1.25rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    border-top: 3px solid;
  }

  .stat-blue { border-top-color: #0f6cbd; }
  .stat-success { border-top-color: #10b981; }
  .stat-info { border-top-color: #6366f1; }
  .stat-warning { border-top-color: #f59e0b; }

  .stat-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.75rem;
    color: white;
    margin-bottom: 0.5rem;
  }

  .stat-blue .stat-icon { background: linear-gradient(135deg, #0f6cbd, #0ea5e9); }
  .stat-success .stat-icon { background: linear-gradient(135deg, #10b981, #34d399); }
  .stat-info .stat-icon { background: linear-gradient(135deg, #6366f1, #a855f7); }
  .stat-warning .stat-icon { background: linear-gradient(135deg, #f59e0b, #f97316); }

  .stat-value {
    margin: 0.5rem 0 0.25rem 0;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .stat-label {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 1rem;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .card-title {
    margin: 0 0 0.35rem 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .today-heading {
    margin: 0.15rem 0 0;
    font-size: 1.05rem;
    font-weight: 750;
    letter-spacing: -0.01em;
    color: var(--text-secondary);
  }

  :global(.dark) .today-heading {
    color: var(--text-secondary);
  }

  .list-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    background: var(--surface-soft);
    margin-bottom: 0.5rem;
  }

  .intern-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
    gap: 0.9rem;
  }

  @media (min-width: 920px) {
    .intern-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 1240px) {
    .intern-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  .intern-card {
    border: 1px solid var(--border);
    background: var(--surface-soft);
    border-radius: 1rem;
    padding: 1rem;
  }

  .intern-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.85rem;
  }

  .intern-title {
    min-width: 0;
  }

  .intern-name {
    margin: 0;
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--text-primary);
  }

  .intern-meta {
    margin: 0.25rem 0 0;
  }

  .intern-body {
    display: grid;
    gap: 0.5rem;
  }

  .intern-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.85rem;
  }

  .row-label {
    color: var(--text-muted);
    font-weight: 600;
  }

  .row-value {
    color: var(--text-secondary);
    font-weight: 600;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
  }

  .btn-sm {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    background: #edf4fb;
    border: 1px solid var(--border);
    color: var(--text-primary);
  }

  .btn-sm:hover {
    background: #e0eef9;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    padding: 0.25rem 0.65rem;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    white-space: nowrap;
    border: 1px solid transparent;
  }

  .tone-success {
    background: rgba(16, 185, 129, 0.12);
    color: #047857;
    border-color: rgba(16, 185, 129, 0.22);
  }

  .tone-info {
    background: rgba(99, 102, 241, 0.12);
    color: #4338ca;
    border-color: rgba(99, 102, 241, 0.22);
  }

  .tone-warning {
    background: rgba(245, 158, 11, 0.14);
    color: #92400e;
    border-color: rgba(245, 158, 11, 0.25);
  }

  .tone-danger {
    background: rgba(239, 68, 68, 0.12);
    color: #b91c1c;
    border-color: rgba(239, 68, 68, 0.22);
  }

  .tone-muted {
    background: rgba(148, 163, 184, 0.18);
    color: #475569;
    border-color: rgba(148, 163, 184, 0.26);
  }

  :global(.dark) {
    --text-primary: #e5edf8;
    --text-secondary: #cfdceb;
    --text-muted: #9ba3af;
    --border: #2b3c57;
    --surface: #162338;
    --surface-soft: #1a2c45;
  }
</style>
