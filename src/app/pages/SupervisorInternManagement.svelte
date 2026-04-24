<script>
  import { onDestroy, onMount } from 'svelte';
  import {
    Check,
    Clock3,
    RefreshCw,
    Search,
    TrendingUp,
    UserRoundCheck,
    X,
    Loader2,
    Plus,
    Trash2
  } from 'lucide-svelte';
  import {
    assignStudentsToSupervisor,
    callApiAction,
    getCurrentUser,
    listStudentsForAssignment,
    listSupervisorAssignedStudents,
    saveInternSchedule,
    subscribeToCurrentUser,
  } from '../lib/auth.js';

  export let currentUser = null;

  let loading = true;
  let saving = false;
  let errorMessage = '';
  let successMessage = '';
  let availableStudents = [];
  let assignedStudents = [];
  let studentSearch = '';
  let unsubscribe;
  let showAddModal = false;
  let addModalSearch = '';
  let removingInternId = null;
  let selectedInternForSetup = null;
  let internDaysOff = [];
  let internShiftStart = '09:00';
  let internShiftEnd = '17:00';
  let bulkAssignMode = false;
  let bulkSelectedInterns = new Set();
  let bulkDaysOff = [];
  let bulkShiftStart = '09:00';
  let bulkShiftEnd = '17:00';
  let showEditEndDateModal = false;
  let editingInternId = null;
  let editingInternName = '';
  let editingEndDate = '';
  let savingEndDate = false;
  const HOURS_PER_WORKING_DAY = 8;

  function toNumber(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatHours(value) {
    const numeric = toNumber(value);
    const rounded = Math.round(numeric * 10) / 10;
    const normalized = rounded === 0 ? 0 : rounded;

    if (normalized === 0) return '0h';
    if (Math.abs(normalized) < 1) return `${normalized.toFixed(1)}h`;
    if (Number.isInteger(normalized)) return `${normalized}h`;
    return `${normalized.toFixed(1)}h`;
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

  function calculateDaysRemaining(requiredHours, completedHours) {
    const remainingHours = Math.max(0, toNumber(requiredHours) - toNumber(completedHours));
    return Math.ceil(remainingHours / HOURS_PER_WORKING_DAY);
  }

  function formatDaysRemaining(days) {
    if (days <= 0) return '0 days left';
    if (days === 1) return '1 day left';
    return `${days} days left`;
  }

  function getDaysStatus(days) {
    if (days <= 0) return 'success';
    if (days <= 7) return 'warning';
    return 'info';
  }

  function syncSelectedFromFetched(students, assigned) {
    // No longer needed - removed
  }

  async function loadData() {
    const supervisorId = String(currentUser?.user_id || '').trim();
    const roleNow = String(currentUser?.role || '').trim().toLowerCase();

    if (!supervisorId || roleNow !== 'supervisor') {
      availableStudents = [];
      assignedStudents = [];
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
    } catch (err) {
      errorMessage = err?.message || 'Unable to load interns.';
    } finally {
      loading = false;
    }
  }

  async function handleAddIntern(studentId) {
    if (!studentId) return;
    const supervisorId = String(currentUser?.user_id || '').trim();
    const roleNow = String(currentUser?.role || '').trim().toLowerCase();

    if (!supervisorId || roleNow !== 'supervisor') {
      errorMessage = 'Only supervisor accounts can add interns.';
      return;
    }

    // Open setup modal for this intern
    selectedInternForSetup = studentId;
    internDaysOff = [];
    internShiftStart = '09:00';
    internShiftEnd = '17:00';
  }

  function toggleDayOff(dayIndex) {
    if (internDaysOff.includes(dayIndex)) {
      internDaysOff = internDaysOff.filter((d) => d !== dayIndex);
    } else {
      internDaysOff = [...internDaysOff, dayIndex];
    }
  }

  async function confirmAddIntern() {
    if (!selectedInternForSetup) return;

    const supervisorId = String(currentUser?.user_id || '').trim();
    const currentAssignedIds = assignedStudents.map((s) => String(s.user_id || '').trim());
    const newIds = Array.from(new Set([...currentAssignedIds, String(selectedInternForSetup || '').trim()]));

    saving = true;
    errorMessage = '';
    successMessage = '';

    try {
      await assignStudentsToSupervisor(supervisorId, newIds);
      
      // Save the schedule (days off and shift times)
      await saveInternSchedule(
        supervisorId,
        selectedInternForSetup,
        internDaysOff,
        internShiftStart,
        internShiftEnd
      );

      successMessage = 'Intern added successfully with schedule configured.';
      showAddModal = false;
      selectedInternForSetup = null;
      addModalSearch = '';
      await loadData();
    } catch (err) {
      errorMessage = err?.message || 'Unable to add intern.';
    } finally {
      saving = false;
    }
  }

  function cancelSetup() {
    selectedInternForSetup = null;
    internDaysOff = [];
    internShiftStart = '09:00';
    internShiftEnd = '17:00';
  }

  function openEditEndDateModal(student) {
    editingInternId = student.user_id;
    editingInternName = student.full_name;
    editingEndDate = student.estimated_end_date || '';
    showEditEndDateModal = true;
  }

  function closeEditEndDateModal() {
    showEditEndDateModal = false;
    editingInternId = null;
    editingInternName = '';
    editingEndDate = '';
  }

  async function saveEstimatedEndDate() {
    if (!editingInternId || !editingEndDate) {
      errorMessage = 'Please select a valid date.';
      return;
    }

    savingEndDate = true;
    errorMessage = '';
    successMessage = '';

    try {
      const result = await callApiAction('update_student_ojt_profile', {
        user_id: editingInternId,
        estimated_end_date: editingEndDate,
      });

      if (result && result.ok) {
        successMessage = `Updated OJT end date for ${editingInternName}`;
        await loadData();
        closeEditEndDateModal();
      } else {
        errorMessage = result?.error || 'Failed to update end date.';
      }
    } catch (err) {
      errorMessage = err?.message || 'Unable to save end date.';
      console.error('Save end date error:', err);
    } finally {
      savingEndDate = false;
    }
  }

  function toggleBulkInternSelection(studentId) {
    if (bulkSelectedInterns.has(studentId)) {
      bulkSelectedInterns.delete(studentId);
    } else {
      bulkSelectedInterns.add(studentId);
    }
    bulkSelectedInterns = bulkSelectedInterns;
  }

  function toggleBulkDayOff(dayIndex) {
    if (bulkDaysOff.includes(dayIndex)) {
      bulkDaysOff = bulkDaysOff.filter((d) => d !== dayIndex);
    } else {
      bulkDaysOff = [...bulkDaysOff, dayIndex];
    }
  }

  async function confirmBulkAssign() {
    if (bulkSelectedInterns.size === 0) {
      errorMessage = 'Please select at least one intern.';
      return;
    }

    const supervisorId = String(currentUser?.user_id || '').trim();
    const currentAssignedIds = assignedStudents.map((s) => String(s.user_id || '').trim());
    const newInternIds = Array.from(bulkSelectedInterns).map((id) => String(id || '').trim());
    const newIds = Array.from(new Set([...currentAssignedIds, ...newInternIds]));

    saving = true;
    errorMessage = '';
    successMessage = '';

    try {
      // Assign all students first
      await assignStudentsToSupervisor(supervisorId, newIds);

      // Save schedules for each selected intern
      for (const internId of newInternIds) {
        await saveInternSchedule(
          supervisorId,
          internId,
          bulkDaysOff,
          bulkShiftStart,
          bulkShiftEnd
        );
      }

      successMessage = `${bulkSelectedInterns.size} interns added successfully with schedule configured.`;
      bulkAssignMode = false;
      bulkSelectedInterns = new Set();
      bulkDaysOff = [];
      bulkShiftStart = '09:00';
      bulkShiftEnd = '17:00';
      addModalSearch = '';
      showAddModal = false;
      await loadData();
    } catch (err) {
      errorMessage = err?.message || 'Unable to add interns.';
    } finally {
      saving = false;
    }
  }

  function cancelBulkAssign() {
    bulkAssignMode = false;
    bulkSelectedInterns = new Set();
    bulkDaysOff = [];
    bulkShiftStart = '09:00';
    bulkShiftEnd = '17:00';
  }

  async function handleRemoveIntern(internId) {
    const supervisorId = String(currentUser?.user_id || '').trim();
    const roleNow = String(currentUser?.role || '').trim().toLowerCase();

    if (!supervisorId || roleNow !== 'supervisor') {
      errorMessage = 'Only supervisor accounts can remove interns.';
      return;
    }

    removingInternId = internId;
    errorMessage = '';
    successMessage = '';

    try {
      // Remove from the list and save
      const newIds = assignedStudents
        .filter((s) => String(s.user_id || '') !== String(internId || ''))
        .map((s) => String(s.user_id || '').trim());

      await assignStudentsToSupervisor(supervisorId, newIds);
      successMessage = 'Intern removed successfully.';
      await loadData();
    } catch (err) {
      errorMessage = err?.message || 'Unable to remove intern.';
    } finally {
      removingInternId = null;
    }
  }

  function toggleStudentSelection(studentId) {
    // No longer needed - removed
  }

  function selectAllShown() {
    // No longer needed - removed
  }

  function clearSelection() {
    // No longer needed - removed
  }

  function removeSelectedStudent(studentId) {
    // No longer needed - removed
  }

  async function handleSaveAssignments() {
    // No longer needed - removed
  }

  let refreshTimer = null;

  onMount(() => {
    currentUser = currentUser || getCurrentUser();

    unsubscribe = subscribeToCurrentUser((user) => {
      currentUser = user;
      loadData();
    });

    loadData();

    // Refresh days remaining every minute so it's always up-to-date
    refreshTimer = setInterval(() => {
      assignedStudents = assignedStudents; // Trigger reactivity
    }, 60000); // Update every 60 seconds
  });

  onDestroy(() => {
    if (typeof unsubscribe === 'function') unsubscribe();
    if (refreshTimer) clearInterval(refreshTimer);
  });

  $: currentRole = String(currentUser?.role || '').trim().toLowerCase();
  $: isSupervisorUser = currentRole === 'supervisor';
  $: normalizedAddSearch = String(addModalSearch || '').trim().toLowerCase();
  $: assignedIds = new Set(assignedStudents.map((s) => String(s.user_id || '').trim()));
  $: availableToAdd = availableStudents.filter((student) => !assignedIds.has(String(student.user_id || '').trim()));
  $: filteredAvailable = availableToAdd.filter((student) => {
    if (!normalizedAddSearch) return true;
    const haystack = [
      String(student?.full_name || ''),
      String(student?.email || ''),
      String(student?.department || ''),
      String(student?.company || ''),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedAddSearch);
  });
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
        <div class="stat-icon"><UserRoundCheck size={18} /></div>
        <p class="stat-value">{totalAssigned}</p>
        <p class="stat-label">Assigned Interns</p>
      </div>

      <div class="stat-card stat-success">
        <div class="stat-icon"><Check size={18} /></div>
        <p class="stat-value" title={String(totalCompletedHours)}>{formatHours(totalCompletedHours)}</p>
        <p class="stat-label">Completed Hours</p>
      </div>

      <div class="stat-card stat-violet">
        <div class="stat-icon"><TrendingUp size={18} /></div>
        <p class="stat-value">{averageProgress}%</p>
        <p class="stat-label">Average Progress</p>
      </div>

      <div class="stat-card stat-cyan">
        <div class="stat-icon"><Clock3 size={18} /></div>
        <p class="stat-value" title={String(totalRequiredHours)}>{formatHours(totalRequiredHours)}</p>
        <p class="stat-label">Required Hours</p>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Assigned Interns</h3>
          <p class="text-muted text-sm">Add or remove interns from your assigned list.</p>
        </div>

        <div class="btn-group">
          <button class="btn btn-secondary" type="button" on:click={loadData} disabled={loading || saving}>
            <RefreshCw size={15} />Refresh
          </button>
          <button class="btn btn-primary" type="button" on:click={() => { bulkSelectedInterns = new Set(); bulkDaysOff = []; bulkShiftStart = '09:00'; bulkShiftEnd = '17:00'; showAddModal = true; bulkAssignMode = true; }} disabled={loading || saving} style="display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;">
            <Plus size={15} />
            <span>Add Interns</span>
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
        <p class="text-muted">Loading intern accounts...</p>
      {:else if assignedStudents.length === 0}
        <p class="text-muted">No interns assigned yet. Click "Add Interns" to get started.</p>
      {:else}
        <div class="assigned-grid">
          {#each assignedStudents as student (student.user_id)}
            {@const required = toNumber(student.required_hours)}
            {@const completed = toNumber(student.completed_hours)}
            {@const progress = toPercent(completed, required)}
            {@const daysLeft = calculateDaysRemaining(required, completed)}
            {@const daysStatus = getDaysStatus(daysLeft)}
            <article class="assigned-card">
              <div class="card-header-row">
                <div class="assigned-info">
                  <div class="assigned-avatar">
                    {#if student.profile_photo_url}
                      <img src={student.profile_photo_url} alt={`${student.full_name} avatar`} />
                    {:else}
                      {getInitials(student.full_name)}
                    {/if}
                  </div>
                  <div class="info-text">
                    <p class="font-semibold">{student.full_name}</p>
                    <p class="text-xs text-muted">{normalizeDepartment(student.department) || '-'}</p>
                  </div>
                </div>
                <button 
                  class="btn-remove" 
                  type="button" 
                  on:click={() => handleRemoveIntern(student.user_id)}
                  disabled={removingInternId === student.user_id}
                  title="Remove this intern"
                >
                  {#if removingInternId === student.user_id}
                    <Loader2 size={16} />
                  {:else}
                    <Trash2 size={16} />
                  {/if}
                </button>
              </div>

              <div class="card-body">
                <div class="hours-row">
                  <div class="hours-stat">
                    <p class="label">Completed</p>
                    <p class="value" title={String(completed)}>{formatHours(completed)}</p>
                  </div>
                  <div class="hours-stat">
                    <p class="label">Required</p>
                    <p class="value" title={String(required)}>{formatHours(required)}</p>
                  </div>
                  <div class="hours-stat">
                    <p class="label">Progress</p>
                    <p class="value">{progress}%</p>
                  </div>
                </div>
                <div class="progress-bar"><div class="progress-fill" style={`width:${progress}%`}></div></div>
                
                <div
                  class="days-remaining-display"
                  class:status-warning={daysStatus === 'warning'}
                  class:status-success={daysStatus === 'success'}
                  class:status-info={daysStatus === 'info'}
                >
                  <span class="days-label">OJT Ends In:</span>
                  <span class="days-value">{formatDaysRemaining(daysLeft)}</span>
                  <button
                    type="button"
                    class="edit-date-btn"
                    on:click={() => openEditEndDateModal(student)}
                    title="Edit OJT end date"
                    aria-label="Edit OJT end date"
                  >
                    ✎
                  </button>
                </div>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Add Intern Modal -->
    {#if showAddModal}
      <div class="modal-overlay" role="presentation" on:click={() => (showAddModal = false)}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="modal-content" role="dialog" aria-modal="true" aria-label="Assign Interns" tabindex="-1" on:click|stopPropagation>
          <div class="modal-header">
            <h2>Assign Interns</h2>
            <button class="modal-close" type="button" on:click={() => (showAddModal = false)} aria-label="Close dialog">
              <X size={20} />
            </button>
          </div>

          <div class="modal-body">
            {#if bulkAssignMode}
              <!-- Bulk assign mode -->
              <div class="bulk-header">
                <span class="bulk-count">{bulkSelectedInterns.size} selected</span>
              </div>

              <label class="search-wrap">
                <span class="search-icon"><Search size={14} /></span>
                <input
                  bind:value={addModalSearch}
                  type="text"
                  class="search-input"
                  placeholder="Search interns by name, email, department, or company"
                />
              </label>

              {#if loading}
                <p class="text-muted">Loading...</p>
              {:else if filteredAvailable.length === 0}
                <p class="text-muted">
                  {availableToAdd.length === 0 ? 'All interns are already assigned.' : 'No interns match your search.'}
                </p>
              {:else}
                <div class="intern-list-modal">
                  {#each filteredAvailable as student (student.user_id)}
                    {@const isSelected = bulkSelectedInterns.has(student.user_id)}
                    <button
                      type="button"
                      class="intern-option bulk-option"
                      class:bulk-selected={isSelected}
                      on:click={() => toggleBulkInternSelection(student.user_id)}
                      disabled={saving}
                    >
                      <div class="bulk-checkbox">
                        {#if isSelected}
                          <Check size={16} />
                        {/if}
                      </div>
                      <div class="avatar">
                        {#if student.profile_photo_url}
                          <img src={student.profile_photo_url} alt={`${student.full_name} avatar`} />
                        {:else}
                          {getInitials(student.full_name)}
                        {/if}
                      </div>
                      <div class="intern-option-info">
                        <p class="font-semibold text-sm">{student.full_name}</p>
                        <p class="text-xs text-muted">{student.email}</p>
                        <p class="text-xs text-muted">{student.company || '-'} • {normalizeDepartment(student.department) || '-'}</p>
                      </div>
                    </button>
                  {/each}
                </div>
              {/if}

              <div class="setup-section" style="margin-top: 1.5rem;">
                <div class="setup-label">Days Off</div>
                <p class="setup-sublabel">Select which days these interns typically have off</p>
                <div class="days-checkbox-list">
                  {#each ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as day, index}
                    <label class="day-checkbox">
                      <input
                        type="checkbox"
                        checked={bulkDaysOff.includes(index)}
                        on:change={() => toggleBulkDayOff(index)}
                      />
                      <span>{day}</span>
                    </label>
                  {/each}
                </div>
              </div>

              <div class="setup-section">
                <div class="setup-label">Shift Time</div>
                <p class="setup-sublabel">Set the regular work hours for these interns</p>
                <div class="shift-grid">
                  <div class="time-input-group">
                    <label for="bulk-shift-start">Start Time</label>
                    <input 
                      id="bulk-shift-start"
                      type="time" 
                      bind:value={bulkShiftStart}
                      class="time-input"
                    />
                  </div>
                  <div class="time-input-group">
                    <label for="bulk-shift-end">End Time</label>
                    <input 
                      id="bulk-shift-end"
                      type="time" 
                      bind:value={bulkShiftEnd}
                      class="time-input"
                    />
                  </div>
                </div>
              </div>

              <div class="setup-actions">
                <button 
                  class="btn btn-secondary" 
                  type="button" 
                  on:click={cancelBulkAssign}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button 
                  class="btn btn-primary" 
                  type="button" 
                  on:click={confirmBulkAssign}
                  disabled={saving || bulkSelectedInterns.size === 0}
                  style="display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;"
                >
                  {#if saving}
                    <span class="spinning-icon"><Loader2 size={15} /></span>
                  {/if}
                  <span>{saving ? 'Assigning...' : `Assign ${bulkSelectedInterns.size} Interns`}</span>
                </button>
              </div>
            {:else if selectedInternForSetup}
              <!-- Setup form for selected intern -->
              {@const selectedStudent = availableToAdd.find((s) => String(s.user_id) === String(selectedInternForSetup))}
              <div class="setup-header">
                <button 
                  class="setup-back-btn" 
                  type="button" 
                  on:click={cancelSetup}
                  aria-label="Back to intern list"
                >
                  ← Back
                </button>
                <h3>{selectedStudent?.full_name}</h3>
              </div>

              <div class="setup-section">
                <div class="setup-label">Days Off</div>
                <p class="setup-sublabel">Select which days this intern typically has off</p>
                <div class="days-checkbox-list">
                  {#each ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as day, index}
                    <label class="day-checkbox">
                      <input
                        type="checkbox"
                        checked={internDaysOff.includes(index)}
                        on:change={() => toggleDayOff(index)}
                      />
                      <span>{day}</span>
                    </label>
                  {/each}
                </div>
              </div>

              <div class="setup-section">
                <div class="setup-label">Shift Time</div>
                <p class="setup-sublabel">Set the regular work hours for this intern</p>
                <div class="shift-grid">
                  <div class="time-input-group">
                    <label for="shift-start">Start Time</label>
                    <input 
                      id="shift-start"
                      type="time" 
                      bind:value={internShiftStart}
                      class="time-input"
                    />
                  </div>
                  <div class="time-input-group">
                    <label for="shift-end">End Time</label>
                    <input 
                      id="shift-end"
                      type="time" 
                      bind:value={internShiftEnd}
                      class="time-input"
                    />
                  </div>
                </div>
              </div>

              <div class="setup-actions">
                <button 
                  class="btn btn-secondary" 
                  type="button" 
                  on:click={cancelSetup}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button 
                  class="btn btn-primary" 
                  type="button" 
                  on:click={confirmAddIntern}
                  disabled={saving}
                  style="display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;"
                >
                  {#if saving}
                    <span class="spinning-icon"><Loader2 size={15} /></span>
                  {/if}
                  <span>{saving ? 'Adding...' : 'Add Intern'}</span>
                </button>
              </div>
            {:else}
              <!-- List of available interns -->
              <label class="search-wrap">
                <span class="search-icon"><Search size={14} /></span>
                <input
                  bind:value={addModalSearch}
                  type="text"
                  class="search-input"
                  placeholder="Search interns by name, email, department, or company"
                />
              </label>

              {#if loading}
                <p class="text-muted">Loading...</p>
              {:else if filteredAvailable.length === 0}
                <p class="text-muted">
                  {availableToAdd.length === 0 ? 'All interns are already assigned.' : 'No interns match your search.'}
                </p>
              {:else}
                <div class="intern-list-modal">
                  {#each filteredAvailable as student (student.user_id)}
                    <button
                      type="button"
                      class="intern-option"
                      on:click={() => handleAddIntern(student.user_id)}
                      disabled={saving || selectedInternForSetup}
                    >
                      <div class="avatar">
                        {#if student.profile_photo_url}
                          <img src={student.profile_photo_url} alt={`${student.full_name} avatar`} />
                        {:else}
                          {getInitials(student.full_name)}
                        {/if}
                      </div>
                      <div class="intern-option-info">
                        <p class="font-semibold text-sm">{student.full_name}</p>
                        <p class="text-xs text-muted">{student.email}</p>
                        <p class="text-xs text-muted">{student.company || '-'} • {normalizeDepartment(student.department) || '-'}</p>
                      </div>
                      <span class="add-indicator">Select</span>
                    </button>
                  {/each}
                </div>
              {/if}
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <!-- Edit OJT End Date Modal -->
    {#if showEditEndDateModal}
      <div class="modal-overlay" role="presentation" on:click={closeEditEndDateModal}>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div class="modal-content" role="dialog" aria-modal="true" tabindex="-1" on:click|stopPropagation>
          <div class="modal-header">
            <h2>Edit OJT End Date</h2>
            <button
              class="modal-close"
              type="button"
              on:click={closeEditEndDateModal}
              aria-label="Close dialog"
            >
              <X size={20} />
            </button>
          </div>

          <div class="modal-body">
            <p class="text-muted" style="margin-bottom: 1rem;">
              Update the OJT end date for <strong>{editingInternName}</strong>
            </p>
            <div class="form-group">
              <label for="end-date-input" class="form-label">OJT End Date</label>
              <input
                id="end-date-input"
                type="date"
                bind:value={editingEndDate}
                class="form-input"
              />
            </div>
          </div>

          <div class="modal-footer">
            <button
              type="button"
              class="btn-cancel"
              on:click={closeEditEndDateModal}
              disabled={savingEndDate}
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn-save"
              on:click={saveEstimatedEndDate}
              disabled={savingEndDate || !editingEndDate}
            >
              {#if savingEndDate}
                <Loader2 size={16} style="animation: spin 1s linear infinite;" />
                Saving...
              {:else}
                Save End Date
              {/if}
            </button>
          </div>
        </div>
      </div>
    {/if}
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
    position: relative;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 1rem;
    padding: 1.25rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    overflow: hidden;
    transition: transform 0.18s ease, box-shadow 0.18s ease;
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
    border-radius: 0.75rem;
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
    margin: 0.25rem 0 0.25rem;
    color: var(--text-primary);
    font-size: 1.7rem;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.01em;
  }

  .stat-label {
    margin: 0.15rem 0 0;
    color: var(--text-muted);
    font-size: 0.86rem;
    font-weight: 700;
  }

  .stat-card::before {
    content: '';
    position: absolute;
    left: 0; top: 0;
    width: 100%; height: 3px; opacity: 0.95;
  }

  .stat-blue::before { background: linear-gradient(90deg, #0f6cbd, #38bdf8); }
  .stat-success::before { background: linear-gradient(90deg, #0d9488, #10b981); }
  .stat-violet::before { background: linear-gradient(90deg, #7c3aed, #a78bfa); }
  .stat-cyan::before { background: linear-gradient(90deg, #0891b2, #22d3ee); }

  .stat-card:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(15,23,42,0.12); }

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

  .assigned-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1.25rem;
  }

  .assigned-card {
    border: 1px solid var(--border);
    border-radius: 1rem;
    padding: 1.25rem;
    background: var(--surface);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    transition: all 0.2s;
  }

  .assigned-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }

  .card-header-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .assigned-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
  }

  .info-text {
    min-width: 0;
  }

  .info-text p {
    margin: 0;
  }

  .info-text .font-semibold {
    font-size: 0.95rem;
    color: var(--text-primary);
  }

  .assigned-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    color: white;
    font-size: 0.8rem;
    font-weight: 700;
    flex-shrink: 0;
    overflow: hidden;
  }

  .assigned-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .hours-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }

  .hours-stat {
    text-align: center;
    padding: 0.6rem 0.5rem;
    border-radius: 0.5rem;
    background: #f3f4f6;
  }

  .hours-stat .label {
    margin: 0;
    font-size: 0.7rem;
    color: var(--text-muted);
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .hours-stat .value {
    margin: 0.3rem 0 0 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .btn-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 0.5rem;
    background: #fee2e2;

    color: #dc2626;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-remove:hover:not(:disabled) {
    background: #fecaca;
  }

  .btn-remove:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: var(--surface);
    border-radius: 1rem;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .modal-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }

  .modal-close:hover {
    background: #f3f4f6;
    color: var(--text-primary);
  }

  .modal-body {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
  }

  .intern-list-modal {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .intern-option {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: #f9fbff;
    border: 1px solid var(--border);
    border-radius: 0.65rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s;
    width: 100%;
  }

  .intern-option:hover:not(:disabled) {
    background: #eef2f7;
    border-color: #0f6cbd;
    transform: translateX(2px);
  }

  .intern-option:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .intern-option-info {
    flex: 1;
    min-width: 0;
  }

  .intern-option-info p {
    margin: 0;
  }

  .add-indicator {
    border-radius: 9999px;
    background: #eaf3ff;
    color: #0f6cbd;
    font-size: 0.68rem;
    font-weight: 700;
    padding: 0.2rem 0.5rem;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Setup form styles */
  .setup-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .setup-back-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: auto;
    padding: 0.4rem 0.6rem;
    border: none;
    background: transparent;
    color: #0f6cbd;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .setup-back-btn:hover {
    background: #eaf3ff;
    border-radius: 0.4rem;
  }

  .setup-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .setup-section {
    margin-bottom: 1.5rem;
  }

  .setup-label {
    display: block;
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }

  .setup-sublabel {
    display: block;
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-bottom: 0.75rem;
    margin-top: 0;
  }

  .days-checkbox-list {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .day-checkbox {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    cursor: pointer;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    transition: all 0.2s;
    user-select: none;
  }

  .day-checkbox:hover {
    background: #eaf3ff;
  }

  .day-checkbox input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: #0f6cbd;
  }

  .day-checkbox span {
    font-size: 0.875rem;
    color: var(--text-primary);
    font-weight: 500;
  }

  .shift-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .time-input-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .time-input-group label {
    font-weight: 600;
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .time-input {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    background: #f9fbff;
    color: var(--text-primary);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    outline: none;
  }

  .time-input:focus {
    border-color: #0f6cbd;
    box-shadow: 0 0 0 2px rgba(15, 108, 189, 0.16);
  }

  .setup-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .setup-actions .btn {
    flex: 1;
    justify-content: center;
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

  :global(.dark) .setup-section {
    border-color: #2b3c57;
  }

  :global(.dark) .setup-header {
    border-color: #2b3c57;
  }

  :global(.dark) .day-checkbox:hover {
    background: #223653;
  }

  :global(.dark) .day-checkbox span {
    color: #e5edf8;
  }

  :global(.dark) .time-input {
    background: #1a2c45;
    border-color: #2b3c57;
    color: #e5edf8;
  }

  :global(.dark) .time-input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.16);
  }

  :global(.dark) .setup-actions {
    border-color: #2b3c57;
  }

  :global(.dark) .modal-content {
    background: #162338;
  }

  :global(.dark) .modal-header {
    border-color: #2b3c57;
  }

  :global(.dark) .modal-close:hover {
    background: #223653;
  }

  :global(.dark) .intern-option {
    background: #1a2c45;
    border-color: #2b3c57;
  }

  :global(.dark) .intern-option:hover:not(:disabled) {
    background: #223653;
    border-color: #3b82f6;
  }

  :global(.dark) .btn-remove {
    background: #7f1d1d;
    color: #fca5a5;
  }

  :global(.dark) .btn-remove:hover:not(:disabled) {
    background: #991b1b;
  }

  :global(.dark) .days-remaining-display {
    background: #223653;
    border-color: #334b6b;
  }

  :global(.dark) .days-remaining-display.status-warning {
    background: rgba(245, 158, 11, 0.15);
    border-color: rgba(245, 158, 11, 0.3);
  }

  :global(.dark) .days-remaining-display.status-success {
    background: rgba(16, 185, 129, 0.15);
    border-color: rgba(16, 185, 129, 0.3);
  }

  :global(.dark) .days-remaining-display.status-info {
    background: rgba(99, 102, 241, 0.15);
    border-color: rgba(99, 102, 241, 0.3);
  }

  :global(.dark) .edit-date-btn {
    background: rgba(255, 255, 255, 0.1);
  }

  :global(.dark) .edit-date-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  :global(.dark) .days-label {
    color: #9ba3af;
  }

  :global(.dark) .days-value {
    color: #e5edf8;
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

  .days-remaining-display {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    border-radius: 0.5rem;
    margin-top: 0.75rem;
    background: #eaf3ff;
    border: 1px solid #bfdbfe;
    font-size: 0.875rem;
    font-weight: 500;
    gap: 0.5rem;
  }

  .days-remaining-display.status-warning {
    background: #fef3c7;
    border-color: #fcd34d;
  }

  .days-remaining-display.status-success {
    background: #d1fae5;
    border-color: #6ee7b7;
  }

  .days-remaining-display.status-info {
    background: #e0e7ff;
    border-color: #c7d2fe;
  }

  .edit-date-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    background: rgba(255, 255, 255, 0.5);
    border-radius: 0.3rem;
    color: inherit;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
    transition: all 0.2s;
    margin-left: auto;
    flex-shrink: 0;
  }

  .edit-date-btn:hover {
    background: rgba(255, 255, 255, 0.8);
    transform: scale(1.1);
  }

  .edit-date-btn:active {
    transform: scale(0.95);
  }

  .days-label {
    font-size: 0.7rem;
    color: var(--text-muted);
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .days-value {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--text-primary);
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

  .btn-cancel {
    background: #edf4fb;
    border: 1px solid var(--border);
    color: var(--text-primary);
    padding: 0.6rem 1.2rem;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .btn-cancel:hover:not(:disabled) {
    background: #e0eef9;
  }

  .btn-cancel:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-save {
    background: linear-gradient(90deg, #0f6cbd, #0ea5e9);
    color: white;
    border: none;
    padding: 0.6rem 1.2rem;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    box-shadow: 0 4px 12px rgba(15, 108, 189, 0.3);
  }

  .btn-save:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(15, 108, 189, 0.4);
  }

  .btn-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal-footer {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    padding: 1rem;
    border-top: 1px solid var(--border);
  }

  .form-label {
    display: block;
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--text-primary);
    margin-bottom: 0.5rem;
  }

  .form-input {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: var(--surface);
    color: var(--text-primary);
    font-family: inherit;
    font-size: 0.875rem;
    transition: all 0.2s;
  }

  .form-input:focus {
    outline: none;
    border-color: #0f6cbd;
    box-shadow: 0 0 0 2px rgba(15, 108, 189, 0.1);
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .text-muted {
    color: var(--text-muted);
  }

  .btn-group {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
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
  :global(.dark) .assigned-card {
    background: #1a2c45;
  }

  :global(.dark) .assigned-card {
    border-color: #2b3c57;
  }

  :global(.dark) .card-header-row {
    border-color: #2b3c57;
  }

  :global(.dark) .hours-stat {
    background: #223653;
  }

  :global(.dark) .hours-stat .label {
    color: #9ca3af;
  }

  :global(.dark) .hours-stat .value {
    color: #e5edf8;
  }

  :global(.dark) .info-text .font-semibold {
    color: #e5edf8;
  }

  :global(.dark) .btn-secondary {
    background: #1a2c45;
  }

  :global(.dark) .btn-secondary:hover:not(:disabled) {
    background: #223653;
  }

  /* Bulk assign mode styles */
  .bulk-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .bulk-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(90deg, #0f6cbd, #0ea5e9);
    color: white;
    padding: 0.35rem 0.75rem;
    border-radius: 9999px;
    font-weight: 700;
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .bulk-option {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .bulk-option.bulk-selected {
    background: #eaf3ff;
    border-color: #0f6cbd;
  }

  .bulk-checkbox {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    border: 2px solid var(--border);
    border-radius: 0.35rem;
    background: transparent;
    color: #0f6cbd;
    flex-shrink: 0;
    transition: all 0.2s;
  }

  .bulk-option.bulk-selected .bulk-checkbox {
    background: #0f6cbd;
    border-color: #0f6cbd;
    color: white;
  }

  :global(.dark) .bulk-option.bulk-selected {
    background: #223653;
    border-color: #3b82f6;
  }

  :global(.dark) .bulk-checkbox {
    border-color: #2b3c57;
  }

  :global(.dark) .bulk-option.bulk-selected .bulk-checkbox {
    background: #3b82f6;
    border-color: #3b82f6;
  }

  :global(.dark) .bulk-header {
    border-color: #2b3c57;
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

    .search-wrap {
      min-width: 0;
      width: 100%;
    }

    .stats-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .assigned-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 540px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }

    .assigned-grid {
      grid-template-columns: 1fr;
    }

    .hours-row {
      grid-template-columns: 1fr;
    }
  }
</style>
