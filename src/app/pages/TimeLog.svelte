<script>
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

  const REQUIRED_HOURS = 500;
  const AVERAGE_DAILY_HOURS = 8;
  const INITIAL_COMPLETED_HOURS = 292;
  const TODAY = new Date(2026, 3, 2);

  const initialEntries = [
    { id: 1, date: '2026-04-02', timeIn: '08:00', timeOut: '17:00', hours: 8.0, status: 'approved', notes: 'We are exploring GitHub' },
    { id: 2, date: '2026-04-01', timeIn: '08:15', timeOut: '17:15', hours: 8.0, status: 'approved', notes: 'Updated header and sidebar layout' },
    { id: 3, date: '2026-03-31', timeIn: '08:00', timeOut: '18:00', hours: 9.0, status: 'approved', notes: 'Worked on dashboard cards and layout fixes' },
    { id: 4, date: '2026-03-28', timeIn: '08:00', timeOut: '17:00', hours: 8.0, status: 'approved', notes: 'Integrated initial styles and routing shell' },
    { id: 5, date: '2026-03-27', timeIn: '08:30', timeOut: '17:00', hours: 7.5, status: 'pending', notes: 'Prepared Time Log requirements and page plan' },
    { id: 6, date: '2026-03-26', timeIn: '08:00', timeOut: '16:30', hours: 7.5, status: 'approved', notes: 'Reviewed component structure with the team' },
    { id: 7, date: '2026-03-25', timeIn: '08:00', timeOut: '17:00', hours: 8.0, status: 'approved', notes: 'Set up base project folders and starter pages' },
  ];

  const statusMeta = {
    pending: {
      label: 'Pending',
      className: 'inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-600 ring-1 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30',
      icon: Clock,
    },
    approved: {
      label: 'Approved',
      className: 'inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30',
      icon: CheckCircle2,
    },
    rejected: {
      label: 'Rejected',
      className: 'inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-100 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30',
      icon: AlertCircle,
    },
  };

  let entries = [...initialEntries];
  let date = '';
  let timeIn = '08:00';
  let timeOut = '17:00';
  let absenceDays = 0;
  let overtimeHours = 0;
  let todayNotes = '';

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

  function handleAddEntry() {
    if (!date || !timeIn || !timeOut || !trimmedNotes) {
      return;
    }

    const hours = calculateHours(timeIn, timeOut);

    entries = [
      {
        id: Date.now(),
        date,
        timeIn,
        timeOut,
        hours,
        status: 'pending',
        notes: trimmedNotes,
      },
      ...entries,
    ];

    date = '';
    timeIn = '08:00';
    timeOut = '17:00';
    todayNotes = '';
  }

  function handleDelete(id) {
    entries = entries.filter((entry) => entry.id !== id);
  }

  $: formHours = calculateHours(timeIn, timeOut);
  $: trimmedNotes = todayNotes.trim();
  $: canAddEntry = Boolean(date && timeIn && timeOut && trimmedNotes);
  $: approvedNewHours = entries
    .filter((entry) => entry.status === 'approved' && !initialEntries.some((item) => item.id === entry.id))
    .reduce((sum, entry) => sum + entry.hours, 0);
  $: completedHours = INITIAL_COMPLETED_HOURS + approvedNewHours;
  $: remainingHours = Math.max(0, REQUIRED_HOURS - completedHours);
  $: progressPercent = Math.min(100, Math.round((completedHours / REQUIRED_HOURS) * 100));
  $: effectiveRemaining = Math.max(0, remainingHours - overtimeHours);
  $: baseDaysNeeded = Math.ceil(effectiveRemaining / AVERAGE_DAILY_HOURS);
  $: totalDaysNeeded = baseDaysNeeded + absenceDays;
  $: estimatedDate = addWorkingDays(TODAY, totalDaysNeeded);
  $: overtimeDaysAhead = Math.round((overtimeHours / AVERAGE_DAILY_HOURS) * 10) / 10;
  $: statCards = [
    {
      label: 'Total Hours Required',
      value: `${REQUIRED_HOURS}h`,
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

  <section class="theme-panel rounded-xl border p-6 shadow-md">
    <div class="mb-4 flex items-start justify-between gap-4">
      <div>
        <h3 class="theme-heading text-base font-semibold">Hours Progress</h3>
        <p class="theme-text mt-1 text-sm">{completedHours} of {REQUIRED_HOURS} required hours completed</p>
        <p class="mt-1 text-xs font-medium text-violet-600">Only supervisor-approved entries count toward your OJT hours.</p>
      </div>
      <span class="rounded-full bg-linear-to-r from-violet-100 to-blue-100 px-3 py-1 text-lg font-bold text-violet-700 dark:from-violet-500/20 dark:to-blue-500/20 dark:text-violet-300">{progressPercent}%</span>
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
      <span>{REQUIRED_HOURS}h</span>
    </div>
  </section>

  <div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
    <section class="theme-panel rounded-xl border p-6 shadow-md">
      <h3 class="theme-heading text-base font-semibold">Log Time Entry</h3>

      <div class="mt-5 flex flex-col gap-4">
        <label class="flex flex-col gap-1.5">
          <span class="theme-text text-sm font-medium">Date</span>
          <input
            bind:value={date}
            type="date"
            class="theme-input w-full rounded-xl border px-4 py-3 outline-none transition focus:border-violet-200 focus:ring-2 focus:ring-violet-400/30"
          />
        </label>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5">
            <span class="theme-text text-sm font-medium">Time In</span>
            <input
              bind:value={timeIn}
              type="time"
              class="theme-input w-full rounded-xl border px-4 py-3 outline-none transition focus:border-violet-200 focus:ring-2 focus:ring-violet-400/30"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="theme-text text-sm font-medium">Time Out</span>
            <input
              bind:value={timeOut}
              type="time"
              class="theme-input w-full rounded-xl border px-4 py-3 outline-none transition focus:border-violet-200 focus:ring-2 focus:ring-violet-400/30"
            />
          </label>
        </div>

        {#if timeIn && timeOut && formHours > 0}
          <div class="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-700 shadow-sm dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
            Duration: <strong class="font-semibold">{formHours} hours</strong>
          </div>
        {/if}

        <button
          class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-violet-500 to-indigo-500 px-4 py-3.5 text-sm font-semibold text-white shadow-md transition hover:scale-[1.02] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
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
        <article class="theme-soft-panel rounded-xl border p-4">
          <div class="flex items-center justify-between gap-3">
            <p class="theme-text text-sm font-medium">Planned Absences</p>
            <span class="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-500 dark:bg-red-500/15 dark:text-red-300">+{absenceDays}d delay</span>
          </div>

          <div class="mt-4 flex items-center justify-between gap-3">
            <button class="theme-button-soft h-9 w-9 rounded-xl border transition" type="button" on:click={() => adjustAbsenceDays(-1)}>-</button>
            <strong class="theme-heading text-4xl font-bold tracking-tight">{absenceDays}</strong>
            <button class="theme-button-soft h-9 w-9 rounded-xl border transition" type="button" on:click={() => adjustAbsenceDays(1)}>+</button>
          </div>

          <p class="theme-text mt-3 text-sm">days of planned absence</p>
        </article>

        <article class="theme-soft-panel rounded-xl border p-4">
          <div class="flex items-center justify-between gap-3">
            <p class="theme-text text-sm font-medium">Overtime Hours</p>
            <span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-300">-{overtimeDaysAhead}d ahead</span>
          </div>

          <div class="mt-4 flex items-center justify-between gap-3">
            <button class="theme-button-soft h-9 w-9 rounded-xl border transition" type="button" on:click={() => adjustOvertimeHours(-1)}>-</button>
            <strong class="theme-heading text-4xl font-bold tracking-tight">{overtimeHours}h</strong>
            <button class="theme-button-soft h-9 w-9 rounded-xl border transition" type="button" on:click={() => adjustOvertimeHours(1)}>+</button>
          </div>

          <p class="theme-text mt-3 text-sm">extra hours planned</p>
        </article>
      </div>

      <div class="mt-5 rounded-xl border border-violet-200 bg-linear-to-r from-violet-50 to-blue-50 p-4 shadow-sm dark:border-violet-500/30 dark:from-violet-500/10 dark:to-blue-500/10">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.08em] text-violet-600">Estimated Completion Date</p>
            <p class="theme-heading mt-1 text-2xl font-bold tracking-tight">{formatLongDate(estimatedDate)}</p>
            <p class="mt-1 text-sm text-violet-600 dark:text-violet-300">{totalDaysNeeded} working days from today</p>
          </div>

          <div class="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-violet-700 shadow-sm ring-1 ring-violet-100 dark:bg-slate-900/80 dark:text-violet-200 dark:ring-violet-500/30">
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
                <span class={meta.className}>
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

  .theme-table-row:hover,
  .theme-button-soft:hover {
    background: var(--color-hover);
  }

  .theme-button-soft {
    background: var(--color-surface);
    border-color: var(--color-border);
    color: var(--color-text);
  }
</style>
