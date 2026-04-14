<script>
  import { onMount } from 'svelte';
  import Layout from './app/components/Layout.svelte';
  import Dashboard from './app/pages/Dashboard.svelte';
  import ActivityIntern from './app/pages/ActivityIntern.svelte';
  import Documents from './app/pages/Documents.svelte';
  import LoginPage from './app/pages/LoginPage.svelte';
  import Requests from './app/pages/Requests.svelte';
  import Settings from './app/pages/Settings.svelte';
  import SignUpPage from './app/pages/SignUpPage.svelte';
  import SupervisorDashboard from './app/pages/SupervisorDashboard.svelte';
  import SupervisorTimeLog from './app/pages/SupervisorTimeLog.svelte';
  import SupervisorActivity from './app/pages/SupervisorActivity.svelte';
  import SupervisorDocuments from './app/pages/SupervisorDocuments.svelte';
  import SupervisorInternManagement from './app/pages/SupervisorInternManagement.svelte';
  import TimeLog from './app/pages/TimeLog.svelte';
  import { getPageMeta, normalizePath } from './app/routes.js';
  import {
    getCurrentUser,
    hydrateAuthSession,
    isAuthenticated,
    restoreAuthSession,
    subscribeToCurrentUser,
  } from './app/lib/auth.js';
  import { initializeTheme } from './app/context/ThemeContext.js';

  const pageComponents = {
    '/login': LoginPage,
    '/signup': SignUpPage,
    '/': Dashboard,
    '/activity': ActivityIntern,
    '/documents': Documents,
    '/requests': Requests,
    '/settings': Settings,
    '/time-log': TimeLog,
    '/supervisor': SupervisorDashboard,
    '/supervisor/interns': SupervisorInternManagement,
    '/supervisor/time-logs': SupervisorTimeLog,
    '/supervisor/requests': Requests,
    '/supervisor/activity': SupervisorActivity,
    '/supervisor/documents': SupervisorDocuments,
  };

  const authPaths = new Set(['/login', '/signup']);

  let currentPath = '/';
  let currentUser = null;
  let unsubscribeAuth;

  function getRoleDefaultPath_() {
    const role = String(currentUser?.role || getCurrentUser()?.role || '').trim().toLowerCase();
    return role === 'supervisor' ? '/supervisor' : '/';
  }

  function isSupervisorPath_(path) {
    return String(path || '').startsWith('/supervisor');
  }

  function syncRoute() {
    const hash = window.location.hash.replace(/^#/, '') || '/login';
    const normalized = normalizePath(hash);
    const authed = isAuthenticated();
    const defaultPath = getRoleDefaultPath_();
    const supervisorSession = defaultPath === '/supervisor';

    if (!authed && !authPaths.has(normalized)) {
      currentPath = '/login';
      if (hash !== '/login') {
        window.location.hash = '/login';
      }
      return;
    }

    if (authed && authPaths.has(normalized)) {
      currentPath = defaultPath;
      if (hash !== defaultPath) {
        window.location.hash = defaultPath;
      }
      return;
    }

    if (authed && supervisorSession && !isSupervisorPath_(normalized)) {
      currentPath = '/supervisor';
      if (hash !== '/supervisor') {
        window.location.hash = '/supervisor';
      }
      return;
    }

    if (authed && !supervisorSession && isSupervisorPath_(normalized)) {
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
    // Hydrate local session immediately so role-based UI is correct on first paint.
    currentUser = hydrateAuthSession() || getCurrentUser();
    syncRoute();

    unsubscribeAuth = subscribeToCurrentUser((user) => {
      currentUser = user;
      syncRoute();
    });

    restoreAuthSession();
    window.addEventListener('hashchange', syncRoute);

    return () => {
      window.removeEventListener('hashchange', syncRoute);
      if (typeof unsubscribeAuth === 'function') {
        unsubscribeAuth();
      }
    };
  });

  $: currentUserRole = String(currentUser?.role || '').trim();
  $: isSupervisorUser = currentUserRole.toLowerCase() === 'supervisor';
  $: CurrentPage = pageComponents[currentPath] ?? Dashboard;
  $: basePageMeta = getPageMeta(currentPath);
  $: isAuthPage = authPaths.has(currentPath);

  $: if (typeof document !== 'undefined') {
    if (isAuthPage) {
      document.documentElement.classList.add('dark', 'auth-page');
      document.body.classList.add('dark', 'auth-page');
      document.documentElement.classList.remove('inside-page');
      document.body.classList.remove('inside-page');
    } else {
      document.documentElement.classList.remove('auth-page');
      document.body.classList.remove('auth-page');
      document.documentElement.classList.add('inside-page');
      document.body.classList.add('inside-page');
      initializeTheme();
    }
  }
</script>

{#if isAuthPage}
  <svelte:component this={CurrentPage} />
{:else}
  <Layout {currentPath} pageMeta={basePageMeta}>
    <svelte:component this={CurrentPage} />
  </Layout>
{/if}
