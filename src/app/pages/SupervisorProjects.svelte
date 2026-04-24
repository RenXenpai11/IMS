<script>
// @ts-nocheck
  import { onMount, onDestroy } from 'svelte';
  import { getCurrentUser, subscribeToCurrentUser } from '../lib/auth.js';
  import {
    FolderOpen, CheckCircle2, Clock3, Users2, CalendarDays,
    Tag, ExternalLink, Loader2, Search
  } from 'lucide-svelte';

  export let currentUser = null;

  // ── State ─────────────────────────────────────────────────────────────────
  let allProjects   = [];
  let isLoading     = false;
  let filterPriority = 'all';
  let filterStatus   = 'all';
  let filterIntern   = 'all';
  let searchQuery    = '';
  let unsubscribeAuth;

  const PRIORITY_OPTIONS = ['1st', '2nd', '3rd', '4th', '5th'];
  const STATUS_OPTIONS   = ['Not Started', 'In Progress', 'Completed'];

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

  // ── Helpers ───────────────────────────────────────────────────────────────
  function formatDate(val) {
    const s = String(val || '').trim();
    if (!s) return '';
    const d = new Date(s + 'T00:00:00');
    if (isNaN(d)) return s;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
  }

  function isDeadlinePast(val) {
    const s = String(val || '').trim();
    if (!s) return false;
    const d = new Date(s + 'T00:00:00');
    const now = new Date(); now.setHours(0,0,0,0);
    return d < now;
  }

  function isDeadlineNear(val) {
    const s = String(val || '').trim();
    if (!s) return false;
    const d = new Date(s + 'T00:00:00');
    const now = new Date(); now.setHours(0,0,0,0);
    const diff = (d - now) / 86400000;
    return diff >= 0 && diff <= 7;
  }

  // ── Load all projects from all known localStorage keys ────────────────────
  // In a real backend, this would be a callBackend('list_all_projects', { supervisor_id })
  function loadAllProjects() {
    isLoading = true;
    try {
      const result = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('ims-projects-')) continue;
        try {
          const raw = localStorage.getItem(key);
          if (raw) { result.push(...JSON.parse(raw)); }
        } catch { /* skip */ }
      }
      // Sort: priority asc, then deadline asc
      result.sort((a, b) => {
        const pa = PRIORITY_OPTIONS.indexOf(a.priority_level);
        const pb = PRIORITY_OPTIONS.indexOf(b.priority_level);
        if (pa !== pb) return pa - pb;
        return String(a.deadline || '').localeCompare(String(b.deadline || ''));
      });
      allProjects = result;
    } finally { isLoading = false; }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  onMount(() => {
    currentUser = getCurrentUser();
    loadAllProjects();
    unsubscribeAuth = subscribeToCurrentUser(u => { currentUser = u; loadAllProjects(); });
  });
  onDestroy(() => { if (typeof unsubscribeAuth === 'function') unsubscribeAuth(); });

  // ── Derived ───────────────────────────────────────────────────────────────
  $: uniqueInterns = [...new Set(allProjects.map(p => p.owner_name).filter(Boolean))].sort();

  $: filteredProjects = allProjects.filter(p => {
    if (filterPriority !== 'all' && p.priority_level !== filterPriority) return false;
    if (filterStatus   !== 'all' && p.status !== filterStatus)           return false;
    if (filterIntern   !== 'all' && p.owner_name !== filterIntern)       return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        String(p.title       || '').toLowerCase().includes(q) ||
        String(p.description || '').toLowerCase().includes(q) ||
        String(p.owner_name  || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  $: totalProjects   = filteredProjects.length;
  $: inProgressCount = filteredProjects.filter(p => p.status === 'In Progress').length;
  $: completedCount  = filteredProjects.filter(p => p.status === 'Completed').length;
</script>

<!-- ══════════════════════════════════════════════════════════════════════ -->
<section class="projects-page">

  <!-- Stat Cards -->
  <div class="stat-cards">
    <div class="stat-card blue">
      <div class="stat-card-top"><div style="flex:1"></div>
        <div class="stat-icon blue"><FolderOpen size={16} /></div></div>
      <div class="stat-value">{totalProjects}</div>
      <div class="stat-label">Total Projects</div>
    </div>
    <div class="stat-card amber">
      <div class="stat-card-top"><div style="flex:1"></div>
        <div class="stat-icon amber"><Clock3 size={16} /></div></div>
      <div class="stat-value">{inProgressCount}</div>
      <div class="stat-label">In Progress</div>
    </div>
    <div class="stat-card green">
      <div class="stat-card-top"><div style="flex:1"></div>
        <div class="stat-icon green"><CheckCircle2 size={16} /></div></div>
      <div class="stat-value">{completedCount}</div>
      <div class="stat-label">Completed</div>
    </div>
    <div class="stat-card violet">
      <div class="stat-card-top"><div style="flex:1"></div>
        <div class="stat-icon violet"><Users2 size={16} /></div></div>
      <div class="stat-value">{uniqueInterns.length}</div>
      <div class="stat-label">Interns</div>
    </div>
  </div>

  <!-- Search + Filters -->
  <div class="toolbar">
    <div class="search-wrap">
      <Search size={13} class="search-icon" />
      <input class="search-input" type="text" placeholder="Search projects…" bind:value={searchQuery} />
    </div>
  </div>

  <div class="filter-row">
    <div class="filter-group">
      <span class="filter-label">Priority:</span>
      {#each ['all', ...PRIORITY_OPTIONS] as p}
        <button class="filter-chip" class:active={filterPriority === p}
          on:click={() => (filterPriority = p)}>{p === 'all' ? 'All' : p}</button>
      {/each}
    </div>
    <div class="filter-group">
      <span class="filter-label">Status:</span>
      {#each ['all', ...STATUS_OPTIONS] as s}
        <button class="filter-chip" class:active={filterStatus === s}
          on:click={() => (filterStatus = s)}>{s === 'all' ? 'All' : s}</button>
      {/each}
    </div>
    {#if uniqueInterns.length > 0}
      <div class="filter-group">
        <span class="filter-label">Intern:</span>
        <button class="filter-chip" class:active={filterIntern === 'all'}
          on:click={() => (filterIntern = 'all')}>All</button>
        {#each uniqueInterns as name}
          <button class="filter-chip" class:active={filterIntern === name}
            on:click={() => (filterIntern = name)}>{name}</button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Content -->
  {#if isLoading}
    <div class="empty-state"><Loader2 size={22} class="spin" /><span>Loading…</span></div>

  {:else if allProjects.length === 0}
    <div class="empty-state">
      <FolderOpen size={32} />
      <div class="empty-title">No projects yet</div>
      <div class="empty-sub">Interns haven't added any projects yet.</div>
    </div>

  {:else if filteredProjects.length === 0}
    <div class="empty-state">
      <FolderOpen size={22} />
      <span>No projects match the selected filters.</span>
    </div>

  {:else}
    <!-- Table view (matches the ISOC MAJOR TASK design) -->
    <div class="table-wrap">
      <table class="projects-table">
        <thead>
          <tr>
            <th>Priority</th>
            <th>Project Title</th>
            <th>Short Description</th>
            <th>Deadline</th>
            <th>Status</th>
            <th>Project Link</th>
            <th>Intern</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredProjects as p (p.id)}
            {@const pc   = PRIORITY_COLORS[p.priority_level] || PRIORITY_COLORS['5th']}
            {@const sm   = STATUS_META[p.status] || STATUS_META['Not Started']}
            {@const past = isDeadlinePast(p.deadline)}
            {@const near = !past && isDeadlineNear(p.deadline)}
            <tr>
              <td>
                <span class="priority-badge"
                  style="background:{pc.bg};color:{pc.text};border-color:{pc.border}">
                  {p.priority_level}
                </span>
              </td>
              <td class="col-title">{p.title}</td>
              <td class="col-desc">{p.description || '—'}</td>
              <td>
                <span class="deadline-cell"
                  class:deadline-past={past}
                  class:deadline-near={near}>
                  <CalendarDays size={11} />
                  {formatDate(p.deadline)}
                  {#if past}  <span class="deadline-tag">Overdue</span>
                  {:else if near} <span class="deadline-tag near">Soon</span>
                  {/if}
                </span>
              </td>
              <td><span class="status-badge {sm.cls}">{sm.label}</span></td>
              <td>
                {#if p.link_url}
                  <a class="table-link" href={p.link_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={12} /> {p.link_label || 'Open Link'}
                  </a>
                {:else}
                  <span class="no-link">—</span>
                {/if}
              </td>
              <td class="col-intern">{p.owner_name || '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Card grid (mobile-friendly fallback visible on smaller widths) -->
    <div class="projects-cards-mobile">
      {#each filteredProjects as p (p.id)}
        {@const pc   = PRIORITY_COLORS[p.priority_level] || PRIORITY_COLORS['5th']}
        {@const sm   = STATUS_META[p.status] || STATUS_META['Not Started']}
        {@const past = isDeadlinePast(p.deadline)}
        {@const near = !past && isDeadlineNear(p.deadline)}
        <div class="project-card">
          <div class="project-card-header">
            <div class="priority-badge"
              style="background:{pc.bg};color:{pc.text};border-color:{pc.border}">
              <Tag size={10} /> {p.priority_level}
            </div>
            <span class="status-badge {sm.cls}">{sm.label}</span>
          </div>
          <div class="project-title">{p.title}</div>
          {#if p.description}<p class="project-desc">{p.description}</p>{/if}
          <div class="project-meta">
            {#if p.deadline}
              <div class="meta-item" class:deadline-past={past} class:deadline-near={near}>
                <CalendarDays size={12} /> {formatDate(p.deadline)}
                {#if past}  <span class="deadline-tag">Overdue</span>
                {:else if near} <span class="deadline-tag near">Soon</span>
                {/if}
              </div>
            {/if}
            <div class="meta-item intern-chip"><Users2 size={12} /> {p.owner_name || '—'}</div>
            {#if p.link_url}
              <a class="meta-link" href={p.link_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={12} /> {p.link_label || 'Open Link'}
              </a>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

</section>

<!-- ══════════════════════════════════════════════════════════════════════ -->
<style>
  .projects-page { padding: 20px; display: flex; flex-direction: column; gap: 16px; }

  /* ── Stat Cards ── */
  .stat-cards { display: flex; gap: 12px; flex-wrap: wrap; }
  .stat-card {
    flex: 1; min-width: 120px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px; padding: 14px 16px 12px;
    display: flex; flex-direction: column; gap: 4px;
  }
  .stat-card-top { display: flex; align-items: center; margin-bottom: 4px; }
  .stat-icon { width: 28px; height: 28px; border-radius: 7px; display: grid; place-items: center; }
  .stat-icon.blue   { background: #dbeafe; color: #2563eb; }
  .stat-icon.amber  { background: #fef3c7; color: #d97706; }
  .stat-icon.green  { background: #dcfce7; color: #16a34a; }
  .stat-icon.violet { background: #ede9fe; color: #7c3aed; }
  :global(body.dark) .stat-icon.blue   { background: #1e3a5f; color: #60a5fa; }
  :global(body.dark) .stat-icon.amber  { background: #3b2600; color: #fbbf24; }
  :global(body.dark) .stat-icon.green  { background: #052e16; color: #4ade80; }
  :global(body.dark) .stat-icon.violet { background: #2e1065; color: #a78bfa; }
  .stat-value { font-size: 22px; font-weight: 700; color: var(--color-heading); line-height: 1; }
  .stat-label { font-size: 11.5px; color: var(--color-sidebar-text); }

  /* ── Toolbar / Search ── */
  .toolbar { display: flex; align-items: center; gap: 10px; }
  .search-wrap {
    position: relative; display: flex; align-items: center;
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: 8px; overflow: hidden; flex: 1; max-width: 320px;
  }
  :global(.search-icon) { position: absolute; left: 10px; color: var(--color-sidebar-text); pointer-events: none; }
  .search-input {
    padding: 7px 10px 7px 30px; border: none; outline: none;
    background: transparent; color: var(--color-text); font-size: 13px; width: 100%;
  }

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

  /* ── Table ── */
  .table-wrap {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px; overflow: auto;
  }
  .projects-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .projects-table thead tr { background: var(--color-soft); }
  .projects-table th {
    padding: 10px 14px; text-align: left;
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .06em; color: var(--color-sidebar-text);
    border-bottom: 1px solid var(--color-border); white-space: nowrap;
  }
  .projects-table td {
    padding: 10px 14px; vertical-align: middle;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text);
  }
  .projects-table tbody tr:last-child td { border-bottom: none; }
  .projects-table tbody tr:hover { background: var(--color-soft); }
  .col-title  { font-weight: 600; min-width: 140px; }
  .col-desc   { color: var(--color-sidebar-text); max-width: 220px; }
  .col-intern { font-weight: 500; color: #7c3aed; white-space: nowrap; }

  /* hide table on narrow widths, show cards */
  @media (max-width: 700px) {
    .table-wrap            { display: none; }
    .projects-cards-mobile { display: grid; }
  }
  @media (min-width: 701px) {
    .projects-cards-mobile { display: none; }
  }

  /* ── Priority & Status badges ── */
  .priority-badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 8px; border-radius: 20px; font-size: 10.5px; font-weight: 600;
    border: 1px solid; white-space: nowrap;
  }
  .status-badge {
    display: inline-block; padding: 3px 9px;
    border-radius: 20px; font-size: 10.5px; font-weight: 600; white-space: nowrap;
  }
  .status-not-started { background: #f1f5f9; color: #64748b; }
  .status-in-progress  { background: #fffbeb; color: #d97706; }
  .status-completed    { background: #f0fdf4; color: #16a34a; }
  :global(body.dark) .status-not-started { background: #1e293b; color: #94a3b8; }
  :global(body.dark) .status-in-progress  { background: #3b2600; color: #fbbf24; }
  :global(body.dark) .status-completed    { background: #052e16; color: #4ade80; }

  /* ── Deadline ── */
  .deadline-cell { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }
  .deadline-cell.deadline-past { color: #dc2626; }
  .deadline-cell.deadline-near { color: #d97706; }
  .deadline-tag {
    display: inline-block; font-size: 10px; font-weight: 600;
    padding: 1px 7px; border-radius: 20px;
    background: #fef2f2; color: #dc2626;
  }
  .deadline-tag.near { background: #fffbeb; color: #d97706; }

  /* ── Table link ── */
  .table-link {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 12px; font-weight: 600; color: #2563eb;
    text-decoration: none;
  }
  .table-link:hover { text-decoration: underline; }
  .no-link { color: var(--color-sidebar-text); font-style: italic; font-size: 12px; }
  :global(body.dark) .table-link { color: #60a5fa; }

  /* ── Card grid (mobile) ── */
  .projects-cards-mobile { grid-template-columns: 1fr; gap: 12px; }
  .project-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px; padding: 14px 16px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .project-card-header { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .project-title { font-size: 14px; font-weight: 600; color: var(--color-heading); }
  .project-desc  { font-size: 12.5px; color: var(--color-sidebar-text); margin: 0; line-height: 1.5; }
  .project-meta  { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .meta-item {
    display: flex; align-items: center; gap: 4px;
    font-size: 12px; color: var(--color-sidebar-text);
  }
  .meta-item.deadline-past { color: #dc2626; }
  .meta-item.deadline-near { color: #d97706; }
  .intern-chip { color: #7c3aed; font-weight: 500; }
  .meta-link {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 12px; font-weight: 500; color: #2563eb; text-decoration: none;
  }
  .meta-link:hover { text-decoration: underline; }

  /* ── Empty State ── */
  .empty-state {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 8px; padding: 48px 20px; color: var(--color-sidebar-text); text-align: center;
  }
  .empty-title { font-size: 14px; font-weight: 600; color: var(--color-text); }
  .empty-sub   { font-size: 12.5px; }

  /* ── Spin ── */
  :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Dark overrides ── */
  :global(body.dark) .table-wrap     { background: #1f2937; border-color: #374151; }
  :global(body.dark) .projects-table thead tr { background: #111827; }
  :global(body.dark) .projects-table tbody tr:hover { background: #111827; }
  :global(body.dark) .project-card   { background: #1f2937; border-color: #374151; }
  :global(body.dark) .search-wrap    { background: #1f2937; border-color: #374151; }
  :global(body.dark) .priority-badge { filter: brightness(.85) saturate(.9); }
  :global(body.dark) .deadline-tag       { background: #2d0a0a; color: #f87171; }
  :global(body.dark) .deadline-tag.near  { background: #3b2600; color: #fbbf24; }


</style>
