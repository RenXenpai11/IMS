<script>
  import { onDestroy, onMount } from 'svelte';
  import {
    Bell,
    Building,
    Camera,
    Mail,
    MapPin,
    Phone,
    Save,
    User,
  } from 'lucide-svelte';
  import { subscribeToCurrentUser, updateProfilePhoto, updateUserProfile } from '../lib/auth.js';

  let saved = false;
  let saveTimer;
  let unsubscribeAuth;

  let currentUser = null;
  let isUploadingPhoto = false;
  let isSavingProfile = false;
  let photoMessage = '';
  let photoError = '';
  let saveError = '';
  let photoInput;

  const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
  const MAX_PROFILE_PHOTO_MB = Math.floor(MAX_PROFILE_PHOTO_BYTES / (1024 * 1024));
  const ALLOWED_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

  let profile = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    department: '',
    location: '',
    bio: '',
  };

  function splitFullName(fullName) {
    const normalized = String(fullName || '').trim().replace(/\s+/g, ' ');
    if (!normalized) {
      return { firstName: '', lastName: '' };
    }

    const parts = normalized.split(' ');
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: '' };
    }

    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' '),
    };
  }

  function toTitleCase(value) {
    const text = String(value || '').trim();
    if (!text) {
      return '';
    }

    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  function applyCurrentUserProfile(user) {
    if (!user) {
      return;
    }

    currentUser = user;

    const parsedName = splitFullName(user.full_name);

    profile = {
      ...profile,
      firstName: parsedName.firstName,
      lastName: parsedName.lastName,
      email: String(user.email || ''),
      phone: String(user.phone || ''),
      department: String(user.department || ''),
      location: String(user.location || ''),
      bio: String(user.bio || ''),
    };
  }

  function openPhotoPicker() {
    photoError = '';
    photoMessage = '';
    photoInput?.click();
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Unable to read selected image file.'));
      reader.readAsDataURL(file);
    });
  }

  async function handlePhotoChange(event) {
    photoError = '';
    photoMessage = '';

    const files = event?.currentTarget?.files;
    const file = files && files[0];

    if (!file) {
      return;
    }

    if (!currentUser?.user_id) {
      photoError = 'No logged-in user found. Please log in again.';
      event.currentTarget.value = '';
      return;
    }

    if (!ALLOWED_PHOTO_MIME_TYPES.has(String(file.type || '').toLowerCase())) {
      photoError = 'Only JPG, PNG, WEBP, and GIF images are allowed.';
      event.currentTarget.value = '';
      return;
    }

    if (Number(file.size || 0) > MAX_PROFILE_PHOTO_BYTES) {
      photoError = `Image is too large. Maximum file size is ${MAX_PROFILE_PHOTO_MB} MB.`;
      event.currentTarget.value = '';
      return;
    }

    try {
      isUploadingPhoto = true;
      const imageDataUrl = await fileToDataUrl(file);
      await updateProfilePhoto({
        user_id: currentUser.user_id,
        image_data_url: imageDataUrl,
        mime_type: file.type,
        file_name: file.name,
      });
      photoMessage = 'Profile photo updated successfully.';
    } catch (err) {
      photoError = err?.message || 'Unable to upload profile photo right now.';
    } finally {
      isUploadingPhoto = false;
      event.currentTarget.value = '';
    }
  }

  let notifications = {
    emailAlerts: true,
    taskReminders: true,
    evaluationAlerts: true,
    weeklyDigest: false,
    systemUpdates: true,
  };

  const MAIN_DB_URL = 'https://docs.google.com/spreadsheets/d/1cHfXzp8gRD-x8sVf_j_WtNf-1h_JUqt_O_MOEfBlNVk/edit?pli=1&gid=0#gid=0';
  let copyMessage = '';
  let copyTimer;

  function copyToClipboard() {
    navigator.clipboard.writeText(MAIN_DB_URL);
    copyMessage = 'Copied!';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyMessage = '';
    }, 2000);
  }


  const profileFields = [
    { key: 'firstName', label: 'First Name', icon: User, type: 'text' },
    { key: 'lastName', label: 'Last Name', icon: User, type: 'text' },
    { key: 'email', label: 'Email Address', icon: Mail, type: 'email', readOnly: true },
    { key: 'phone', label: 'Phone Number', icon: Phone, type: 'text' },
    { key: 'department', label: 'Department', icon: Building, type: 'text' },
    { key: 'location', label: 'Location', icon: MapPin, type: 'text' },
  ];

  const notificationRows = [
    { key: 'emailAlerts', label: 'Email Alerts', desc: 'Receive important updates via email.' },
    { key: 'taskReminders', label: 'Task Reminders', desc: 'Get notified before task deadlines.' },
    { key: 'evaluationAlerts', label: 'Evaluation Alerts', desc: 'Notifications for new evaluations or feedback.' },
    { key: 'weeklyDigest', label: 'Weekly Digest', desc: 'Summary email of your week sent every Monday.' },
    { key: 'systemUpdates', label: 'System Updates', desc: 'Announcements about maintenance or new features.' },
  ];


  function updateProfileField(key, value) {
    profile = { ...profile, [key]: value };
    saved = false;
    saveError = '';
  }

  function updateNotification(key, value) {
    notifications = { ...notifications, [key]: value };
  }


  async function handleSave() {
    saveError = '';

    if (!currentUser?.user_id) {
      saveError = 'No logged-in user found. Please log in again.';
      return;
    }

    const fullName = [String(profile.firstName || '').trim(), String(profile.lastName || '').trim()]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (!fullName) {
      saveError = 'Please provide at least your first name.';
      return;
    }

    try {
      isSavingProfile = true;
      await updateUserProfile({
        user_id: currentUser.user_id,
        full_name: fullName,
        phone: profile.phone,
        department: profile.department,
        location: profile.location,
        bio: profile.bio,
      });

      saved = true;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saved = false;
      }, 2500);
    } catch (err) {
      saveError = err?.message || 'Unable to save profile right now.';
      saved = false;
    } finally {
      isSavingProfile = false;
    }
  }

  function handleCancel() {
    if (currentUser) {
      applyCurrentUserProfile(currentUser);
    }
    saveError = '';
    saved = false;
  }

  onDestroy(() => {
    clearTimeout(saveTimer);
    clearTimeout(copyTimer);
    if (typeof unsubscribeAuth === 'function') {
      unsubscribeAuth();
    }
  });

  onMount(() => {
    unsubscribeAuth = subscribeToCurrentUser((user) => {
      currentUser = user;
      applyCurrentUserProfile(user);
    });
  });

  $: displayFirstName = String(profile.firstName || '').trim();
  $: displayLastName = String(profile.lastName || '').trim();
  $: displayName = [displayFirstName, displayLastName].filter(Boolean).join(' ') || 'User';
  $: roleLabel = toTitleCase(currentUser?.role) || 'Intern';
  $: displayDepartment = String(profile.department || '').trim();
  $: profileSubtitle = [displayDepartment, roleLabel].filter(Boolean).join(' ');
  $: profilePhotoUrl = String(currentUser?.profile_photo_url || '').trim();
  $: profileInitials = (displayName || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U';
</script>

<section class="settings-shell grid grid-cols-1 gap-6 lg:grid-cols-3">
  <div class="lg:col-span-2 space-y-6">
  <section class="theme-section settings-panel settings-panel-profile rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
    <header class="theme-divider border-b px-6 py-4">
      <div class="flex items-center gap-2">
        <User size={16} class="text-indigo-600" />
        <h2 class="theme-heading text-[15px] font-semibold">Profile Information</h2>
      </div>
      <p class="theme-text mt-1 text-[13px]">Update your personal details and public profile.</p>
    </header>

    <div class="px-6 py-5">
      <div class="mb-6 flex items-center gap-4">
        <div class="relative">
          <div class="flex h-16 w-16 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-violet-600">
            {#if profilePhotoUrl}
              <img src={profilePhotoUrl} alt={`${displayName} avatar`} class="h-16 w-16 rounded-full object-cover" />
            {:else}
              <span class="text-xl font-bold text-white">{profileInitials}</span>
            {/if}
          </div>
          <button
            type="button"
            class="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md transition-colors hover:bg-indigo-700"
            aria-label="Change profile photo"
            on:click={openPhotoPicker}
            disabled={isUploadingPhoto}
          >
            <Camera size={11} />
          </button>
        </div>

        <input
          bind:this={photoInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          class="hidden"
          on:change={handlePhotoChange}
        />

        <div>
          <p class="theme-heading text-[15px] font-semibold">{displayName}</p>
          <p class="theme-text text-[13px]">{profileSubtitle}</p>
          <button type="button" class="mt-1 text-[13px] font-medium text-indigo-600" on:click={openPhotoPicker} disabled={isUploadingPhoto}>
            {isUploadingPhoto ? 'Uploading photo...' : 'Change photo'}
          </button>
          {#if photoError}
            <p class="mt-1 text-[12px] text-rose-600">{photoError}</p>
          {/if}
          {#if photoMessage}
            <p class="mt-1 text-[12px] text-emerald-600">{photoMessage}</p>
          {/if}
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {#each profileFields as field}
          <label class="block">
            <span class="theme-text mb-1.5 block text-[13px]">{field.label}</span>
            <span class="relative block">
              <svelte:component this={field.icon} size={14} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={field.type}
                value={profile[field.key]}
                on:input={(event) => updateProfileField(field.key, event.currentTarget.value)}
                readonly={field.readOnly === true}
                class="theme-input w-full rounded-xl border py-2.5 pl-9 pr-3 text-[14px] outline-none transition-colors focus:border-indigo-400"
              />
            </span>
          </label>
        {/each}

        <label class="block sm:col-span-2">
          <span class="theme-text mb-1.5 block text-[13px]">Bio</span>
          <textarea
            rows="2"
            value={profile.bio}
            on:input={(event) => updateProfileField('bio', event.currentTarget.value)}
            class="theme-input w-full resize-none rounded-xl border px-3 py-2.5 text-[14px] outline-none transition-colors focus:border-indigo-400"
          ></textarea>
        </label>
      </div>
    </div>
  </section>

  <section class="theme-section settings-panel settings-panel-notify rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
    <header class="theme-divider border-b px-6 py-4">
      <div class="flex items-center gap-2">
        <Bell size={16} class="text-indigo-600" />
        <h2 class="theme-heading text-[15px] font-semibold">Notification Preferences</h2>
      </div>
      <p class="theme-text mt-1 text-[13px]">Choose what notifications you receive.</p>
    </header>

    <div class="px-6">
      {#each notificationRows as row, i}
        <div class={`flex items-center justify-between py-4 ${i < notificationRows.length - 1 ? 'theme-divider border-b' : ''}`}>
          <div class="mr-4 flex-1">
            <p class="theme-heading text-[14px] font-medium">{row.label}</p>
            <p class="theme-text mt-0.5 text-[13px]">{row.desc}</p>
          </div>
          <button
            type="button"
            class="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200"
            style={`background-color: ${notifications[row.key] ? '#4F46E5' : '#E5E7EB'};`}
            on:click={() => updateNotification(row.key, !notifications[row.key])}
            aria-label={`Toggle ${row.label}`}
          >
            <span class={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${notifications[row.key] ? 'translate-x-5' : 'translate-x-0'}`}></span>
          </button>
        </div>
      {/each}
    </div>
  </section>


  <div class="flex items-center justify-end gap-3">
    <button
      type="button"
      on:click={handleCancel}
      class="settings-btn settings-btn-ghost rounded-xl px-5 py-2.5 text-[14px] font-medium"
      disabled={isSavingProfile}
    >
      Cancel
    </button>
    <button
      type="button"
      on:click={handleSave}
      class="settings-btn settings-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-medium text-white"
      class:settings-btn-success={saved}
      disabled={isSavingProfile}
    >
      <Save size={14} />
      {isSavingProfile ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
    </button>
  </div>

  {#if saveError}
    <p class="text-right text-[12px] text-rose-600">{saveError}</p>
  {/if}
  </div>

  <!-- MAIN_DB Section on Right -->
  <div class="lg:col-span-1">
    <section class="theme-section settings-panel settings-panel-database rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.05)] p-6 sticky top-6">
      <h3 class="theme-heading text-[16px] font-bold mb-4">MAIN_DB</h3>
      <p class="theme-text text-[13px] mb-4">Access the main database spreadsheet for this project.</p>
      
      <div class="mb-4 p-4 rounded-lg settings-link-box border">
        <a 
          href={MAIN_DB_URL}
          target="_blank"
          rel="noopener noreferrer"
          class="settings-link text-[13px] font-medium break-all line-clamp-3 hover:underline"
        >
          {MAIN_DB_URL}
        </a>
      </div>

      <button
        type="button"
        on:click={copyToClipboard}
        class="settings-btn settings-copy-button w-full rounded-lg px-4 py-2.5 text-[14px] font-medium text-white"
      >
        {copyMessage || 'Copy Link'}
      </button>
      
      {#if copyMessage}
        <p class="settings-copy-note mt-2 text-[12px] text-center font-medium">{copyMessage}</p>
      {/if}
    </section>
  </div>
</section>

<style>
  .settings-shell {
    --st-surface: #ffffff;
    --st-surface-soft: #f3f8ff;
    --st-border: #d7e3f1;
    --st-heading: #0f172a;
    --st-text: #1f2937;
    --st-muted: #60748e;
    position: relative;
    border-radius: 1.25rem;
    padding: 0.35rem;
    isolation: isolate;
  }

  .settings-shell::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -2;
    border-radius: 1.25rem;
    background: radial-gradient(130% 130% at 0% 0%, #e4f1ff 0%, #f7fbff 58%, #eef4fb 100%);
  }

  .settings-shell::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: 1.25rem;
    background-image: linear-gradient(112deg, rgba(15, 108, 189, 0.08), transparent 52%),
      repeating-linear-gradient(90deg, transparent 0, transparent 30px, rgba(15, 108, 189, 0.04) 30px, rgba(15, 108, 189, 0.04) 31px);
    pointer-events: none;
  }

  .theme-section {
    background: var(--st-surface);
    border-color: var(--st-border);
    box-shadow: 0 18px 36px -30px rgba(15, 23, 42, 0.42);
  }

  .settings-panel {
    position: relative;
    overflow: hidden;
  }

  .settings-panel::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 3px;
  }

  .settings-panel-profile::before {
    background: linear-gradient(90deg, #0f6cbd, #38bdf8);
  }

  .settings-panel-notify::before {
    background: linear-gradient(90deg, #d97706, #f59e0b);
  }

  .settings-panel-database::before {
    background: linear-gradient(90deg, #1d4ed8, #06b6d4);
  }

  .theme-divider,
  .theme-border {
    border-color: var(--st-border);
  }

  .theme-input {
    background: #edf4fb;
    border-color: #bed2e8;
    color: var(--st-heading);
  }

  .theme-input:focus {
    border-color: #60a5fa;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  }

  .theme-heading {
    color: var(--st-heading);
  }

  .theme-text {
    color: var(--st-text);
  }

  .settings-btn {
    transition: all 0.2s ease;
  }

  .settings-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    box-shadow: none;
  }

  .settings-btn-ghost {
    border: 1px solid #bfd5ec;
    background: #f7fbff;
    color: #355472;
  }

  .settings-btn-ghost:hover:not(:disabled) {
    background: #edf4fb;
    border-color: #9fc2e5;
  }

  .settings-btn-primary,
  .settings-copy-button {
    background: linear-gradient(90deg, #0f6cbd, #0ea5e9);
    border: 1px solid #0f6cbd;
    box-shadow: 0 14px 28px -16px rgba(15, 108, 189, 0.9);
  }

  .settings-btn-primary:hover:not(:disabled),
  .settings-copy-button:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-1px);
  }

  .settings-btn-success {
    background: linear-gradient(90deg, #0f766e, #10b981);
    border-color: #0f766e;
  }

  .settings-link-box {
    background: #f1f7fd;
    border-color: #c9d9ec;
  }

  .settings-link {
    color: #0f6cbd;
  }

  .settings-link:hover {
    color: #0a4f8d;
  }

  .settings-copy-note {
    color: #0f766e;
  }

  :global(.dark) .settings-shell {
    --st-surface: #162338;
    --st-surface-soft: #1b2a42;
    --st-border: #2b3c57;
    --st-heading: #e5edf8;
    --st-text: #cfdceb;
    --st-muted: #9ab0cb;
  }

  :global(.dark) .settings-shell::before {
    background: radial-gradient(130% 130% at 0% 0%, #173459 0%, #101a2b 48%, #0b1422 100%);
  }

  :global(.dark) .settings-shell::after {
    background-image: linear-gradient(112deg, rgba(91, 177, 255, 0.12), transparent 55%),
      repeating-linear-gradient(90deg, transparent 0, transparent 32px, rgba(148, 163, 184, 0.07) 32px, rgba(148, 163, 184, 0.07) 33px);
  }

  :global(.dark) .theme-section {
    box-shadow: 0 20px 38px -30px rgba(2, 8, 23, 0.95);
  }

  :global(.dark) .theme-input {
    background: #1a2c45;
    border-color: #334b6b;
    color: #dbe7f5;
  }

  :global(.dark) .theme-input:focus {
    border-color: #7cc3ff;
    box-shadow: 0 0 0 3px rgba(91, 177, 255, 0.24);
  }

  :global(.dark) .settings-btn-ghost {
    border-color: #365276;
    background: #1a2c45;
    color: #cfe0f2;
  }

  :global(.dark) .settings-btn-ghost:hover:not(:disabled) {
    background: #223653;
    border-color: #4a6789;
  }

  :global(.dark) .settings-link-box {
    background: #1a2c45;
    border-color: #334b6b;
  }

  :global(.dark) .settings-link {
    color: #7cc3ff;
  }

  :global(.dark) .settings-link:hover {
    color: #a5d8ff;
  }

  :global(.dark) .settings-copy-note {
    color: #6ee7b7;
  }

  @media (max-width: 768px) {
    .settings-shell {
      border-radius: 1rem;
      padding: 0;
    }
  }
</style>