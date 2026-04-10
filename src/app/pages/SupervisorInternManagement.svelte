<script>
  import { onDestroy, onMount } from 'svelte';
  import { Plus, RefreshCw, Users } from 'lucide-svelte';
  import { assignStudentsToSupervisor, listStudentsForAssignment, listSupervisorAssignedStudents, subscribeToCurrentUser } from '../../lib/auth.js';

  export let currentUser = null;

  let loading = true;
  let saving = false;
  let errorMessage = '';
  let successMessage = '';
  let availableStudents = [];
  let assignedStudents = [];
  let selectedStudentIds = [];
  let showAddInternModal = false;
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
    return value.split(' ').filter(Boolean).slice(0, 2).map(p => p.charAt(0).toUpperCase()).join('') || 'ST';
  }

  function normalizeDate(value) {
    const text = String(value || '').trim();
    if (!text) return '-';
    const parsed = new Date(`${text}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return text;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
  }

  async function loadData() {
    const supervisorId = String(currentUser?.user_id || '').trim();
    const roleNow = String(currentUser?.role || '').trim().toLowerCase();

    if (!supervisorId || roleNow !== 'supervisor') {
      availableStudents = [];
      assignedStudents = [];
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
    } catch (err) {
      errorMessage = err?.message || 'Unable to load interns.';
    } finally {
      loading = false;
    }
  }

  function handleAddInternClick() {
    showAddInternModal = true;
  }

  function closeAddInternModal() {
    showAddInternModal = false;
  }

  async function handleAddInternConfirm() {
    const checkboxes = document.querySelectorAll('.modal-checkboxes input[type="checkbox"]:checked');
    const studentIds = Array.from(checkboxes).map(cb => String(cb.value || ''));
    
    if (studentIds.length === 0) {
      errorMessage = 'Please select at least one intern to add.';
      return;
    }

    saving = true;
    errorMessage = '';
    successMessage = '';

    try {
      const supervisorId = String(currentUser?.user_id || '').trim();
      const newIds = [...selectedStudentIds, ...studentIds];
      const uniqueIds = Array.from(new Set(newIds));
      
      await assignStudentsToSupervisor(supervisorId, uniqueIds);
      successMessage = `${studentIds.length} intern(s) added successfully.`;
      selectedStudentIds = uniqueIds;
      closeAddInternModal();
      await loadData();
    } catch (err) {
      errorMessage = err?.message || 'Unable to add interns.';
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    unsubscribe = subscribeToCurrentUser(() => {
      loadData();
    });
    loadData();
  });

  onDestroy(() => {
    if (typeof unsubscribe === 'function') unsubscribe();
  });

  $: availableForAdd = availableStudents.filter(s => !selectedStudentIds.includes(String(s.user_id || '')));
</script>

<div class="content">
  <div class="card">
    <div class="card-header">
      <div>
        <h3 class="card-title">Manage Interns</h3>
        <p class="text-muted text-sm">View and add interns to your supervision.</p>
      </div>
      <div class="btn-group">
        <button class="btn btn-primary" on:click={handleAddInternClick} disabled={saving || availableForAdd.length === 0}>
          <Plus size={15} />Add Intern
        </button>
        <button class="btn btn-secondary" on:click={loadData} disabled={loading || saving}>
          <RefreshCw size={15} />Refresh
        </button>
      </div>
    </div>

    {#if errorMessage}
      <p class="alert alert-error">{errorMessage}</p>
    {/if}
    {#if successMessage}
      <p class="alert alert-success">{successMessage}</p>
    {/if}

    {#if loading}
      <p class="text-muted">Loading...</p>
    {:else if assignedStudents.length === 0}
      <p class="text-muted">No interns assigned. <button on:click={handleAddInternClick} class="link">Add one now</button></p>
    {:else}
      <div class="interns-grid">
        {#each assignedStudents as student (student.user_id)}
          {@const required = toNumber(student.required_hours)}
          {@const completed = toNumber(student.completed_hours)}
          {@const progress = toPercent(completed, required)}
          <div class="intern-card">
            <div class="card-header-sm">
              <div class="avatar">{#if student.profile_photo_url}<img src={student.profile_photo_url} alt={student.full_name} />{:else}{getInitials(student.full_name)}{/if}</div>
              <div class="flex-1">
                <p class="font-semibold text-sm truncate">{student.full_name}</p>
                <p class="text-xs text-muted truncate">{student.email}</p>
              </div>
            </div>
            <p class="text-xs text-muted mt-2">{student.department || '-'} • {student.company || '-'}</p>
            <p class="text-xs text-muted">ETA: {normalizeDate(student.estimated_end_date)}</p>
            <div class="progress-section">
              <div class="flex justify-between">
                <p class="text-xs font-semibold">Hours</p>
                <p class="text-xs font-semibold">{progress}%</p>
              </div>
              <div class="progress-bar"><div class="progress-fill" style={`width:${progress}%`}></div></div>
              <p class="text-xs text-muted">{completed}h / {required}h</p>
            </div>
            <button class="btn btn-secondary btn-full">View Profile</button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if showAddInternModal}
  <div class="modal-overlay" role="dialog" aria-modal="true">
    <div class="modal-box">
      <div class="modal-header">
        <h2 class="modal-title">Add Interns to Your Supervision</h2>
        <button type="button" class="modal-close" on:click={closeAddInternModal} aria-label="Close">
          ✕
        </button>
      </div>

      <div class="modal-body">
        {#if availableForAdd.length === 0}
          <p class="text-muted">All available students are already assigned to you.</p>
        {:else}
          <p class="text-muted text-sm mb-4">Select interns to add:</p>
          <div class="modal-checkboxes">
            {#each availableForAdd as student (student.user_id)}
              <label class="checkbox-label">
                <input type="checkbox" value={student.user_id} />
                <div>
                  <p class="font-semibold text-sm">{student.full_name}</p>
                  <p class="text-xs text-muted">{student.email}</p>
                  <p class="text-xs text-muted">{student.company || '-'} • {student.department || '-'}</p>
                </div>
              </label>
            {/each}
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" on:click={closeAddInternModal}>Cancel</button>
        <button type="button" class="btn btn-primary" on:click={handleAddInternConfirm} disabled={saving}>
          {saving ? 'Adding...' : 'Add Selected'}
        </button>
      </div>
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

  .card-header-sm {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    margin-bottom: 0.75rem;
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

  .interns-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }

  .intern-card {
    background: #f9fbff;
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1rem;
    transition: all 0.2s;
  }

  .intern-card:hover {
    border-color: #0f6cbd;
    box-shadow: 0 4px 12px rgba(15, 108, 189, 0.1);
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

  .progress-section {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
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

  .btn-full {
    width: 100%;
  }

  .btn-group {
    display: flex;
    gap: 0.5rem;
  }

  .link {
    background: none;
    border: none;
    color: #0f6cbd;
    cursor: pointer;
    text-decoration: underline;
    font-size: 0.875rem;
  }

  .flex-1 {
    flex: 1;
  }

  .flex {
    display: flex;
  }

  .justify-between {
    justify-content: space-between;
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

  .mt-2 {
    margin-top: 0.5rem;
  }

  .mb-4 {
    margin-bottom: 1rem;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: 1rem;
  }

  .modal-box {
    background: var(--surface);
    border-radius: 1rem;
    max-width: 500px;
    width: 100%;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .modal-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .modal-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 0;
    display: flex;
    font-size: 1.5rem;
    line-height: 1;
    transition: color 0.2s;
  }

  .modal-close:hover {
    color: var(--text-primary);
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  .modal-checkboxes {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .checkbox-label {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .checkbox-label:hover {
    background: #f9fbff;
  }

  .checkbox-label input {
    margin-top: 0.25rem;
    cursor: pointer;
  }

  .modal-footer {
    display: flex;
    gap: 1rem;
    padding: 1.5rem;
    border-top: 1px solid var(--border);
    justify-content: flex-end;
  }

  :global(.dark) {
    --text-primary: #e5edf8;
    --text-secondary: #cfdceb;
    --text-muted: #9ba3af;
    --border: #2b3c57;
    --surface: #162338;
  }

  :global(.dark) .intern-card {
    background: #1a2c45;
  }

  :global(.dark) .alert-error {
    background: rgba(127, 29, 29, 0.2);
    border-color: rgba(239, 68, 68, 0.3);
    color: #fecaca;
  }

  :global(.dark) .alert-success {
    background: rgba(6, 95, 70, 0.2);
    border-color: rgba(16, 185, 129, 0.3);
    color: #a7f3d0;
  }

  :global(.dark) .btn-secondary {
    background: #1a2c45;
  }

  :global(.dark) .btn-secondary:hover:not(:disabled) {
    background: #223653;
  }

  :global(.dark) .checkbox-label {
    background: #1a2c45;
  }

  :global(.dark) .checkbox-label:hover {
    background: #223653;
  }

  @media (max-width: 768px) {
    .interns-grid {
      grid-template-columns: 1fr;
    }

    .card-header {
      flex-direction: column;
    }

    .btn-group {
      width: 100%;
      flex-direction: column;
    }

    .btn {
      width: 100%;
      justify-content: center;
    }
  }
</style>
