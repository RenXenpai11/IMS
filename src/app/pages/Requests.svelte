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
    time: '',
    reason: '',
  };

  $: showTimeField = form.requestType === 'Overtime';

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
    if (!form.requestType || !form.date || !String(form.reason || '').trim()) {
      return 'Request type, date, and reason are required.';
    }

    if (form.requestType === 'Overtime' && !String(form.time || '').trim()) {
      return 'Time is required for overtime requests.';
    }

    return '';
  }

  function resetForm() {
    form = {
      requestType: 'Absence',
      date: '',
      time: '',
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
        request_time: form.requestType === 'Overtime' ? form.time : '',
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
</script>

<section class="flex flex-col gap-6">
  <section class="requests-header-card rounded-xl border p-6 shadow-md">
    <div class="inline-flex h-11 w-11 items-center justify-center rounded-xl requests-header-icon">
      <FileText size={18} />
    </div>
    <h2 class="requests-heading mt-4 text-2xl font-bold tracking-tight">Requests</h2>
    <p class="requests-subtitle mt-1 text-sm">{pageSubtitle}</p>
  </section>

  <section class="requests-panel rounded-xl border p-5 shadow-md">
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

  {#if formSuccess}
    <p class="alert-success rounded-xl border px-4 py-3 text-sm font-medium">{formSuccess}</p>
  {/if}

  {#if activeTab === 'create-request' && !isSupervisor}
    <section class="requests-panel rounded-xl border p-6 shadow-md">
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
          <input bind:value={form.date} type="date" class="requests-input w-full rounded-xl border px-4 py-3 outline-none" />
        </label>

        {#if showTimeField}
          <label class="flex flex-col gap-1.5">
            <span class="requests-label text-sm font-medium">Time</span>
            <input bind:value={form.time} type="time" class="requests-input w-full rounded-xl border px-4 py-3 outline-none" />
          </label>
        {/if}
      </div>

      <label class="mt-4 flex flex-col gap-1.5">
        <span class="requests-label text-sm font-medium">Reason</span>
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
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Request'}
        </button>
      </div>
    </section>
  {:else}
    <section class="flex flex-col gap-4">
      {#if isLoading}
        <p class="requests-subtitle text-center py-8">Loading requests...</p>
      {:else if requests.length === 0}
        <p class="requests-subtitle text-center py-8">No requests yet.</p>
      {:else}
        {#each requests as request (request.id)}
          {@const statusMeta = STATUS_META[request.status] ?? STATUS_META.Pending}
          <article class="requests-panel request-card rounded-xl border p-5 shadow-md">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="flex items-start gap-3">
                <div class="inline-flex h-10 w-10 items-center justify-center rounded-lg request-type-icon">
                  {#if request.requestType === 'Overtime'}
                    <Clock3 size={16} />
                  {:else}
                    <Calendar size={16} />
                  {/if}
                </div>
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <h4 class="requests-heading text-base font-semibold">{request.requestType}</h4>
                    <span class={statusMeta.badgeClass}>{request.status}</span>
                  </div>
                  <p class="requests-subtitle mt-1 text-sm">Date: {formatDate(request.date)}</p>
                  {#if request.time}
                    <p class="requests-subtitle text-sm">Time: {request.time}</p>
                  {/if}
                  {#if isSupervisor}
                    <p class="requests-subtitle text-sm">Student: {request.requester_name || 'Unknown'}</p>
                  {/if}
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
  .requests-header-card,
  .requests-panel {
    background: var(--color-surface);
    border-color: var(--color-border);
  }

  .requests-heading {
    color: var(--color-heading);
  }

  .requests-subtitle,
  .requests-label {
    color: var(--color-sidebar-text);
  }

  .requests-header-icon {
    background: #e0e7ff;
    color: #4338ca;
  }

  :global(.dark) .requests-header-icon {
    background: rgba(99, 102, 241, 0.16);
    color: #c7d2fe;
  }

  .tab-switch {
    border-color: var(--color-border);
    background: var(--color-soft);
    padding: 0.2rem;
  }

  .tab-button {
    border: none;
    background: transparent;
    color: var(--color-sidebar-text);
    padding: 0.55rem 1rem;
    border-radius: 0.7rem;
    transition: all 0.2s ease;
  }

  .tab-button:hover {
    background: var(--color-hover);
    color: var(--color-heading);
  }

  .tab-button-active {
    background: var(--color-active-bg);
    color: var(--color-active-text);
    font-weight: 700;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-active-text) 18%, transparent);
  }

  .requests-input {
    background: var(--color-soft);
    border-color: var(--color-border);
    color: var(--color-heading);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .requests-input:focus {
    border-color: #818cf8;
    box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.25);
  }

  .submit-button {
    background: #4f46e5;
    color: #ffffff;
    border: 1px solid #4338ca;
    transition: all 0.2s ease;
  }

  .submit-button:hover:not(:disabled) {
    background: #4338ca;
    transform: translateY(-1px);
  }

  .submit-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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

  .request-card {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .request-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
  }

  .request-type-icon {
    background: #e0e7ff;
    color: #4338ca;
  }

  :global(.dark) .request-type-icon {
    background: rgba(99, 102, 241, 0.16);
    color: #c7d2fe;
  }

  .reason-box {
    background: var(--color-soft);
    border-color: var(--color-border);
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
    background: #fef9c3;
    border-color: #fde047;
    color: #854d0e;
  }

  .status-approved {
    background: #dcfce7;
    border-color: #86efac;
    color: #166534;
  }

  .status-rejected {
    background: #fee2e2;
    border-color: #fca5a5;
    color: #991b1b;
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

  .action-button {
    display: inline-flex;
    align-items: center;
    gap: 0.32rem;
    border: 1px solid transparent;
    transition: all 0.2s ease;
  }

  .action-approve {
    background: #16a34a;
    color: #ffffff;
    border-color: #15803d;
  }

  .action-approve:hover {
    background: #15803d;
    transform: translateY(-1px);
  }

  .action-reject {
    background: #ef4444;
    color: #ffffff;
    border-color: #dc2626;
  }

  .action-reject:hover {
    background: #dc2626;
    transform: translateY(-1px);
  }
</style>