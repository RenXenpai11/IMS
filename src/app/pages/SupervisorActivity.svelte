<script>
  // @ts-nocheck
  import { onDestroy, onMount } from 'svelte';
  import { Users, Clock3, CheckCircle, AlertCircle } from 'lucide-svelte';

  export let currentUser = null;

  let kpis = {
    today_logs: 0,
    pending_approvals: 0,
    active_interns: 0,
    overdue_tasks: 0
  };
  let recentActivities = [];
  let workLogs = [];
  let progress = [];
  let alerts = {
    missing_notes: 0,
    no_attachments: 0,
    overdue_tasks: 0
  };
  let students = [];
  let selectedStudentId = 'all';
  let selectedInternId = '';
  let selectedStatus = 'all';
  let searchTerm = '';
  let isLoading = false;
  let loadError = '';
  let showAddTask = false;
  let newTaskTitle = '';
  let newTaskDescription = '';
  let newTaskDueDate = '';
  let newTaskAssignees = [];
  let isCreatingTask = false;
  let refreshIntervalId;
  let now = new Date();

  function updateNow() {
    now = new Date();
  }

  function formatRelativeTime(timestamp) {
    const activityDate = new Date(timestamp);
    const diffMs = now - activityDate;
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes === 1) return '1 minute ago';
    if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return activityDate.toLocaleDateString();
  }

  function callSupervisorOverview(payload) {
    return new Promise((resolve, reject) => {
      const run = globalThis?.google?.script?.run;
      if (!run) {
        reject(new Error('Apps Script runtime is not available in this view.'));
        return;
      }

      run
        .withSuccessHandler(resolve)
        .withFailureHandler((error) => {
          reject(new Error(error?.message || String(error)));
        })
        .getSupervisorActivityOverview(payload);
    });
  }

  function callUpdateWorklogStatus(payload) {
    return new Promise((resolve, reject) => {
      const run = globalThis?.google?.script?.run;
      if (!run) {
        reject(new Error('Apps Script runtime is not available in this view.'));
        return;
      }

      run
        .withSuccessHandler(resolve)
        .withFailureHandler((error) => {
          reject(new Error(error?.message || String(error)));
        })
        .updateWorklogStatus(payload);
    });
  }

  function callExportWorklogsCsv(payload) {
    return new Promise((resolve, reject) => {
      const run = globalThis?.google?.script?.run;
      if (!run) {
        reject(new Error('Apps Script runtime is not available in this view.'));
        return;
      }

      run
        .withSuccessHandler(resolve)
        .withFailureHandler((error) => {
          reject(new Error(error?.message || String(error)));
        })
        .getSupervisorWorklogsCsv(payload);
    });
  }

  function callGetAllStudents(payload) {
    return new Promise((resolve, reject) => {
      const run = globalThis?.google?.script?.run;
      if (!run) {
        reject(new Error('Apps Script runtime is not available in this view.'));
        return;
      }

      run
        .withSuccessHandler(resolve)
        .withFailureHandler((error) => {
          reject(new Error(error?.message || String(error)));
        })
        .getAllStudents(payload);
    });
  }

  function callCreateSupervisorTasks(payload) {
    return new Promise((resolve, reject) => {
      const run = globalThis?.google?.script?.run;
      if (!run) {
        reject(new Error('Apps Script runtime is not available in this view.'));
        return;
      }

      run
        .withSuccessHandler(resolve)
        .withFailureHandler((error) => {
          reject(new Error(error?.message || String(error)));
        })
        .createSupervisorTasks(payload);
    });
  }

  async function refreshOverview() {
    if (!currentUser?.user_id) {
      loadError = 'Unable to load supervisor data.';
      return;
    }

    isLoading = true;
    loadError = '';

    try {
      const result = await callSupervisorOverview({ supervisor_user_id: currentUser.user_id });
      if (!result?.ok) {
        throw new Error(result?.error || 'Unable to load supervisor overview.');
      }

      kpis = result.kpis || kpis;
      recentActivities = Array.isArray(result.recent_activities) ? result.recent_activities : [];
      workLogs = Array.isArray(result.worklogs) ? result.worklogs : [];
      progress = Array.isArray(result.progress) ? result.progress : [];
      alerts = result.alerts || alerts;
      students = Array.isArray(result.students) ? result.students : [];
    } catch (error) {
      loadError = error?.message || 'Unable to load supervisor overview.';
    } finally {
      isLoading = false;
    }
  }

  async function handleWorklogStatus(taskId, status) {
    if (!taskId) return;
    try {
      await callUpdateWorklogStatus({
        task_id: taskId,
        status,
        updated_by: currentUser?.user_id || ''
      });
      await refreshOverview();
    } catch (error) {
      loadError = error?.message || 'Unable to update work log.';
    }
  }

  async function handleExportCsv() {
    if (!currentUser?.user_id) {
      loadError = 'Unable to export work logs.';
      return;
    }

    try {
      const result = await callExportWorklogsCsv({ supervisor_user_id: currentUser.user_id });
      if (!result?.ok) {
        throw new Error(result?.error || 'Unable to export work logs.');
      }

      const blob = new Blob([result.csv || ''], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'worklogs.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      loadError = error?.message || 'Unable to export work logs.';
    }
  }

  $: filteredWorkLogs = workLogs.filter((log) => {
    const matchesStudent = selectedStudentId === 'all' || String(log.user_id || '') === selectedStudentId;
    const matchesStatus = selectedStatus === 'all' || String(log.status || '').toLowerCase() === selectedStatus;
    const query = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !query ||
      String(log.task || '').toLowerCase().includes(query) ||
      String(log.notes || '').toLowerCase().includes(query) ||
      String(log.learnings || '').toLowerCase().includes(query) ||
      String(log.user_name || '').toLowerCase().includes(query);
    return matchesStudent && matchesStatus && matchesSearch;
  });

  $: selectedIntern = students.find((student) => String(student.user_id || '') === String(selectedInternId || ''));
  $: selectedInternLogs = workLogs.filter((log) => String(log.user_id || '') === String(selectedInternId || ''));

  onMount(() => {
    (async () => {
      await refreshOverview();
      try {
        const list = await callGetAllStudents();
        if (list && list.ok && Array.isArray(list.students)) {
          // map to expected shape (user_id, full_name)
          students = list.students.map((s) => ({ user_id: String(s.user_id || ''), full_name: String(s.full_name || '') }));
        }
      } catch (e) {
        // non-fatal: keep students from overview
      }
    })();
    refreshIntervalId = setInterval(() => {
      updateNow();
      refreshOverview();
    }, 15000);
  });

  onDestroy(() => {
    clearInterval(refreshIntervalId);
  });

  async function submitNewTask() {
    if (!newTaskTitle.trim() || newTaskAssignees.length === 0) return;
    isCreatingTask = true;
    try {
      const payload = {
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim(),
        due_date: newTaskDueDate || '',
        supervisor_user_id: currentUser?.user_id || '',
        assigned_student_ids: newTaskAssignees
      };
      const res = await callCreateSupervisorTasks(payload);
      if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Unable to create tasks.');
      // reset
      newTaskTitle = '';
      newTaskDescription = '';
      newTaskDueDate = '';
      newTaskAssignees = [];
      showAddTask = false;
      await refreshOverview();
    } catch (err) {
      loadError = err?.message || 'Unable to create tasks.';
    } finally {
      isCreatingTask = false;
    }
  }
</script>

<div class="supervisor-activity">

  {#if loadError}
    <div class="banner error">{loadError}</div>
  {:else if isLoading}
    <div class="banner">Loading supervisor overview...</div>
  {/if}

  <section class="kpi-grid">
    <div class="kpi-card">
      <span class="kpi-label">Today logs</span>
      <div class="kpi-row">
        <span class="kpi-value">{kpis.today_logs}</span>
      </div>
    </div>
    <div class="kpi-card">
      <span class="kpi-label">Pending approvals</span>
      <div class="kpi-row">
        <span class="kpi-value">{kpis.pending_approvals}</span>
      </div>
    </div>
    <div class="kpi-card">
      <span class="kpi-label">Active interns</span>
      <div class="kpi-row">
        <span class="kpi-value">{kpis.active_interns}</span>
      </div>
    </div>
    <div class="kpi-card">
      <span class="kpi-label">Overdue tasks</span>
      <div class="kpi-row">
        <span class="kpi-value">{kpis.overdue_tasks}</span>
      </div>
    </div>
  </section>

  <!-- Task creation / quick panel -->
  <section class="card quick-panel">
    <div class="quick-head">
      <div class="view-controls">
        <button class="btn btn-ghost">Overview</button>
        <button class="btn btn-ghost">List</button>
        <button class="btn btn-ghost">Archive</button>
      </div>

      <div class="quick-actions">
        <input class="search-input" type="text" placeholder="Search" bind:value={searchTerm} />
        <select bind:value={selectedStatus}>
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="overdue">Overdue</option>
          <option value="in progress">In Progress</option>
          <option value="pending">Pending</option>
        </select>
        <button class="primary" on:click={() => showAddTask = true}>+ Add Task</button>
      </div>
    </div>
  </section>

  {#if showAddTask}
    <button type="button" class="modal-backdrop" aria-label="Close dialog" on:click={() => showAddTask = false}></button>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Add task dialog">
      <h3>Add Task</h3>
      <label for="task-title">Title</label>
      <input id="task-title" type="text" bind:value={newTaskTitle} />

      <label for="task-desc">Description</label>
      <textarea id="task-desc" rows="4" bind:value={newTaskDescription}></textarea>

      <label for="task-due">Due date</label>
      <input id="task-due" type="date" bind:value={newTaskDueDate} />

      <label for="task-assignees">Assign to interns (multi-select)</label>
      <select id="task-assignees" multiple size="6" bind:value={newTaskAssignees}>
        {#each students as s}
          <option value={s.user_id}>{s.full_name}</option>
        {/each}
      </select>

      <div class="modal-actions">
        <button class="ghost" type="button" on:click={() => showAddTask = false}>Cancel</button>
        <button class="primary" type="button" on:click={submitNewTask} disabled={isCreatingTask}>Assign</button>
      </div>
    </div>
  {/if}

  <section class="grid-two">
    <div class="panel">
      <div class="panel-head">
        <div>
          <h3>Recent activity</h3>
          <p class="muted">Latest actions across interns</p>
        </div>
        <span class="pill">Live</span>
      </div>
      <div class="activity-scroll">
        {#if recentActivities.length === 0}
          <p class="empty">No recent activity yet.</p>
        {:else}
          <ul>
            {#each recentActivities as activity}
              <li>
                <span class="dot"></span>
                <div>
                  <p class="activity-text"><em>{activity.message}, {formatRelativeTime(activity.timestamp)}.</em></p>
                  <span class="activity-time">{activity.user || 'Unknown user'}</span>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h3>Alerts and flags</h3>
          <p class="muted">Items needing attention</p>
        </div>
      </div>
      <div class="alert-stack">
        <div class="alert-card">
          <strong>Missing notes</strong>
          <span>{alerts.missing_notes} logs need notes or learnings</span>
        </div>
        <div class="alert-card">
          <strong>Overdue tasks</strong>
          <span>{alerts.overdue_tasks} tasks past due date</span>
        </div>
        <div class="alert-card">
          <strong>No attachments</strong>
          <span>{alerts.no_attachments} logs without evidence</span>
        </div>
      </div>
    </div>
  </section>

  <section class="grid-two">
    <div class="panel">
      <div class="panel-head">
        <div>
          <h3>Intern work logs</h3>
          <p class="muted">Review and approve submitted logs</p>
        </div>
        <div class="filters">
          <select bind:value={selectedStudentId}>
            <option value="all">All interns</option>
            {#each students as student}
              <option value={student.user_id}>{student.full_name}</option>
            {/each}
          </select>
          <select bind:value={selectedStatus}>
            <option value="all">All status</option>
            <option value="completed">Completed</option>
            <option value="overdue">Overdue</option>
            <option value="in progress">In Progress</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>
      <div class="log-list">
        {#if filteredWorkLogs.length === 0}
          <p class="empty">No work logs found.</p>
        {:else}
          {#each filteredWorkLogs as log}
            <div class="log-card">
              <div class="log-meta">
                <div>
                  <h4>{log.task}</h4>
                  <span>{log.user_name || 'Unknown'} · {log.date}</span>
                </div>
                <span class={`status-pill ${String(log.status || '').toLowerCase() === 'approved' ? 'approved' : String(log.status || '').toLowerCase() === 'needs review' ? 'review' : 'pending'}`}>{log.status}</span>
              </div>
              <p>{log.notes || log.learnings || 'No notes provided.'}</p>
              <div class="log-foot">
                <span>{log.attachments?.length || 0} attachments</span>
                <div class="log-actions">
                  <button class="ghost" on:click={() => selectedInternId = log.user_id}>View intern</button>
                  <button class="ghost" on:click={() => handleWorklogStatus(log.task_id, 'Needs Review')} disabled={isLoading}>Request edit</button>
                  <button class="primary" on:click={() => handleWorklogStatus(log.task_id, 'Approved')} disabled={isLoading}>Approve</button>
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h3>Progress by intern</h3>
          <p class="muted">Task completion snapshot</p>
        </div>
      </div>
      <div class="progress-list">
        {#if progress.length === 0}
          <p class="empty">No progress data yet.</p>
        {:else}
          {#each progress as item}
            <div class="progress-row">
              <div class="progress-meta">
                <strong>{item.name}</strong>
                <span>{item.status}</span>
              </div>
              <div class="progress-bar">
                <span style={`width: ${item.percent}%`}></span>
              </div>
              <span class="progress-value">{item.percent}%</span>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </section>

  <section class="panel intern-panel">
    <div class="panel-head">
      <div>
        <h3>Intern detail</h3>
        <p class="muted">Drill down into a specific intern</p>
      </div>
      <div class="filters">
        <select bind:value={selectedInternId}>
          <option value="">Select intern</option>
          {#each students as student}
            <option value={student.user_id}>{student.full_name}</option>
          {/each}
        </select>
      </div>
    </div>

    {#if !selectedIntern}
      <p class="empty">Pick an intern to view details.</p>
    {:else}
      <div class="intern-grid">
        <article class="intern-card">
          <header class="intern-head">
            <div class="intern-title">
              <p class="intern-name">{selectedIntern.full_name}</p>
              <p class="intern-meta">{selectedIntern.email}</p>
            </div>
            <div class="pill tone-muted">Intern</div>
          </header>

          <div class="intern-body">
            <div class="intern-row">
              <span class="row-label">Department</span>
              <span class="row-value">{selectedIntern.department || 'No department'}</span>
            </div>
            <div class="intern-row">
              <span class="row-label">Required</span>
              <span class="row-value">{selectedIntern.required_hours || 0}h</span>
            </div>
            <div class="intern-row">
              <span class="row-label">Completed</span>
              <span class="row-value">{selectedIntern.completed_hours || 0}h</span>
            </div>
            <div class="intern-row">
              <span class="row-label">Remaining</span>
              <span class="row-value">{selectedIntern.remaining_hours || 0}h</span>
            </div>
          </div>
        </article>

        <article class="intern-card">
          <h4 style="margin:0 0 0.6rem 0">Recent work logs</h4>
          {#if selectedInternLogs.length === 0}
            <p class="empty">No logs yet.</p>
          {:else}
            <ul class="intern-log-list">
              {#each selectedInternLogs.slice(0, 5) as log}
                <li style="margin-bottom:0.6rem;">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:0.6rem;">
                    <strong style="margin:0">{log.task}</strong>
                    <span class="row-value" style="font-size:0.85rem">{log.date} · {log.status}</span>
                  </div>
                  {#if log.notes}
                    <p class="muted" style="margin:0.25rem 0 0">{log.notes}</p>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </article>
      </div>
    {/if}
  </section>
</div>

<style>
  :root {
    --ink: var(--color-text, #0f172a);
    --muted: var(--color-muted, #5b677a);
    --border: var(--color-border, #d7e3f1);
    --surface: var(--color-surface, #ffffff);
    --soft: var(--color-soft, #f4f7fb);
    --accent: var(--color-accent, #0f6cbd);
    --accent-dark: #0a4a8f;
    --shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  }

  .supervisor-activity {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    color: var(--ink);
  }

  /* header removed: styles intentionally omitted to keep layout compact */

  button {
    border-radius: 999px;
    border: none;
    padding: 0.5rem 1.2rem;
    font-weight: 600;
    cursor: pointer;
  }

  button.ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
  }

  button.primary {
    background: var(--accent);
    color: #fff;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
  }

  .kpi-card {
    background: var(--surface);
    border-radius: 1rem;
    border: 1px solid var(--border);
    padding: 1rem 1.2rem;
    box-shadow: var(--shadow);
  }

  .kpi-label {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .kpi-row {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    margin-top: 0.4rem;
  }

  .kpi-value {
    font-size: 1.5rem;
    font-weight: 700;
  }

  .kpi-trend {
    font-size: 0.85rem;
    color: var(--accent-dark);
    background: rgba(15, 108, 189, 0.12);
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
  }

  .grid-two {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 1.2rem;
  }

  .panel {
    background: var(--surface);
    border-radius: 1.2rem;
    border: 1px solid var(--border);
    padding: 1.2rem;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .panel-head h3 {
    margin: 0;
    font-size: 1.1rem;
  }

  .muted {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 0.2rem 0 0;
  }

  .pill {
    background: rgba(15, 108, 189, 0.12);
    color: var(--accent-dark);
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .activity-scroll {
    max-height: 240px;
    overflow-y: auto;
  }

  .banner {
    padding: 0.7rem 1rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
  }

  .banner.error {
    background: rgba(220, 38, 38, 0.08);
    border-color: rgba(220, 38, 38, 0.3);
    color: #b91c1c;
  }

  .empty {
    color: var(--muted);
    font-size: 0.9rem;
    margin: 0;
  }

  .activity-scroll ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .activity-scroll li {
    display: flex;
    gap: 0.8rem;
    padding: 0.6rem 0;
    border-bottom: 1px dashed rgba(15, 23, 42, 0.08);
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
    margin-top: 0.35rem;
  }

  .activity-text {
    margin: 0;
    font-size: 0.9rem;
  }

  .activity-time {
    font-size: 0.78rem;
    color: var(--muted);
  }

  .alert-stack {
    display: grid;
    gap: 0.8rem;
  }

  .alert-card {
    background: #fff6e8;
    border: 1px solid #f4d7a8;
    border-radius: 0.9rem;
    padding: 0.9rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .filters {
    display: flex;
    gap: 0.6rem;
  }

  select {
    padding: 0.4rem 0.7rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border);
    background: var(--soft);
  }

  .log-list {
    display: grid;
    gap: 0.9rem;
  }

  .log-card {
    border: 1px solid var(--border);
    border-radius: 0.9rem;
    padding: 0.9rem 1rem;
    background: #fff;
  }

  .log-card h4 {
    margin: 0;
  }

  .log-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .status-pill {
    padding: 0.2rem 0.7rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .status-pill.pending {
    background: #fff3cd;
    color: #8b6a00;
  }

  .status-pill.approved {
    background: #e3f7e8;
    color: #1f7a3a;
  }

  .status-pill.review {
    background: #fee2e2;
    color: #b91c1c;
  }

  .log-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.6rem;
  }

  .log-actions {
    display: flex;
    gap: 0.5rem;
  }

  .progress-list {
    display: grid;
    gap: 1rem;
  }

  .progress-row {
    display: grid;
    gap: 0.4rem;
  }

  .progress-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .progress-bar {
    height: 8px;
    border-radius: 999px;
    background: #eef2f7;
    overflow: hidden;
  }

  .progress-bar span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #0f6cbd, #3b82f6);
  }

  .progress-value {
    font-size: 0.8rem;
    color: var(--muted);
  }

  /* Intern card styles (match supervisor overview) */
  .intern-grid {
    display: grid;
    gap: 1rem;
  }

  @media (min-width: 720px) {
    .intern-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .intern-card {
    border: 1px solid var(--border);
    background: var(--surface-soft, #f9fbff);
    border-radius: 1rem;
    padding: 1rem;
  }

  .intern-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.85rem;
  }

  .intern-title { min-width: 0; }

  .intern-name {
    margin: 0;
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--ink);
  }

  .intern-meta { margin: 0.25rem 0 0; color: var(--muted); font-size:0.9rem }

  .intern-body { display: grid; gap: 0.5rem }

  .intern-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.9rem;
  }

  .row-label { color: var(--muted); font-weight: 600 }
  .row-value { color: var(--ink); font-weight: 700 }

  .pill { display:inline-flex; align-items:center; justify-content:center; border-radius:9999px; padding:0.25rem 0.65rem; font-size:0.7rem; font-weight:800 }
  .tone-muted { background: rgba(148,163,184,0.18); color:#475569; border:1px solid rgba(148,163,184,0.26) }

  /* Quick panel */
  .quick-panel { background: linear-gradient(180deg, var(--surface) 0%, var(--surface-soft, #f9fbff) 100%); padding: 0.8rem 1rem; border-radius: 1rem; border: 1px solid var(--border); display:flex; align-items:center; justify-content:space-between }
  .quick-head { display:flex; align-items:center; justify-content:space-between; width:100%; gap:1rem }
  .view-controls .btn { margin-right:0.5rem; border-radius:0.6rem; padding:0.45rem 0.8rem; background:transparent; border:1px solid var(--border) }
  .quick-actions { display:flex; gap:0.6rem; align-items:center }
  .search-input { padding:0.45rem 0.8rem; border-radius:999px; border:1px solid var(--border); background:var(--soft); min-width:220px }

  /* Modal */
  .modal-backdrop { position:fixed; inset:0; background:rgba(2,6,23,0.4); border:none }
  .modal { position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:min(720px,96%); background:var(--surface); border-radius:0.8rem; padding:1rem; z-index:60; box-shadow:var(--shadow); border:1px solid var(--border) }
  .modal label { display:block; margin-top:0.6rem; margin-bottom:0.25rem; font-weight:600 }
  .modal input[type="text"], .modal input[type="date"], .modal textarea, .modal select { width:100%; padding:0.5rem; border-radius:0.5rem; border:1px solid var(--border); background:var(--soft) }
  .modal-actions { display:flex; justify-content:flex-end; gap:0.6rem; margin-top:0.8rem }


  @media (max-width: 900px) {
    .page-head {
      flex-direction: column;
    }

    .head-actions {
      width: 100%;
      justify-content: flex-start;
    }
  }

  :global(.dark) {
    --ink: #e5edf8;
    --muted: #9ba3af;
    --border: #2b3c57;
    --surface: #162338;
    --soft: #1c2a44;
  }
</style>
