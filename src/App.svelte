<script>
  import { onMount } from 'svelte';
  import Layout from './app/components/Layout.svelte';
  import Dashboard from './app/pages/Dashboard.svelte';
  import Documents from './app/pages/Documents.svelte';
  import Evaluation from './app/pages/Evaluation.svelte';
  import Settings from './app/pages/Settings.svelte';
  import TimeLog from './app/pages/TimeLog.svelte';
  import { getPageMeta, normalizePath } from './app/routes.js';
  import { initializeTheme } from './app/context/ThemeContext.js';

  const pageComponents = {
    '/': Dashboard,
    '/documents': Documents,
    '/evaluation': Evaluation,
    '/settings': Settings,
    '/time-log': TimeLog,
  };

  let currentPath = '/';

  function syncRoute() {
    const hash = window.location.hash.replace(/^#/, '') || '/';
    const normalized = normalizePath(hash);

    currentPath = normalized;

    if (normalized !== hash) {
      window.location.hash = normalized;
    }
  }

  onMount(() => {
    initializeTheme();
    syncRoute();
    window.addEventListener('hashchange', syncRoute);

    return () => {
      window.removeEventListener('hashchange', syncRoute);
    };
  });

  $: CurrentPage = pageComponents[currentPath] ?? Dashboard;
  $: pageMeta = getPageMeta(currentPath);
</script>

<Layout {currentPath} {pageMeta}>
  <svelte:component this={CurrentPage} />
</Layout>
