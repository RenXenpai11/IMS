<script>
  import { onDestroy, onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import {
    Clock,
    FileText,
    FileCheck,
    LayoutDashboard,
    LogOut,
    Settings,
    Users2,
    Activity,
    FolderOpen,
  } from 'lucide-svelte';
  import { signOut, subscribeToCurrentUser } from '../lib/auth.js';

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
    { path: '/documents', label: 'Documents', icon: FolderOpen },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  let currentUser = null;
  let unsubscribeAuth;
  const dispatch = createEventDispatcher();

  function buildInitials(fullName) {
    const value = String(fullName || '').trim();
    if (!value) return 'U';
    return (
      value
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p.charAt(0).toUpperCase())
        .join('') || 'U'
    );
  }

  function formatRole(role) {
    const value = String(role || '').trim();
    if (!value) return 'User';
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }

  $: userName     = String(currentUser?.full_name || '').trim() || 'User';
  $: userRole     = formatRole(currentUser?.role);
  $: userPhotoUrl = String(currentUser?.profile_photo_url || '').trim();
  $: userInitials = buildInitials(userName);
  $: isSupervisorUser =
    String(currentUser?.role || '').trim().toLowerCase() === 'supervisor';
  $: navItems = isSupervisorUser ? supervisorNavItems : studentNavItems;

  function goTo(path) {
    window.location.hash = path;
  }
  function toggleSidebar() {
    dispatch('toggle');
  }
  function handleSignOut() {
    signOut();
    window.location.hash = '/login';
  }

  onMount(() => {
    unsubscribeAuth = subscribeToCurrentUser((user) => {
      currentUser = user;
    });
  });
  onDestroy(() => {
    if (typeof unsubscribeAuth === 'function') unsubscribeAuth();
  });
</script>

