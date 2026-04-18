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

<div class="ims-layout">
  <Sidebar {currentPath} collapsed={sidebarCollapsed} on:toggle={toggleSidebar} />
  <div class="ims-layout-main">
    <Header
      pageTitle={pageMeta.title}
      pageDescription={pageMeta.description}
      collapsed={sidebarCollapsed}
    />
    <main class="ims-layout-content">
      <slot />
    </main>
  </div>
</div>

<style>
  .ims-layout {
    display: flex;
    height: 100vh;
    width: 100%;
    overflow: hidden;
  }

  .ims-layout-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .ims-layout-content {
    flex: 1;
    overflow-y: auto;
    padding: 28px 32px;
  }
</style>