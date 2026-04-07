<script>
  import { onDestroy, onMount } from 'svelte';
  import { Clock3, ListFilter, RefreshCw, Trash2, UserCircle2, Users } from 'lucide-svelte';
  import {
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
  let loadingStudents = true;
  let loadingLogs = false;
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
      successMessage = 'Student time log deleted successfully.';
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
</script>

{#if currentUser && !isSupervisorUser}
  <section class="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
    This page is available for supervisor accounts only.
  </section>
{:else}
  <section class="flex flex-col gap-6">
    <section class="supervisor-card rounded-xl border p-6 shadow-md">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 class="supervisor-heading text-lg font-semibold">Student Time Logs</h3>
          <p class="supervisor-sub mt-1 text-sm">View and manage entries of students assigned to you.</p>
        </div>

        <div class="flex w-full gap-2 lg:w-auto">
          <label class="relative flex-1 lg:w-[20rem]">
            <ListFilter size={15} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted)" />
            <select bind:value={selectedStudentId} class="supervisor-input w-full rounded-lg border px-3 py-2.5 pl-9 outline-none" on:change={loadLogs}>
              {#if loadingStudents}
                <option value="">Loading student accounts...</option>
              {:else if assignedStudents.length === 0}
                <option value="">No assigned students</option>
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
      <section class="supervisor-card rounded-xl border p-6 shadow-md">
        <p class="supervisor-sub text-sm">Loading student accounts...</p>
      </section>
    {:else if selectedStudent}
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article class="supervisor-card rounded-xl border p-5 shadow-md">
          <div class="supervisor-icon icon-blue"><UserCircle2 size={18} /></div>
          <p class="supervisor-value mt-4 text-lg">{selectedStudent.full_name}</p>
          <p class="supervisor-label mt-1 text-sm">Selected Student</p>
        </article>

        <article class="supervisor-card rounded-xl border p-5 shadow-md">
          <div class="supervisor-icon icon-violet"><Users size={18} /></div>
          <p class="supervisor-value mt-4">{selectedProgress}%</p>
          <p class="supervisor-label mt-1 text-sm">Overall Progress</p>
        </article>

        <article class="supervisor-card rounded-xl border p-5 shadow-md">
          <div class="supervisor-icon icon-green"><Clock3 size={18} /></div>
          <p class="supervisor-value mt-4">{selectedCompletedHours}h</p>
          <p class="supervisor-label mt-1 text-sm">Completed Hours</p>
        </article>

        <article class="supervisor-card rounded-xl border p-5 shadow-md">
          <div class="supervisor-icon icon-cyan"><Clock3 size={18} /></div>
          <p class="supervisor-value mt-4">{selectedRemainingHours}h</p>
          <p class="supervisor-label mt-1 text-sm">Remaining Hours</p>
        </article>
      </div>

      <section class="supervisor-card rounded-xl border p-6 shadow-md">
        <h3 class="supervisor-heading text-base font-semibold">Time Log Entries</h3>
        <p class="supervisor-sub mt-1 text-sm">You can delete invalid entries from your assigned students.</p>

        {#if loadingLogs}
          <p class="supervisor-sub mt-4 text-sm">Loading entries...</p>
        {:else if logs.length === 0}
          <p class="supervisor-sub mt-4 text-sm">No time log entries found for this student.</p>
        {:else}
          <div class="mt-4 overflow-auto rounded-lg border border-(--color-border)">
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
                      >
                        <Trash2 size={13} />
                        {deletingId === row.timelog_id ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>
    {:else}
      <section class="supervisor-card rounded-xl border p-6 shadow-md">
        <p class="supervisor-sub text-sm">No assigned students yet. Add assignments first in dashboard.</p>
      </section>
    {/if}
  </section>
{/if}

<style>
  .supervisor-card {
    background: var(--color-surface);
    border-color: var(--color-border);
  }

  .supervisor-heading,
  .supervisor-value {
    color: var(--color-heading);
  }

  .supervisor-label,
  .supervisor-sub,
  .table-row {
    color: var(--color-sidebar-text);
  }

  .supervisor-value {
    font-size: 1.5rem;
    line-height: 1;
    font-weight: 700;
  }

  .supervisor-input {
    background: var(--color-soft);
    border-color: var(--color-border);
    color: var(--color-text);
  }

  .btn-light,
  .btn-delete {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border: 1px solid transparent;
  }

  .btn-light {
    background: var(--color-soft);
    border-color: var(--color-border);
    color: var(--color-heading);
  }

  .btn-delete {
    background: #fef2f2;
    color: #dc2626;
  }

  .table-head {
    background: var(--color-soft);
    color: var(--color-heading);
  }

  .table-row {
    border-top: 1px solid var(--color-border);
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
    background: #dbeafe;
    color: #2563eb;
  }

  .icon-violet {
    background: #ede9fe;
    color: #7c3aed;
  }

  .icon-green {
    background: #d1fae5;
    color: #059669;
  }

  .icon-cyan {
    background: #cffafe;
    color: #0891b2;
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
</style>
