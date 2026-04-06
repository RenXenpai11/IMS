<script>
  import { onDestroy, onMount } from 'svelte';
  import {
    Bell,
    Building,
    Camera,
    Eye,
    EyeOff,
    Mail,
    MapPin,
    Moon,
    Phone,
    Save,
    Shield,
    Sun,
    User,
  } from 'lucide-svelte';
  import { subscribeToCurrentUser, updateProfilePhoto, updateUserProfile } from '../lib/auth.js';
  import { setTheme, theme, toggleTheme } from '../context/ThemeContext.js';

  let showCurrentPassword = false;
  let showNewPassword = false;
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

  let privacy = {
    profileVisible: true,
    activityVisible: false,
    twoFactor: false,
  };

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

  const privacyRows = [
    { key: 'profileVisible', label: 'Public Profile', desc: 'Make your profile visible to other team members.' },
    { key: 'activityVisible', label: 'Activity Status', desc: 'Show when you were last active.' },
    { key: 'twoFactor', label: 'Two-Factor Authentication', desc: 'Add an extra layer of security to your account.' },
  ];

  function updateProfileField(key, value) {
    profile = { ...profile, [key]: value };
    saved = false;
    saveError = '';
  }

  function updateNotification(key, value) {
    notifications = { ...notifications, [key]: value };
  }

  function updatePrivacy(key, value) {
    privacy = { ...privacy, [key]: value };
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

<section class="mr-auto w-full max-w-5xl space-y-6">
  <section class="theme-section rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
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

  <section class="theme-section rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
    <header class="theme-divider border-b px-6 py-4">
      <div class="flex items-center gap-2">
        <Shield size={16} class="text-indigo-600" />
        <h2 class="theme-heading text-[15px] font-semibold">Security</h2>
      </div>
      <p class="theme-text mt-1 text-[13px]">Manage your password and account security settings.</p>
    </header>

    <div class="space-y-4 px-6 py-5">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="theme-text mb-1.5 block text-[13px]">Current Password</span>
          <span class="relative block">
            <input
              type={showCurrentPassword ? 'text' : 'password'}
              placeholder="********"
              class="theme-input w-full rounded-xl border px-3 py-2.5 pr-10 text-[14px] outline-none transition-colors focus:border-indigo-400"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
              on:click={() => (showCurrentPassword = !showCurrentPassword)}
              aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
            >
              {#if showCurrentPassword}
                <EyeOff size={14} />
              {:else}
                <Eye size={14} />
              {/if}
            </button>
          </span>
        </label>

        <label class="block">
          <span class="theme-text mb-1.5 block text-[13px]">New Password</span>
          <span class="relative block">
            <input
              type={showNewPassword ? 'text' : 'password'}
              placeholder="********"
              class="theme-input w-full rounded-xl border px-3 py-2.5 pr-10 text-[14px] outline-none transition-colors focus:border-indigo-400"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
              on:click={() => (showNewPassword = !showNewPassword)}
              aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
            >
              {#if showNewPassword}
                <EyeOff size={14} />
              {:else}
                <Eye size={14} />
              {/if}
            </button>
          </span>
        </label>
      </div>

      <div class="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p class="text-[13px] text-amber-700">
          Password must be at least 8 characters and include uppercase, lowercase, number, and special character.
        </p>
      </div>
    </div>
  </section>

  <section class="theme-section rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
    <header class="theme-divider border-b px-6 py-4">
      <div class="flex items-center gap-2">
        {#if $theme === 'dark'}
          <Moon size={16} class="text-indigo-600" />
        {:else}
          <Sun size={16} class="text-indigo-600" />
        {/if}
        <h2 class="theme-heading text-[15px] font-semibold">Appearance</h2>
      </div>
      <p class="theme-text mt-1 text-[13px]">Customize how the application looks on your device.</p>
    </header>

    <div class="px-6">
      <div class="theme-divider flex items-center justify-between border-b py-4">
        <div class="mr-4">
          <p class="theme-heading text-[14px] font-medium">Dark Mode</p>
          <p class="theme-text mt-0.5 text-[13px]">Switch between light and dark interface theme.</p>
        </div>
        <div class="flex items-center gap-3">
          <Sun size={15} class="text-slate-400" />
          <button
            type="button"
            class="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200"
            style={`background-color: ${$theme === 'dark' ? '#4F46E5' : '#E5E7EB'};`}
            on:click={toggleTheme}
            aria-label="Toggle dark mode"
          >
            <span class={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${$theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}`}></span>
          </button>
          <Moon size={15} class="text-slate-400" />
        </div>
      </div>

      <div class="py-4">
        <p class="theme-text mb-3 text-[13px]">Theme preview</p>
        <div class="grid grid-cols-2 gap-3">
          <button
            type="button"
            on:click={() => setTheme('light')}
            class={`relative rounded-xl border-2 p-3 text-left transition-all ${$theme === 'light' ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'theme-border'}`}
          >
            {#if $theme === 'light'}
              <span class="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-indigo-500"></span>
            {/if}
            <div class="mb-2 flex h-12 w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2">
              <div class="h-6 w-1.5 rounded bg-slate-200"></div>
              <div class="flex-1 space-y-1">
                <div class="h-1.5 w-3/4 rounded bg-slate-200"></div>
                <div class="h-1.5 w-1/2 rounded bg-slate-100"></div>
              </div>
            </div>
            <p class="theme-text text-[12px] font-medium">Light Mode</p>
          </button>

          <button
            type="button"
            on:click={() => setTheme('dark')}
            class={`relative rounded-xl border-2 p-3 text-left transition-all ${$theme === 'dark' ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'theme-border'}`}
          >
            {#if $theme === 'dark'}
              <span class="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-indigo-500"></span>
            {/if}
            <div class="mb-2 flex h-12 w-full items-center gap-1.5 rounded-lg bg-[#1F2937] px-2">
              <div class="h-6 w-1.5 rounded bg-slate-700"></div>
              <div class="flex-1 space-y-1">
                <div class="h-1.5 w-3/4 rounded bg-slate-600"></div>
                <div class="h-1.5 w-1/2 rounded bg-slate-700"></div>
              </div>
            </div>
            <p class="theme-text text-[12px] font-medium">Dark Mode</p>
          </button>
        </div>
      </div>
    </div>
  </section>

  <section class="theme-section rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
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

  <section class="theme-section rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
    <header class="theme-divider border-b px-6 py-4">
      <div class="flex items-center gap-2">
        <Shield size={16} class="text-indigo-600" />
        <h2 class="theme-heading text-[15px] font-semibold">Privacy & Security</h2>
      </div>
    </header>

    <div class="px-6">
      {#each privacyRows as row, i}
        <div class={`flex items-center justify-between py-4 ${i < privacyRows.length - 1 ? 'theme-divider border-b' : ''}`}>
          <div class="mr-4 flex-1">
            <p class="theme-heading text-[14px] font-medium">{row.label}</p>
            <p class="theme-text mt-0.5 text-[13px]">{row.desc}</p>
          </div>
          <button
            type="button"
            class="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200"
            style={`background-color: ${privacy[row.key] ? '#4F46E5' : '#E5E7EB'};`}
            on:click={() => updatePrivacy(row.key, !privacy[row.key])}
            aria-label={`Toggle ${row.label}`}
          >
            <span class={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${privacy[row.key] ? 'translate-x-5' : 'translate-x-0'}`}></span>
          </button>
        </div>
      {/each}
    </div>
  </section>

  <div class="flex items-center justify-end gap-3">
    <button
      type="button"
      on:click={handleCancel}
      class="rounded-xl px-5 py-2.5 text-[14px] font-medium transition-colors"
      style={`border: 1px solid ${$theme === 'dark' ? '#334155' : '#CBD5E1'}; background-color: ${$theme === 'dark' ? '#1E293B' : '#FFFFFF'}; color: ${$theme === 'dark' ? '#E2E8F0' : '#475569'};`}
      disabled={isSavingProfile}
    >
      Cancel
    </button>
    <button
      type="button"
      on:click={handleSave}
      class="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-medium text-white transition-all duration-200"
      style={`background-color: ${saved ? '#059669' : '#4F46E5'};`}
      disabled={isSavingProfile}
    >
      <Save size={14} />
      {isSavingProfile ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
    </button>
  </div>

  {#if saveError}
    <p class="text-right text-[12px] text-rose-600">{saveError}</p>
  {/if}
</section>

<style>
  .theme-section {
    background: var(--color-surface);
    border-color: var(--color-border);
  }

  .theme-divider,
  .theme-border {
    border-color: var(--color-border);
  }

  .theme-input {
    background: var(--color-soft);
    border-color: var(--color-border);
    color: var(--color-heading);
  }

  .theme-heading {
    color: var(--color-heading);
  }

  .theme-text {
    color: var(--color-text);
  }
</style>
