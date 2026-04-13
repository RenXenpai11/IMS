<script>
  import { onDestroy, onMount } from 'svelte';
  import { Calendar, Clock3, FileText, ShieldCheck } from 'lucide-svelte';
  import { callApiAction, getCurrentUser, subscribeToCurrentUser } from '../lib/auth.js';
  import { subscribeToSync } from '../lib/sync.js';

  const REQUEST_TYPES = ['Absence', 'Overtime'];

  const STATUS_META = {
    Pending: {
      badgeClass: 'status-badge status-pending',
    },
    Approved: {
      badgeClass: 'status-badge status-approved',
    },
    Rejected: {
      badgeClass: 'status-badge status-rejected',
    },
  };

  let activeTab = 'my-requests';
  let currentUser = null;
  let unsubscribeAuth;
  let unsubscribeSync;
  let requests = [];
  let isLoading = false;
  let formError = '';
  let formSuccess = '';
  let isSubmitting = false;

  let form = {
    requestType: 'Absence',
    date: '',
    startTime: '',
    endTime: '',
    reason: '',
  };

  let minDate = '';
  
  $: showOvertimeFields = form.requestType === 'Overtime';
  $: overtimeHours = calculateOvertimeHours(form.startTime, form.endTime);
  $: isFormValid = (() => {
    // Force re-evaluation on form changes
    void form.requestType;
    void form.date;
    void form.startTime;
    void form.endTime;
    return checkFormValidityImmediate();
  })();

  function getTodayDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function checkFormValidityImmediate() {
    // Initialize minDate if not already set
    if (!minDate) {
      minDate = getTodayDate();
    }

    // Check if date is provided
    if (!form.date) {
      return false;
    }

    // Check if date is not in the past (compare as strings in YYYY-MM-DD format)
    if (form.date < minDate) {
      return false;
    }

    // Reason/notes is required for both absence and overtime
    if (!String(form.reason || '').trim()) {
      return false;
    }

    // Check if absence is on a weekend (day off)
    if (form.requestType === 'Absence') {
      const dateObj = new Date(form.date + 'T00:00:00');
      const dayOfWeek = dateObj.getDay(); // 0=Sunday, 6=Saturday
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return false; // Weekend, cannot file absence
      }
    }

    // Check overtime-specific validations
    if (form.requestType === 'Overtime') {
      if (!form.startTime || !form.endTime) {
        return false;
      }

      const [startHour, startMin] = String(form.startTime).split(':').map(Number);
      const [endHour, endMin] = String(form.endTime).split(':').map(Number);
      const startTotalMin = startHour * 60 + startMin;
      const endTotalMin = endHour * 60 + endMin;

      if (endTotalMin <= startTotalMin) {
        return false;
      }

      if (overtimeHours < 0.5) {
        return false;
      }
    }

    return true;
  }

  function calculateOvertimeHours(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    
    const [startHour, startMin] = String(startTime).split(':').map(Number);
    const [endHour, endMin] = String(endTime).split(':').map(Number);
    
    const startTotalMin = startHour * 60 + startMin;
    const endTotalMin = endHour * 60 + endMin;
    
    if (endTotalMin <= startTotalMin) return 0;
    
    const diffMin = endTotalMin - startTotalMin;
    return Math.round((diffMin / 60) * 10) / 10; // Round to 1 decimal place
  }

  async function callBackend(action, payload) {
    return callApiAction(action, payload || {});
  }

  async function loadRequests() {
    if (!currentUser) return;

    isLoading = true;
    try {
      const isSupervisor = String(currentUser?.role || '').trim() === 'Supervisor';
      let result;

      if (isSupervisor) {
        result = await callBackend('list_assigned_student_requests', {
          supervisor_user_id: currentUser.user_id,
        });
      } else {
        result = await callBackend('list_requests_by_user', {
          user_id: currentUser.user_id,
        });
      }

      if (result && result.ok) {
        requests = result.requests || [];
      }
    } catch (err) {
      console.error('Failed to load requests:', err);
      requests = [];
    } finally {
      isLoading = false;
    }
  }

  function formatDate(dateValue) {
    const dateString = String(dateValue || '').trim();
    if (!dateString) return '';

    // Extract just the date part if it's a full datetime string
    let dateToFormat = dateString;
    if (dateString.includes('T') || dateString.includes(' ')) {
      dateToFormat = dateString.split('T')[0].split(' ')[0];
    }

    const parsed = new Date(`${dateToFormat}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return dateValue;
    }

    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }).format(parsed);
  }

  function previewReason(text) {
    const value = String(text || '').trim();
    if (value.length <= 88) {
      return value;
    }
    return `${value.slice(0, 88)}...`;
  }

  function setTab(tab) {
    if (isSupervisor && tab === 'create-request') {
      return;
    }

    activeTab = tab;
    formError = '';
    formSuccess = '';
  }

  function validateForm() {
    // Use the same today date for validation
    const today = getTodayDate();

    if (!form.date) {
      return 'Date is required.';
    }

    if (form.date < today) {
      return 'Request date cannot be in the past. Please select today or a future date.';
    }

    if (!String(form.reason || '').trim()) {
      return 'Reason/Notes is required for both absence and overtime requests.';
    }

    if (form.requestType === 'Absence') {
      const dateObj = new Date(form.date + 'T00:00:00');
      const dayOfWeek = dateObj.getDay(); // 0=Sunday, 6=Saturday
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
      
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return `Absence cannot be requested on ${dayName}s (your day off). Please select a weekday (Monday-Friday).`;
      }
    }

    if (form.requestType === 'Overtime') {
      if (!form.startTime || !form.endTime) {
        return 'Start time and end time are required for overtime requests.';
      }

      const [startHour, startMin] = String(form.startTime).split(':').map(Number);
      const [endHour, endMin] = String(form.endTime).split(':').map(Number);
      const startTotalMin = startHour * 60 + startMin;
      const endTotalMin = endHour * 60 + endMin;

      if (endTotalMin <= startTotalMin) {
        return 'End time must be after start time.';
      }

      if (overtimeHours < 0.5) {
        return 'Overtime must be at least 30 minutes.';
      }
    }

    return '';
  }

  function resetForm() {
    form = {
      requestType: 'Absence',
      date: '',
      startTime: '',
      endTime: '',
      reason: '',
    };
  }

  async function submitRequest() {
    if (isSupervisor) {
      formError = 'Supervisor accounts cannot create requests.';
      formSuccess = '';
      return;
    }

    const errorMessage = validateForm();
    formError = errorMessage;
    formSuccess = '';

    if (errorMessage) {
      return;
    }

    isSubmitting = true;
    try {
      const result = await callBackend('create_request', {
        user_id: currentUser.user_id,
        requester_name: String(currentUser?.full_name || '').trim() || 'Student',
        request_type: form.requestType,
        request_date: form.date,
        start_time: form.requestType === 'Overtime' ? form.startTime : '',
        end_time: form.requestType === 'Overtime' ? form.endTime : '',
        total_hours: form.requestType === 'Overtime' ? overtimeHours : 0,
        reason: String(form.reason || '').trim(),
      });

      if (result && result.ok) {
        formSuccess = 'Request submitted successfully!';
        formError = '';
        resetForm();
        await loadRequests();
        activeTab = 'my-requests';
      } else {
        formError = result?.error || 'Failed to submit request.';
        formSuccess = '';
      }
    } catch (err) {
      console.error('Submit request error:', err);
      formError = err?.message || 'An error occurred while submitting the request.';
      formSuccess = '';
    } finally {
      isSubmitting = false;
    }
  }

  async function updateRequestStatus(requestId, nextStatus) {
    try {
      const result = await callBackend('update_request_status', {
        request_id: requestId,
        status: nextStatus,
      });

      if (result && result.ok) {
        await loadRequests();
      } else {
        console.error('Failed to update request status:', result?.error);
      }
    } catch (err) {
      console.error('Update request status error:', err);
    }
  }

  onMount(() => {
    // Initialize minDate
    minDate = getTodayDate();
    
    currentUser = getCurrentUser();
    unsubscribeAuth = subscribeToCurrentUser((user) => {
      currentUser = user;
      if (user) {
        loadRequests();
      }
    });

    unsubscribeSync = subscribeToSync(() => {
      loadRequests();
    });

    if (currentUser) {
      loadRequests();
    }
  });

  onDestroy(() => {
    if (typeof unsubscribeAuth === 'function') {
      unsubscribeAuth();
    }
    if (typeof unsubscribeSync === 'function') {
      unsubscribeSync();
    }
  });

  $: isSupervisor = String(currentUser?.role || '').trim() === 'Supervisor';
  $: if (isSupervisor && activeTab === 'create-request') {
    activeTab = 'my-requests';
  }
  $: listTabLabel = isSupervisor ? 'Student Requests' : 'My Requests';
  $: pageSubtitle = isSupervisor
    ? 'Review and resolve assigned student requests'
    : 'Manage your absence and overtime requests';
  $: totalRequests = requests.length;
  $: pendingRequests = requests.filter((request) => String(request?.status || '').toLowerCase() === 'pending').length;
  $: resolvedRequests = requests.filter((request) => {
    const status = String(request?.status || '').toLowerCase();
    return status === 'approved' || status === 'rejected';
  }).length;
</script>

<section class="requests-shell flex flex-col gap-6">
  <section class="requests-header-card rounded-2xl border p-6 shadow-md">
    <div class="inline-flex h-11 w-11 items-center justify-center rounded-xl requests-header-icon">
      <FileText size={18} />
    </div>
    <h2 class="requests-heading mt-4 text-2xl font-bold tracking-tight">Requests</h2>
    <p class="requests-subtitle mt-1 text-sm">{pageSubtitle}</p>
  </section>

  <section class="requests-panel rounded-2xl border p-5 shadow-md">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-end">
      <div class="inline-flex w-full rounded-xl border tab-switch lg:w-auto">
        <button
          type="button"
          class="tab-button"
          class:tab-button-active={activeTab === 'my-requests'}
          on:click={() => setTab('my-requests')}
        >
          {listTabLabel}
        </button>
        {#if !isSupervisor}
          <button
            type="button"
            class="tab-button"
            class:tab-button-active={activeTab === 'create-request'}
            on:click={() => setTab('create-request')}
          >
            Create Request
          </button>
        {/if}
      </div>
    </div>
  </section>

  <section class="requests-kpi-grid grid grid-cols-1 gap-4 md:grid-cols-3">
    <article class="request-kpi request-kpi-total rounded-2xl border p-5 shadow-sm">
      <div class="request-kpi-icon inline-flex h-10 w-10 items-center justify-center rounded-xl">
        <FileText size={16} />
      </div>
      <p class="requests-heading mt-4 text-3xl font-bold tracking-tight">{totalRequests}</p>
      <p class="requests-subtitle mt-1 text-sm font-medium">Total Requests</p>
    </article>

    <article class="request-kpi request-kpi-pending rounded-2xl border p-5 shadow-sm">
      <div class="request-kpi-icon inline-flex h-10 w-10 items-center justify-center rounded-xl">
        <Clock3 size={16} />
      </div>
      <p class="requests-heading mt-4 text-3xl font-bold tracking-tight">{pendingRequests}</p>
      <p class="requests-subtitle mt-1 text-sm font-medium">Pending Review</p>
    </article>

    <article class="request-kpi request-kpi-resolved rounded-2xl border p-5 shadow-sm">
      <div class="request-kpi-icon inline-flex h-10 w-10 items-center justify-center rounded-xl">
        <ShieldCheck size={16} />
      </div>
      <p class="requests-heading mt-4 text-3xl font-bold tracking-tight">{resolvedRequests}</p>
      <p class="requests-subtitle mt-1 text-sm font-medium">Resolved</p>
    </article>
  </section>

  {#if formSuccess}
    <p class="alert-success rounded-xl border px-4 py-3 text-sm font-medium">{formSuccess}</p>
  {/if}

  {#if activeTab === 'create-request' && !isSupervisor}
    <section class="requests-panel request-form-panel rounded-2xl border p-6 shadow-md">
      <h3 class="requests-heading text-base font-semibold">Create Request</h3>
      <p class="requests-subtitle mt-1 text-sm">Fill out the request details before submission.</p>

      <div class="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <label class="flex flex-col gap-1.5">
          <span class="requests-label text-sm font-medium">Request Type</span>
          <select bind:value={form.requestType} class="requests-input w-full rounded-xl border px-4 py-3 outline-none">
            {#each REQUEST_TYPES as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="requests-label text-sm font-medium">Date</span>
          <input bind:value={form.date} type="date" min={minDate} class="requests-input w-full rounded-xl border px-4 py-3 outline-none" />
        </label>

        {#if showOvertimeFields}
          <label class="flex flex-col gap-1.5">
            <span class="requests-label text-sm font-medium">Start Time</span>
            <input bind:value={form.startTime} type="time" class="requests-input w-full rounded-xl border px-4 py-3 outline-none" />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="requests-label text-sm font-medium">End Time</span>
            <input bind:value={form.endTime} type="time" class="requests-input w-full rounded-xl border px-4 py-3 outline-none" />
          </label>

          {#if form.startTime && form.endTime && overtimeHours > 0}
            <div class="flex flex-col gap-1.5 lg:col-span-2 rounded-lg bg-blue-50 border border-blue-200 p-3">
              <span class="requests-label text-sm font-medium">Total Overtime Hours</span>
              <div class="text-lg font-bold text-blue-900">{overtimeHours} hour{overtimeHours !== 1 ? 's' : ''}</div>
            </div>
          {/if}
        {/if}
      </div>

      <label class="mt-4 flex flex-col gap-1.5">
        <span class="requests-label text-sm font-medium">Reason / Notes</span>
        <textarea
          bind:value={form.reason}
          rows="5"
          class="requests-input w-full rounded-xl border px-4 py-3 outline-none"
          placeholder="Provide the context for this request..."
        ></textarea>
      </label>

      {#if formError}
        <p class="alert-error mt-4 rounded-xl border px-4 py-3 text-sm font-medium">{formError}</p>
      {/if}

      <div class="mt-5 flex justify-end">
        <button 
          type="button" 
          class="submit-button rounded-xl px-5 py-2.5 text-sm font-semibold" 
          on:click={submitRequest}
          disabled={isSubmitting || !isFormValid}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Request'}
        </button>
      </div>
    </section>
  {:else}
    <section class="flex flex-col gap-4">
      {#if isLoading}
        <p class="requests-empty-state requests-subtitle text-center py-8">Loading requests...</p>
      {:else if requests.length === 0}
        <p class="requests-empty-state requests-subtitle text-center py-8">No requests yet.</p>
      {:else}
        {#each requests as request (request.id)}
          {@const statusMeta = STATUS_META[request.status] ?? STATUS_META.Pending}
          {@const statusTone = String(request.status || 'Pending').toLowerCase()}
          <article class={`requests-panel request-card request-card-${statusTone} rounded-2xl border p-5 shadow-md`}>
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="flex items-start gap-3">
                <div class="inline-flex h-10 w-10 items-center justify-center rounded-lg request-type-icon">
                  {#if request.requestType === 'Overtime'}
                    <Clock3 size={16} />
                  {:else}
                    <Calendar size={16} />
                  {/if}
                </div>
                <div class="request-copy">
                  <div class="flex flex-wrap items-center gap-2">
                    <h4 class="requests-heading text-base font-semibold">{request.requestType}</h4>
                    <span class={statusMeta.badgeClass}>{request.status}</span>
                  </div>
                  <div class="request-meta mt-2 flex flex-wrap items-center gap-2">
                    <span class="meta-pill">Date: {formatDate(request.date)}</span>
                    {#if request.requestType === 'Overtime'}
                      {#if request.start_time}
                        <span class="meta-pill">Start: {request.start_time}</span>
                      {/if}
                      {#if request.end_time}
                        <span class="meta-pill">End: {request.end_time}</span>
                      {/if}
                      {#if request.total_hours}
                        <span class="meta-pill">Hours: {request.total_hours}h</span>
                      {/if}
                    {/if}
                    {#if isSupervisor}
                      <span class="meta-pill">Student: {request.requester_name || 'Unknown'}</span>
                    {/if}
                  </div>
                </div>
              </div>

              {#if isSupervisor && request.status === 'Pending'}
                <div class="inline-flex items-center gap-2">
                  <button
                    type="button"
                    class="action-button action-approve rounded-lg px-3 py-2 text-xs font-semibold"
                    on:click={() => updateRequestStatus(request.id, 'Approved')}
                  >
                    <ShieldCheck size={13} />
                    Approve
                  </button>
                  <button
                    type="button"
                    class="action-button action-reject rounded-lg px-3 py-2 text-xs font-semibold"
                    on:click={() => updateRequestStatus(request.id, 'Rejected')}
                  >
                    Reject
                  </button>
                </div>
              {/if}
            </div>

            <div class="mt-4 rounded-lg border reason-box px-4 py-3">
              <p class="requests-label text-xs font-semibold uppercase tracking-[0.08em]">Reason</p>
              <p class="requests-subtitle mt-1 text-sm">{previewReason(request.reason)}</p>
            </div>
          </article>
        {/each}
      {/if}
    </section>
  {/if}
</section>

<style>
  .requests-shell {
    --rq-surface: #ffffff;
    --rq-surface-soft: #f3f8ff;
    --rq-border: #d7e3f1;
    --rq-heading: #0f172a;
    --rq-text: #1f2937;
    --rq-muted: #60748e;
    position: relative;
    border-radius: 1.25rem;
    padding: 0.35rem;
    isolation: isolate;
  }

  .requests-shell::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -2;
    border-radius: 1.25rem;
    background: radial-gradient(130% 130% at 0% 0%, #e4f1ff 0%, #f7fbff 58%, #eef4fb 100%);
  }

  .requests-shell::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: 1.25rem;
    background-image: linear-gradient(112deg, rgba(15, 108, 189, 0.08), transparent 52%);
    pointer-events: none;
  }

  .requests-header-card,
  .requests-panel,
  .request-kpi {
    background: var(--rq-surface);
    border-color: var(--rq-border);
    box-shadow: 0 18px 36px -30px rgba(15, 23, 42, 0.42);
  }

  .requests-heading {
    color: var(--rq-heading);
  }

  .requests-subtitle,
  .requests-label {
    color: var(--rq-text);
  }

  .requests-header-icon {
    background: #e0efff;
    color: #0f6cbd;
    border: 1px solid #bfdbfe;
  }

  .tab-switch {
    border-color: var(--rq-border);
    background: #e9f2fc;
    padding: 0.2rem;
  }

  .tab-button {
    border: none;
    background: transparent;
    color: #34506e;
    padding: 0.55rem 1rem;
    border-radius: 0.7rem;
    transition: all 0.2s ease;
  }

  .tab-button:hover {
    background: #dbeafe;
    color: #0f6cbd;
  }

  .tab-button-active {
    background: linear-gradient(90deg, #0f6cbd, #0ea5e9);
    color: #ffffff;
    font-weight: 700;
    box-shadow: 0 10px 20px -14px rgba(15, 108, 189, 0.9);
  }

  .request-kpi {
    position: relative;
    overflow: hidden;
  }

  .request-kpi::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 3px;
  }

  .request-kpi-total::before {
    background: linear-gradient(90deg, #0f6cbd, #38bdf8);
  }

  .request-kpi-pending::before {
    background: linear-gradient(90deg, #d97706, #f59e0b);
  }

  .request-kpi-resolved::before {
    background: linear-gradient(90deg, #0f766e, #10b981);
  }

  .request-kpi-icon {
    background: #e8f2fd;
    color: #0f6cbd;
    border: 1px solid #bfdbfe;
  }

  .request-kpi-pending .request-kpi-icon {
    background: #fff3dd;
    color: #b45309;
    border-color: #fcd34d;
  }

  .request-kpi-resolved .request-kpi-icon {
    background: #ddfbea;
    color: #0f766e;
    border-color: #86efac;
  }

  .request-form-panel {
    background: linear-gradient(145deg, #ffffff, #f3f8ff);
  }

  .requests-input {
    background: #edf4fb;
    border-color: #bed2e8;
    color: var(--rq-heading);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .requests-input:focus {
    border-color: #60a5fa;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  }

  .submit-button {
    background: linear-gradient(90deg, #0f6cbd, #0ea5e9);
    color: #ffffff;
    border: 1px solid #0f6cbd;
    box-shadow: 0 14px 28px -16px rgba(15, 108, 189, 0.9);
    transition: all 0.2s ease;
  }

  .submit-button:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-1px);
  }

  .submit-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    box-shadow: none;
  }

  .alert-error {
    background: #fee2e2;
    border-color: #fca5a5;
    color: #b91c1c;
  }

  .alert-success {
    background: #dcfce7;
    border-color: #86efac;
    color: #15803d;
  }

  .requests-empty-state {
    background: var(--rq-surface);
    border: 1px dashed var(--rq-border);
    border-radius: 1rem;
  }

  .request-card {
    position: relative;
    overflow: hidden;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .request-card::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 3px;
    background: linear-gradient(90deg, #93c5fd, #38bdf8);
  }

  .request-card-pending::before {
    background: linear-gradient(90deg, #f59e0b, #facc15);
  }

  .request-card-approved::before {
    background: linear-gradient(90deg, #10b981, #34d399);
  }

  .request-card-rejected::before {
    background: linear-gradient(90deg, #ef4444, #f97316);
  }

  .request-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 18px 36px -26px rgba(15, 23, 42, 0.45);
  }

  .request-type-icon {
    background: #e8f2fd;
    color: #0f6cbd;
    border: 1px solid #bfdbfe;
  }

  .request-meta {
    gap: 0.5rem;
  }

  .meta-pill {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    border: 1px solid #bfd5ec;
    background: #edf4fb;
    color: #355472;
    padding: 0.2rem 0.65rem;
    font-size: 0.74rem;
    font-weight: 600;
  }

  .reason-box {
    background: #f1f7fd;
    border-color: #c9d9ec;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 0.22rem 0.65rem;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.2;
    border: 1px solid transparent;
  }

  .status-pending {
    background: #fff3dd;
    border-color: #fcd34d;
    color: #9a3412;
  }

  .status-approved {
    background: #ddfbea;
    border-color: #86efac;
    color: #0f766e;
  }

  .status-rejected {
    background: #fee2e2;
    border-color: #fca5a5;
    color: #b91c1c;
  }

  .action-button {
    display: inline-flex;
    align-items: center;
    gap: 0.32rem;
    border: 1px solid transparent;
    transition: all 0.2s ease;
  }

  .action-approve {
    background: linear-gradient(90deg, #0f766e, #10b981);
    color: #ffffff;
    border-color: #0f766e;
  }

  .action-approve:hover {
    filter: brightness(1.06);
    transform: translateY(-1px);
  }

  .action-reject {
    background: linear-gradient(90deg, #dc2626, #f97316);
    color: #ffffff;
    border-color: #dc2626;
  }

  .action-reject:hover {
    filter: brightness(1.06);
    transform: translateY(-1px);
  }

  :global(.dark) .requests-shell {
    --rq-surface: #162338;
    --rq-surface-soft: #1b2a42;
    --rq-border: #2b3c57;
    --rq-heading: #e5edf8;
    --rq-text: #cfdceb;
    --rq-muted: #9ab0cb;
  }

  :global(.dark) .requests-shell::before {
    background: radial-gradient(130% 130% at 0% 0%, #173459 0%, #101a2b 48%, #0b1422 100%);
  }

  :global(.dark) .requests-shell::after {
    background-image: linear-gradient(112deg, rgba(91, 177, 255, 0.12), transparent 55%);
  }

  :global(.dark) .requests-header-card,
  :global(.dark) .requests-panel,
  :global(.dark) .request-kpi {
    box-shadow: 0 20px 38px -30px rgba(2, 8, 23, 0.95);
  }

  :global(.dark) .requests-header-icon,
  :global(.dark) .request-kpi-icon,
  :global(.dark) .request-type-icon {
    background: rgba(91, 177, 255, 0.16);
    color: #93c5fd;
    border-color: rgba(125, 211, 252, 0.4);
  }

  :global(.dark) .request-kpi-pending .request-kpi-icon {
    background: rgba(245, 158, 11, 0.2);
    color: #fcd34d;
    border-color: rgba(245, 158, 11, 0.45);
  }

  :global(.dark) .request-kpi-resolved .request-kpi-icon {
    background: rgba(16, 185, 129, 0.2);
    color: #6ee7b7;
    border-color: rgba(16, 185, 129, 0.45);
  }

  :global(.dark) .request-form-panel {
    background: linear-gradient(150deg, rgba(22, 35, 56, 0.96), rgba(19, 30, 49, 0.98));
  }

  :global(.dark) .tab-switch {
    background: #1a2c46;
    border-color: #335174;
  }

  :global(.dark) .tab-button {
    color: #b3c7df;
  }

  :global(.dark) .tab-button:hover {
    background: #233652;
    color: #e2ebf7;
  }

  :global(.dark) .requests-input,
  :global(.dark) .meta-pill,
  :global(.dark) .reason-box {
    background: #1a2c45;
    border-color: #334b6b;
    color: #dbe7f5;
  }

  :global(.dark) .requests-input:focus {
    border-color: #7cc3ff;
    box-shadow: 0 0 0 3px rgba(91, 177, 255, 0.24);
  }

  :global(.dark) .requests-empty-state {
    border-color: #365276;
  }

  :global(.dark) .alert-error {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.45);
    color: #fca5a5;
  }

  :global(.dark) .alert-success {
    background: rgba(34, 197, 94, 0.2);
    border-color: rgba(34, 197, 94, 0.45);
    color: #86efac;
  }

  :global(.dark) .status-pending {
    background: rgba(250, 204, 21, 0.2);
    border-color: rgba(250, 204, 21, 0.45);
    color: #fde047;
  }

  :global(.dark) .status-approved {
    background: rgba(34, 197, 94, 0.2);
    border-color: rgba(34, 197, 94, 0.45);
    color: #86efac;
  }

  :global(.dark) .status-rejected {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.45);
    color: #fca5a5;
  }

  @media (max-width: 768px) {
    .requests-shell {
      border-radius: 1rem;
      padding: 0;
    }
  }
</style>