<script>
// @ts-nocheck
  import { onMount, onDestroy } from 'svelte';
  import { getCurrentUser, subscribeToCurrentUser, callApiAction } from '../lib/auth.js';
  import { FolderOpen, Clock3, Tag, Users2, CalendarDays, Loader2, Grid, Archive, RotateCcw, Eye } from 'lucide-svelte';

  export let currentUser = null;

  let allProjects = [];
  let isLoading = false;
  let loadError = '';
  let filterPriority = 'all';
  let filterStatus = 'all';
  let filterIntern = 'all';
  let searchQuery = '';
  let activeView = 'Overview';
  let unsubscribeAuth;
  let supervisorLabel = 'your supervisor account';
  let actionMessage = '';
  let actionError = '';
  let flashTimer;

  const PRIORITY_OPTIONS = ['Low', 'Medium', 'High'];
  const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Submitted', 'Needs Revision', 'Approved'];

  const DEFAULT_PRIORITY_COLOR = { bg: '#eef2f7', text: '#475569', border: '#cbd5e1' };
  const PRIORITY_COLORS = {
    'Low': { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' },
    'Medium': { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
    'High': { bg: '#fff1f2', text: '#b91c1c', border: '#fecaca' }
  };

  const STATUS_META = {
    'Not Started': { cls: 'status-not-started', label: 'Not Started' },
    'In Progress': { cls: 'status-in-progress', label: 'In Progress' },
    'Submitted': { cls: 'status-submitted', label: 'Submitted' },
    'Needs Revision': { cls: 'status-needs-revision', label: 'Needs Revision' },
    'Approved': { cls: 'status-approved', label: 'Approved' },
    'Pending': { cls: 'status-pending', label: 'Pending' },
    'Completed': { cls: 'status-approved', label: 'Completed' },
    'Archived': { cls: 'status-pending', label: 'Archived' }
  };

  function splitList(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || '').trim()).filter(Boolean);
    }

    return String(value || '')
      .split(',')
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  function normalizePriorityLabel(value) {
    const raw = String(value || '').trim();
    const lower = raw.toLowerCase();
    if (lower === 'low') return 'Low';
    if (lower === 'medium') return 'Medium';
    if (lower === 'high') return 'High';
    return raw;
  }

  function priorityRank(value) {
    const label = normalizePriorityLabel(value);
    if (label === 'High') return 0;
    if (label === 'Medium') return 1;
    if (label === 'Low') return 2;
    return 3;
  }

  function canonicalStatusLabel(value) {
    const raw = String(value || '').trim();
    const lower = raw.toLowerCase();
    if (!raw) return 'Not Started';
    if (lower === 'not started') return 'Not Started';
    if (lower === 'in progress') return 'In Progress';
    if (lower === 'submitted') return 'Submitted';
    if (lower === 'for review') return 'Submitted';
    if (lower === 'needs revision') return 'Needs Revision';
    if (lower === 'approved') return 'Approved';
    if (lower === 'pending') return 'Pending';
    if (lower === 'completed') return 'Completed';
    if (lower === 'archived') return 'Archived';
    return raw;
  }

  function statusGroup(value) {
    const label = canonicalStatusLabel(value).toLowerCase();
    if (label === 'approved' || label === 'completed') return 'approved';
    if (label === 'submitted') return 'submitted';
    if (label === 'needs revision') return 'needs revision';
    if (label === 'in progress') return 'in progress';
    if (label === 'pending' || label === 'not started') return 'not started';
    return label;
  }

  function statusMatchesFilter(status, filter) {
    if (filter === 'all') return true;
    return statusGroup(status) === statusGroup(filter);
  }

  function getStatusMeta(status) {
    return STATUS_META[canonicalStatusLabel(status)] || STATUS_META['Not Started'];
  }

  function formatDate(val) {
    const s = String(val || '').trim();
    if (!s) return '';

    let d;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) d = new Date(s + 'T00:00:00');
    else d = new Date(s);

    if (isNaN(d)) return s;

    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  function statusToProgress(value) {
    const label = canonicalStatusLabel(value).toLowerCase();
    if (label === 'completed' || label === 'approved') return 100;
    if (label === 'submitted') return 80;
    if (label === 'needs revision') return 65;
    if (label === 'in progress') return 45;
    if (label === 'archived') return 100;
    return 0;
  }

  function isDeadlinePast(val) {
    const s = String(val || '').trim();
    if (!s) return false;
    const d = new Date(s + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return d < now;
  }

  function isDeadlineNear(val) {
    const s = String(val || '').trim();
    if (!s) return false;
    const d = new Date(s + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = (d - now) / 86400000;
    return diff >= 0 && diff <= 7;
  }

  function teamLabel(project) {
    const count = splitList(project?.members).length;
    if (!count) return '—';
    return `${count} ${count === 1 ? 'member' : 'members'}`;
  }

  function normalizeProject(project) {
    const priority = normalizePriorityLabel(project?.priority_level || project?.priority || 'Low');
    const status = canonicalStatusLabel(project?.status || 'Not Started');

    return {
      id: String(project?.id || project?.proj_id || '').trim(),
      proj_id: String(project?.proj_id || project?.id || '').trim(),
      title: String(project?.title || project?.proj_name || '').trim(),
      description: String(project?.description || '').trim(),
      priority_level: priority,
      priority,
      status,
      members: splitList(project?.members),
      supervisors: splitList(project?.supervisors || project?.supervisor),
      timeline_start: String(project?.timeline_start || project?.start_date || '').trim(),
      timeline_end: String(project?.timeline_end || project?.end_date || project?.deadline || '').trim(),
      deadline: String(project?.deadline || project?.timeline_end || project?.end_date || '').trim(),
      created_at: String(project?.created_at || '').trim(),
      created_by: String(project?.created_by || '').trim(),
      archived: canonicalStatusLabel(project?.status || '').toLowerCase() === 'archived',
      owner_name: String(
        project?.owner_name ||
        project?.created_by_name ||
        project?.creator_name ||
        project?.created_by ||
        ''
      ).trim()
    };
  }

  function sortProjects(a, b) {
    const pa = priorityRank(a.priority_level);
    const pb = priorityRank(b.priority_level);
    if (pa !== pb) return pa - pb;

    const da = String(a.deadline || a.timeline_end || '');
    const db = String(b.deadline || b.timeline_end || '');
    if (da !== db) return da.localeCompare(db);

    return String(a.title || '').localeCompare(String(b.title || ''));
  }

  async function loadProjects() {
    isLoading = true;
    loadError = '';

    try {
      const supervisorId = String(currentUser?.user_id || getCurrentUser()?.user_id || '').trim();
      if (!supervisorId) {
        allProjects = [];
        return;
      }

      const result = await callApiAction('list_proj_supervisor', {
        supervisor_user_id: supervisorId
      });

      allProjects = (result?.projects || []).map(normalizeProject).sort(sortProjects);
    } catch (error) {
      allProjects = [];
      loadError = error?.message || 'Unable to load supervisor projects.';
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    currentUser = getCurrentUser() || currentUser;
    unsubscribeAuth = subscribeToCurrentUser((u) => {
      currentUser = u;
      loadProjects();
    });
  });

  onDestroy(() => {
    if (typeof unsubscribeAuth === 'function') unsubscribeAuth();
    if (flashTimer) clearTimeout(flashTimer);
  });

  function setFlashMessage(message) {
    actionError = '';
    actionMessage = String(message || '').trim();
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      actionMessage = '';
    }, 2200);
  }

  function setFlashError(message) {
    actionMessage = '';
    actionError = String(message || '').trim();
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      actionError = '';
    }, 3000);
  }

  function openProject(project) {
    if (!project) return;
    activeView = 'Projects';
    filterStatus = 'all';
    filterPriority = 'all';
    filterIntern = 'all';
    searchQuery = String(project.title || '').trim();
  }

  async function archiveProject(project) {
    if (!project || project.archived) return;

    const supervisorId = String(currentUser?.user_id || getCurrentUser()?.user_id || '').trim();
    if (!supervisorId) {
      setFlashError('No supervisor account found.');
      return;
    }

    try {
      const result = await callApiAction('update_proj_intern', {
        proj_id: project.proj_id || project.id,
        user_id: supervisorId,
        status: 'Archived'
      });

      if (!result?.ok) {
        setFlashError(result?.error || 'Archive failed.');
        return;
      }

      allProjects = allProjects.map((item) => (
        item.id === project.id
          ? { ...item, archived: true, status: 'Archived' }
          : item
      ));
      if (String(searchQuery || '').trim().toLowerCase() === String(project.title || '').trim().toLowerCase()) {
        searchQuery = '';
      }
      setFlashMessage('Project archived.');
    } catch (error) {
      setFlashError(error?.message || 'Archive failed.');
    }
  }

  async function restoreProject(project) {
    if (!project) return;

    const supervisorId = String(currentUser?.user_id || getCurrentUser()?.user_id || '').trim();
    if (!supervisorId) {
      setFlashError('No supervisor account found.');
      return;
    }

    try {
      const result = await callApiAction('restore_proj_intern', {
        proj_id: project.proj_id || project.id,
        user_id: supervisorId
      });

      if (!result?.ok) {
        setFlashError(result?.error || 'Restore failed.');
        return;
      }

      allProjects = allProjects.map((item) => (
        item.id === project.id
          ? { ...item, archived: false, status: result.status || 'Not Started' }
          : item
      ));
      if (String(searchQuery || '').trim().toLowerCase() === String(project.title || '').trim().toLowerCase()) {
        searchQuery = '';
      }
      activeView = 'Projects';
      setFlashMessage('Project restored.');
    } catch (error) {
      setFlashError(error?.message || 'Restore failed.');
    }
  }

  $: {
    const fallbackUser = getCurrentUser();
    supervisorLabel = String(
      currentUser?.full_name ||
      currentUser?.email ||
      fallbackUser?.full_name ||
      fallbackUser?.email ||
      'your supervisor account'
    ).trim() || 'your supervisor account';
  }

  $: activeProjects = allProjects.filter((p) => !p.archived);
  $: archivedProjects = allProjects.filter((p) => p.archived);

  $: uniqueInterns = [...new Set(activeProjects.map((p) => p.owner_name).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  $: filteredProjects = activeProjects.filter((p) => {
    const matchPriority = filterPriority === 'all' || normalizePriorityLabel(p.priority_level) === filterPriority;
    const matchStatus = statusMatchesFilter(p.status, filterStatus);
    const matchIntern = filterIntern === 'all' || p.owner_name === filterIntern;

    if (!matchPriority || !matchStatus || !matchIntern) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        String(p.title || '').toLowerCase().includes(q) ||
        String(p.description || '').toLowerCase().includes(q) ||
        String(p.owner_name || '').toLowerCase().includes(q)
      );
    }

    return true;
  });

  $: totalProjects = activeProjects.length;
  $: inProgressCount = activeProjects.filter((p) => statusGroup(p.status) === 'in progress').length;
  $: submittedCount = activeProjects.filter((p) => statusGroup(p.status) === 'submitted').length;
  $: internCount = uniqueInterns.length;
  $: archivedCount = archivedProjects.length;
  $: overviewStatusRows = STATUS_OPTIONS.map((status) => ({
    status,
    count: activeProjects.filter((p) => statusMatchesFilter(p.status, status)).length,
    meta: getStatusMeta(status)
  }));
  $: upcomingDeadlines = activeProjects
    .filter((p) => String(p.timeline_end || p.deadline || '').trim())
    .sort((a, b) => String(a.timeline_end || a.deadline || '').localeCompare(String(b.timeline_end || b.deadline || '')))
    .slice(0, 5);
  $: overviewSnippets = activeProjects.slice(0, 6);
