<script>
  import { onMount } from 'svelte';
  import Layout from './app/components/Layout.svelte';
  import Dashboard from './app/pages/Dashboard.svelte';
  import Documents from './app/pages/Documents.svelte';
  import Evaluation from './app/pages/Evaluation.svelte';
  import LoginPage from './app/pages/LoginPage.svelte';
  import Settings from './app/pages/Settings.svelte';
  import SignUpPage from './app/pages/SignUpPage.svelte';
  import TimeLog from './app/pages/TimeLog.svelte';
  import { getPageMeta, normalizePath } from './app/routes.js';
  import { isAuthenticated } from './app/lib/auth.js';
  import { initializeTheme } from './app/context/ThemeContext.js';

  const pageComponents = {
    '/login': LoginPage,
    '/signup': SignUpPage,
    '/': Dashboard,
    '/documents': Documents,
    '/evaluation': Evaluation,
    '/settings': Settings,
    '/time-log': TimeLog,
  };

  const authPaths = new Set(['/login', '/signup']);

  let currentPath = '/';

  function syncRoute() {
    const hash = window.location.hash.replace(/^#/, '') || '/login';
    const normalized = normalizePath(hash);
    const authed = isAuthenticated();

    if (!authed && !authPaths.has(normalized)) {
      currentPath = '/login';
      if (hash !== '/login') {
        window.location.hash = '/login';
      }
      return;
    }

    if (authed && authPaths.has(normalized)) {
      currentPath = '/';
      if (hash !== '/') {
        window.location.hash = '/';
      }
      return;
    }

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
  $: isAuthPage = authPaths.has(currentPath);
</script>

{#if isAuthPage}
  <svelte:component this={CurrentPage} />
{:else}
  <Layout {currentPath} {pageMeta}>
    <svelte:component this={CurrentPage} />
  </Layout>
{/if}
