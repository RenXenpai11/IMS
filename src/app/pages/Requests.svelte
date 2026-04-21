<script>
  import { onDestroy, onMount, tick } from "svelte";
  import {
    AlertTriangle,
    Calendar,
    CheckCircle2,
    Clock3,
    FileText,
    ShieldCheck,
    Loader2,
    Pencil,
    Send,
    Timer,
    Trash2,
    User,
    XCircle,
    X,
    CheckCircle,
  } from "lucide-svelte";
  import {
    callApiAction,
    getCurrentUser,
    subscribeToCurrentUser,
  } from "../lib/auth.js";
  import { subscribeToSync } from "../lib/sync.js";

  const REQUEST_TYPES = ["Absence", "Overtime"];

  const STATUS_META = {
    Pending: {
      badgeClass: "status-badge pending",
    },
    Approved: {
      badgeClass: "status-badge approved",
    },
    Rejected: {
      badgeClass: "status-badge rejected",
    },
  };

  let activeTab = "my-requests";
  let requestFilter = "all"; // 'all', 'absence', 'overtime', 'archive'
  let currentUser = null;
  let unsubscribeAuth;
  let unsubscribeSync;
  let requests = [];
  let isLoading = false;
  let formError = "";
  let formSuccess = "";
  let isSubmitting = false;
  let deepLinkRequestId = "";
  let highlightedRequestId = "";

  // Bulk archive state
  let bulkArchiveMode = false;
  let selectedRequestsForArchive = new Set();

  // Archive confirmation modal state
  let showArchiveModal = false;
  let requestToArchive = null;
  let isArchiving = false;

  // Delete archived request modal state
  let showDeleteArchivedModal = false;
  let requestToDeletePermanently = null;
  let isDeletingPermanently = false;
  let showBulkDeleteModal = false;
  let isBulkDeleting = false;

  // Delete confirmation modal state
  let showDeleteModal = false;
  let requestToDelete = null;
  let isDeleting = false;

  // Rejection remarks modal state
  let showRejectModal = false;
  let requestToReject = null;
  let rejectionRemarks = "";
  let isRejectingRequest = false;

  // Bulk selection state
  let selectedRequests = new Set();
  let selectAllChecked = false;
  let showBulkActions = false;
  let isArchiving = false;

  let form = {
    requestType: "Absence",
    date: "",
    startTime: "",
    endTime: "",
    lunchBreak: 0, // in minutes
    reason: "",
  };

  let minDate = "";

  $: showOvertimeFields = form.requestType === "Overtime";
  $: overtimeHours = calculateOvertimeHours(
    form.startTime,
    form.endTime,
    form.lunchBreak,
  );
  $: isWeekend = (() => {
    if (!form.date) return false;
    const dateObj = new Date(form.date + "T00:00:00");
    const dayOfWeek = dateObj.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6;
  })();
  $: isFormValid = (() => {
    void form.requestType;
    void form.date;
    void form.startTime;
    void form.endTime;
    void form.lunchBreak;
    void form.reason;
    return checkFormValidityImmediate();
  })();
  $: if (
    form.requestType ||
    form.date ||
    form.startTime ||
    form.endTime ||
    form.lunchBreak ||
    form.reason
  ) {
    if (
      formError &&
      (formError.includes("cannot be scheduled") ||
        formError.includes("End time must") ||
        formError.includes("Overtime must") ||
        formError.includes("Start time and end"))
    ) {
      formError = "";
    }
  }

  function getTodayDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function checkFormValidityImmediate() {
    if (!minDate) {
      minDate = getTodayDate();
    }
    if (!form.date) return false;
    if (form.date < minDate) return false;
    if (!String(form.reason || "").trim()) return false;

    if (form.requestType === "Absence") {
      const dateObj = new Date(form.date + "T00:00:00");
      const dayOfWeek = dateObj.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) return false;
    }

    if (form.requestType === "Overtime") {
      if (!form.startTime || !form.endTime) return false;
      const [startHour, startMin] = String(form.startTime)
        .split(":")
        .map(Number);
      const [endHour, endMin] = String(form.endTime).split(":").map(Number);
      const startTotalMin = startHour * 60 + startMin;
      const endTotalMin = endHour * 60 + endMin;
      if (endTotalMin <= startTotalMin) return false;
      if (overtimeHours < 0.5) return false;
    }

    return true;
  }

  function calculateOvertimeHours(startTime, endTime, lunchBreak = 0) {
    if (!startTime || !endTime) return 0;
    const [startHour, startMin] = String(startTime).split(":").map(Number);
    const [endHour, endMin] = String(endTime).split(":").map(Number);
    const startTotalMin = startHour * 60 + startMin;
    const endTotalMin = endHour * 60 + endMin;
    if (endTotalMin <= startTotalMin) return 0;
    const diffMin = endTotalMin - startTotalMin;
    const lunchMinutes = Number(lunchBreak) || 0;
    const actualWorkMin = Math.max(0, diffMin - lunchMinutes);
    return Math.round((actualWorkMin / 60) * 10) / 10;
  }

  async function callBackend(action, payload) {
    return callApiAction(action, payload || {});
  }

  function readRequestsDeepLinkIntent() {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search || "");
    const page = String(params.get("page") || "")
      .trim()
      .toLowerCase();
    if (page !== "requests") return null;
    return { requestId: String(params.get("requestId") || "").trim() };
  }

  function clearRequestsDeepLinkQuery() {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("page");
    url.searchParams.delete("requestId");
    const nextSearch = url.searchParams.toString();
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }

  function highlightRequestCard(requestId) {
    const targetId = String(requestId || "").trim();
    if (!targetId || typeof window === "undefined") return false;
    const card = document.getElementById(`request-card-${targetId}`);
    if (!card) return false;
    highlightedRequestId = targetId;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      if (highlightedRequestId === targetId) highlightedRequestId = "";
    }, 4200);
    return true;
  }

  async function loadRequests() {
    if (!currentUser) return;
    isLoading = true;
    try {
      const isSupervisor =
        String(currentUser?.role || "")
          .trim()
          .toLowerCase() === "supervisor";
      let result;
      if (isSupervisor) {
        result = await callBackend("list_assigned_student_requests", {
          supervisor_user_id: currentUser.user_id,
        });
      } else {
        result = await callBackend("list_requests_by_user", {
          user_id: currentUser.user_id,
        });
      }
      if (result && result.ok) {
        requests = result.requests || [];
        if (deepLinkRequestId) {
          await tick();
          highlightRequestCard(deepLinkRequestId);
          deepLinkRequestId = "";
        }
      }
    } catch (err) {
      console.error("Failed to load requests:", err);
      requests = [];
    } finally {
      isLoading = false;
    }
  }

  function formatDate(dateValue) {
    const dateString = String(dateValue || "").trim();
    if (!dateString) return "";
    let dateToFormat = dateString;
    if (dateString.includes("T") || dateString.includes(" ")) {
      dateToFormat = dateString.split("T")[0].split(" ")[0];
    }
    const parsed = new Date(`${dateToFormat}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateValue;
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(parsed);
  }

  function formatCreatedDate(dateValue) {
    const dateString = String(dateValue || "").trim();
    if (!dateString) return "";
    let dateToFormat = dateString;
    if (dateString.includes("T") || dateString.includes(" ")) {
      dateToFormat = dateString.split("T")[0].split(" ")[0];
    }
    const parsed = new Date(`${dateToFormat}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateValue;
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(parsed);
  }

  function formatTime(timeValue) {
    const timeString = String(timeValue || "").trim();
    if (!timeString) return "";
    if (/^\d{1,2}:\d{2}(:\d{2})?/.test(timeString))
      return timeString.substring(0, 5);
    if (timeString.includes(" ") || timeString.includes("T")) {
      const parts = timeString.split(" ");
      const timePart = parts[parts.length - 1];
      if (/^\d{1,2}:\d{2}/.test(timePart)) return timePart.substring(0, 5);
    }
    return timeString;
  }

  function previewReason(text) {
    const value = String(text || "").trim();
    if (value.length <= 88) return value;
    return `${value.slice(0, 88)}...`;
  }

  function setTab(tab) {
    if (isSupervisor && tab === "create-request") return;
    activeTab = tab;
    formError = "";
    formSuccess = "";
  }

  function validateForm() {
    const today = getTodayDate();
    if (!form.date) return "Date is required.";
    if (form.date < today)
      return "Request date cannot be in the past. Please select today or a future date.";
    if (!String(form.reason || "").trim())
      return "Reason/Notes is required for both absence and overtime requests.";
    if (form.requestType === "Absence") {
      const dateObj = new Date(form.date + "T00:00:00");
      const dayOfWeek = dateObj.getDay();
      const dayName = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ][dayOfWeek];
      if (dayOfWeek === 0 || dayOfWeek === 6)
        return `Absence cannot be requested on ${dayName}s (your day off). Please select a weekday (Monday-Friday).`;
      const existingAbsenceOnDate = requests.some(
        (req) =>
          req.requestType === "Absence" &&
          req.date === form.date &&
          (req.status === "Pending" || req.status === "Approved"),
      );
      if (existingAbsenceOnDate)
        return `You already have an absence request for ${new Date(form.date + "T00:00:00").toLocaleDateString()}. Please edit the existing request or select a different date.`;
    }
    if (form.requestType === "Overtime") {
      if (!form.startTime || !form.endTime)
        return "Start time and end time are required for overtime requests.";
      const [startHour, startMin] = String(form.startTime)
        .split(":")
        .map(Number);
      const [endHour, endMin] = String(form.endTime).split(":").map(Number);
      const startTotalMin = startHour * 60 + startMin;
      const endTotalMin = endHour * 60 + endMin;
      if (endTotalMin <= startTotalMin)
        return "End time must be after start time.";
      if (overtimeHours < 0.5) return "Overtime must be at least 30 minutes.";
    }
    return "";
  }

  function resetForm() {
    form = {
      requestType: "Absence",
      date: "",
      startTime: "",
      endTime: "",
      lunchBreak: 0,
      reason: "",
    };
  }

  async function submitRequest() {
    if (isSupervisor) {
      formError = "Supervisor accounts cannot create requests.";
      formSuccess = "";
      return;
    }
    const errorMessage = validateForm();
    formError = errorMessage;
    formSuccess = "";
    if (errorMessage) return;
    isSubmitting = true;
    try {
      const result = await callBackend("create_request", {
        user_id: currentUser.user_id,
        requester_name: String(currentUser?.full_name || "").trim() || "Intern",
        request_type: form.requestType,
        request_date: form.date,
        start_time: form.requestType === "Overtime" ? form.startTime : "",
        end_time: form.requestType === "Overtime" ? form.endTime : "",
        lunch_break:
          form.requestType === "Overtime" ? Number(form.lunchBreak) || 0 : 0,
        total_hours: form.requestType === "Overtime" ? overtimeHours : 0,
        reason: String(form.reason || "").trim(),
      });
      if (result && result.ok) {
        formSuccess = "Request submitted successfully!";
        formError = "";
        resetForm();
        await loadRequests();
        activeTab = "my-requests";
      } else {
        formError = result?.error || "Failed to submit request.";
        formSuccess = "";
      }
    } catch (err) {
      console.error("Submit request error:", err);
      formError =
        err?.message || "An error occurred while submitting the request.";
      formSuccess = "";
    } finally {
      isSubmitting = false;
    }
  }

  async function updateRequestStatus(requestId, nextStatus) {
    try {
      console.log("Approving request:", { requestId, nextStatus, supervisorId: currentUser?.user_id });
      const result = await callBackend("update_request_status", {
        request_id: requestId,
        status: nextStatus,
        supervisor_user_id: String(currentUser?.user_id || "").trim(),
      });
      console.log("Update status result:", result);
      if (result && result.ok) {
        formSuccess = `Request ${nextStatus.toLowerCase()}.`;
        setTimeout(() => (formSuccess = ""), 3000);
        await loadRequests();
      } else {
        console.error("Failed to update request status:", result?.error);
        formError = result?.error || "Failed to update request status";
        setTimeout(() => (formError = ""), 3000);
      }
    } catch (err) {
      console.error("Update request status error:", err);
      formError = "Error updating request status";
      setTimeout(() => (formError = ""), 3000);
    }
  }

  function editRequest(request) {
    form.requestType = request.requestType;
    form.date = request.date;
    form.startTime = request.start_time || "";
    form.endTime = request.end_time || "";
    form.reason = request.reason || "";
    activeTab = "create-request";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openDeleteModal(request) {
    requestToDelete = request;
    showDeleteModal = true;
  }

  function closeDeleteModal() {
    requestToDelete = null;
    showDeleteModal = false;
  }

  function openRejectModal(request) {
    requestToReject = request;
    rejectionRemarks = "";
    showRejectModal = true;
  }

  function closeRejectModal() {
    requestToReject = null;
    rejectionRemarks = "";
    showRejectModal = false;
  }

  async function confirmRejectRequest() {
    if (!requestToReject) return;
    isRejectingRequest = true;
    try {
      const result = await callBackend("update_request_status", {
        request_id: requestToReject.id,
        status: "Rejected",
        supervisor_user_id: String(currentUser?.user_id || "").trim(),
        rejection_remarks: String(rejectionRemarks || "").trim(),
      });
      if (result && result.ok) {
        closeRejectModal();
        await loadRequests();
      } else {
        console.error("Failed to reject request:", result?.error);
      }
    } catch (err) {
      console.error("Reject request error:", err);
    } finally {
      isRejectingRequest = false;
    }
  }

  async function confirmDeleteRequest() {
    if (!requestToDelete) return;
    isDeleting = true;
    try {
      const result = await callBackend("delete_request", {
        request_id: requestToDelete.request_id,
      });
      if (result && result.ok) {
        await loadRequests();
        formSuccess = "Request deleted permanently.";
        setTimeout(() => (formSuccess = ""), 3000);
        closeDeleteModal();
      } else {
        formError = result?.error || "Failed to delete request.";
      }
    } catch (err) {
      console.error("Delete request error:", err);
      formError = "Failed to delete request.";
    } finally {
      isDeleting = false;
    }
  }

  // Bulk selection functions
  function toggleRequestSelection(requestId) {
    if (selectedRequests.has(requestId)) {
      selectedRequests.delete(requestId);
    } else {
      selectedRequests.add(requestId);
    }
    selectedRequests = selectedRequests; // Trigger reactivity
  }

  function toggleSelectAll() {
    if (selectAllChecked) {
      selectedRequests.clear();
      selectAllChecked = false;
    } else {
      filteredRequests.forEach(r => selectedRequests.add(r.id));
      selectAllChecked = true;
    }
    selectedRequests = selectedRequests; // Trigger reactivity
  }

  async function archiveSelectedRequests() {
    if (selectedRequests.size === 0) return;
    isArchiving = true;
    try {
      for (const requestId of selectedRequests) {
        await callBackend("update_request_status", {
          request_id: requestId,
          status: "Archived",
          supervisor_user_id: String(currentUser?.user_id || "").trim(),
        });
      }
      selectedRequests.clear();
      selectAllChecked = false;
      await loadRequests();
      formSuccess = `${selectedRequests.size} request(s) archived.`;
      setTimeout(() => (formSuccess = ""), 3000);
    } catch (err) {
      console.error("Archive requests error:", err);
      formError = "Failed to archive requests.";
    } finally {
      isArchiving = false;
    }
  }

  async function recoverSelectedRequests() {
    if (selectedRequests.size === 0) return;
    isArchiving = true;
    try {
      for (const requestId of selectedRequests) {
        await callBackend("update_request_status", {
          request_id: requestId,
          status: "Pending",
          supervisor_user_id: String(currentUser?.user_id || "").trim(),
        });
      }
      selectedRequests.clear();
      selectAllChecked = false;
      await loadRequests();
      formSuccess = `${selectedRequests.size} request(s) recovered.`;
      setTimeout(() => (formSuccess = ""), 3000);
    } catch (err) {
      console.error("Recover requests error:", err);
      formError = "Failed to recover requests.";
    } finally {
      isArchiving = false;
    }
  }

  async function deleteSelectedRequests() {
    if (selectedRequests.size === 0) return;
    if (!confirm(`Delete ${selectedRequests.size} request(s) permanently?`)) return;
    try {
      for (const requestId of selectedRequests) {
        await callBackend("delete_request", {
          request_id: requestId,
        });
      }
      selectedRequests.clear();
      selectAllChecked = false;
      await loadRequests();
      formSuccess = `${selectedRequests.size} request(s) deleted permanently.`;
      setTimeout(() => (formSuccess = ""), 3000);
    } catch (err) {
      console.error("Delete requests error:", err);
      formError = "Failed to delete requests.";
    }
  }

  onMount(() => {
    minDate = getTodayDate();
    const deepLinkIntent = readRequestsDeepLinkIntent();
    if (deepLinkIntent) {
      activeTab = "my-requests";
      deepLinkRequestId = deepLinkIntent.requestId;
      clearRequestsDeepLinkQuery();
    }
    currentUser = getCurrentUser();
    unsubscribeAuth = subscribeToCurrentUser((user) => {
      currentUser = user;
      if (user) loadRequests();
    });
    unsubscribeSync = subscribeToSync(() => loadRequests());
    if (currentUser) loadRequests();
  });

  onDestroy(() => {
    if (typeof unsubscribeAuth === "function") unsubscribeAuth();
    if (typeof unsubscribeSync === "function") unsubscribeSync();
  });

  $: isSupervisor =
    String(currentUser?.role || "")
      .trim()
      .toLowerCase() === "supervisor";
  $: if (isSupervisor && activeTab === "create-request")
    activeTab = "my-requests";
  $: listTabLabel = isSupervisor ? "Intern Requests" : "My Requests";
  $: pageSubtitle = isSupervisor
    ? "Review and resolve assigned intern requests"
    : "Submit absence and overtime requests for approval";

  $: filteredRequests = requests
    .filter((r) => {
      const status = String(r.status || "").toLowerCase();
      if (requestFilter === "archive") {
        return status === "archived";
      }
      if (requestFilter === "all") return status !== "archived";
      return (
        String(r.requestType || "").toLowerCase() ===
        requestFilter.toLowerCase()
      ) && status !== "archived";
    })
    .sort((a, b) => {
      const dateA = new Date(a.date || a.request_date || a.applied_date || 0);
      const dateB = new Date(b.date || b.request_date || b.applied_date || 0);
      return dateB.getTime() - dateA.getTime();
    });

  $: totalRequests = filteredRequests.length;
  $: pendingRequests = filteredRequests.filter(
    (request) => String(request?.status || "").toLowerCase() === "pending",
  ).length;
  $: resolvedRequests = filteredRequests.filter((request) => {
    const status = String(request?.status || "").toLowerCase();
    return status === "approved" || status === "rejected";
  }).length;
</script>

<section class="requests-modern">
  <!-- Stat Cards -->
  <div class="stat-cards">
    <div class="stat-card blue">
      <div class="stat-card-top">
        <div style="flex:1"></div>
        <div class="stat-icon blue">
          <FileText size={16} />
        </div>
      </div>
      <div class="stat-value">{totalRequests}</div>
      <div class="stat-label">Total Requests</div>
    </div>

    <div class="stat-card amber">
      <div class="stat-card-top">
        <div style="flex:1"></div>
        <div class="stat-icon amber">
          <Clock3 size={16} />
        </div>
      </div>
      <div class="stat-value">{pendingRequests}</div>
      <div class="stat-label">Pending Review</div>
    </div>

    <div class="stat-card green">
      <div class="stat-card-top">
        <div style="flex:1"></div>
        <div class="stat-icon green">
          <ShieldCheck size={16} />
        </div>
      </div>
      <div class="stat-value">{resolvedRequests}</div>
      <div class="stat-label">Resolved</div>
    </div>
  </div>

  <!-- Tab Row -->
  <div class="tab-row">
    {#if !isSupervisor}
      <button
        class="tab-btn"
        class:active={activeTab === "my-requests"}
        on:click={() => setTab("my-requests")}
      >
        {listTabLabel}
      </button>
    {/if}
    {#if !isSupervisor}
      <button
        class="tab-btn"
        class:active={activeTab === "create-request"}
        on:click={() => setTab("create-request")}
      >
        Create Request
      </button>
    {/if}
  </div>

  {#if formSuccess}
    <div class="alert-success">{formSuccess}</div>
  {/if}

  <!-- My Requests Tab -->
  {#if activeTab === "my-requests"}
    <div class="requests-section">
      {#if isLoading}
        <div class="empty-requests">
          <div class="empty-icon"><Loader2 size={22} /></div>
          <div class="empty-text">Loading requests...</div>
        </div>
      {:else if requests.length === 0}
        <div class="empty-requests">
          <div class="empty-icon"><FileText size={22} /></div>
          <div class="empty-text">No requests yet.</div>
          <div class="empty-sub">
            Submitted requests will appear here once created.
          </div>
        </div>
      {:else}
        <!-- Filter Pills -->
        <div class="filter-row">
          <div class="filter-chips">
            <button
              class="filter-chip"
              class:active={requestFilter === "all"}
              on:click={() => (requestFilter = "all")}
            >
              All
            </button>
            <button
              class="filter-chip"
              class:active={requestFilter === "absence"}
              on:click={() => (requestFilter = "absence")}
            >
              <Calendar size={14} /> Absence
            </button>
            <button
              class="filter-chip"
              class:active={requestFilter === "overtime"}
              on:click={() => (requestFilter = "overtime")}
            >
              <Clock3 size={14} /> Overtime
            </button>
            {#if isSupervisor}
              <button
                class="filter-chip"
                class:active={requestFilter === "archive"}
                on:click={() => (requestFilter = "archive")}
              >
                <FileText size={14} /> Archive
              </button>
            {/if}
          </div>
          <div class="bulk-action-buttons">
            {#if showBulkActions}
              <button class="cancel-btn" on:click={() => { showBulkActions = false; selectedRequests.clear(); selectAllChecked = false; selectedRequests = selectedRequests; }}>
                Cancel
              </button>
              {#if isSupervisor && selectedRequests.size > 0}
                {#if requestFilter === "archive"}
                  <button class="recover-btn" on:click={recoverSelectedRequests} disabled={isArchiving}>
                    {#if isArchiving}
                      <span class="spinning-icon"><Loader2 size={14} /></span>
                      Recovering...
                    {:else}
                      ↻ Recover ({selectedRequests.size})
                    {/if}
                  </button>
                {:else}
                  <button class="archive-btn" on:click={archiveSelectedRequests} disabled={isArchiving}>
                    {#if isArchiving}
                      <span class="spinning-icon"><Loader2 size={14} /></span>
                      Archiving...
                    {:else}
                      Archive ({selectedRequests.size})
                    {/if}
                  </button>
                {/if}
              {/if}
            {:else}
              <button class="select-btn" on:click={() => { showBulkActions = true; }}>
                Select
              </button>
            {/if}
          </div>
        </div>

        {#if filteredRequests.length === 0}
          <div class="empty-requests">
            <div class="empty-icon"><FileText size={22} /></div>
            <div class="empty-text">No requests match the selected filter.</div>
          </div>
        {:else}
          <div class="requests-list">
            <!-- Select All Checkbox (for supervisor) -->
            {#if isSupervisor && showBulkActions}
              <div class="select-all-row" on:click={toggleSelectAll} role="button" tabindex="0">
                <input 
                  type="checkbox" 
                  bind:checked={selectAllChecked}
                  on:change={toggleSelectAll}
                  on:click={(e) => e.stopPropagation()}
                  class="select-all-checkbox"
                />
                <span>Select All</span>
              </div>
            {/if}

            {#each filteredRequests as request (request.id)}
              {@const statusMeta =
                STATUS_META[request.status] ?? STATUS_META.Pending}
              {@const statusTone = String(
                request.status || "Pending",
              ).toLowerCase()}
              <div
                id={`request-card-${request.id}`}
                class="request-card"
                class:request-card-focused={highlightedRequestId === request.id}
                class:request-card-pending={statusTone === "pending"}
                class:request-card-approved={statusTone === "approved"}
                class:request-card-rejected={statusTone === "rejected"}
                class:request-card-selected={selectedRequests.has(request.id)}
                on:click={() => { if (isSupervisor && showBulkActions) toggleRequestSelection(request.id); }}
                role={isSupervisor && showBulkActions ? "button" : "article"}
                tabindex={isSupervisor && showBulkActions ? 0 : -1}
              >
                {#if isSupervisor && showBulkActions}
                  <div class="request-card-checkbox">
                    <input 
                      type="checkbox" 
                      checked={selectedRequests.has(request.id)}
                      on:change={() => toggleRequestSelection(request.id)}
                      on:click={(e) => e.stopPropagation()}
                      class="request-checkbox"
                    />
                  </div>
                {/if}
                
                <div class="request-card-content">
                  <div class="request-card-header">
                  <div class="request-type-badge">
                    {#if request.requestType === "Overtime"}
                      <Clock3 size={14} /> Overtime
                    {:else}
                      <Calendar size={14} /> Absence
                    {/if}
                  </div>
                  <span class={statusMeta.badgeClass}>{request.status || "Pending"}</span>
                </div>

                <div class="request-card-dates">
                  <div class="date-row">
                    <span class="label">For:</span>
                    <span class="value">{formatDate(request.date)}</span>
                  </div>
                  {#if request.requestType === "Overtime" && request.total_hours}
                    <div class="date-row">
                      <span class="label">Duration:</span>
                      <span class="value">{request.total_hours}h</span>
                    </div>
                  {/if}
                  {#if request.created_at}
                    <div class="date-row">
                      <span class="label">Submitted:</span>
                      <span class="value"
                        >{formatCreatedDate(request.created_at)}</span
                      >
                    </div>
                  {/if}
                  {#if isSupervisor}
                    <div class="date-row">
                      <span class="label">Requester:</span>
                      <span class="value"
                        >{request.requester_name || "Unknown"}</span
                      >
                    </div>
                  {/if}
                </div>

                    {#if request.requestType === "Overtime" && request.total_hours}
                      <div class="req-meta-item">
                        <Timer size={13} />
                        <span class="label">Duration:</span>
                        <strong>{request.total_hours}h</strong>
                      </div>
                    {/if}

                    {#if request.created_at}
                      <div class="req-meta-item">
                        <Clock3 size={13} />
                        <span class="label">Submitted:</span>
                        <strong>{formatCreatedDate(request.created_at)}</strong>
                      </div>
                    {/if}

                    {#if isSupervisor}
                      <div class="req-meta-item">
                        <User size={13} />
                        <span class="label">Requester:</span>
                        <strong>{request.requester_name || "Unknown"}</strong>
                      </div>
                    {/if}
                  </div>

                  <div class="req-reason-block">
                    <div class="req-reason-label">Reason</div>
                    <p class="req-reason-text">{previewReason(request.reason)}</p>
                  </div>
                </div>

                <div class="req-card-footer">
                  {#if isSupervisor && request.status === "Pending"}
                    <button
                      class="action-btn approve"
                      on:click={() =>
                        updateRequestStatus(request.id, "Approved")}
                    >
                      <CheckCircle size={13} /> Approve
                    </button>
                    <button
                      class="btn-reject"
                      on:click={() => openRejectModal(request)}
                    >
                      <XCircle size={12} /> Reject
                    </button>
                  {:else if !isSupervisor && request.status === "Pending"}
                    <button
                      class="btn-edit"
                      on:click={() => editRequest(request)}
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      class="btn-delete"
                      on:click={() => openDeleteModal(request)}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  {/if}
                </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- Create Request Tab -->
  {#if activeTab === "create-request" && !isSupervisor}
    <div class="panel">
      <div class="form-panel">
        <div>
          <div class="form-title">Create Request</div>
          <div class="form-subtitle">
            Fill out the request details before submission.
          </div>
        </div>

        <!-- Request Type -->
        <div class="form-group">
          <div class="form-label">Request Type</div>
          <div class="type-toggle">
            <button
              class="type-btn"
              class:active={form.requestType === "Absence"}
              on:click={() => {
                form.requestType = "Absence";
                form.startTime = "";
                form.endTime = "";
              }}
            >
              <Calendar size={14} />
              Absence
            </button>
            <button
              class="type-btn"
              class:active={form.requestType === "Overtime"}
              on:click={() => {
                form.requestType = "Overtime";
              }}
            >
              <Clock3 size={14} />
              Overtime
            </button>
          </div>
        </div>

        <!-- Date -->
        <div class="form-group">
          <label class="form-label" for="request-date">Date</label>
          <input
            id="request-date"
            type="date"
            bind:value={form.date}
            min={minDate}
            class="form-input"
            placeholder="dd/mm/yyyy"
          />
        </div>

        <!-- Overtime-only fields -->
        {#if showOvertimeFields}
          <!-- Start / End Time -->
          <div class="row-2">
            <div class="form-group">
              <label class="form-label" for="request-start-time">Start Time</label>
              <input
                id="request-start-time"
                type="time"
                bind:value={form.startTime}
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label class="form-label" for="request-end-time">End Time</label>
              <input
                id="request-end-time"
                type="time"
                bind:value={form.endTime}
                class="form-input"
              />
            </div>
          </div>

          <!-- Lunch Break -->
          <div class="form-group">
            <label class="form-label" for="request-lunch-break">
              Lunch Break (minutes)
            </label>
            <input
              id="request-lunch-break"
              type="number"
              bind:value={form.lunchBreak}
              min="0"
              step="15"
              class="form-input lunch-input"
            />
          </div>

          {#if form.startTime && form.endTime && overtimeHours > 0}
            <div class="overtime-summary">
              Total Overtime Hours: <strong
                >{overtimeHours} hour{overtimeHours !== 1 ? "s" : ""}</strong
              >
              {#if Number(form.lunchBreak) > 0}
                <span class="hint">
                  (after deducting {Number(form.lunchBreak)} min lunch)</span
                >
              {/if}
            </div>
          {/if}
        {/if}

        <!-- Weekend warning -->
        {#if form.requestType === "Absence" && isWeekend && form.date}
          <div class="weekend-warning">
            <AlertTriangle size={14} />
            <span>
              This date is a weekend/day off. Absence requests cannot be
              submitted for weekends.
            </span>
          </div>
        {/if}

        <!-- Reason / Notes -->
        <div class="form-group">
          <label class="form-label" for="request-reason">Reason / Notes</label>
          <textarea
            id="request-reason"
            bind:value={form.reason}
            rows="5"
            class="form-textarea"
            placeholder="Provide the context for this request..."
          ></textarea>
        </div>

        {#if formError}
          <div class="alert-error">{formError}</div>
        {/if}

        <!-- Submit -->
        <div class="form-footer">
          <button
            class="btn-submit"
            on:click={submitRequest}
            disabled={isSubmitting || !isFormValid}
          >
            {#if isSubmitting}
              <span class="spinning-icon"><Loader2 size={14} /></span>
              Submitting...
            {:else}
              <Send size={14} />
              Submit Request
            {/if}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Delete Modal -->
  {#if showDeleteModal && requestToDelete}
    <div class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h2>Delete Request</h2>
          <button class="modal-close" on:click={closeDeleteModal}
            >&times;</button
          >
        </div>
        <div class="modal-body">
          <p>Are you sure you want to permanently delete this request?</p>
          <div class="modal-details">
            <div>
              <span>Type:</span>
              {requestToDelete.requestType || requestToDelete.request_type}
            </div>
            <div>
              <span>Date:</span>
              {new Date(
                requestToDelete.date || requestToDelete.request_date,
              ).toLocaleDateString()}
            </div>
            <div>
              <span>Status:</span>
              {requestToDelete.status || "Pending"}
            </div>
            {#if requestToDelete.reason}<div>
                <span>Reason:</span>
                {requestToDelete.reason}
              </div>{/if}
          </div>
          <p class="modal-id">
            Request ID: <code>{requestToDelete.request_id}</code>
          </p>
        </div>
        <div class="modal-footer">
          <button
            class="btn-secondary"
            on:click={closeDeleteModal}
            disabled={isDeleting}>Cancel</button
          >
          <button
            class="btn-danger"
            on:click={confirmDeleteRequest}
            disabled={isDeleting}
          >
            {#if isDeleting}<span class="spinning-icon"
                ><Loader2 size={14} /></span
              > Deleting...{:else}Delete Permanently{/if}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Reject Modal -->
  {#if showRejectModal && requestToReject}
    <div class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h2>Reject Request</h2>
          <button class="modal-close" on:click={closeRejectModal}
            >&times;</button
          >
        </div>
        <div class="modal-body">
          <p>Provide optional remarks for rejecting this request.</p>
          <div class="modal-details">
            <div>
              <span>Type:</span>
              {requestToReject.requestType || requestToReject.request_type}
            </div>
            <div>
              <span>Date:</span>
              {new Date(
                requestToReject.date || requestToReject.request_date,
              ).toLocaleDateString()}
            </div>
            <div>
              <span>Requester:</span>
              {requestToReject.requester_name || "Unknown"}
            </div>
          </div>
          <textarea
            bind:value={rejectionRemarks}
            rows="4"
            class="form-textarea"
            placeholder="Explain why this request is being rejected..."
          ></textarea>
          <p class="char-counter">{rejectionRemarks.length}/500 characters</p>
        </div>
        <div class="modal-footer">
          <button
            class="btn-secondary"
            on:click={closeRejectModal}
            disabled={isRejectingRequest}>Cancel</button
          >
          <button
            class="btn-warning"
            on:click={confirmRejectRequest}
            disabled={isRejectingRequest}
          >
            {#if isRejectingRequest}<span class="spinning-icon"
                ><Loader2 size={14} /></span
              > Rejecting...{:else}Confirm Rejection{/if}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Archive Modal -->
  {#if showArchiveModal && requestToArchive}
    <div class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h2>{requestToArchive.archived ? "Recover Request" : "Move to Trash"}</h2>
          <button class="modal-close" on:click={closeArchiveModal}
            >&times;</button
          >
        </div>
        <div class="modal-body">
          {#if requestToArchive.archived}
            <p>Are you sure you want to recover this request?</p>
            <p class="modal-subtitle">The request will be moved back to the active list.</p>
          {:else}
            <p>Are you sure you want to move this request to trash?</p>
            <p class="modal-subtitle">Trashed requests can be viewed in the Archive tab.</p>
          {/if}
          <div class="modal-details">
            <div>
              <span>Type:</span>
              {requestToArchive.requestType || requestToArchive.request_type}
            </div>
            <div>
              <span>Date:</span>
              {new Date(
                requestToArchive.date || requestToArchive.request_date,
              ).toLocaleDateString()}
            </div>
            <div>
              <span>Status:</span>
              {requestToArchive.status || "Pending"}
            </div>
            <div>
              <span>Requester:</span>
              {requestToArchive.requester_name || "Unknown"}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button
            class="btn-secondary"
            on:click={closeArchiveModal}
            disabled={isArchiving}>Cancel</button
          >
          <button
            class="btn-primary"
            on:click={confirmArchiveRequest}
            disabled={isArchiving}
          >
            {#if isArchiving}
              <span class="spinning-icon"><Loader2 size={14} /></span>
              {requestToArchive.archived ? "Recovering..." : "Moving..."}
            {:else}
              <Archive size={14} />
              <span>{requestToArchive.archived ? "Recover" : "Move to Trash"}</span>
            {/if}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Delete Archived Modal -->
  {#if showDeleteArchivedModal && requestToDeletePermanently}
    <div class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h2>Delete Request Permanently</h2>
          <button class="modal-close" on:click={closeDeleteArchivedModal}
            >&times;</button
          >
        </div>
        <div class="modal-body">
          <p class="warning-text">⚠️ This action cannot be undone.</p>
          <p>Are you sure you want to permanently delete this request from the database?</p>
          <div class="modal-details">
            <div>
              <span>Type:</span>
              {requestToDeletePermanently.requestType || requestToDeletePermanently.request_type}
            </div>
            <div>
              <span>Date:</span>
              {new Date(
                requestToDeletePermanently.date || requestToDeletePermanently.request_date,
              ).toLocaleDateString()}
            </div>
            <div>
              <span>Status:</span>
              {requestToDeletePermanently.status || "Pending"}
            </div>
            <div>
              <span>Requester:</span>
              {requestToDeletePermanently.requester_name || "Unknown"}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button
            class="btn-secondary"
            on:click={closeDeleteArchivedModal}
            disabled={isDeletingPermanently}>Cancel</button
          >
          <button
            class="btn-danger"
            on:click={confirmDeleteArchived}
            disabled={isDeletingPermanently}
          >
            {#if isDeletingPermanently}
              <span class="spinning-icon"><Loader2 size={14} /></span>
              Deleting...
            {:else}
              <Trash2 size={14} />
              <span>Delete Permanently</span>
            {/if}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Bulk Delete Confirmation Modal -->
  {#if showBulkDeleteModal}
    <div class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h2>Delete {selectedRequestsForArchive.size} Request(s) Permanently</h2>
          <button class="modal-close" on:click={() => (showBulkDeleteModal = false)}>
            &times;
          </button>
        </div>
        <div class="modal-body">
          <p class="warning-text">⚠️ This action cannot be undone.</p>
          <p>Are you sure you want to permanently delete {selectedRequestsForArchive.size} request(s) from the database?</p>
        </div>
        <div class="modal-footer">
          <button
            class="btn-secondary"
            on:click={() => (showBulkDeleteModal = false)}
            disabled={isBulkDeleting}>Cancel</button
          >
          <button
            class="btn-danger"
            on:click={confirmBulkDeleteRequests}
            disabled={isBulkDeleting}
          >
            {#if isBulkDeleting}
              <span class="spinning-icon"><Loader2 size={14} /></span>
              Deleting...
            {:else}
              <Trash2 size={14} />
              <span>Delete Permanently</span>
            {/if}
          </button>
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  /* ========== DESIGN TOKENS ========== */
  :root {
    --bg: #f0f4f8;
    --surface: #ffffff;
    --surface2: #f8fafc;
    --surface3: #f1f5f9;
    --border: #e2e8f0;
    --border2: #cbd5e1;
    --accent: #2563eb;
    --accent2: #3b82f6;
    --accent-glow: #2563eb20;
    --green: #16a34a;
    --green-dim: #16a34a18;
    --amber: #d97706;
    --amber-dim: #d9770618;
    --red: #dc2626;
    --red-dim: #dc262618;
    --purple: #7c3aed;
    --purple-dim: #7c3aed18;
    --text: #0f172a;
    --text2: #64748b;
    --text3: #94a3b8;
    --radius: 14px;
    --radius-sm: 8px;
    --shadow-sm: 0 1px 3px #0000000d, 0 1px 2px #00000008;
    --shadow: 0 4px 16px #0000001a;
    --input-bg: #f8fafc;
  }

  :global(body.dark) {
    --bg: #0d1117;
    --surface: #161c27;
    --surface2: #1e2736;
    --surface3: #242f42;
    --border: #ffffff0f;
    --border2: #ffffff1a;
    --accent: #3b82f6;
    --accent2: #60a5fa;
    --accent-glow: #3b82f630;
    --green: #22c55e;
    --green-dim: #22c55e22;
    --amber: #f59e0b;
    --amber-dim: #f59e0b18;
    --red: #ef4444;
    --red-dim: #ef444418;
    --purple: #a78bfa;
    --purple-dim: #a78bfa18;
    --text: #f1f5f9;
    --text2: #94a3b8;
    --text3: #4b5563;
    --shadow-sm: 0 1px 3px #00000030;
    --shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
    --input-bg: #1e2736;
  }

  /* ========== WRAPPER ========== */
  .requests-modern {
    font-family:
      "DM Sans",
      system-ui,
      -apple-system,
      sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 100vh;
    transition:
      background 0.2s,
      color 0.2s;
  }

  /* ========== STAT CARDS ========== */
  .stat-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    box-shadow: var(--shadow-sm);
    transition:
      box-shadow 0.2s,
      transform 0.2s;
    position: relative;
    overflow: hidden;
  }
  .stat-card:hover {
    box-shadow: var(--shadow);
    transform: translateY(-2px);
  }
  .stat-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .stat-icon {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .stat-icon.blue {
    background: var(--accent-glow);
    color: var(--accent2);
  }
  .stat-icon.amber {
    background: var(--amber-dim);
    color: var(--amber);
  }
  .stat-icon.green {
    background: var(--green-dim);
    color: var(--green);
  }
  .stat-value {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.4px;
    line-height: 1;
  }
  .stat-label {
    font-size: 11px;
    color: var(--text2);
    margin-top: 2px;
    font-weight: 500;
  }

  /* ========== TAB ROW ========== */
  .tab-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tab-btn {
    padding: 8px 18px;
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text2);
  }
  .tab-btn:hover {
    background: var(--surface2);
    color: var(--text);
  }
  .tab-btn.active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }

  /* ========== PANEL ========== */
  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
  }

  .requests-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* ========== EMPTY STATE ========== */
  .empty-requests {
    border: 1.5px dashed var(--border2);
    border-radius: var(--radius);
    padding: 40px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: var(--surface);
  }
  .empty-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: var(--surface2);
    border: 1px solid var(--border);
    display: grid;
    place-items: center;
    color: var(--text3);
  }
  .empty-text {
    font-size: 14px;
    font-weight: 600;
    color: var(--text2);
  }
  .empty-sub {
    font-size: 12.5px;
    color: var(--text3);
    text-align: center;
  }

  /* ========== FILTER ROW ========== */
  .filter-row {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 0;
    margin-bottom: 16px;
  }
  
  .filter-chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }
  
  .filter-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 40px;
    font-family: inherit;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.18s;
    border: 1px solid var(--border2);
    background: transparent;
    color: var(--text2);
  }
  .filter-pill:hover {
    background: var(--surface2);
    color: var(--text);
  }
  .filter-pill.active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  
  .select-btn {
    padding: 6px 14px;
    border-radius: 30px;
    background: var(--surface2);
    border: 1px solid var(--border);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    color: var(--text2);
    white-space: nowrap;
  }
  .select-btn:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  /* ========== REQUEST CARDS ========== */
  .requests-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .req-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
    cursor: default;
  }
  .request-card[role="button"] {
    cursor: pointer;
  }
  .request-card[role="button"]:hover {
    background: rgba(59, 130, 246, 0.04);
  }
  .request-card::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 3px;
    background: var(--accent);
  }
  .request-card-pending::before {
    background: var(--amber);
  }
  .request-card-approved::before {
    background: var(--green);
  }
  .request-card-rejected::before {
    background: var(--red);
  }
  .request-card-selected {
    background: rgba(59, 130, 246, 0.08);
    border-color: #3b82f6;
    border-left: 4px solid #3b82f6;
  }
  .request-card-selected::before {
    background: transparent;
  }
  .request-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow);
    transform: translateY(-1px);
  }
  .request-card-focused {
    border-color: var(--accent2);
    box-shadow: 0 0 0 3px var(--accent-glow);
  }
  .request-card-content {
    margin-left: 0;
    transition: margin-left 0.2s;
  }
  .request-card[role="button"] .request-card-content {
    margin-left: 28px;
  }
  .request-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 18px 10px;
    border-bottom: 1px solid var(--border);
  }
  .req-type-badge {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 14px;
    font-weight: 700;
    color: var(--text2);
  }
  .request-card-dates {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .req-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
  }
  .req-meta-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13.5px;
    color: var(--text2);
  }
  .req-meta-item :global(svg) {
    color: var(--text3);
    flex-shrink: 0;
  }
  .req-meta-item strong {
    color: var(--text);
    font-weight: 700;
  }
  .req-meta-item .label {
    color: var(--text3);
    font-size: 12.5px;
  }
  .req-reason-block {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px 14px;
  }
  .req-reason-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text3);
    margin-bottom: 4px;
  }
  .req-reason-text {
    font-size: 14px;
    color: var(--text2);
    line-height: 1.5;
  }
  .req-card-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 0 18px 14px;
  }

  .btn-edit,
  .btn-delete,
  .btn-approve,
  .btn-reject {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 15px;
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 700;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }
  .btn-edit,
  .btn-approve {
    background: var(--accent);
    color: #fff;
    box-shadow: 0 2px 6px var(--accent-glow);
  }
  .action-btn.reject {
    background: var(--red);
    color: #fff;
    box-shadow: 0 2px 6px var(--red-dim);
  }
  .action-btn.edit {
    background: var(--accent);
    color: white;
  }
  .btn-edit :global(svg),
  .btn-delete :global(svg),
  .btn-approve :global(svg),
  .btn-reject :global(svg) {
    flex-shrink: 0;
  }

  /* ========== STATUS BADGES ========== */
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 11px;
    border-radius: 40px;
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .status-badge::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .status-badge.pending {
    background: var(--amber-dim);
    color: var(--amber);
  }
  .status-badge.pending::before {
    background: var(--amber);
  }
  .status-badge.approved {
    background: var(--green-dim);
    color: var(--green);
  }
  .status-badge.approved::before {
    background: var(--green);
  }
  .status-badge.rejected {
    background: var(--red-dim);
    color: var(--red);
  }
  .status-badge.rejected::before {
    background: var(--red);
  }

  /* ========== FORM PANEL ========== */
  .form-panel {
    padding: 26px 28px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .form-title {
    font-size: 16px;
    font-weight: 700;
  }
  .form-subtitle {
    font-size: 12.5px;
    color: var(--text2);
    margin-top: 2px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .form-label {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text2);
  }

  /* Type toggle */
  .type-toggle {
    display: flex;
    gap: 6px;
  }
  .type-btn {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid var(--border2);
    background: transparent;
    color: var(--text2);
  }
  .type-btn :global(svg) {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }
  .type-btn:hover {
    background: var(--surface2);
    color: var(--text);
  }
  .type-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  /* Inputs */
  .form-input,
  .form-textarea {
    background: var(--input-bg);
    border: 1px solid var(--border2);
    border-radius: var(--radius-sm);
    padding: 10px 14px;
    font-family: "DM Mono", monospace;
    font-size: 14px;
    color: var(--text);
    width: 100%;
    outline: none;
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
  }
  .form-input:focus,
  .form-textarea:focus {
    border-color: var(--accent2);
    box-shadow: 0 0 0 3px var(--accent-glow);
  }
  .form-input::placeholder,
  .form-textarea::placeholder {
    color: var(--text3);
    font-family: "DM Sans", sans-serif;
  }
  .form-textarea {
    resize: vertical;
    min-height: 110px;
    font-family: "DM Sans", sans-serif;
    font-size: 14px;
  }
  .lunch-input {
    max-width: 400px;
  }

  /* Start / End time row */
  .row-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  /* Overtime summary */
  .overtime-summary {
    background: var(--surface2);
    border-radius: var(--radius-sm);
    padding: 12px;
    font-size: 13px;
    color: var(--text);
  }
  .hint {
    color: var(--text2);
  }

  /* Weekend warning */
  .weekend-warning {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: var(--amber-dim);
    border: 1px solid var(--amber);
    border-radius: var(--radius-sm);
    padding: 12px;
    font-size: 13px;
    color: var(--amber);
  }
  .weekend-warning :global(svg) {
    flex-shrink: 0;
    margin-top: 1px;
  }

  /* Submit footer */
  .form-footer {
    display: flex;
    justify-content: flex-end;
    padding-top: 4px;
  }
  .btn-submit {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 22px;
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: #fff;
    font-family: inherit;
    font-size: 14.5px;
    font-weight: 700;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 2px 8px var(--accent-glow);
  }
  .btn-submit:hover:not(:disabled) {
    background: var(--accent2);
    transform: translateY(-1px);
    box-shadow: 0 4px 14px var(--accent-glow);
  }
  .btn-submit:active {
    transform: translateY(0);
  }
  .btn-submit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* ========== ALERTS ========== */
  .alert-success {
    background: var(--green-dim);
    border: 1px solid var(--green);
    border-radius: var(--radius-sm);
    padding: 12px;
    color: var(--green);
  }
  .alert-error {
    background: var(--red-dim);
    border: 1px solid var(--red);
    border-radius: var(--radius-sm);
    padding: 12px;
    color: var(--red);
  }

  /* ========== MODALS ========== */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .modal-container {
    background: var(--surface);
    border-radius: var(--radius);
    width: 90%;
    max-width: 480px;
    box-shadow: var(--shadow);
    border: 1px solid var(--border);
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }
  .modal-header h2 {
    font-size: 18px;
    font-weight: 700;
  }
  .modal-close {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: var(--text2);
    line-height: 1;
  }
  .modal-body {
    padding: 20px;
  }
  .modal-details {
    background: var(--surface2);
    border-radius: var(--radius-sm);
    padding: 12px;
    margin: 16px 0;
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .modal-details span {
    font-weight: 600;
    color: var(--text2);
    margin-right: 8px;
  }
  .modal-id {
    font-size: 11px;
    color: var(--text3);
    margin-top: 12px;
  }
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 20px;
    border-top: 1px solid var(--border);
  }
  .btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--surface2);
    border: 1px solid var(--border);
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    color: var(--text);
  }
  .btn-danger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--red);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
  }
  .btn-warning {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--amber);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--primary);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
  }

  .btn-primary:hover {
    background: var(--primary-hover);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-danger:disabled,
  .btn-warning:disabled,
  .btn-secondary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Spinner */
  .spinning-icon {
    display: inline-flex;
    animation: spin 1s linear infinite;
  }
  .spin {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* Char counter */
  .char-counter {
    font-size: 11px;
    color: var(--text3);
    margin-top: 4px;
    text-align: right;
  }

  /* Bulk Action Buttons */
  .bulk-action-buttons {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: flex-end;
  }

  .cancel-btn {
    padding: 6px 14px;
    border-radius: 30px;
    background: var(--surface2);
    border: 1px solid var(--border);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    color: var(--text2);
    white-space: nowrap;
  }
  .cancel-btn:hover {
    background: var(--surface3);
    border-color: var(--border2);
  }

  .archive-btn {
    padding: 6px 14px;
    border-radius: 30px;
    background: #3b82f6;
    border: 1px solid #3b82f6;
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    color: white;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .archive-btn:hover:not(:disabled) {
    background: #2563eb;
    border-color: #2563eb;
  }
  .archive-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .recover-btn {
    padding: 6px 14px;
    border-radius: 30px;
    background: var(--green);
    border: 1px solid var(--green);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    color: white;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .recover-btn:hover:not(:disabled) {
    opacity: 0.9;
  }
  .recover-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .recover-btn {
    background: var(--green);
    color: white;
  }

  .recover-btn:hover {
    opacity: 0.9;
  }

  .delete-btn {
    background: var(--red);
    color: white;
  }

  .delete-btn:hover {
    opacity: 0.9;
  }

  /* Select All Row */
  .select-all-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--surface2);
    border-radius: var(--radius-sm);
    margin-bottom: 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text2);
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;
  }
  .select-all-row:hover {
    background: var(--surface3);
    color: var(--text);
  }
  .select-all-row[role="button"]:focus {
    outline: 2px solid var(--accent2);
    outline-offset: 2px;
  }
  /* Request Card Checkbox */
  .request-card-checkbox {
    display: flex;
    align-items: center;
    padding-right: 8px;
    position: absolute;
    left: 12px;
    top: 16px;
    z-index: 10;
  }

  .request-checkbox {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: #3b82f6;
  }

  .select-all-checkbox {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: #3b82f6;
  }

  /* Color variables for bulk buttons */
  :root {
    --blue: #3b82f6;
  }

  :global(.dark) {
    --blue: #3b82f6;
  }

  /* ========== RESPONSIVE ========== */
  @media (max-width: 640px) {
    .stat-cards {
      gap: 8px;
    }
    .stat-value {
      font-size: 18px;
    }
    .row-2 {
      grid-template-columns: 1fr;
    }
    .form-panel {
      padding: 16px;
    }
    .requests-modern {
      padding: 12px;
    }
  }
</style>