<div class="ims-sw" class:ims-collapsed={collapsed}>
  <aside class="ims-sidebar">
    <div class="ims-sidebar-logo" style="display:flex;align-items:center;gap:10px;padding:18px 10px 8px 10px;">
      <svg style="width:32px;height:32px;flex-shrink:0;" viewBox="0 0 38 38" fill="none">
        <circle cx="19" cy="19" r="18" fill="#1e1b3a" stroke="#5b52b0" stroke-width="1"/>
        <line x1="19" y1="19" x2="30" y2="10" stroke="#5b52b0" stroke-width="0.8"/>
        <line x1="19" y1="19" x2="32" y2="22" stroke="#5b52b0" stroke-width="0.8"/>
        <line x1="19" y1="19" x2="25" y2="31" stroke="#5b52b0" stroke-width="0.8"/>
        <line x1="19" y1="19" x2="13" y2="32" stroke="#5b52b0" stroke-width="0.8"/>
        <line x1="19" y1="19" x2="7"  y2="22" stroke="#5b52b0" stroke-width="0.8"/>
        <line x1="19" y1="19" x2="9"  y2="10" stroke="#5b52b0" stroke-width="0.8"/>
        <line x1="19" y1="19" x2="19" y2="5"  stroke="#5b52b0" stroke-width="0.8"/>
        <line x1="30" y1="10" x2="19" y2="5"  stroke="#5b52b0" stroke-width="0.8"/>
        <line x1="30" y1="10" x2="32" y2="22" stroke="#5b52b0" stroke-width="0.8"/>
        <line x1="32" y1="22" x2="25" y2="31" stroke="#5b52b0" stroke-width="0.8"/>
        <line x1="25" y1="31" x2="13" y2="32" stroke="#5b52b0" stroke-width="0.8"/>
        <line x1="13" y1="32" x2="7"  y2="22" stroke="#5b52b0" stroke-width="0.8"/>
        <line x1="7"  y1="22" x2="9"  y2="10" stroke="#5b52b0" stroke-width="0.8"/>
        <line x1="9"  y1="10" x2="19" y2="5"  stroke="#5b52b0" stroke-width="0.8"/>
        <circle cx="19" cy="19" r="3"   fill="#7c73c8"/>
        <circle cx="30" cy="10" r="2.5" fill="#7c73c8"/>
        <circle cx="32" cy="22" r="2.5" fill="#7c73c8"/>
        <circle cx="25" cy="31" r="2.5" fill="#7c73c8"/>
        <circle cx="13" y="32" r="2.5" fill="#7c73c8"/>
        <circle cx="7"  cy="22" r="2.5" fill="#7c73c8"/>
        <circle cx="9"  cy="10" r="2.5" fill="#7c73c8"/>
        <circle cx="19" cy="5"  r="2.5" fill="#7c73c8"/>
        <text x="19" y="23" text-anchor="middle" font-family="'DM Sans',sans-serif" font-weight="700" font-size="9" fill="#e0dcff" letter-spacing="0.5">IMS</text>
      </svg>
      <div style="overflow:hidden;">
        <div style="font-size:13px;font-weight:700;color:var(--t);line-height:1.3;white-space:nowrap;">Internship</div>
        <div style="font-size:10.5px;font-weight:500;color:var(--t2);white-space:nowrap;">Management System</div>
      </div>
    </div>

    <p class="ims-nav-label">Main Menu</p>

    <nav class="ims-nav">
      {#each navItems as item (item.path)}
        <button
          class="ims-nav-item"
          class:active={currentPath === item.path}
          type="button"
          on:click={() => goTo(item.path)}
          title={collapsed ? item.label : undefined}
        >
          <svelte:component this={item.icon} size={15} />
          <span class="ims-nav-text">{item.label}</span>
          {#if currentPath === item.path}
            <span class="ims-nav-dot"></span>
          {/if}
        </button>
      {/each}
    </nav>

    <div class="ims-sidebar-bottom">
      <button
        class="ims-nav-item"
        type="button"
        on:click={handleSignOut}
        title={collapsed ? 'Sign Out' : undefined}
      >
        <LogOut size={15} />
        <span class="ims-nav-text">Sign Out</span>
      </button>

      <div class="ims-user-card">
        <div class="ims-avatar">
          {#if userPhotoUrl}
            <img src={userPhotoUrl} alt="{userName} avatar" class="ims-avatar-img" />
          {:else}
            {userInitials}
          {/if}
        </div>
        <div class="ims-user-info">
          <div class="ims-user-name">{userName}</div>
          <div class="ims-user-role">{userRole} · Intern</div>
        </div>
      </div>
    </div>
  </aside>

  <button
    class="ims-collapse-btn"
    type="button"
    on:click={toggleSidebar}
    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
  >
    <svg
      width="12" height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      style="transition:transform 0.25s ease;transform:rotate({collapsed ? '180deg' : '0deg'})"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  </button>
</div>

<style>
  /* ══ LIGHT ══ */
  .ims-sw {
    --s:  #ffffff;
    --s2: #f8fafc;
    --b:  #e2e8f0;
    --a:  #2563eb;
    --a2: #3b82f6;
    --ag: #2563eb18;
    --p:  #7c3aed;
    --t:  #0f172a;
    --t2: #64748b;
    --t3: #94a3b8;
    --r:  8px;
    --sh: 0 1px 3px #0000000d, 0 1px 2px #00000008;

    position: relative;
    display: flex;
    flex-shrink: 0;
    height: 100%;
  }

  /* ══ DARK — tied to body.dark ══ */
  :global(body.dark) .ims-sw {
    --s:  #161c27;
    --s2: #1e2736;
    --b:  #ffffff12;
    --a:  #3b82f6;
    --a2: #60a5fa;
    --ag: #3b82f625;
    --p:  #a78bfa;
    --t:  #f1f5f9;
    --t2: #94a3b8;
    --t3: #4b5563;
    --sh: 0 1px 3px #00000040;
  }

  /* ══ SIDEBAR ══ */
  .ims-sidebar {
    width: 240px;
    flex-shrink: 0;
    background: var(--s);
    border-right: 1px solid var(--b);
    box-shadow: var(--sh);
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 10px 24px;
    transition: width 0.25s ease;
    overflow: hidden;
    height: 100%;
  }

  /* ══ COLLAPSED ══ */
  .ims-sw.ims-collapsed .ims-sidebar        { width: 56px; padding: 0 8px 24px; }
  .ims-sw.ims-collapsed .ims-nav-label,
  .ims-sw.ims-collapsed .ims-nav-text,
  .ims-sw.ims-collapsed .ims-user-info,
  .ims-sw.ims-collapsed .ims-nav-dot        { display: none; }
  .ims-sw.ims-collapsed .ims-nav-item       { justify-content: center; padding: 10px 0; }
  .ims-sw.ims-collapsed .ims-user-card      { justify-content: center; padding: 8px 4px; }

  /* ══ NAV LABEL ══ */
  .ims-nav-label {
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: .12em;
    color: var(--t3);
    text-transform: uppercase;
    padding: 0 10px;
    margin: 6px 0 3px;
    white-space: nowrap;
    overflow: hidden;
  }

  /* ══ NAV ══ */
  .ims-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .ims-nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px;
    border-radius: var(--r);
    font-size: 13px;
    font-weight: 500;
    color: var(--t2);
    cursor: pointer;
    transition: all .15s;
    position: relative;
    white-space: nowrap;
    overflow: hidden;
    width: 100%;
    background: transparent;
    border: none;
    text-align: left;
  }
  .ims-nav-item:hover        { background: var(--s2); color: var(--t); }
  .ims-nav-item.active       { background: var(--ag); color: var(--a2); }
  .ims-nav-item.active::before {
    content: '';
    position: absolute;
    left: 0; top: 50%;
    transform: translateY(-50%);
    width: 3px; height: 60%;
    background: var(--a);
    border-radius: 0 4px 4px 0;
  }

  .ims-nav-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--a);
    margin-left: auto;
    flex-shrink: 0;
  }
  .ims-nav-text { white-space: nowrap; overflow: hidden; }

  /* ══ BOTTOM ══ */
  .ims-sidebar-bottom {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ims-user-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border-radius: var(--r);
    border: 1px solid var(--b);
    background: var(--s2);
    overflow: hidden;
    white-space: nowrap;
  }

  .ims-avatar {
    width: 30px; height: 30px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--a), var(--p));
    color: #fff;
    font-size: 11px; font-weight: 700;
    display: grid; place-items: center;
    flex-shrink: 0; overflow: hidden;
  }
  .ims-avatar-img { width:100%; height:100%; object-fit:cover; border-radius:50%; }

  .ims-user-info { overflow: hidden; }
  .ims-user-name {
    font-size: 12px; font-weight: 600;
    color: var(--t);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ims-user-role { font-size: 10.5px; color: var(--t2); white-space: nowrap; }

  /* ══ COLLAPSE BUTTON ══ */
  .ims-collapse-btn {
    position: absolute;
    right: -14px; top: 72px;
    width: 28px; height: 28px;
    border-radius: 50%;
    background: var(--a);
    border: none;
    color: #fff;
    cursor: pointer;
    display: grid; place-items: center;
    z-index: 20;
    box-shadow: 0 2px 8px #2563eb44;
    transition: background .15s;
    flex-shrink: 0;
  }
  .ims-collapse-btn:hover { background: var(--a2); }
</style>