<script>
// @ts-nocheck
  import { onMount, onDestroy } from 'svelte';
  import { getCurrentUser, subscribeToCurrentUser } from '../lib/auth.js';
  import {
    FolderOpen, Plus, Pencil, Trash2, ExternalLink, Loader2, Eye,
    CalendarDays, Tag, CheckCircle2, Clock3, AlertCircle, Link2,
    Grid, List, Archive
  } from 'lucide-svelte';

  export let currentUser = null;

  // ── State ─────────────────────────────────────────────────────────────────
  let activeTab    = 'my-projects';
  let activeSubTab = 'Submissions';
  let projects     = [];
  let isLoading    = false;
  let formError    = '';
  let formSuccess  = '';
  let isSubmitting = false;
  let editingId    = null;
  let unsubscribeAuth;

  // Filter
  let filterPriority = 'all';
  let filterStatus   = 'all';
  let searchQuery    = '';
  let activeView     = 'Overview';
  let searchTerm     = '';
  let selectedStatus = 'all';
  let showAddProjectModal = false;

  // Delete modal
  let showDeleteModal   = false;
  let projectToDelete   = null;
  let isDeleting        = false;

  const PRIORITY_OPTIONS  = ['Low', 'Medium', 'High'];
  const STATUS_OPTIONS    = ['Not Started', 'In Progress', 'Completed'];

  const SUPERVISOR_OPTIONS = ['Supervisor A', 'Supervisor B', 'Supervisor C'];

  const PRIORITY_COLORS = {
    'Low': { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' },
    'Medium': { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
    'High': { bg: '#fff1f2', text: '#b91c1c', border: '#fecaca' },
    // fallback for legacy values
    '1st': { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' },
    '2nd': { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
    '3rd': { bg: '#fff1f2', text: '#b91c1c', border: '#fecaca' },
  };

  function getPriorityLabel(val) {
    if (!val) return '';
    const v = String(val).trim();
    if (v === '1st' || v.toLowerCase() === 'low') return 'Low';
    if (v === '2nd' || v.toLowerCase() === 'medium') return 'Medium';
    if (v === '3rd' || v.toLowerCase() === 'high') return 'High';
    if (v === '4th' || v === '5th') return 'High';
    return v;
  }

  const STATUS_META = {
    'Pending':      { cls: 'status-pending',       label: 'Pending'      },
    'In Progress':  { cls: 'status-in-progress',   label: 'In Progress'  },
    'For Review':   { cls: 'status-review',        label: 'For Review'   },
    'Completed':    { cls: 'status-completed',     label: 'Completed'    },
    // legacy mappings
    'Not Started':  { cls: 'status-pending',       label: 'Pending'      },
  };

  // Form
  let form = {
    priority_level: '1st',
    title: '',
    description: '',
    supervisor: '',
    timeline_start: '',
    timeline_end: '',
    link_url: '',
    link_label: '',
    status: 'Not Started',
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  function resetForm() {
    form = { priority_level: '1st', title: '', description: '', supervisor: '', timeline_start: '', timeline_end: '', link_url: '', link_label: '', status: 'Not Started' };
    editingId = null;
    formError = '';
    formSuccess = '';
  }

  function setTab(tab) {
    activeTab = tab;
    if (tab !== 'add-project') { resetForm(); }
    formError = '';
    formSuccess = '';
  }

  function formatDate(val) {
    const s = String(val || '').trim();
    if (!s) return '';
    const d = new Date(s + 'T00:00:00');
    if (isNaN(d)) return s;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
  }

  function isDeadlineNear(val) {
    const s = String(val || '').trim();
    if (!s) return false;
    const d   = new Date(s + 'T00:00:00');
    const now = new Date();
    now.setHours(0,0,0,0);
    const diffDays = (d - now) / 86400000;
    return diffDays >= 0 && diffDays <= 7;
  }

  function isDeadlinePast(val) {
    const s = String(val || '').trim();
    if (!s) return false;
    const d   = new Date(s + 'T00:00:00');
    const now = new Date();
    now.setHours(0,0,0,0);
    return d < now;
  }

  function validateForm() {
    if (!String(form.title || '').trim())         return 'Project title is required.';
    if (!String(form.timeline_start || '').trim() || !String(form.timeline_end || '').trim()) return 'Timeline start and end are required.';
    return '';
  }

  // ── Local storage (sample backend) ────────────────────────────────────────
  function storageKey() {
    const uid = String(currentUser?.user_id || getCurrentUser()?.user_id || 'guest');
    return `ims-projects-${uid}`;
  }

  function loadProjects() {
    isLoading = true;
    try {
      const raw = localStorage.getItem(storageKey());
      projects = raw ? JSON.parse(raw) : [];
    } catch { projects = []; }
    finally { isLoading = false; }
  }

  function saveProjects() {
    try { localStorage.setItem(storageKey(), JSON.stringify(projects)); } catch { /* ignore */ }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function submitProject() {
    const err = validateForm();
    formError   = err;
    formSuccess  = '';
    if (err) return;
    isSubmitting = true;

    try {
      if (editingId) {
        projects = projects.map(p =>
          p.id === editingId ? { ...p, ...form, deadline: form.timeline_end || p.deadline, updated_at: new Date().toISOString() } : p
        );
        formSuccess = 'Project updated successfully!';
      } else {
        const newProject = {
          id: `proj-${Date.now()}`,
          owner_id: String(currentUser?.user_id || ''),
          owner_name: String(currentUser?.full_name || 'Intern'),
          ...form,
          // keep legacy `deadline` for compatibility (use timeline_end)
          deadline: form.timeline_end || '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        projects = [newProject, ...projects];
        formSuccess = 'Project added successfully!';
      }
      saveProjects();
      setTimeout(() => { formSuccess = ''; }, 3000);
      resetForm();
      // close modal if open
      closeAddProjectModal();
    } finally {
      isSubmitting = false;
    }
  }

  function editProject(p) {
    form = {
      priority_level: p.priority_level || '1st',
      title:          p.title || '',
      description:    p.description || '',
      supervisor:     p.supervisor || '',
      timeline_start: p.timeline_start || p.deadline || '',
      timeline_end:   p.timeline_end || p.deadline || '',
      link_url:       p.link_url || '',
      link_label:     p.link_label || '',
      status:         p.status || 'Not Started',
    };
    editingId = p.id;
      // open modal for editing
      openAddProjectModal();
  }

  function openDeleteModal(p)  { projectToDelete = p; showDeleteModal = true;  }
  function closeDeleteModal()  { projectToDelete = null; showDeleteModal = false; }

  function openAddProjectModal() {
    // If editingId is set we are opening modal to edit — keep form as-is.
    if (!editingId) resetForm();
    showAddProjectModal = true;
  }

  function closeAddProjectModal() {
    showAddProjectModal = false;
    resetForm();
  }

  function confirmDelete() {
    if (!projectToDelete) return;
    isDeleting = true;
    try {
      projects = projects.filter(p => p.id !== projectToDelete.id);
      saveProjects();
      formSuccess = 'Project deleted.';
      setTimeout(() => { formSuccess = ''; }, 2500);
      closeDeleteModal();
    } finally { isDeleting = false; }
  }

  function viewProject(p) {
    // open project details for now (reuses edit flow)
    editProject(p);
  }

  function archiveProject(p) {
    if (!p) return;
    projects = projects.map(item => item.id === p.id ? { ...item, archived: true, updated_at: new Date().toISOString() } : item);
    saveProjects();
    formSuccess = 'Project archived.';
    setTimeout(() => { formSuccess = ''; }, 2000);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  onMount(() => {
    currentUser = getCurrentUser();
    loadProjects();
    unsubscribeAuth = subscribeToCurrentUser(u => { currentUser = u; loadProjects(); });
  });
  onDestroy(() => { if (typeof unsubscribeAuth === 'function') unsubscribeAuth(); });

  // ── Derived ───────────────────────────────────────────────────────────────
  $: filteredProjects = projects.filter(p => {
    const matchPriority = filterPriority === 'all' || p.priority_level === filterPriority;
    const matchStatus   = filterStatus   === 'all' || p.status === filterStatus;
    return matchPriority && matchStatus;
  });

  $: totalProjects     = projects.length;
  $: inProgressCount   = projects.filter(p => p.status === 'In Progress').length;
  $: completedCount    = projects.filter(p => p.status === 'Completed').length;
  $: isFormValid       = String(form.title || '').trim() && String(form.timeline_start || '').trim() && String(form.timeline_end || '').trim();

  // Derived sets for tab views
  $: archivedProjects = projects.filter(p => !!p.archived);
  $: recentProjects   = projects.slice(0, 3);
</script>
<section class="projects-page">

  <!-- Stat Cards -->
  <div class="stat-cards">
    <div class="stat-card blue">
      <div class="stat-card-top">
        <div style="flex:1"></div>
        <div class="stat-icon blue"><FolderOpen size={16} /></div>
      </div>
      <div class="stat-value">{totalProjects}</div>
      <div class="stat-label">Total Projects</div>
    </div>
    <div class="stat-card amber">
      <div class="stat-card-top">
        <div style="flex:1"></div>
        <div class="stat-icon amber"><Clock3 size={16} /></div>
      </div>
      <div class="stat-value">{inProgressCount}</div>
      <div class="stat-label">In Progress</div>
    </div>
    <div class="stat-card green">
      <div class="stat-card-top">
        <div style="flex:1"></div>
        <div class="stat-icon green"><CheckCircle2 size={16} /></div>
      </div>
      <div class="stat-value">{completedCount}</div>
      <div class="stat-label">Completed</div>
    </div>
  </div>
  
    <!-- Quick panel (copied from SupervisorActivity) -->
    <section class="card quick-panel">
      <div class="quick-head">
        <div class="view-controls">
          <button class="btn btn-ghost" class:active={activeView === 'Overview'} on:click={() => activeView = 'Overview'}>
            <Grid size={14} />
            <span>Overview</span>
          </button>
          <button class="btn btn-ghost" class:active={activeView === 'Projects'} on:click={() => activeView = 'Projects'}>
            <FolderOpen size={14} />
            <span>Projects</span>
          </button>
          <button class="btn btn-ghost" class:active={activeView === 'Archive'} on:click={() => activeView = 'Archive'}>
            <Archive size={14} />
            <span>Archive</span>
          </button>
        </div>

        <div class="quick-actions">
          <label class="search-wrap">
            <input class="search-input" type="text" placeholder="Search" bind:value={searchQuery} />
          </label>
          <select class="quick-status" bind:value={filterStatus} aria-label="Filter by status">
            <option value="all">All status</option>
            {#each STATUS_OPTIONS as s}
              <option value={s}>{s}</option>
            {/each}
          </select>
          <button class="primary" on:click={openAddProjectModal}>+ Add Project</button>
        </div>
      </div>
    </section>
  
  
  
  

  

  {#if formSuccess}
    <div class="alert-success">{formSuccess}</div>
  {/if}

  <!-- ── MY PROJECTS TAB ─────────────────────────────────────────── -->
  {#if activeTab === 'my-projects'}
    {#if activeView === 'Overview'}
      {#if isLoading}
        <div class="empty-state">
          <Loader2 size={22} class="spin" />
          <span>Loading projects…</span>
        </div>
      {:else if projects.length === 0}
        <div class="empty-state">
          <FolderOpen size={32} />
          <div class="empty-title">No projects yet</div>
          <div class="empty-sub">Click "Add Project" to get started.</div>
        </div>
      {:else}
        <div class="project-list">
          <ul>
            {#each recentProjects as p (p.id)}
              <li class="proj-item">{p.title} <span class="muted">— {p.status}</span></li>
            {/each}
          </ul>
        </div>
      {/if}
    {:else if activeView === 'Projects'}
      <section class="proj-table-panel">
        <header class="proj-table-header">
          <span class="proj-col-name">Project Name</span>
          <span class="proj-col-priority">Priority</span>
          <span class="proj-col-status">Status</span>
          <span class="proj-col-due">Timeline</span>
          <span class="proj-col-actions">Actions</span>
        </header>
        {#if isLoading}
          <div class="empty-state">
            <Loader2 size={22} class="spin" />
            <span>Loading projects…</span>
          </div>
        {:else if filteredProjects.length === 0}
          <div class="empty-state">
            <FolderOpen size={32} />
            <div class="empty-title">No projects yet</div>
            <div class="empty-sub">Click "+ Add Project" to get started.</div>
          </div>
        {:else}
          <div class="proj-table-body">
            {#each filteredProjects as p (p.id)}
              {@const sm = STATUS_META[p.status] || STATUS_META['Not Started']}
              {@const past = isDeadlinePast(p.timeline_end || p.deadline)}
              {@const pl = getPriorityLabel(p.priority_level) || ''}
              <div class="proj-table-row">
                <span class="proj-col-name proj-name-cell">{p.title}</span>
                <span class="proj-col-priority">
                  <span class={"proj-priority-pill priority-" + pl.toLowerCase()}>{pl || '—'}</span>
                </span>
                <span class="proj-col-status">
                  <span class="proj-status-pill {sm.cls}">{sm.label}</span>
                </span>
                <span class="proj-col-due proj-col-timeline" class:deadline-past={past}>
                  {p.timeline_start || p.timeline_end
                    ? (p.timeline_start && p.timeline_end
                        ? `${formatDate(p.timeline_start)} — ${formatDate(p.timeline_end)}`
                        : formatDate(p.timeline_start || p.timeline_end))
                    : (p.deadline ? formatDate(p.deadline) : '—')}
                </span>
                <span class="proj-col-actions proj-actions-cell">
                  <button class="icon-btn" title="View" aria-label="View" on:click={() => viewProject(p)}>
                    <Eye size={16} />
                  </button>
                  <button class="icon-btn archive" title="Archive" aria-label="Archive" on:click={() => archiveProject(p)}>
                    <Archive size={16} />
                  </button>
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {:else if activeView === 'Archive'}
      {#if archivedProjects.length === 0}
        <div class="empty-state">
          <FolderOpen size={28} />
          <div class="empty-title">No archived projects</div>
          <div class="empty-sub">Archived projects will appear here.</div>
        </div>
      {:else}
        <div class="project-list">
          <ul>
            {#each archivedProjects as p (p.id)}
              <li class="proj-item">{p.title}</li>
            {/each}
          </ul>
        </div>
      {/if}
    {/if}
  {/if}

  <!-- Add/Edit form moved to modal (triggered by + Add Project) -->

</section>

<!-- ── DELETE MODAL ────────────────────────────────────────────────── -->
{#if showDeleteModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-overlay" on:click={closeDeleteModal}>
    <div class="modal-box" on:click|stopPropagation>
      <div class="modal-title">Delete Project</div>
      <p class="modal-body">
        Are you sure you want to delete <strong>{projectToDelete?.title}</strong>? This cannot be undone.
      </p>
      <div class="modal-footer">
        <button class="btn-secondary" on:click={closeDeleteModal}>Cancel</button>
        <button class="btn-delete-confirm" on:click={confirmDelete} disabled={isDeleting}>
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showAddProjectModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-overlay" on:click={closeAddProjectModal}>
    <div class="modal-box large" on:click|stopPropagation>
      <div class="modal-title">{editingId ? 'Edit Project' : 'Add New Project'}</div>

      <div class="form-group">
        <label class="form-label" for="proj-title">Project Title <span class="req">*</span></label>
        <input id="proj-title" type="text" class="form-input" bind:value={form.title}
          placeholder="e.g. ISOC PRISM" maxlength="120" />
      </div>

      <div class="form-group">
        <label class="form-label" for="proj-desc">Description</label>
        <textarea id="proj-desc" class="form-textarea" bind:value={form.description}
          rows="3" placeholder="Brief description of the project…" maxlength="500"></textarea>
      </div>

      <div class="form-group">
        <label class="form-label" for="proj-supervisor">Supervisor</label>
        <select id="proj-supervisor" class="form-input" bind:value={form.supervisor}>
          <option value="">Select supervisor</option>
          {#each SUPERVISOR_OPTIONS as s}
            <option value={s}>{s}</option>
          {/each}
        </select>
      </div>

      <div class="row-2">
        <div class="form-group">
          <label class="form-label" for="proj-priority">Priority Level</label>
          <select id="proj-priority" class="form-input" bind:value={form.priority_level}>
            {#each PRIORITY_OPTIONS as opt}
              <option value={opt}>{opt}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="proj-status">Status</label>
          <select id="proj-status" class="form-input" bind:value={form.status}>
            {#each STATUS_OPTIONS as opt}
              <option value={opt}>{opt}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="row-2">
        <div class="form-group">
          <label class="form-label" for="proj-timeline-start">Timeline (Start)</label>
          <input id="proj-timeline-start" type="date" class="form-input" bind:value={form.timeline_start} />
        </div>
        <div class="form-group">
          <label class="form-label" for="proj-timeline-end">Timeline (End)</label>
          <input id="proj-timeline-end" type="date" class="form-input" bind:value={form.timeline_end} />
        </div>
      </div>

      <div class="row-2">
        <div class="form-group">
          <label class="form-label" for="proj-link">Project Link (URL)</label>
          <input id="proj-link" type="url" class="form-input" bind:value={form.link_url}
            placeholder="https://docs.google.com/…" />
        </div>
        <div class="form-group">
          <label class="form-label" for="proj-link-label">Link Label</label>
          <input id="proj-link-label" type="text" class="form-input" bind:value={form.link_label}
            placeholder="e.g. Collaborative Docs File" maxlength="80" />
        </div>
      </div>

      {#if formError}
        <div class="alert-error">{formError}</div>
      {/if}

      <div class="modal-footer">
        <button class="btn-secondary" on:click={closeAddProjectModal}>Cancel</button>
        <button class="btn-submit" on:click={submitProject} disabled={isSubmitting || !isFormValid}>
          {#if isSubmitting}
            <Loader2 size={14} class="spin" /> Saving…
          {:else}
            {editingId ? 'Save Changes' : 'Add Project'}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .projects-page { padding: 4px 0 12px; display: flex; flex-direction: column; gap: 10px; }

  /* ── Stat Cards ── */
  .stat-cards { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 0; }
  .stat-card {
    flex: 1; min-width: 120px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 12px 14px 10px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .stat-card-top { display: flex; align-items: center; margin-bottom: 4px; }
  .stat-icon {
    width: 28px; height: 28px; border-radius: 7px;
    display: grid; place-items: center;
  }
  .stat-icon.blue  { background: #dbeafe; color: #2563eb; }
  .stat-icon.amber { background: #fef3c7; color: #d97706; }
  .stat-icon.green { background: #dcfce7; color: #16a34a; }
  :global(body.dark) .stat-icon.blue  { background: #1e3a5f; color: #60a5fa; }
  :global(body.dark) .stat-icon.amber { background: #3b2600; color: #fbbf24; }
  :global(body.dark) .stat-icon.green { background: #052e16; color: #4ade80; }
  .stat-value { font-size: 22px; font-weight: 700; color: var(--color-heading); line-height: 1; }
  .stat-label { font-size: 11.5px; color: var(--color-sidebar-text); }

  /* ── Tabs ── */
  .tab-row { display: flex; gap: 4px; border-bottom: 1px solid var(--color-border); padding-bottom: 1px; }
  .tab-btn {
    display: flex; align-items: center;
    padding: 8px 14px; font-size: 13px; font-weight: 500;
    color: var(--color-sidebar-text); background: transparent;
    border: none; border-bottom: 2px solid transparent;
    cursor: pointer; transition: all .15s;
  }
  .tab-btn:hover  { color: var(--color-text); }
  .tab-btn.active { color: #2563eb; border-bottom-color: #2563eb; }

  /* ── Alerts ── */
  .alert-success {
    padding: 10px 14px; border-radius: 8px;
    background: #f0fdf4; border: 1px solid #bbf7d0;
    color: #15803d; font-size: 13px;
  }
  .alert-error {
    padding: 10px 14px; border-radius: 8px;
    background: #fef2f2; border: 1px solid #fecaca;
    color: #dc2626; font-size: 13px;
  }
  :global(body.dark) .alert-success { background: #052e16; border-color: #166534; color: #4ade80; }
  :global(body.dark) .alert-error   { background: #2d0a0a; border-color: #7f1d1d; color: #f87171; }


  

  /* ── Projects table card ── */
  .proj-table-panel {
    overflow: hidden;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.9rem;
    margin-top: 1rem;
  }
  :global(body.dark) .proj-table-panel { background: #0d1117 !important; border-color: #ffffff0f !important; }

  .proj-table-header {
    display: grid;
    grid-template-columns: minmax(0,1fr) 7.5rem 8rem 9rem 8.75rem;
    align-items: center;
    gap: 0.9rem;
    padding: 0.85rem 1rem;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    color: var(--color-heading);
    font-size: 0.88rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  :global(body.dark) .proj-table-header { background: #161c27 !important; border-bottom-color: #ffffff0f !important; color: #e5edf8 !important; }

  .proj-table-body { display: grid; background: var(--color-soft); padding: 0.4rem; gap: 0.4rem; }
  :global(body.dark) .proj-table-body { background: #0d1117 !important; }

  .proj-table-row {
    display: grid;
    grid-template-columns: minmax(0,1fr) 7.5rem 8rem 9rem 8.75rem;
    align-items: center;
    gap: 0.9rem;
    padding: 0.85rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: 0.65rem;
    background: var(--color-surface);
    transition: border-color 140ms ease, box-shadow 140ms ease;
  }
  .proj-table-row:hover { border-color: var(--color-accent); box-shadow: 0 8px 22px -20px rgba(15,23,42,.35); }
  :global(body.dark) .proj-table-row { background: #161c27 !important; border-color: #ffffff0f !important; }

  .proj-name-cell { font-size: 0.88rem; font-weight: 600; color: var(--color-heading); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  :global(body.dark) .proj-name-cell { color: #e5edf8 !important; }

  .proj-status-pill {
    display: inline-flex; align-items: center; gap: 0.3rem;
    padding: 0.22rem 0.7rem; border-radius: 999px;
    font-size: 0.78rem; font-weight: 600;
    background: rgba(255,255,255,0.02);
  }
  .proj-status-pill.status-pending { background: rgba(249,115,22,0.08); color: #f97316; }
  .proj-status-pill.status-in-progress { background: rgba(16,185,129,0.08); color: #10b981; }
  .proj-status-pill.status-review { background: rgba(239,68,68,0.08); color: #ef4444; }
  .proj-status-pill.status-completed { background: rgba(59,130,246,0.08); color: #3b82f6; }

  /* center non-name header labels */
  .proj-table-header > .proj-col-priority,
  .proj-table-header > .proj-col-status,
  .proj-table-header > .proj-col-due,
  .proj-table-header > .proj-col-actions {
    justify-self: center;
    text-align: center;
    color: var(--color-heading);
  }

  .proj-col-due { font-size: 0.83rem; color: var(--color-sidebar-text); }
  .proj-col-due.deadline-past { color: #dc2626; }

  .proj-priority-pill {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 0.22rem 0.6rem; border-radius: 999px;
    font-size: 0.78rem; font-weight: 700; color: var(--color-text);
    background: rgba(99,102,241,0.06); border: 1px solid rgba(99,102,241,0.12);
  }

  /* priority color variants */
  .proj-priority-pill.priority-low { background: rgba(56,189,248,0.08); color: #38bdf8; border-color: rgba(56,189,248,0.12); }
  .proj-priority-pill.priority-medium { background: rgba(16,185,129,0.08); color: #10b981; border-color: rgba(16,185,129,0.12); }
  .proj-priority-pill.priority-high { background: rgba(239,68,68,0.08); color: #ef4444; border-color: rgba(239,68,68,0.12); }

  /* center non-name row columns so pills and text align under headers */
  .proj-table-row .proj-col-priority,
  .proj-table-row .proj-col-status,
  .proj-table-row .proj-col-due,
  .proj-table-row .proj-col-actions {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  /* priority pill keeps its variant color */

  .proj-actions-cell { display: inline-flex; align-items: center; gap: 0.8rem; }
  .icon-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; border-radius: 8px; padding: 6px;
    background: var(--color-surface); border: 1px solid var(--color-border);
    color: var(--color-accent); cursor: pointer; margin: 0; transition: transform 0.12s, background 0.12s, border-color 0.12s;
  }
  .icon-btn:hover { background: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface)); border-color: var(--color-accent); transform: translateY(-1px); }
  .icon-btn.archive { background: transparent; border-color: rgba(255,255,255,0.06); color: var(--color-accent); }
  .icon-btn :global(svg) { display: block; }

  /* restore project-name color only; keep other column colors as defaults */
  .proj-name-cell { color: var(--color-heading); }
  .proj-action-btn {
    display: inline-flex; align-items: center; gap: 0.3rem;
    padding: 0.28rem 0.65rem; border-radius: 0.55rem;
    font-size: 0.76rem; font-weight: 600; cursor: pointer;
    border: 1px solid var(--color-border); background: var(--color-soft); color: var(--color-text);
    transition: background 120ms;
  }
  .proj-action-btn:hover { background: var(--color-hover); }
  .proj-action-btn.danger { background: #2d0a0a; border-color: #7f1d1d; color: #f87171; }
  .proj-action-btn.danger:hover { background: #3d1010; }

  /* legacy project-list rows */

  .priority-badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 8px; border-radius: 20px; font-size: 10.5px; font-weight: 600;
    border: 1px solid;
  }

  .status-badge {
    display: inline-block; padding: 3px 9px;
    border-radius: 20px; font-size: 10.5px; font-weight: 600;
  }
  .status-not-started { background: #f1f5f9; color: #64748b; }
  .status-in-progress  { background: #fffbeb; color: #d97706; }
  .status-completed    { background: #f0fdf4; color: #16a34a; }
  :global(body.dark) .status-not-started { background: #1e293b; color: #94a3b8; }
  :global(body.dark) .status-in-progress  { background: #3b2600; color: #fbbf24; }
  :global(body.dark) .status-completed    { background: #052e16; color: #4ade80; }

  .project-title { font-size: 14px; font-weight: 600; color: var(--color-heading); }
  .project-desc  { font-size: 12.5px; color: var(--color-sidebar-text); margin: 0; line-height: 1.5; }

  .project-meta { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .meta-item {
    display: flex; align-items: center; gap: 4px;
    font-size: 12px; color: var(--color-sidebar-text);
  }
  .meta-item.deadline-past { color: #dc2626; }
  .meta-item.deadline-near { color: #d97706; }

  .deadline-tag {
    display: inline-block; font-size: 10px; font-weight: 600;
    padding: 1px 7px; border-radius: 20px;
    background: #fef2f2; color: #dc2626;
  }
  .deadline-tag.near { background: #fffbeb; color: #d97706; }

  /* Quick panel (copied from SupervisorActivity) */
  .quick-panel { background: linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface) 100%); padding: 0.48rem 0.8rem; border-radius: 0.9rem; border: 1px solid var(--color-border); display:flex; align-items:center; justify-content:space-between }
  .quick-head { display:flex; align-items:center; justify-content:space-between; width:100%; gap:0.75rem }
  .view-controls .btn { display:inline-flex; align-items:center; gap:0.4rem; margin-right:0.4rem; border-radius:0.55rem; padding:0.32rem 0.6rem; background:transparent; border:1px solid var(--color-border); font-size:0.82rem }
  .view-controls .btn.active { background: var(--color-soft); color: var(--color-heading); border-color: var(--color-border) }
  .btn-compact { padding:0.28rem 0.6rem; font-size:0.8rem; border-radius:0.55rem; }
  .quick-actions { display:flex; gap:0.45rem; align-items:center }
  .search-wrap { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0 0.7rem; color: var(--color-muted); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 0.7rem; }
  .search-input { border:0; background:transparent; color:var(--color-text); font-size:0.85rem; width:9rem; outline:none; padding:0.34rem 0; }
  /* search-icon removed */
  .quick-actions select, .quick-status { padding:0.34rem 0.6rem; border-radius:0.7rem; font-size:0.85rem }
  .quick-actions .primary { padding:0.36rem 0.9rem; font-size:0.85rem; border-radius:0.7rem; background: #2563eb; color: #fff; border: none }

  .meta-link {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 12px; font-weight: 500; color: #2563eb;
    text-decoration: none;
  }
  .meta-link:hover { text-decoration: underline; }

  .project-card-footer {
    display: flex; gap: 6px; margin-top: 4px;
    padding-top: 10px; border-top: 1px solid var(--color-border);
  }
  .btn-edit {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 500;
    background: var(--color-soft); color: #2563eb;
    border: 1px solid var(--color-border); cursor: pointer; transition: all .14s;
  }
  .btn-edit:hover { background: #dbeafe; }
  .btn-delete {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 500;
    background: #fef2f2; color: #dc2626;
    border: 1px solid #fecaca; cursor: pointer; transition: all .14s;
  }
  .btn-delete:hover { background: #fee2e2; }

  /* ── Empty State ── */
  .empty-state {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 8px; padding: 48px 20px; color: var(--color-sidebar-text); text-align: center;
  }
  .empty-title { font-size: 14px; font-weight: 600; color: var(--color-text); }
  .empty-sub   { font-size: 12.5px; }

  /* ── Form Panel ── */
  .form-panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px; padding: 20px 22px;
    display: flex; flex-direction: column; gap: 14px;
  }
  .form-title    { font-size: 15px; font-weight: 700; color: var(--color-heading); }
  .form-subtitle { font-size: 12.5px; color: var(--color-sidebar-text); margin-top: -6px; }
  .form-group    { display: flex; flex-direction: column; gap: 5px; }
  .form-label    { font-size: 12px; font-weight: 600; color: var(--color-sidebar-text); }
  .req           { color: #dc2626; }
  .form-input, .form-textarea {
    padding: 8px 10px; border-radius: 7px;
    border: 1px solid var(--color-border);
    background: var(--color-surface-muted);
    color: var(--color-text); font-size: 13px;
    transition: border-color .15s; outline: none; width: 100%; box-sizing: border-box;
  }
  .form-input:focus, .form-textarea:focus { border-color: #2563eb; }
  .form-textarea { resize: vertical; }
  .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  .form-footer { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }
  .btn-submit {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 20px; border-radius: 8px; font-size: 13px; font-weight: 600;
    background: #2563eb; color: #fff; border: none; cursor: pointer; transition: background .15s;
  }
  .btn-submit:hover:not(:disabled) { background: #1d4ed8; }
  .btn-submit:disabled { opacity: .55; cursor: not-allowed; }
  .btn-secondary {
    padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500;
    background: var(--color-soft); color: var(--color-text);
    border: 1px solid var(--color-border); cursor: pointer;
  }
  .btn-secondary:hover { background: var(--color-hover); }

  /* ── Delete Modal ── */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.45);
    display: grid; place-items: center; z-index: 200;
  }
  .modal-box {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px; padding: 24px 26px;
    max-width: 380px; width: 90%; display: flex; flex-direction: column; gap: 12px;
    box-shadow: 0 20px 48px rgba(0,0,0,.18);
  }
  .modal-title  { font-size: 15px; font-weight: 700; color: var(--color-heading); }
  .modal-body   { font-size: 13px; color: var(--color-sidebar-text); margin: 0; line-height: 1.5; }
  .modal-footer { display: flex; justify-content: flex-end; gap: 8px; }
  .btn-delete-confirm {
    padding: 7px 16px; border-radius: 7px; font-size: 13px; font-weight: 600;
    background: #dc2626; color: #fff; border: none; cursor: pointer;
  }
  .btn-delete-confirm:hover:not(:disabled) { background: #b91c1c; }
  .btn-delete-confirm:disabled { opacity: .55; cursor: not-allowed; }

  /* ── Spin animation ── */
  :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Dark mode overrides ── */
  :global(body.dark) .project-card    { background: #1f2937; border-color: #374151; }
  :global(body.dark) .form-panel      { background: #1f2937; border-color: #374151; }
  :global(body.dark) .form-input,
  :global(body.dark) .form-textarea   { background: #111827; border-color: #374151; color: #f1f5f9; }
  :global(body.dark) .modal-box       { background: #1f2937; border-color: #374151; }
  :global(body.dark) .priority-badge  { filter: brightness(.85) saturate(.9); }
  :global(body.dark) .btn-edit        { background: #1e3a5f; border-color: #1e40af; }
  :global(body.dark) .btn-delete      { background: #2d0a0a; border-color: #7f1d1d; color: #f87171; }
  :global(body.dark) .deadline-tag    { background: #2d0a0a; color: #f87171; }
  :global(body.dark) .deadline-tag.near { background: #3b2600; color: #fbbf24; }
  :global(body.dark) .meta-link       { color: #60a5fa; }


  /* View toggle (tabs below stat cards) */
  /* view-toggle removed */

</style>
