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
    <div class="stat-card">
      <div class="stat-icon tone-blue"><FolderOpen size={16} /></div>
      <div class="stat-body">
        <div class="stat-label">Total Projects</div>
        <div class="stat-value">{totalProjects}</div>
        <div class="stat-sub">Projects tagged to you</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon tone-amber"><Clock3 size={16} /></div>
      <div class="stat-body">
        <div class="stat-label">In Progress</div>
        <div class="stat-value">{inProgressCount}</div>
        <div class="stat-sub">Currently active projects</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon tone-green"><Tag size={16} /></div>
      <div class="stat-body">
        <div class="stat-label">Submitted</div>
        <div class="stat-value">{submittedCount}</div>
        <div class="stat-sub">Awaiting review or next steps</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon tone-violet"><Users2 size={16} /></div>
      <div class="stat-body">
        <div class="stat-label">Interns</div>
        <div class="stat-value">{internCount}</div>
        <div class="stat-sub">Contributors on your tagged projects</div>
      </div>
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
          <div class="ov-card-title">Milestone Summary</div>
          {#if overviewStatusRows.length === 0}
            <div class="ov-empty">No milestone data yet.</div>
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
                  <span class={"proj-status-pill " + sm.cls}>{sm.label}</span>
                </div>
              {/each}
            </div>
          {/if}
        </section>
      </div>

      <section class="card ov-card">
        <div class="ov-card-head">
          <div class="ov-card-title">Tagged Projects</div>
          <button class="ov-view-all-btn" on:click={() => activeView = 'Projects'}>View all -&gt;</button>
        </div>
        {#if overviewSnippets.length === 0}
          <div class="ov-empty">No tagged projects yet.</div>
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
                    <span class={"proj-status-pill " + sm.cls}>{sm.label}</span>
                    <span class={"proj-priority-pill priority-" + pl.toLowerCase()}>{pl}</span>
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

      <div class="ov-bottom-grid">
        <section class="card ov-card">
          <div class="ov-card-head">
            <div class="ov-card-title">Recent Activity</div>
            <button class="ov-refresh-btn" type="button" title="Refresh">
              <RotateCcw size={13} />
            </button>
          </div>
          <div class="ov-empty">No recent activity found.</div>
        </section>
      </div>
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
      <section class="card ov-card">
        <div class="ov-card-head">
          <div class="ov-card-title">Projects Tagged to You</div>
        </div>
        <div class="ov-snippets-grid">
          {#each filteredProjects as p (p.id)}
            {@const sm = getStatusMeta(p.status)}
            {@const pl = normalizePriorityLabel(p.priority_level)}
            {@const pct = statusToProgress(p.status)}
            {@const past = isDeadlinePast(p.timeline_end || p.deadline)}
            <div class="ov-snippet-card">
              <div class="ov-snippet-top">
                <div class="ov-snippet-name">{p.title}</div>
                <div class="ov-snippet-top-right">
                  <span class={"proj-status-pill " + sm.cls}>{sm.label}</span>
                  <span class={"proj-priority-pill priority-" + pl.toLowerCase()}>{pl}</span>
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
              <div class="project-meta">
                <div class="meta-item team-chip"><Users2 size={12} /> {teamLabel(p)}</div>
                <div class="meta-item intern-chip">Intern: {p.owner_name || '-'}</div>
              </div>
              <div class="ov-snippet-actions">
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
      </section>
    {/if}
  {/if}
</section>

<style>
  .projects-page { padding: 8px 0 14px; display: flex; flex-direction: column; gap: 14px; }

  .stat-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 0; }
  .stat-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03);
    padding: 18px 20px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    transition: box-shadow 0.2s, transform 0.2s;
  }
  .stat-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1); }
  .stat-icon { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; flex-shrink: 0; }
  .stat-body { display: flex; flex-direction: column; gap: 4px; }
  .stat-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: #000000; }
  .stat-value { font-size: 24px; font-weight: 700; letter-spacing: -0.8px; line-height: 1; color: #0f172a; }
  .stat-sub { margin-top: 4px; font-size: 11.5px; color: #64748b; }
  .tone-blue { background: rgba(37, 99, 235, 0.12); color: #2563eb; }
  .tone-amber { background: rgba(217, 119, 6, 0.12); color: #d97706; }
  .tone-green { background: rgba(22, 163, 74, 0.12); color: #16a34a; }
  .tone-violet { background: rgba(124, 58, 237, 0.14); color: #7c3aed; }

  .quick-panel { background: transparent !important; padding: 0; border-radius: 0; border: none !important; box-shadow: none !important; display: flex; align-items: center; justify-content: space-between; }
  .quick-head { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 0.75rem; flex-wrap: nowrap; }
  .view-controls { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; }
  .view-controls .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border-radius: 0.7rem;
    padding: 0.32rem 0.72rem;
    background: transparent;
    border: 1px solid var(--color-border);
    font-size: 0.84rem;
    height: 2.15rem;
    line-height: 1;
    color: var(--color-sidebar-text);
    cursor: pointer;
  }
  .view-controls .btn.active { background: var(--color-soft); color: var(--color-heading); border-color: var(--color-border); }
  .quick-actions { display: flex; gap: 0.5rem; align-items: center; margin-left: auto; flex-wrap: nowrap; }
  .search-wrap { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0 0.7rem; color: var(--color-muted); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 0.7rem; height: 2.15rem; }
  .search-input { border: 0; background: transparent; color: var(--color-text); font-size: 0.85rem; width: 11.5rem; outline: none; padding: 0; height: 100%; }
  .quick-actions select, .quick-status, .quick-priority {
    padding: 0 0.6rem;
    border-radius: 0.7rem;
    font-size: 0.85rem;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    height: 2.15rem;
  }

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
    justify-content: flex-start;
    gap: 8px;
    padding: 28px 20px 24px;
    min-height: 210px;
    color: var(--color-sidebar-text);
    text-align: center;
  }
  .empty-title { font-size: 14px; font-weight: 600; color: var(--color-text); }
  .empty-sub { font-size: 12.5px; }

  .ov-top-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .ov-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.9rem;
    padding: 1rem 1.15rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .ov-bottom-grid { display: grid; grid-template-columns: 1fr; gap: 0.8rem; align-items: start; }
  .ov-card-head { display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 1rem; }
  .ov-card-title { font-size: 0.85rem; font-weight: 700; color: var(--color-heading); letter-spacing: -0.01em; }
  .ov-view-all-btn { background: transparent; border: 0; color: #2563eb; font-size: 0.82rem; font-weight: 600; cursor: pointer; }
  .ov-refresh-btn {
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 0.2rem 0.55rem;
    color: var(--color-sidebar-text);
    cursor: pointer;
    line-height: 1.2;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .ov-empty { font-size: 0.83rem; color: var(--color-sidebar-text); padding: 0.25rem 0.1rem; }

  .ov-status-bars { display: flex; flex-direction: column; gap: 0.55rem; }
  .ov-bar-row { display: grid; grid-template-columns: 7.5rem 1fr 2.2rem; align-items: center; gap: 0.65rem; }
  .ov-bar-label { font-size: 0.75rem; color: var(--color-heading); white-space: nowrap; }
  .ov-bar-track { height: 8px; background: var(--color-border); border-radius: 999px; overflow: hidden; }
  .ov-bar-count { font-size: 0.78rem; color: var(--color-heading); text-align: right; white-space: nowrap; }
  .ov-ms-done { font-weight: 700; color: var(--color-heading); }
  .ov-archived-note { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; color: var(--color-sidebar-text); }

  .ov-deadline-list { display: flex; flex-direction: column; gap: 0.55rem; }
  .ov-deadline-row { display: flex; align-items: center; gap: 0.65rem; }
  .ov-deadline-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--color-border);
    border: 1.5px solid var(--color-border);
  }
  .ov-deadline-dot.ov-dot-near { background: #fbbf24; border-color: #f59e0b; }
  .ov-deadline-dot.ov-dot-past { background: #ef4444; border-color: #dc2626; }
  .ov-deadline-info { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 1px; }
  .ov-deadline-name { font-size: 0.85rem; font-weight: 600; color: var(--color-heading); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ov-deadline-date { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.77rem; color: var(--color-sidebar-text); }
  .ov-date-past { color: #dc2626; }
  .ov-date-near { color: #d97706; }

  .ov-snippets-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.8rem; }
  .ov-snippet-card {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1.1rem 1.2rem;
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
    background: var(--color-soft);
    transition: border-color 140ms, box-shadow 140ms;
  }
  .ov-snippet-card:hover { border-color: var(--color-accent); box-shadow: 0 6px 18px -14px rgba(15,23,42,.3); }
  .ov-snippet-top { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .ov-snippet-name { font-size: 0.88rem; font-weight: 700; color: var(--color-heading); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ov-snippet-top-right { display: flex; align-items: center; gap: 0.5rem; }
  .ov-snippet-progress { display: flex; align-items: center; gap: 0.55rem; }
  .ov-snippet-progress .progress-bar-outer { flex: 1; }
  .ov-snippet-pct { font-size: 0.78rem; font-weight: 700; color: var(--color-heading); white-space: nowrap; width: 32px; text-align: right; }
  .ov-snippet-due { font-size: 0.77rem; color: var(--color-sidebar-text); display: flex; align-items: center; gap: 4px; }
  .ov-snippet-actions { display: flex; gap: 0.4rem; margin-top: 0.1rem; }

  .project-meta { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .meta-item { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--color-sidebar-text); }
  .team-chip { color: #2563eb; font-weight: 500; }
  .intern-chip { color: #2563eb; font-weight: 500; }

  .progress-bar-outer { height: 10px; background: var(--color-border); border-radius: 999px; overflow: hidden; }
  .progress-bar-inner { height: 100%; background: linear-gradient(90deg, #10b981, #3b82f6); border-radius: 999px; transition: width 350ms ease; }

  .proj-status-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.22rem 0.6rem;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--color-text);
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.04);
    white-space: nowrap;
  }
  .proj-status-pill.status-not-started { background: rgba(249,115,22,0.08); color: #f38f49; border-color: rgba(249,115,22,0.12); }
  .proj-status-pill.status-in-progress { background: rgba(16,185,129,0.08); color: #10b981; border-color: rgba(16,185,129,0.12); }
  .proj-status-pill.status-submitted { background: rgba(124,58,237,0.08); color: #7c3aed; border-color: rgba(124,58,237,0.12); }
  .proj-status-pill.status-needs-revision { background: rgba(239,68,68,0.08); color: #ef4444; border-color: rgba(239,68,68,0.12); }
  .proj-status-pill.status-approved { background: rgba(59,130,246,0.08); color: #3b82f6; border-color: rgba(59,130,246,0.12); }
  .proj-status-pill.status-pending { background: rgba(251,146,60,0.10); color: #ea7a1e; border-color: rgba(251,146,60,0.18); }

  .proj-priority-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.22rem 0.6rem;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--color-text);
    background: rgba(99,102,241,0.06);
    border: 1px solid rgba(99,102,241,0.12);
    white-space: nowrap;
  }
  .proj-priority-pill.priority-low { background: rgba(56,189,248,0.08); color: #38bdf8; border-color: rgba(56,189,248,0.12); }
  .proj-priority-pill.priority-medium { background: rgba(16,185,129,0.08); color: #10b981; border-color: rgba(16,185,129,0.12); }
  .proj-priority-pill.priority-high { background: rgba(239,68,68,0.08); color: #ef4444; border-color: rgba(239,68,68,0.12); }

  .sub-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
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
    flex: 1;
  }
  .sub-action-btn:hover { background: var(--color-soft); border-color: var(--color-accent); }

  .proj-table-panel {
    overflow: hidden;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.9rem;
  }
  .proj-table-header {
    display: grid;
    grid-template-columns: minmax(0,1fr) 3.5rem;
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
  .proj-table-header > .proj-col-actions { justify-self: end; }
  .proj-table-body { display: grid; background: var(--color-soft); padding: 0.4rem; gap: 0.4rem; }
  .proj-table-row {
    display: grid;
    grid-template-columns: minmax(0,1fr) 3.5rem;
    align-items: center;
    gap: 0.9rem;
    padding: 0.85rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: 0.65rem;
    background: var(--color-surface);
    transition: border-color 140ms ease, box-shadow 140ms ease;
  }
  .proj-table-row:hover { border-color: var(--color-accent); box-shadow: 0 8px 22px -20px rgba(15,23,42,.35); }
  .proj-name-cell { font-size: 0.88rem; font-weight: 600; color: var(--color-heading); }
  .proj-arc-title { font-size: 0.88rem; font-weight: 600; color: var(--color-heading); }
  .proj-arc-meta { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.35rem; color: var(--color-sidebar-text); font-size: 0.77rem; }
  .proj-arc-date { font-weight: 700; color: var(--color-heading); }
  .proj-arc-corner { display: flex; justify-content: flex-end; }

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
    transition: transform 0.12s, background 0.12s, border-color 0.12s;
  }
  .icon-btn:hover { background: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface)); border-color: var(--color-accent); transform: translateY(-1px); }
  .icon-btn.restore { background: transparent; border-color: rgba(255,255,255,0.06); color: #10b981; }
  .icon-btn.restore:hover { background: rgba(16,185,129,0.1); border-color: #10b981; }

  :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  :global(body.dark) .stat-card { background: #161c27; border-color: rgba(255, 255, 255, 0.06); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18); }
  :global(body.dark) .stat-card:hover { box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35); }
  :global(body.dark) .stat-label { color: #ffffff; }
  :global(body.dark) .stat-value { color: #f1f5f9; }
  :global(body.dark) .stat-sub { color: #94a3b8; }
  :global(body.dark) .tone-blue { background: rgba(59, 130, 246, 0.18); color: #60a5fa; }
  :global(body.dark) .tone-amber { background: rgba(245, 158, 11, 0.12); color: #f59e0b; }
  :global(body.dark) .tone-green { background: rgba(34, 197, 94, 0.14); color: #22c55e; }
  :global(body.dark) .tone-violet { background: rgba(124, 58, 237, 0.2); color: #a78bfa; }
  :global(body.dark) .search-wrap { background: #1f2937; border-color: #374151; }
  :global(body.dark) .quick-actions select,
  :global(body.dark) .quick-status,
  :global(body.dark) .quick-priority { background: #1f2937; border-color: #374151; color: #f1f5f9; }
  :global(body.dark) .search-input { color: #f1f5f9; }
  :global(body.dark) .alert-success { background: #052e16; border-color: #166534; color: #4ade80; }
  :global(body.dark) .alert-error { background: #2d0a0a; border-color: #7f1d1d; color: #f87171; }
  :global(body.dark) .retry-btn { background: #1d4ed8; }
  :global(body.dark) .ov-card { background: #161c27 !important; border-color: #ffffff0f !important; }
  :global(body.dark) .ov-snippet-card { background: #0d1117 !important; border-color: #ffffff0f !important; }
  :global(body.dark) .sub-action-btn { background: #161c27; border-color: #ffffff10; }
  :global(body.dark) .proj-table-panel { background: #0d1117 !important; border-color: #ffffff0f !important; }
  :global(body.dark) .proj-table-header { background: #161c27 !important; border-bottom-color: #ffffff0f !important; color: #e5edf8 !important; }
  :global(body.dark) .proj-table-body { background: #0d1117 !important; }
  :global(body.dark) .proj-table-row { background: #161c27 !important; border-color: #ffffff0f !important; }
  :global(body.dark) .icon-btn { background: #161c27; border-color: #ffffff10; }

  @media (max-width: 1080px) {
    .stat-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .quick-head { flex-direction: column; align-items: stretch; gap: 0.65rem; }
    .quick-actions { margin-left: 0; width: 100%; flex-wrap: wrap; justify-content: flex-start; }
  }

  @media (max-width: 768px) {
    .stat-cards { grid-template-columns: 1fr; gap: 10px; }
    .stat-card { padding: 16px; }
    .ov-top-grid { grid-template-columns: 1fr; }
    .quick-actions { width: 100%; flex-wrap: wrap; gap: 0.5rem; }
    .quick-actions > * { width: 100%; }
    .quick-actions .search-wrap,
    .quick-actions .quick-status,
    .quick-actions .quick-priority { width: 100%; }
    .search-input { width: 100%; }
    .ov-snippets-grid { grid-template-columns: 1fr; }
    .project-meta { flex-direction: column; align-items: flex-start; gap: 6px; }
  }
</style>