</script>

<section class="projects-page">
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
        <div class="stat-icon green"><Tag size={16} /></div>
      </div>
      <div class="stat-value">{submittedCount}</div>
      <div class="stat-label">Submitted</div>
    </div>
    <div class="stat-card violet">
      <div class="stat-card-top">
        <div style="flex:1"></div>
        <div class="stat-icon violet"><Users2 size={16} /></div>
      </div>
      <div class="stat-value">{internCount}</div>
      <div class="stat-label">Interns</div>
    </div>
  </div>

  <section class="quick-panel">
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
          <option value="all">All Status</option>
          {#each STATUS_OPTIONS as s}
            <option value={s}>{s}</option>
          {/each}
        </select>

        <select class="quick-priority" bind:value={filterPriority} aria-label="Filter by priority">
          <option value="all">All Priority</option>
          {#each PRIORITY_OPTIONS as p}
            <option value={p}>{p}</option>
          {/each}
        </select>

        {#if uniqueInterns.length > 0}
          <select class="quick-intern" bind:value={filterIntern} aria-label="Filter by intern">
            <option value="all">All Interns</option>
            {#each uniqueInterns as name}
              <option value={name}>{name}</option>
            {/each}
          </select>
        {/if}
      </div>
    </div>
  </section>

  {#if actionError}
    <div class="alert-error">{actionError}</div>
  {/if}
  {#if actionMessage}
    <div class="alert-success">{actionMessage}</div>
  {/if}

  {#if loadError}
    <div class="empty-state error-state">
      <FolderOpen size={28} />
      <div class="empty-title">Unable to load projects</div>
      <div class="empty-sub">{loadError}</div>
      <button class="retry-btn" on:click={loadProjects}>Retry</button>
    </div>
  {:else if isLoading}
    <div class="empty-state">
      <Loader2 size={22} class="spin" />
      <span>Loading projects...</span>
    </div>
  {:else if activeView === 'Overview'}
    {#if activeProjects.length === 0}
      <div class="empty-state">
        <FolderOpen size={32} />
        <div class="empty-title">No tagged projects yet</div>
        <div class="empty-sub">
          Projects tagged to your supervisor account will appear here once interns add them.
        </div>
      </div>
    {:else}
      <div class="ov-top-grid">
        <section class="card ov-card">
          <div class="ov-card-title">Project Breakdown</div>
          {#if overviewStatusRows.length === 0}
            <div class="ov-empty">No project data yet.</div>
          {:else}
            <div class="ov-status-bars">
              {#each overviewStatusRows as row}
                {@const pct = totalProjects > 0 ? Math.round((row.count / totalProjects) * 100) : 0}
                <div class="ov-bar-row">
                  <span class="ov-bar-label">{row.status}</span>
                  <div class="ov-bar-track">
                    <div class="progress-bar-inner" style="width:{pct}%"></div>
                  </div>
                  <span class="ov-bar-count"><span class="ov-ms-done">{row.count}</span>/{totalProjects}</span>
                </div>
              {/each}
            </div>
          {/if}
          {#if archivedCount > 0}
            <div class="ov-archived-note">
              <Archive size={11} /> {archivedCount} archived project{archivedCount === 1 ? '' : 's'}
            </div>
          {/if}
        </section>

        <section class="card ov-card">
          <div class="ov-card-title">Upcoming Deadlines</div>
          {#if upcomingDeadlines.length === 0}
            <div class="ov-empty">No upcoming deadlines.</div>
          {:else}
            <div class="ov-deadline-list">
              {#each upcomingDeadlines as p}
                {@const past = isDeadlinePast(p.timeline_end || p.deadline)}
                {@const near = !past && isDeadlineNear(p.timeline_end || p.deadline)}
                {@const sm = getStatusMeta(p.status)}
                <div class="ov-deadline-row">
                  <div class="ov-deadline-dot" class:ov-dot-past={past} class:ov-dot-near={near && !past}></div>
                  <div class="ov-deadline-info">
                    <div class="ov-deadline-name">{p.title}</div>
                    <div class="ov-deadline-date" class:ov-date-past={past} class:ov-date-near={near && !past}>
                      <CalendarDays size={11} /> {formatDate(p.timeline_end || p.deadline)}
                    </div>
                  </div>
                  <span class={"status-badge " + sm.cls}>{sm.label}</span>
                </div>
              {/each}
            </div>
          {/if}
        </section>
      </div>

      <section class="card ov-card">
        <div class="ov-card-head">
          <div class="ov-card-title">Assigned Projects</div>
          <button class="ov-view-all-btn" on:click={() => activeView = 'Projects'}>View all -&gt;</button>
        </div>
        {#if overviewSnippets.length === 0}
          <div class="ov-empty">No active projects.</div>
        {:else}
          <div class="ov-snippets-grid">
            {#each overviewSnippets as p (p.id)}
              {@const sm = getStatusMeta(p.status)}
              {@const pl = normalizePriorityLabel(p.priority_level)}
              {@const pct = statusToProgress(p.status)}
              {@const past = isDeadlinePast(p.timeline_end || p.deadline)}
              <div class="ov-snippet-card">
                <div class="ov-snippet-top">
                  <div class="ov-snippet-name">{p.title}</div>
                  <div class="ov-snippet-top-right">
                    <span class={"status-badge " + sm.cls}>{sm.label}</span>
                    <span class={"priority-badge priority-" + pl.toLowerCase()}>{pl}</span>
                  </div>
                </div>
                <div class="ov-snippet-progress">
                  <div class="progress-bar-outer">
                    <div class="progress-bar-inner" style="width:{pct}%"></div>
                  </div>
                  <span class="ov-snippet-pct">{pct}%</span>
                </div>
                {#if p.timeline_end || p.deadline}
                  <div class="ov-snippet-due" class:ov-date-past={past}>
                    <CalendarDays size={11} /> Due: {formatDate(p.timeline_end || p.deadline)}
                  </div>
                {/if}
                <div class="ov-snippet-actions">
                  <button class="sub-action-btn" on:click={() => openProject(p)}>
                    <Eye size={12} /> Open
                  </button>
                  <button class="sub-action-btn" title="Archive project" on:click={() => archiveProject(p)}>
                    <Archive size={12} /> Archive
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/if}
  {:else if activeView === 'Archive'}
    {#if archivedProjects.length === 0}
      <div class="empty-state">
        <Archive size={28} />
        <div class="empty-title">No archived projects</div>
        <div class="empty-sub">Archived projects will appear here.</div>
      </div>
    {:else}
      <section class="proj-table-panel archive-view">
        <header class="proj-table-header">
          <span class="proj-col-name">Archive</span>
          <span class="proj-col-actions">Actions</span>
        </header>
        <div class="proj-table-body">
          {#each archivedProjects as p (p.id)}
            <div class="proj-table-row proj-arc-row">
              <span class="proj-col-name proj-name-cell">
                <div class="proj-arc-title">{p.title}</div>
                {#if p.timeline_end || p.deadline}
                  <div class="proj-arc-meta">
                    <CalendarDays size={14} />
                    <span class="proj-arc-date">{formatDate(p.timeline_end || p.deadline)}</span>
                  </div>
                {/if}
              </span>
              <div class="proj-arc-corner">
                <button class="icon-btn restore" title="Restore project" aria-label="Restore project" on:click={() => restoreProject(p)}>
                  <RotateCcw size={16} />
                </button>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {:else if activeView === 'Projects'}
    {#if activeProjects.length === 0}
      <div class="empty-state">
        <FolderOpen size={32} />
        <div class="empty-title">No tagged projects yet</div>
        <div class="empty-sub">
          Projects tagged to your supervisor account will appear here once interns add them.
        </div>
      </div>
    {:else if filteredProjects.length === 0}
      <div class="empty-state">
        <FolderOpen size={22} />
        <div class="empty-title">No projects match the selected filters.</div>
        <div class="empty-sub">Try a different search, priority, or status.</div>
      </div>
    {:else}
    <div class="table-wrap">
      <table class="projects-table">
        <thead>
          <tr>
            <th>Priority</th>
            <th>Project Title</th>
            <th>Short Description</th>
            <th>Deadline</th>
            <th>Status</th>
            <th>Team</th>
            <th>Intern</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredProjects as p (p.id)}
            {@const pc = PRIORITY_COLORS[normalizePriorityLabel(p.priority_level)] || DEFAULT_PRIORITY_COLOR}
            {@const sm = getStatusMeta(p.status)}
            {@const past = isDeadlinePast(p.deadline)}
            {@const near = !past && isDeadlineNear(p.deadline)}
            <tr>
              <td>
                <span
                  class="priority-badge"
                  style="background:{pc.bg};color:{pc.text};border-color:{pc.border}"
                >
                  {normalizePriorityLabel(p.priority_level)}
                </span>
              </td>
              <td class="col-title">{p.title}</td>
              <td class="col-desc">{p.description || '—'}</td>
              <td>
                <span
                  class="deadline-cell"
                  class:deadline-past={past}
                  class:deadline-near={near}
                >
                  <CalendarDays size={11} />
                  {formatDate(p.deadline)}
                  {#if past}
                    <span class="deadline-tag">Overdue</span>
                  {:else if near}
                    <span class="deadline-tag near">Soon</span>
                  {/if}
                </span>
              </td>
              <td><span class={"status-badge " + sm.cls}>{sm.label}</span></td>
              <td class="col-team">{teamLabel(p)}</td>
              <td class="col-intern">{p.owner_name || '—'}</td>
              <td class="col-actions">
                <button class="icon-btn" title="Open project" aria-label="Open project" on:click={() => openProject(p)}>
                  <Eye size={16} />
                </button>
                <button class="icon-btn archive" title="Archive project" aria-label="Archive project" on:click={() => archiveProject(p)}>
                  <Archive size={16} />
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="projects-cards-mobile">
      {#each filteredProjects as p (p.id)}
        {@const pc = PRIORITY_COLORS[normalizePriorityLabel(p.priority_level)] || DEFAULT_PRIORITY_COLOR}
        {@const sm = getStatusMeta(p.status)}
        {@const past = isDeadlinePast(p.deadline)}
        {@const near = !past && isDeadlineNear(p.deadline)}
        <div class="project-card">
          <div class="project-card-header">
            <div
              class="priority-badge"
              style="background:{pc.bg};color:{pc.text};border-color:{pc.border}"
            >
              <Tag size={10} /> {normalizePriorityLabel(p.priority_level)}
            </div>
            <span class={"status-badge " + sm.cls}>{sm.label}</span>
          </div>
          <div class="project-title">{p.title}</div>
          {#if p.description}
            <p class="project-desc">{p.description}</p>
          {/if}
          <div class="project-meta">
            {#if p.deadline}
              <div class="meta-item" class:deadline-past={past} class:deadline-near={near}>
                <CalendarDays size={12} /> {formatDate(p.deadline)}
                {#if past}
                  <span class="deadline-tag">Overdue</span>
                {:else if near}
                  <span class="deadline-tag near">Soon</span>
                {/if}
              </div>
            {/if}
            <div class="meta-item team-chip"><Users2 size={12} /> {teamLabel(p)}</div>
            <div class="meta-item intern-chip">Intern: {p.owner_name || '—'}</div>
          </div>
          <div class="project-card-footer">
            <button class="sub-action-btn" on:click={() => openProject(p)}>
              <Eye size={12} /> Open
            </button>
            <button class="sub-action-btn" on:click={() => archiveProject(p)}>
              <Archive size={12} /> Archive
            </button>
          </div>
        </div>
      {/each}
    </div>
    {/if}
  {/if}
</section>

<style>
  .projects-page { padding: 4px 0 12px; display: flex; flex-direction: column; gap: 10px; font-family: inherit; }

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
  .stat-icon.blue { background: #dbeafe; color: #2563eb; }
  .stat-icon.amber { background: #fef3c7; color: #d97706; }
  .stat-icon.green { background: #dcfce7; color: #16a34a; }
  .stat-icon.violet { background: #ede9fe; color: #7c3aed; }
  :global(body.dark) .stat-icon.blue { background: #1e3a5f; color: #60a5fa; }
  :global(body.dark) .stat-icon.amber { background: #3b2600; color: #fbbf24; }
  :global(body.dark) .stat-icon.green { background: #052e16; color: #4ade80; }
  :global(body.dark) .stat-icon.violet { background: #2e1065; color: #a78bfa; }
  .stat-value { font-size: 22px; font-weight: 700; color: var(--color-heading); line-height: 1; }
  .stat-label { font-size: 11.5px; color: var(--color-sidebar-text); }

  .quick-panel {
    background: linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface) 100%);
    border: 1px solid var(--color-border);
    border-radius: 0.9rem;
    padding: 0.48rem 0.8rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-sizing: border-box;
  }
  .quick-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 0.75rem;
  }
  .view-controls { display: flex; gap: 0.35rem; flex-wrap: wrap; }
  .view-controls .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-right: 0.4rem;
    border-radius: 0.55rem;
    padding: 0.32rem 0.6rem;
    background: transparent;
    border: 1px solid var(--color-border);
    font-size: 0.82rem;
    color: var(--color-sidebar-text);
    cursor: pointer;
  }
  .view-controls .btn.active {
    background: var(--color-soft);
    color: var(--color-heading);
    border-color: var(--color-border);
  }
  .view-controls .btn:hover { color: var(--color-text); }
  .quick-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    align-items: center;
    justify-content: flex-end;
  }
  .search-wrap {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0 0.7rem;
    color: var(--color-muted);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.7rem;
  }
  .quick-actions select,
  .quick-status,
  .quick-priority,
  .quick-intern {
    padding: 0.34rem 0.6rem;
    border-radius: 0.7rem;
    font-size: 0.85rem;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
  }
  .search-input {
    border: 0;
    outline: none;
    background: transparent;
    color: var(--color-text);
    font-size: 0.85rem;
    width: 9rem;
    padding: 0.34rem 0;
  }
  .quick-actions select:focus,
  .quick-status:focus,
  .quick-priority:focus,
  .quick-intern:focus,
  .search-input:focus {
    outline: none;
    border-color: #2563eb;
  }
  :global(body.dark) .quick-panel { background: #1f2937; border-color: #374151; }
  :global(body.dark) .search-wrap { background: #1f2937; border-color: #374151; }
  :global(body.dark) .quick-actions select,
  :global(body.dark) .quick-status,
  :global(body.dark) .quick-priority,
  :global(body.dark) .quick-intern {
    background: #1f2937;
    border-color: #374151;
    color: #f1f5f9;
  }
  :global(body.dark) .search-input { color: #f1f5f9; }

  .alert-success {
    padding: 10px 14px;
    border-radius: 8px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #15803d;
    font-size: 13px;
  }
  .alert-error {
    padding: 10px 14px;
    border-radius: 8px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    font-size: 13px;
  }
  :global(body.dark) .alert-success { background: #052e16; border-color: #166534; color: #4ade80; }
  :global(body.dark) .alert-error { background: #2d0a0a; border-color: #7f1d1d; color: #f87171; }

  .table-wrap {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    overflow: auto;
  }
  .projects-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  .projects-table thead tr { background: var(--color-soft); }
  .projects-table th {
    padding: 10px 14px;
    text-align: left;
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--color-sidebar-text);
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }
  .projects-table td {
    padding: 10px 14px;
    vertical-align: middle;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text);
  }
  .projects-table tbody tr:last-child td { border-bottom: none; }
  .projects-table tbody tr:hover { background: var(--color-soft); }
  .col-title { font-weight: 600; min-width: 140px; font-size: 0.88rem; }
  .col-desc { color: var(--color-sidebar-text); max-width: 220px; font-size: 0.78rem; }
  .col-team,
  .col-intern {
    white-space: nowrap;
    font-weight: 500;
  }
  .col-team { color: #2563eb; }
  .col-intern { color: #2563eb; }
  .col-actions {
    white-space: nowrap;
    text-align: center;
  }
  .projects-table th:last-child { text-align: center; }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    padding: 6px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-accent);
    cursor: pointer;
    margin: 0 0.2rem;
    transition: transform 0.12s, background 0.12s, border-color 0.12s;
  }
  .icon-btn:hover {
    background: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface));
    border-color: var(--color-accent);
    transform: translateY(-1px);
  }
  .icon-btn.archive {
    background: transparent;
    border-color: rgba(255,255,255,0.06);
    color: var(--color-accent);
  }
  .icon-btn.restore {
    background: transparent;
    border-color: rgba(255,255,255,0.06);
    color: #10b981;
  }
  .icon-btn.restore:hover {
    background: rgba(16,185,129,0.1);
    border-color: #10b981;
  }

  .priority-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 20px;
    font-size: 10.5px;
    font-weight: 600;
    border: 1px solid;
    white-space: nowrap;
  }
  .status-badge {
    display: inline-block;
    padding: 3px 9px;
    border-radius: 20px;
    font-size: 10.5px;
    font-weight: 600;
    white-space: nowrap;
  }
  .status-not-started { background: #f1f5f9; color: #64748b; }
  .status-in-progress { background: #fffbeb; color: #d97706; }
  .status-submitted { background: #f5f3ff; color: #7c3aed; }
  .status-needs-revision { background: #fef2f2; color: #dc2626; }
  .status-approved { background: #f0fdf4; color: #16a34a; }
  .status-pending { background: #fefce8; color: #ca8a04; }
  :global(body.dark) .status-not-started { background: #1e293b; color: #94a3b8; }
  :global(body.dark) .status-in-progress { background: #3b2600; color: #fbbf24; }
  :global(body.dark) .status-submitted { background: #2e1065; color: #c084fc; }
  :global(body.dark) .status-needs-revision { background: #2d0a0a; color: #f87171; }
  :global(body.dark) .status-approved { background: #052e16; color: #4ade80; }
  :global(body.dark) .status-pending { background: #3b2600; color: #fbbf24; }

  .deadline-cell { display: inline-flex; align-items: center; gap: 4px; font-size: 0.78rem; }
  .deadline-cell.deadline-past { color: #dc2626; }
  .deadline-cell.deadline-near { color: #d97706; }
  .deadline-tag {
    display: inline-block;
    font-size: 10px;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 20px;
    background: #fef2f2;
    color: #dc2626;
  }
  .deadline-tag.near { background: #fffbeb; color: #d97706; }
  :global(body.dark) .deadline-tag { background: #2d0a0a; color: #f87171; }
  :global(body.dark) .deadline-tag.near { background: #3b2600; color: #fbbf24; }

  .ov-top-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  @media (max-width: 680px) {
    .ov-top-grid { grid-template-columns: 1fr; }
  }

  .ov-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.9rem;
    padding: 1rem 1.15rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  :global(body.dark) .ov-card { background: #161c27 !important; border-color: #ffffff0f !important; }

  .ov-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 1rem;
  }
  .ov-card-title {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--color-heading);
    letter-spacing: -0.01em;
  }
  .ov-empty { font-size: 0.83rem; color: var(--color-sidebar-text); padding: 0.25rem 0.1rem; }

  .ov-status-bars { display: flex; flex-direction: column; gap: 0.55rem; }
  .ov-bar-row {
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }
  .ov-bar-label {
    font-size: 0.78rem;
    color: var(--color-heading);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 120px;
    flex-shrink: 0;
  }
  .ov-bar-track { flex: 1; height: 5px; background: var(--color-border); border-radius: 999px; overflow: hidden; }
  .ov-bar-count { font-size: 0.77rem; color: var(--color-sidebar-text); white-space: nowrap; }
  .ov-ms-done { font-weight: 700; color: var(--color-heading); }
  .ov-archived-note {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.75rem;
    color: var(--color-sidebar-text);
  }

  .ov-deadline-list { display: flex; flex-direction: column; gap: 0.55rem; }
  .ov-deadline-row {
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }
  .ov-deadline-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #2563eb;
    flex-shrink: 0;
  }
  .ov-dot-past { background: #dc2626; }
  .ov-dot-near { background: #d97706; }
  .ov-deadline-info { min-width: 0; flex: 1; }
  .ov-deadline-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-heading);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ov-deadline-date {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.77rem;
    color: var(--color-sidebar-text);
  }
  .ov-date-past { color: #dc2626; }
  .ov-date-near { color: #d97706; }
  .ov-view-all-btn {
    background: transparent;
    border: 0;
    color: #2563eb;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
  }

  .ov-snippets-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 0.75rem;
  }
  .ov-snippet-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 0.8rem 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  :global(body.dark) .ov-snippet-card { background: #0d1117 !important; border-color: #ffffff0f !important; }
  .ov-snippet-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .ov-snippet-name {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--color-heading);
    min-width: 0;
  }
  .ov-snippet-top-right { display: flex; gap: 0.35rem; flex-wrap: wrap; justify-content: flex-end; }
  .ov-snippet-progress {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .progress-bar-outer { height: 10px; background: var(--color-border); border-radius: 999px; overflow: hidden; }
  .progress-bar-inner { height: 100%; background: linear-gradient(90deg, #10b981, #3b82f6); border-radius: 999px; transition: width 350ms ease; }
  .ov-snippet-progress .progress-bar-outer { flex: 1; }
  .ov-snippet-pct { font-size: 0.77rem; color: var(--color-sidebar-text); white-space: nowrap; }
  .ov-snippet-due { font-size: 0.77rem; color: var(--color-sidebar-text); display: inline-flex; align-items: center; gap: 0.3rem; }
  .ov-snippet-actions { display: flex; gap: 0.45rem; flex-wrap: wrap; }

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
    grid-template-columns: minmax(0,1fr) 6rem;
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
    grid-template-columns: minmax(0,1fr) 6rem;
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
  .proj-name-cell { font-size: 0.88rem; font-weight: 600; color: var(--color-heading); }
  .proj-arc-row { position: relative; }
  .proj-arc-corner { display: flex; justify-content: flex-end; }
  .proj-arc-title { font-size: 0.88rem; font-weight: 600; color: var(--color-heading); }
  .proj-arc-meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.35rem;
    color: var(--color-sidebar-text);
    font-size: 0.77rem;
  }
  .proj-arc-date { font-weight: 700; color: var(--color-heading); }

  .sub-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.38rem 0.85rem;
    border-radius: 0.45rem;
    font-size: 0.82rem;
    font-weight: 500;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-heading);
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .sub-action-btn:hover { background: var(--color-soft); border-color: var(--color-accent); }
  :global(body.dark) .sub-action-btn { background: #161c27; border-color: #ffffff10; }

  .projects-cards-mobile { display: grid; grid-template-columns: 1fr; gap: 12px; }
  .project-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .project-card-header { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .project-title { font-size: 14px; font-weight: 600; color: var(--color-heading); }
  .project-desc { font-size: 12.5px; color: var(--color-sidebar-text); margin: 0; line-height: 1.5; }
  .project-meta { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .meta-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--color-sidebar-text);
  }
  .meta-item.deadline-past { color: #dc2626; }
  .meta-item.deadline-near { color: #d97706; }
  .team-chip { color: #2563eb; font-weight: 500; }
  .intern-chip { color: #2563eb; font-weight: 500; }
  .project-card-footer {
    display: flex;
    gap: 6px;
    margin-top: 4px;
    padding-top: 10px;
    border-top: 1px solid var(--color-border);
  }
  .retry-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    background: #2563eb;
    color: #fff;
    border: none;
    cursor: pointer;
  }
  .retry-btn:hover { background: #1d4ed8; }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 48px 20px;
    color: var(--color-sidebar-text);
    text-align: center;
  }
  .empty-title { font-size: 14px; font-weight: 600; color: var(--color-text); }
  .empty-sub { font-size: 12.5px; }

  :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  :global(body.dark) .table-wrap { background: #1f2937; border-color: #374151; }
  :global(body.dark) .projects-table thead tr { background: #111827; }
  :global(body.dark) .projects-table tbody tr:hover { background: #111827; }
  :global(body.dark) .project-card { background: #1f2937; border-color: #374151; }
  :global(body.dark) .proj-table-panel { background: #0d1117 !important; border-color: #ffffff0f !important; }
  :global(body.dark) .proj-table-header { background: #161c27 !important; border-bottom-color: #ffffff0f !important; color: #e5edf8 !important; }
  :global(body.dark) .proj-table-body { background: #0d1117 !important; }
  :global(body.dark) .proj-table-row { background: #161c27 !important; border-color: #ffffff0f !important; }
  :global(body.dark) .ov-card { background: #161c27 !important; border-color: #ffffff0f !important; }
  :global(body.dark) .ov-snippet-card { background: #0d1117 !important; border-color: #ffffff0f !important; }
  :global(body.dark) .icon-btn { background: #161c27; border-color: #ffffff10; }
  :global(body.dark) .retry-btn { background: #1d4ed8; }
  :global(body.dark) .priority-badge { filter: brightness(.85) saturate(.9); }

  @media (max-width: 820px) {
    .quick-head { flex-direction: column; align-items: stretch; }
    .quick-actions { justify-content: flex-start; }
    .search-wrap { width: 100%; }
    .search-input { width: 100%; }
  }

  @media (max-width: 700px) {
    .table-wrap { display: none; }
    .projects-cards-mobile { display: grid; }
  }

  @media (min-width: 701px) {
    .projects-cards-mobile { display: none; }
  }
</style>
