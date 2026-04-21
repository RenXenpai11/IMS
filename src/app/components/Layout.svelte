<script>
// @ts-nocheck
  import Header from './Header.svelte';
  import Sidebar from './Sidebar.svelte';

  export let currentPath = '/';
  export let pageMeta = { title: 'Internship Management System', description: '' };

  let sidebarCollapsed = false;

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
  }
</script>

<div class="layout-shell" class:sidebar-collapsed={sidebarCollapsed}>
  <Sidebar {currentPath} collapsed={sidebarCollapsed} on:toggle={toggleSidebar} />
  <div class="layout-main">
    <Header pageTitle={pageMeta.title} pageDescription={pageMeta.description} />
    <main class="layout-content">
      <div class="layout-content-inner">
        <slot />
      </div>
    </main>
  </div>
</div>

<style>
  .layout-content-inner {
    box-sizing: border-box;
    min-width: 0;
    min-height: 100%;
    padding: 1.5rem;
  }

  .layout-content-inner > :global(*) {
    min-width: 0;
  }

  @media (max-width: 720px) {
    .layout-content-inner {
      padding: 1rem;
    }
  }
</style>
