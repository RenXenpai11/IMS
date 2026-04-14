<script>
  import { onDestroy, onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import {
    ChevronLeft,
    ChevronDown,
    Clock,
    FileText,
    FileCheck,
    LayoutDashboard,
    LogOut,
    Settings,
    Star,
    User,
    Users2,
    Activity,
    FolderOpen,
  } from 'lucide-svelte';
  import { signOut, subscribeToCurrentUser } from '../lib/auth.js';
  import { theme } from '../context/ThemeContext.js';

  export let currentPath = '/';
  export let collapsed = false;

  const studentNavItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/time-log', label: 'Time Log', icon: Clock },
    { path: '/requests', label: 'Requests', icon: FileCheck },
    { path: '/activity', label: 'Activity Log', icon: FileText },
    { path: '/documents', label: 'Documents', icon: FileText },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  const supervisorNavItems = [
    { path: '/supervisor', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/supervisor/interns', label: 'Intern Management', icon: Users2 },
    { path: '/supervisor/time-logs', label: 'Time Logs', icon: Clock },
    { path: '/supervisor/requests', label: 'Requests', icon: FileCheck },
    { path: '/supervisor/activity', label: 'Activity', icon: Activity },
    { path: '/supervisor/documents', label: 'Documents', icon: FolderOpen },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  let profileOpen = false;
  let currentUser = null;
  let unsubscribeAuth;
  const dispatch = createEventDispatcher();

  function buildInitials(fullName) {
    const value = String(fullName || '').trim();
    if (!value) {
      return 'U';
    }

    const initials = value
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');

    return initials || 'U';
  }

  function formatRole(role) {
    const value = String(role || '').trim();
    if (!value) {
      return 'User';
    }
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }

  $: userName = String(currentUser?.full_name || '').trim() || 'User';
  $: userRole = formatRole(currentUser?.role);
  $: userPhotoUrl = String(currentUser?.profile_photo_url || '').trim();
  $: userInitials = buildInitials(userName);
  $: isSupervisorUser = String(currentUser?.role || '').trim().toLowerCase() === 'supervisor';
  $: navItems = isSupervisorUser ? supervisorNavItems : studentNavItems;
  $: logoSrc = $theme === 'dark' ? '/ims-logo-dark.jfif' : '/ims-logo-white.jfif';

  function goTo(path) {
    window.location.hash = path;
    profileOpen = false;
  }

  function toggleProfile() {
    if (collapsed) {
      return;
    }
    profileOpen = !profileOpen;
  }

  function toggleSidebar() {
    dispatch('toggle');
    profileOpen = false;
  }

  function handleSignOut() {
    signOut();
    profileOpen = false;
    window.location.hash = '/login';
  }

  onMount(() => {
    unsubscribeAuth = subscribeToCurrentUser((user) => {
      currentUser = user;
    });
  });

  onDestroy(() => {
    if (typeof unsubscribeAuth === 'function') {
      unsubscribeAuth();
    }
  });
</script>

<aside class="sidebar" class:sidebar-collapsed={collapsed}>
  <button class="sidebar-collapse-btn" type="button" on:click={toggleSidebar} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
    <ChevronLeft size={14} class={collapsed ? 'rotate-180' : ''} />
  </button>

  <div class="sidebar-brand">
    <img src={logoSrc} alt="IMS Logo" class="brand-logo" />
  </div>

  <nav class="sidebar-nav">
    <p class="sidebar-label sidebar-text">Main Menu</p>
    <ul>
      {#each navItems as item (item.path)}
        <li>
          <button
            class:active={currentPath === item.path}
            class="nav-button"
            type="button"
            on:click={() => goTo(item.path)}
            title={collapsed ? item.label : undefined}
          >
            <svelte:component this={item.icon} size={17} />
            <span class="sidebar-text">{item.label}</span>
            {#if currentPath === item.path}
              <span class="nav-dot"></span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>

    <div class="sidebar-footer-links">
      <button class="nav-button nav-button-logout" type="button" on:click={handleSignOut} title={collapsed ? 'Sign Out' : undefined}>
        <LogOut size={17} />
        <span class="sidebar-text">Sign Out</span>
      </button>
    </div>
  </nav>

  <div class="sidebar-profile">
    <div class="sidebar-profile-shell">
      <button class="sidebar-profile-button" type="button" on:click={toggleProfile} title={collapsed ? 'Profile' : undefined}>
        <div class="avatar">
          {#if userPhotoUrl}
            <img src={userPhotoUrl} alt={`${userName} avatar`} class="avatar-image" />
          {:else}
            {userInitials}
          {/if}
        </div>
        <div class="sidebar-profile-copy sidebar-text">
          <p>{userName}</p>
          <span>{userRole}</span>
        </div>
        <ChevronDown size={14} class={`sidebar-text ${profileOpen ? 'rotate-180' : ''}`} />
      </button>

      {#if profileOpen && !collapsed}
        <div class="sidebar-profile-menu">
          <button class="menu-item" type="button" on:click={() => goTo('/settings')}>
            <User size={14} />
            <span>Profile Settings</span>
          </button>
          <div class="menu-divider"></div>
          <button class="menu-item danger" type="button" on:click={handleSignOut}>
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      {/if}
    </div>
  </div>
</aside>
