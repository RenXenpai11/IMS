<script>
  import { onDestroy, onMount } from 'svelte';
  import {
    Bell,
    Building,
    Camera,
    Mail,
    Phone,
    Save,
    User,
    Shield,
    BellRing,
    Settings,
    Lock,
    Loader2
  } from 'lucide-svelte';
  import {
    subscribeToCurrentUser,
    updateProfilePhoto,
    updateUserProfile,
    getStudentSupervisors,
    getNotificationPreferences,
    updateNotificationPreferences,
    changePassword
  } from '../lib/auth.js';

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
    fullName: '',
    email: '',
    phone: '',
    department: '',
  };

  let notifsLoading = false;
  let notifStatusUpdates = false;
  let notifDocUploads = false;
  let notifTimeLog = false;
  let notifInactiveStudent = false;

  let supervisorLoading = false;
  let mySupervisors = [];

  let isChangingPassword = false;
  let currentPassword = '';
  let newPassword = '';
  let confirmNewPassword = '';
  let passwordMessage = '';
  let passwordError = '';

  function toTitleCase(value) {
    const text = String(value || '').trim();
    if (!text) {
      return '';
    }

    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  function normalizeDepartment(dept) {
    const d = String(dept || '').trim();
    if (d.toUpperCase() === 'INTERNATIONAL NOC') return 'ISOC';
    return d;
  }

  function normalizeRole(role) {
    const r = String(role || '').trim().toLowerCase();
    if (r === 'student') return 'Intern';
    return toTitleCase(r);
  }

  function applyCurrentUserProfile(user) {
    if (!user) {
      return;
    }

    currentUser = user;

    profile = {
      ...profile,
      fullName: String(user.full_name || ''),
      email: String(user.email || ''),
      phone: String(user.phone || ''),
      department: String(user.department || ''),
    };

    if (String(user.role || '').toLowerCase() !== 'supervisor') {
      loadSupervisorData(user.user_id);
    } else {
      mySupervisors = [];
    }
    loadNotificationPreferences(user.user_id);
  }

  async function loadSupervisorData(uid) {
    if (supervisorLoading) return;
    try {
      supervisorLoading = true;
      mySupervisors = await getStudentSupervisors(uid);
    } catch(e) {
      console.error(e);
      mySupervisors = [];
    } finally {
      supervisorLoading = false;
    }
  }

  async function loadNotificationPreferences(uid) {
    try {
      notifsLoading = true;
      const prefs = await getNotificationPreferences(uid);
      notifStatusUpdates = Boolean(prefs.request_status_updates);
      notifDocUploads = Boolean(prefs.document_uploads);
      notifTimeLog = Boolean(prefs.time_log_reminder);
      notifInactiveStudent = Boolean(prefs.inactive_student_alert);
    } catch(e) {
      console.error(e);
    } finally {
      notifsLoading = false;
    }
  }

  async function saveNotificationPreferences() {
    if (!currentUser?.user_id) return;
    try {
      notifsLoading = true;
      await updateNotificationPreferences(currentUser.user_id, {
        request_status_updates: notifStatusUpdates,
        document_uploads: notifDocUploads,
        time_log_reminder: notifTimeLog,
        inactive_student_alert: notifInactiveStudent
      });
    } catch(e) {
      console.error(e);
    } finally {
      notifsLoading = false;
    }
  }

  async function handlePasswordSave() {
    passwordError = '';
    passwordMessage = '';
    
    if (!currentPassword) {
      passwordError = 'Please enter your current password.';
      return;
    }
    if (newPassword.length < 8) {
      passwordError = 'New password must be at least 8 characters.';
      return;
    }
    if (newPassword !== confirmNewPassword) {
      passwordError = 'Passwords do not match.';
      return;
    }

    try {
      isChangingPassword = true;
      const res = await changePassword(currentUser.user_id, currentPassword, newPassword);
      if (res.ok) {
        passwordMessage = 'Password updated successfully.';
        currentPassword = '';
        newPassword = '';
        confirmNewPassword = '';
      } else {
        passwordError = res.error || 'Failed to update password.';
      }
    } catch (e) {
      passwordError = e.message || 'Error updating password';
    } finally {
      isChangingPassword = false;
    }
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


  const MAIN_DB_URL = 'https://docs.google.com/spreadsheets/d/1cHfXzp8gRD-x8sVf_j_WtNf-1h_JUqt_O_MOEfBlNVk/edit?pli=1&gid=0#gid=0';
  const IMS_GAS_URL = 'https://script.google.com/home/projects/1DJSac0BqK0YznmpdqlbzhWvcHXDBeMbnQyyDu42sqQTIwS9YFOPTmNSr/edit';
  let copyMessage = '';
  let copyTimer;

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    copyMessage = 'Copied!';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyMessage = '';
    }, 2000);
  }


  const profileFields = [
    { key: 'fullName', label: 'Full Name', icon: User, type: 'text' },
    { key: 'email', label: 'Email Address', icon: Mail, type: 'email', readOnly: true },
    { key: 'phone', label: 'Phone Number', icon: Phone, type: 'text' },
    { key: 'department', label: 'Department', icon: Building, type: 'text' },
  ];



  function updateProfileField(key, value) {
    profile = { ...profile, [key]: value };
    saved = false;
    saveError = '';
  }



  async function handleSave() {
    saveError = '';

    if (!currentUser?.user_id) {
      saveError = 'No logged-in user found. Please log in again.';
      return;
    }

    const fullName = String(profile.fullName || '').trim();

    if (!fullName) {
      saveError = 'Please provide your full name.';
      return;
    }

    try {
      isSavingProfile = true;
      await updateUserProfile({
        user_id: currentUser.user_id,
        full_name: fullName,
        phone: profile.phone,
        department: profile.department,
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

  $: displayName = String(profile.fullName || '').trim() || 'User';
  $: currentUserRole = String(currentUser?.role || '').trim().toLowerCase();
  $: canViewMainDb = currentUserRole === 'admin' || currentUserRole === 'supervisor';
  $: roleLabel = normalizeRole(currentUser?.role) || 'Intern';
  $: displayDepartment = normalizeDepartment(profile.department);
  $: profileSubtitle = [displayDepartment, roleLabel].filter(Boolean).join(' ');
  $: profilePhotoUrl = String(currentUser?.profile_photo_url || '').trim();
  $: profileInitials = (displayName || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U';
</script>

<section class="settings-shell space-y-6">
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
      </div>
    </div>
  </section>

  {#if currentUserRole !== 'supervisor'}
    <section class="theme-section settings-panel rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <header class="theme-divider border-b px-6 py-4">
        <div class="flex items-center gap-2">
          <Shield size={16} class="text-indigo-600" />
          <h2 class="theme-heading text-[15px] font-semibold">My Supervisors</h2>
        </div>
        <p class="theme-text mt-1 text-[13px]">Your assigned internship supervisors.</p>
      </header>

      <div class="px-6 py-5">
        {#if supervisorLoading}
           <p class="theme-text text-[13px]">Loading supervisor details...</p>
        {:else if mySupervisors.length === 0}
           <p class="theme-text text-[13px]">No supervisors assigned yet.</p>
        {:else}
           <div class="space-y-4">
             {#each mySupervisors as supervisor (supervisor.user_id)}
               <div class="flex items-center gap-4">
                 <div class="flex h-12 w-12 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-violet-600">
                   {#if supervisor.profile_photo_url}
                      <img src={supervisor.profile_photo_url} alt="Supervisor" class="h-12 w-12 rounded-full object-cover">
                   {:else}
                      <span class="text-lg font-bold text-white font-medium">{String(supervisor.full_name || '').charAt(0).toUpperCase()}</span>
                   {/if}
                 </div>
                 <div>
                   <p class="theme-heading text-[15px] font-semibold">{supervisor.full_name}</p>
                   <p class="theme-text text-[13px]">{normalizeDepartment(supervisor.department)} Supervisor</p>
                   <p class="theme-text text-[13px] opacity-75">{supervisor.email}</p>
                 </div>
               </div>
             {/each}
           </div>
        {/if}
      </div>
    </section>
  {/if}

  <section class="theme-section settings-panel rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
    <header class="theme-divider border-b px-6 py-4">
      <div class="flex items-center gap-2">
        <BellRing size={16} class="text-indigo-600" />
        <h2 class="theme-heading text-[15px] font-semibold">Notification Preferences</h2>
      </div>
      <p class="theme-text mt-1 text-[13px]">Manage your email and system notifications.</p>
    </header>

    <div class="px-6 py-5 space-y-4">
      <label class="flex items-center justify-between cursor-pointer">
        <div>
          <p class="theme-heading text-[14px] font-medium">Request status updates</p>
          <p class="theme-text text-[12px]">
            {#if currentUserRole === 'supervisor'}
              Notify me when a student submits or updates a request.
            {:else}
              Notify me when my request is approved or not approved.
            {/if}
          </p>
        </div>
        <div class="relative">
          <input type="checkbox" class="sr-only peer" bind:checked={notifStatusUpdates} on:change={saveNotificationPreferences} disabled={notifsLoading}>
          <div class="h-6 w-11 rounded-full bg-slate-200 peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
        </div>
      </label>

      <label class="flex items-center justify-between cursor-pointer">
        <div>
          <p class="theme-heading text-[14px] font-medium">Document uploads</p>
          <p class="theme-text text-[12px]">
            {#if currentUserRole === 'supervisor'}
              Notify me when any of my assigned students uploads a document.
            {:else}
              Notify me when a document is uploaded in the Documents tab.
            {/if}
          </p>
        </div>
        <div class="relative">
          <input type="checkbox" class="sr-only peer" bind:checked={notifDocUploads} on:change={saveNotificationPreferences} disabled={notifsLoading}>
          <div class="h-6 w-11 rounded-full bg-slate-200 peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
        </div>
      </label>

      {#if currentUserRole === 'supervisor'}
        <label class="flex items-center justify-between cursor-pointer">
          <div>
            <p class="theme-heading text-[14px] font-medium">Inactive student alert</p>
            <p class="theme-text text-[12px]">Notify me if any of my assigned students has not logged out by 5:00 PM.</p>
          </div>
          <div class="relative">
            <input type="checkbox" class="sr-only peer" bind:checked={notifInactiveStudent} on:change={saveNotificationPreferences} disabled={notifsLoading}>
            <div class="h-6 w-11 rounded-full bg-slate-200 peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </div>
        </label>
      {:else}
        <label class="flex items-center justify-between cursor-pointer">
          <div>
            <p class="theme-heading text-[14px] font-medium">Time log reminder</p>
            <p class="theme-text text-[12px]">Send me an email reminder if I have not logged out by 5:00 PM.</p>
          </div>
          <div class="relative">
            <input type="checkbox" class="sr-only peer" bind:checked={notifTimeLog} on:change={saveNotificationPreferences} disabled={notifsLoading}>
            <div class="h-6 w-11 rounded-full bg-slate-200 peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </div>
        </label>
      {/if}
    </div>
  </section>

  <section class="theme-section settings-panel rounded-2xl border shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
    <header class="theme-divider border-b px-6 py-4">
      <div class="flex items-center gap-2">
        <Lock size={16} class="text-indigo-600" />
        <h2 class="theme-heading text-[15px] font-semibold">Password & Security</h2>
      </div>
      <p class="theme-text mt-1 text-[13px]">Update your password to keep your account secure.</p>
    </header>

    <div class="px-6 py-5">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label class="block sm:col-span-2">
          <span class="theme-text mb-1.5 block text-[13px]">Current Password</span>
          <input type="password" bind:value={currentPassword} class="theme-input w-full rounded-xl border py-2.5 px-3 text-[14px] outline-none transition-colors focus:border-indigo-400" />
        </label>
        <label class="block">
          <span class="theme-text mb-1.5 block text-[13px]">New Password</span>
          <input type="password" bind:value={newPassword} class="theme-input w-full rounded-xl border py-2.5 px-3 text-[14px] outline-none transition-colors focus:border-indigo-400" />
        </label>
        <label class="block">
          <span class="theme-text mb-1.5 block text-[13px]">Confirm New Password</span>
          <input type="password" bind:value={confirmNewPassword} class="theme-input w-full rounded-xl border py-2.5 px-3 text-[14px] outline-none transition-colors focus:border-indigo-400" />
        </label>
      </div>
      
      {#if passwordError}
        <p class="mt-4 text-[13px] text-rose-600">{passwordError}</p>
      {/if}
      {#if passwordMessage}
        <p class="mt-4 text-[13px] text-emerald-600">{passwordMessage}</p>
      {/if}
      
      <div class="mt-4 flex justify-end">
        <button type="button" on:click={handlePasswordSave} disabled={isChangingPassword} class="settings-btn settings-btn-primary flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-medium text-white">
          {#if isChangingPassword}
            <span class="spinning-icon"><Loader2 size={16} /></span>
          {/if}
          <span>{isChangingPassword ? 'Updating...' : 'Change Password'}</span>
        </button>
      </div>
    </div>
  </section>

  {#if canViewMainDb}
    <!-- MAIN_DB Section Section -->
    <section class="theme-section settings-panel settings-panel-database rounded-2xl border">
      <header class="theme-divider border-b px-6 py-4">
        <div class="flex items-center gap-2">
          <Building size={16} class="text-indigo-500" />
          <h2 class="theme-heading text-[15px] font-semibold">MAIN_DB</h2>
        </div>
        <p class="theme-text mt-1 text-[13px]">Access the main database spreadsheet for this project.</p>
      </header>

      <div class="px-6 py-5">
        <div class="mb-4 p-4 rounded-lg settings-link-box border">
          <a
            href={MAIN_DB_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="settings-link text-[13px] font-medium break-all line-clamp-2 hover:underline"
          >
            {MAIN_DB_URL}
          </a>
        </div>

        <button
          type="button"
          on:click={() => copyToClipboard(MAIN_DB_URL)}
          class="settings-btn settings-copy-button rounded-lg px-6 py-2.5 text-[14px] font-medium text-white"
        >
          {copyMessage || 'Copy Link'}
        </button>
      </div>
    </section>

    <!-- NEW: IMS GAS Section -->
    <section class="theme-section settings-panel rounded-2xl border">
      <header class="theme-divider border-b px-6 py-4">
        <div class="flex items-center gap-2">
          <Building size={16} class="text-indigo-500" />
          <h2 class="theme-heading text-[15px] font-semibold">IMS GAS</h2>
        </div>
        <p class="theme-text mt-1 text-[13px]">Access the Google Apps Script project editor.</p>
      </header>

      <div class="px-6 py-5">
        <div class="mb-4 p-4 rounded-lg settings-link-box border">
          <a
            href={IMS_GAS_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="settings-link text-[13px] font-medium break-all line-clamp-2 hover:underline"
          >
            {IMS_GAS_URL}
          </a>
        </div>

        <button
          type="button"
          on:click={() => copyToClipboard(IMS_GAS_URL)}
          class="settings-btn settings-copy-button rounded-lg px-6 py-2.5 text-[14px] font-medium text-white"
        >
          {copyMessage || 'Copy Link'}
        </button>
      </div>
    </section>
  {/if}



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
      {#if isSavingProfile}
        <span class="spinning-icon"><Loader2 size={14} /></span>
      {:else}
        <Save size={14} />
      {/if}
      <span>{isSavingProfile ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}</span>
    </button>
  </div>

  {#if saveError}
    <p class="text-right text-[12px] text-rose-600">{saveError}</p>
  {/if}
</section>

<style>
  .settings-shell {
    --st-surface: #ffffff;
    --st-surface-soft: #f3f8ff;
    --st-border: #d8e2ef;
    --st-heading: #0f172a;
    --st-text: #5f7188;
    --st-muted: #64748b;
    position: relative;
    border-radius: 0;
    padding: 0;
    isolation: isolate;
  }

  .settings-shell::before {
    display: none;
  }

  .settings-shell::after {
    display: none;
  }

  .theme-section {
    background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  }

  .settings-panel {
    position: relative;
    overflow: hidden;
  }

  .settings-panel::before {
    display: none;
  }

  .theme-divider {
    border-color: rgba(255,255,255,0.04);
    border-bottom-width: 1px;
  }

  .settings-panel > .theme-divider {
    padding: 20px 22px;
  }

  .settings-panel > :not(.theme-divider) {
    padding: 20px 22px;
  }

  .theme-input {
    background: #eef5fc;
    border-color: #d8e2ef;
    color: var(--st-heading);
  }

  .theme-input:focus {
    border-color: #3b82f6;
    background: #ffffff;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
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
    background: #2563eb;
    border: 1px solid #1d4ed8;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .settings-btn-primary:hover:not(:disabled),
  .settings-copy-button:hover:not(:disabled) {
    background: #1d4ed8;
    transform: translateY(-1px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }

  .settings-btn-success {
    background: #10b981;
    border-color: #059669;
  }

  .settings-link-box {
    background: #eef5fc;
    border-color: #d8e2ef;
  }

  .settings-link:hover {
    color: #0a4f8d;
  }

  :global(.dark) .settings-shell {
    --st-surface: #0f1c2f;
    --st-surface-soft: #1e293b;
    --st-border: rgba(255, 255, 255, 0.1);
    --st-heading: #e2e8f0;
    --st-text: #cbd5e1;
    --st-muted: #94a3b8;
  }

  :global(.dark) .settings-shell::before {
    background: var(--color-app-bg);
  }

  :global(.dark) .settings-shell::after {
    display: none;
  }

  :global(.dark) .theme-section {
    background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  }

  :global(.dark) .theme-input {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.1);
    color: #cbd5e1;
  }

  :global(.dark) .theme-input:focus {
    border-color: #3b82f6;
    background: rgba(255, 255, 255, 0.08);
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
  }

  :global(.dark) .settings-btn-ghost {
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    color: #cbd5e1;
  }

  :global(.dark) .settings-btn-ghost:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
  }

  :global(.dark) .settings-link-box {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.1);
  }

  :global(.dark) .settings-link:hover {
    color: #a5d8ff;
  }

  @media (max-width: 768px) {
    .settings-shell {
      border-radius: 1rem;
      padding: 0;
    }
  }

  .spinning-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
