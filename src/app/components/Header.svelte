<script>
  import { Bell, Check, ChevronDown, LogOut, Search, Settings, User } from 'lucide-svelte';

  export let pageTitle = 'Internship Management System';
  export let pageDescription = '';

  const initialNotifications = [
    {
      id: 1,
      title: 'Performance Review Scheduled',
      description: 'Your mid-term evaluation is scheduled for April 10, 2026.',
      time: '2 hours ago',
      unread: true,
      type: 'evaluation',
    },
    {
      id: 2,
      title: 'Document Submission Reminder',
      description: 'Please submit your weekly report by Friday, April 5.',
      time: '5 hours ago',
      unread: true,
      type: 'document',
    },
    {
      id: 3,
      title: 'Overtime Request Approved',
      description: 'Your overtime request for March 28 has been approved.',
      time: '1 day ago',
      unread: true,
      type: 'approval',
    },
    {
      id: 4,
      title: 'New Task Assigned',
      description: 'You have been assigned a new task: API Integration Testing.',
      time: '2 days ago',
      unread: false,
      type: 'task',
    },
    {
      id: 5,
      title: 'System Maintenance Notice',
      description: 'The system will be under maintenance on April 6 from 12-2 AM.',
      time: '3 days ago',
      unread: false,
      type: 'system',
    },
  ];

  const typeColors = {
    evaluation: 'notif-badge notif-badge-evaluation',
    document: 'notif-badge notif-badge-document',
    approval: 'notif-badge notif-badge-approval',
    task: 'notif-badge notif-badge-task',
    system: 'notif-badge notif-badge-system',
  };

  let notifOpen = false;
  let profileOpen = false;
  let notifications = initialNotifications;

  $: unreadCount = notifications.filter((item) => item.unread).length;

  function toggleNotifications() {
    notifOpen = !notifOpen;
    profileOpen = false;
  }

  function toggleProfile() {
    profileOpen = !profileOpen;
    notifOpen = false;
  }

  function closePanels() {
    notifOpen = false;
    profileOpen = false;
  }

  function markAllRead() {
    notifications = notifications.map((item) => ({ ...item, unread: false }));
  }

  function markRead(id) {
    notifications = notifications.map((item) =>
      item.id === id ? { ...item, unread: false } : item
    );
  }

  function goTo(path) {
    window.location.hash = path;
    closePanels();
  }
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
          </div>

          <div class="menu-footer">
            <button class="menu-link center" type="button">View all notifications</button>
          </div>
        </div>
      {/if}
    </div>

    <div class="menu-shell">
      <button class="profile-button" type="button" on:click={toggleProfile}>
        <div class="avatar">AJ</div>
        <span class="profile-name">Alex Johnson</span>
        <ChevronDown size={13} class={profileOpen ? 'rotate-180' : ''} />
      </button>

      {#if profileOpen}
        <button class="backdrop" type="button" aria-label="Close profile menu" on:click={closePanels}></button>
        <div class="menu-card profile-card">
          <div class="profile-summary">
            <p>Alex Johnson</p>
            <span>alex.j@company.com</span>
          </div>
          <button class="menu-item" type="button" on:click={() => goTo('/settings')}>
            <User size={14} />
            <span>Profile</span>
          </button>
          <button class="menu-item" type="button" on:click={() => goTo('/settings')}>
            <Settings size={14} />
            <span>Settings</span>
          </button>
          <div class="menu-divider"></div>
          <button class="menu-item danger" type="button" on:click={closePanels}>
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      {/if}
    </div>
  </div>
</header>
