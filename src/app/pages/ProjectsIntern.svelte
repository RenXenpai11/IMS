<script>
// @ts-nocheck
  import { onMount, onDestroy } from 'svelte';
  import { getCurrentUser, subscribeToCurrentUser } from '../lib/auth.js';
  import {
    FolderOpen, Plus, Pencil, Trash2, ExternalLink, Loader2,
    CalendarDays, Tag, CheckCircle2, Clock3, AlertCircle, Link2
  } from 'lucide-svelte';

  export let currentUser = null;

  // ── State ─────────────────────────────────────────────────────────────────
  let activeTab    = 'my-projects';
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

  // Delete modal
  let showDeleteModal   = false;
  let projectToDelete   = null;
  let isDeleting        = false;

  const PRIORITY_OPTIONS  = ['1st', '2nd', '3rd', '4th', '5th'];
  const STATUS_OPTIONS    = ['Not Started', 'In Progress', 'Completed'];

  const PRIORITY_COLORS = {
    '1st': { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
    '2nd': { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa' },
    '3rd': { bg: '#fefce8', text: '#ca8a04', border: '#fde68a' },
    '4th': { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
    '5th': { bg: '#f5f3ff', text: '#7c3aed', border: '#ddd6fe' },
  };

  const STATUS_META = {
    'Not Started': { cls: 'status-not-started', label: 'Not Started' },
    'In Progress':  { cls: 'status-in-progress',  label: 'In Progress'  },
    'Completed':    { cls: 'status-completed',     label: 'Completed'    },
  };

  // Form
  let form = {
    priority_level: '1st',
    title: '',
    description: '',
    deadline: '',
    link_url: '',
    link_label: '',
    status: 'Not Started',
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  function resetForm() {
    form = { priority_level: '1st', title: '', description: '', deadline: '', link_url: '', link_label: '', status: 'Not Started' };
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
    if (!String(form.deadline || '').trim())       return 'Deadline is required.';
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
          p.id === editingId ? { ...p, ...form, updated_at: new Date().toISOString() } : p
        );
        formSuccess = 'Project updated successfully!';
      } else {
        const newProject = {
          id: `proj-${Date.now()}`,
          owner_id: String(currentUser?.user_id || ''),
          owner_name: String(currentUser?.full_name || 'Intern'),
          ...form,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        projects = [newProject, ...projects];
        formSuccess = 'Project added successfully!';
      }
      saveProjects();
      setTimeout(() => { formSuccess = ''; }, 3000);
      resetForm();
      activeTab = 'my-projects';
    } finally {
      isSubmitting = false;
    }
  }

  function editProject(p) {
    form = {
      priority_level: p.priority_level || '1st',
      title:          p.title || '',
      description:    p.description || '',
      deadline:       p.deadline || '',
      link_url:       p.link_url || '',
      link_label:     p.link_label || '',
      status:         p.status || 'Not Started',
    };
    editingId = p.id;
    activeTab = 'add-project';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openDeleteModal(p)  { projectToDelete = p; showDeleteModal = true;  }
  function closeDeleteModal()  { projectToDelete = null; showDeleteModal = false; }

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
  $: isFormValid       = String(form.title || '').trim() && String(form.deadline || '').trim();
</script>

<!-- ══════════════════════════════════════════════════════════════════════ -->
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

  <!-- Tab Row -->
  <div class="tab-row">
    <button class="tab-btn" class:active={activeTab === 'my-projects'} on:click={() => setTab('my-projects')}>
      My Projects
    </button>
    <button class="tab-btn" class:active={activeTab === 'add-project'} on:click={() => setTab('add-project')}>
      <Plus size={13} style="margin-right:4px" />
      {editingId ? 'Edit Project' : 'Add Project'}
    </button>
  </div>

  {#if formSuccess}
    <div class="alert-success">{formSuccess}</div>
  {/if}

  <!-- ── MY PROJECTS TAB ─────────────────────────────────────────── -->
  {#if activeTab === 'my-projects'}
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
      <!-- Filters -->
      <div class="filter-row">
        <div class="filter-group">
          <span class="filter-label">Priority:</span>
          {#each ['all', ...PRIORITY_OPTIONS] as p}
            <button class="filter-chip" class:active={filterPriority === p}
              on:click={() => (filterPriority = p)}>
              {p === 'all' ? 'All' : p}
            </button>
          {/each}
        </div>
        <div class="filter-group">
          <span class="filter-label">Status:</span>
          {#each ['all', ...STATUS_OPTIONS] as s}
            <button class="filter-chip" class:active={filterStatus === s}
              on:click={() => (filterStatus = s)}>
              {s === 'all' ? 'All' : s}
            </button>
          {/each}
        </div>
      </div>

      {#if filteredProjects.length === 0}
        <div class="empty-state">
          <FolderOpen size={22} />
          <span>No projects match the selected filters.</span>
        </div>
      {:else}
        <div class="projects-list">
          {#each filteredProjects as p (p.id)}
            {@const pc    = PRIORITY_COLORS[p.priority_level] || PRIORITY_COLORS['5th']}
            {@const sm    = STATUS_META[p.status] || STATUS_META['Not Started']}
            {@const past  = isDeadlinePast(p.deadline)}
            {@const near  = !past && isDeadlineNear(p.deadline)}
            <div class="project-card">
              <!-- Card header -->
              <div class="project-card-header">
                <div class="priority-badge"
                  style="background:{pc.bg};color:{pc.text};border-color:{pc.border}">
                  <Tag size={10} /> {p.priority_level} Priority
                </div>
                <span class="status-badge {sm.cls}">{sm.label}</span>
              </div>

              <!-- Title + desc -->
              <div class="project-title">{p.title}</div>
              {#if p.description}
                <p class="project-desc">{p.description}</p>
              {/if}

              <!-- Meta row -->
              <div class="project-meta">
                {#if p.deadline}
                  <div class="meta-item" class:deadline-past={past} class:deadline-near={near}>
                    <CalendarDays size={12} />
                    <span>{formatDate(p.deadline)}</span>
                    {#if past}  <span class="deadline-tag">Overdue</span>
                    {:else if near} <span class="deadline-tag near">Due soon</span>
                    {/if}
                  </div>
                {/if}
                {#if p.link_url}
                  <a class="meta-link" href={p.link_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={12} /> {p.link_label || 'Open Link'}
                  </a>
                {/if}
              </div>

              <!-- Footer actions -->
              <div class="project-card-footer">
                <button class="btn-edit" on:click={() => editProject(p)}>
                  <Pencil size={12} /> Edit
                </button>
                <button class="btn-delete" on:click={() => openDeleteModal(p)}>
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}

  <!-- ── ADD / EDIT PROJECT TAB ──────────────────────────────────── -->
  {#if activeTab === 'add-project'}
    <div class="form-panel">
      <div class="form-title">{editingId ? 'Edit Project' : 'Add New Project'}</div>
      <div class="form-subtitle">Fill in the details below and submit.</div>

      <!-- Priority + Status row -->
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

      <!-- Title -->
      <div class="form-group">
        <label class="form-label" for="proj-title">Project Title <span class="req">*</span></label>
        <input id="proj-title" type="text" class="form-input" bind:value={form.title}
          placeholder="e.g. ISOC PRISM" maxlength="120" />
      </div>

      <!-- Short Description -->
      <div class="form-group">
        <label class="form-label" for="proj-desc">Short Description</label>
        <textarea id="proj-desc" class="form-textarea" bind:value={form.description}
          rows="3" placeholder="Brief description of the project…" maxlength="500"></textarea>
      </div>

      <!-- Deadline -->
      <div class="form-group">
        <label class="form-label" for="proj-deadline">Deadline <span class="req">*</span></label>
        <input id="proj-deadline" type="date" class="form-input" bind:value={form.deadline} />
      </div>

      <!-- Project Link -->
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

      <div class="form-footer">
        {#if editingId}
          <button class="btn-secondary" on:click={resetForm}>Cancel</button>
        {/if}
        <button class="btn-submit" on:click={submitProject} disabled={isSubmitting || !isFormValid}>
          {#if isSubmitting}
            <Loader2 size={14} class="spin" /> Saving…
          {:else}
            {editingId ? 'Save Changes' : 'Add Project'}
          {/if}
        </button>
      </div>
    </div>
  {/if}

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

<!-- ══════════════════════════════════════════════════════════════════════ -->
<style>
  .projects-page { padding: 20px; display: flex; flex-direction: column; gap: 16px; }

  /* ── Stat Cards ── */
  .stat-cards { display: flex; gap: 12px; flex-wrap: wrap; }
  .stat-card {
    flex: 1; min-width: 130px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 14px 16px 12px;
    display: flex; flex-direction: column; gap: 4px;
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

  /* ── Filters ── */
  .filter-row { display: flex; flex-direction: column; gap: 8px; }
  .filter-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .filter-label { font-size: 11px; font-weight: 600; color: var(--color-sidebar-text); text-transform: uppercase; letter-spacing: .06em; white-space: nowrap; }
  .filter-chip {
    padding: 4px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 500;
    border: 1px solid var(--color-border); background: var(--color-surface);
    color: var(--color-sidebar-text); cursor: pointer; transition: all .15s;
  }
  .filter-chip:hover { background: var(--color-hover); }
  .filter-chip.active { background: #2563eb; color: #fff; border-color: #2563eb; }

  /* ── Project Cards ── */
  .projects-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
  .project-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px; padding: 14px 16px;
    display: flex; flex-direction: column; gap: 8px;
    transition: box-shadow .15s;
  }
  .project-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.08); }
  .project-card-header { display: flex; align-items: center; justify-content: space-between; gap: 6px; }

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


</style>
