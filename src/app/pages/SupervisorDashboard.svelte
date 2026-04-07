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
  <section class="flex flex-col gap-6">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <article class="supervisor-card rounded-xl border p-5 shadow-md">
        <div class="supervisor-icon icon-blue"><Users size={18} /></div>
        <p class="supervisor-value mt-4">{totalAssigned}</p>
        <p class="supervisor-label mt-1">Assigned Students</p>
      </article>

      <article class="supervisor-card rounded-xl border p-5 shadow-md">
        <div class="supervisor-icon icon-green"><Clock3 size={18} /></div>
        <p class="supervisor-value mt-4">{totalCompletedHours}h</p>
        <p class="supervisor-label mt-1">Total Completed Hours</p>
      </article>

      <article class="supervisor-card rounded-xl border p-5 shadow-md">
        <div class="supervisor-icon icon-violet"><TrendingUp size={18} /></div>
        <p class="supervisor-value mt-4">{averageProgress}%</p>
        <p class="supervisor-label mt-1">Average Progress</p>
      </article>

      <article class="supervisor-card rounded-xl border p-5 shadow-md">
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

    <section class="supervisor-card rounded-xl border p-6 shadow-md">
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

    <section class="supervisor-card rounded-xl border p-6 shadow-md">
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
            <article class="rounded-lg border border-(--color-border) px-4 py-3">
              <div class="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p class="supervisor-heading text-sm font-semibold">{student.full_name}</p>
                  <p class="supervisor-sub text-xs">{student.department || '-'} • ETA {normalizeDate(student.estimated_end_date)}</p>
                </div>
                <p class="supervisor-sub text-xs font-semibold">{completed}h / {required || '-'}h</p>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-(--color-soft)">
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
  .supervisor-card {
    background: var(--color-surface);
    border-color: var(--color-border);
  }

  .supervisor-heading,
  .supervisor-value {
    color: var(--color-heading);
  }

  .supervisor-label,
  .supervisor-sub {
    color: var(--color-sidebar-text);
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
    background: #dbeafe;
    color: #2563eb;
  }

  .icon-green {
    background: #d1fae5;
    color: #059669;
  }

  .icon-violet {
    background: #ede9fe;
    color: #7c3aed;
  }

  .icon-cyan {
    background: #cffafe;
    color: #0891b2;
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
    background: #4f46e5;
    color: #ffffff;
  }

  .btn-primary:hover:not(:disabled) {
    background: #4338ca;
  }

  .btn-light {
    background: var(--color-soft);
    border-color: var(--color-border);
    color: var(--color-heading);
  }

  .assign-toolbar {
    border-top: 1px solid var(--color-border);
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
    color: var(--color-muted);
    pointer-events: none;
  }

  .search-input {
    background: var(--color-soft);
    border-color: var(--color-border);
    color: var(--color-text);
  }

  .selected-chip {
    background: var(--color-active-bg);
    color: var(--color-active-text);
  }

  .student-pick-card {
    background: var(--color-soft);
    border-color: var(--color-border);
    transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  }

  .student-pick-card:hover {
    transform: translateY(-1px);
  }

  .student-picked {
    border-color: #4f46e5;
    box-shadow: 0 0 0 1px rgba(79, 70, 229, 0.3);
  }

  .pick-indicator {
    background: var(--color-active-bg);
    color: var(--color-active-text);
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
    border-color: var(--color-border);
    background: var(--color-soft);
  }

  .selected-pill {
    background: color-mix(in srgb, var(--color-active-bg) 75%, transparent);
    color: var(--color-active-text);
    border: 1px solid color-mix(in srgb, var(--color-active-text) 25%, transparent);
  }

  .debug-card {
    border-color: var(--color-border);
    background: var(--color-soft);
    color: var(--color-sidebar-text);
    line-height: 1.45;
  }

</style>
