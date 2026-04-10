<script>
  import { onDestroy, onMount } from 'svelte';
  import { getCurrentUser, subscribeToCurrentUser } from '../lib/auth.js';
  import { subscribeToSync } from '../lib/sync.js';
  import SupervisorDashboardOverview from './SupervisorDashboardOverview.svelte';

  let currentUser = null;
  let unsubscribeAuth;
  let unsubscribeSync;

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
  <SupervisorDashboardOverview {currentUser} />
{/if}

<style>
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

  :global(.dark) .warning-alert {
    background: #fef3c7;
    border-color: #fcd34d;
    color: #92400e;
  }
</style>
