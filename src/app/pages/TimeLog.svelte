<script>
  import { onMount } from 'svelte';
  import {
    AlertCircle,
    Calendar,
    CheckCircle2,
    ClipboardList,
    Clock,
    Coffee,
    Plus,
    Target,
    Trash2,
  } from 'lucide-svelte';
  import * as authApi from '../lib/auth.js';

  const DEFAULT_REQUIRED_HOURS = 500;
  const AVERAGE_DAILY_HOURS = 8;
  const INITIAL_COMPLETED_HOURS = 0;

  let requiredHours = DEFAULT_REQUIRED_HOURS;
  let ojtStartDate = '';

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
  let timeOut = '';
  let todayNotes = '';
  let logSyncError = '';
  let isLoggingIn = false;
  let isLoggingOut = false;
  let isLoggedIn = false; // Simple boolean: true = logged in, false = logged out
  let includeLunch = (() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('ojt_include_lunch') === 'true';
    }
    return false;
  })();

  // Delete confirmation state
  let showDeleteConfirm = false;
  let deleteConfirmEntry = null;

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

  function calculateHours(currentTimeIn, currentTimeOut, withLunch = includeLunch) {
    if (!currentTimeIn || !currentTimeOut) {
      return 0;
    }

    const [inHours, inMinutes] = currentTimeIn.split(':').map(Number);
    const [outHours, outMinutes] = currentTimeOut.split(':').map(Number);
    const diffMinutes = outHours * 60 + outMinutes - (inHours * 60 + inMinutes);
    const rawHours = Math.max(0, Math.round((diffMinutes / 60) * 10) / 10);

    // If lunch is NOT included, deduct 1 hour for lunch break (only if shift is long enough)
    if (!withLunch && rawHours > 1) {
      return Math.max(0, Math.round((rawHours - 1) * 10) / 10);
    }

    return rawHours;
  }

  function handleLunchToggle() {
    includeLunch = !includeLunch;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ojt_include_lunch', String(includeLunch));
    }
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

  function parseIsoDateOnly(value) {
    const normalized = normalizeDateOnly(value);
    if (!normalized) return null;
    const [y, m, d] = normalized.split('-').map((n) => Number(n));
    const dt = new Date(y, m - 1, d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
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
      type: String(row?.entry_type || 'login').toLowerCase(), // 'login' or 'logout'
      notes: String(row?.notes || ''),
      createdAt: String(row?.created_at || ''), // timestamp when entry was created
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
        .sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());
      logSyncError = '';
    } catch (err) {
      logSyncError = err?.message || 'Unable to load time logs right now.';
    }
  }

  function syncRequiredHoursFromAccount() {
    const user = authApi.getCurrentUser();
    const studentHours = Number(user?.ojt?.total_ojt_hours || 0);
    const rawStartDate = user?.ojt?.start_date || user?.first_login_date || '';
    ojtStartDate = normalizeDateOnly(rawStartDate);

    if (user?.role === 'Student' && Number.isFinite(studentHours) && studentHours > 0) {
      requiredHours = studentHours;
      return;
    }

    requiredHours = DEFAULT_REQUIRED_HOURS;
  }

  async function handleLogin() {
    if (!date || !timeIn) {
      logSyncError = 'Please select a date and enter your login time.';
      return;
    }

    isLoggingIn = true;
    logSyncError = '';

    const user = authApi.getCurrentUser();
    if (!user?.user_id) {
      logSyncError = 'Please log in to your account first.';
      isLoggingIn = false;
      return;
    }

    try {
      console.log('🔵 Starting session:', {
        user_id: user.user_id,
        log_date: date,
        time_in: timeIn,
      });

      // Save login to active_sessions table via start_session action
      const response = await authApi.callApiAction('start_session', {
        user_id: user.user_id,
        log_date: date,
        time_in: timeIn,
      });

      console.log('🔵 Response from start_session:', response);
      
      if (response && response.ok === true) {
        console.log('✅ Session started successfully');
        isLoggedIn = true; // Enable logout button
        logSyncError = '';
      } else {
        console.log('❌ Session failed:', response);
        logSyncError = response?.error || 'Failed to start session';
        isLoggedIn = false;
      }
      
      isLoggingIn = false;
    } catch (err) {
      console.error('❌ Login error:', err);
      logSyncError = err?.message || 'Unable to process login.';
      isLoggedIn = false;
      isLoggingIn = false;
    }
  }

  async function handleLogout() {
    if (!timeOut) {
      logSyncError = 'Please enter your logout time.';
      return;
    }

    if (!trimmedNotes) {
      logSyncError = 'Please add notes about your activities before logging out.';
      return;
    }

    if (!timeIn) {
      logSyncError = 'Please enter your login time first.';
      return;
    }

    isLoggingOut = true;
    logSyncError = '';

    const user = authApi.getCurrentUser();
    if (!user?.user_id) {
      logSyncError = 'Please log in again before logging out.';
      isLoggingOut = false;
      return;
    }

    const hours = calculateHours(timeIn, timeOut, includeLunch);

    try {
      console.log('🔴 Ending session:', {
        user_id: user.user_id,
        log_date: date,
        time_in: timeIn,
        time_out: timeOut,
        hours_rendered: hours,
        notes: trimmedNotes,
      });

      // End session and create complete time log entry
      const response = await authApi.callApiAction('end_session', {
        user_id: user.user_id,
        log_date: date,
        time_out: timeOut,
        hours_rendered: hours,
        notes: trimmedNotes,
      });

      console.log('🔴 Response from end_session:', response);

      if (response && response.ok === true) {
        console.log('✅ Session ended successfully');
        logSyncError = '';
        
        // Clear session state
        isLoggedIn = false;
        
        // Reset form fields
        timeOut = '';
        todayNotes = '';
        
        // Reload all entries to ensure they display correctly in the history
        await loadEntriesFromApi();
      } else {
        logSyncError = response?.error || 'Unable to complete session.';
        console.log('❌ Logout failed:', response);
      }

      isLoggingOut = false;
    } catch (err) {
      console.error('❌ Logout error:', err);
      logSyncError = err?.message || 'Unable to log out right now.';
      isLoggingOut = false;
      return;
    }
  }

  async function handleDelete(id) {
    const entry = entries.find((e) => String(e.id) === String(id));
    if (!entry) return;

    deleteConfirmEntry = entry;
    showDeleteConfirm = true;
  }

  async function confirmDelete() {
    if (!deleteConfirmEntry) return;

    const user = authApi.getCurrentUser();
    if (!user?.user_id) {
      logSyncError = 'Please log in again before deleting a time log.';
      showDeleteConfirm = false;
      deleteConfirmEntry = null;
      return;
    }

    try {
      await authApi.deleteTimeLog(user.user_id, deleteConfirmEntry.id);
      entries = entries.filter((entry) => String(entry.id) !== String(deleteConfirmEntry.id));
      logSyncError = '';
    } catch (err) {
      logSyncError = err?.message || 'Unable to delete this time log right now.';
    } finally {
      showDeleteConfirm = false;
      deleteConfirmEntry = null;
    }
  }

  function cancelDelete() {
    showDeleteConfirm = false;
    deleteConfirmEntry = null;
  }

  async function showDebugInfo() {
    try {
      const response = await authApi.callApiAction('debug_sessions_sheet', {});
      console.log('🔧 DEBUG_SESSIONS_SHEET Response:', response);
      
      if (response && response.ok === true) {
        console.log('✅ Active Sessions:', JSON.stringify(response.active_sessions, null, 2));
        console.log('✅ Time Logs:', JSON.stringify(response.time_logs, null, 2));
        alert('Check browser console (Cmd+Option+I) for detailed debug information!');
      } else {
        alert('Debug Error: ' + (response?.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('❌ Debug error:', err);
      alert('Error: ' + err.message);
    }
  }

  onMount(() => {
    // Set date to today by default
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    date = `${year}-${month}-${day}`;
    
    syncRequiredHoursFromAccount();
    loadEntriesFromApi();

    return () => {
      // no-op cleanup for now
    };
  });

  $: formHours = calculateHours(timeIn, timeOut, includeLunch);
  $: trimmedNotes = todayNotes.trim();
  $: canLogin = Boolean(date && timeIn && !isLoggedIn);
  $: canLogout = Boolean(isLoggedIn && date && timeIn && timeOut && trimmedNotes);
  $: currentUserId = String(authApi.getCurrentUser()?.user_id || '').trim();
  $: completedHoursStorageKey = currentUserId ? `ojt_completed_hours_${currentUserId}` : '';
  $: completedHours = INITIAL_COMPLETED_HOURS + entries.reduce((sum, entry) => sum + entry.hours, 0);
  $: remainingHours = Math.max(0, requiredHours - completedHours);
  $: progressPercent = Math.min(100, Math.round((completedHours / requiredHours) * 100));

  // Filter for completed entries (all entries with time_out recorded and hours > 0)
  $: completedEntries = entries.filter(
    (entry) => entry.timeOut && Number(entry.hours) > 0
  );
  // Save completed hours to user-scoped local cache for dashboard fallback.
  $: if (typeof window !== 'undefined' && completedHours >= 0 && completedHoursStorageKey) {
    localStorage.setItem(completedHoursStorageKey, String(completedHours));
  }
  $: effectiveRemaining = Math.max(0, remainingHours);
  $: totalAbsenceHours = 0; // Removed: Math.max(0, absenceDays) * AVERAGE_DAILY_HOURS
  $: adjustedRequiredHours = Math.max(0, requiredHours - Math.max(0, 0)); // Removed overtime calculation
  $: projectedWorkingDays = Math.ceil(adjustedRequiredHours / AVERAGE_DAILY_HOURS);
  $: estimatedDate = (() => {
    const start = parseIsoDateOnly(ojtStartDate) || new Date();
    return addWorkingDays(start, Math.max(0, projectedWorkingDays - 1));
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

  <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
    <!-- Panel 1: Time In -->
    <section class="theme-panel entry-panel rounded-xl border p-6 shadow-md">
      <h3 class="theme-heading text-base font-semibold">Time In</h3>

      <div class="mt-5 flex flex-col gap-4">
        <label class="flex flex-col gap-1.5">
          <span class="theme-text text-sm font-medium">Date</span>
          <input
            bind:value={date}
            type="date"
            class="theme-input entry-input w-full rounded-xl border px-4 py-3 outline-none transition"
          />
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="theme-text text-sm font-medium">Login Time *</span>
          <input
            bind:value={timeIn}
            type="time"
            class="theme-input entry-input w-full rounded-xl border px-4 py-3 outline-none transition"
          />
        </label>

        <button
          class="timelog-submit-btn w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold transition"
          type="button"
          on:click={handleLogin}
          disabled={!canLogin || isLoggingIn}
          title={isLoggedIn ? 'Already logged in for today' : !canLogin ? 'Enter date and login time' : 'Submit login time'}
        >
          {#if isLoggingIn}
            <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
            <span>Logging In...</span>
          {:else}
            <Clock size={15} />
            <span>Log In</span>
          {/if}
        </button>

        {#if isLoggedIn}
          <div class="status-chip status-active rounded-xl border px-4 py-2 text-sm">
            <p class="theme-heading font-semibold">✓ Logged In</p>
            <p class="theme-muted text-xs">Proceed to Time Out</p>
          </div>
        {:else if date && !timeIn}
          <div class="status-chip status-inactive rounded-xl border px-4 py-2 text-sm">
            <p class="theme-text font-semibold">→ Ready</p>
            <p class="theme-muted text-xs">Enter login time</p>
          </div>
        {/if}
      </div>
    </section>

    <!-- Panel 2: Time Out -->
    <section class="theme-panel entry-panel rounded-xl border p-6 shadow-md">
      <h3 class="theme-heading text-base font-semibold">Time Out</h3>

      <div class="mt-5 flex flex-col gap-4">
        <label class="flex flex-col gap-1.5">
          <span class="theme-text text-sm font-medium">Logout Time *</span>
          <input
            bind:value={timeOut}
            type="time"
            class="theme-input entry-input w-full rounded-xl border px-4 py-3 outline-none transition"
          />
        </label>

        {#if timeIn && timeOut && formHours > 0}
          <div class="lunch-toggle-row flex items-center justify-between rounded-xl border px-4 py-3">
            <div class="flex items-center gap-2.5">
              <div class="lunch-toggle-icon inline-flex h-8 w-8 items-center justify-center rounded-lg">
                <Coffee size={15} />
              </div>
              <div>
                <p class="theme-heading text-sm font-medium">Include Lunch</p>
                <p class="theme-muted text-xs">{includeLunch ? 'Counted' : 'Not counted'}</p>
              </div>
            </div>
            <button
              type="button"
              class="lunch-toggle-switch relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200"
              style={`background-color: ${includeLunch ? '#0f766e' : '#cbd5e1'};`}
              on:click={handleLunchToggle}
              aria-label="Toggle include lunch"
            >
              <span class={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${includeLunch ? 'translate-x-5' : 'translate-x-0'}`}></span>
            </button>
          </div>

          <div class="duration-chip rounded-xl border px-4 py-3 text-sm shadow-sm">
            <strong class="font-semibold">{formHours}h</strong>
            {#if !includeLunch && formHours > 0}
              <span class="theme-muted text-xs ml-1">(1h lunch deducted)</span>
            {/if}
          </div>
        {/if}

        <button
          class="timelog-logout-btn w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-semibold transition"
          type="button"
          on:click={handleLogout}
          disabled={!canLogout || isLoggingOut}
          title={!canLogout ? 'Complete all fields' : 'Submit logout time'}
        >
          {#if isLoggingOut}
            <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
            <span>Logging Out...</span>
          {:else}
            <Clock size={15} />
            <span>Log Out</span>
          {/if}
        </button>

        {#if !isLoggedIn}
          <div class="status-chip status-inactive rounded-xl border px-4 py-2 text-sm">
            <p class="theme-text font-semibold">→ Not logged in</p>
            <p class="theme-muted text-xs">Use Time In first</p>
          </div>
        {/if}
      </div>
    </section>

    <!-- Panel 3: Notes -->
    <section class="theme-panel entry-panel rounded-xl border p-6 shadow-md">
      <h3 class="theme-heading text-base font-semibold">Notes</h3>

      <div class="mt-5 flex flex-col gap-4">
        <textarea
          bind:value={todayNotes}
          placeholder="Describe your tasks and activities..."
          class="theme-input entry-input w-full rounded-xl border px-4 py-3 outline-none transition flex-1"
          rows="6"
        ></textarea>

        <p class="theme-text text-xs">
          <strong>Required:</strong> Describe what you did today before logging out.
        </p>
      </div>
    </section>
  </div>

  <!-- Debug Info Button -->
  <div class="px-6 py-3 text-center">
    <button
      type="button"
      on:click={showDebugInfo}
      class="text-xs font-medium px-3 py-1.5 rounded bg-gray-500 text-white hover:bg-gray-600 transition"
      title="Show backend sheet information for debugging"
    >
      🔧 Show Debug Info
    </button>
  </div>

  <section class="theme-panel history-panel overflow-hidden rounded-2xl border shadow-md">
    <div class="theme-divider flex items-center justify-between border-b px-6 py-4">
      <h3 class="theme-heading text-base font-semibold">Time Log History</h3>
      <span class="theme-muted text-sm">{completedEntries.length} completed entries</span>
    </div>

    <div class="overflow-x-auto overflow-y-auto max-h-96 table-scroll-container">
      <table class="min-w-full border-collapse">
        <thead>
          <tr class="theme-divider border-b">
            <th class="theme-muted px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]">Date</th>
            <th class="theme-muted px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]">Type</th>
            <th class="theme-muted px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]">Time In</th>
            <th class="theme-muted px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]">Time Out</th>
            <th class="theme-muted px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]">Hours</th>
            <th class="theme-muted px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]">Notes</th>
            <th class="theme-muted px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]">Created</th>
            <th class="theme-muted px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]">Status</th>
            <th class="theme-muted px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em]"></th>
          </tr>
        </thead>

        <tbody>
          {#each completedEntries as entry (entry.id)}
            {@const meta = statusMeta[entry.status] ?? statusMeta.recorded}
            {@const StatusIcon = meta.icon}
            {@const entryTypeLabel = 'Time Entry'}
            {@const entryTypeClass = 'entry-type-entry'}
            <tr class="theme-table-row border-b transition">
              <td class="theme-text px-6 py-4 text-sm">{formatTableDate(entry.date)}</td>
              <td class="px-6 py-4">
                <span class={`entry-type-badge ${entryTypeClass}`}>{entryTypeLabel}</span>
              </td>
              <td class="theme-text px-6 py-4 text-sm">{entry.timeIn}</td>
              <td class="theme-text px-6 py-4 text-sm">{entry.timeOut || '—'}</td>
              <td class="theme-heading px-6 py-4 text-sm font-semibold">{entry.hours}h</td>
              <td class="theme-text min-w-56 px-6 py-4 text-sm">{entry.notes || '—'}</td>
              <td class="theme-text px-6 py-4 text-sm">{entry.createdAt || '—'}</td>
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
                  title="Delete this entry"
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

  {#if showDeleteConfirm && deleteConfirmEntry}
    <div class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h2 class="modal-title">Confirm Delete</h2>
          <button class="modal-close-btn" on:click={cancelDelete} aria-label="Close dialog">
            ✕
          </button>
        </div>

        <div class="modal-content">
          <p class="modal-message">Are you sure you want to delete this time entry?</p>
          
          <div class="modal-entry-preview">
            <div class="preview-row">
              <span class="preview-label">Date:</span>
              <span class="preview-value">{formatTableDate(deleteConfirmEntry.date)}</span>
            </div>
            <div class="preview-row">
              <span class="preview-label">Time In:</span>
              <span class="preview-value">{deleteConfirmEntry.timeIn}</span>
            </div>
            <div class="preview-row">
              <span class="preview-label">Time Out:</span>
              <span class="preview-value">{deleteConfirmEntry.timeOut || '—'}</span>
            </div>
            <div class="preview-row">
              <span class="preview-label">Hours:</span>
              <span class="preview-value font-semibold">{deleteConfirmEntry.hours}h</span>
            </div>
          </div>

          <p class="modal-warning">This action cannot be undone.</p>
        </div>

        <div class="modal-footer">
          <button class="modal-cancel-btn" on:click={cancelDelete}>
            Cancel
          </button>
          <button class="modal-delete-btn" on:click={confirmDelete}>
            Delete Entry
          </button>
        </div>
      </div>
    </div>
  {/if}
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
    background-image: linear-gradient(110deg, rgba(15, 108, 189, 0.07), transparent 52%);
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

  .lunch-toggle-row {
    background: var(--tl-surface-soft);
    border-color: var(--tl-border);
    transition: border-color 150ms ease;
  }

  .lunch-toggle-row:hover {
    border-color: #93c5fd;
  }

  .lunch-toggle-icon {
    background: #fff7ed;
    color: #c2410c;
    border: 1px solid #fdba74;
  }

  .lunch-toggle-switch {
    cursor: pointer;
  }

  :global(.dark) .lunch-toggle-row:hover {
    border-color: rgba(125, 211, 252, 0.45);
  }

  :global(.dark) .lunch-toggle-icon {
    background: rgba(194, 65, 12, 0.18);
    color: #fdba74;
    border-color: rgba(253, 186, 116, 0.4);
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

  .history-edit-btn {
    color: #7b8ea8;
  }

  .history-edit-btn:hover {
    background: #dbeafe;
    color: #2563eb;
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
    background-image: linear-gradient(110deg, rgba(91, 177, 255, 0.12), transparent 55%);
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

  :global(.dark) .history-edit-btn {
    color: #9caec7;
  }

  :global(.dark) .history-edit-btn:hover {
    background: rgba(37, 99, 235, 0.2);
    color: #93c5fd;
  }

  .timelog-logout-btn {
    color: #dc2626;
    background: #fee2e2;
    border: 1px solid #fecaca;
  }

  .timelog-logout-btn:hover:not(:disabled) {
    background: #fecaca;
    color: #b91c1c;
  }

  .timelog-logout-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .entry-type-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    padding: 0.35rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .entry-type-login {
    background: #dbeafe;
    color: #0c4a6e;
    border: 1px solid #bfdbfe;
  }

  .entry-type-logout {
    background: #fecdd3;
    color: #7c2d12;
    border: 1px solid #fca5a5;
  }

  .entry-type-entry {
    background: #dcfce7;
    color: #0f766e;
    border: 1px solid #86efac;
  }

  .status-chip {
    border-radius: 8px;
    padding: 0.75rem 1rem;
    font-size: 0.95rem;
  }

  .status-active {
    background: #dbeafe;
    border-color: #bfdbfe;
    color: #0c4a6e;
  }

  .status-inactive {
    background: #f3f4f6;
    border-color: #d1d5db;
    color: #374151;
  }

  :global(.dark) .timelog-logout-btn {
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.35);
  }

  :global(.dark) .timelog-logout-btn:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.25);
    color: #fda4af;
  }

  :global(.dark) .entry-type-login {
    background: rgba(30, 144, 255, 0.18);
    color: #93c5fd;
    border-color: rgba(96, 165, 250, 0.35);
  }

  :global(.dark) .entry-type-logout {
    background: rgba(239, 68, 68, 0.18);
    color: #fca5a5;
    border-color: rgba(239, 68, 68, 0.35);
  }

  :global(.dark) .entry-type-entry {
    background: rgba(34, 197, 94, 0.18);
    color: #86efac;
    border-color: rgba(34, 197, 94, 0.35);
  }

  :global(.dark) .status-active {
    background: rgba(30, 144, 255, 0.15);
    border-color: rgba(96, 165, 250, 0.35);
    color: #93c5fd;
  }

  :global(.dark) .status-inactive {
    background: rgba(107, 114, 128, 0.15);
    border-color: rgba(107, 114, 128, 0.35);
    color: #d1d5db;
  }

  .active-session-panel {
    background: linear-gradient(135deg, #f0fdfa 0%, #f7f9fc 100%);
    border-color: #99f6e4;
  }

  :global(.dark) .active-session-panel {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(30, 144, 255, 0.08) 100%);
    border-color: rgba(16, 185, 129, 0.35);
  }

  .session-icon {
    background: linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%);
    color: white;
  }

  .empty-session-panel {
    background: #f9fafb;
    border-color: #e5e7eb;
  }

  :global(.dark) .empty-session-panel {
    background: rgba(107, 114, 128, 0.1);
    border-color: rgba(107, 114, 128, 0.3);
  }

  .empty-icon {
    background: #f3f4f6;
    color: #9ca3af;
  }

  :global(.dark) .empty-icon {
    background: rgba(107, 114, 128, 0.2);
    color: #6b7280;
  }

  @media (max-width: 768px) {
    .timelog-shell {
      border-radius: 1rem;
      padding: 0;
    }
  }

  /* Table scrollbar styling */
  .table-scroll-container {
    scrollbar-width: thin;
    scrollbar-color: rgba(96, 165, 250, 0.5) transparent;
  }

  .table-scroll-container::-webkit-scrollbar {
    height: 8px;
    width: 8px;
  }

  .table-scroll-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .table-scroll-container::-webkit-scrollbar-thumb {
    background: rgba(96, 165, 250, 0.5);
    border-radius: 4px;
  }

  .table-scroll-container::-webkit-scrollbar-thumb:hover {
    background: rgba(96, 165, 250, 0.7);
  }

  :global(.dark) .table-scroll-container {
    scrollbar-color: rgba(96, 165, 250, 0.4) transparent;
  }

  :global(.dark) .table-scroll-container::-webkit-scrollbar-thumb {
    background: rgba(96, 165, 250, 0.4);
  }

  :global(.dark) .table-scroll-container::-webkit-scrollbar-thumb:hover {
    background: rgba(96, 165, 250, 0.6);
  }

  /* Delete Confirmation Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: 1rem;
    backdrop-filter: blur(2px);
  }

  .modal-container {
    background: #ffffff;
    border-radius: 1rem;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    max-width: 420px;
    width: 100%;
    overflow: hidden;
    animation: modalSlideIn 0.3s ease-out;
  }

  @keyframes modalSlideIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  :global(.dark) .modal-container {
    background: #1f2937;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }

  :global(.dark) .modal-header {
    border-bottom-color: #374151;
  }

  .modal-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }

  :global(.dark) .modal-title {
    color: #f3f4f6;
  }

  .modal-close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: #6b7280;
    cursor: pointer;
    padding: 0;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.375rem;
    transition: all 0.2s;
  }

  .modal-close-btn:hover {
    background: #f3f4f6;
    color: #1f2937;
  }

  :global(.dark) .modal-close-btn:hover {
    background: rgba(75, 85, 99, 0.5);
    color: #f3f4f6;
  }

  .modal-content {
    padding: 1.5rem;
  }

  .modal-message {
    font-size: 1rem;
    color: #374151;
    margin: 0 0 1.25rem 0;
    font-weight: 500;
  }

  :global(.dark) .modal-message {
    color: #d1d5db;
  }

  .modal-entry-preview {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1rem;
    margin: 1rem 0;
  }

  :global(.dark) .modal-entry-preview {
    background: rgba(75, 85, 99, 0.2);
    border-color: #374151;
  }

  .preview-row {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    font-size: 0.875rem;
  }

  .preview-row:not(:last-child) {
    border-bottom: 1px solid #e5e7eb;
  }

  :global(.dark) .preview-row:not(:last-child) {
    border-bottom-color: #374151;
  }

  .preview-label {
    color: #6b7280;
    font-weight: 500;
  }

  :global(.dark) .preview-label {
    color: #9ca3af;
  }

  .preview-value {
    color: #1f2937;
    font-weight: 500;
  }

  :global(.dark) .preview-value {
    color: #f3f4f6;
  }

  .modal-warning {
    font-size: 0.75rem;
    color: #dc2626;
    margin: 1rem 0 0 0;
    padding-top: 1rem;
    border-top: 1px solid #e5e7eb;
  }

  :global(.dark) .modal-warning {
    color: #fca5a5;
    border-top-color: #374151;
  }

  .modal-footer {
    display: flex;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid #e5e7eb;
    background: #f9fafb;
  }

  :global(.dark) .modal-footer {
    border-top-color: #374151;
    background: rgba(75, 85, 99, 0.1);
  }

  .modal-cancel-btn,
  .modal-delete-btn {
    flex: 1;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .modal-cancel-btn {
    background: #e5e7eb;
    color: #1f2937;
  }

  .modal-cancel-btn:hover {
    background: #d1d5db;
  }

  :global(.dark) .modal-cancel-btn {
    background: rgba(107, 114, 128, 0.4);
    color: #f3f4f6;
  }

  :global(.dark) .modal-cancel-btn:hover {
    background: rgba(107, 114, 128, 0.6);
  }

  .modal-delete-btn {
    background: #dc2626;
    color: #ffffff;
  }

  .modal-delete-btn:hover {
    background: #b91c1c;
  }

  .modal-delete-btn:active {
    transform: scale(0.98);
  }

  :global(.dark) .modal-delete-btn {
    background: rgba(239, 68, 68, 0.85);
  }

  :global(.dark) .modal-delete-btn:hover {
    background: rgba(239, 68, 68, 1);
  }
</style>
