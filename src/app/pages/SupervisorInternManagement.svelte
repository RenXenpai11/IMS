<script>
  import { onDestroy, onMount } from 'svelte';
  import { Check, RefreshCw, Save, Search, Users, X, Loader2 } from 'lucide-svelte';
  import {
    assignStudentsToSupervisor,
    getCurrentUser,
    listStudentsForAssignment,
    listSupervisorAssignedStudents,
    subscribeToCurrentUser,
  } from '../lib/auth.js';

  export let currentUser = null;

  let loading = true;
  let saving = false;
  let errorMessage = '';
  let successMessage = '';
  let availableStudents = [];
  let assignedStudents = [];
  let selectedStudentIds = [];
  let studentSearch = '';
  let unsubscribe;

  function toNumber(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function toPercent(completed, required) {
    if (required <= 0) return 0;
    return Math.min(100, Math.round((completed / required) * 100));
  }

  function getInitials(fullName) {
    const value = String(fullName || '').trim();
    if (!value) return 'ST';
    return (
      value
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || 'ST'
    );
  }

  function normalizeDate(value) {
    const text = String(value || '').trim();
    if (!text) return '-';
    const parsed = new Date(`${text}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return text;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(parsed);
  }

  function normalizeDepartment(dept) {
    const d = String(dept || '').trim();
    if (d.toUpperCase() === 'INTERNATIONAL NOC') return 'ISOC';
    return d;
  }

  function syncSelectedFromFetched(students, assigned) {
    const fromAvailable = students
      .filter((student) => Boolean(student?.is_assigned))
      .map((student) => String(student?.user_id || '').trim())
      .filter(Boolean);

    const fromAssigned = assigned
      .map((student) => String(student?.user_id || '').trim())
      .filter(Boolean);

    selectedStudentIds = Array.from(new Set([...fromAvailable, ...fromAssigned]));
  }

  async function loadData() {
    const supervisorId = String(currentUser?.user_id || '').trim();
    const roleNow = String(currentUser?.role || '').trim().toLowerCase();

    if (!supervisorId || roleNow !== 'supervisor') {
      availableStudents = [];
      assignedStudents = [];
      selectedStudentIds = [];
      loading = false;
      return;
    }

    loading = true;
    errorMessage = '';

    try {
      const [students, assigned] = await Promise.all([
        listStudentsForAssignment(supervisorId),
        listSupervisorAssignedStudents(supervisorId),
      ]);

      availableStudents = students;
      assignedStudents = assigned;
      syncSelectedFromFetched(students, assigned);
    } catch (err) {
      errorMessage = err?.message || 'Unable to load interns.';
    } finally {
      loading = false;
    }
  }

  function toggleStudentSelection(studentId) {
    const target = String(studentId || '').trim();
    if (!target) return;

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
    if (!target) return;
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
      successMessage = 'Assigned interns updated successfully.';
      await loadData();
    } catch (err) {
      errorMessage = err?.message || 'Unable to save assigned interns.';
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    currentUser = currentUser || getCurrentUser();

    unsubscribe = subscribeToCurrentUser((user) => {
      currentUser = user;
      loadData();
    });

    loadData();
  });

  onDestroy(() => {
    if (typeof unsubscribe === 'function') unsubscribe();
  });

  $: currentRole = String(currentUser?.role || '').trim().toLowerCase();
  $: isSupervisorUser = currentRole === 'supervisor';
  $: normalizedSearch = String(studentSearch || '').trim().toLowerCase();
  $: filteredStudents = availableStudents.filter((student) => {
    if (!normalizedSearch) return true;
    const haystack = [
      String(student?.full_name || ''),
      String(student?.email || ''),
      String(student?.department || ''),
      String(student?.company || ''),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedSearch);
  });
  $: selectedStudentsPreview = availableStudents.filter((student) =>
    selectedStudentIds.includes(String(student?.user_id || ''))
  );
  $: selectedCount = selectedStudentIds.length;
  $: totalAssigned = assignedStudents.length;
  $: totalRequiredHours = assignedStudents.reduce((sum, student) => sum + toNumber(student.required_hours), 0);
  $: totalCompletedHours = assignedStudents.reduce((sum, student) => sum + toNumber(student.completed_hours), 0);
  $: averageProgress = totalRequiredHours > 0 ? Math.round((totalCompletedHours / totalRequiredHours) * 100) : 0;
</script>

{#if currentUser && !isSupervisorUser}
  <section class="warning-alert">
    This page is available for supervisor accounts only.
  </section>
{:else}
  <div class="content">
    <div class="stats-grid">
      <div class="stat-card stat-blue">
        <div class="stat-icon"><Users size={18} /></div>
        <p class="stat-value">{totalAssigned}</p>
        <p class="stat-label">Assigned Interns</p>
      </div>

      <div class="stat-card stat-success">
        <div class="stat-icon"><Check size={18} /></div>
        <p class="stat-value">{totalCompletedHours}h</p>
        <p class="stat-label">Completed Hours</p>
      </div>

      <div class="stat-card stat-violet">
        <div class="stat-icon"><Save size={18} /></div>
        <p class="stat-value">{averageProgress}%</p>
        <p class="stat-label">Average Progress</p>
      </div>

      <div class="stat-card stat-cyan">
        <div class="stat-icon"><RefreshCw size={18} /></div>
        <p class="stat-value">{totalRequiredHours}h</p>
        <p class="stat-label">Required Hours</p>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Assign Interns</h3>
          <p class="text-muted text-sm">Display all interns and select who will be assigned to your account.</p>
        </div>

        <div class="btn-group">
          <button class="btn btn-secondary" type="button" on:click={loadData} disabled={loading || saving}>
            <RefreshCw size={15} />Refresh
          </button>
          <button class="btn btn-primary" type="button" on:click={handleSaveAssignments} disabled={saving} style="display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;">
            {#if saving}
              <span class="spinning-icon"><Loader2 size={15} /></span>
            {:else}
              <Save size={15} />
            {/if}
            <span>{saving ? 'Saving...' : 'Save Assignment'}</span>
          </button>
        </div>
      </div>

      {#if errorMessage}
        <p class="alert alert-error">{errorMessage}</p>
      {/if}
      {#if successMessage}
        <p class="alert alert-success">{successMessage}</p>
      {/if}

      <div class="assign-toolbar">
        <label class="search-wrap">
          <span class="search-icon"><Search size={14} /></span>
          <input
            bind:value={studentSearch}
            type="text"
            class="search-input"
            placeholder="Search interns by name, email, department, or company"
          />
        </label>

        <div class="toolbar-actions">
          <span class="selected-chip">{selectedCount} selected</span>
          <button
            class="btn btn-secondary btn-xs"
            type="button"
            on:click={selectAllShown}
            disabled={!filteredStudents.length || saving}
          >
            Select All Shown
          </button>
          <button
            class="btn btn-secondary btn-xs"
            type="button"
            on:click={clearSelection}
            disabled={!selectedCount || saving}
          >
            Clear Selection
          </button>
        </div>
      </div>

      {#if loading}
        <p class="text-muted">Loading intern accounts...</p>
      {:else if availableStudents.length === 0}
        <p class="text-muted">No intern accounts found in the spreadsheet yet.</p>
      {:else if filteredStudents.length === 0}
        <p class="text-muted">No interns match your search.</p>
      {:else}
        <div class="pick-grid">
          {#each filteredStudents as student (student.user_id)}
            {@const isSelected = selectedStudentIds.includes(String(student.user_id || ''))}
            <button
              type="button"
              class="student-pick"
              class:selected={isSelected}
              on:click={() => toggleStudentSelection(student.user_id)}
            >
              <div class="student-row">
                <div class="avatar">
                  {#if student.profile_photo_url}
                    <img src={student.profile_photo_url} alt={`${student.full_name} avatar`} />
                  {:else}
                    {getInitials(student.full_name)}
                  {/if}
                </div>
                <div class="student-copy">
                  <p class="font-semibold text-sm truncate">{student.full_name}</p>
                  <p class="text-xs text-muted truncate">{student.email}</p>
                  <p class="text-xs text-muted mt-1">{student.company || '-'} • {normalizeDepartment(student.department) || '-'}</p>
                </div>
                <span class="pick-indicator">{isSelected ? 'Selected' : 'Select'}</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}

      {#if selectedStudentsPreview.length > 0}
        <div class="selected-preview">
          <p class="selected-title">Selected Interns</p>
          <div class="selected-pills">
            {#each selectedStudentsPreview as student (student.user_id)}
              <button class="selected-pill" type="button" on:click={() => removeSelectedStudent(student.user_id)}>
                <span>{student.full_name}</span>
                <X size={12} />
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <div class="card">
      <h3 class="card-title">Assigned Intern Progress</h3>
      {#if assignedStudents.length === 0}
        <p class="text-muted">No interns assigned yet.</p>
      {:else}
        <div class="assigned-list">
          {#each assignedStudents as student (student.user_id)}
            {@const required = toNumber(student.required_hours)}
            {@const completed = toNumber(student.completed_hours)}
            {@const progress = toPercent(completed, required)}
            <article class="assigned-item">
              <div class="assigned-head">
                <div>
                  <p class="font-semibold text-sm">{student.full_name}</p>
                  <p class="text-xs text-muted">{normalizeDepartment(student.department) || '-'} • ETA {normalizeDate(student.estimated_end_date)}</p>
                </div>
                <p class="text-xs font-semibold text-muted">{completed}h / {required || '-'}h</p>
              </div>
              <div class="progress-bar"><div class="progress-fill" style={`width:${progress}%`}></div></div>
              <p class="text-xs text-muted mt-2">{progress}% complete</p>
            </article>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  :root {
    --text-primary: #0f172a;
    --text-secondary: #1f2937;
    --text-muted: #6b7280;
    --border: #d7e3f1;
    --surface: #ffffff;
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
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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

  .stat-blue {
    border-top-color: #2563eb;
  }

  .stat-success {
    border-top-color: #059669;
  }

  .stat-violet {
    border-top-color: #7c3aed;
  }

  .stat-cyan {
    border-top-color: #0891b2;
  }

  .stat-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 0.65rem;
    color: #fff;
  }

  .stat-blue .stat-icon {
    background: #2563eb;
  }

  .stat-success .stat-icon {
    background: #059669;
  }

  .stat-violet .stat-icon {
    background: #7c3aed;
  }

  .stat-cyan .stat-icon {
    background: #0891b2;
  }

  .stat-value {
    margin: 0.75rem 0 0.25rem;
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .stat-label {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 1rem;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .card-title {
    margin: 0 0 0.5rem 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .alert {
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
    border: 1px solid;
    font-size: 0.875rem;
    font-weight: 500;
    margin-bottom: 1rem;
  }

  .alert-error {
    background: #fef2f2;
    border-color: #fed7d7;
    color: #991b1b;
  }

  .alert-success {
    background: #ecfdf5;
    border-color: #a7f3d0;
    color: #065f46;
  }

  .assign-toolbar {
    border-top: 1px solid var(--border);
    padding-top: 0.85rem;
    margin-bottom: 1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
  }

  .search-wrap {
    position: relative;
    flex: 1;
    min-width: 280px;
  }

  .search-icon {
    position: absolute;
    top: 50%;
    left: 0.75rem;
    transform: translateY(-50%);
    color: var(--text-muted);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    border: 1px solid var(--border);
    background: #f9fbff;
    color: var(--text-primary);
    border-radius: 0.65rem;
    padding: 0.625rem 0.75rem 0.625rem 2.15rem;
    font-size: 0.875rem;
    outline: none;
  }

  .search-input:focus {
    border-color: #0f6cbd;
    box-shadow: 0 0 0 2px rgba(15, 108, 189, 0.16);
  }

  .toolbar-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .selected-chip {
    border-radius: 9999px;
    background: #eaf3ff;
    color: #0f6cbd;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.35rem 0.7rem;
  }

  .pick-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 0.75rem;
  }

  .student-pick {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 0.85rem;
    background: #f9fbff;
    text-align: left;
    padding: 0.75rem;
    transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
  }

  .student-pick:hover {
    transform: translateY(-1px);
    border-color: #0f6cbd;
  }

  .student-pick.selected {
    border-color: #4f46e5;
    box-shadow: 0 0 0 1px rgba(79, 70, 229, 0.25);
  }

  .student-row {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .student-copy {
    min-width: 0;
    flex: 1;
  }

  .pick-indicator {
    border-radius: 9999px;
    background: #eaf3ff;
    color: #0f6cbd;
    font-size: 0.68rem;
    font-weight: 700;
    padding: 0.2rem 0.5rem;
    white-space: nowrap;
  }

  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    color: white;
    font-size: 0.7rem;
    font-weight: 700;
    flex-shrink: 0;
    overflow: hidden;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .selected-preview {
    margin-top: 1rem;
    border: 1px solid var(--border);
    background: #f9fbff;
    border-radius: 0.75rem;
    padding: 0.75rem;
  }

  .selected-title {
    margin: 0 0 0.5rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.68rem;
    font-weight: 700;
  }

  .selected-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .selected-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    border-radius: 9999px;
    border: 1px solid #c7ddfb;
    background: #eaf3ff;
    color: #0f6cbd;
    padding: 0.28rem 0.65rem;
    font-size: 0.72rem;
    font-weight: 600;
  }

  .assigned-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .assigned-item {
    border: 1px solid var(--border);
    border-radius: 0.7rem;
    padding: 0.75rem;
    background: #f9fbff;
  }

  .assigned-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.45rem;
  }

  .progress-bar {
    height: 0.5rem;
    background: #e2edf9;
    border-radius: 9999px;
    overflow: hidden;
    margin: 0.5rem 0;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #0f6cbd, #0ea5e9);
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
    white-space: nowrap;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: linear-gradient(90deg, #0f6cbd, #0ea5e9);
    color: white;
    box-shadow: 0 4px 12px rgba(15, 108, 189, 0.3);
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(15, 108, 189, 0.4);
  }

  .btn-secondary {
    background: #edf4fb;
    border: 1px solid var(--border);
    color: var(--text-primary);
  }

  .btn-secondary:hover:not(:disabled) {
    background: #e0eef9;
  }

  .btn-xs {
    padding: 0.35rem 0.6rem;
    font-size: 0.72rem;
  }

  .btn-group {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .text-muted {
    color: var(--text-muted);
  }

  .font-semibold {
    font-weight: 600;
  }

  .text-sm {
    font-size: 0.875rem;
  }

  .text-xs {
    font-size: 0.75rem;
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

  .mt-1 {
    margin-top: 0.25rem;
  }

  .mt-2 {
    margin-top: 0.5rem;
  }

  :global(.dark) {
    --text-primary: #e5edf8;
    --text-secondary: #cfdceb;
    --text-muted: #9ba3af;
    --border: #2b3c57;
    --surface: #162338;
  }

  :global(.dark) .warning-alert {
    background: #fef3c7;
    border-color: #fcd34d;
    color: #92400e;
  }

  :global(.dark) .search-input,
  :global(.dark) .student-pick,
  :global(.dark) .assigned-item,
  :global(.dark) .selected-preview {
    background: #1a2c45;
  }

  :global(.dark) .btn-secondary {
    background: #1a2c45;
  }

  :global(.dark) .btn-secondary:hover:not(:disabled) {
    background: #223653;
  }

  :global(.dark) .selected-chip,
  :global(.dark) .pick-indicator {
    background: #223653;
    color: #cfe3ff;
  }

  :global(.dark) .selected-pill {
    background: #223653;
    color: #cfe3ff;
    border-color: #345172;
  }

  @media (max-width: 768px) {
    .card-header {
      flex-direction: column;
    }

    .btn-group {
      width: 100%;
    }

    .btn-group .btn {
      flex: 1;
      justify-content: center;
    }

    .toolbar-actions {
      width: 100%;
    }

    .toolbar-actions .btn {
      flex: 1;
      justify-content: center;
    }

    .search-wrap {
      min-width: 0;
      width: 100%;
    }

    .stats-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .assigned-head {
      flex-direction: column;
      gap: 0.35rem;
    }
  }

  @media (max-width: 540px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
