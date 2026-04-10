<script>
  import { onDestroy, onMount } from 'svelte';
  import { Home, Users2, Clock, FileText, Activity, FolderOpen } from 'lucide-svelte';
  import { getCurrentUser, subscribeToCurrentUser } from '../lib/auth.js';
  import { subscribeToSync } from '../lib/sync.js';
  import SupervisorDashboardTab from './tabs/SupervisorDashboardTab.svelte';
  import SupervisorInternManagement from './tabs/SupervisorInternManagement.svelte';
  import SupervisorTimeLog from './SupervisorTimeLog.svelte';
  import SupervisorRequests from './tabs/SupervisorRequests.svelte';
  import SupervisorActivity from './tabs/SupervisorActivity.svelte';
  import SupervisorDocuments from './tabs/SupervisorDocuments.svelte';

  let currentUser = null;
  let activeTab = 'dashboard';
  let unsubscribeAuth;
  let unsubscribeSync;

  function setActiveTab(tab) {
    activeTab = tab;
  }

  onMount(() => {
    currentUser = getCurrentUser();

    unsubscribeAuth = subscribeToCurrentUser((user) => {
      currentUser = user;
    });

    unsubscribeSync = subscribeToSync(() => {
      // Real-time sync
    });
  });

  onDestroy(() => {
    if (typeof unsubscribeAuth === 'function') unsubscribeAuth();
    if (typeof unsubscribeSync === 'function') unsubscribeSync();
  });

  $: currentRole = String(currentUser?.role || '').trim().toLowerCase();
  $: isSupervisorUser = currentRole === 'supervisor';
</script>

{#if currentUser && !isSupervisorUser}
  <section class="warning-alert">
    This page is available for supervisor accounts only.
  </section>
{:else}
  <section class="supervisor-shell">
    <!-- TAB NAVIGATION -->
    <div class="tabs">
      <button class="tab-btn" class:active={activeTab === 'dashboard'} on:click={() => setActiveTab('dashboard')}>
        <Home size={16} /><span>Dashboard</span>
      </button>
      <button class="tab-btn" class:active={activeTab === 'interns'} on:click={() => setActiveTab('interns')}>
        <Users2 size={16} /><span>Intern Management</span>
      </button>
      <button class="tab-btn" class:active={activeTab === 'timelogs'} on:click={() => setActiveTab('timelogs')}>
        <Clock size={16} /><span>Time Logs</span>
      </button>
      <button class="tab-btn" class:active={activeTab === 'requests'} on:click={() => setActiveTab('requests')}>
        <FileText size={16} /><span>Requests</span>
      </button>
      <button class="tab-btn" class:active={activeTab === 'activity'} on:click={() => setActiveTab('activity')}>
        <Activity size={16} /><span>Activity</span>
      </button>
      <button class="tab-btn" class:active={activeTab === 'documents'} on:click={() => setActiveTab('documents')}>
        <FolderOpen size={16} /><span>Documents</span>
      </button>
    </div>

    <!-- TAB CONTENT -->
    {#if activeTab === 'dashboard'}
      <SupervisorDashboardTab {currentUser} />
    {/if}

    {#if activeTab === 'interns'}
      <SupervisorInternManagement {currentUser} />
    {/if}

    {#if activeTab === 'timelogs'}
      <SupervisorTimeLog {currentUser} />
    {/if}

    {#if activeTab === 'requests'}
      <SupervisorRequests {currentUser} />
    {/if}

    {#if activeTab === 'activity'}
      <SupervisorActivity {currentUser} />
    {/if}

    {#if activeTab === 'documents'}
      <SupervisorDocuments {currentUser} />
    {/if}
  </section>
{/if}

<style>
  :root {
    --text-primary: #0f172a;
    --text-secondary: #1f2937;
    --text-muted: #6b7280;
    --border: #d7e3f1;
    --surface: #ffffff;
  }

  .supervisor-shell {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    border-bottom: 2px solid var(--border);
    overflow-x: auto;
    padding-bottom: 0.5rem;
  }

  .tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border: none;
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-weight: 500;
    font-size: 0.875rem;
    white-space: nowrap;
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
  }

  .tab-btn:hover {
    color: var(--text-primary);
  }

  .tab-btn.active {
    color: #0f6cbd;
    border-bottom-color: #0f6cbd;
  }

  .warning-alert {
    border-radius: 0.75rem;
    border: 1px solid;
    padding: 1rem;
    background: #fef3c7;
    border-color: #fcd34d;
    color: #92400e;
    font-size: 0.875rem;
    font-weight: 500;
  }

  :global(.dark) {
    --text-primary: #e5edf8;
    --text-secondary: #cfdceb;
    --text-muted: #9ba3af;
    --border: #2b3c57;
    --surface: #162338;
  }

  @media (max-width: 768px) {
    .tab-btn {
      padding: 0.5rem 0.75rem;
      font-size: 0.75rem;
    }
  }
</style>
