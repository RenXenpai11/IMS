<script>
  import { createEventDispatcher } from 'svelte';
  import {
    ChevronLeft,
    ChevronDown,
    Clock,
    FileText,
    HelpCircle,
    KeyRound,
    LayoutDashboard,
    LogOut,
    Settings,
    Star,
    User,
  } from 'lucide-svelte';
  import { signOut } from '../lib/auth.js';

  export let currentPath = '/';
  export let collapsed = false;

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/time-log', label: 'Time Log', icon: Clock },
    { path: '/documents', label: 'Documents', icon: FileText },
    { path: '/evaluation', label: 'Evaluation', icon: Star },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  let profileOpen = false;
  const dispatch = createEventDispatcher();

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
</script>

<aside class="sidebar" class:sidebar-collapsed={collapsed}>
  <button class="sidebar-collapse-btn" type="button" on:click={toggleSidebar} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
    <ChevronLeft size={14} class={collapsed ? 'rotate-180' : ''} />
  </button>

  <div class="sidebar-brand">
    <div class="brand-mark">IMS</div>
    <span class="sidebar-text">Internship Management System</span>
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
        <div class="avatar">AJ</div>
        <div class="sidebar-profile-copy sidebar-text">
          <p>Alex Johnson</p>
          <span>Intern</span>
        </div>
        <ChevronDown size={14} class={`sidebar-text ${profileOpen ? 'rotate-180' : ''}`} />
      </button>

      {#if profileOpen && !collapsed}
        <div class="sidebar-profile-menu">
          <button class="menu-item" type="button" on:click={() => goTo('/settings')}>
            <User size={14} />
            <span>Profile Settings</span>
          </button>
          <button class="menu-item" type="button" on:click={() => goTo('/settings')}>
            <KeyRound size={14} />
            <span>Change Password</span>
          </button>
          <button class="menu-item" type="button" on:click={toggleProfile}>
            <HelpCircle size={14} />
            <span>Help & Support</span>
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
