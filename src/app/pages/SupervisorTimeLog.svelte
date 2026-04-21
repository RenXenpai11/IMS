<script>
  import { onDestroy, onMount } from 'svelte';
  import { Clock3, ListFilter, RefreshCw, Trash2, UserCircle2, Users, Loader2 } from 'lucide-svelte';
  import {
    callApiAction,
    deleteSupervisorTimeLog,
    getCurrentUser,
    listSupervisorAssignedStudents,
    listSupervisorTimeLogs,
    subscribeToCurrentUser,
  } from '../lib/auth.js';
  import { subscribeToSync } from '../lib/sync.js';

  let currentUser = null;
  let unsubscribeAuth;
  let unsubscribeSync;
  let assignedStudents = [];
  let selectedStudentId = '';
  let selectedStudent = null;
  let logs = [];
  let activeSessions = [];
  let loadingStudents = true;
  let loadingLogs = false;
  let loadingActiveSessions = false;
  let deletingId = '';
  let errorMessage = '';
  let successMessage = '';

  function toNumber(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function toDateOnly(value) {
    const text = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return text;
    }

    const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})T/);
    if (isoMatch) {
      return isoMatch[1];
    }

    return text;
  }

  function toTimeText(value) {
    const text = String(value || '').trim();
    if (!text) {
      return '-';
    }

    const isoTime = text.match(/T(\d{2}):(\d{2})/);
    if (isoTime) {
      return toTimeText(`${isoTime[1]}:${isoTime[2]}`);
    }

    const amPmTime = text.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)/i);
    if (amPmTime) {
      return `${amPmTime[1]}:${amPmTime[2]} ${String(amPmTime[3] || '').toUpperCase()}`;
    }

    const h24 = text.match(/^(\d{1,2}):(\d{2})$/);
    if (!h24) {
      return text;
    }

    let hours = Number(h24[1]);
    const minutes = String(h24[2]);
    const marker = hours >= 12 ? 'PM' : 'AM';

    if (hours === 0) {
      hours = 12;
    } else if (hours > 12) {
      hours -= 12;
    }

    return `${hours}:${minutes} ${marker}`;
  }

  function normalizeTimeValue(value, fallback = '') {
    const to24HourString = (hours, minutes) => {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    };

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return to24HourString(value.getHours(), value.getMinutes());
    }

    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) {
      const fraction = ((numeric % 1) + 1) % 1;
      const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return to24HourString(hours, minutes);
    }

    const text = String(value || '').trim();
    if (!text) {
      return fallback;
    }

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

      return to24HourString(hours, minutes);
    }

    const h24Time = text.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
    if (h24Time) {
      const hours = Number(h24Time[1]);
      const minutes = Number(h24Time[2]);

      if (Number.isFinite(hours) && Number.isFinite(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
        return to24HourString(hours, minutes);
      }
    }

    return fallback;
  }

  function formatDate(value) {
    const text = toDateOnly(value);
    const parsed = new Date(`${text}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return text || '-';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(parsed);
  }

  function mapLog(row) {
    return {
      timelog_id: String(row?.timelog_id || ''),
      log_date: toDateOnly(row?.log_date),
      time_in: normalizeTimeValue(row?.time_in, ''),
      time_out: normalizeTimeValue(row?.time_out, ''),
      notes: String(row?.notes || ''),
      hours_rendered: toNumber(row?.hours_rendered),
      created_at: String(row?.created_at || ''),
    };
  }

  async function loadAssignedStudents() {
    const supervisorId = String(currentUser?.user_id || '').trim();
    const roleNow = String(currentUser?.role || '').trim().toLowerCase();

    if (!supervisorId || roleNow !== 'supervisor') {
      assignedStudents = [];
      selectedStudentId = '';
      selectedStudent = null;
      logs = [];
      loadingStudents = false;
      return;
    }

    loadingStudents = true;
    errorMessage = '';

    try {
      const students = await listSupervisorAssignedStudents(supervisorId);
      assignedStudents = students;

      if (!students.length) {
        selectedStudentId = '';
        selectedStudent = null;
        logs = [];
        return;
      }

      const hasSelection = students.some((student) => String(student.user_id || '') === selectedStudentId);
      if (!hasSelection) {
        selectedStudentId = String(students[0].user_id || '');
      }

      selectedStudent = students.find((student) => String(student.user_id || '') === selectedStudentId) || null;
      await loadLogs();
    } catch (err) {
      errorMessage = err?.message || 'Unable to load assigned students.';
    } finally {
      loadingStudents = false;
    }
  }

  async function loadLogs() {
    const supervisorId = String(currentUser?.user_id || '').trim();
    const studentId = String(selectedStudentId || '').trim();
    const roleNow = String(currentUser?.role || '').trim().toLowerCase();

    if (!supervisorId || !studentId || roleNow !== 'supervisor') {
      logs = [];
      return;
    }

    loadingLogs = true;
    errorMessage = '';

    try {
      const rows = await listSupervisorTimeLogs(supervisorId, studentId);
      logs = rows
        .map(mapLog)
        .sort((a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime());
      selectedStudent = assignedStudents.find((student) => String(student.user_id || '') === studentId) || null;
    } catch (err) {
      errorMessage = err?.message || 'Unable to load student time logs.';
    } finally {
      loadingLogs = false;
    }
  }

  async function loadActiveSessions() {
    const supervisorId = String(currentUser?.user_id || '').trim();
    const roleNow = String(currentUser?.role || '').trim().toLowerCase();

    if (!supervisorId || roleNow !== 'supervisor') {
      activeSessions = [];
      return;
    }

    loadingActiveSessions = true;

    try {
      const result = await callApiAction('list_supervisor_active_sessions', {
        supervisor_user_id: supervisorId,
      });

      if (result && result.ok) {
        // Map active sessions to include student names
        activeSessions = (result.active_sessions || []).map((session) => {
          const student = assignedStudents.find((s) => String(s.user_id) === String(session.user_id));
          return {
            ...session,
            student_name: student?.full_name || 'Unknown Intern',
            student_email: student?.email || '',
          };
        });
      } else {
        activeSessions = [];
      }
    } catch (err) {
      console.error('Error loading active sessions:', err);
      activeSessions = [];
    } finally {
      loadingActiveSessions = false;
    }
  }

  async function handleDelete(logId) {
    const supervisorId = String(currentUser?.user_id || '').trim();
    const studentId = String(selectedStudentId || '').trim();
    const timelogId = String(logId || '').trim();

    if (!supervisorId || !studentId || !timelogId) {
      return;
    }

    const confirmed = window.confirm('Delete this student time log entry?');
    if (!confirmed) {
      return;
    }

    deletingId = timelogId;
    errorMessage = '';
    successMessage = '';

    try {
      await deleteSupervisorTimeLog(supervisorId, studentId, timelogId);
      logs = logs.filter((row) => String(row.timelog_id) !== timelogId);
      successMessage = 'Intern time log deleted successfully.';
    } catch (err) {
      errorMessage = err?.message || 'Unable to delete selected time log.';
    } finally {
      deletingId = '';
    }
  }

  onMount(() => {
    currentUser = getCurrentUser();

    unsubscribeAuth = subscribeToCurrentUser((user) => {
      currentUser = user;
      loadAssignedStudents();
    });

    unsubscribeSync = subscribeToSync(() => {
      if (!deletingId) {
        loadAssignedStudents();
      }
    });
  });

  onDestroy(() => {
    if (typeof unsubscribeAuth === 'function') {
      unsubscribeAuth();
    }

    if (typeof unsubscribeSync === 'function') {
      unsubscribeSync();
    }
  });

  $: selectedStudent = assignedStudents.find((student) => String(student.user_id || '') === selectedStudentId) || null;
  $: selectedRequiredHours = toNumber(selectedStudent?.required_hours);
  $: selectedCompletedHours = toNumber(selectedStudent?.completed_hours);
  $: selectedRemainingHours = Math.max(0, selectedRequiredHours - selectedCompletedHours);
  $: selectedProgress = selectedRequiredHours > 0 ? Math.min(100, Math.round((selectedCompletedHours / selectedRequiredHours) * 100)) : 0;
  $: currentRole = String(currentUser?.role || '').trim().toLowerCase();
  $: isSupervisorUser = currentRole === 'supervisor';
  $: if (assignedStudents.length > 0 && isSupervisorUser) {
    loadActiveSessions();
  }
</script>

{#if currentUser && !isSupervisorUser}
  <section class="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
    This page is available for supervisor accounts only.
  </section>
{:else}
  <section class="supervisor-shell flex flex-col gap-6">
    <!-- Active Sessions Section -->
    {#if activeSessions.length > 0}
      <section class="supervisor-card supervisor-panel rounded-2xl border p-6 shadow-md border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <div class="flex items-center gap-3 mb-4">
          <div class="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-600">
            <Clock3 size={18} />
          </div>
          <div>
            <h3 class="supervisor-heading text-base font-semibold text-emerald-900 dark:text-emerald-200">Currently Logged In</h3>
            <p class="supervisor-sub text-xs text-emerald-700 dark:text-emerald-300 mt-1">{activeSessions.length} {activeSessions.length === 1 ? 'intern is' : 'interns are'} currently logged in today</p>
          </div>
        </div>
        <div class="space-y-2">
          {#each activeSessions as session (session.session_id)}
            <div class="flex items-center justify-between rounded-lg bg-white/50 dark:bg-white/5 px-3 py-2 border border-emerald-200 dark:border-emerald-500/20">
              <div class="flex items-center gap-2">
                <UserCircle2 size={16} class="text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p class="text-sm font-medium text-emerald-900 dark:text-emerald-100">{session.student_name}</p>
                  <p class="text-xs text-emerald-700 dark:text-emerald-400">Logged in at {session.time_in}</p>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <section class="supervisor-card supervisor-panel rounded-2xl border p-6 shadow-md">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 class="supervisor-heading text-lg font-semibold">Intern Time Logs</h3>
          <p class="supervisor-sub mt-1 text-sm">View and manage entries of interns assigned to you.</p>
        </div>

        <div class="flex w-full gap-2 lg:w-auto">
          <label class="relative flex-1 lg:w-[20rem]">
            <ListFilter size={15} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted)" />
            <select bind:value={selectedStudentId} class="supervisor-input w-full rounded-lg border px-3 py-2.5 pl-9 outline-none" on:change={loadLogs}>
              {#if loadingStudents}
                <option value="">Loading intern accounts...</option>
              {:else if assignedStudents.length === 0}
                <option value="">No assigned interns</option>
              {:else}
                {#each assignedStudents as student (student.user_id)}
                  <option value={student.user_id}>{student.full_name}</option>
                {/each}
              {/if}
            </select>
          </label>

          <button type="button" class="btn-light rounded-lg px-3 py-2.5 text-sm font-semibold" on:click={loadAssignedStudents} disabled={loadingStudents || loadingLogs}>
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </div>
    </section>

    {#if errorMessage}
      <p class="rounded-xl border border-red-300 bg-red-100 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300">
        {errorMessage}
      </p>
    {/if}

    {#if successMessage}
      <p class="rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300">
        {successMessage}
      </p>
    {/if}

    {#if loadingStudents}
      <section class="supervisor-card supervisor-panel rounded-2xl border p-6 shadow-md">
        <p class="supervisor-sub text-sm">Loading intern accounts...</p>
      </section>
    {:else if selectedStudent}
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article class="supervisor-card supervisor-stat stat-primary rounded-2xl border p-5 shadow-md">
          <div class="supervisor-icon icon-blue"><UserCircle2 size={18} /></div>
          <p class="supervisor-value mt-4 text-lg">{selectedStudent.full_name}</p>
          <p class="supervisor-label mt-1 text-sm">Selected Intern</p>
        </article>

        <article class="supervisor-card supervisor-stat stat-info rounded-2xl border p-5 shadow-md">
          <div class="supervisor-icon icon-violet"><Users size={18} /></div>
          <p class="supervisor-value mt-4">{selectedProgress}%</p>
          <p class="supervisor-label mt-1 text-sm">Overall Progress</p>
        </article>

        <article class="supervisor-card supervisor-stat stat-success rounded-2xl border p-5 shadow-md">
          <div class="supervisor-icon icon-green"><Clock3 size={18} /></div>
          <p class="supervisor-value mt-4">{selectedCompletedHours}h</p>
          <p class="supervisor-label mt-1 text-sm">Completed Hours</p>
        </article>

        <article class="supervisor-card supervisor-stat stat-forecast rounded-2xl border p-5 shadow-md">
          <div class="supervisor-icon icon-cyan"><Clock3 size={18} /></div>
          <p class="supervisor-value mt-4">{selectedRemainingHours}h</p>
          <p class="supervisor-label mt-1 text-sm">Remaining Hours</p>
        </article>
      </div>

      <section class="supervisor-card supervisor-panel rounded-2xl border p-6 shadow-md">
        <h3 class="supervisor-heading text-base font-semibold">Time Log Entries</h3>
        <p class="supervisor-sub mt-1 text-sm">You can delete invalid entries from your assigned interns.</p>

        {#if loadingLogs}
          <p class="supervisor-sub mt-4 text-sm">Loading entries...</p>
        {:else if logs.length === 0}
          <p class="supervisor-sub mt-4 text-sm">No time log entries found for this intern.</p>
        {:else}
          <div class="log-table-wrap mt-4 overflow-auto rounded-lg border">
            <table class="w-full text-left text-sm" style="min-width: 680px;">
              <thead class="table-head">
                <tr>
                  <th class="px-4 py-3">Date</th>
                  <th class="px-4 py-3">Time In</th>
                  <th class="px-4 py-3">Time Out</th>
                  <th class="px-4 py-3">Hours</th>
                  <th class="px-4 py-3">Notes</th>
                  <th class="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {#each logs as row (row.timelog_id)}
                  <tr class="table-row">
                    <td class="px-4 py-3">{formatDate(row.log_date)}</td>
                    <td class="px-4 py-3">{toTimeText(row.time_in)}</td>
                    <td class="px-4 py-3">{toTimeText(row.time_out)}</td>
                    <td class="px-4 py-3 font-semibold">{row.hours_rendered}h</td>
                    <td class="px-4 py-3">{row.notes || '-'}</td>
                    <td class="px-4 py-3 text-right">
                      <button
                        type="button"
                        class="btn-delete rounded-lg px-2.5 py-2 text-xs font-semibold"
                        on:click={() => handleDelete(row.timelog_id)}
                        disabled={deletingId === row.timelog_id}
                        style="display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;"
                      >
                        {#if deletingId === row.timelog_id}
                          <span class="spinning-icon"><Loader2 size={13} /></span>
                        {:else}
                          <Trash2 size={13} />
                        {/if}
                        <span>{deletingId === row.timelog_id ? 'Deleting...' : 'Delete'}</span>
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <!-- Timeline History Section -->
          <div class="log-history-timeline mt-8">
            <h4 class="supervisor-heading mb-4 text-base font-semibold">Login/Logout History</h4>
            <div class="timeline-container">
              {#each logs as row, idx (row.timelog_id)}
                <div class="timeline-item">
                  <div class="timeline-marker">
                    <div class="timeline-dot"></div>
                    {#if idx !== logs.length - 1}
                      <div class="timeline-line"></div>
                    {/if}
                  </div>
                  <div class="timeline-content">
                    <div class="timeline-date">{formatDate(row.log_date)}</div>
                    <div class="timeline-events">
                      <div class="event login-event">
                        <div class="event-time">
                          <span class="event-label">Logged In</span>
                          <span class="event-hour">{toTimeText(row.time_in)}</span>
                        </div>
                      </div>
                      {#if row.time_out}
                        <div class="event logout-event">
                          <div class="event-time">
                            <span class="event-label">Logged Out</span>
                            <span class="event-hour">{toTimeText(row.time_out)}</span>
                          </div>
                          <div class="event-duration">Duration: {row.hours_rendered}h</div>
                        </div>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </section>
    {:else}
      <section class="supervisor-card supervisor-panel rounded-2xl border p-6 shadow-md">
        <p class="supervisor-sub text-sm">No assigned interns yet. Add assignments first in dashboard.</p>
      </section>
    {/if}
  </section>
{/if}

<style>
  .supervisor-shell {
    --sp-surface: #ffffff;
    --sp-surface-soft: #f3f8ff;
    --sp-border: #d7e3f1;
    --sp-heading: #0f172a;
    --sp-text: #1f2937;
    position: relative;
    border-radius: 1.25rem;
    padding: 0.35rem;
    isolation: isolate;
  }

  .supervisor-shell::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -2;
    border-radius: 1.25rem;
    background: radial-gradient(130% 130% at 0% 0%, #e4f1ff 0%, #f7fbff 58%, #eef4fb 100%);
  }

  .supervisor-shell::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: 1.25rem;
    background-image: linear-gradient(112deg, rgba(15, 108, 189, 0.08), transparent 52%);
    pointer-events: none;
  }

  .supervisor-card {
    background: var(--sp-surface);
    border-color: var(--sp-border);
    box-shadow: 0 18px 36px -30px rgba(15, 23, 42, 0.42);
  }

  .supervisor-panel {
    background: linear-gradient(145deg, #ffffff, #f5f9ff);
  }

  .supervisor-stat {
    position: relative;
    overflow: hidden;
  }

  .supervisor-stat::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 3px;
  }

  .stat-primary::before {
    background: linear-gradient(90deg, #0f6cbd, #38bdf8);
  }

  .stat-success::before {
    background: linear-gradient(90deg, #0f766e, #10b981);
  }

  .stat-info::before {
    background: linear-gradient(90deg, #1d4ed8, #3b82f6);
  }

  .stat-forecast::before {
    background: linear-gradient(90deg, #0f766e, #06b6d4);
  }

  .supervisor-heading,
  .supervisor-value {
    color: var(--sp-heading);
  }

  .supervisor-label,
  .supervisor-sub,
  .table-row {
    color: var(--sp-text);
  }

  .supervisor-value {
    font-size: 1.5rem;
    line-height: 1;
    font-weight: 700;
  }

  .supervisor-input {
    background: #edf4fb;
    border-color: #bed2e8;
    color: var(--sp-heading);
  }

  .supervisor-input:focus {
    border-color: #60a5fa;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  }

  .btn-light,
  .btn-delete {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border: 1px solid transparent;
  }

  .btn-light {
    background: #edf4fb;
    border-color: #bed2e8;
    color: var(--sp-heading);
  }

  .btn-light:hover:not(:disabled) {
    background: #e2edf9;
  }

  .btn-delete {
    background: linear-gradient(90deg, #dc2626, #f97316);
    color: #ffffff;
    border-color: #dc2626;
  }

  .btn-delete:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-1px);
  }

  .log-table-wrap {
    border-color: var(--sp-border);
    background: #f8fbff;
  }

  .table-head {
    background: #edf4fb;
    color: var(--sp-heading);
  }

  .table-row {
    border-top: 1px solid var(--sp-border);
  }

  .table-row:hover {
    background: #f1f7fd;
  }

  .supervisor-icon {
    width: 2.2rem;
    height: 2.2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.8rem;
  }

  .icon-blue {
    background: #e0efff;
    color: #0f6cbd;
    border: 1px solid #bfdbfe;
  }

  .icon-violet {
    background: #dbeafe;
    color: #1d4ed8;
    border: 1px solid #93c5fd;
  }

  .icon-green {
    background: #dcfce7;
    color: #0f766e;
    border: 1px solid #86efac;
  }

  .icon-cyan {
    background: #cffafe;
    color: #0f766e;
    border: 1px solid #67e8f9;
  }

  :global(.dark) .supervisor-shell {
    --sp-surface: #162338;
    --sp-surface-soft: #1b2a42;
    --sp-border: #2b3c57;
    --sp-heading: #e5edf8;
    --sp-text: #cfdceb;
  }

  :global(.dark) .supervisor-shell::before {
    background: radial-gradient(130% 130% at 0% 0%, #173459 0%, #101a2b 48%, #0b1422 100%);
  }

  :global(.dark) .supervisor-shell::after {
    background-image: linear-gradient(112deg, rgba(91, 177, 255, 0.12), transparent 55%);
  }

  :global(.dark) .supervisor-card {
    box-shadow: 0 20px 38px -30px rgba(2, 8, 23, 0.95);
  }

  :global(.dark) .supervisor-panel {
    background: linear-gradient(150deg, rgba(22, 35, 56, 0.96), rgba(19, 30, 49, 0.98));
  }

  :global(.dark) .supervisor-input,
  :global(.dark) .btn-light,
  :global(.dark) .log-table-wrap,
  :global(.dark) .table-head,
  :global(.dark) .table-row:hover {
    background: #1a2c45;
    border-color: #334b6b;
    color: #dbe7f5;
  }

  :global(.dark) .supervisor-input:focus {
    border-color: #7cc3ff;
    box-shadow: 0 0 0 3px rgba(91, 177, 255, 0.24);
  }

  :global(.dark) .btn-light:hover:not(:disabled) {
    background: #223653;
  }

  :global(.dark) .btn-delete {
    background: linear-gradient(90deg, #b91c1c, #ea580c);
    border-color: #b91c1c;
  }

  @media (max-width: 768px) {
    .supervisor-shell {
      border-radius: 1rem;
      padding: 0;
    }
  }

  :global(.dark) .icon-blue {
    background: rgba(59, 130, 246, 0.2);
    color: #bfdbfe;
  }



  .supervisor-stat::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 3px;
  }

  .stat-primary::before {
    background: linear-gradient(90deg, #0f6cbd, #38bdf8);
  }

  .stat-success::before {
    background: linear-gradient(90deg, #0f766e, #10b981);
  }

  .stat-info::before {
    background: linear-gradient(90deg, #1d4ed8, #3b82f6);
  }

  .stat-forecast::before {
    background: linear-gradient(90deg, #0f766e, #06b6d4);
  }

  .supervisor-heading,
  .supervisor-value {
    color: var(--sp-heading);
  }

  .supervisor-label,
  .supervisor-sub,
  .table-row {
    color: var(--sp-text);
  }

  .supervisor-value {
    font-size: 1.5rem;
    line-height: 1;
    font-weight: 700;
  }

  .supervisor-input {
    background: #edf4fb;
    border-color: #bed2e8;
    color: var(--sp-heading);
  }

  .supervisor-input:focus {
    border-color: #60a5fa;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  }

  .btn-light,
  .btn-delete {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border: 1px solid transparent;
  }

  .btn-light {
    background: #edf4fb;
    border-color: #bed2e8;
    color: var(--sp-heading);
  }

  .btn-light:hover:not(:disabled) {
    background: #e2edf9;
  }

  .btn-delete {
    background: linear-gradient(90deg, #dc2626, #f97316);
    color: #ffffff;
    border-color: #dc2626;
  }

  .btn-delete:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-1px);
  }

  .log-table-wrap {
    border-color: var(--sp-border);
    background: #f8fbff;
  }

  .table-head {
    background: #edf4fb;
    color: var(--sp-heading);
  }

  .table-row {
    border-top: 1px solid var(--sp-border);
  }

  .table-row:hover {
    background: #f1f7fd;
  }

  .supervisor-icon {
    width: 2.2rem;
    height: 2.2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.8rem;
  }

  .icon-blue {
    background: #e0efff;
    color: #0f6cbd;
    border: 1px solid #bfdbfe;
  }

  .icon-violet {
    background: #dbeafe;
    color: #1d4ed8;
    border: 1px solid #93c5fd;
  }

  .icon-green {
    background: #dcfce7;
    color: #0f766e;
    border: 1px solid #86efac;
  }

  .icon-cyan {
    background: #cffafe;
    color: #0f766e;
    border: 1px solid #67e8f9;
  }

  :global(.dark) .supervisor-shell {
    --sp-surface: #162338;
    --sp-surface-soft: #1b2a42;
    --sp-border: #2b3c57;
    --sp-heading: #e5edf8;
    --sp-text: #cfdceb;
  }

  :global(.dark) .supervisor-shell::before {
    background: radial-gradient(130% 130% at 0% 0%, #173459 0%, #101a2b 48%, #0b1422 100%);
  }

  :global(.dark) .supervisor-shell::after {
    background-image: linear-gradient(112deg, rgba(91, 177, 255, 0.12), transparent 55%);
  }

  :global(.dark) .supervisor-card {
    box-shadow: 0 20px 38px -30px rgba(2, 8, 23, 0.95);
  }

  :global(.dark) .supervisor-panel {
    background: linear-gradient(150deg, rgba(22, 35, 56, 0.96), rgba(19, 30, 49, 0.98));
  }

  :global(.dark) .supervisor-input,
  :global(.dark) .btn-light,
  :global(.dark) .log-table-wrap,
  :global(.dark) .table-head,
  :global(.dark) .table-row:hover {
    background: #1a2c45;
    border-color: #334b6b;
    color: #dbe7f5;
  }

  :global(.dark) .supervisor-input:focus {
    border-color: #7cc3ff;
    box-shadow: 0 0 0 3px rgba(91, 177, 255, 0.24);
  }

  :global(.dark) .btn-light:hover:not(:disabled) {
    background: #223653;
  }

  :global(.dark) .btn-delete {
    background: linear-gradient(90deg, #b91c1c, #ea580c);
    border-color: #b91c1c;
  }

  @media (max-width: 768px) {
    .supervisor-shell {
      border-radius: 1rem;
      padding: 0;
    }
  }

  :global(.dark) .icon-blue {
    background: rgba(59, 130, 246, 0.2);
    color: #bfdbfe;
  }

  :global(.dark) .icon-violet {
    background: rgba(139, 92, 246, 0.2);
    color: #ddd6fe;
  }

  :global(.dark) .icon-green {
    background: rgba(16, 185, 129, 0.2);
    color: #a7f3d0;
  }

  :global(.dark) .icon-cyan {
    background: rgba(6, 182, 212, 0.2);
    color: #a5f3fc;
  }

  .spinning-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Timeline History Styles */
  .log-history-timeline {
    margin-top: 2rem;
  }

  .timeline-container {
    position: relative;
    padding: 1rem 0;
  }

  .timeline-item {
    display: flex;
    gap: 1.5rem;
    margin-bottom: 2rem;
    position: relative;
  }

  .timeline-marker {
    position: relative;
    width: 2.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
  }

  .timeline-dot {
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    background: #3b82f6;
    border: 3px solid #ffffff;
    box-shadow: 0 0 0 2px #3b82f6;
    position: relative;
    z-index: 2;
  }

  .timeline-line {
    width: 2px;
    flex: 1;
    background: linear-gradient(180deg, #3b82f6 0%, #93c5fd 100%);
    margin-top: 0.5rem;
  }

  .timeline-content {
    flex: 1;
    padding-top: 0.2rem;
  }

  .timeline-date {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--sp-heading);
    margin-bottom: 0.8rem;
    opacity: 0.8;
  }

  .timeline-events {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .event {
    padding: 0.75rem 1rem;
    border-radius: 0.6rem;
    border-left: 3px solid;
  }

  .login-event {
    background: #ecfdf5;
    border-left-color: #10b981;
  }

  .logout-event {
    background: #eff6ff;
    border-left-color: #3b82f6;
  }

  .event-time {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .event-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--sp-text);
  }

  .event-hour {
    font-weight: 700;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.95rem;
  }

  .login-event .event-label {
    color: #047857;
  }

  .login-event .event-hour {
    color: #059669;
  }

  .logout-event .event-label {
    color: #1e40af;
  }

  .logout-event .event-hour {
    color: #1d4ed8;
  }

  .event-duration {
    font-size: 0.8rem;
    margin-top: 0.5rem;
    color: var(--sp-text);
    opacity: 0.7;
  }

  :global(.dark) .timeline-dot {
    background: #60a5fa;
    box-shadow: 0 0 0 2px #60a5fa;
  }

  :global(.dark) .timeline-line {
    background: linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%);
  }

  :global(.dark) .login-event {
    background: rgba(16, 185, 129, 0.15);
  }

  :global(.dark) .logout-event {
    background: rgba(59, 130, 246, 0.15);
  }

  :global(.dark) .timeline-date {
    color: var(--sp-heading);
  }

  :global(.dark) .event-label {
    color: var(--sp-text);
  }
</style>
