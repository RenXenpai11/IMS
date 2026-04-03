<script>
  import { onMount } from 'svelte';
  import {
    AlertCircle,
    Calendar,
    CheckCircle2,
    ClipboardList,
    Clock,
    Plus,
    Target,
    Trash2,
    TrendingUp,
    Zap,
  } from 'lucide-svelte';
  import { theme } from '../context/ThemeContext.js';
  import * as authApi from '../lib/auth.js';

  const DEFAULT_REQUIRED_HOURS = 500;
  const AVERAGE_DAILY_HOURS = 8;
  const INITIAL_COMPLETED_HOURS = 0;
  const TODAY = new Date(2026, 3, 2);

  let requiredHours = DEFAULT_REQUIRED_HOURS;

  const statusMeta = {
    pending: {
      label: 'Pending',
      badgeClass: 'status-badge status-pending',
      icon: Clock,
    },
    approved: {
      label: 'Approved',
      badgeClass: 'status-badge status-approved',
      icon: CheckCircle2,
    },
    rejected: {
      label: 'Rejected',
      badgeClass: 'status-badge status-rejected',
      icon: AlertCircle,
    },
  };

  let entries = [];
  let date = '';
  let timeIn = '08:00';
  let timeOut = '17:00';
  let absenceDays = 0;
  let overtimeHours = 0;
  let todayNotes = '';
  let logSyncError = '';

  function addWorkingDays(startDate, days) {
    const result = new Date(startDate);
    let added = 0;

    while (added < days) {
      result.setDate(result.getDate() + 1);
      const day = result.getDay();

      if (day !== 0 && day !== 6) {
        added += 1;
      }
    }

    return result;
  }

  function calculateHours(currentTimeIn, currentTimeOut) {
    if (!currentTimeIn || !currentTimeOut) {
      return 0;
    }

    const [inHours, inMinutes] = currentTimeIn.split(':').map(Number);
    const [outHours, outMinutes] = currentTimeOut.split(':').map(Number);
    const diffMinutes = outHours * 60 + outMinutes - (inHours * 60 + inMinutes);

    return Math.max(0, Math.round((diffMinutes / 60) * 10) / 10);
  }

  function formatDate(value, options) {
    return new Intl.DateTimeFormat('en-US', options).format(new Date(value));
  }

  function formatShortDate(value) {
    return formatDate(value, { month: 'short', day: 'numeric' });
  }

  function formatLongDate(value) {
    return formatDate(value, { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function formatTableDate(value) {
    return formatDate(value, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function adjustAbsenceDays(delta) {
    absenceDays = Math.max(0, absenceDays + delta);
  }

  function adjustOvertimeHours(delta) {
    overtimeHours = Math.max(0, overtimeHours + delta);
  }

  function normalizeDateOnly(value) {
    const text = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return text;
    }

    const dateObj = new Date(text);
    if (Number.isNaN(dateObj.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }

    return dateObj.toISOString().slice(0, 10);
  }

  function normalizeTimeValue(value, fallback) {
    const text = String(value || '').trim();
    if (!text) {
      return fallback;
    }

    if (/^\d{2}:\d{2}$/.test(text)) {
      return text;
    }

    return text.slice(0, 5);
  }

  function mapApiLogToEntry(row) {
    return {
      id: String(row?.timelog_id || Date.now()),
      date: normalizeDateOnly(row?.log_date),
      timeIn: normalizeTimeValue(row?.time_in, '08:00'),
      timeOut: normalizeTimeValue(row?.time_out, '17:00'),
      hours: Number(row?.hours_rendered || 0),
      status: String(row?.status || 'pending').toLowerCase(),
      notes: String(row?.notes || ''),
    };
  }

  async function loadEntriesFromApi() {
    const user = authApi.getCurrentUser();
    if (!user?.user_id) {
      entries = [];
      return;
    }

    try {
      const logs = await authApi.listTimeLogsByUser(user.user_id);
      entries = logs
        .map(mapApiLogToEntry)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      logSyncError = '';
    } catch (err) {
      logSyncError = err?.message || 'Unable to load time logs right now.';
      entries = [];
    }
  }

  function syncRequiredHoursFromAccount() {
    const user = authApi.getCurrentUser();
    const studentHours = Number(user?.ojt?.total_ojt_hours || 0);

    if (user?.role === 'Student' && Number.isFinite(studentHours) && studentHours > 0) {
      requiredHours = studentHours;
      return;
    }

    requiredHours = DEFAULT_REQUIRED_HOURS;
  }

  async function handleAddEntry() {
    if (!date || !timeIn || !timeOut || !trimmedNotes) {
      return;
    }

    const user = authApi.getCurrentUser();
    if (!user?.user_id) {
      logSyncError = 'Please log in again before adding a time log.';
      return;
    }

    const hours = calculateHours(timeIn, timeOut);

    try {
      const saved = await authApi.createTimeLog({
        user_id: user.user_id,
        log_date: date,
        time_in: timeIn,
        time_out: timeOut,
        hours_rendered: hours,
        status: 'pending',
        notes: trimmedNotes,
      });

      entries = [mapApiLogToEntry(saved), ...entries];
      logSyncError = '';
    } catch (err) {
      logSyncError = err?.message || 'Unable to save time log right now.';
      return;
    }

    date = '';
    timeIn = '08:00';
    timeOut = '17:00';
    todayNotes = '';
  }

  async function handleDelete(id) {
    const user = authApi.getCurrentUser();
    if (!user?.user_id) {
      logSyncError = 'Please log in again before deleting a time log.';
      return;
    }

    try {
      await authApi.deleteTimeLog(user.user_id, id);
      entries = entries.filter((entry) => String(entry.id) !== String(id));
      logSyncError = '';
    } catch (err) {
      logSyncError = err?.message || 'Unable to delete this time log right now.';
    }
  }

  onMount(() => {
    syncRequiredHoursFromAccount();
    loadEntriesFromApi();

    return () => {
      // no-op cleanup for now
    };
  });

  $: formHours = calculateHours(timeIn, timeOut);
  $: trimmedNotes = todayNotes.trim();
  $: canAddEntry = Boolean(date && timeIn && timeOut && trimmedNotes);
  $: approvedNewHours = entries
    .filter((entry) => entry.status === 'approved')
    .reduce((sum, entry) => sum + entry.hours, 0);
  $: completedHours = INITIAL_COMPLETED_HOURS + approvedNewHours;
  $: remainingHours = Math.max(0, requiredHours - completedHours);
  $: progressPercent = Math.min(100, Math.round((completedHours / requiredHours) * 100));
  $: effectiveRemaining = Math.max(0, remainingHours - overtimeHours);
  $: baseDaysNeeded = Math.ceil(effectiveRemaining / AVERAGE_DAILY_HOURS);
  $: totalDaysNeeded = baseDaysNeeded + absenceDays;
  $: estimatedDate = addWorkingDays(TODAY, totalDaysNeeded);
  $: overtimeDaysAhead = Math.round((overtimeHours / AVERAGE_DAILY_HOURS) * 10) / 10;
  $: statCards = [
    {
      label: 'Total Hours Required',
      value: `${requiredHours}h`,
      sub: 'Per internship agreement',
      icon: Target,
      cardStyle: $theme === 'dark'
        ? 'background: linear-gradient(135deg, #1f2937 0%, #1f2937 100%); border-color: #334155;'
        : 'background: linear-gradient(135deg, #eef2ff 0%, #ffffff 100%); border-color: #c7d2fe;',
      iconStyle: $theme === 'dark'
        ? 'background: rgba(99, 102, 241, 0.15); color: #c7d2fe;'
        : 'background: #e0e7ff; color: #4f46e5;',
    },
    {
      label: 'Hours Completed',
      value: `${completedHours}h`,
      sub: `${remainingHours}h remaining`,
      icon: CheckCircle2,
      cardStyle: $theme === 'dark'
        ? 'background: linear-gradient(135deg, #1f2937 0%, #1f2937 100%); border-color: #334155;'
        : 'background: linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%); border-color: #a7f3d0;',
      iconStyle: $theme === 'dark'
        ? 'background: rgba(16, 185, 129, 0.15); color: #a7f3d0;'
        : 'background: #d1fae5; color: #059669;',
    },
    {
      label: 'Avg. Daily Hours',
      value: `${AVERAGE_DAILY_HOURS}h`,
      sub: 'Based on schedule',
      icon: Clock,
      cardStyle: $theme === 'dark'
        ? 'background: linear-gradient(135deg, #1f2937 0%, #1f2937 100%); border-color: #334155;'
        : 'background: linear-gradient(135deg, #eff6ff 0%, #ffffff 100%); border-color: #bfdbfe;',
      iconStyle: $theme === 'dark'
        ? 'background: rgba(59, 130, 246, 0.15); color: #bfdbfe;'
        : 'background: #dbeafe; color: #2563eb;',
    },
    {
      label: 'Est. Completion',
      value: formatShortDate(estimatedDate),
      sub: String(estimatedDate.getFullYear()),
      icon: Calendar,
      cardStyle: $theme === 'dark'
        ? 'background: linear-gradient(135deg, #1f2937 0%, #1f2937 100%); border-color: #334155;'
        : 'background: linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%); border-color: #ddd6fe;',
      iconStyle: $theme === 'dark'
        ? 'background: rgba(139, 92, 246, 0.15); color: #c4b5fd;'
        : 'background: #ede9fe; color: #7c3aed;',
    },
  ];
</script>

<section class="flex flex-col gap-6">
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
    {#each statCards as card (card.label)}
      <article class="rounded-xl border p-5 shadow-md" style={card.cardStyle}>
        <div class="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl" style={card.iconStyle}>
          <svelte:component this={card.icon} size={18} />
        </div>
        <p class="theme-heading text-3xl font-bold tracking-tight">{card.value}</p>
        <p class="theme-text mt-2 text-sm font-medium">{card.label}</p>
        <p class={`mt-1 text-xs ${card.label === 'Hours Completed' ? 'text-orange-500 dark:text-orange-400' : 'theme-muted'}`}>{card.sub}</p>
      </article>
    {/each}
  </div>

  {#if logSyncError}
    <p class="rounded-xl border border-red-300 bg-red-100 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300">
      {logSyncError}
    </p>
  {/if}

  <section class="theme-panel rounded-xl border p-6 shadow-md">
    <div class="mb-4 flex items-start justify-between gap-4">
      <div>
        <h3 class="theme-heading text-base font-semibold">Hours Progress</h3>
        <p class="theme-text mt-1 text-sm">{completedHours} of {requiredHours} required hours completed</p>
        <p class="mt-1 text-xs font-medium text-violet-600">Only supervisor-approved entries count toward your OJT hours.</p>
      </div>
      <span class="progress-percent-chip rounded-full px-3 py-1 text-lg font-extrabold">{progressPercent}%</span>
    </div>

    <div class="theme-soft h-4 w-full overflow-hidden rounded-full">
      <div
        class="h-full rounded-full bg-linear-to-r from-violet-500 via-indigo-500 to-blue-500 transition-all duration-700"
        style={`width: ${progressPercent}%`}
      ></div>
    </div>

    <div class="theme-muted mt-3 flex items-center justify-between text-xs">
      <span>0h</span>
      <span class="font-semibold text-orange-500 dark:text-orange-400">{remainingHours}h remaining</span>
      <span>{requiredHours}h</span>
    </div>
  </section>

  <div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
    <section class="theme-panel entry-panel rounded-xl border p-6 shadow-md">
      <h3 class="theme-heading text-base font-semibold">Log Time Entry</h3>

      <div class="mt-5 flex flex-col gap-4">
        <label class="flex flex-col gap-1.5">
          <span class="theme-text text-sm font-medium">Date</span>
          <input
            bind:value={date}
            type="date"
            class="theme-input entry-input w-full rounded-xl border px-4 py-3 outline-none transition focus:border-violet-200 focus:ring-2 focus:ring-violet-400/30"
          />
        </label>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5">
            <span class="theme-text text-sm font-medium">Time In</span>
            <input
              bind:value={timeIn}
              type="time"
              class="theme-input entry-input w-full rounded-xl border px-4 py-3 outline-none transition focus:border-violet-200 focus:ring-2 focus:ring-violet-400/30"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="theme-text text-sm font-medium">Time Out</span>
            <input
              bind:value={timeOut}
              type="time"
              class="theme-input entry-input w-full rounded-xl border px-4 py-3 outline-none transition focus:border-violet-200 focus:ring-2 focus:ring-violet-400/30"
            />
          </label>
        </div>

        {#if timeIn && timeOut && formHours > 0}
          <div class="rounded-xl border border-violet-400 bg-violet-200 px-4 py-3 text-sm text-violet-900 shadow-sm dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
            Duration: <strong class="font-semibold">{formHours} hours</strong>
          </div>
        {/if}

        <button
          class="timelog-submit-btn inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold transition"
          type="button"
          on:click={handleAddEntry}
          disabled={!canAddEntry}
        >
          <Plus size={15} />
          <span>Add Entry</span>
        </button>

        <p class="theme-text text-xs leading-6">
          Add Entry stays disabled until you fill in the date, time, and today's notes. New entries start as
          <strong class="theme-heading font-semibold"> Pending</strong> until your supervisor approves them.
        </p>
      </div>
    </section>

    <section class="rounded-xl border p-6 shadow-md" style={$theme === 'dark' ? 'background: linear-gradient(135deg, #1f2937 0%, #1f2937 100%); border-color: #334155;' : 'background: linear-gradient(135deg, #ffffff 0%, rgba(245, 243, 255, 0.55) 100%); border-color: #ddd6fe;'}>
      <div class="flex items-start gap-3">
        <div class="inline-flex h-11 w-11 items-center justify-center rounded-xl" style={$theme === 'dark' ? 'background: rgba(139, 92, 246, 0.15); color: #c4b5fd;' : 'background: #ede9fe; color: #7c3aed;'}>
          <ClipboardList size={18} />
        </div>
        <div>
          <h3 class="theme-heading text-base font-semibold">Today's Notes</h3>
          <p class="theme-text mt-1 text-sm">Describe your tasks and activities for today.</p>
        </div>
      </div>

      <textarea
        class="theme-input theme-placeholder mt-5 min-h-55 w-full rounded-xl border px-4 py-4 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-400/30"
        bind:value={todayNotes}
        rows="7"
        placeholder="Describe your tasks and activities for today..."
      ></textarea>

      <p class="theme-text mt-4 text-xs">This note will be saved automatically into the log once you add the time entry.</p>
    </section>

    <section class="theme-panel rounded-xl border p-6 shadow-md">
      <div class="flex items-start gap-3">
        <div class="inline-flex h-11 w-11 items-center justify-center rounded-xl" style={$theme === 'dark' ? 'background: rgba(139, 92, 246, 0.15); color: #c4b5fd;' : 'background: #ede9fe; color: #7c3aed;'}>
          <Zap size={18} />
        </div>
        <div>
          <h3 class="theme-heading text-base font-semibold">Completion Predictor</h3>
          <p class="theme-text mt-1 text-sm">Adjust parameters to forecast your finish date</p>
        </div>
      </div>

      <div class="mt-5 grid grid-cols-1 gap-4">
        <article class="theme-soft-panel predictor-metric rounded-xl border p-4">
          <div class="flex items-center justify-between gap-3">
            <p class="theme-text text-sm font-medium">Planned Absences</p>
            <span class="predictor-chip predictor-chip-delay">+{absenceDays}d delay</span>
          </div>

          <div class="mt-4 flex items-center justify-between gap-3">
            <button class="theme-button-soft predictor-step h-9 w-9 rounded-xl border transition" type="button" on:click={() => adjustAbsenceDays(-1)}>-</button>
            <strong class="theme-heading text-4xl font-bold tracking-tight">{absenceDays}</strong>
            <button class="theme-button-soft predictor-step h-9 w-9 rounded-xl border transition" type="button" on:click={() => adjustAbsenceDays(1)}>+</button>
          </div>

          <p class="theme-text mt-3 text-sm">days of planned absence</p>
        </article>

        <article class="theme-soft-panel predictor-metric rounded-xl border p-4">
          <div class="flex items-center justify-between gap-3">
            <p class="theme-text text-sm font-medium">Overtime Hours</p>
            <span class="predictor-chip predictor-chip-ahead">-{overtimeDaysAhead}d ahead</span>
          </div>

          <div class="mt-4 flex items-center justify-between gap-3">
            <button class="theme-button-soft predictor-step h-9 w-9 rounded-xl border transition" type="button" on:click={() => adjustOvertimeHours(-1)}>-</button>
            <strong class="theme-heading text-4xl font-bold tracking-tight">{overtimeHours}h</strong>
            <button class="theme-button-soft predictor-step h-9 w-9 rounded-xl border transition" type="button" on:click={() => adjustOvertimeHours(1)}>+</button>
          </div>

          <p class="theme-text mt-3 text-sm">extra hours planned</p>
        </article>
      </div>

      <div class="mt-5 rounded-xl border p-4 shadow-sm predictor-estimate">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="predictor-estimate-label text-xs font-semibold uppercase tracking-[0.08em]">Estimated Completion Date</p>
            <p class="theme-heading mt-1 text-2xl font-bold tracking-tight">{formatLongDate(estimatedDate)}</p>
            <p class="predictor-estimate-sub mt-1 text-sm">{totalDaysNeeded} working days from today</p>
          </div>

          <div class="predictor-estimate-pill inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-sm">
            <TrendingUp size={14} />
            <span>{remainingHours}h left</span>
          </div>
        </div>
      </div>
    </section>
  </div>

  <section class="theme-panel overflow-hidden rounded-xl border shadow-md">
    <div class="theme-divider flex items-center justify-between border-b px-6 py-4">
      <h3 class="theme-heading text-base font-semibold">Time Log History</h3>
      <span class="theme-muted text-sm">{entries.length} entries</span>
    </div>

    <div class="overflow-x-auto">
      <table class="min-w-full border-collapse">
        <thead>
          <tr class="theme-divider border-b">
            <th class="theme-muted px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]">Date</th>
            <th class="theme-muted px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]">Time In</th>
            <th class="theme-muted px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]">Time Out</th>
            <th class="theme-muted px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]">Hours</th>
            <th class="theme-muted px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]">Notes</th>
            <th class="theme-muted px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]">Status</th>
            <th class="theme-muted px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]"></th>
          </tr>
        </thead>

        <tbody>
          {#each entries as entry (entry.id)}
            {@const meta = statusMeta[entry.status]}
            {@const StatusIcon = meta.icon}
            <tr class="theme-table-row border-b transition">
              <td class="theme-text px-6 py-4 text-sm">{formatTableDate(entry.date)}</td>
              <td class="theme-text px-6 py-4 text-sm">{entry.timeIn}</td>
              <td class="theme-text px-6 py-4 text-sm">{entry.timeOut}</td>
              <td class="theme-heading px-6 py-4 text-sm font-semibold">{entry.hours}h</td>
              <td class="theme-text min-w-56 px-6 py-4 text-sm">{entry.notes || 'No notes added'}</td>
              <td class="px-6 py-4">
                <span class={meta.badgeClass}>
                  <StatusIcon size={13} />
                  {meta.label}
                </span>
              </td>
              <td class="px-6 py-4">
                {#if entry.status === 'pending'}
                  <button
                    class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-500/15 dark:hover:text-red-300"
                    type="button"
                    on:click={() => handleDelete(entry.id)}
                    aria-label="Delete time entry"
                  >
                    <Trash2 size={13} />
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</section>

<style>
  .theme-panel {
    background: var(--color-surface);
    border-color: var(--color-border);
  }

  .entry-panel {
    background: #ffffff;
    border-color: #c7d2fe;
  }

  .entry-input {
    background: #eaf0ff;
    border-color: #a5b4fc;
    color: #0f172a;
    font-weight: 400;
    letter-spacing: 0;
  }

  .entry-input[type='date'],
  .entry-input[type='time'] {
    font-weight: 400;
  }

  .entry-input::placeholder {
    color: #475569;
    opacity: 1;
    font-weight: 400;
  }

  .predictor-panel {
    background: #ffffff;
    border-color: #c7d2fe;
  }

  .predictor-metric {
    background: #f5f7ff;
    border-color: #a5b4fc;
  }

  .predictor-chip {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 0.25rem 0.65rem;
    font-size: 0.75rem;
    font-weight: 700;
    border: 1px solid transparent;
  }

  .predictor-chip-delay {
    background: #fee2e2;
    color: #b91c1c;
    border-color: #fca5a5;
  }

  .predictor-chip-ahead {
    background: #d1fae5;
    color: #047857;
    border-color: #6ee7b7;
  }

  .theme-soft,
  .theme-soft-panel {
    background: var(--color-soft);
  }

  .theme-soft-panel {
    border-color: var(--color-border);
  }

  .theme-input {
    background: var(--color-soft);
    border-color: var(--color-border);
    color: var(--color-heading);
  }

  .theme-placeholder::placeholder,
  .theme-muted {
    color: var(--color-sidebar-text);
  }

  .theme-heading {
    color: var(--color-heading);
  }

  .theme-text {
    color: var(--color-text);
  }

  .theme-divider,
  .theme-table-row {
    border-color: var(--color-border);
  }

  .theme-table-row:hover {
    background: var(--color-hover);
  }

  .theme-button-soft {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #dbe4ff;
    border-color: #a5b4fc;
    color: #312e81;
    font-size: 1.05rem;
    line-height: 1;
    font-weight: 800;
  }

  .predictor-step {
    background: #c7d2fe;
    border-color: #818cf8;
    color: #312e81;
  }

  .predictor-step:hover {
    background: #a5b4fc;
  }

  .theme-button-soft:hover {
    background: #c7d2fe;
  }

  :global(.dark) .theme-button-soft {
    background: #9ca3af;
    border-color: #b3bac6;
    color: #4f46e5;
    font-weight: 800;
  }

  :global(.dark) .predictor-panel {
    background: var(--color-surface);
    border-color: #334155;
  }

  :global(.dark) .entry-panel {
    background: var(--color-surface);
    border-color: #334155;
  }

  :global(.dark) .entry-input {
    background: #1b2638;
    border-color: #334155;
    color: #e2e8f0;
    font-weight: 400;
  }

  :global(.dark) .entry-input::placeholder {
    color: #94a3b8;
  }

  :global(.dark) .predictor-metric {
    background: #1b2638;
    border-color: #334155;
  }

  :global(.dark) .predictor-chip-delay {
    background: rgba(239, 68, 68, 0.2);
    color: #fca5a5;
    border-color: rgba(239, 68, 68, 0.45);
  }

  :global(.dark) .predictor-chip-ahead {
    background: rgba(16, 185, 129, 0.2);
    color: #6ee7b7;
    border-color: rgba(16, 185, 129, 0.45);
  }

  :global(.dark) .predictor-step {
    background: #9ca3af;
    border-color: #b3bac6;
    color: #4f46e5;
  }

  :global(.dark) .predictor-step:hover {
    background: #b3bac6;
  }

  :global(.dark) .theme-button-soft:hover {
    background: #b3bac6;
  }

  .predictor-estimate {
    background: linear-gradient(135deg, #ddd6fe 0%, #c7d2fe 100%);
    border-color: #8b5cf6;
  }

  .predictor-estimate-label {
    color: #5b21b6;
  }

  .predictor-estimate-sub {
    color: #6d28d9;
  }

  .predictor-estimate-pill {
    background: #312e81;
    color: #ffffff;
    border: 1px solid #4338ca;
  }

  :global(.dark) .predictor-estimate {
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.16) 0%, rgba(59, 130, 246, 0.14) 100%);
    border-color: rgba(139, 92, 246, 0.45);
  }

  :global(.dark) .predictor-estimate-label {
    color: #c4b5fd;
  }

  :global(.dark) .predictor-estimate-sub {
    color: #c4b5fd;
  }

  :global(.dark) .predictor-estimate-pill {
    background: #312e81;
    color: #e0e7ff;
    border-color: #4338ca;
  }

  .timelog-submit-btn {
    background: #4f46e5;
    color: #ffffff;
    box-shadow: 0 12px 24px -16px rgba(79, 70, 229, 0.95);
  }

  .timelog-submit-btn:hover:not(:disabled) {
    background: #4338ca;
    transform: translateY(-1px);
  }

  .timelog-submit-btn:disabled {
    background: #312e81;
    color: #c7d2fe;
    cursor: not-allowed;
    opacity: 1;
    box-shadow: none;
  }

  .progress-percent-chip {
    background: #ddd6fe;
    color: #111827;
    border: 1px solid #a78bfa;
    line-height: 1;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    border-radius: 999px;
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.15;
  }

  .status-approved {
    background: #16a34a;
    color: #ffffff;
    border: 1px solid #15803d;
  }

  .status-pending {
    background: #fbbf24;
    color: #78350f;
    border: 1px solid #f59e0b;
  }

  .status-rejected {
    background: #ef4444;
    color: #ffffff;
    border: 1px solid #dc2626;
  }

  :global(.dark) .status-approved {
    background: rgba(16, 185, 129, 0.2);
    color: #a7f3d0;
    border: 1px solid rgba(16, 185, 129, 0.45);
  }

  :global(.dark) .status-pending {
    background: rgba(245, 158, 11, 0.2);
    color: #fcd34d;
    border: 1px solid rgba(245, 158, 11, 0.45);
  }

  :global(.dark) .status-rejected {
    background: rgba(239, 68, 68, 0.2);
    color: #fca5a5;
    border: 1px solid rgba(239, 68, 68, 0.45);
  }

  :global(.dark) .progress-percent-chip {
    background: color-mix(in srgb, #8b5cf6 20%, transparent);
    color: #ddd6fe;
    border: 1px solid color-mix(in srgb, #8b5cf6 45%, transparent);
  }
</style>
