<script>
// @ts-nocheck
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
  import SupervisorInternManagement from './app/pages/SupervisorInternManagement.svelte';
  import ProjectsIntern from './app/pages/ProjectsIntern.svelte';
  import SupervisorProjects from './app/pages/SupervisorProjects.svelte';
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
    '/projects': ProjectsIntern,
    '/requests': Requests,
    '/settings': Settings,
    '/time-log': TimeLog,
    '/supervisor': SupervisorDashboard,
    '/supervisor/interns': SupervisorInternManagement,
    '/supervisor/time-logs': SupervisorTimeLog,
    '/supervisor/projects': SupervisorProjects,
    '/supervisor/requests': Requests,
    '/supervisor/projects': SupervisorProjects,
    '/supervisor/activity': SupervisorActivity,
    '/supervisor/documents': Documents,
  };

  const authPaths = new Set(['/login', '/signup']);
  const PENDING_REDIRECT_STORAGE_KEY = 'ims-pending-redirect';
  const LAST_STUDENT_TAB_STORAGE_KEY = 'ims-last-student-tab';
  const LAST_SUPERVISOR_TAB_STORAGE_KEY = 'ims-last-supervisor-tab';
  const restorableStudentPaths = new Set([
    '/',
    '/time-log',
    '/projects',
    '/requests',
    '/activity',
    '/documents',
    '/settings',
  ]);
  const restorableSupervisorPaths = new Set([
    '/supervisor',
    '/supervisor/interns',
    '/supervisor/time-logs',
    '/supervisor/projects',
    '/supervisor/requests',
    '/supervisor/projects',
    '/supervisor/activity',
    '/documents',
    '/settings',
  ]);

  let currentPath = '/';
  let currentUser = null;
  let unsubscribeAuth;

  function readLastStudentTab_() {
    if (typeof window === 'undefined') {
      return '/';
    }

    try {
      const storedPath = String(window.localStorage.getItem(LAST_STUDENT_TAB_STORAGE_KEY) || '').trim();
      return restorableStudentPaths.has(storedPath) ? storedPath : '/';
    } catch {
      return '/';
    }
  }

  function persistLastStudentTab_(path) {
    if (typeof window === 'undefined') {
      return;
    }

    const role = String(currentUser?.role || getCurrentUser()?.role || '').trim().toLowerCase();
    if (role === 'supervisor') {
      return;
    }

    const normalizedPath = normalizePath(String(path || '').trim());
    if (!restorableStudentPaths.has(normalizedPath)) {
      return;
    }

    try {
      window.localStorage.setItem(LAST_STUDENT_TAB_STORAGE_KEY, normalizedPath);
    } catch {
      // Ignore storage errors to avoid blocking navigation.
    }
  }

  function readLastSupervisorTab_() {
    if (typeof window === 'undefined') {
      return '/supervisor';
    }

    try {
      const storedPath = String(window.localStorage.getItem(LAST_SUPERVISOR_TAB_STORAGE_KEY) || '').trim();
      if (storedPath === '/supervisor/documents') {
        return '/documents';
      }
      return restorableSupervisorPaths.has(storedPath) ? storedPath : '/supervisor';
    } catch {
      return '/supervisor';
    }
  }

  function persistLastSupervisorTab_(path) {
    if (typeof window === 'undefined') {
      return;
    }

    const role = String(currentUser?.role || getCurrentUser()?.role || '').trim().toLowerCase();
    if (role !== 'supervisor') {
      return;
    }

    const normalizedPath = normalizePath(String(path || '').trim());
    if (!restorableSupervisorPaths.has(normalizedPath)) {
      return;
    }

    try {
      window.localStorage.setItem(LAST_SUPERVISOR_TAB_STORAGE_KEY, normalizedPath);
    } catch {
      // Ignore storage errors to avoid blocking navigation.
    }
  }

  function persistLastRoleTab_(path) {
    const role = String(currentUser?.role || getCurrentUser()?.role || '').trim().toLowerCase();
    if (role === 'supervisor') {
      persistLastSupervisorTab_(path);
      return;
    }
    persistLastStudentTab_(path);
  }

  function getRoleDefaultPath_() {
    const role = String(currentUser?.role || getCurrentUser()?.role || '').trim().toLowerCase();
    return role === 'supervisor' ? readLastSupervisorTab_() : readLastStudentTab_();
  }

  function isSupervisorPath_(path) {
    return String(path || '').startsWith('/supervisor');
  }

  function isSupervisorAllowedPath_(path) {
    const value = String(path || '').trim();
    return value === '/settings' || value === '/documents' || isSupervisorPath_(value);
  }

  function readRequestsDeepLinkIntent_() {
    if (typeof window === 'undefined') {
      return null;
    }

    const params = new URLSearchParams(window.location.search || '');
    const page = String(params.get('page') || '').trim().toLowerCase();
    if (page !== 'requests') {
      return null;
    }

    return {
      page: 'requests',
      requestId: String(params.get('requestId') || '').trim(),
    };
  }

  function storePendingRedirectIntent_(intent) {
    if (typeof window === 'undefined' || !intent) {
      return;
    }

    try {
      window.sessionStorage.setItem(PENDING_REDIRECT_STORAGE_KEY, JSON.stringify(intent));
    } catch {
      // Ignore storage errors and continue with auth fallback behavior.
    }
  }

  function syncRoute() {
    const hash = window.location.hash.replace(/^#/, '') || '/login';
    const normalized = normalizePath(hash);
    const authed = isAuthenticated();
    const role = String(currentUser?.role || getCurrentUser()?.role || '').trim().toLowerCase();
    const defaultPath = getRoleDefaultPath_();
    const supervisorSession = role === 'supervisor';
    const deepLinkIntent = readRequestsDeepLinkIntent_();

    if (!authed && deepLinkIntent) {
      storePendingRedirectIntent_(deepLinkIntent);
    }

    if (authed && deepLinkIntent) {
      const deepLinkPath = supervisorSession ? '/supervisor/requests' : '/requests';
      if (normalized !== deepLinkPath) {
        currentPath = deepLinkPath;
        persistLastRoleTab_(currentPath);
        if (hash !== deepLinkPath) {
          window.location.hash = deepLinkPath;
        }
        return;
      }
    }

    if (authed && supervisorSession && normalized === '/supervisor/documents') {
      currentPath = '/documents';
      persistLastRoleTab_(currentPath);
      if (hash !== '/documents') {
        window.location.hash = '/documents';
      }
      return;
    }

    if (!authed && !authPaths.has(normalized)) {
      currentPath = '/login';
      persistLastRoleTab_(currentPath);
      if (hash !== '/login') {
        window.location.hash = '/login';
      }
      return;
    }

    if (authed && authPaths.has(normalized)) {
      currentPath = defaultPath;
      persistLastRoleTab_(currentPath);
      if (hash !== defaultPath) {
        window.location.hash = defaultPath;
      }
      return;
    }

    if (authed && supervisorSession && !isSupervisorAllowedPath_(normalized)) {
      currentPath = '/supervisor';
      persistLastRoleTab_(currentPath);
      if (hash !== '/supervisor') {
        window.location.hash = '/supervisor';
      }
      return;
    }

    if (authed && !supervisorSession && isSupervisorPath_(normalized)) {
      currentPath = '/';
      persistLastRoleTab_(currentPath);
      if (hash !== '/') {
        window.location.hash = '/';
      }
      return;
    }

    currentPath = normalized;
    persistLastRoleTab_(currentPath);

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
  <svelte:component this={CurrentPage} {currentUser} />
{:else}
  <Layout {currentPath} pageMeta={basePageMeta}>
    <svelte:component this={CurrentPage} {currentUser} />
  </Layout>
{/if}
