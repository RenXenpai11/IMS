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
  import * as authApi from '../lib/auth.js';

  const DEFAULT_REQUIRED_HOURS = 500;
  const AVERAGE_DAILY_HOURS = 8;
  const INITIAL_COMPLETED_HOURS = 0;
  const TODAY = new Date(2026, 3, 2);

  let requiredHours = DEFAULT_REQUIRED_HOURS;

  const statusMeta = {
    recorded: {
      label: 'Recorded',
      badgeClass: 'status-badge status-recorded',
      icon: CheckCircle2,
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
    function toLocalIsoDate(dateObj) {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    const text = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return text;
    }

    const isoWithTimeMatch = text.match(/^(\d{4}-\d{2}-\d{2})T/);
    if (isoWithTimeMatch) {
      return isoWithTimeMatch[1];
    }

    const serial = Number(value);
    if (Number.isFinite(serial) && serial > 1) {
      const millis = Math.round((serial - 25569) * 86400000);
      const serialDate = new Date(millis);
      if (!Number.isNaN(serialDate.getTime())) {
        return toLocalIsoDate(serialDate);
      }
    }

    const dateObj = new Date(text);
    if (Number.isNaN(dateObj.getTime())) {
      return toLocalIsoDate(new Date());
    }

    return toLocalIsoDate(dateObj);
  }

  function normalizeTimeValue(value, fallback) {
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

  function mapApiLogToEntry(row) {
    return {
      id: String(row?.timelog_id || Date.now()),
      date: normalizeDateOnly(row?.log_date),
      timeIn: normalizeTimeValue(row?.time_in, '08:00'),
      timeOut: normalizeTimeValue(row?.time_out, '17:00'),
      hours: Number(row?.hours_rendered || 0),
      status: 'recorded',
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
    const isFirstTimeLog = entries.length === 0; // Check if this is the first time log

    try {
      const saved = await authApi.createTimeLog({
        user_id: user.user_id,
        log_date: date,
        time_in: timeIn,
        time_out: timeOut,
        hours_rendered: hours,
        notes: trimmedNotes,
        updateStartDate: isFirstTimeLog, // Update start date on first time log
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
  $: completedHours = INITIAL_COMPLETED_HOURS + entries.reduce((sum, entry) => sum + entry.hours, 0);
  $: remainingHours = Math.max(0, requiredHours - completedHours);
  $: progressPercent = Math.min(100, Math.round((completedHours / requiredHours) * 100));
  // Save completed hours to localStorage whenever it changes (for Dashboard to read)
  $: if (typeof window !== 'undefined' && completedHours >= 0) {
    localStorage.setItem('ojt_completed_hours', String(completedHours));
  }
  $: effectiveRemaining = Math.max(0, remainingHours - overtimeHours);
  $: baseDaysNeeded = Math.ceil(effectiveRemaining / AVERAGE_DAILY_HOURS);
  $: totalDaysNeeded = baseDaysNeeded + absenceDays;
  $: estimatedDate = addWorkingDays(TODAY, totalDaysNeeded);
  $: overtimeDaysAhead = Math.round((overtimeHours / AVERAGE_DAILY_HOURS) * 10) / 10;
  // Calculate days and remaining hours (e.g., "54 days 4 hours")
  $: daysAndHours = (() => {
    const totalHours = Math.max(0, effectiveRemaining);
    const fullDays = Math.floor(totalHours / AVERAGE_DAILY_HOURS);
    const remainingHoursOnly = Math.round((totalHours % AVERAGE_DAILY_HOURS) * 10) / 10;
    if (remainingHoursOnly === 0) {
      return `${fullDays} day${fullDays !== 1 ? 's' : ''}`;
    }
    return `${fullDays} day${fullDays !== 1 ? 's' : ''} ${remainingHoursOnly}h`;
  })();
  $: statCards = [
    {
      label: 'Total Hours Required',
      value: `${requiredHours}h`,
      sub: 'Per internship agreement',
      icon: Target,
      tone: 'primary',
    },
    {
      label: 'Hours Completed',
      value: `${completedHours}h`,
      sub: `${remainingHours}h remaining`,
      icon: CheckCircle2,
      tone: 'success',
    },
    {
      label: 'Avg. Daily Hours',
      value: `${AVERAGE_DAILY_HOURS}h`,
      sub: 'Based on schedule',
      icon: Clock,
      tone: 'info',
    },
    {
      label: 'Est. Completion',
      value: formatShortDate(estimatedDate),
      sub: String(estimatedDate.getFullYear()),
      icon: Calendar,
      tone: 'forecast',
    },
  ];
</script>

<section class="timelog-shell flex flex-col gap-6">
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
    {#each statCards as card (card.label)}
      <article class={`stat-card stat-${card.tone} rounded-2xl border p-5 shadow-md`}>
        <div class={`stat-icon stat-icon-${card.tone} mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl`}>
          <svelte:component this={card.icon} size={18} />
        </div>
        <p class="theme-heading text-3xl font-bold tracking-tight">{card.value}</p>
        <p class="theme-text mt-2 text-sm font-medium">{card.label}</p>
        <p class={`mt-1 text-xs ${card.tone === 'success' ? 'stat-sub-emphasis' : 'theme-muted'}`}>{card.sub}</p>
      </article>
    {/each}
  </div>

  {#if logSyncError}
    <p class="rounded-xl border border-red-300 bg-red-100 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300">
      {logSyncError}
    </p>
  {/if}

  <section class="theme-panel progress-panel rounded-2xl border p-6 shadow-md">
    <div class="mb-4 flex items-start justify-between gap-4">
      <div>
        <h3 class="theme-heading text-base font-semibold">Hours Progress</h3>
        <p class="theme-text mt-1 text-sm">{completedHours} of {requiredHours} required hours completed</p>
        <p class="mt-1 text-xs font-medium progress-helper">All logged entries are counted immediately toward your OJT hours.</p>
      </div>
      <span class="progress-percent-chip rounded-full px-3 py-1 text-lg font-extrabold">{progressPercent}%</span>
    </div>

    <div class="theme-soft progress-track h-4 w-full overflow-hidden rounded-full">
      <div
        class="progress-fill h-full rounded-full transition-all duration-700"
        style={`width: ${progressPercent}%`}
      ></div>
    </div>

    <div class="theme-muted mt-3 flex items-center justify-between text-xs">
      <span>0h</span>
      <span class="progress-remaining font-semibold">{remainingHours}h remaining</span>
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
              class="theme-input entry-input w-full rounded-xl border px-4 py-3 outline-none transition"
          />
        </label>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5">
            <span class="theme-text text-sm font-medium">Time In</span>
            <input
              bind:value={timeIn}
              type="time"
              class="theme-input entry-input w-full rounded-xl border px-4 py-3 outline-none transition"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="theme-text text-sm font-medium">Time Out</span>
            <input
              bind:value={timeOut}
              type="time"
              class="theme-input entry-input w-full rounded-xl border px-4 py-3 outline-none transition"
            />
          </label>
        </div>

        {#if timeIn && timeOut && formHours > 0}
          <div class="duration-chip rounded-xl border px-4 py-3 text-sm shadow-sm">
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
          Add Entry stays disabled until you fill in the date, time, and today's notes. Once submitted, the entry is
          recorded immediately.
        </p>
      </div>
    </section>

    <section class="theme-panel notes-panel rounded-2xl border p-6 shadow-md">
      <div class="flex items-start gap-3">
        <div class="feature-icon notes-icon inline-flex h-11 w-11 items-center justify-center rounded-xl">
          <ClipboardList size={18} />
        </div>
        <div>
          <h3 class="theme-heading text-base font-semibold">Today's Notes</h3>
          <p class="theme-text mt-1 text-sm">Describe your tasks and activities for today.</p>
        </div>
      </div>

      <textarea
        class="theme-input theme-placeholder mt-5 min-h-55 w-full rounded-xl border px-4 py-4 outline-none transition"
        bind:value={todayNotes}
        rows="7"
        placeholder="Describe your tasks and activities for today..."
      ></textarea>

      <p class="theme-text mt-4 text-xs">This note will be saved automatically into the log once you add the time entry.</p>
    </section>

    <section class="theme-panel rounded-xl border p-6 shadow-md">
      <div class="flex items-start gap-3">
        <div class="feature-icon predictor-icon inline-flex h-11 w-11 items-center justify-center rounded-xl">
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

  <section class="theme-panel history-panel overflow-hidden rounded-2xl border shadow-md">
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
            {@const meta = statusMeta[entry.status] ?? statusMeta.recorded}
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
                <button
                  class="history-delete-btn inline-flex h-8 w-8 items-center justify-center rounded-lg transition"
                  type="button"
                  on:click={() => handleDelete(entry.id)}
                  aria-label="Delete time entry"
                >
                  <Trash2 size={13} />
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</section>

<style>
  .timelog-shell {
    --tl-surface: #ffffff;
    --tl-surface-soft: #f4f8fc;
    --tl-border: #d8e2ef;
    --tl-text: #0f172a;
    --tl-muted: #5f7188;
    --tl-accent: #0f6cbd;
    --tl-accent-soft: #d8ebff;
    position: relative;
    border-radius: 1.25rem;
    padding: 0.35rem;
    isolation: isolate;
  }

  .timelog-shell::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -2;
    border-radius: 1.25rem;
    background: radial-gradient(120% 120% at 0% 0%, #e4f1ff 0%, #f6fafe 55%, #ecf3fb 100%);
  }

  .timelog-shell::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: 1.25rem;
    background-image: linear-gradient(110deg, rgba(15, 108, 189, 0.07), transparent 52%),
      repeating-linear-gradient(90deg, transparent 0, transparent 28px, rgba(15, 108, 189, 0.04) 28px, rgba(15, 108, 189, 0.04) 29px);
    pointer-events: none;
  }

  .theme-panel,
  .stat-card {
    background: var(--tl-surface);
    border-color: var(--tl-border);
    box-shadow: 0 18px 38px -32px rgba(15, 23, 42, 0.42);
  }

  .stat-card {
    position: relative;
    overflow: hidden;
  }

  .stat-card::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 3px;
    opacity: 0.9;
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

  .stat-icon {
    border: 1px solid transparent;
  }

  .stat-icon-primary {
    background: #e0efff;
    color: #0f6cbd;
    border-color: #bfdbfe;
  }

  .stat-icon-success {
    background: #dcfce7;
    color: #0f766e;
    border-color: #86efac;
  }

  .stat-icon-info {
    background: #dbeafe;
    color: #1d4ed8;
    border-color: #93c5fd;
  }

  .stat-icon-forecast {
    background: #cffafe;
    color: #0f766e;
    border-color: #67e8f9;
  }

  .stat-sub-emphasis {
    color: #0f766e;
    font-weight: 700;
  }

  .progress-panel {
    background: linear-gradient(145deg, #ffffff, #f6fbff);
  }

  .progress-helper {
    color: #0f6cbd;
  }

  .progress-track {
    border: 1px solid #c4d9f2;
    background: #ecf4fd;
  }

  .progress-fill {
    background: linear-gradient(90deg, #0f6cbd, #14b8a6 55%, #06b6d4);
  }

  .progress-remaining {
    color: #0f6cbd;
  }

  .progress-percent-chip {
    background: var(--tl-accent-soft);
    color: #0f3868;
    border: 1px solid #93c5fd;
    line-height: 1;
  }

  .entry-panel {
    background: linear-gradient(145deg, #ffffff, #f3f8ff);
  }

  .notes-panel,
  .history-panel {
    background: linear-gradient(145deg, #ffffff, #f8fbff);
  }

  .entry-input {
    background: #edf4fb;
    border-color: #bed2e8;
    color: var(--tl-text);
    font-weight: 500;
  }

  .entry-input:focus,
  .theme-input:focus {
    border-color: #60a5fa;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  }

  .entry-input::placeholder,
  .theme-placeholder::placeholder,
  .theme-muted {
    color: var(--tl-muted);
  }

  .theme-heading {
    color: var(--tl-text);
  }

  .theme-text {
    color: var(--tl-text);
  }

  .theme-soft,
  .theme-soft-panel {
    background: var(--tl-surface-soft);
  }

  .theme-soft-panel,
  .theme-divider,
  .theme-table-row,
  .theme-input {
    border-color: var(--tl-border);
  }

  .theme-input {
    background: #eef5fc;
    color: var(--tl-text);
  }

  .theme-table-row:hover {
    background: #f3f8ff;
  }

  .feature-icon {
    border: 1px solid transparent;
  }

  .notes-icon {
    background: #e0efff;
    color: #0f6cbd;
    border-color: #bfdbfe;
  }

  .predictor-icon {
    background: #cffafe;
    color: #0f766e;
    border-color: #67e8f9;
  }

  .duration-chip {
    background: #e0efff;
    border-color: #93c5fd;
    color: #0f3868;
  }

  .theme-button-soft {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #e2edf9;
    border-color: #bfd5ec;
    color: #11406d;
    font-size: 1.05rem;
    line-height: 1;
    font-weight: 800;
  }

  .predictor-step:hover,
  .theme-button-soft:hover {
    background: #d2e4f7;
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
    background: #dcfce7;
    color: #0f766e;
    border-color: #86efac;
  }

  .predictor-estimate {
    background: linear-gradient(145deg, #dbeafe, #cffafe);
    border-color: #7dd3fc;
  }

  .predictor-estimate-label {
    color: #0f6cbd;
  }

  .predictor-estimate-sub {
    color: #0f766e;
  }

  .predictor-estimate-pill {
    background: #0f3868;
    color: #ffffff;
    border: 1px solid #0f6cbd;
  }

  .timelog-submit-btn {
    background: linear-gradient(90deg, #0f6cbd, #0ea5e9);
    color: #ffffff;
    box-shadow: 0 14px 28px -16px rgba(15, 108, 189, 0.9);
  }

  .timelog-submit-btn:hover:not(:disabled) {
    filter: brightness(1.05);
    transform: translateY(-1px);
  }

  .timelog-submit-btn:disabled {
    background: #6b7280;
    color: #e5e7eb;
    cursor: not-allowed;
    opacity: 1;
    box-shadow: none;
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

  .status-recorded {
    background: #dcfce7;
    color: #0f766e;
    border: 1px solid #86efac;
  }

  .history-delete-btn {
    color: #7b8ea8;
  }

  .history-delete-btn:hover {
    background: #fee2e2;
    color: #dc2626;
  }

  :global(.dark) .timelog-shell {
    --tl-surface: #162338;
    --tl-surface-soft: #1b2a42;
    --tl-border: #2b3c57;
    --tl-text: #e5edf8;
    --tl-muted: #9ab0cb;
    --tl-accent: #5bb1ff;
    --tl-accent-soft: rgba(91, 177, 255, 0.18);
  }

  :global(.dark) .timelog-shell::before {
    background: radial-gradient(130% 130% at 0% 0%, #173459 0%, #101a2b 48%, #0b1422 100%);
  }

  :global(.dark) .timelog-shell::after {
    background-image: linear-gradient(110deg, rgba(91, 177, 255, 0.12), transparent 55%),
      repeating-linear-gradient(90deg, transparent 0, transparent 32px, rgba(148, 163, 184, 0.07) 32px, rgba(148, 163, 184, 0.07) 33px);
  }

  :global(.dark) .theme-panel,
  :global(.dark) .stat-card {
    box-shadow: 0 20px 38px -30px rgba(2, 8, 23, 0.95);
  }

  :global(.dark) .progress-panel,
  :global(.dark) .entry-panel,
  :global(.dark) .notes-panel,
  :global(.dark) .history-panel {
    background: linear-gradient(150deg, rgba(22, 35, 56, 0.96), rgba(19, 30, 49, 0.98));
  }

  :global(.dark) .progress-track {
    background: #1a2c46;
    border-color: #335174;
  }

  :global(.dark) .progress-fill {
    background: linear-gradient(90deg, #5bb1ff, #2dd4bf 58%, #22d3ee);
  }

  :global(.dark) .progress-helper,
  :global(.dark) .progress-remaining {
    color: #7cc3ff;
  }

  :global(.dark) .progress-percent-chip {
    color: #dbeafe;
    border-color: rgba(125, 211, 252, 0.45);
  }

  :global(.dark) .stat-icon-primary {
    background: rgba(91, 177, 255, 0.18);
    color: #93c5fd;
    border-color: rgba(125, 211, 252, 0.38);
  }

  :global(.dark) .stat-icon-success {
    background: rgba(16, 185, 129, 0.16);
    color: #6ee7b7;
    border-color: rgba(110, 231, 183, 0.4);
  }

  :global(.dark) .stat-icon-info {
    background: rgba(59, 130, 246, 0.18);
    color: #93c5fd;
    border-color: rgba(147, 197, 253, 0.4);
  }

  :global(.dark) .stat-icon-forecast {
    background: rgba(45, 212, 191, 0.16);
    color: #67e8f9;
    border-color: rgba(103, 232, 249, 0.42);
  }

  :global(.dark) .stat-sub-emphasis {
    color: #6ee7b7;
  }

  :global(.dark) .entry-input,
  :global(.dark) .theme-input {
    background: #1a2c45;
    border-color: #334b6b;
    color: #e2e8f0;
  }

  :global(.dark) .entry-input:focus,
  :global(.dark) .theme-input:focus {
    border-color: #7cc3ff;
    box-shadow: 0 0 0 3px rgba(91, 177, 255, 0.24);
  }

  :global(.dark) .theme-table-row:hover {
    background: rgba(43, 60, 87, 0.45);
  }

  :global(.dark) .duration-chip {
    background: rgba(91, 177, 255, 0.16);
    border-color: rgba(125, 211, 252, 0.42);
    color: #bfdbfe;
  }

  :global(.dark) .theme-button-soft {
    background: #2a3f5d;
    border-color: #426389;
    color: #cfe6ff;
  }

  :global(.dark) .predictor-step:hover,
  :global(.dark) .theme-button-soft:hover {
    background: #365276;
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

  :global(.dark) .predictor-estimate {
    background: linear-gradient(145deg, rgba(30, 64, 102, 0.65), rgba(19, 78, 74, 0.6));
    border-color: rgba(103, 232, 249, 0.45);
  }

  :global(.dark) .predictor-estimate-label {
    color: #93c5fd;
  }

  :global(.dark) .predictor-estimate-sub {
    color: #99f6e4;
  }

  :global(.dark) .predictor-estimate-pill {
    background: #0b2746;
    border-color: #2563eb;
  }

  :global(.dark) .timelog-submit-btn:disabled {
    background: #374151;
    color: #cbd5e1;
  }

  :global(.dark) .status-recorded {
    background: rgba(16, 185, 129, 0.2);
    color: #86efac;
    border-color: rgba(16, 185, 129, 0.45);
  }

  :global(.dark) .history-delete-btn {
    color: #9caec7;
  }

  :global(.dark) .history-delete-btn:hover {
    background: rgba(239, 68, 68, 0.2);
    color: #fca5a5;
  }

  @media (max-width: 768px) {
    .timelog-shell {
      border-radius: 1rem;
      padding: 0;
    }
  }
</style>
