<script>
  import { onDestroy, onMount } from 'svelte';
  import {
    Clock3,
    Layers3,
    RefreshCw,
    Search,
    Save,
    TrendingUp,
    UserPlus2,
    Users,
    X,
  } from 'lucide-svelte';
  import {
    assignStudentsToSupervisor,
    debugSupervisorAssignment,
    getCurrentUser,
    listStudentsForAssignment,
    listSupervisorAssignedStudents,
    subscribeToCurrentUser,
  } from '../lib/auth.js';
  import { subscribeToSync } from '../lib/sync.js';

  let currentUser = null;
  let unsubscribeAuth;
  let unsubscribeSync;
  let loading = true;
  let saving = false;
  let errorMessage = '';
  let successMessage = '';
  let debugInfo = null;
  const SHOW_ASSIGN_DEBUG = false;

  let availableStudents = [];
  let assignedStudents = [];
  let selectedStudentIds = [];
  let studentSearch = '';

  function normalizeDate(value) {
    const text = String(value || '').trim();
    if (!text) {
      return '-';
    }

    const parsed = new Date(`${text}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return text;
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(parsed);
  }

  function toNumber(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function toPercent(completed, required) {
    if (required <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((completed / required) * 100));
  }

  function getInitials(fullName) {
    const value = String(fullName || '').trim();
    if (!value) {
      return 'ST';
    }

    const initials = value
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');

    return initials || 'ST';
  }

  function syncSelectedFromAvailable() {
    selectedStudentIds = availableStudents
      .filter((student) => student?.is_assigned)
      .map((student) => String(student.user_id || ''));
  }

  async function loadData() {
    const supervisorId = String(currentUser?.user_id || '').trim();
    const roleNow = String(currentUser?.role || '').trim().toLowerCase();

    if (!supervisorId || roleNow !== 'supervisor') {
      availableStudents = [];
      assignedStudents = [];
      selectedStudentIds = [];
      debugInfo = {
        local_user_id: supervisorId || '(missing)',
        local_role: roleNow || '(missing)',
        debug_call_error: !supervisorId
          ? 'Missing supervisor user_id in current session.'
          : 'Current user is not supervisor.',
      };
      return;
    }

    loading = true;
    errorMessage = '';
    debugInfo = {
      local_user_id: supervisorId,
      local_role: roleNow || '(missing)',
      debug_call_error: '',
    };

    try {
      const [students, assigned] = await Promise.all([
        listStudentsForAssignment(supervisorId),
        listSupervisorAssignedStudents(supervisorId),
      ]);

      availableStudents = students;
      assignedStudents = assigned;
      syncSelectedFromAvailable();

      if (!students.length) {
        try {
          const serverDebug = await debugSupervisorAssignment(supervisorId);
          debugInfo = {
            ...debugInfo,
            ...(serverDebug || {}),
          };
        } catch (err) {
          debugInfo = {
            ...debugInfo,
            debug_call_error: err?.message || 'Debug action call failed.',
          };
        }
      } else {
        debugInfo = null;
      }
    } catch (err) {
      errorMessage = err?.message || 'Unable to load supervisor dashboard data.';
      debugInfo = {
        ...debugInfo,
        debug_call_error: errorMessage,
      };
    } finally {
      loading = false;
    }
  }

  function toggleStudentSelection(studentId) {
    const target = String(studentId || '').trim();
    if (!target) {
      return;
    }

    if (selectedStudentIds.includes(target)) {
      selectedStudentIds = selectedStudentIds.filter((id) => id !== target);
      return;
    }

    selectedStudentIds = [...selectedStudentIds, target];
  }

  function selectAllShown() {
    const ids = filteredStudents
      .map((student) => String(student?.user_id || '').trim())
      .filter(Boolean);

    selectedStudentIds = Array.from(new Set([...selectedStudentIds, ...ids]));
  }

  function clearSelection() {
    selectedStudentIds = [];
  }

  function removeSelectedStudent(studentId) {
    const target = String(studentId || '').trim();
    if (!target) {
      return;
    }
    selectedStudentIds = selectedStudentIds.filter((id) => id !== target);
  }

  async function handleSaveAssignments() {
    const supervisorId = String(currentUser?.user_id || '').trim();
    const roleNow = String(currentUser?.role || '').trim().toLowerCase();

    if (!supervisorId || roleNow !== 'supervisor') {
      errorMessage = 'Only supervisor accounts can save assignments.';
      return;
    }

    saving = true;
    errorMessage = '';
    successMessage = '';

    try {
      await assignStudentsToSupervisor(supervisorId, selectedStudentIds);
      successMessage = 'Assigned students updated successfully.';
      await loadData();
    } catch (err) {
      errorMessage = err?.message || 'Unable to save assigned students.';
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    currentUser = getCurrentUser();

    unsubscribeAuth = subscribeToCurrentUser((user) => {
      currentUser = user;
      loadData();
    });

    unsubscribeSync = subscribeToSync(() => {
      if (!saving) {
        loadData();
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

  $: totalAssigned = assignedStudents.length;
  $: totalRequiredHours = assignedStudents.reduce((sum, student) => sum + toNumber(student.required_hours), 0);
  $: totalCompletedHours = assignedStudents.reduce((sum, student) => sum + toNumber(student.completed_hours), 0);
  $: averageProgress = totalRequiredHours > 0 ? Math.round((totalCompletedHours / totalRequiredHours) * 100) : 0;
  $: currentRole = String(currentUser?.role || '').trim().toLowerCase();
  $: isSupervisorUser = currentRole === 'supervisor';
  $: normalizedStudentSearch = String(studentSearch || '').trim().toLowerCase();
  $: filteredStudents = availableStudents.filter((student) => {
    if (!normalizedStudentSearch) {
      return true;
    }

    const haystack = [
      String(student?.full_name || ''),
      String(student?.email || ''),
      String(student?.department || ''),
      String(student?.company || ''),
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedStudentSearch);
  });
  $: selectedStudentsPreview = availableStudents.filter((student) =>
    selectedStudentIds.includes(String(student?.user_id || ''))
  );
  $: selectedCount = selectedStudentIds.length;
</script>

{#if currentUser && !isSupervisorUser}
  <section class="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
    This page is available for supervisor accounts only.
  </section>
{:else}
  <section class="supervisor-shell flex flex-col gap-6">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <article class="supervisor-card supervisor-stat stat-primary rounded-2xl border p-5 shadow-md">
        <div class="supervisor-icon icon-blue"><Users size={18} /></div>
        <p class="supervisor-value mt-4">{totalAssigned}</p>
        <p class="supervisor-label mt-1">Assigned Students</p>
      </article>

      <article class="supervisor-card supervisor-stat stat-success rounded-2xl border p-5 shadow-md">
        <div class="supervisor-icon icon-green"><Clock3 size={18} /></div>
        <p class="supervisor-value mt-4">{totalCompletedHours}h</p>
        <p class="supervisor-label mt-1">Total Completed Hours</p>
      </article>

      <article class="supervisor-card supervisor-stat stat-info rounded-2xl border p-5 shadow-md">
        <div class="supervisor-icon icon-violet"><TrendingUp size={18} /></div>
        <p class="supervisor-value mt-4">{averageProgress}%</p>
        <p class="supervisor-label mt-1">Average Progress</p>
      </article>

      <article class="supervisor-card supervisor-stat stat-forecast rounded-2xl border p-5 shadow-md">
        <div class="supervisor-icon icon-cyan"><Layers3 size={18} /></div>
        <p class="supervisor-value mt-4">{totalRequiredHours}h</p>
        <p class="supervisor-label mt-1">Total Required Hours</p>
      </article>
    </div>

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

    <section class="supervisor-card supervisor-panel rounded-2xl border p-6 shadow-md">
      <div class="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 class="supervisor-heading text-lg font-semibold">Assign Students</h3>
          <p class="supervisor-sub mt-1 text-sm">Pick students from the spreadsheet that will be handled by your account.</p>
        </div>

        <div class="flex gap-2">
          <button type="button" class="btn-light rounded-lg px-3 py-2 text-sm font-semibold" on:click={loadData} disabled={loading || saving}>
            <RefreshCw size={15} />
            Refresh
          </button>
          <button type="button" class="btn-primary rounded-lg px-3 py-2 text-sm font-semibold" on:click={handleSaveAssignments} disabled={saving}>
            <Save size={15} />
            {saving ? 'Saving...' : 'Save Assignment'}
          </button>
        </div>
      </div>

      <div class="assign-toolbar mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label class="search-wrap w-full lg:max-w-md">
          <span class="search-icon"><Search size={14} /></span>
          <input
            bind:value={studentSearch}
            type="text"
            class="search-input w-full rounded-lg border px-3 py-2.5 pl-9 text-sm outline-none"
            placeholder="Search students by name, email, or department"
          />
        </label>

        <div class="flex flex-wrap items-center gap-2">
          <span class="selected-chip rounded-full px-3 py-1 text-xs font-semibold">{selectedCount} selected</span>
          <button
            type="button"
            class="btn-light rounded-lg px-3 py-2 text-xs font-semibold"
            on:click={selectAllShown}
            disabled={!filteredStudents.length || saving}
          >
            Select All Shown
          </button>
          <button
            type="button"
            class="btn-light rounded-lg px-3 py-2 text-xs font-semibold"
            on:click={clearSelection}
            disabled={!selectedCount || saving}
          >
            Clear Selection
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {#if loading}
          <p class="supervisor-sub text-sm">Loading student accounts...</p>
        {:else if availableStudents.length === 0}
          <p class="supervisor-sub text-sm">No student accounts found in the spreadsheet yet.</p>

          {#if SHOW_ASSIGN_DEBUG && debugInfo}
            <article class="debug-card mt-1 rounded-lg border p-3 text-xs">
              <p><strong>Debug:</strong> Local supervisor_id = {debugInfo?.local_user_id || '(empty)'}</p>
              <p>Local role = {debugInfo?.local_role || '(empty)'}</p>
              <p>Connected MAIN_DB = {debugInfo?.main_db_id || '(empty)'}</p>
              <p>Users read from DB: {debugInfo?.users_count ?? 0}</p>
              <p>Candidate students found: {debugInfo?.candidate_students_count ?? 0}</p>
              <p>Supervisor record found: {debugInfo?.supervisor_found ? 'Yes' : 'No'} ({debugInfo?.supervisor_role || '-'})</p>
              {#if debugInfo?.sheet_error}
                <p>Sheet error: {debugInfo.sheet_error}</p>
              {/if}
              {#if debugInfo?.debug_call_error}
                <p>Debug call error: {debugInfo.debug_call_error}</p>
              {/if}
            </article>
          {/if}
        {:else if filteredStudents.length === 0}
          <p class="supervisor-sub text-sm">No students match your search.</p>
        {:else}
          {#each filteredStudents as student (student.user_id)}
            <button
              type="button"
              class="student-pick-card w-full rounded-xl border p-3 text-left"
              class:student-picked={selectedStudentIds.includes(String(student.user_id || ''))}
              on:click={() => toggleStudentSelection(student.user_id)}
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex min-w-0 items-start gap-3">
                  <span class="student-avatar">
                    {#if student.profile_photo_url}
                      <img src={student.profile_photo_url} alt={`${student.full_name} avatar`} class="student-avatar-image" />
                    {:else}
                      {getInitials(student.full_name)}
                    {/if}
                  </span>
                  <div class="min-w-0">
                    <p class="supervisor-heading truncate text-sm font-semibold">{student.full_name}</p>
                    <p class="supervisor-sub truncate text-xs">{student.email}</p>
                    <p class="supervisor-sub mt-1 text-xs">{student.company || '-'} • {student.department || '-'}</p>
                  </div>
                </div>
                <span class="pick-indicator rounded-full px-2 py-0.5 text-[11px] font-semibold">
                  {selectedStudentIds.includes(String(student.user_id || '')) ? 'Selected' : 'Select'}
                </span>
              </div>
            </button>
          {/each}
        {/if}
      </div>

      {#if selectedStudentsPreview.length > 0}
        <div class="selected-preview mt-4 rounded-lg border p-3">
          <p class="supervisor-heading mb-2 text-xs font-semibold uppercase tracking-[0.08em]">Selected Students</p>
          <div class="flex flex-wrap gap-2">
            {#each selectedStudentsPreview as student (student.user_id)}
              <button
                type="button"
                class="selected-pill inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
                on:click={() => removeSelectedStudent(student.user_id)}
              >
                <span>{student.full_name}</span>
                <X size={12} />
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </section>

    <section class="supervisor-card supervisor-panel rounded-2xl border p-6 shadow-md">
      <div class="mb-4 flex items-center gap-2">
        <UserPlus2 size={17} class="supervisor-sub" />
        <h3 class="supervisor-heading text-lg font-semibold">Assigned Student Progress</h3>
      </div>

      {#if assignedStudents.length === 0}
        <p class="supervisor-sub text-sm">No students assigned yet.</p>
      {:else}
        <div class="space-y-3">
          {#each assignedStudents as student (student.user_id)}
            {@const required = toNumber(student.required_hours)}
            {@const completed = toNumber(student.completed_hours)}
            {@const progress = toPercent(completed, required)}
            <article class="student-progress-card rounded-lg border px-4 py-3">
              <div class="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p class="supervisor-heading text-sm font-semibold">{student.full_name}</p>
                  <p class="supervisor-sub text-xs">{student.department || '-'} • ETA {normalizeDate(student.estimated_end_date)}</p>
                </div>
                <p class="supervisor-sub text-xs font-semibold">{completed}h / {required || '-'}h</p>
              </div>
              <div class="progress-track h-2 overflow-hidden rounded-full">
                <div class="h-full rounded-full bg-linear-to-r from-indigo-500 to-cyan-500" style={`width:${progress}%`}></div>
              </div>
              <p class="supervisor-sub mt-2 text-xs">{progress}% complete</p>
            </article>
          {/each}
        </div>
      {/if}
    </section>
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
    background-image: linear-gradient(112deg, rgba(15, 108, 189, 0.08), transparent 52%),
      repeating-linear-gradient(90deg, transparent 0, transparent 30px, rgba(15, 108, 189, 0.04) 30px, rgba(15, 108, 189, 0.04) 31px);
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
  .supervisor-sub {
    color: var(--sp-text);
  }

  .supervisor-value {
    font-size: 1.75rem;
    line-height: 1;
    font-weight: 700;
  }

  .supervisor-icon {
    width: 2.35rem;
    height: 2.35rem;
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

  .icon-green {
    background: #dcfce7;
    color: #0f766e;
    border: 1px solid #86efac;
  }

  .icon-violet {
    background: #dbeafe;
    color: #1d4ed8;
    border: 1px solid #93c5fd;
  }

  .icon-cyan {
    background: #cffafe;
    color: #0f766e;
    border: 1px solid #67e8f9;
  }

  :global(.dark) .icon-blue {
    background: rgba(59, 130, 246, 0.2);
    color: #bfdbfe;
  }

  :global(.dark) .icon-green {
    background: rgba(16, 185, 129, 0.2);
    color: #a7f3d0;
  }

  :global(.dark) .icon-violet {
    background: rgba(139, 92, 246, 0.2);
    color: #ddd6fe;
  }

  :global(.dark) .icon-cyan {
    background: rgba(6, 182, 212, 0.2);
    color: #a5f3fc;
  }

  .btn-primary,
  .btn-light {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    border: 1px solid transparent;
  }

  .btn-primary {
    background: linear-gradient(90deg, #0f6cbd, #0ea5e9);
    border-color: #0f6cbd;
    color: #ffffff;
    box-shadow: 0 14px 28px -16px rgba(15, 108, 189, 0.9);
  }

  .btn-primary:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-1px);
  }

  .btn-light {
    background: #edf4fb;
    border-color: #bed2e8;
    color: var(--sp-heading);
  }

  .btn-light:hover:not(:disabled) {
    background: #e2edf9;
  }

  .assign-toolbar {
    border-top: 1px solid var(--sp-border);
    padding-top: 0.85rem;
  }

  .search-wrap {
    position: relative;
  }

  .search-icon {
    position: absolute;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    color: #67809e;
    pointer-events: none;
  }

  .search-input {
    background: #edf4fb;
    border-color: #bed2e8;
    color: var(--sp-heading);
  }

  .search-input:focus {
    border-color: #60a5fa;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  }

  .selected-chip {
    background: #e0efff;
    color: #0f6cbd;
    border: 1px solid #bfdbfe;
  }

  .student-pick-card {
    background: #edf4fb;
    border-color: #bed2e8;
    transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  }

  .student-pick-card:hover {
    transform: translateY(-1px);
  }

  .student-picked {
    border-color: #0f6cbd;
    box-shadow: 0 0 0 1px rgba(15, 108, 189, 0.3);
  }

  .pick-indicator {
    background: #e0efff;
    color: #0f6cbd;
  }

  .student-avatar {
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 700;
    color: #ffffff;
    flex-shrink: 0;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    overflow: hidden;
  }

  .student-avatar-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .selected-preview {
    border-color: #c9d9ec;
    background: #f1f7fd;
  }

  .selected-pill {
    background: #e0efff;
    color: #0f6cbd;
    border: 1px solid #bfdbfe;
  }

  .student-progress-card {
    border-color: var(--sp-border);
    background: #f8fbff;
  }

  .progress-track {
    background: #e2edf9;
  }

  .debug-card {
    border-color: var(--sp-border);
    background: #f1f7fd;
    color: #4d6684;
    line-height: 1.45;
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
    background-image: linear-gradient(112deg, rgba(91, 177, 255, 0.12), transparent 55%),
      repeating-linear-gradient(90deg, transparent 0, transparent 32px, rgba(148, 163, 184, 0.07) 32px, rgba(148, 163, 184, 0.07) 33px);
  }

  :global(.dark) .supervisor-card {
    box-shadow: 0 20px 38px -30px rgba(2, 8, 23, 0.95);
  }

  :global(.dark) .supervisor-panel {
    background: linear-gradient(150deg, rgba(22, 35, 56, 0.96), rgba(19, 30, 49, 0.98));
  }

  :global(.dark) .btn-light,
  :global(.dark) .search-input,
  :global(.dark) .student-pick-card,
  :global(.dark) .selected-chip,
  :global(.dark) .pick-indicator,
  :global(.dark) .selected-preview,
  :global(.dark) .selected-pill,
  :global(.dark) .student-progress-card,
  :global(.dark) .debug-card {
    background: #1a2c45;
    border-color: #334b6b;
    color: #dbe7f5;
  }

  :global(.dark) .progress-track {
    background: #243a56;
  }

  :global(.dark) .btn-light:hover:not(:disabled) {
    background: #223653;
  }

  :global(.dark) .search-input:focus {
    border-color: #7cc3ff;
    box-shadow: 0 0 0 3px rgba(91, 177, 255, 0.24);
  }

  @media (max-width: 768px) {
    .supervisor-shell {
      border-radius: 1rem;
      padding: 0;
    }
  }

</style>
