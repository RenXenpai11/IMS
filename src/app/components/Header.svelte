<script>
  import { onDestroy, onMount } from 'svelte';
  import { Bell, Check, Moon, RefreshCw, Search, Sun } from 'lucide-svelte';
  import {
    subscribeToCurrentUser,
    listNotifications,
    markNotificationRead,
    markAllNotificationsRead,
  } from '../lib/auth.js';
  import { subscribeToSyncState, triggerSync } from '../lib/sync.js';
  import { theme, toggleTheme } from '../context/ThemeContext.js';

  export let pageTitle = 'Internship Management System';
  export let pageDescription = '';

  const POLL_INTERVAL_MS = 30000;

  const typeColors = {
    evaluation: 'notif-badge notif-badge-evaluation',
    document: 'notif-badge notif-badge-document',
    approval: 'notif-badge notif-badge-approval',
    rejection: 'notif-badge notif-badge-evaluation',
    request: 'notif-badge notif-badge-task',
    task: 'notif-badge notif-badge-task',
    system: 'notif-badge notif-badge-system',
  };

  let notifOpen = false;
  let notifications = [];
  let currentUser = null;
  let unsubscribeAuth;
  let unsubscribeSyncState;
  let syncing = false;
  let pollTimer;
  let isLoadingNotifs = false;

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

  async function loadNotifications() {
    if (!currentUser?.user_id || isLoadingNotifs) {
      return;
    }

    try {
      isLoadingNotifs = true;
      const items = await listNotifications(currentUser.user_id);
      notifications = items;
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      isLoadingNotifs = false;
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(loadNotifications, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  $: unreadCount = notifications.filter((item) => item.unread).length;
  $: userName = String(currentUser?.full_name || '').trim() || 'User';
  $: userPhotoUrl = String(currentUser?.profile_photo_url || '').trim();
  $: userInitials = buildInitials(userName);

  function toggleNotifications() {
    notifOpen = !notifOpen;
  }

  function closePanels() {
    notifOpen = false;
  }

  async function markAllRead() {
    if (!currentUser?.user_id) return;

    // Optimistic update
    notifications = notifications.map((item) => ({ ...item, unread: false }));

    try {
      await markAllNotificationsRead(currentUser.user_id);
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
      // Reload to get accurate state
      await loadNotifications();
    }
  }

  async function markRead(id) {
    // Optimistic update
    notifications = notifications.map((item) =>
      item.id === id ? { ...item, unread: false } : item
    );

    try {
      await markNotificationRead(id);
    } catch (err) {
      console.error('Failed to mark notification read:', err);
      await loadNotifications();
    }
  }

  function handleSyncNow() {
    triggerSync('manual');
  }

  onMount(() => {
    unsubscribeAuth = subscribeToCurrentUser((user) => {
      currentUser = user;
      if (user?.user_id) {
        loadNotifications();
        startPolling();
      } else {
        notifications = [];
        stopPolling();
      }
    });

    unsubscribeSyncState = subscribeToSyncState((state) => {
      syncing = Boolean(state?.syncing);
    });
  });

  onDestroy(() => {
    stopPolling();

    if (typeof unsubscribeAuth === 'function') {
      unsubscribeAuth();
    }

    if (typeof unsubscribeSyncState === 'function') {
      unsubscribeSyncState();
    }
  });
</script>

<header class="header">
  <div class="header-copy">
    <h1>{pageTitle}</h1>
    {#if pageDescription}
      <p>{pageDescription}</p>
    {/if}
  </div>

  <div class="search-shell">
    <Search size={14} />
    <input type="text" placeholder="Search..." />
  </div>

  <div class="header-actions">
    <button class="sync-button" type="button" on:click={handleSyncNow} disabled={syncing} aria-label="Sync latest data">
      <RefreshCw size={14} class={syncing ? 'sync-icon-spin' : ''} />
      <span>{syncing ? 'Syncing...' : 'Sync'}</span>
    </button>

    <button class="icon-button theme-toggle-btn" type="button" on:click={toggleTheme} aria-label="Toggle theme">
      {#if $theme === 'dark'}
        <Sun size={17} />
      {:else}
        <Moon size={17} />
      {/if}
    </button>

    <div class="menu-shell">
      <button class="icon-button" type="button" on:click={toggleNotifications} aria-label="Notifications">
        <Bell size={17} />
        {#if unreadCount > 0}
          <span class="dot"></span>
        {/if}
      </button>

      {#if notifOpen}
        <button class="backdrop" type="button" aria-label="Close notifications" on:click={closePanels}></button>
        <div class="menu-card notifications-card">
          <div class="menu-header">
            <div class="menu-title">
              <span>Notifications</span>
              {#if unreadCount > 0}
                <span class="pill">{unreadCount} new</span>
              {/if}
            </div>
            {#if unreadCount > 0}
              <button class="menu-link" type="button" on:click={markAllRead}>
                <Check size={12} />
                Mark all read
              </button>
            {/if}
          </div>

          <div class="notification-list">
            {#if notifications.length === 0}
              <div class="notification-empty">
                <p>No notifications yet</p>
              </div>
            {:else}
            {#each notifications as item (item.id)}
              <button
                class:notification-unread={item.unread}
                class="notification-item"
                type="button"
                on:click={() => markRead(item.id)}
              >
                <div class={typeColors[item.type] ?? 'notif-badge notif-badge-system'}>
                  <Bell size={12} />
                </div>
                <div class="notification-copy">
                  <div class="notification-title-row">
                    <p class="notification-title">{item.title}</p>
                    {#if item.unread}
                      <span class="notification-dot"></span>
                    {/if}
                  </div>
                  <p class="notification-description">{item.description}</p>
                  <p class="notification-time">{item.time}</p>
                </div>
              </button>
            {/each}
            {/if}
          </div>

          <div class="menu-footer">
            <button class="menu-link center" type="button">View all notifications</button>
          </div>
        </div>
      {/if}
    </div>

    <div class="menu-shell">
      <div class="profile-button" aria-label={userName}>
        <div class="avatar">
          {#if userPhotoUrl}
            <img src={userPhotoUrl} alt={`${userName} avatar`} class="avatar-image" />
          {:else}
            {userInitials}
          {/if}
        </div>
        <span class="profile-name">{userName}</span>
      </div>
    </div>
  </div>
</header>
