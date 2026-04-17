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
      <slot />
    </main>
  </div>
</div>
