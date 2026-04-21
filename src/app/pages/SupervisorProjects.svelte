<script>
  import { onDestroy, onMount } from 'svelte';
  import { Folder, Plus, Search, Filter, MoreVertical, Clock, CheckCircle, AlertCircle } from 'lucide-svelte';
  import { subscribeToCurrentUser } from '../lib/auth.js';

  export let currentUser = null;

  let loading = true;
  let projects = [];
  let filteredProjects = [];
  let searchTerm = '';
  let filterStatus = 'all';
  let unsubscribe;

  const statusOptions = [
    { value: 'all', label: 'All Projects' },
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'pending', label: 'Pending' },
  ];

  // Mock data - replace with actual API calls
  const mockProjects = [
    {
      id: '1',
      name: 'Website Redesign',
      description: 'Redesign the company website with modern UI/UX',
      status: 'active',
      assignedInterns: 2,
      dueDate: '2026-05-15',
      progress: 65,
    },
    {
      id: '2',
      name: 'Mobile App Development',
      description: 'Develop a mobile app for iOS and Android',
      status: 'active',
      assignedInterns: 3,
      dueDate: '2026-06-30',
      progress: 40,
    },
    {
      id: '3',
      name: 'Database Optimization',
      description: 'Optimize database queries and performance',
      status: 'completed',
      assignedInterns: 1,
      dueDate: '2026-04-20',
      progress: 100,
    },
    {
      id: '4',
      name: 'API Integration',
      description: 'Integrate third-party APIs',
      status: 'pending',
      assignedInterns: 0,
      dueDate: '2026-05-30',
      progress: 0,
    },
  ];

  function getStatusColor(status) {
    const colors = {
      active: { bg: 'rgba(59, 130, 246, 0.12)', text: '#1e40af', icon: Clock },
      completed: { bg: 'rgba(16, 185, 129, 0.12)', text: '#047857', icon: CheckCircle },
      pending: { bg: 'rgba(245, 158, 11, 0.14)', text: '#92400e', icon: AlertCircle },
    };
    return colors[status] || colors.pending;
  }

  function filterProjects() {
    let filtered = projects;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.description.toLowerCase().includes(term)
      );
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter((p) => p.status === filterStatus);
    }

    filteredProjects = filtered;
  }

  function loadProjects() {
    loading = true;
    try {
      // Simulate API delay
      setTimeout(() => {
        projects = mockProjects;
        filterProjects();
        loading = false;
      }, 500);
    } catch (err) {
      console.error('Error loading projects:', err);
      loading = false;
    }
  }

  onMount(() => {
    unsubscribe = subscribeToCurrentUser(() => {
      loadProjects();
    });
    loadProjects();
  });

  onDestroy(() => {
    if (typeof unsubscribe === 'function') unsubscribe();
  });

  $: if (searchTerm || filterStatus) {
    filterProjects();
  }
</script>

<div class="projects-container">
  <div class="projects-header">
    <div>
      <h1 class="page-title">Projects</h1>
      <p class="page-description">Manage and oversee intern projects</p>
    </div>
    <button class="btn btn-primary">
      <Plus size={18} />
      <span>New Project</span>
    </button>
  </div>

  <div class="projects-controls">
    <div class="search-box">
      <Search size={16} />
      <input
        type="text"
        placeholder="Search projects..."
        bind:value={searchTerm}
      />
    </div>

    <div class="filter-group">
      <Filter size={16} />
      <select bind:value={filterStatus}>
        {#each statusOptions as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </div>
  </div>

  {#if loading}
    <div class="loading-state">
      <p>Loading projects...</p>
    </div>
  {:else if filteredProjects.length === 0}
    <div class="empty-state">
      <Folder size={48} />
      <h3>No projects found</h3>
      <p>
        {searchTerm
          ? 'No projects match your search.'
          : 'No projects to display.'}
      </p>
    </div>
  {:else}
    <div class="projects-grid">
      {#each filteredProjects as project (project.id)}
        {@const statusInfo = getStatusColor(project.status)}
        <div class="project-card">
          <div class="project-header">
            <h3 class="project-name">{project.name}</h3>
            <button class="btn-icon" type="button">
              <MoreVertical size={16} />
            </button>
          </div>

          <p class="project-description">{project.description}</p>

          <div class="project-meta">
            <div class="meta-item">
              <span class="meta-label">Due:</span>
              <span class="meta-value">{new Date(project.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Assigned:</span>
              <span class="meta-value">{project.assignedInterns} interns</span>
            </div>
          </div>

          <div class="project-progress">
            <div class="progress-header">
              <span class="progress-label">Progress</span>
              <span class="progress-value">{project.progress}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: {project.progress}%"></div>
            </div>
          </div>

          <div class="project-footer">
            <div
              class="status-badge"
              style="background: {statusInfo.bg}; color: {statusInfo.text};"
            >
              <svelte:component this={statusInfo.icon} size={14} />
              <span>{project.status}</span>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  :root {
    --text-primary: #0f172a;
    --text-secondary: #1f2937;
    --text-muted: #6b7280;
    --border: #d7e3f1;
    --surface: #ffffff;
    --surface-soft: #f9fbff;
    --primary: #3b82f6;
  }

  .projects-container {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .projects-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .page-title {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .page-description {
    margin: 0;
    font-size: 0.95rem;
    color: var(--text-muted);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    border: none;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
  }

  .btn-primary {
    background: linear-gradient(135deg, var(--primary), #2563eb);
    color: white;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
  }

  .btn-primary:hover {
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  .projects-controls {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    flex: 1;
    color: var(--text-muted);
  }

  .search-box input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .search-box input::placeholder {
    color: var(--text-muted);
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    color: var(--text-muted);
  }

  .filter-group select {
    border: none;
    background: transparent;
    outline: none;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
  }

  .loading-state {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--text-muted);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 4rem 2rem;
    background: var(--surface-soft);
    border-radius: 1rem;
    border: 1px solid var(--border);
    color: var(--text-muted);
  }

  .empty-state h3 {
    margin: 0.5rem 0 0 0;
    font-size: 1.125rem;
    color: var(--text-primary);
  }

  .empty-state p {
    margin: 0;
    font-size: 0.875rem;
  }

  .projects-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
  }

  .project-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 1rem;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    transition: all 0.3s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .project-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
    border-color: var(--primary);
  }

  .project-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .project-name {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 0.375rem;
    transition: all 0.2s;
  }

  .btn-icon:hover {
    background: var(--surface-soft);
    color: var(--text-primary);
  }

  .project-description {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .project-meta {
    display: flex;
    gap: 1.5rem;
  }

  .meta-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .meta-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .meta-value {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .project-progress {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
  }

  .progress-label {
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .progress-value {
    font-weight: 700;
    color: var(--text-primary);
  }

  .progress-bar {
    height: 0.5rem;
    background: var(--surface-soft);
    border-radius: 9999px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--primary), #2563eb);
    transition: width 0.3s ease;
  }

  .project-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: capitalize;
  }

  :global(.dark) {
    --text-primary: #e5edf8;
    --text-secondary: #cfdceb;
    --text-muted: #9ba3af;
    --border: #2b3c57;
    --surface: #162338;
    --surface-soft: #1a2c45;
  }

  :global(.dark) .btn-primary {
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
  }

  :global(.dark) .btn-primary:hover {
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  :global(.dark) .project-card {
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  :global(.dark) .project-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }
</style>
