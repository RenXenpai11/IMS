<script>
  import { onDestroy, onMount, tick } from 'svelte';
  import { Calendar, Clock3, FileText, ShieldCheck, Loader2 } from 'lucide-svelte';
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
  let requestFilter = 'all'; // 'all', 'absence', 'overtime'
  let currentUser = null;
  let unsubscribeAuth;
  let unsubscribeSync;
  let requests = [];
  let isLoading = false;
  let formError = '';
  let formSuccess = '';
  let isSubmitting = false;
  let deepLinkRequestId = '';
  let highlightedRequestId = '';

  // Delete confirmation modal state
  let showDeleteModal = false;
  let requestToDelete = null;
  let isDeleting = false;

  let form = {
    requestType: 'Absence',
    date: '',
    startTime: '',
    endTime: '',
    lunchBreak: 0, // in minutes
    reason: '',
  };

  let minDate = '';
  
  $: showOvertimeFields = form.requestType === 'Overtime';
  $: overtimeHours = calculateOvertimeHours(form.startTime, form.endTime, form.lunchBreak);
  $: isWeekend = (() => {
    if (!form.date) return false;
    const dateObj = new Date(form.date + 'T00:00:00');
    const dayOfWeek = dateObj.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
  })();
  $: isFormValid = (() => {
    // Force re-evaluation on form changes
    void form.requestType;
    void form.date;
    void form.startTime;
    void form.endTime;
    void form.lunchBreak;
    void form.reason;
    return checkFormValidityImmediate();
  })();
  // Clear form error when user changes form fields
  $: if (form.requestType || form.date || form.startTime || form.endTime || form.lunchBreak || form.reason) {
    // Only clear error if it was a validation error (not a server error from submission)
    if (formError && formError.includes('cannot be scheduled') || formError.includes('End time must') || formError.includes('Overtime must') || formError.includes('Start time and end')) {
      formError = '';
    }
  }

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

  function calculateOvertimeHours(startTime, endTime, lunchBreak = 0) {
    if (!startTime || !endTime) return 0;
    
    const [startHour, startMin] = String(startTime).split(':').map(Number);
    const [endHour, endMin] = String(endTime).split(':').map(Number);
    
    const startTotalMin = startHour * 60 + startMin;
    const endTotalMin = endHour * 60 + endMin;
    
    if (endTotalMin <= startTotalMin) return 0;
    
    const diffMin = endTotalMin - startTotalMin;
    const lunchMinutes = Number(lunchBreak) || 0;
    const actualWorkMin = Math.max(0, diffMin - lunchMinutes);
    return Math.round((actualWorkMin / 60) * 10) / 10; // Round to 1 decimal place
  }

  async function callBackend(action, payload) {
    return callApiAction(action, payload || {});
  }

  function readRequestsDeepLinkIntent() {
    if (typeof window === 'undefined') {
      return null;
    }

    const params = new URLSearchParams(window.location.search || '');
    const page = String(params.get('page') || '').trim().toLowerCase();
    if (page !== 'requests') {
      return null;
    }

    return {
      requestId: String(params.get('requestId') || '').trim(),
    };
  }

  function clearRequestsDeepLinkQuery() {
    if (typeof window === 'undefined') {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete('page');
    url.searchParams.delete('requestId');

    const nextSearch = url.searchParams.toString();
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }

  function highlightRequestCard(requestId) {
    const targetId = String(requestId || '').trim();
    if (!targetId || typeof window === 'undefined') {
      return false;
    }

    const card = document.getElementById(`request-card-${targetId}`);
    if (!card) {
      return false;
    }

    highlightedRequestId = targetId;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });

    window.setTimeout(() => {
      if (highlightedRequestId === targetId) {
        highlightedRequestId = '';
      }
    }, 4200);

    return true;
  }

  async function loadRequests() {
    if (!currentUser) return;

    isLoading = true;
    try {
      const isSupervisor = String(currentUser?.role || '').trim().toLowerCase() === 'supervisor';
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
        if (deepLinkRequestId) {
          await tick();
          highlightRequestCard(deepLinkRequestId);
          deepLinkRequestId = '';
        }
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
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(parsed);
  }

  function formatCreatedDate(dateValue) {
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
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(parsed);
  }

  function formatTime(timeValue) {
    const timeString = String(timeValue || '').trim();
    if (!timeString) return '';

    // If it's already in HH:MM format, return as-is
    if (/^\d{1,2}:\d{2}(:\d{2})?/.test(timeString)) {
      return timeString.substring(0, 5); // Get only HH:MM
    }

    // If it contains a date, extract the time portion
    if (timeString.includes(' ') || timeString.includes('T')) {
      const parts = timeString.split(' ');
      const timePart = parts[parts.length - 1];
      if (/^\d{1,2}:\d{2}/.test(timePart)) {
        return timePart.substring(0, 5);
      }
    }

    return timeString;
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

      // Check for duplicate absence request on the same date
      const existingAbsenceOnDate = requests.some(
        (req) => 
          req.requestType === 'Absence' && 
          req.date === form.date &&
          (req.status === 'Pending' || req.status === 'Approved')
      );
      
      if (existingAbsenceOnDate) {
        return `You already have an absence request for ${new Date(form.date + 'T00:00:00').toLocaleDateString()}. Please edit the existing request or select a different date.`;
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
      lunchBreak: 0,
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
        requester_name: String(currentUser?.full_name || '').trim() || 'Intern',
        request_type: form.requestType,
        request_date: form.date,
        start_time: form.requestType === 'Overtime' ? form.startTime : '',
        end_time: form.requestType === 'Overtime' ? form.endTime : '',
        lunch_break: form.requestType === 'Overtime' ? Number(form.lunchBreak) || 0 : 0,
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
        supervisor_user_id: String(currentUser?.user_id || '').trim(),
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

  function editRequest(request) {
    // Load request data into form for editing
    form.requestType = request.requestType;
    form.date = request.date;
    form.startTime = request.start_time || '';
    form.endTime = request.end_time || '';
    form.reason = request.reason || '';
    // Switch to create tab
    activeTab = 'create-request';
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openDeleteModal(request) {
    requestToDelete = request;
    showDeleteModal = true;
  }

  function closeDeleteModal() {
    requestToDelete = null;
    showDeleteModal = false;
  }

  async function confirmDeleteRequest() {
    if (!requestToDelete) return;

    isDeleting = true;
    try {
      // Call backend to permanently delete the request
      const result = await callBackend('delete_request', {
        request_id: requestToDelete.request_id,
      });

      if (result && result.ok) {
        // Reload requests from backend to ensure consistency
        await loadRequests();
        formSuccess = 'Request deleted permanently.';
        setTimeout(() => (formSuccess = ''), 3000);
        closeDeleteModal();
      } else {
        formError = result?.error || 'Failed to delete request.';
      }
    } catch (err) {
      console.error('Delete request error:', err);
      formError = 'Failed to delete request.';
    } finally {
      isDeleting = false;
    }
  }

  onMount(() => {
    // Initialize minDate
    minDate = getTodayDate();

    const deepLinkIntent = readRequestsDeepLinkIntent();
    if (deepLinkIntent) {
      activeTab = 'my-requests';
      deepLinkRequestId = deepLinkIntent.requestId;
      clearRequestsDeepLinkQuery();
    }
    
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

  $: isSupervisor = String(currentUser?.role || '').trim().toLowerCase() === 'supervisor';
  $: if (isSupervisor && activeTab === 'create-request') {
    activeTab = 'my-requests';
  }
  $: listTabLabel = isSupervisor ? 'Intern Requests' : 'My Requests';
  $: pageSubtitle = isSupervisor
    ? 'Review and resolve assigned intern requests'
    : 'Submit absence and overtime requests for approval';
  
  // Filter and sort requests based on active filter
  $: filteredRequests = requests
    .filter((r) => {
      if (requestFilter === 'all') return true;
      return String(r.requestType || '').toLowerCase() === requestFilter.toLowerCase();
    })
    .sort((a, b) => {
      // Sort by applied date (most recent first)
      const dateA = new Date(a.date || a.request_date || a.applied_date || 0);
      const dateB = new Date(b.date || b.request_date || b.applied_date || 0);
      return dateB.getTime() - dateA.getTime();
    });

  $: totalRequests = filteredRequests.length;
  $: pendingRequests = filteredRequests.filter((request) => String(request?.status || '').toLowerCase() === 'pending').length;
  $: resolvedRequests = filteredRequests.filter((request) => {
    const status = String(request?.status || '').toLowerCase();
    return status === 'approved' || status === 'rejected';
  }).length;
</script>

<section class="requests-shell flex flex-col gap-6">
  <!-- KPI Cards at Top -->
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

  <!-- Toggle Buttons Below Cards -->
  <div class="inline-flex rounded-lg border tab-switch w-fit">
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

  {#if formSuccess}
    <p class="alert-success rounded-xl border px-4 py-3 text-sm font-medium">{formSuccess}</p>
  {/if}

  {#if activeTab === 'create-request' && !isSupervisor}
    <section class="requests-panel request-form-panel rounded-2xl border p-6 shadow-md">
      <h3 class="requests-heading text-base font-semibold">Create Request</h3>
      <p class="requests-subtitle mt-1 text-sm">Fill out the request details before submission.</p>

      <!-- Modern Request Type Toggle -->
      <div class="mt-6 mb-6">
        <span class="requests-label text-sm font-medium block mb-3">Request Type</span>
        <div class="inline-flex rounded-lg border request-type-toggle shadow-sm">
          {#each REQUEST_TYPES as type}
            <button
              type="button"
              class="request-type-btn px-6 py-2.5 font-medium text-sm transition-colors rounded-lg"
              class:request-type-btn-active={form.requestType === type}
              on:click={() => { form.requestType = type; form.startTime = ''; form.endTime = ''; }}
              title="Select {type} request"
            >
              {#if type === 'Absence'}
                <span>📅 Absence</span>
              {:else}
                <span>⏱️ Overtime</span>
              {/if}
            </button>
          {/each}
        </div>
      </div>

      <div class="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <!-- Date Input with MM/DD/YYYY format -->
        <label class="flex flex-col gap-1.5">
          <span class="requests-label text-sm font-medium">Date</span>
          <input 
            bind:value={form.date} 
            type="date" 
            min={minDate} 
            class="requests-input w-full rounded-xl border px-4 py-3 outline-none"
            title="Select date in MM/DD/YYYY format"
          />
        </label>

        <!-- Weekend Warning for Absence Requests -->
        {#if form.requestType === 'Absence' && isWeekend && form.date}
          <div class="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 lg:col-span-2">
            <span class="text-lg">⚠️</span>
            <span class="text-sm font-medium text-amber-900">This date is a weekend/day off. Absence requests cannot be submitted for weekends.</span>
          </div>
        {/if}

        <!-- Spacer for alignment on mobile -->
        <div></div>

        {#if showOvertimeFields}
          <!-- Start Time Input -->
          <label class="flex flex-col gap-1.5">
            <span class="requests-label text-sm font-medium">Start Time</span>
            <input 
              bind:value={form.startTime} 
              type="time" 
              class="requests-input requests-time-input w-full rounded-xl border px-4 py-3 outline-none"
              placeholder="HH:MM"
              title="Enter start time"
            />
          </label>

          <!-- End Time Input -->
          <label class="flex flex-col gap-1.5">
            <span class="requests-label text-sm font-medium">End Time</span>
            <input 
              bind:value={form.endTime} 
              type="time" 
              class="requests-input requests-time-input w-full rounded-xl border px-4 py-3 outline-none"
              placeholder="HH:MM"
              title="Enter end time"
            />
          </label>

          <!-- Lunch Break Input -->
          <label class="flex flex-col gap-1.5">
            <span class="requests-label text-sm font-medium">Lunch Break (minutes)</span>
            <input 
              bind:value={form.lunchBreak} 
              type="number" 
              min="0"
              max="480"
              step="15"
              class="requests-input w-full rounded-xl border px-4 py-3 outline-none"
              placeholder="e.g., 60 for 1 hour"
              title="Enter lunch break duration in minutes"
            />
          </label>

          {#if form.startTime && form.endTime && overtimeHours > 0}
            <div class="flex flex-col gap-1.5 lg:col-span-2 rounded-lg overtime-hours-display p-4">
              <span class="requests-label text-sm font-medium">Total Overtime Hours</span>
              <div class="text-2xl font-bold">⏱️ {overtimeHours} hour{overtimeHours !== 1 ? 's' : ''}</div>
              {#if Number(form.lunchBreak) > 0}
                <span class="requests-subtitle text-xs mt-1">(After deducting {Number(form.lunchBreak)} minutes for lunch break)</span>
              {/if}
            </div>
          {/if}
        {/if}
      </div>

      <label class="mt-6 flex flex-col gap-1.5">
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
          class="submit-button inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold" 
          on:click={submitRequest}
          disabled={isSubmitting || !isFormValid}
        >
          {#if isSubmitting}
            <span class="spinning-icon"><Loader2 size={16} /></span>
          {/if}
          <span>{isSubmitting ? 'Submitting...' : 'Submit Request'}</span>
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
        <!-- Request Filter Buttons -->
        <div class="flex flex-wrap gap-2 pb-3">
          <button
            class={`filter-btn text-sm font-medium px-4 py-2 rounded-lg transition-all ${
              requestFilter === 'all'
                ? 'filter-btn-active bg-blue-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            on:click={() => (requestFilter = 'all')}
          >
            All Requests
          </button>
          <button
            class={`filter-btn text-sm font-medium px-4 py-2 rounded-lg transition-all ${
              requestFilter === 'absence'
                ? 'filter-btn-active bg-blue-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            on:click={() => (requestFilter = 'absence')}
          >
            📅 Absence
          </button>
          <button
            class={`filter-btn text-sm font-medium px-4 py-2 rounded-lg transition-all ${
              requestFilter === 'overtime'
                ? 'filter-btn-active bg-blue-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            on:click={() => (requestFilter = 'overtime')}
          >
            ⏱️ Overtime
          </button>
        </div>

        {#if filteredRequests.length === 0}
          <p class="requests-empty-state requests-subtitle text-center py-8">
            {requests.length === 0 ? 'No requests yet.' : 'No requests match the selected filter.'}
          </p>
        {:else}
          {#each filteredRequests as request (request.id)}
          {@const statusMeta = STATUS_META[request.status] ?? STATUS_META.Pending}
          {@const statusTone = String(request.status || 'Pending').toLowerCase()}
          <article
            id={`request-card-${request.id}`}
            class={`requests-panel request-card request-card-${statusTone} rounded-2xl border p-5 shadow-md`}
            class:request-card-focused={highlightedRequestId === request.id}
          >
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
                    <span class="meta-pill">📅 For: {formatDate(request.date)}</span>
                    {#if request.requestType === 'Overtime'}
                      {#if request.total_hours}
                        <span class="meta-pill">⏳ Duration: {request.total_hours}h</span>
                      {/if}
                    {/if}
                    {#if request.created_at}
                      <span class="meta-pill">Submitted: {formatCreatedDate(request.created_at)}</span>
                    {/if}
                    {#if isSupervisor}
                      <span class="meta-pill">👤 {request.requester_name || 'Unknown'}</span>
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
              {:else if !isSupervisor && request.status === 'Pending'}
                <div class="inline-flex items-center gap-2">
                  <button
                    type="button"
                    class="action-button action-edit rounded-lg px-3 py-2 text-xs font-semibold"
                    on:click={() => editRequest(request)}
                    title="Edit this request"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="action-button action-delete rounded-lg px-3 py-2 text-xs font-semibold"
                    on:click={() => openDeleteModal(request)}
                    title="Delete this request"
                  >
                    Delete
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
      {/if}
    </section>
  {/if}

  <!-- Delete Confirmation Modal -->
  {#if showDeleteModal && requestToDelete}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="relative w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-slate-800 flex flex-col">
        <!-- Modal Header -->
        <div class="border-b border-red-100 px-6 py-5 dark:border-red-900/40 flex-shrink-0">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-lg font-bold text-red-700 dark:text-red-400">Delete Request</h2>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                This action cannot be undone.
              </p>
            </div>
          </div>
        </div>

        <!-- Modal Body -->
        <div class="flex-1 overflow-y-auto px-6 py-5">
          <p class="mb-5 text-base text-gray-700 dark:text-gray-300">
            Are you sure you want to permanently delete this request?
          </p>

          <!-- Request Details -->
          <div class="mb-6 rounded-xl bg-red-50 p-4 dark:bg-red-950/30">
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-600 dark:text-gray-400">Type:</span>
                <span class="font-semibold text-gray-900 dark:text-gray-100">
                  {requestToDelete.requestType || requestToDelete.request_type}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-600 dark:text-gray-400">Date:</span>
                <span class="font-semibold text-gray-900 dark:text-gray-100">
                  {new Date(requestToDelete.date || requestToDelete.request_date).toLocaleDateString()}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-600 dark:text-gray-400">Status:</span>
                <span class="font-semibold text-gray-900 dark:text-gray-100">
                  {requestToDelete.status || 'Pending'}
                </span>
              </div>
              {#if requestToDelete.reason}
                <div class="border-t border-red-200 dark:border-red-900/50 pt-3">
                  <span class="text-sm font-medium text-gray-600 dark:text-gray-400">Reason:</span>
                  <p class="mt-1 text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                    {requestToDelete.reason}
                  </p>
                </div>
              {/if}
            </div>
          </div>

          <p class="text-xs text-gray-500 dark:text-gray-500">
            Request ID: <span class="font-mono text-gray-600 dark:text-gray-400">{requestToDelete.request_id}</span>
          </p>
        </div>

        <!-- Modal Footer -->
        <div class="flex-shrink-0 flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-slate-900/50 sm:flex-row">
          <button
            type="button"
            on:click={closeDeleteModal}
            disabled={isDeleting}
            class="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-all duration-200 hover:bg-gray-100 hover:border-gray-400 active:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-slate-700 dark:text-gray-200 dark:hover:bg-slate-600 dark:hover:border-gray-500"
          >
            Cancel
          </button>
          <button
            type="button"
            on:click={confirmDeleteRequest}
            disabled={isDeleting}
            class="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-red-700 active:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600 dark:active:bg-red-800"
          >
            {#if isDeleting}
              <span class="spinning-icon"><Loader2 size={16} /></span>
              <span>Deleting...</span>
            {:else}
              <span>Delete Permanently</span>
            {/if}
          </button>
        </div>
      </div>
    </div>
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

  .theme-divider {
    border-color: var(--rq-border);
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
    border: none;
    background: transparent;
    padding: 0;
    display: flex;
    gap: 0.75rem;
  }

  .tab-button {
    border: 1px solid #cbd5e1;
    background: transparent;
    color: #64748b;
    padding: 0.55rem 1.2rem;
    border-radius: 0.6rem;
    transition: all 0.2s ease;
    font-weight: 500;
    cursor: pointer;
  }

  .tab-button:hover {
    border-color: #0066cc;
    color: #0066cc;
    background: transparent;
  }

  .tab-button-active {
    background: #0066cc;
    color: #ffffff;
    border-color: #0066cc;
    font-weight: 600;
    box-shadow: none;
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

  .overtime-hours-display {
    background: #e8f4ff;
    border: 1px solid #b3d9ff;
    color: #0f4c8b;
  }

  .overtime-hours-display .requests-label {
    color: #0f4c8b;
  }

  .overtime-hours-display .requests-subtitle {
    color: #2874c7;
  }

  .overtime-hours-summary {
    background: #e8f2fd;
    border-color: #bfdbfe;
  }

  .overtime-hours-value {
    color: #1e3a8a;
  }

  .requests-input {
    background: #edf4fb;
    border-color: #bed2e8;
    color: var(--rq-heading);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .requests-input::placeholder {
    color: #94a9c4;
    font-weight: 500;
    opacity: 0.7;
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

  .request-card-focused {
    border-color: #0f6cbd;
    box-shadow: 0 0 0 3px rgba(15, 108, 189, 0.2), 0 18px 36px -24px rgba(15, 23, 42, 0.45);
    animation: request-focus-pulse 1.3s ease 1;
  }

  @keyframes request-focus-pulse {
    0% {
      transform: translateY(-2px);
    }
    50% {
      transform: translateY(-4px);
    }
    100% {
      transform: translateY(0);
    }
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

  .meta-pill-secondary {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #f3f4f6;
    color: #6b7280;
    padding: 0.2rem 0.65rem;
    font-size: 0.74rem;
    font-weight: 500;
  }

  @media (prefers-color-scheme: dark) {
    .meta-pill-secondary {
      border-color: #4b5563;
      background: #2d3748;
      color: #cbd5e0;
    }

    .meta-pill-applied {
      border-color: #5b21b6;
      background: #4c1d95;
      color: #e9d5ff;
    }
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

  .action-edit {
    background: linear-gradient(90deg, #3b82f6, #2563eb);
    color: #ffffff;
    border-color: #3b82f6;
  }

  .action-edit:hover {
    filter: brightness(1.06);
    transform: translateY(-1px);
  }

  .action-delete {
    background: linear-gradient(90deg, #ef4444, #dc2626);
    color: #ffffff;
    border-color: #ef4444;
  }

  .action-delete:hover {
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

  :global(.dark) .overtime-hours-summary {
    background: #1a2c45;
    border-color: #334b6b;
  }

  :global(.dark) .overtime-hours-value {
    color: #dbe7f5;
  }

  :global(.dark) .tab-switch {
    background: transparent;
    border: none;
  }

  :global(.dark) .tab-button {
    color: #94a3b8;
    border-color: #475569;
  }

  :global(.dark) .tab-button:hover {
    border-color: #0066cc;
    color: #0066cc;
    background: transparent;
  }

  :global(.dark) .tab-button-active {
    background: #0066cc;
    color: #ffffff;
    border-color: #0066cc;
  }

  :global(.dark) .requests-input,
  :global(.dark) .meta-pill,
  :global(.dark) .reason-box {
    background: #1a2c45;
    border-color: #334b6b;
    color: #dbe7f5;
  }

  :global(.dark) .overtime-hours-display {
    background: rgba(91, 177, 255, 0.15);
    border-color: rgba(91, 177, 255, 0.35);
    color: #5bb1ff;
  }

  :global(.dark) .overtime-hours-display .requests-label {
    color: #5bb1ff;
  }

  :global(.dark) .overtime-hours-display .requests-subtitle {
    color: #7cc3ff;
  }

  :global(.dark) .requests-input:focus {
    border-color: #7cc3ff;
    box-shadow: 0 0 0 3px rgba(91, 177, 255, 0.24);
  }

  :global(.dark) .requests-input::placeholder {
    color: #5a7a9e;
    opacity: 0.8;
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

  /* Modern Request Type Toggle */
  .request-type-toggle {
    display: inline-flex;
    background: #f0f4f8;
    border: 1px solid #d7e3f1;
    border-radius: 0.75rem;
    padding: 0.3rem;
    gap: 0;
  }

  .request-type-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    border: 1px solid transparent;
    background: transparent;
    color: #60748e;
    padding: 0.65rem 1.25rem;
    border-radius: 0.6rem;
    font-weight: 500;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .request-type-btn:hover {
    background: #e8f0f7;
    color: #34506e;
  }

  .request-type-btn-active {
    background: linear-gradient(135deg, #0f6cbd 0%, #0ea5e9 100%);
    color: #ffffff;
    border-color: #0f6cbd;
    box-shadow: 0 8px 16px -6px rgba(15, 108, 189, 0.4);
    font-weight: 600;
  }

  .request-type-btn-active:hover {
    box-shadow: 0 12px 24px -8px rgba(15, 108, 189, 0.5);
    transform: translateY(-1px);
  }

  /* Filter Buttons */
  .filter-btn {
    border: 1px solid transparent;
    outline: none;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    background: hsl(var(--clr-bg-secondary, 210 40% 96%));
    color: hsl(var(--clr-text-secondary, 210 20% 50%));
  }

  .filter-btn:hover {
    background: hsl(var(--clr-bg-tertiary, 210 35% 90%));
  }

  .filter-btn-active {
    background: linear-gradient(135deg, #0f6cbd 0%, #0ea5e9 100%);
    color: #ffffff;
    font-weight: 600;
    box-shadow: 0 8px 16px -6px rgba(15, 108, 189, 0.4);
  }

  .filter-btn-active:hover {
    box-shadow: 0 12px 24px -8px rgba(15, 108, 189, 0.5);
    transform: translateY(-1px);
  }

  /* Dark mode support for filter buttons */
  @media (prefers-color-scheme: dark) {
    .filter-btn {
      background: hsl(210 15% 25%);
      color: hsl(210 15% 80%);
    }

    .filter-btn:hover {
      background: hsl(210 15% 32%);
    }

    .filter-btn-active {
      background: linear-gradient(135deg, #0f6cbd 0%, #0ea5e9 100%);
      color: #ffffff;
      box-shadow: 0 8px 16px -6px rgba(15, 108, 189, 0.6);
    }

    .filter-btn-active:hover {
      box-shadow: 0 12px 24px -8px rgba(15, 108, 189, 0.7);
    }
  }

  /* Format hint text */
  .requests-hint {
    color: #9ca3af;
    font-style: italic;
    margin-top: -0.5rem;
  }

  /* Date and Time Input Styling */
  .requests-date-input,
  .requests-time-input {
    color-scheme: light dark;
  }

  .requests-date-input::-webkit-calendar-picker-indicator,
  .requests-time-input::-webkit-calendar-picker-indicator {
    cursor: pointer;
    border-radius: 4px;
    margin-right: 2px;
    opacity: 0.6;
    filter: invert(0.8);
  }

  .requests-date-input::-webkit-calendar-picker-indicator:hover,
  .requests-time-input::-webkit-calendar-picker-indicator:hover {
    opacity: 1;
  }

  /* Show placeholder text styling */
  .requests-date-input::placeholder,
  .requests-time-input::placeholder {
    color: #a1a1a1;
    opacity: 1 !important;
  }

  /* Firefox */
  .requests-date-input::-moz-placeholder,
  .requests-time-input::-moz-placeholder {
    color: #a1a1a1;
    opacity: 1 !important;
  }

  @media (max-width: 768px) {
    .requests-shell {
      border-radius: 1rem;
      padding: 0;
    }

    .request-type-toggle {
      width: 100%;
      justify-content: space-between;
    }

    .request-type-btn {
      flex: 1;
      justify-content: center;
    }
  }
</style>