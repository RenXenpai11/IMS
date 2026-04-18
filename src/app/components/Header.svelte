<script>
  import { onDestroy, onMount } from 'svelte';
  import { Bell, Check, RefreshCw } from 'lucide-svelte';
  import {
    subscribeToCurrentUser,
    listNotifications,
    markNotificationRead,
    markAllNotificationsRead,
  } from '../lib/auth.js';
  import { subscribeToSyncState, triggerSync } from '../lib/sync.js';
  import { theme, toggleTheme } from '../context/ThemeContext.js';

  export let pageTitle = 'Dashboard';
  export let pageDescription = '';
  export let collapsed = false;

  const POLL_INTERVAL_MS = 30000;

  const typeColors = {
    evaluation: 'nb nb-eval',
    document:   'nb nb-doc',
    approval:   'nb nb-ok',
    rejection:  'nb nb-eval',
    request:    'nb nb-task',
    task:       'nb nb-task',
    system:     'nb nb-sys',
  };

  let notifOpen = false;
  let notifications = [];
  let currentUser = null;
  let unsubscribeAuth;
  let unsubscribeSyncState;
  let syncing = false;
  let pollTimer;
  let isLoadingNotifs = false;

  async function loadNotifications() {
    if (!currentUser?.user_id || isLoadingNotifs) return;
    try {
      isLoadingNotifs = true;
      notifications = await listNotifications(currentUser.user_id);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      isLoadingNotifs = false;
    }
  }

  function startPolling() { stopPolling(); pollTimer = setInterval(loadNotifications, POLL_INTERVAL_MS); }
  function stopPolling()  { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  $: unreadCount = notifications.filter((n) => n.unread).length;

  function toggleNotifications() { notifOpen = !notifOpen; }
  function closePanels()         { notifOpen = false; }

  async function markAllRead() {
    if (!currentUser?.user_id) return;
    notifications = notifications.map((n) => ({ ...n, unread: false }));
    try { await markAllNotificationsRead(currentUser.user_id); }
    catch (err) { console.error(err); await loadNotifications(); }
  }

  async function markRead(id) {
    notifications = notifications.map((n) => n.id === id ? { ...n, unread: false } : n);
    try { await markNotificationRead(id); }
    catch (err) { console.error(err); await loadNotifications(); }
  }

  function handleSyncNow() { triggerSync('manual'); }

  onMount(() => {
    unsubscribeAuth = subscribeToCurrentUser((user) => {
      currentUser = user;
      if (user?.user_id) { loadNotifications(); startPolling(); }
      else { notifications = []; stopPolling(); }
    });
    unsubscribeSyncState = subscribeToSyncState((state) => {
      syncing = Boolean(state?.syncing);
    });
  });
  onDestroy(() => {
    stopPolling();
    if (typeof unsubscribeAuth === 'function') unsubscribeAuth();
    if (typeof unsubscribeSyncState === 'function') unsubscribeSyncState();
  });
</script>

<header class="ims-topbar">

  <!-- LOGO AREA REMOVED -->

  <!-- TITLE + ACTIONS -->
  <div class="ims-topbar-body">
    <div class="ims-page-title">
      <strong>{pageTitle}</strong>
      {#if pageDescription}<span>{pageDescription}</span>{/if}
    </div>

    <div class="ims-spacer"></div>

    <div class="ims-actions">
      <!-- Sync -->
      <button
        class="ims-icon-btn"
        type="button"
        on:click={handleSyncNow}
        disabled={syncing}
        title="Sync"
      >
        <RefreshCw size={14} class={syncing ? 'ims-spin' : ''} />
      </button>

      <!-- Notifications -->
      <div class="ims-menu-shell">
        <button
          class="ims-icon-btn"
          type="button"
          on:click={toggleNotifications}
          title="Notifications"
        >
          <Bell size={14} />
          {#if unreadCount > 0}
            <span class="ims-notif-dot"></span>
          {/if}
        </button>

        {#if notifOpen}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <div class="ims-backdrop" role="button" tabindex="-1" on:click={closePanels}></div>
          <div class="ims-notif-card">
            <div class="ims-notif-header">
              <div class="ims-notif-title-row">
                <span class="ims-notif-heading">Notifications</span>
                {#if unreadCount > 0}
                  <span class="ims-pill">{unreadCount} new</span>
                {/if}
              </div>
              {#if unreadCount > 0}
                <button class="ims-menu-link" type="button" on:click={markAllRead}>
                  <Check size={12} /> Mark all read
                </button>
              {/if}
            </div>

            <div class="ims-notif-list">
              {#if notifications.length === 0}
                <div class="ims-notif-empty"><p>No notifications yet</p></div>
              {:else}
                {#each notifications as item (item.id)}
                  <button
                    class="ims-notif-item"
                    class:ims-unread={item.unread}
                    type="button"
                    on:click={() => markRead(item.id)}
                  >
                    <div class={typeColors[item.type] ?? 'nb nb-sys'}>
                      <Bell size={12} />
                    </div>
                    <div class="ims-notif-copy">
                      <div class="ims-notif-title-row">
                        <p class="ims-notif-name">{item.title}</p>
                        {#if item.unread}<span class="ims-udot"></span>{/if}
                      </div>
                      <p class="ims-notif-desc">{item.description}</p>
                      <p class="ims-notif-time">{item.time}</p>
                    </div>
                  </button>
                {/each}
              {/if}
            </div>

            <div class="ims-notif-footer">
              <button class="ims-menu-link" type="button">View all notifications</button>
            </div>
          </div>
        {/if}
      </div>

      <!-- Theme Toggle pill -->
      <button class="ims-theme-toggle" type="button" on:click={toggleTheme} aria-label="Toggle theme">
        <span>{$theme === 'dark' ? 'Light' : 'Dark'}</span>
        <div class="ims-toggle-icon">
          {#if $theme === 'dark'}
            <svg width="14" height="14" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="4" fill="#facc15"/>
              <g stroke="#facc15" stroke-width="1.5" stroke-linecap="round">
                <line x1="11" y1="2"    x2="11" y2="5"/>
                <line x1="11" y1="17"   x2="11" y2="20"/>
                <line x1="2"  y1="11"   x2="5"  y2="11"/>
                <line x1="17" y1="11"   x2="20" y2="11"/>
                <line x1="4.22"  y1="4.22"  x2="6.34"  y2="6.34"/>
                <line x1="15.66" y1="15.66" x2="17.78" y2="17.78"/>
                <line x1="4.22"  y1="17.78" x2="6.34"  y2="15.66"/>
                <line x1="15.66" y1="6.34"  x2="17.78" y2="4.22"/>
              </g>
            </svg>
          {:else}
            <svg width="14" height="14" viewBox="0 0 22 22" fill="none">
              <path d="M16 11.5A5.5 5.5 0 0 1 11.5 6c-.2 0-.4 0-.6.02A5.5 5.5 0 1 0 16 16.08c.02-.2.02-.4.02-.58z" fill="#fbbf24"/>
            </svg>
          {/if}
        </div>
      </button>
    </div>
  </div>
</header>

<style>
  /* ══ LIGHT ══ */
  .ims-topbar {
    --s:  #ffffff;
    --s2: #f8fafc;
    --b:  #e2e8f0;
    --a:  #2563eb;
    --a2: #3b82f6;
    --t:  #0f172a;
    --t2: #64748b;
    --r:  8px;
    --sh: 0 1px 3px #0000000d, 0 1px 2px #00000008;

    height: 56px;
    background: var(--s);
    border-bottom: 1px solid var(--b);
    box-shadow: var(--sh);
    display: flex;
    align-items: center;
    flex-shrink: 0;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  /* ══ DARK — tied to body.dark ══ */
  :global(body.dark) .ims-topbar {
    --s:  #161c27;
    --s2: #1e2736;
    --b:  #ffffff12;
    --a:  #3b82f6;
    --a2: #60a5fa;
    --t:  #f1f5f9;
    --t2: #94a3b8;
    --sh: 0 1px 3px #00000040;
  }

  /* ══ LOGO AREA ══ */
  .ims-logo-area {
    width: 240px;
    flex-shrink: 0;
    padding: 0 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    border-right: 1px solid var(--b);
    height: 100%;
    transition: width 0.25s ease;
    overflow: hidden;
  }
  .ims-logo-area.logo-collapsed {
    width: 56px;
    padding: 0 12px;
    justify-content: center;
  }

  .ims-logo-text  { overflow: hidden; white-space: nowrap; }
  .ims-logo-title { font-size: 13px; font-weight: 700; color: var(--t); line-height: 1.3; }
  .ims-logo-sub   { font-size: 10.5px; font-weight: 500; color: var(--t2); }

  /* ══ BODY ══ */
  .ims-topbar-body {
    flex: 1;
    display: flex;
    align-items: center;
    padding: 0 20px;
    gap: 16px;
    overflow: hidden;
  }

  .ims-page-title         { display: flex; flex-direction: column; line-height: 1.3; }
  .ims-page-title strong  { font-size: 15px; font-weight: 700; color: var(--t); }
  .ims-page-title span    { font-size: 12px; color: var(--t2); }
  .ims-spacer             { flex: 1; }
  .ims-actions            { display: flex; align-items: center; gap: 8px; }

  /* ══ ICON BUTTON ══ */
  .ims-icon-btn {
    width: 34px; height: 34px;
    border-radius: var(--r);
    border: 1px solid var(--b);
    background: transparent;
    color: var(--t2);
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: all .15s;
    position: relative;
    flex-shrink: 0;
  }
  .ims-icon-btn:hover    { background: var(--s2); color: var(--t); }
  .ims-icon-btn:disabled { opacity: .5; cursor: not-allowed; }

  :global(.ims-spin) { animation: ims-rotate 1s linear infinite; }
  @keyframes ims-rotate { to { transform: rotate(360deg); } }

  /* ══ NOTIF DOT ══ */
  .ims-notif-dot {
    position: absolute;
    top: 6px; right: 6px;
    width: 7px; height: 7px;
    border-radius: 50%;
    background: #ef4444;
    border: 1.5px solid var(--s);
  }

  /* ══ THEME TOGGLE ══ */
  .ims-theme-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--s2);
    border: 1px solid var(--b);
    border-radius: 40px;
    padding: 4px 8px 4px 12px;
    cursor: pointer;
    transition: border-color .2s;
    flex-shrink: 0;
  }
  .ims-theme-toggle span  { font-size: 13px; font-weight: 500; color: var(--t2); }
  .ims-theme-toggle:hover { border-color: var(--a2); }

  .ims-toggle-icon {
    background: var(--s);
    width: 26px; height: 26px;
    display: grid; place-items: center;
    border-radius: 50%;
    box-shadow: 0 1px 3px #0000000d;
  }

  /* ══ NOTIF SHELL ══ */
  .ims-menu-shell { position: relative; }

  .ims-backdrop {
    position: fixed; inset: 0;
    z-index: 10;
    background: transparent;
    border: none; cursor: default;
  }

  /* ══ NOTIF CARD ══ */
  .ims-notif-card {
    position: absolute;
    top: calc(100% + 10px); right: 0;
    width: 320px;
    background: var(--s);
    border: 1px solid var(--b);
    border-radius: 12px;
    box-shadow: 0 8px 30px #0000001a;
    z-index: 20;
    overflow: hidden;
  }

  .ims-notif-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--b);
  }
  .ims-notif-title-row { display: flex; align-items: center; gap: 8px; }
  .ims-notif-heading   { font-size: 13px; font-weight: 600; color: var(--t); }
  .ims-pill {
    font-size: 10px; font-weight: 600;
    background: var(--a2); color: #fff;
    border-radius: 20px; padding: 1px 7px;
  }

  .ims-menu-link {
    display: flex; align-items: center; gap: 4px;
    font-size: 11.5px; font-weight: 500;
    color: var(--a2);
    background: transparent; border: none;
    cursor: pointer; padding: 0;
  }
  .ims-menu-link:hover { text-decoration: underline; }

  .ims-notif-list  { max-height: 300px; overflow-y: auto; }
  .ims-notif-empty { padding: 28px 16px; text-align: center; color: var(--t2); font-size: 13px; }

  .ims-notif-item {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 12px 16px;
    width: 100%;
    background: transparent;
    border: none; border-bottom: 1px solid var(--b);
    cursor: pointer; text-align: left;
    transition: background .12s;
  }
  .ims-notif-item:hover { background: var(--s2); }
  .ims-notif-item.ims-unread { background: var(--s2); }

  /* Notification badge types — must be global for dynamic classes */
  :global(.nb)      { width:30px;height:30px;border-radius:8px;display:grid;place-items:center;flex-shrink:0; }
  :global(.nb-eval) { background:#fef3c7;color:#d97706; }
  :global(.nb-doc)  { background:#ede9fe;color:#7c3aed; }
  :global(.nb-ok)   { background:#dcfce7;color:#16a34a; }
  :global(.nb-task) { background:#dbeafe;color:#2563eb; }
  :global(.nb-sys)  { background:#f1f5f9;color:#64748b; }

  .ims-notif-copy   { flex:1; overflow:hidden; }
  .ims-notif-name   { font-size:12.5px;font-weight:600;color:var(--t);white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
  .ims-notif-desc   { font-size:11.5px;color:var(--t2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
  .ims-notif-time   { font-size:10.5px;color:var(--t2);margin-top:3px;opacity:.7; }
  .ims-udot         { width:6px;height:6px;border-radius:50%;background:var(--a2);flex-shrink:0;margin-left:4px; }

  .ims-notif-footer {
    padding: 10px 16px;
    border-top: 1px solid var(--b);
    display: flex; justify-content: center;
  }
</style>