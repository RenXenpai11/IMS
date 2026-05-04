<script>
// @ts-nocheck
  import { onMount, onDestroy } from 'svelte';
  import { callApiAction, getCurrentUser, subscribeToCurrentUser } from '../lib/auth.js';
  import {
    FolderOpen, Plus, Pencil, Trash2, ExternalLink, Loader2, Eye,
    CalendarDays, Tag, CheckCircle2, Clock3, AlertCircle, Link2,
    MessageSquare, Flag,
    Grid, List, Archive, Download, RotateCcw
  } from 'lucide-svelte';

  export let currentUser = null;

  // ── State ─────────────────────────────────────────────────────────────────
  let activeTab    = 'my-projects';
  let activeSubTab = 'Submissions';
  let projects     = [];
  let isLoading    = false;
  let formError    = '';
  let formSuccess  = '';
  let isSubmitting = false;
  let editingId    = null;
  let unsubscribeAuth;

  // Filter
  let filterPriority = 'all';
  let filterStatus   = 'all';
  let searchQuery    = '';
  let activeView     = 'Overview';
  let searchTerm     = '';
  let selectedStatus = 'all';
  let showAddProjectModal = false;

  // Inline project detail panel
  let viewingProjectId  = null;
  let viewingProjectTab = 'Submissions';
  let expandedDescriptionId = null;

  // Inline edit (Details tab — no modal)
  let inlineEditId = null;
  let inlineForm = {};
  let showInlineMembersPanel = false;
  let showInlineSupervisorPanel = false;

  // Delete modal
  let showDeleteModal   = false;
  let projectToDelete   = null;
  let isDeleting        = false;

  const PRIORITY_OPTIONS  = ['Low', 'Medium', 'High'];
  const STATUS_OPTIONS    = ['Not Started', 'In Progress', 'Submitted', 'Needs Revision', 'Approved'];

  // Populated from backend on mount, then filtered locally for assignment.
  let users = [];
  let usersLoading = false;
  let bootstrapDepartment = '';
  let departmentContext = '';
  let allInterns = [];
  let allSupervisors = [];
  let availableInterns = [];
  let availableSupervisors = [];
  let SUPERVISOR_OPTIONS = [];
  let MEMBER_OPTIONS     = [];
  let showSupervisorsPanel = false;

  const PRIORITY_COLORS = {
    'Low': { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' },
    'Medium': { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
    'High': { bg: '#fff1f2', text: '#b91c1c', border: '#fecaca' },
  };

  function getPriorityLabel(val) {
    if (!val) return '';
    const v = String(val).trim().toLowerCase();
    if (v === 'low') return 'Low';
    if (v === 'medium') return 'Medium';
    if (v === 'high') return 'High';
    return String(val).trim();
  }

  const STATUS_META = {
    'Not Started':  { cls: 'status-not-started',   label: 'Not Started'  },
    'In Progress':  { cls: 'status-in-progress',   label: 'In Progress'  },
    'Submitted':    { cls: 'status-submitted',     label: 'Submitted'    },
    'Needs Revision': { cls: 'status-needs-revision', label: 'Needs Revision' },
    'Approved':     { cls: 'status-approved',      label: 'Approved'     },
    // legacy aliases
    'For Review':   { cls: 'status-submitted',     label: 'Submitted'    },
    'Pending':      { cls: 'status-pending',        label: 'Pending'      },
    'Completed':    { cls: 'status-approved',      label: 'Completed'    }
  };

  // Form
  let form = {
    priority_level: 'Low',
    title: '',
    description: '',
    members: [],
    supervisor: [],
    timeline_start: '',
    timeline_end: '',
    status: 'Not Started',
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  function resetForm() {
    form = { priority_level: 'Low', title: '', description: '', members: [], supervisor: [], timeline_start: '', timeline_end: '', status: 'Not Started' };
    editingId = null;
    formError = '';
    formSuccess = '';
  }

  function setTab(tab) {
    activeTab = tab;
    if (tab !== 'add-project') { resetForm(); }
    formError = '';
    formSuccess = '';
  }

  function formatDate(val) {
    const s = String(val || '').trim();
    if (!s) return '';
    let d;
    // If format is YYYY-MM-DD (date-only), append time to avoid timezone shifts
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) d = new Date(s + 'T00:00:00');
    else d = new Date(s);
    if (isNaN(d)) return s;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  function humanizeTime(val) {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d)) return String(val);
    const diff = Date.now() - d.getTime();
    const sec = Math.floor(Math.abs(diff) / 1000);
    if (sec < 5) return 'updated just now';
    if (sec < 60) return `updated ${sec} second${sec === 1 ? '' : 's'} ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `updated ${min} minute${min === 1 ? '' : 's'} ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `updated ${hr} hour${hr === 1 ? '' : 's'} ago`;
    const days = Math.floor(hr / 24);
    if (days < 7) return `updated ${days} day${days === 1 ? '' : 's'} ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `updated ${weeks} week${weeks === 1 ? '' : 's'} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `updated ${months} month${months === 1 ? '' : 's'} ago`;
    const years = Math.floor(days / 365);
    return `updated ${years} year${years === 1 ? '' : 's'} ago`;
  }

  function isDeadlineNear(val) {
    const s = String(val || '').trim();
    if (!s) return false;
    const d   = new Date(s + 'T00:00:00');
    const now = new Date();
    now.setHours(0,0,0,0);
    const diffDays = (d - now) / 86400000;
    return diffDays >= 0 && diffDays <= 7;
  }

  function isDeadlinePast(val) {
    const s = String(val || '').trim();
    if (!s) return false;
    const d   = new Date(s + 'T00:00:00');
    const now = new Date();
    now.setHours(0,0,0,0);
    return d < now;
  }

  function validateForm() {
    if (!String(form.title || '').trim())         return 'Project title is required.';
    if (!String(form.timeline_start || '').trim() || !String(form.timeline_end || '').trim()) return 'Timeline start and end are required.';
    return '';
  }

  function statusToProgress(s) {
    const v = String(s || '').trim().toLowerCase();
    if (!v || v === 'not started' || v === 'pending') return 0;
    if (v === 'in progress') return 50;
    if (v === 'for review') return 90;
    if (v === 'completed') return 100;
    const n = parseInt(s, 10);
    return isNaN(n) ? 0 : Math.max(0, Math.min(100, n));
  }

  // ── API helpers ──────────────────────────────────────────────────────────
  function normalizeText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function getDepartmentValue(user) {
    if (!user || typeof user !== 'object') return '';
    return user.department ?? user.Department ?? user.dept ?? user.Dept ?? user.departmentName ?? user.DepartmentName ?? '';
  }

  function sameDepartment(userDepartment, targetDepartment) {
    const userDept = normalizeText(userDepartment);
    const targetDept = normalizeText(targetDepartment);
    return Boolean(userDept && targetDept && userDept === targetDept);
  }

  function isInternUser(user) {
    const role = normalizeText(user?.role || user?.Role || user?.user_role || user?.userRole || '');
    return role.includes('intern') || role.includes('student') || role === 'ojt';
  }

  function isSupervisorUser(user) {
    const role = normalizeText(user?.role || user?.Role || user?.user_role || user?.userRole || '');
    return role.includes('supervisor') || role.includes('mentor');
  }

  function getDisplayName(user) {
    return user?.name || user?.full_name || user?.fullName || user?.email || user?.user_id || user?.id || '';
  }

  function getProfilePhotoUrl(user) {
    return String(user?.profile_photo_url || user?.profilePhotoUrl || user?.photo_url || user?.avatar_url || '').trim();
  }

  function getInitials(nameValue) {
    const parts = String(nameValue || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    return (parts.map((part) => part.charAt(0)).join('') || '?').toUpperCase();
  }

  function getUserId(user) {
    return String(user?.user_id || user?.id || '').trim();
  }

  function getCurrentUserId() {
    const activeUser = currentUser || getCurrentUser() || {};
    return String(activeUser.user_id || activeUser.id || activeUser.UserId || activeUser.userId || '').trim();
  }

  function inferSingleDepartmentFromUsers(list) {
    const departments = new Set(
      (Array.isArray(list) ? list : [])
        .map((user) => normalizeText(getDepartmentValue(user)))
        .filter(Boolean)
    );
    return departments.size === 1 ? [...departments][0] : '';
  }

  function getProjectDepartmentContext() {
    return form.department ?? form.Department ?? form.dept ?? form.Dept ?? form.departmentName ?? form.DepartmentName
      ?? currentUser?.department ?? currentUser?.Department ?? currentUser?.dept ?? currentUser?.Dept
      ?? currentUser?.departmentName ?? currentUser?.DepartmentName
      ?? bootstrapDepartment
      ?? inferSingleDepartmentFromUsers(users)
      ?? '';
  }

  function assignmentEmptyMessage(type) {
    const isSupervisor = type === 'supervisor';
    if (usersLoading) return isSupervisor ? 'Loading supervisors...' : 'Loading interns...';
    if (!departmentContext && !allInterns.length && !allSupervisors.length) {
      return `Your department is missing. Update your profile department to select ${isSupervisor ? 'supervisors' : 'interns'}.`;
    }
    if (isSupervisor) return allSupervisors.length ? 'No supervisors found in your department' : 'No supervisors found';
    return allInterns.length ? 'No interns found in your department' : 'No interns found';
  }

  function normalizeBootstrapUsers(list) {
    const seen = new Set();
    const normalized = [];
    (Array.isArray(list) ? list : []).forEach((user) => {
      const id = getUserId(user);
      if (!id || seen.has(id)) return;
      seen.add(id);
      normalized.push({
        ...user,
        id,
        user_id: id,
        name: getDisplayName(user),
        full_name: user?.full_name || user?.name || user?.fullName || '',
        email: user?.email || '',
        role: user?.role || user?.Role || '',
        department: getDepartmentValue(user),
        profile_photo_url: getProfilePhotoUrl(user)
      });
    });
    return normalized;
  }

  // GAS functions ending in _ are private and cannot be called from the client.
  // Use the public `apiAction(action, payload)` wrapper instead.
  function dispatchAction(action, payload = {}) {
    const run = globalThis?.google?.script?.run;
    if (!run) {
      return callApiAction(action, payload);
    }

    return new Promise((resolve, reject) => {
      run
        .withSuccessHandler(resolve)
        .withFailureHandler(e => reject(new Error(e?.message || String(e))))
        .apiAction(action, payload);
    });
  }

  // ── Load projects + user bootstrap from backend ────────────────────────
  async function loadBootstrap() {
    isLoading = true;
    usersLoading = true;
    try {
      const uid = getCurrentUserId();
      if (!uid) {
        try { console.warn('loadBootstrap: no user_id - currentUser:', currentUser); } catch(e) {}
        users = [];
        bootstrapDepartment = '';
        return;
      }

      // Fetch user lists and projects in parallel
      const [bootstrapRes, projectsRes] = await Promise.all([
        dispatchAction('get_proj_users_bootstrap', { user_id: uid }),
        dispatchAction('list_proj_intern', { user_id: uid })
      ]);

      try { console.log('loadBootstrap -> uid=', uid, 'bootstrapRes=', bootstrapRes, 'projectsRes=', projectsRes); } catch(e) {}

      if (bootstrapRes?.ok) {
        bootstrapDepartment = String(bootstrapRes.department || bootstrapRes.Department || bootstrapRes.dept || '').trim();
        const bootstrapUsers = Array.isArray(bootstrapRes.users)
          ? bootstrapRes.users
          : [...(bootstrapRes.interns || []), ...(bootstrapRes.supervisors || [])];
        users = normalizeBootstrapUsers(bootstrapUsers);
      } else if (bootstrapRes && !bootstrapRes.ok) {
        console.warn('Bootstrap error:', bootstrapRes.error);
        users = [];
        bootstrapDepartment = '';
      }

      if (projectsRes?.ok) {
        projects = (projectsRes.projects || []).map(normalizeProject);
      }

      // Folders and milestones are loaded lazily when a project is opened — ensure properties exist
      projects = projects.map(p => {
        // try to restore cached milestones from localStorage as a fallback
        let cached = null;
        try { cached = localStorage.getItem('projects.milestones.' + String(p.id)); } catch (e) { cached = null; }
        let milestones = p.milestones;
        if ((!Array.isArray(milestones) || milestones.length === 0) && cached) {
          try { const parsed = JSON.parse(cached); if (Array.isArray(parsed)) milestones = parsed; } catch (e) { /* ignore */ }
        }
        return { ...p, folders: p.folders || null, milestones };
      });

      // Restore last-viewed project (so Details stay visible after a page refresh)
      try {
        const saved = localStorage.getItem('projects.viewingProjectId');
        if (saved) {
          const found = projects.find(x => x.id === saved);
          if (found) {
            viewingProjectId = saved;
            viewingProjectTab = 'Details';
            if (!found.folders || found.folders === null) loadProjectFolders(saved);
            if (!found.milestones || found.milestones === null || (Array.isArray(found.milestones) && found.milestones.length === 0)) loadProjectMilestones(saved);
          }
        }
      } catch (e) {
        // ignore storage errors
      }
    } catch (e) {
      console.error('loadBootstrap error', e);
      users = [];
      bootstrapDepartment = '';
    } finally {
      isLoading = false;
      usersLoading = false;
    }
  }

  function normalizeProject(p) {
    return {
      id:             p.proj_id      || '',
      proj_id:        p.proj_id      || '',
      title:          p.proj_name    || '',
      description:    p.description  || '',
      priority_level: p.priority     || 'Medium',
      status:         p.status       || 'Pending',
      members:        p.members      ? p.members.split(',').map(s => s.trim()).filter(Boolean) : [],
      supervisors:    p.supervisor   ? p.supervisor.split(',').map(s => s.trim()).filter(Boolean) : [],
      timeline_start: p.start_date   || '',
      timeline_end:   p.end_date     || '',
      deadline:       p.end_date     || '',
      created_at:     p.created_at   || '',
      created_by:     p.created_by   || '',
      archived:       p.status === 'Archived',
      folders:        null,           // null = not yet loaded; [] = loaded and empty
      progress_logs:  [],
      milestones:     null
    };
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  async function submitProject() {
    const err = validateForm();
    formError   = err;
    formSuccess  = '';
    if (err) return;
    isSubmitting = true;

    const uid = getCurrentUserId();
    try {
      if (editingId) {
        const res = await dispatchAction('update_proj_intern', {
          proj_id:     editingId,
          user_id:     uid,
          proj_name:   form.title,
          description: form.description,
          priority:    form.priority_level,
          status:      form.status,
          members:     form.members,
          supervisor:  form.supervisor,
          start_date:  form.timeline_start,
          end_date:    form.timeline_end
        });
        if (!res?.ok) { formError = res?.error || 'Update failed.'; return; }
        projects = projects.map(p =>
          p.id === editingId
            ? { ...p, title: form.title, description: form.description, priority_level: form.priority_level,
                status: form.status, members: [...(form.members || [])], supervisors: [...(form.supervisor || [])],
                timeline_start: form.timeline_start, timeline_end: form.timeline_end, deadline: form.timeline_end }
            : p
        );
        formSuccess = 'Project updated successfully!';
      } else {
        const res = await dispatchAction('create_proj_intern', {
          user_id:     uid,
          proj_name:   form.title,
          description: form.description,
          priority:    form.priority_level,
          status:      form.status,
          members:     form.members,
          supervisor:  form.supervisor,
          start_date:  form.timeline_start,
          end_date:    form.timeline_end
        });
        if (!res?.ok) { formError = res?.error || 'Create failed.'; return; }
        const newProject = normalizeProject({
          proj_id:     res.proj_id,
          proj_name:   form.title,
          description: form.description,
          priority:    form.priority_level,
          status:      form.status,
          members:     form.members.join(','),
          supervisor:  (Array.isArray(form.supervisor) ? form.supervisor.join(',') : String(form.supervisor || '')),
          start_date:  form.timeline_start,
          end_date:    form.timeline_end,
          created_by:  uid
        });
        projects = [newProject, ...projects];
        formSuccess = 'Project added successfully!';
      }
      setTimeout(() => { formSuccess = ''; }, 3000);
      resetForm();
      closeAddProjectModal();
    } catch (e) {
      formError = e?.message || 'An error occurred.';
    } finally {
      isSubmitting = false;
    }
  }

  function editProject(p) {
    startInlineEdit(p);
  }

  function startInlineEdit(p) {
    inlineForm = {
      priority_level: p.priority_level || 'Low',
      title:          p.title || '',
      description:    p.description || '',
      members:        Array.isArray(p.members) ? [...p.members] : [],
      supervisor:     Array.isArray(p.supervisors) ? [...p.supervisors] : [],
      timeline_start: p.timeline_start || '',
      timeline_end:   p.timeline_end || p.deadline || '',
      status:         p.status || 'Not Started',
    };
    inlineEditId = p.id;
    showInlineMembersPanel = false;
    showInlineSupervisorPanel = false;
  }

  function cancelInlineEdit() {
    inlineEditId = null;
    inlineForm = {};
    showInlineMembersPanel = false;
  }

  async function saveInlineEdit(p) {
    if (!String(inlineForm.title || '').trim()) { formError = 'Project title is required.'; return; }
    formError = '';
    isSubmitting = true;
    const uid = getCurrentUserId();
    try {
      const res = await dispatchAction('update_proj_intern', {
        proj_id:     p.id,
        user_id:     uid,
        proj_name:   inlineForm.title,
        description: inlineForm.description,
        priority:    inlineForm.priority_level,
        status:      inlineForm.status,
        members:     inlineForm.members,
        supervisor:  inlineForm.supervisor,
        start_date:  inlineForm.timeline_start,
        end_date:    inlineForm.timeline_end
      });
      if (!res?.ok) { formError = res?.error || 'Update failed.'; return; }
      projects = projects.map(proj => proj.id === p.id
        ? { ...proj, title: inlineForm.title, description: inlineForm.description, priority_level: inlineForm.priority_level,
            status: inlineForm.status, members: inlineForm.members, supervisors: inlineForm.supervisor,
            timeline_start: inlineForm.timeline_start, timeline_end: inlineForm.timeline_end, deadline: inlineForm.timeline_end }
        : proj);
      cancelInlineEdit();
    } catch(e) {
      formError = e?.message || 'Update failed.';
    } finally {
      isSubmitting = false;
    }
  }

  function toggleInlineMember(val) {
    const arr = inlineForm.members || [];
    inlineForm.members = arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
  }

  function toggleInlineSupervisor(val) {
    const arr = inlineForm.supervisor || [];
    inlineForm.supervisor = arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
  }

  function openDeleteModal(p)  { projectToDelete = p; showDeleteModal = true;  }
  function closeDeleteModal()  { projectToDelete = null; showDeleteModal = false; }

  function openAddProjectModal() {
    // If editingId is set we are opening modal to edit — keep form as-is.
    if (!editingId) resetForm();
    showAddProjectModal = true;
    if (!usersLoading && users.length === 0) {
      void loadBootstrap();
    }
  }

  function closeAddProjectModal() {
    showAddProjectModal = false;
    resetForm();
  }

  async function confirmDelete() {
    if (!projectToDelete) return;
    isDeleting = true;
    const uid = getCurrentUserId();
    try {
      const res = await dispatchAction('delete_proj_intern', {
        proj_id: projectToDelete.proj_id || projectToDelete.id,
        user_id: uid
      });
      if (!res?.ok) { formError = res?.error || 'Delete failed.'; closeDeleteModal(); return; }
      projects = projects.filter(p => p.id !== projectToDelete.id);
      formSuccess = 'Project deleted.';
      setTimeout(() => { formSuccess = ''; }, 2500);
      closeDeleteModal();
    } catch (e) {
      formError = e?.message || 'Delete failed.';
      closeDeleteModal();
    } finally { isDeleting = false; }
  }

  function viewProject(p) {
    if (viewingProjectId === p.id) {
      viewingProjectId = null; // toggle off
      try { localStorage.removeItem('projects.viewingProjectId'); } catch (e) {}
    } else {
      viewingProjectId  = p.id;
      viewingProjectTab = 'Details';
      try { localStorage.setItem('projects.viewingProjectId', String(p.id)); } catch (e) {}
      // Load folders if not yet fetched
      if (!p.folders || p.folders === null) {
        loadProjectFolders(p.id);
      }
      // Load milestones if not yet fetched
      if (!p.milestones || p.milestones === null) {
        loadProjectMilestones(p.id);
      }
    }
  }

  function toggleDescription(projectId) {
    expandedDescriptionId = expandedDescriptionId === projectId ? null : projectId;
  }

  function toggleMember(name) {
    const list = Array.isArray(form.members) ? [...form.members] : [];
    const idx = list.indexOf(name);
    if (idx === -1) list.push(name);
    else list.splice(idx, 1);
    form.members = list;
  }

  function toggleSupervisor(name) {
    const list = Array.isArray(form.supervisor) ? [...form.supervisor] : [];
    const idx = list.indexOf(name);
    if (idx === -1) list.push(name);
    else list.splice(idx, 1);
    form.supervisor = list;
  }

  // ── Folder-based Submissions ───────────────────────────────────────────────
  let expandedFolderIds  = new Set();
  let activeLinkFolderId = null;
  let viewingLinkUrl     = '';
  let viewingLinkLabel   = '';
  let renamingFolderId   = null;
  let renamingFolderName = '';
  let pendingUpload      = { projectId: null, folderId: null, file: null, name: '', type: 'Document' };
  let showMembersPanel   = false;
  let isLoadingFolders   = false;
  let isSavingFolder     = false;
  let isUploadingFile    = false;

  const FILE_TYPE_OPTIONS = ['Document', 'Powerpoint', 'PDF', 'Word'];

  // Map file extension → kind category
  function extToKind_(ext) {
    const e = String(ext || '').toLowerCase().replace('.', '');
    if (e === 'pdf')  return 'PDF';
    if (['ppt','pptx'].includes(e)) return 'Powerpoint';
    if (['doc','docx'].includes(e)) return 'Document';
    return 'Document';
  }

  // Get MIME type from extension
  function extToMime_(ext) {
    const e = String(ext || '').toLowerCase().replace('.', '');
    const map = {
      pdf: 'application/pdf',
      doc:  'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ppt:  'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      xls:  'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      png:  'image/png',
      jpg:  'image/jpeg',
      jpeg: 'image/jpeg',
      gif:  'image/gif',
      html: 'text/html',
      txt:  'text/plain',
    };
    return map[e] || 'application/octet-stream';
  }

  // Progress logs
  let activeLogPanelProjectId = null;
  let newLog = { date: new Date().toISOString().slice(0,10), description: '', progress: 0 };

  function toggleLogPanel(projectId) {
    if (activeLogPanelProjectId === projectId) {
      activeLogPanelProjectId = null;
      newLog = { date: new Date().toISOString().slice(0,10), description: '', progress: 0 };
    } else {
      activeLogPanelProjectId = projectId;
      newLog = { date: new Date().toISOString().slice(0,10), description: '', progress: (projects.find(p=>p.id===projectId)?.progress_percent) || 0 };
    }
    formError = '';
  }

  function addProgressLog(projectId) {
    if (!String(newLog.description || '').trim()) { formError = 'Log description is required.'; return; }
    const entry = {
      id: `log-${Date.now()}`,
      date: String(newLog.date),
      description: String(newLog.description),
      progress_percent: Number(newLog.progress) || 0,
    };
    projects = projects.map(p => p.id === projectId ? { ...p, progress_logs: [ ...(p.progress_logs || []), entry ], progress_percent: entry.progress_percent, updated_at: new Date().toISOString() } : p);
    formSuccess = 'Progress log added.';
    setTimeout(() => { formSuccess = ''; }, 2000);
    // reset form but keep panel open
    newLog = { date: new Date().toISOString().slice(0,10), description: '', progress: entry.progress_percent };
    formError = '';
  }

  function deleteProgressLog(projectId, logId) {
    projects = projects.map(p => {
      if (p.id !== projectId) return p;
      const remaining = (p.progress_logs || []).filter(l => l.id !== logId);
      const latest = remaining.length ? remaining[remaining.length-1].progress_percent : 0;
      return { ...p, progress_logs: remaining, progress_percent: latest, updated_at: new Date().toISOString() };
    });
    formSuccess = 'Log removed.';
    setTimeout(() => { formSuccess = ''; }, 2000);
  }

  // Add sample milestones to a project
  function addSampleMilestones(projectId) {
    const samples = [
      { id: `ms-${Date.now()}-1`, title: 'Proposal Submitted', due: '2026-02-15', status: 'done' },
      { id: `ms-${Date.now()}-2`, title: 'Initial Prototype', due: '2026-03-15', status: 'done' },
      { id: `ms-${Date.now()}-3`, title: 'Midterm Output', due: '2026-04-30', status: 'in-progress' },
      { id: `ms-${Date.now()}-4`, title: 'Final Submission', due: '2026-05-30', status: 'pending' },
    ];
    projects = projects.map(p => p.id === projectId ? { ...p, milestones: [ ...(p.milestones || []), ...samples ], updated_at: new Date().toISOString() } : p);
    formSuccess = 'Sample milestones added.';
    setTimeout(() => { formSuccess = ''; }, 2000);
  }

  function groupLogsByDate(logs) {
    const map = {};
    (logs || []).forEach(l => {
      const d = (l.date || '').slice(0,10);
      if (!map[d]) map[d] = [];
      map[d].push(l);
    });
    // return array sorted by date desc
    return Object.keys(map).sort((a,b)=> b.localeCompare(a)).map(k => ({ date: k, items: map[k] }));
  }

  function toggleFolder(folderId) {
    if (expandedFolderIds.has(folderId)) { expandedFolderIds.delete(folderId); }
    else { expandedFolderIds.add(folderId); }
    expandedFolderIds = new Set(expandedFolderIds);
  }

  // Load folders + submissions for a project from the backend
  async function loadProjectFolders(projectId) {
    const projId = String(projects.find(p => p.id === projectId)?.proj_id || projectId);
    isLoadingFolders = true;
    try {
      const res = await dispatchAction('list_proj_submissions', { proj_id: projId });
      if (res?.ok) {
        const folders = (res.folders || []).map(f => ({
          id:          f.folder_id,
          folder_id:   f.folder_id,
          name:        f.folder_name,
          gdrive_link: f.gdrive_link,
          created_by:  f.created_by,
          submissions: (f.submissions || []).map(normalizeSubmission_)
        }));
        projects = projects.map(p => p.id === projectId ? { ...p, folders } : p);
      }
    } catch (e) {
      console.error('loadProjectFolders error', e);
    } finally {
      isLoadingFolders = false;
    }
  }

  // Load milestones for a project
  async function loadProjectMilestones(projectId) {
    const projId = String(projects.find(p => p.id === projectId)?.proj_id || projectId);
    try {
      const res = await dispatchAction('list_milestones', { proj_id: projId });
      if (res?.ok) {
        const list = (res.milestones || []).map(m => ({ id: m.milestone_id, milestone: m.milestone, date: m.date, status: String(m.status || 'Not Started'), done: Boolean(m.done), created_at: m.created_at, created_by: m.created_by, linked_files: m.linked_files || '' }));
        projects = projects.map(p => p.id === projectId ? { ...p, milestones: list } : p);
        try { localStorage.setItem('projects.milestones.' + String(projectId), JSON.stringify(list)); } catch (e) {}
      } else {
        projects = projects.map(p => p.id === projectId ? { ...p, milestones: [] } : p);
        try { localStorage.setItem('projects.milestones.' + String(projectId), JSON.stringify([])); } catch (e) {}
      }
    } catch (e) {
      console.error('loadProjectMilestones error', e);
      // fall back to cached value if available
      let cached = null;
      try { cached = localStorage.getItem('projects.milestones.' + String(projectId)); } catch (ee) { cached = null; }
      if (cached) {
        try { const parsed = JSON.parse(cached); projects = projects.map(p => p.id === projectId ? { ...p, milestones: Array.isArray(parsed) ? parsed : [] } : p); } catch (ee) { projects = projects.map(p => p.id === projectId ? { ...p, milestones: [] } : p); }
      } else {
        projects = projects.map(p => p.id === projectId ? { ...p, milestones: [] } : p);
      }
    }
  }

  // Local inputs for new milestone per project
  let newMilestoneInputs = {};
  let editingMilestoneId = null;
  let editingMilestoneInputs = {};
  let showAddMilestoneFor = {};

  // Collapsible milestones and file-linker
  let expandedMilestoneIds = new Set();
  let milestoneFilePicker  = {};  // { [milestoneId]: boolean }

  function toggleMilestoneExpand(milestoneId) {
    if (expandedMilestoneIds.has(milestoneId)) expandedMilestoneIds.delete(milestoneId);
    else expandedMilestoneIds.add(milestoneId);
    expandedMilestoneIds = new Set(expandedMilestoneIds);
  }

  function toggleMilestoneFilePicker(milestoneId) {
    milestoneFilePicker = { ...milestoneFilePicker, [milestoneId]: !milestoneFilePicker[milestoneId] };
  }

  // Parse linked_files JSON stored on a milestone; fall back to []
  function parseMilestoneFiles(m) {
    try { const v = m.linked_files || ''; if (!v) return []; return JSON.parse(v); } catch(e) { return []; }
  }

  // Returns all file submissions in a project (across all folders) for the linker picker
  function projectFileSubmissions(projectId) {
    const proj = projects.find(p => p.id === projectId);
    if (!proj || !proj.folders) return [];
    const files = [];
    for (const folder of proj.folders) {
      for (const s of (folder.submissions || [])) {
        if (s.kind === 'file') files.push({ ...s, folder_name: folder.name });
      }
    }
    return files;
  }

  // Toggle a file in/out of a milestone's linked_files list and persist
  async function toggleMilestoneFile(projectId, milestoneId, submission) {
    const proj = projects.find(p => p.id === projectId);
    if (!proj) return;
    const m = (proj.milestones || []).find(x => x.id === milestoneId);
    if (!m) return;
    const current = parseMilestoneFiles(m);
    const exists = current.find(f => f.id === submission.id);
    const updated = exists
      ? current.filter(f => f.id !== submission.id)
      : [...current, { id: submission.id, name: submission.name, drive_url: submission.drive_url || '' }];
    const linkedJson = JSON.stringify(updated);
    const uid = getCurrentUserId();
    try {
      const res = await dispatchAction('update_milestone', { milestone_id: milestoneId, linked_files: linkedJson, user_id: uid });
      if (!res?.ok) { formError = res?.error || 'Failed to update linked files.'; return; }
      projects = projects.map(proj2 => proj2.id !== projectId ? proj2 : {
        ...proj2,
        milestones: (proj2.milestones || []).map(mm => mm.id === milestoneId ? { ...mm, linked_files: linkedJson } : mm)
      });
    } catch(e) { formError = e?.message || 'Failed to update linked files.'; }
  }

  function milestoneStatusIcon(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'approved') return '✅';
    if (s === 'in progress') return '🔵';
    if (s === 'submitted') return '📤';
    if (s === 'needs revision') return '🔴';
    return '🟡';  // Not Started default
  }

  function toggleAddMilestone(projectId) {
    const init = newMilestoneInputs[projectId] || { milestone: '', date: '' };
    newMilestoneInputs = { ...newMilestoneInputs, [projectId]: init };
    showAddMilestoneFor = { ...showAddMilestoneFor, [projectId]: !Boolean(showAddMilestoneFor[projectId]) };
  }

  async function createMilestone(projectId) {
    formError = '';
    const proj = projects.find(p => p.id === projectId);
    if (!proj) return;
    const projId = String(proj.proj_id || projectId);
    const inputs = newMilestoneInputs[projectId] || { milestone: '', date: '' };
    const text = String(inputs.milestone || '').trim();
    const date = String(inputs.date || '').trim();
    if (!text) { formError = 'Milestone text is required.'; return; }
    const uid = getCurrentUserId();
    try {
      const res = await dispatchAction('create_milestone', { proj_id: projId, milestone: text, date: date, status: 'Not Started', done: false, user_id: uid });
      if (!res?.ok) { formError = res?.error || 'Failed to create milestone.'; console.warn('createMilestone failed', res); return; }
      const item = { id: res.milestone_id, milestone: text, date: date, status: 'Not Started', created_at: res.created_at, created_by: uid, done: false };
      projects = projects.map(p => p.id === projectId ? { ...p, milestones: [ ...(p.milestones || []), item ] } : p);
      // save to cache
      try {
        const key = 'projects.milestones.' + String(projectId);
        const cur = JSON.parse(localStorage.getItem(key) || '[]');
        cur.push(item);
        localStorage.setItem(key, JSON.stringify(cur));
      } catch (e) {}
      newMilestoneInputs = { ...newMilestoneInputs, [projectId]: { milestone: '', date: '' } };
      showAddMilestoneFor = { ...showAddMilestoneFor, [projectId]: false };
      formSuccess = 'Milestone added.';
      setTimeout(() => { formSuccess = ''; }, 2000);
    } catch (e) {
      console.error('createMilestone error', e);
      formError = e?.message || 'Failed to create milestone.';
    }
  }

  async function deleteMilestone(projectId, milestoneId) {
    if (!milestoneId) return;
    // Optimistic UI: remove
    projects = projects.map(p => p.id === projectId ? { ...p, milestones: (p.milestones || []).filter(m => m.id !== milestoneId) } : p);
    // update cache
    try {
      const key = 'projects.milestones.' + String(projectId);
      const cur = JSON.parse(localStorage.getItem(key) || '[]');
      const updated = (cur || []).filter(m => m.id !== milestoneId);
      localStorage.setItem(key, JSON.stringify(updated));
    } catch (e) {}
    try {
      const res = await dispatchAction('delete_milestone', { milestone_id: milestoneId });
      if (!res?.ok) { formError = res?.error || 'Failed to delete milestone.'; return; }
      formSuccess = 'Milestone deleted.';
      setTimeout(() => { formSuccess = ''; }, 1500);
    } catch (e) {
      formError = e?.message || 'Failed to delete milestone.';
    }
  }

  function startEditMilestone(projectId, m) {
    editingMilestoneId = m.id;
    editingMilestoneInputs = { ...editingMilestoneInputs, [m.id]: { milestone: m.milestone || '', date: m.date || '', status: m.status || 'Not Started' } };
  }

  function cancelEditMilestone() {
    editingMilestoneId = null;
  }

  async function saveEditedMilestone(projectId, milestoneId) {
    if (!milestoneId) return;
    const inputs = editingMilestoneInputs[milestoneId] || { milestone: '', date: '' };
    const text = String(inputs.milestone || '').trim();
    const date = String(inputs.date || '').trim();
    if (!text) { formError = 'Milestone text is required.'; return; }
    const uid = getCurrentUserId();
    try {
      const res = await dispatchAction('update_milestone', { milestone_id: milestoneId, milestone: text, date: date, status: String(inputs.status || 'Not Started'), user_id: uid });
      if (!res?.ok) { formError = res?.error || 'Failed to update milestone.'; return; }
      // refresh from server to ensure we reflect persisted `done` state
      try {
        await loadProjectMilestones(projectId);
      } catch (e) {
        // fallback to local update if reload fails
        projects = projects.map(p => p.id === projectId ? { ...p, milestones: (p.milestones || []).map(mm => mm.id === milestoneId ? { ...mm, milestone: text, date: date, status: String(inputs.status || 'Not Started') } : mm) } : p);
      }
      // update cache (best-effort)
      try {
        const key = 'projects.milestones.' + String(projectId);
        const cur = JSON.parse(localStorage.getItem(key) || '[]');
        const updated = (cur || []).map(mm => mm.id === milestoneId ? { ...mm, milestone: text, date: date, status: String(inputs.status || 'Not Started') } : mm);
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (e) {}
      editingMilestoneId = null;
      formSuccess = 'Milestone updated.';
      setTimeout(() => { formSuccess = ''; }, 1500);
    } catch (e) {
      formError = e?.message || 'Failed to update milestone.';
    }
  }

  // Change milestone status directly from view-select
  async function changeMilestoneStatus(projectId, milestoneId, newStatus) {
    if (!milestoneId) return;
    const uid = getCurrentUserId();
    try {
      const res = await dispatchAction('update_milestone', { milestone_id: milestoneId, status: String(newStatus || 'Not Started'), user_id: uid });
      if (!res?.ok) { formError = res?.error || 'Failed to update status.'; return; }
      // update local state immediately and then reload for consistency
      projects = projects.map(p => p.id === projectId ? { ...p, milestones: (p.milestones || []).map(mm => mm.id === milestoneId ? { ...mm, status: String(newStatus || 'Not Started'), done: (String(newStatus || '').toLowerCase() === 'approved' || Boolean(mm.done)) } : mm) } : p);
      try { await loadProjectMilestones(projectId); } catch (e) { /* fallback */ }
      formSuccess = 'Status updated.';
      setTimeout(() => { formSuccess = ''; }, 1200);
    } catch (e) {
      formError = e?.message || 'Failed to update status.';
    }
  }

  // ── Feedback ────────────────────────────────────────────────────────────────
  let feedbackMap       = {};   // { [projectId]: FeedbackItem[] }
  let feedbackLoading   = {};   // { [projectId]: boolean }
  let newFeedbackText   = {};   // { [projectId]: string }
  let replyingTo        = {};   // { [projectId]: feedbackId | null }
  let replyText         = {};   // { [projectId]: string }
  // feedback actions removed: status / approve / reject

  async function loadFeedback(projectId) {
    feedbackLoading = { ...feedbackLoading, [projectId]: true };
    try {
      const res = await dispatchAction('list_feedback', { proj_id: String(projectId) });
      if (res?.ok) feedbackMap = { ...feedbackMap, [projectId]: res.feedback || [] };
      else feedbackMap = { ...feedbackMap, [projectId]: [] };
    } catch (e) {
      feedbackMap = { ...feedbackMap, [projectId]: [] };
    } finally {
      feedbackLoading = { ...feedbackLoading, [projectId]: false };
    }
  }

  function feedbackChildren(projectId, parentId) {
    const list = feedbackMap[projectId] || [];
    return list.filter(f => String(f.parent_id || '') === String(parentId || ''));
  }

  async function submitFeedback(projectId) {
    const text = String(newFeedbackText[projectId] || '').trim();
    if (!text) return;
    const uid  = getCurrentUserId();
    const role = String(currentUser?.role || getCurrentUser()?.role || 'Intern');
    try {
      const res = await dispatchAction('create_feedback', { proj_id: String(projectId), user_id: uid, commenter_role: role, comment_text: text });
      if (!res?.ok) { formError = res?.error || 'Failed to post comment.'; return; }
      newFeedbackText = { ...newFeedbackText, [projectId]: '' };
      await loadFeedback(projectId);
    } catch (e) { formError = e?.message || 'Failed to post comment.'; }
  }

  async function submitReply(projectId, parentId) {
    const text = String(replyText[projectId] || '').trim();
    if (!text) return;
    const uid  = getCurrentUserId();
    const role = String(currentUser?.role || getCurrentUser()?.role || 'Intern');
    try {
      const res = await dispatchAction('create_feedback', { proj_id: String(projectId), parent_id: String(parentId), user_id: uid, commenter_role: role, comment_text: text });
      if (!res?.ok) { formError = res?.error || 'Failed to post reply.'; return; }
      replyText    = { ...replyText,    [projectId]: '' };
      replyingTo   = { ...replyingTo,   [projectId]: null };
      await loadFeedback(projectId);
    } catch (e) { formError = e?.message || 'Failed to post reply.'; }
  }

  async function deleteFeedback(projectId, feedbackId) {
    const uid = getCurrentUserId();
    try {
      const res = await dispatchAction('delete_feedback', { feedback_id: feedbackId, user_id: uid });
      if (!res?.ok) { formError = res?.error || 'Delete failed.'; return; }
      await loadFeedback(projectId);
    } catch (e) { formError = e?.message || 'Delete failed.'; }
  }

  function normalizeSubmission_(s) {
    const isFile = s.kind !== 'link';
    return {
      id:            s.submission_id,
      submission_id: s.submission_id,
      kind:          isFile ? 'file' : 'link',
      // file fields
      name:          s.file_name || '',
      file_type:     s.file_type || '',
      file_size:     s.file_size || '',
      uploaded_at:   s.uploaded_at || '',
      drive_url:     isFile ? (s.link_url || '') : '',   // link_url stores the Drive file URL for files
      gdrive:        s.gdrive || '',                     // gdrive stores the folder's Google Drive link
      // link fields
      title:         !isFile ? (s.link_label || s.link_url || '') : '',
      url:           !isFile ? (s.link_url || '') : '',
      added_at:      !isFile ? (s.uploaded_at || '') : '',
    };
  }

  async function addFolder(projectId) {
    const uid    = getCurrentUserId();
    const projId = String(projects.find(p => p.id === projectId)?.proj_id || projectId);
    isSavingFolder = true;
    try {
      const res = await dispatchAction('create_proj_folder', {
        proj_id: projId, folder_name: 'New Folder', user_id: uid
      });
      if (!res?.ok) { formError = res?.error || 'Failed to create folder.'; return; }
      const newFolder = {
        id: res.folder_id, folder_id: res.folder_id,
        name: 'New Folder', gdrive_link: res.gdrive_link || '',
        submissions: []
      };
      projects = projects.map(p => p.id === projectId
        ? { ...p, folders: [...(p.folders || []), newFolder] } : p);
      expandedFolderIds.add(res.folder_id);
      expandedFolderIds = new Set(expandedFolderIds);
      renamingFolderId   = res.folder_id;
      renamingFolderName = 'New Folder';
    } catch (e) {
      formError = e?.message || 'Failed to create folder.';
    } finally {
      isSavingFolder = false;
    }
  }

  function startRenaming(folderId, currentName) {
    renamingFolderId   = folderId;
    renamingFolderName = currentName;
  }

  async function confirmRename(projectId) {
    if (!renamingFolderId) return;
    const newName  = String(renamingFolderName || '').trim() || 'New Folder';
    const uid      = getCurrentUserId();
    const savedId  = renamingFolderId;
    renamingFolderId   = null;
    renamingFolderName = '';
    // Optimistic UI update
    projects = projects.map(p => p.id === projectId ? {
      ...p, folders: (p.folders || []).map(f => f.id === savedId ? { ...f, name: newName } : f)
    } : p);
    try {
      const res = await dispatchAction('update_proj_folder', {
        folder_id: savedId, folder_name: newName, user_id: uid
      });
      if (!res?.ok) { formError = res?.error || 'Rename failed.'; }
    } catch (e) {
      formError = e?.message || 'Rename failed.';
    }
  }

  async function deleteFolder(projectId, folderId) {
    if (activeLinkFolderId === folderId) activeLinkFolderId = null;
    if (pendingUpload.folderId === folderId) cancelPendingUpload();
    // Optimistic UI
    projects = projects.map(p => p.id === projectId ? {
      ...p, folders: (p.folders || []).filter(f => f.id !== folderId)
    } : p);
    expandedFolderIds.delete(folderId);
    expandedFolderIds = new Set(expandedFolderIds);
    try {
      const res = await dispatchAction('delete_proj_folder', { folder_id: folderId });
      if (!res?.ok) { formError = res?.error || 'Delete folder failed.'; return; }
      formSuccess = 'Folder deleted.';
      setTimeout(() => { formSuccess = ''; }, 2000);
    } catch (e) {
      formError = e?.message || 'Delete folder failed.';
    }
  }

  function toggleLinkPanel(folderId) {
    if (activeLinkFolderId === folderId) {
      activeLinkFolderId = null;
      viewingLinkUrl = '';
      viewingLinkLabel = '';
      formError = '';
    } else {
      activeLinkFolderId = folderId;
      viewingLinkUrl = '';
      viewingLinkLabel = '';
      formError = '';
    }
  }

  function triggerFilePicker(projectId, folderId) {
    const el = document.getElementById(`proj-file-input-${projectId}-${folderId}`);
    if (el) el.click();
  }

  function handleFileSelect(projectId, folderId, ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const defaultName = file.name.replace(/\.[^/.]+$/, '');
    const ext = (file.name.match(/\.([^.]+)$/) || [])[1] || '';
    pendingUpload = { projectId, folderId, file, name: defaultName, type: extToKind_(ext), ext };
    ev.target.value = '';
  }

  function cancelPendingUpload() {
    pendingUpload = { projectId: null, folderId: null, file: null, name: '', type: 'Document', ext: '' };
    formError = '';
  }

  async function confirmUpload(projectId, folderId) {
    if (!pendingUpload || pendingUpload.projectId !== projectId || pendingUpload.folderId !== folderId || !pendingUpload.file) return;
    const file       = pendingUpload.file;
    const chosenName = (String(pendingUpload.name || '').trim() || file.name.replace(/\.[^/.]+$/, '')) + (pendingUpload.ext ? '.' + pendingUpload.ext : '');
    const chosenKind = pendingUpload.type || 'Document';
    const ext        = pendingUpload.ext || (file.name.match(/\.([^.]+)$/) || [])[1] || '';
    const mimeType   = extToMime_(ext);
    const fileSizeMb = (file.size / (1024 * 1024)).toFixed(3);
    const projId     = String(projects.find(p => p.id === projectId)?.proj_id || projectId);
    const uid        = getCurrentUserId();

    isUploadingFile = true;
    formError = '';
    try {
      // Read as base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => {
          // result is a dataUrl: data:<mime>;base64,<data>
          const dataUrl = reader.result;
          const b64     = dataUrl.split(',')[1] || '';
          resolve(b64);
        };
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(file);
      });

      const res = await dispatchAction('create_proj_submission', {
        proj_id:    projId,
        folder_id:  folderId,
        user_id:    uid,
        kind:       'file',
        file_name:  chosenName,
        file_type:  ext,
        file_kind:  chosenKind,
        file_size:  fileSizeMb,
        base64_data: base64,
        mime_type:  mimeType
      });
      if (!res?.ok) { formError = res?.error || 'Upload failed.'; return; }

      const folderGdrive = projects.find(p => p.id === projectId)?.folders?.find(f => f.id === folderId)?.gdrive_link || '';
      const submission = {
        id:            res.submission_id,
        submission_id: res.submission_id,
        kind:          'file',
        name:          chosenName,
        file_type:     ext,
        file_size:     (String(fileSizeMb || '').trim() && !/\s*MB$/i.test(String(fileSizeMb || '')))
                        ? String(fileSizeMb) + ' MB' : String(fileSizeMb || ''),
        uploaded_at:   res.uploaded_at || new Date().toISOString().slice(0, 10),
        drive_url:     res.drive_url || '',
        gdrive:        folderGdrive
      };
      projects = projects.map(p => p.id === projectId ? {
        ...p,
        folders: (p.folders || []).map(f => f.id === folderId
          ? { ...f, submissions: [...(f.submissions || []), submission] } : f)
      } : p);
      formSuccess = 'File uploaded successfully.';
      setTimeout(() => { formSuccess = ''; }, 3000);
      cancelPendingUpload();
    } catch (e) {
      formError = e?.message || 'Upload failed.';
    } finally {
      isUploadingFile = false;
    }
  }

  async function addLinkSubmission(projectId, folderId) {
    if (!String(viewingLinkUrl || '').trim()) { formError = 'Link URL is required.'; return; }
    const projId = String(projects.find(p => p.id === projectId)?.proj_id || projectId);
    const uid    = getCurrentUserId();
    formError = '';
    try {
      const res = await dispatchAction('create_proj_submission', {
        proj_id:    projId,
        folder_id:  folderId,
        user_id:    uid,
        kind:       'link',
        link_label: viewingLinkLabel,
        link_url:   viewingLinkUrl
      });
      if (!res?.ok) { formError = res?.error || 'Failed to save link.'; return; }

      const submission = {
        id:            res.submission_id,
        submission_id: res.submission_id,
        kind:          'link',
        title:         viewingLinkLabel || viewingLinkUrl,
        url:           viewingLinkUrl,
        added_at:      res.uploaded_at || new Date().toISOString()
      };
      projects = projects.map(p => p.id === projectId ? {
        ...p,
        folders: (p.folders || []).map(f => f.id === folderId
          ? { ...f, submissions: [...(f.submissions || []), submission] } : f)
      } : p);
      viewingLinkUrl     = '';
      viewingLinkLabel   = '';
      activeLinkFolderId = null;
      formSuccess = 'Link added.';
      setTimeout(() => { formSuccess = ''; }, 2000);
    } catch (e) {
      formError = e?.message || 'Failed to save link.';
    }
  }

  async function viewSubmission(sub) {
    if (!sub) return;
    let url = sub.kind === 'file' ? (sub.drive_url || '') : (sub.url || '');

    // If file and no stored url, ask server to locate/repair it
    if (sub.kind === 'file' && !url && sub.gdrive) {
      try {
        const res = await dispatchAction('get_submission_drive_url', {
          submission_id: sub.submission_id,
          folder_id: sub.folder_id || '',
          file_name: sub.name || '',
          gdrive: sub.gdrive || ''
        });
        if (res?.ok && res.drive_url) {
          url = res.drive_url;
          // update local submission object so subsequent clicks don't call server again
          sub.drive_url = url;
        }
      } catch (e) {}
    }

    if (!url) return;
    // Try to extract a Drive file id and open a reliable view URL
    if (sub.kind === 'file') {
      const m = String(url || '').match(/\/d\/([a-zA-Z0-9_-]+)/) || String(url || '').match(/[?&]id=([a-zA-Z0-9_-]+)/);
      const fid = m ? m[1] : null;
      if (fid) {
        const viewUrl = 'https://drive.google.com/file/d/' + fid + '/view?usp=sharing';
        window.open(viewUrl, '_blank');
        return;
      }
    }
    window.open(url, '_blank');
  }

  async function downloadSubmission(sub) {
    if (!sub) return;
    let url = sub.kind === 'file' ? (sub.drive_url || '') : (sub.url || '');

    // If file and no stored url, ask server to locate/repair it
    if (sub.kind === 'file' && !url && sub.gdrive) {
      try {
        const res = await dispatchAction('get_submission_drive_url', {
          submission_id: sub.submission_id,
          folder_id: sub.folder_id || '',
          file_name: sub.name || '',
          gdrive: sub.gdrive || ''
        });
        if (res?.ok && res.drive_url) {
          url = res.drive_url;
          sub.drive_url = url;
        }
      } catch (e) {}
    }

    if (!url) return;
    // For Drive files, open a direct download link using the file id
    if (sub.kind === 'file') {
      const m = String(url || '').match(/\/d\/([a-zA-Z0-9_-]+)/) || String(url || '').match(/[?&]id=([a-zA-Z0-9_-]+)/);
      const fid = m ? m[1] : null;
      if (fid) {
        const dl = 'https://drive.google.com/uc?export=download&id=' + fid;
        window.open(dl, '_blank');
        return;
      }
    }
    window.open(url, '_blank');
  }

  async function deleteSubmission(projectId, folderId, subId) {
    // Optimistic UI
    projects = projects.map(p => p.id === projectId ? {
      ...p,
      folders: (p.folders || []).map(f => f.id === folderId
        ? { ...f, submissions: (f.submissions || []).filter(s => s.id !== subId) } : f)
    } : p);
    try {
      const res = await dispatchAction('delete_proj_submission', { submission_id: subId });
      if (!res?.ok) { formError = res?.error || 'Delete submission failed.'; return; }
      formSuccess = 'Submission removed.';
      setTimeout(() => { formSuccess = ''; }, 2000);
    } catch (e) {
      formError = e?.message || 'Delete submission failed.';
    }
  }

  async function archiveProject(p) {
    if (!p) return;
    const uid = getCurrentUserId();
    try {
      const res = await dispatchAction('update_proj_intern', {
        proj_id: p.proj_id || p.id,
        user_id: uid,
        status:  'Archived'
      });
      if (!res?.ok) { formError = res?.error || 'Archive failed.'; return; }
      projects = projects.map(item => item.id === p.id ? { ...item, archived: true, status: 'Archived' } : item);
      viewingProjectId = null;
      formSuccess = 'Project archived.';
      setTimeout(() => { formSuccess = ''; }, 2000);
    } catch (e) {
      formError = e?.message || 'Archive failed.';
    }
  }

  async function restoreProject(p) {
    if (!p) return;
    const uid = getCurrentUserId();
    try {
      const res = await dispatchAction('restore_proj_intern', {
        proj_id: p.proj_id || p.id,
        user_id: uid
      });
      if (!res?.ok) { formError = res?.error || 'Restore failed.'; return; }
      projects = projects.map(item => item.id === p.id ? { ...item, archived: false, status: res.status || 'Not Started' } : item);
      formSuccess = 'Project restored.';
      setTimeout(() => { formSuccess = ''; }, 2000);
    } catch (e) {
      formError = e?.message || 'Restore failed.';
    }
  }

  

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  onMount(() => {
    currentUser = getCurrentUser();
    loadBootstrap();
    unsubscribeAuth = subscribeToCurrentUser(u => { currentUser = u; loadBootstrap(); });
  });
  onDestroy(() => { if (typeof unsubscribeAuth === 'function') unsubscribeAuth(); });

  // ── Derived ───────────────────────────────────────────────────────────────
  let lastAssignmentDebugKey = '';
  $: departmentContext = normalizeText(getProjectDepartmentContext());
  $: allInterns = users.filter(isInternUser);
  $: allSupervisors = users.filter(isSupervisorUser);
  $: availableInterns = departmentContext
    ? allInterns.filter((user) => sameDepartment(getDepartmentValue(user), departmentContext))
    : allInterns;
  $: availableSupervisors = departmentContext
    ? allSupervisors.filter((user) => sameDepartment(getDepartmentValue(user), departmentContext))
    : allSupervisors;
  $: MEMBER_OPTIONS = availableInterns.map((user) => ({
    value: getUserId(user),
    label: getDisplayName(user),
    photoUrl: getProfilePhotoUrl(user),
    initials: getInitials(getDisplayName(user))
  })).filter((option) => option.value);
  $: SUPERVISOR_OPTIONS = availableSupervisors.map((user) => ({
    value: getUserId(user),
    label: getDisplayName(user),
    photoUrl: getProfilePhotoUrl(user),
    initials: getInitials(getDisplayName(user))
  })).filter((option) => option.value);
  $: {
    const debugKey = [
      usersLoading,
      departmentContext,
      users.length,
      allInterns.length,
      availableInterns.length,
      allSupervisors.length,
      availableSupervisors.length
    ].join('|');
    if (debugKey !== lastAssignmentDebugKey) {
      lastAssignmentDebugKey = debugKey;
      console.log('Project assignment users:', {
        currentUserDepartment: getProjectDepartmentContext(),
        backendDepartment: bootstrapDepartment,
        inferredDepartment: inferSingleDepartmentFromUsers(users),
        totalUsersLoaded: users.length,
        internsBeforeDepartmentFilter: allInterns.length,
        internsAfterDepartmentFilter: availableInterns.length,
        supervisorsBeforeDepartmentFilter: allSupervisors.length,
        supervisorsAfterDepartmentFilter: availableSupervisors.length
      });
      if (!usersLoading && users.length && !departmentContext) {
        console.warn('Project assignment department context is empty; users are not shown until a department is available.');
      }
    }
  }

  $: filteredProjects = projects.filter(p => {
    if (p.archived) return false;
    const matchPriority = filterPriority === 'all' || p.priority_level === filterPriority;
    const matchStatus   = filterStatus   === 'all' || p.status === filterStatus;
    return matchPriority && matchStatus;
  });

  $: totalProjects     = projects.filter(p => !p.archived).length;
  $: inProgressCount   = projects.filter(p => !p.archived && p.status === 'In Progress').length;
  $: completedCount    = projects.filter(p => !p.archived && p.status === 'Completed').length;
  $: isFormValid       = String(form.title || '').trim() && String(form.timeline_start || '').trim() && String(form.timeline_end || '').trim();

  // Derived sets for tab views
  $: archivedProjects = projects.filter(p => !!p.archived);
  $: recentProjects   = projects.slice(0, 3);

  // ── Overview extras ────────────────────────────────────────────────────────
  let overviewActivity     = [];
  let isLoadingActivity    = false;
  let overviewActivityLoaded = false;

  async function loadOverviewActivity() {
    isLoadingActivity = true;
    try {
      const uid = getCurrentUserId();
      if (!uid) return;
      const res = await dispatchAction('get_proj_recent_activity', { user_id: uid });
      if (res?.ok) overviewActivity = res.activities || [];
    } catch(e) {
      console.warn('loadOverviewActivity error', e);
    } finally {
      isLoadingActivity = false;
      overviewActivityLoaded = true;
    }
  }



  async function loadOverviewMilestones() {
    const snippets = projects.filter(p => !p.archived).slice(0, 6);
    await Promise.all(
      snippets
        .filter(p => !Array.isArray(p.milestones))
        .map(p => loadProjectMilestones(p.id).catch(() => {}))
    );
  }

  // Auto-load activity when the user first opens Overview and projects are ready
  $: if (activeView === 'Overview' && !isLoading && projects.length > 0 && !overviewActivityLoaded && !isLoadingActivity) {
    loadOverviewActivity();
    loadOverviewMilestones();
  }

  $: upcomingDeadlines = projects
    .filter(p => !p.archived && String(p.timeline_end || '').trim())
    .sort((a, b) => String(a.timeline_end).localeCompare(String(b.timeline_end)))
    .slice(0, 5);

  $: statusBreakdown = STATUS_OPTIONS.map(s => ({
    status: s,
    count: projects.filter(p => !p.archived && p.status === s).length,
    meta: STATUS_META[s] || STATUS_META['Not Started']
  }));

  $: overviewSnippets = projects.filter(p => !p.archived).slice(0, 6);

  $: overviewMilestoneRows = overviewSnippets
    .filter(p => Array.isArray(p.milestones) && p.milestones.length > 0)
    .map(p => ({
      title: p.title,
      total: p.milestones.length,
      done: p.milestones.filter(m => Boolean(m.done) || String(m.status) === 'Approved').length
    }));
</script>
<section class="projects-page">

  <!-- Stat Cards -->
  <div class="stat-cards">
    <div class="stat-card">
      <div class="stat-icon tone-blue"><FolderOpen size={16} /></div>
      <div class="stat-body">
        <div class="stat-label">Total Projects</div>
        <div class="stat-value">{totalProjects}</div>
        <div class="stat-sub">All assigned projects</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon tone-amber"><Clock3 size={16} /></div>
      <div class="stat-body">
        <div class="stat-label">In Progress</div>
        <div class="stat-value">{inProgressCount}</div>
        <div class="stat-sub">Currently active projects</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon tone-green"><CheckCircle2 size={16} /></div>
      <div class="stat-body">
        <div class="stat-label">Completed</div>
        <div class="stat-value">{completedCount}</div>
        <div class="stat-sub">Finished projects</div>
      </div>
    </div>
  </div>
  
    <!-- Quick panel (copied from SupervisorActivity) -->
    <section class="quick-panel">
      <div class="quick-head">
        <div class="view-controls">
          <button class="btn btn-ghost" class:active={activeView === 'Overview'} on:click={() => activeView = 'Overview'}>
            <Grid size={14} />
            <span>Overview</span>
          </button>
          <button class="btn btn-ghost" class:active={activeView === 'Projects'} on:click={() => activeView = 'Projects'}>
            <FolderOpen size={14} />
            <span>Projects</span>
          </button>
          <button class="btn btn-ghost" class:active={activeView === 'Archive'} on:click={() => activeView = 'Archive'}>
            <Archive size={14} />
            <span>Archive</span>
          </button>
        </div>

        <div class="quick-actions">
          <label class="search-wrap">
            <input class="search-input" type="text" placeholder="Search" bind:value={searchQuery} />
          </label>
          <select class="quick-status" bind:value={filterStatus} aria-label="Filter by status">
            <option value="all">All Status</option>
            {#each STATUS_OPTIONS as s}
              <option value={s}>{s}</option>
            {/each}
          </select>
          <select class="quick-priority" bind:value={filterPriority} aria-label="Filter by priority">
            <option value="all">All Priority</option>
            {#each PRIORITY_OPTIONS as p}
              <option value={p}>{p}</option>
            {/each}
          </select>
          <button class="primary" on:click={openAddProjectModal}>+ Add Project</button>
        </div>
      </div>
    </section>
  
  
  
  

  

  {#if formSuccess}
    <div class="alert-success">{formSuccess}</div>
  {/if}

  <!-- ── MY PROJECTS TAB ─────────────────────────────────────────── -->
  {#if activeTab === 'my-projects'}
    {#if activeView === 'Overview'}
      {#if !isLoading && projects.length === 0}
        <div class="empty-state">
          <FolderOpen size={32} />
          <div class="empty-title">No projects yet</div>
          <div class="empty-sub">Click "+ Add Project" to get started.</div>
          <button class="empty-cta" on:click={openAddProjectModal}>+ Add Project</button>
        </div>
      {:else}

        <!-- ── Overview: top 2-col grid ── -->
        <div class="ov-top-grid">

          <!-- Milestone Summary -->
          <section class="card ov-card">
            <div class="ov-card-title">Milestone Summary</div>
            {#if isLoading}
              <div class="ov-skeleton-list">
                {#each [1, 2, 3, 4] as _}
                  <div class="ov-skeleton-row">
                    <div class="ov-skeleton shimmer" style="height: 11px; width: 120px;"></div>
                    <div class="ov-skeleton shimmer" style="height: 8px; width: 100%; border-radius: 999px;"></div>
                    <div class="ov-skeleton shimmer" style="height: 11px; width: 34px;"></div>
                  </div>
                {/each}
              </div>
            {:else if overviewMilestoneRows.length === 0}
              <div class="ov-empty">No milestone data yet.</div>
            {:else}
              <div class="ov-status-bars">
                {#each overviewMilestoneRows as row}
                  {@const mpct = Math.round((row.done / row.total) * 100)}
                  <div class="ov-bar-row">
                    <span class="ov-ms-row-name ov-bar-label">{row.title}</span>
                    <div class="ov-bar-track">
                      <div class="progress-bar-inner" style="width:{mpct}%"></div>
                    </div>
                    <span class="ov-bar-count"><span class="ov-ms-done">{row.done}</span>/{row.total}</span>
                  </div>
                {/each}
              </div>
            {/if}
            {#if archivedProjects.length > 0}
              <div class="ov-archived-note">
                <Archive size={11} /> {archivedProjects.length} archived project{archivedProjects.length === 1 ? '' : 's'}
              </div>
            {/if}
          </section>

          <!-- Upcoming Deadlines -->
          <section class="card ov-card">
            <div class="ov-card-title">Upcoming Deadlines</div>
            {#if isLoading}
              <div class="ov-skeleton-list">
                {#each [1, 2, 3] as _}
                  <div class="ov-skeleton-deadline-row">
                    <div class="ov-skeleton shimmer" style="width: 10px; height: 10px; border-radius: 999px;"></div>
                    <div class="ov-skeleton-deadline-info">
                      <div class="ov-skeleton shimmer" style="height: 12px; width: 150px;"></div>
                      <div class="ov-skeleton shimmer" style="height: 11px; width: 110px;"></div>
                    </div>
                    <div class="ov-skeleton shimmer" style="height: 20px; width: 76px; border-radius: 999px;"></div>
                  </div>
                {/each}
              </div>
            {:else if upcomingDeadlines.length === 0}
              <div class="ov-empty">No upcoming deadlines.</div>
            {:else}
              <div class="ov-deadline-list">
                {#each upcomingDeadlines as p}
                  {@const past = isDeadlinePast(p.timeline_end)}
                  {@const near = isDeadlineNear(p.timeline_end)}
                  {@const sm   = STATUS_META[p.status] || STATUS_META['Not Started']}
                  <div class="ov-deadline-row">
                    <div class="ov-deadline-dot" class:ov-dot-past={past} class:ov-dot-near={near && !past}></div>
                    <div class="ov-deadline-info">
                      <div class="ov-deadline-name">{p.title}</div>
                      <div class="ov-deadline-date" class:ov-date-past={past} class:ov-date-near={near && !past}>
                        <CalendarDays size={11} /> {formatDate(p.timeline_end)}
                      </div>
                    </div>
                    <span class={"proj-status-pill " + sm.cls}>{sm.label}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </section>
        </div>

        <!-- ── Project Snippets ── -->
        <section class="card ov-card">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 1rem;">
            <div class="ov-card-title">Your Projects</div>
            <button class="ov-view-all-btn" on:click={() => activeView = 'Projects'}>View all →</button>
          </div>
          {#if isLoading}
            <div class="ov-snippets-grid">
              {#each [1, 2, 3] as _}
                <div class="ov-snippet-card ov-snippet-skeleton">
                  <div class="ov-snippet-top">
                    <div class="ov-skeleton shimmer" style="height: 12px; width: 55%;"></div>
                    <div class="ov-snippet-top-right">
                      <div class="ov-skeleton shimmer" style="height: 20px; width: 82px; border-radius: 999px;"></div>
                      <div class="ov-skeleton shimmer" style="height: 20px; width: 62px; border-radius: 999px;"></div>
                    </div>
                  </div>
                  <div class="ov-skeleton shimmer" style="height: 8px; width: 100%; border-radius: 999px;"></div>
                  <div class="ov-skeleton shimmer" style="height: 11px; width: 130px;"></div>
                  <div class="ov-snippet-actions">
                    <div class="ov-skeleton shimmer" style="height: 28px; width: 100%; border-radius: 8px;"></div>
                    <div class="ov-skeleton shimmer" style="height: 28px; width: 100%; border-radius: 8px;"></div>
                  </div>
                </div>
              {/each}
            </div>
          {:else if overviewSnippets.length === 0}
            <div class="ov-empty">No active projects.</div>
          {:else}
            <div class="ov-snippets-grid">
              {#each overviewSnippets as p (p.id)}
                {@const sm  = STATUS_META[p.status] || STATUS_META['Not Started']}
                {@const pl  = getPriorityLabel(p.priority_level)}
                {@const pct = p.progress_percent != null ? p.progress_percent : statusToProgress(p.status)}
                {@const past = isDeadlinePast(p.timeline_end || p.deadline)}
                <div class="ov-snippet-card">
                  <div class="ov-snippet-top">
                    <div class="ov-snippet-name">{p.title}</div>
                    <div class="ov-snippet-top-right">
                      <span class={"proj-status-pill " + sm.cls}>{sm.label}</span>
                      <span class={"proj-priority-pill priority-" + pl.toLowerCase()}>{pl}</span>
                    </div>
                  </div>
                  <div class="ov-snippet-progress">
                    <div class="progress-bar-outer">
                      <div class="progress-bar-inner" style="width:{pct}%"></div>
                    </div>
                    <span class="ov-snippet-pct">{pct}%</span>
                  </div>
                  {#if p.timeline_end || p.deadline}
                    <div class="ov-snippet-due" class:ov-date-past={past}>
                      <CalendarDays size={11} /> Due: {formatDate(p.timeline_end || p.deadline)}
                    </div>
                  {/if}
                  <div class="ov-snippet-actions">
                    <button class="sub-action-btn" on:click={() => { activeView = 'Projects'; viewProject(p); }}>
                      <Eye size={12} /> Open
                    </button>
                    <button class="sub-action-btn" title="Archive project" on:click={() => archiveProject(p)}>
                      <Archive size={12} /> Archive
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </section>

        <!-- ── Recent Activity (expanded) ── -->
        <div class="ov-bottom-grid">
          <section class="card ov-card">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 1rem;">
              <div class="ov-card-title">Recent Activity</div>
              <button class="ov-refresh-btn" title="Refresh" on:click={loadOverviewActivity} disabled={isLoadingActivity}>
                {#if isLoadingActivity}<Loader2 size={13} class="spin" />{:else}↻{/if}
              </button>
            </div>
          {#if isLoading}
            <div class="ov-activity-feed">
              {#each [1, 2, 3, 4] as _}
                <div class="ov-act-row">
                  <div class="ov-skeleton shimmer" style="width: 28px; height: 28px; border-radius: 7px;"></div>
                  <div class="ov-act-body">
                    <div class="ov-skeleton shimmer" style="height: 12px; width: 70%;"></div>
                    <div class="ov-skeleton shimmer" style="height: 11px; width: 45%;"></div>
                  </div>
                </div>
              {/each}
            </div>
          {:else if isLoadingActivity}
            <div class="ov-empty"><Loader2 size={14} class="spin" /> Loading activity…</div>
          {:else if overviewActivity.length === 0}
            <div class="ov-empty">No recent activity found.</div>
          {:else}
            <div class="ov-activity-feed">
              {#each overviewActivity as act}
                {@const proj = projects.find(p => p.proj_id === act.proj_id || p.id === act.proj_id)}
                <div class="ov-act-row">
                  <div class="ov-act-icon {act.type === 'feedback' ? 'ov-act-icon-fb' : 'ov-act-icon-ms'}">
                    {#if act.type === 'feedback'}
                      <MessageSquare size={14} />
                    {:else}
                      <Flag size={14} />
                    {/if}
                  </div>
                  <div class="ov-act-body">
                    <div class="ov-act-text">
                      {act.type === 'feedback' ? act.text : 'Milestone: ' + act.text}
                    </div>
                    <div class="ov-act-meta">
                      {#if act.proj_name || proj}
                        <span class="ov-act-proj">{act.proj_name || proj?.title || ''}</span>
                      {/if}
                      <!-- role and milestone status badges removed for cleaner activity feed -->
                      {#if act.created_at}
                        <span class="ov-act-date">{humanizeTime(act.created_at)}</span>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
          </section>

        </div>

      {/if}
    {:else if activeView === 'Projects'}
      <section class="proj-table-panel">
        <header class="proj-table-header">
          <span class="proj-col-name">Project Name</span>
          <span class="proj-col-priority">Priority</span>
          <span class="proj-col-status">Status</span>
          <span class="proj-col-due">Timeline</span>
          <span class="proj-col-actions">Actions</span>
        </header>
        {#if isLoading}
          <div class="empty-state">
            <Loader2 size={22} class="spin" />
            <span>Loading projects…</span>
          </div>
        {:else if filteredProjects.length === 0}
          <div class="empty-state">
            <FolderOpen size={32} />
            <div class="empty-title">No projects yet</div>
            <div class="empty-sub">Click "+ Add Project" to get started.</div>
            <button class="empty-cta" on:click={openAddProjectModal}>+ Add Project</button>
          </div>
        {:else}
          <div class="proj-table-body">
            {#each filteredProjects as p (p.id)}
              {@const sm = STATUS_META[p.status] || STATUS_META['Not Started']}
              {@const past = isDeadlinePast(p.timeline_end || p.deadline)}
              {@const pl = getPriorityLabel(p.priority_level) || ''}
              {@const isViewing = viewingProjectId === p.id}
              <div class="proj-table-row" class:proj-row-active={isViewing}>
                <span class="proj-col-name proj-name-cell">{p.title}</span>
                <span class="proj-col-priority">
                  <span class={"proj-priority-pill priority-" + pl.toLowerCase()}>{pl || '—'}</span>
                </span>
                <span class="proj-col-status">
                  <span class="proj-status-pill {sm.cls}">{sm.label}</span>
                </span>
                <span class="proj-col-due proj-col-timeline" class:deadline-past={past}>
                  {p.timeline_start || p.timeline_end
                    ? (p.timeline_start && p.timeline_end
                        ? `${formatDate(p.timeline_start)} — ${formatDate(p.timeline_end)}`
                        : formatDate(p.timeline_start || p.timeline_end))
                    : (p.deadline ? formatDate(p.deadline) : '—')}
                </span>
                <span class="proj-col-actions proj-actions-cell">
                  <button class="icon-btn" class:icon-btn-active={isViewing} title="View" aria-label="View" on:click={() => viewProject(p)}>
                    <Eye size={16} />
                  </button>
                  <button class="icon-btn archive" title="Archive" aria-label="Archive" on:click={() => archiveProject(p)}>
                    <Archive size={16} />
                  </button>
                </span>
              </div>

              {#if isViewing}
                    <div class="proj-detail-card">
                      <div class="proj-detail-tabs">
                        <button class="proj-detail-tab-btn" class:active={viewingProjectTab === 'Details'} on:click={() => viewingProjectTab = 'Details'}>Details</button>
                        <button class="proj-detail-tab-btn" class:active={viewingProjectTab === 'Submissions'} on:click={() => { viewingProjectTab = 'Submissions'; if (!p.folders) loadProjectFolders(p.id); }}>Submissions</button>
                        <button class="proj-detail-tab-btn" class:active={viewingProjectTab === 'Milestones'} on:click={() => { viewingProjectTab = 'Milestones'; if (!p.milestones || p.milestones === null) loadProjectMilestones(p.id); }}>Milestones</button>
                        <button class="proj-detail-tab-btn" class:active={viewingProjectTab === 'Feedback'} on:click={() => { viewingProjectTab = 'Feedback'; if (!feedbackMap[p.id]) loadFeedback(p.id); }}>Feedback</button>
                      </div>
                      <div class="proj-detail-body">
                    {#if viewingProjectTab === 'Details'}
                      {#if inlineEditId === p.id}
                        <!-- ── Inline Edit Form ───────────────────────── -->
                        <div class="inline-edit-form">
                          <div class="ief-group">
                            <label class="ief-label" for="ief-title-{p.id}">Project Title <span class="req">*</span></label>
                            <input id="ief-title-{p.id}" type="text" class="ief-input" bind:value={inlineForm.title} maxlength="120" />
                          </div>
                          <div class="ief-group">
                            <label class="ief-label" for="ief-desc-{p.id}">Description</label>
                            <textarea id="ief-desc-{p.id}" class="ief-input ief-textarea" bind:value={inlineForm.description} rows="3" maxlength="500"></textarea>
                          </div>
                          <div class="ief-row-2">
                            <div class="ief-group">
                              <label class="ief-label">Members</label>
                              <!-- svelte-ignore a11y-click-events-have-key-events -->
                              <!-- svelte-ignore a11y-no-static-element-interactions -->
                              <div class="members-input ief-input" on:click={() => showInlineMembersPanel = !showInlineMembersPanel}>
                                <div>{(inlineForm.members && inlineForm.members.length) ? inlineForm.members.map(id => MEMBER_OPTIONS.find(o => o.value === id)?.label || id).join(', ') : 'Select members'}</div>
                                <div class="muted">{(inlineForm.members || []).length}</div>
                              </div>
                              {#if showInlineMembersPanel}
                                <div class="members-panel" style="margin-top:6px">
                                  {#if usersLoading}
                                    <span class="muted" style="font-size:12px;padding:4px 8px">{assignmentEmptyMessage('intern')}</span>
                                  {:else}
                                    {#each MEMBER_OPTIONS as m}
                                      <label class="members-item">
                                        <input type="checkbox" checked={(inlineForm.members || []).includes(m.value)} on:change={() => toggleInlineMember(m.value)} />
                                        <span class="member-avatar" aria-hidden="true">
                                          {#if m.photoUrl}
                                            <img src={m.photoUrl} alt="" />
                                          {:else}
                                            <span>{m.initials}</span>
                                          {/if}
                                        </span>
                                        <span class="members-name">{m.label}</span>
                                      </label>
                                    {/each}
                                    {#if MEMBER_OPTIONS.length === 0}<span class="muted" style="font-size:12px;padding:4px 8px">{assignmentEmptyMessage('intern')}</span>{/if}
                                  {/if}
                                </div>
                              {/if}
                            </div>
                            <div class="ief-group">
                              <label class="ief-label">Supervisor</label>
                              <div class="members-input ief-input" on:click={() => showInlineSupervisorPanel = !showInlineSupervisorPanel} role="button" tabindex="0">
                                <div>{(inlineForm.supervisor && inlineForm.supervisor.length) ? inlineForm.supervisor.map(id => SUPERVISOR_OPTIONS.find(o => o.value === id)?.label || id).join(', ') : 'Select supervisor(s)'}</div>
                                <div class="muted">{(inlineForm.supervisor || []).length}</div>
                              </div>
                              {#if showInlineSupervisorPanel}
                                <div class="members-panel" style="margin-top:6px">
                                  {#if usersLoading}
                                    <span class="muted" style="font-size:12px;padding:4px 8px">{assignmentEmptyMessage('supervisor')}</span>
                                  {:else}
                                    {#each SUPERVISOR_OPTIONS as s}
                                      <label class="members-item">
                                        <input type="checkbox" checked={(inlineForm.supervisor || []).includes(s.value)} on:change={() => toggleInlineSupervisor(s.value)} />
                                        <span class="member-avatar" aria-hidden="true">
                                          {#if s.photoUrl}
                                            <img src={s.photoUrl} alt="" />
                                          {:else}
                                            <span>{s.initials}</span>
                                          {/if}
                                        </span>
                                        <span class="members-name">{s.label}</span>
                                      </label>
                                    {/each}
                                    {#if SUPERVISOR_OPTIONS.length === 0}<span class="muted" style="font-size:12px;padding:4px 8px">{assignmentEmptyMessage('supervisor')}</span>{/if}
                                  {/if}
                                </div>
                              {/if}
                            </div>
                          </div>
                          <div class="ief-row-2">
                            <div class="ief-group">
                              <label class="ief-label" for="ief-pri-{p.id}">Priority Level</label>
                              <select id="ief-pri-{p.id}" class="ief-input" bind:value={inlineForm.priority_level}>
                                {#each PRIORITY_OPTIONS as opt}<option value={opt}>{opt}</option>{/each}
                              </select>
                            </div>
                            <div class="ief-group">
                              <label class="ief-label" for="ief-sta-{p.id}">Status</label>
                              <select id="ief-sta-{p.id}" class="ief-input" bind:value={inlineForm.status}>
                                {#each STATUS_OPTIONS as opt}<option value={opt}>{opt}</option>{/each}
                              </select>
                            </div>
                          </div>
                          <div class="ief-row-2">
                            <div class="ief-group">
                              <label class="ief-label" for="ief-ts-{p.id}">Timeline (Start)</label>
                              <input id="ief-ts-{p.id}" type="date" class="ief-input" bind:value={inlineForm.timeline_start} />
                            </div>
                            <div class="ief-group">
                              <label class="ief-label" for="ief-te-{p.id}">Timeline (End)</label>
                              <input id="ief-te-{p.id}" type="date" class="ief-input" bind:value={inlineForm.timeline_end} />
                            </div>
                          </div>
                          <!-- inline progress preview driven by status -->
                          <div style="margin:8px 0 0">
                            <div style="font-size:0.85rem; color:var(--color-sidebar-text); margin-bottom:6px">Progress</div>
                            <div style="display:flex; align-items:center; gap:10px; padding-right:0.5rem">
                              <div style="flex:1"><div class="progress-bar-outer"><div class="progress-bar-inner" style="width:{statusToProgress(inlineForm.status)}%"></div></div></div>
                              <div style="width:56px; text-align:right; font-weight:700">{statusToProgress(inlineForm.status)}%</div>
                            </div>
                          </div>
                          {#if formError}<div class="alert-error" style="margin:0 0 8px">{formError}</div>{/if}
                          <div class="ief-actions">
                            <button class="btn-secondary" on:click={cancelInlineEdit}>Cancel</button>
                            <button class="btn-submit" on:click={() => saveInlineEdit(p)} disabled={isSubmitting}>
                              {isSubmitting ? 'Saving…' : 'Save Changes'}
                            </button>
                          </div>
                        </div>
                      {:else}
                        <!-- ── Read View ──────────────────────────────── -->
                        <div class="proj-detail-read">
                          <!-- edit button moved to footer for consistency -->
                          <div class="pdr-group">
                            <label class="pdr-label">Project Title</label>
                            <div class="pdr-box">{p.title || '—'}</div>
                          </div>
                          <div class="pdr-group">
                            <label class="pdr-label">Description</label>
                            <div class="pdr-box pdr-box-desc">
                              <div class="detail-description" class:collapsed={expandedDescriptionId !== p.id}>{p.description || '—'}</div>
                              {#if p.description && p.description.length > 160}
                                <button class="btn-link" style="margin-top:4px" on:click={() => toggleDescription(p.id)}>{expandedDescriptionId === p.id ? 'Show less' : 'Show more'}</button>
                              {/if}
                            </div>
                          </div>
                          
                          <div class="pdr-row-2">
                            <div class="pdr-group">
                              <label class="pdr-label">Members</label>
                              <div class="pdr-box">{(p.members && p.members.length) ? p.members.map(id => MEMBER_OPTIONS.find(o => o.value === id)?.label || id).join(', ') : 'No members'}</div>
                            </div>
                            <div class="pdr-group">
                              <label class="pdr-label">Supervisor</label>
                              <div class="pdr-box">{(p.supervisors && p.supervisors.length) ? p.supervisors.map(id => SUPERVISOR_OPTIONS.find(o => o.value === id)?.label || id).join(', ') : (p.supervisor || '—')}</div>
                            </div>
                          </div>

                          <div class="pdr-row-2">
                            <div class="pdr-group">
                              <label class="pdr-label">Priority Level</label>
                              <div class="pdr-box">{getPriorityLabel(p.priority_level) || '—'}</div>
                            </div>
                            <div class="pdr-group">
                              <label class="pdr-label">Status</label>
                              <div class="pdr-box">{(STATUS_META[p.status] || {}).label || p.status || '—'}</div>
                            </div>
                          </div>

                          
                          <div class="pdr-row-2">
                            <div class="pdr-group">
                              <label class="pdr-label">Timeline (Start)</label>
                              <div class="pdr-box">{p.timeline_start ? formatDate(p.timeline_start) : '—'}</div>
                            </div>
                            <div class="pdr-group">
                              <label class="pdr-label">Timeline (End)</label>
                              <div class="pdr-box">{p.timeline_end ? formatDate(p.timeline_end) : '—'}</div>
                            </div>
                          </div>

                          <!-- progress bar (derived from status or explicit percent) -->
                          <div class="pdr-group">
                            <label class="pdr-label">Progress</label>
                            <div style="display:flex; align-items:center; gap:10px;">
                              <div style="flex:1"><div class="progress-bar-outer"><div class="progress-bar-inner" style="width:{p.progress_percent != null ? p.progress_percent : statusToProgress(p.status)}%"></div></div></div>
                              <div style="width:56px;text-align:right;font-weight:700">{p.progress_percent != null ? p.progress_percent : statusToProgress(p.status)}%</div>
                            </div>
                          </div>

                          <div class="pdr-footer">
                            <button class="sub-action-btn" on:click={() => startInlineEdit(p)}>Edit</button>
                          </div>
                        </div>
                      {/if}
                    {:else if viewingProjectTab === 'Submissions'}
                      <!-- Folders top bar -->
                      <div class="sub-action-bar">
                        <button class="sub-action-btn" disabled={isSavingFolder} on:click={() => addFolder(p.id)}>
                          {#if isSavingFolder}<Loader2 size={13} class="spin" />{:else}<FolderOpen size={13} />{/if} New Folder
                        </button>
                        <!-- Add Milestone moved to Milestones tab -->
                        {#if p.folders !== null && !isLoadingFolders}
                          <button class="sub-action-btn" title="Refresh folders" on:click={() => loadProjectFolders(p.id)}>
                            🔄
                          </button>
                        {/if}
                      </div>

                      {#if isLoadingFolders}
                        <div class="proj-detail-empty" style="padding:1rem 1.25rem">
                          <Loader2 size={18} class="spin" /> Loading folders…
                        </div>
                      {:else if !p.folders || p.folders.length === 0}
                        <div class="proj-detail-empty" style="padding:1rem 1.25rem">No folders yet. Click <strong>New Folder</strong> to get started.</div>
                      {:else}
                        

                        <div class="folder-list">
                          {#each p.folders as folder (folder.id)}
                            <div class="folder-block">
                              <!-- Folder header -->
                              <!-- svelte-ignore a11y-click-events-have-key-events -->
                              <!-- svelte-ignore a11y-no-static-element-interactions -->
                              <div class="folder-header" on:click={() => { if (renamingFolderId !== folder.id) toggleFolder(folder.id); }}>
                                <span class="folder-chevron">{expandedFolderIds.has(folder.id) ? '▾' : '▸'}</span>
                                <span class="folder-icon">📁</span>
                                {#if renamingFolderId === folder.id}
                                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                                  <input
                                    class="folder-rename-input"
                                    bind:value={renamingFolderName}
                                    on:click|stopPropagation
                                    on:keydown={(e) => { if (e.key === 'Enter') confirmRename(p.id); if (e.key === 'Escape') { renamingFolderId = null; } }}
                                  />
                                  <button class="folder-rename-confirm" on:click|stopPropagation={() => confirmRename(p.id)}>✓</button>
                                {:else}
                                  <span class="folder-name">{folder.name}</span>
                                  <button class="folder-action-btn" title="Rename" on:click|stopPropagation={() => startRenaming(folder.id, folder.name)}><Pencil size={12} /></button>
                                  <button class="folder-action-btn folder-delete-btn" title="Delete folder" on:click|stopPropagation={() => deleteFolder(p.id, folder.id)}><Trash2 size={12} /></button>
                                {/if}
                              </div>

                              <!-- Folder content -->
                              {#if expandedFolderIds.has(folder.id)}
                                <div class="folder-content">
                                  <!-- Action bar inside folder -->
                                  <div class="sub-action-bar" style="padding:0.6rem 0.75rem;">
                                    <input id={"proj-file-input-" + p.id + "-" + folder.id} type="file" on:change={(e) => handleFileSelect(p.id, folder.id, e)} style="display:none" />
                                    <button class="sub-action-btn" on:click={() => triggerFilePicker(p.id, folder.id)}>
                                      <ExternalLink size={13} /> Upload File
                                    </button>
                                    <button class="sub-action-btn" class:sub-action-btn-active={activeLinkFolderId === folder.id} on:click={() => toggleLinkPanel(folder.id)}>
                                      <Link2 size={13} /> Add Link
                                    </button>
                                  </div>

                                  <!-- Add Link form -->
                                  {#if activeLinkFolderId === folder.id}
                                    <div class="add-link-form">
                                      <input class="sub-input" placeholder="Label  e.g. GitHub Repository" bind:value={viewingLinkLabel} />
                                      <input class="sub-input" placeholder="https://example.com" bind:value={viewingLinkUrl} />
                                      <div class="add-link-actions">
                                        <button class="sub-action-btn" on:click={() => addLinkSubmission(p.id, folder.id)}>Save Link</button>
                                        <button class="sub-cancel-btn" on:click={() => toggleLinkPanel(folder.id)}>Cancel</button>
                                      </div>
                                      {#if formError}<div class="sub-error">{formError}</div>{/if}
                                    </div>
                                  {/if}

                                  <!-- Pending upload preview -->
                                  {#if pendingUpload.projectId === p.id && pendingUpload.folderId === folder.id && pendingUpload.file}
                                    <div class="submission-card pending-upload" style="margin:0.5rem 0.75rem;">
                                      <div class="submission-card-left">
                                        <div class="sub-file-icon">📄</div>
                                        <div class="submission-meta">
                                          <input class="sub-input" bind:value={pendingUpload.name} placeholder="File name" />
                                          <select class="sub-input" bind:value={pendingUpload.type}>
                                            {#each FILE_TYPE_OPTIONS as t}<option value={t}>{t}</option>{/each}
                                          </select>
                                          <div class="submission-info">Selected: {pendingUpload.file ? pendingUpload.file.name : ''} ({pendingUpload.file ? (pendingUpload.file.size / (1024*1024)).toFixed(2) + ' MB' : ''})</div>
                                        </div>
                                      </div>
                                      <div class="submission-actions">
                                        <button class="sub-action-btn" disabled={isUploadingFile} on:click={() => confirmUpload(p.id, folder.id)}>
                                          {#if isUploadingFile}<Loader2 size={13} class="spin" /> Uploading…{:else}Upload{/if}
                                        </button>
                                        <button class="sub-cancel-btn" disabled={isUploadingFile} on:click={cancelPendingUpload}>Cancel</button>
                                      </div>
                                    </div>
                                  {/if}

                                  <!-- Submissions list -->
                                  {#if folder.submissions && folder.submissions.length > 0}
                                    <div class="submissions-list" style="padding:0 0.75rem 0.75rem;">
                                      {#each folder.submissions as s}
                                        {#if s.kind === 'file'}
                                          <div class="submission-card">
                                            <div class="submission-card-left">
                                              <div class="sub-file-icon">📄</div>
                                              <div class="submission-meta">
                                                <div class="submission-name">{s.name}</div>
                                                <div class="submission-info">Uploaded: {formatDate(s.uploaded_at)}</div>
                                              </div>
                                            </div>
                                            <div class="submission-actions">
                                              <button class="icon-btn" title="View in Drive" on:click={() => viewSubmission(s)} disabled={!s.drive_url}><Eye size={14} /></button>
                                              <button class="icon-btn" title="Open in Drive" on:click={() => downloadSubmission(s)} disabled={!s.drive_url}><Download size={14} /></button>
                                              <button class="icon-btn" title="Delete" on:click={() => deleteSubmission(p.id, folder.id, s.id)}><Trash2 size={14} /></button>
                                            </div>
                                          </div>
                                        {:else}
                                          <div class="submission-card link-card">
                                            <div class="link-card-body">
                                              <div class="link-card-title">🔗 {s.title}</div>
                                              <div class="link-card-url">{s.url}</div>
                                              <div class="submission-info">Added: {formatDate(s.added_at)}</div>
                                            </div>
                                            <div class="submission-actions">
                                              <button class="sub-open-btn" on:click={() => viewSubmission(s)}>Open Link</button>
                                              <button class="icon-btn" title="Delete" on:click={() => deleteSubmission(p.id, folder.id, s.id)}><Trash2 size={14} /></button>
                                            </div>
                                          </div>
                                        {/if}
                                      {/each}
                                    </div>
                                  {:else}
                                    <div class="proj-detail-empty" style="padding:0.5rem 0.75rem 0.75rem">No files or links in this folder yet.</div>
                                  {/if}
                                </div>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      {/if}
                    <!-- Progress Logs tab removed; progress is shown inline in Details -->
                    {:else if viewingProjectTab === 'Milestones'}
                      <div style="margin-bottom:8px">
                        <div style="display:flex;gap:8px;align-items:center">
                          <button class="add-milestone-btn" on:click={() => toggleAddMilestone(p.id)}>
                            <span class="icon">➕</span> Add Milestone
                          </button>
                        </div>
                        {#if showAddMilestoneFor[p.id]}
                          <div class="add-milestone-bar" style="padding:0.5rem 0.75rem; display:flex; gap:8px; align-items:center; margin-top:8px">
                            <input type="text" placeholder="Milestone" value={newMilestoneInputs[p.id]?.milestone || ''} on:input={(e) => { newMilestoneInputs = { ...newMilestoneInputs, [p.id]: { ...(newMilestoneInputs[p.id] || {}), milestone: e.target.value } }; }} class="input" />
                            <input type="date" value={newMilestoneInputs[p.id]?.date || ''} on:input={(e) => { newMilestoneInputs = { ...newMilestoneInputs, [p.id]: { ...(newMilestoneInputs[p.id] || {}), date: e.target.value } }; }} class="input" style="width:170px" />
                            <button class="sub-action-btn" on:click={() => createMilestone(p.id)}>Save</button>
                            <button class="sub-cancel-btn" on:click={() => { showAddMilestoneFor = { ...showAddMilestoneFor, [p.id]: false }; }}>Cancel</button>
                          </div>
                        {/if}
                      </div>
                      {#if p.milestones && p.milestones.length > 0}
                        <div class="milestone-list">
                          {#each p.milestones as m}
                            <div class="ms-card" class:ms-expanded={expandedMilestoneIds.has(m.id)}>
                              <!-- ── Collapsed header (always visible) ── -->
                              <div class="ms-header" on:click={() => toggleMilestoneExpand(m.id)} role="button" tabindex="0" on:keydown={(e)=>{ if(e.key==='Enter'||e.key===' ') toggleMilestoneExpand(m.id); }}>
                                <span class={"ms-icon " + (STATUS_META[m.status]?.cls || STATUS_META['Not Started'].cls)}></span>
                                <span class="ms-title">{m.milestone}</span>
                                {#if m.date}<span class="ms-due">Due: {formatDate(m.date)}</span>{/if}
                                <span class="ms-chevron">{expandedMilestoneIds.has(m.id) ? '▲' : '▼'}</span>
                              </div>

                              <!-- ── Expanded body ── -->
                              {#if expandedMilestoneIds.has(m.id)}
                                <div class="ms-body">
                                  <!-- Linked files list -->
                                  {#if parseMilestoneFiles(m).length > 0}
                                    <div class="ms-linked-section">
                                      <div class="ms-linked-label">Linked Files:</div>
                                      <ul class="ms-linked-list">
                                        {#each parseMilestoneFiles(m) as lf}
                                          <li class="ms-linked-item">
                                            <span>📄 {lf.name}</span>
                                            {#if lf.drive_url}<a href={lf.drive_url} target="_blank" rel="noopener" class="ms-open-link">Open</a>{/if}
                                            {#if editingMilestoneId === m.id}
                                              <button class="ms-unlink-btn" title="Unlink" on:click={() => toggleMilestoneFile(p.id, m.id, lf)}>✕</button>
                                            {/if}
                                          </li>
                                        {/each}
                                      </ul>
                                    </div>
                                  {:else}
                                    <div class="ms-no-links">No linked files yet.</div>
                                  {/if}

                                  <!-- Action bar: read-only in view mode, controls in edit mode -->
                                  <div class="ms-actions">
                                    {#if editingMilestoneId === m.id}
                                      <button class="sub-action-btn" on:click={() => toggleMilestoneFilePicker(m.id)}>
                                        📎 {milestoneFilePicker[m.id] ? 'Close Picker' : 'Link Files'}
                                      </button>
                                      <select class="status-select" value={editingMilestoneInputs[m.id]?.status || m.status || 'Not Started'}
                                        on:change={async (e) => {
                                          const v = String(e.target.value || 'Not Started');
                                          // keep local edit input in sync
                                          editingMilestoneInputs = { ...editingMilestoneInputs, [m.id]: { ...(editingMilestoneInputs[m.id] || {}), status: v } };
                                          await changeMilestoneStatus(p.id, m.id, v);
                                        }}>
                                        {#each STATUS_OPTIONS as so}
                                          <option>{so}</option>
                                        {/each}
                                      </select>
                                      <div style="flex:1"></div>
                                      <button class="sub-action-btn" on:click={() => startEditMilestone(p.id, m)}>Edit</button>
                                      <button class="sub-cancel-btn" on:click={() => deleteMilestone(p.id, m.id)}>Delete</button>
                                    {:else}
                                      <!-- view-only: show status pill matching project status style -->
                                      <span class={"proj-status-pill " + (STATUS_META[m.status]?.cls || STATUS_META['Not Started'].cls)}>{STATUS_META[m.status]?.label || STATUS_META['Not Started'].label}</span>
                                      <div style="flex:1"></div>
                                      <button class="sub-action-btn" on:click={() => startEditMilestone(p.id, m)}>Edit</button>
                                      <button class="sub-cancel-btn" on:click={() => deleteMilestone(p.id, m.id)}>Delete</button>
                                    {/if}
                                  </div>

                                  <!-- Edit form -->
                                  {#if editingMilestoneId === m.id}
                                    <div class="add-milestone-bar" style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                                      <input class="input" type="text" value={editingMilestoneInputs[m.id]?.milestone || ''} on:input={(e) => { editingMilestoneInputs = { ...editingMilestoneInputs, [m.id]: { ...(editingMilestoneInputs[m.id] || {}), milestone: e.target.value } }; }} placeholder="Milestone" />
                                      <input class="input" type="date" value={editingMilestoneInputs[m.id]?.date || ''} on:input={(e) => { editingMilestoneInputs = { ...editingMilestoneInputs, [m.id]: { ...(editingMilestoneInputs[m.id] || {}), date: e.target.value } }; }} style="width:170px" />
                                      <button class="sub-action-btn" on:click={() => saveEditedMilestone(p.id, m.id)}>Save</button>
                                      <button class="sub-cancel-btn" on:click={cancelEditMilestone}>Cancel</button>
                                    </div>
                                  {/if}

                                  <!-- File picker -->
                                  {#if milestoneFilePicker[m.id]}
                                    <div class="ms-file-picker">
                                      <div class="ms-picker-label">Select files from submissions to link:</div>
                                      {#if projectFileSubmissions(p.id).length === 0}
                                        <div class="ms-picker-empty">No files uploaded in the Submissions tab yet.</div>
                                      {:else}
                                        {#each projectFileSubmissions(p.id) as sub}
                                          <label class="ms-picker-item">
                                            <input type="checkbox"
                                              checked={!!parseMilestoneFiles(m).find(f => f.id === sub.id)}
                                              on:change={() => toggleMilestoneFile(p.id, m.id, sub)} />
                                            <span class="ms-picker-name">📄 {sub.name}</span>
                                            <span class="ms-picker-folder">{sub.folder_name}</span>
                                          </label>
                                        {/each}
                                      {/if}
                                    </div>
                                  {/if}
                                </div>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      {:else}
                        <div class="proj-detail-empty">No milestones defined yet.</div>
                      {/if}
                    {:else if viewingProjectTab === 'Feedback'}
                      <!-- ── Feedback Tab ─────────────────────────────────── -->
                      <div class="feedback-wrap">
                        {#if feedbackLoading[p.id]}
                          <div class="proj-detail-empty"><Loader2 size={16} class="spin" /> Loading feedback…</div>
                        {:else}
                          <!-- Root comment threads -->
                          {#each (feedbackMap[p.id] || []).filter(f => !f.parent_id) as thread}
                            <div class="feedback-thread">
                              <!-- Root comment row -->
                              <div class="feedback-card">
                                <div class="feedback-card-top">
                                  <span class="fb-role-badge" class:fb-badge-sup={thread.commenter_role === 'Supervisor'}>{thread.commenter_role || 'Intern'}</span>
                                  <div style="flex:1"></div>
                                  {#if thread.commenter_id === (currentUser?.user_id || getCurrentUser()?.user_id)}
                                    <button class="icon-btn" title="Delete" on:click={() => deleteFeedback(p.id, thread.feedback_id)}><Trash2 size={13}/></button>
                                  {/if}
                                </div>
                                <div class="fb-comment-text">{thread.comment_text}</div>
                                <div class="fb-actions">
                                  <button class="fb-reply-btn" on:click={() => { replyingTo = { ...replyingTo, [p.id]: replyingTo[p.id] === thread.feedback_id ? null : thread.feedback_id }; }}>↩ Reply</button>
                                </div>
                              </div>

                              {#each feedbackChildren(p.id, thread.feedback_id) as c1}
                                <div class="feedback-reply" style="margin-left:1.1rem">
                                  <div class="feedback-card-top">
                                    <span class="fb-role-badge" class:fb-badge-sup={c1.commenter_role === 'Supervisor'}>{c1.commenter_role || 'Intern'}</span>
                                    <div style="flex:1"></div>
                                    {#if c1.commenter_id === (currentUser?.user_id || getCurrentUser()?.user_id)}
                                      <button class="icon-btn" title="Delete" on:click={() => deleteFeedback(p.id, c1.feedback_id)}><Trash2 size={13}/></button>
                                    {/if}
                                  </div>
                                  <div class="fb-comment-text">{c1.comment_text}</div>
                                  <div class="fb-actions">
                                    <button class="fb-reply-btn" on:click={() => { replyingTo = { ...replyingTo, [p.id]: replyingTo[p.id] === c1.feedback_id ? null : c1.feedback_id }; }}>↩ Reply</button>
                                  </div>
                                  {#if replyingTo[p.id] === c1.feedback_id}
                                    <div class="fb-reply-compose">
                                      <textarea class="fb-reply-input" rows="2" placeholder="Write a reply…" value={replyText[p.id] || ''} on:input={(e) => { replyText = { ...replyText, [p.id]: e.target.value }; }}></textarea>
                                      <div class="fb-action-btns">
                                        <button class="sub-action-btn" on:click={() => submitReply(p.id, c1.feedback_id)}>Send</button>
                                        <button class="sub-cancel-btn" on:click={() => { replyingTo = { ...replyingTo, [p.id]: null }; }}>Cancel</button>
                                      </div>
                                    </div>
                                  {/if}

                                  {#each feedbackChildren(p.id, c1.feedback_id) as c2}
                                    <div class="feedback-reply" style="margin-left:1.1rem">
                                      <div class="feedback-card-top">
                                        <span class="fb-role-badge" class:fb-badge-sup={c2.commenter_role === 'Supervisor'}>{c2.commenter_role || 'Intern'}</span>
                                        <div style="flex:1"></div>
                                        {#if c2.commenter_id === (currentUser?.user_id || getCurrentUser()?.user_id)}
                                          <button class="icon-btn" title="Delete" on:click={() => deleteFeedback(p.id, c2.feedback_id)}><Trash2 size={13}/></button>
                                        {/if}
                                      </div>
                                      <div class="fb-comment-text">{c2.comment_text}</div>
                                      <div class="fb-actions">
                                        <button class="fb-reply-btn" on:click={() => { replyingTo = { ...replyingTo, [p.id]: replyingTo[p.id] === c2.feedback_id ? null : c2.feedback_id }; }}>↩ Reply</button>
                                      </div>
                                      {#if replyingTo[p.id] === c2.feedback_id}
                                        <div class="fb-reply-compose">
                                          <textarea class="fb-reply-input" rows="2" placeholder="Write a reply…" value={replyText[p.id] || ''} on:input={(e) => { replyText = { ...replyText, [p.id]: e.target.value }; }}></textarea>
                                          <div class="fb-action-btns">
                                            <button class="sub-action-btn" on:click={() => submitReply(p.id, c2.feedback_id)}>Send</button>
                                            <button class="sub-cancel-btn" on:click={() => { replyingTo = { ...replyingTo, [p.id]: null }; }}>Cancel</button>
                                          </div>
                                        </div>
                                      {/if}

                                      {#each feedbackChildren(p.id, c2.feedback_id) as c3}
                                        <div class="feedback-reply" style="margin-left:1.1rem">
                                          <div class="feedback-card-top">
                                            <span class="fb-role-badge" class:fb-badge-sup={c3.commenter_role === 'Supervisor'}>{c3.commenter_role || 'Intern'}</span>
                                            <div style="flex:1"></div>
                                            {#if c3.commenter_id === (currentUser?.user_id || getCurrentUser()?.user_id)}
                                              <button class="icon-btn" title="Delete" on:click={() => deleteFeedback(p.id, c3.feedback_id)}><Trash2 size={13}/></button>
                                            {/if}
                                          </div>
                                          <div class="fb-comment-text">{c3.comment_text}</div>
                                          <div class="fb-actions">
                                            <button class="fb-reply-btn" on:click={() => { replyingTo = { ...replyingTo, [p.id]: replyingTo[p.id] === c3.feedback_id ? null : c3.feedback_id }; }}>↩ Reply</button>
                                          </div>
                                          {#if replyingTo[p.id] === c3.feedback_id}
                                            <div class="fb-reply-compose">
                                              <textarea class="fb-reply-input" rows="2" placeholder="Write a reply…" value={replyText[p.id] || ''} on:input={(e) => { replyText = { ...replyText, [p.id]: e.target.value }; }}></textarea>
                                              <div class="fb-action-btns">
                                                <button class="sub-action-btn" on:click={() => submitReply(p.id, c3.feedback_id)}>Send</button>
                                                <button class="sub-cancel-btn" on:click={() => { replyingTo = { ...replyingTo, [p.id]: null }; }}>Cancel</button>
                                              </div>
                                            </div>
                                          {/if}
                                        </div>
                                      {/each}

                                    </div>
                                  {/each}

                                </div>
                              {/each}
                            </div>
                          {/each}
                          {#if !(feedbackMap[p.id] || []).filter(f => !f.parent_id).length}
                            <div class="proj-detail-empty">No feedback yet. Be the first to comment.</div>
                          {/if}
                          <!-- New root comment composer -->
                          <div class="fb-new-comment">
                            <textarea class="fb-reply-input" rows="3" placeholder="Add a comment…" value={newFeedbackText[p.id] || ''} on:input={(e) => { newFeedbackText = { ...newFeedbackText, [p.id]: e.target.value }; }}></textarea>
                            <button class="sub-action-btn" style="margin-top:6px" on:click={() => submitFeedback(p.id)}>Post Comment</button>
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </section>
    {:else if activeView === 'Archive'}
      <section class="proj-table-panel archive-view">
        <header class="proj-table-header">
          <span class="proj-col-name">Archive</span>
          <span class="proj-col-actions">Actions</span>
        </header>
        {#if archivedProjects.length === 0}
          <div class="empty-state">
            <Archive size={28} />
            <div class="empty-title">No archived projects</div>
            <div class="empty-sub">Archived projects will appear here.</div>
          </div>
        {:else}
          <div class="proj-table-body">
            {#each archivedProjects as p (p.id)}
              {@const past = isDeadlinePast(p.timeline_end || p.deadline)}
              <div class="proj-table-row proj-arc-row">
                <span class="proj-col-name proj-name-cell">
                  <div class="proj-arc-title">{p.title}</div>
                  {#if p.timeline_end || p.deadline}
                    <div class="proj-arc-meta"><CalendarDays size={14} /><span class="proj-arc-date">{formatDate(p.timeline_end || p.deadline)}</span></div>
                  {/if}
                </span>
                <div class="proj-arc-corner">
                    <button class="icon-btn restore" title="Restore project" on:click={() => restoreProject(p)}>
                      <RotateCcw size={16} />
                    </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/if}
  {/if}

  <!-- Add/Edit form moved to modal (triggered by + Add Project) -->

</section>

<!-- ── DELETE MODAL ────────────────────────────────────────────────── -->
{#if showDeleteModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-overlay" on:click={closeDeleteModal}>
    <div class="modal-box" on:click|stopPropagation>
      <div class="modal-title">Delete Project</div>
      <p class="modal-body">
        Are you sure you want to delete <strong>{projectToDelete?.title}</strong>? This cannot be undone.
      </p>
      <div class="modal-footer">
        <button class="btn-secondary" on:click={closeDeleteModal}>Cancel</button>
        <button class="btn-delete-confirm" on:click={confirmDelete} disabled={isDeleting}>
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showAddProjectModal}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-overlay" on:click={closeAddProjectModal}>
    <div class="modal-box large" on:click|stopPropagation>
      <div class="modal-title">{editingId ? 'Edit Project' : 'Add New Project'}</div>

      <div class="form-group">
        <label class="form-label" for="proj-title">Project Title <span class="req">*</span></label>
        <input id="proj-title" type="text" class="form-input" bind:value={form.title}
          placeholder="e.g. ISOC PRISM" maxlength="120" />
      </div>

      <div class="form-group">
        <label class="form-label" for="proj-desc">Description</label>
        <textarea id="proj-desc" class="form-textarea" bind:value={form.description}
          rows="3" placeholder="Brief description of the project…" maxlength="500"></textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Members</label>
        <div class="members-input form-input" on:click={() => showMembersPanel = !showMembersPanel} role="button" tabindex="0">
          <div>{(form.members && form.members.length) ? form.members.map(id => MEMBER_OPTIONS.find(o => o.value === id)?.label || id).join(', ') : 'Select members'}</div>
          <div class="muted">{(form.members || []).length}</div>
        </div>
        {#if showMembersPanel}
          <div class="members-panel" style="margin-top:8px">
            {#if usersLoading}
              <span class="muted" style="font-size:12px;padding:4px 8px">{assignmentEmptyMessage('intern')}</span>
            {:else}
              {#each MEMBER_OPTIONS as m}
                <label class="members-item">
                  <input type="checkbox" checked={(form.members || []).includes(m.value)} on:change={() => toggleMember(m.value)} />
                  <span class="member-avatar" aria-hidden="true">
                    {#if m.photoUrl}
                      <img src={m.photoUrl} alt="" />
                    {:else}
                      <span>{m.initials}</span>
                    {/if}
                  </span>
                  <span class="members-name">{m.label}</span>
                </label>
              {/each}
              {#if MEMBER_OPTIONS.length === 0}<span class="muted" style="font-size:12px;padding:4px 8px">{assignmentEmptyMessage('intern')}</span>{/if}
            {/if}
          </div>
        {/if}
      </div>

      <div class="form-group">
        <label class="form-label">Supervisor</label>
        <div class="members-input form-input" on:click={() => showSupervisorsPanel = !showSupervisorsPanel} role="button" tabindex="0">
          <div>{(form.supervisor && form.supervisor.length) ? form.supervisor.map(id => SUPERVISOR_OPTIONS.find(o => o.value === id)?.label || id).join(', ') : 'Select supervisor(s)'}</div>
          <div class="muted">{(form.supervisor || []).length}</div>
        </div>
        {#if showSupervisorsPanel}
          <div class="members-panel" style="margin-top:8px">
            {#if usersLoading}
              <span class="muted" style="font-size:12px;padding:4px 8px">{assignmentEmptyMessage('supervisor')}</span>
            {:else}
              {#each SUPERVISOR_OPTIONS as s}
                <label class="members-item">
                  <input type="checkbox" checked={(form.supervisor || []).includes(s.value)} on:change={() => toggleSupervisor(s.value)} />
                  <span class="member-avatar" aria-hidden="true">
                    {#if s.photoUrl}
                      <img src={s.photoUrl} alt="" />
                    {:else}
                      <span>{s.initials}</span>
                    {/if}
                  </span>
                  <span class="members-name">{s.label}</span>
                </label>
              {/each}
              {#if SUPERVISOR_OPTIONS.length === 0}<span class="muted" style="font-size:12px;padding:4px 8px">{assignmentEmptyMessage('supervisor')}</span>{/if}
            {/if}
          </div>
        {/if}
      </div>

      <div class="row-2">
        <div class="form-group">
          <label class="form-label" for="proj-priority">Priority Level</label>
          <select id="proj-priority" class="form-input" bind:value={form.priority_level}>
            {#each PRIORITY_OPTIONS as opt}
              <option value={opt}>{opt}</option>
            {/each}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="proj-status">Status</label>
          <select id="proj-status" class="form-input" bind:value={form.status}>
            {#each STATUS_OPTIONS as opt}
              <option value={opt}>{opt}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="row-2">
        <div class="form-group">
          <label class="form-label" for="proj-timeline-start">Timeline (Start)</label>
          <input id="proj-timeline-start" type="date" class="form-input" bind:value={form.timeline_start} />
        </div>
        <div class="form-group">
          <label class="form-label" for="proj-timeline-end">Timeline (End)</label>
          <input id="proj-timeline-end" type="date" class="form-input" bind:value={form.timeline_end} />
        </div>
      </div>

      <!-- Project Link removed; members used instead -->

      {#if formError}
        <div class="alert-error">{formError}</div>
      {/if}

      <div class="modal-footer">
        <button class="btn-secondary" on:click={closeAddProjectModal}>Cancel</button>
        <button class="btn-submit" on:click={submitProject} disabled={isSubmitting || !isFormValid}>
          {#if isSubmitting}
            <Loader2 size={14} class="spin" /> Saving…
          {:else}
            {editingId ? 'Save Changes' : 'Add Project'}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

 

<style>
  .projects-page { padding: 8px 0 14px; display: flex; flex-direction: column; gap: 14px; }

  /* ── Stat Cards ── */
  .stat-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 0; }
  .stat-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03);
    padding: 18px 20px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    transition: box-shadow 0.2s, transform 0.2s;
  }
  :global(body.dark) .stat-card {
    background: #161c27;
    border-color: rgba(255, 255, 255, 0.06);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  }
  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  }
  :global(body.dark) .stat-card:hover {
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
  }
  .stat-icon {
    width: 40px; height: 40px; border-radius: 10px;
    display: grid; place-items: center;
    flex-shrink: 0;
  }
  .stat-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .tone-blue {
    background: rgba(37, 99, 235, 0.12);
    color: #2563eb;
  }
  .tone-green {
    background: rgba(22, 163, 74, 0.12);
    color: #16a34a;
  }
  .tone-amber {
    background: rgba(217, 119, 6, 0.12);
    color: #d97706;
  }
  :global(body.dark) .tone-blue {
    background: rgba(59, 130, 246, 0.18);
    color: #60a5fa;
  }
  :global(body.dark) .tone-green {
    background: rgba(34, 197, 94, 0.14);
    color: #22c55e;
  }
  :global(body.dark) .tone-amber {
    background: rgba(245, 158, 11, 0.12);
    color: #f59e0b;
  }
  .stat-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #000000;
  }
  :global(body.dark) .stat-label {
    color: #ffffff;
  }
  .stat-value {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.8px;
    line-height: 1;
    color: #0f172a;
  }
  :global(body.dark) .stat-value {
    color: #f1f5f9;
  }
  .stat-sub {
    margin-top: 4px;
    font-size: 11.5px;
    color: #64748b;
  }
  :global(body.dark) .stat-sub {
    color: #94a3b8;
  }
  @media (max-width: 1080px) {
    .stat-cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 680px) {
    .stat-cards {
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .stat-card {
      padding: 16px;
    }
  }

  /* ── Tabs ── */
  .tab-row { display: flex; gap: 4px; border-bottom: 1px solid var(--color-border); padding-bottom: 1px; }
  .tab-btn {
    display: flex; align-items: center;
    padding: 8px 14px; font-size: 13px; font-weight: 500;
    color: var(--color-sidebar-text); background: transparent;
    border: none; border-bottom: 2px solid transparent;
    cursor: pointer; transition: all .15s;
  }
  .tab-btn:hover  { color: var(--color-text); }
  .tab-btn.active { color: #2563eb; border-bottom-color: #2563eb; }

  /* ── Alerts ── */
  .alert-success {
    padding: 10px 14px; border-radius: 8px;
    background: #f0fdf4; border: 1px solid #bbf7d0;
    color: #15803d; font-size: 13px;
  }
  .alert-error {
    padding: 10px 14px; border-radius: 8px;
    background: #fef2f2; border: 1px solid #fecaca;
    color: #dc2626; font-size: 13px;
  }
  :global(body.dark) .alert-success { background: #052e16; border-color: #166534; color: #4ade80; }
  :global(body.dark) .alert-error   { background: #2d0a0a; border-color: #7f1d1d; color: #f87171; }


  

  /* ── Projects table card ── */
  .proj-table-panel {
    overflow: hidden;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.9rem;
    margin-top: 1rem;
  }
  :global(body.dark) .proj-table-panel { background: #0d1117 !important; border-color: #ffffff0f !important; }

  .proj-table-header {
    display: grid;
    grid-template-columns: minmax(0,1fr) 7.5rem 7.5rem 12rem 6.5rem;
    align-items: center;
    gap: 0.9rem;
    padding: 0.85rem 1rem;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    color: var(--color-heading);
    font-size: 0.88rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  /* Archive view header narrower layout to align Actions with corner button */
  .proj-table-panel.archive-view .proj-table-header {
    grid-template-columns: minmax(0,1fr) 3.5rem;
  }
  :global(body.dark) .proj-table-header { background: #161c27 !important; border-bottom-color: #ffffff0f !important; color: #e5edf8 !important; }

  .proj-table-body { display: grid; background: var(--color-soft); padding: 0.4rem; gap: 0.4rem; }
  :global(body.dark) .proj-table-body { background: #0d1117 !important; }

  .proj-table-row {
    display: grid;
    grid-template-columns: minmax(0,1fr) 7.5rem 7.5rem 12rem 6.5rem;
    align-items: center;
    gap: 0.9rem;
    padding: 0.85rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: 0.65rem;
    background: var(--color-surface);
    transition: border-color 140ms ease, box-shadow 140ms ease;
  }
  .proj-table-row:hover { border-color: var(--color-accent); box-shadow: 0 8px 22px -20px rgba(15,23,42,.35); }
  :global(body.dark) .proj-table-row { background: #161c27 !important; border-color: #ffffff0f !important; }

  .proj-name-cell { font-size: 0.88rem; font-weight: 600; color: var(--color-heading); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  :global(body.dark) .proj-name-cell { color: #e5edf8 !important; }

  .proj-status-pill {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 0.22rem 0.6rem; border-radius: 999px;
    font-size: 0.78rem; font-weight: 700; color: var(--color-text);
    background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04);
  }
  .proj-status-pill.status-not-started { background: rgba(249,115,22,0.08); color: #f38f49; border-color: rgba(249,115,22,0.12); }
  .proj-status-pill.status-in-progress { background: rgba(16,185,129,0.08); color: #10b981; border-color: rgba(16,185,129,0.12); }
  .proj-status-pill.status-review { background: rgba(239,68,68,0.08); color: #ef4444; border-color: rgba(239,68,68,0.12); }
  .proj-status-pill.status-completed { background: rgba(59,130,246,0.08); color: #3b82f6; border-color: rgba(59,130,246,0.12); }
  .proj-status-pill.status-submitted { background: rgba(124,58,237,0.08); color: #7c3aed; border-color: rgba(124,58,237,0.12); }
  .proj-status-pill.status-needs-revision { background: rgba(239,68,68,0.08); color: #ef4444; border-color: rgba(239,68,68,0.12); }
  .proj-status-pill.status-approved { background: rgba(16,185,129,0.08); color: #10b981; border-color: rgba(16,185,129,0.12); }
  .proj-status-pill.status-pending { background: rgba(251,146,60,0.10); color: #ea7a1e; border-color: rgba(251,146,60,0.18); }

  /* center non-name header labels */
  .proj-table-header > .proj-col-priority,
  .proj-table-header > .proj-col-status,
  .proj-table-header > .proj-col-due,
  .proj-table-header > .proj-col-actions {
    justify-self: center;
    text-align: center;
    color: var(--color-heading);
  }

  .proj-col-due { font-size: 0.83rem; color: var(--color-sidebar-text); }
  .proj-col-due.deadline-past { color: #dc2626; }

  .proj-col-timeline { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }

  /* ── Inline detail card ── */
  .proj-row-active { border-color: var(--color-accent) !important; border-bottom-left-radius: 0 !important; border-bottom-right-radius: 0 !important; }
  .proj-detail-card {
    background: var(--color-surface);
    border: 1px solid var(--color-accent);
    border-top: none;
    border-radius: 0 0 0.65rem 0.65rem;
    overflow: hidden;
  }
  :global(body.dark) .proj-detail-card { background: #161c27 !important; border-color: #3b82f6 !important; }

  .proj-detail-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-soft);
    padding: 0 1rem;
  }
  :global(body.dark) .proj-detail-tabs { background: #0d1117 !important; border-bottom-color: #ffffff0f !important; }

  .proj-detail-tab-btn {
    padding: 0.6rem 1rem;
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--color-sidebar-text);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
  }
  .proj-detail-tab-btn:hover { color: var(--color-heading); }
  .proj-detail-tab-btn.active { color: #3b82f6; border-bottom-color: #3b82f6; font-weight: 600; }

  .proj-detail-body { padding: 1rem 1.25rem; min-height: 5rem; }
  .proj-detail-empty { font-size: 0.83rem; color: var(--color-muted, var(--color-sidebar-text)); }

  .icon-btn-active { background: rgba(59,130,246,0.12) !important; color: #3b82f6 !important; }

  /* ── Submissions UI ── */
  .sub-action-bar { display:flex; gap:0.5rem; padding:0.75rem 1.25rem 0.5rem; }

  .sub-action-btn {
    display:inline-flex; align-items:center; gap:0.35rem;
    padding:0.38rem 0.85rem; border-radius:0.45rem;
    font-size:0.82rem; font-weight:500;
    background: var(--color-surface); border:1px solid var(--color-border);
    color:var(--color-heading); cursor:pointer;
    transition:background 0.15s, border-color 0.15s;
  }
  .sub-action-btn:hover { background: var(--color-soft); border-color: var(--color-accent); }
  .sub-action-btn-active { background:rgba(59,130,246,0.1) !important; border-color:#3b82f6 !important; color:#3b82f6 !important; }
  :global(body.dark) .sub-action-btn { background:#161c27; border-color:#ffffff10; }

  .add-link-form {
    display:flex; flex-direction:column; gap:0.5rem;
    padding:0.65rem 1.25rem 0.75rem;
    background:var(--color-soft);
    border-top:1px solid var(--color-border);
    border-bottom:1px solid var(--color-border);
  }
  :global(body.dark) .add-link-form { background:#0d1117; }
  .sub-input {
    padding:0.42rem 0.7rem; border-radius:0.4rem;
    border:1px solid var(--color-border);
    background:var(--color-surface); color:var(--color-heading);
    font-size:0.87rem; outline:none;
  }
  .sub-input:focus { border-color:#3b82f6; }
  .add-link-actions { display:flex; gap:0.5rem; align-items:center; }
  .sub-cancel-btn { font-size:0.82rem; color:var(--color-sidebar-text); background:transparent; border:none; cursor:pointer; padding:0.38rem 0.5rem; }
  .sub-cancel-btn:hover { color:var(--color-heading); }
  .sub-error { font-size:0.82rem; color:#ef4444; }

  .submissions-list { display:flex; flex-direction:column; gap:0.6rem; padding:0.75rem 1.25rem 1rem; }

  /* Milestones add bar styling */
  .add-milestone-bar { background: var(--color-surface); border:1px solid var(--color-border); padding:0.6rem; border-radius:8px; align-items:center; }
  .add-milestone-bar .input { padding:0.45rem 0.75rem; border-radius:6px; border:1px solid var(--color-border); background:var(--color-surface); color:var(--color-heading); font-size:0.87rem; font-family:inherit; }
  .add-milestone-btn { display:inline-flex; align-items:center; gap:0.5rem; padding:0.4rem 0.9rem; border-radius:8px; background:transparent; border:1px solid var(--color-border); color:var(--color-heading); font-size:0.87rem; font-family:inherit; }
  .add-milestone-btn .icon { color:#7c3aed; }
  .add-milestone-bar .btn-primary { background:linear-gradient(90deg,#7c3aed,#6d28d9); color:#fff; border:none; font-size:0.87rem; font-family:inherit; }

  /* Status dropdown styling to match action buttons */
  .status-select {
    appearance: none; -webkit-appearance: none; -moz-appearance: none;
    /* match the read-only pill sizing and font */
    padding:0.12rem 0.6rem; border-radius:0.45rem; border:1px solid var(--color-border);
    background: var(--color-surface); color:var(--color-heading); font-weight:700; cursor:pointer;
    font-size:0.78rem; height:28px; min-width:96px; text-align:center; box-sizing:border-box; font-family:inherit;
    -moz-text-align-last: center; text-align-last: center; -webkit-text-align-last: center;
  }
  .status-select:focus { outline:none; border-color:#3b82f6; }

  /* Read-only small status pill for view mode */
  .status-pill {
    display:inline-flex; align-items:center; justify-content:center;
    padding:0.12rem 0.6rem; border-radius:0.45rem; border:1px solid rgba(255,255,255,0.06);
    background: rgba(59,130,246,0.08); color:var(--color-heading); font-weight:700;
    font-size:0.78rem; height:28px; min-width:96px; text-align:center; box-sizing:border-box;
  }
  :global(body.dark) .status-pill { background: rgba(99,102,241,0.12); border-color: #ffffff20; color:#fff; }

  /* Milestone text to match Details labels */
  .milestone-text { font-size: 0.88rem; font-family: inherit; color: var(--color-text); }

  /* Ensure edit-mode inputs match view-mode text sizing */
  .milestone-row .input { font-size:0.88rem; font-family:inherit; }

  .submission-card {
    display:flex; justify-content:space-between; align-items:center;
    gap:0.75rem; padding:0.75rem 1rem;
    border:1px solid var(--color-border); border-radius:0.6rem;
    background:var(--color-surface);
  }
  :global(body.dark) .submission-card { background:#0f1720; border-color:#ffffff0e; }
  .submission-card-left { display:flex; align-items:center; gap:0.7rem; }
  .sub-file-icon { font-size:1.5rem; line-height:1; }
  .submission-meta { display:flex; flex-direction:column; gap:2px; }
  .submission-name { font-size:0.88rem; font-weight:600; color:var(--color-heading); }
  .submission-info { font-size:0.78rem; color:var(--color-sidebar-text); }
  .submission-actions { display:flex; gap:0.4rem; align-items:center; }

  /* Link card */
  .link-card { align-items:flex-start; }
  .link-card-body { display:flex; flex-direction:column; gap:3px; }
  .link-card-title { font-size:0.88rem; font-weight:600; color:var(--color-heading); }
  .link-card-url { font-size:0.8rem; color:#3b82f6; word-break:break-all; }
  .sub-open-btn {
    white-space:nowrap; padding:0.35rem 0.8rem; border-radius:0.4rem;
    font-size:0.8rem; font-weight:500; cursor:pointer;
    background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.3); color:#3b82f6;
    transition:background 0.15s;
  }
  .sub-open-btn:hover { background:rgba(59,130,246,0.18); }

  .pending-upload .sub-input { width: 220px; }
  .pending-upload .submission-info { font-size:0.82rem; color:var(--color-sidebar-text); }

  /* ── Folder structure ─────────────────────────────────────────────── */
  .folder-list { display:flex; flex-direction:column; gap:0.5rem; padding:0.5rem 0.75rem 0.75rem; }
  .folder-block { border:1px solid var(--color-border,#e2e8f0); border-radius:8px; overflow:hidden; }
  :global(.dark) .folder-block { border-color:rgba(255,255,255,0.09); }

  .folder-header {
    display:flex; align-items:center; gap:0.4rem;
    padding:0.55rem 0.75rem;
    cursor:pointer;
    background:var(--color-surface,#f8fafc);
    user-select:none;
    transition:background 0.15s;
  }
  .folder-header:hover { background:var(--color-hover,#f1f5f9); }
  :global(.dark) .folder-header { background:rgba(255,255,255,0.04); }
  :global(.dark) .folder-header:hover { background:rgba(255,255,255,0.08); }

  .folder-chevron { font-size:0.75rem; color:var(--color-sidebar-text); width:12px; }
  .folder-icon { font-size:1rem; line-height:1; }
  .folder-name { flex:1; font-size:0.88rem; font-weight:600; color:var(--color-text,#1e293b); }
  :global(.dark) .folder-name { color:#e2e8f0; }

  .folder-rename-input {
    flex:1; font-size:0.88rem; font-weight:600;
    background:transparent; border:none; border-bottom:1.5px solid var(--color-primary,#6366f1);
    outline:none; padding:0 0.25rem; color:var(--color-text,#1e293b);
  }
  :global(.dark) .folder-rename-input { color:#e2e8f0; border-bottom-color:#818cf8; }

  .folder-rename-confirm {
    background:none; border:none; cursor:pointer;
    color:var(--color-primary,#6366f1); font-size:1rem; padding:0 0.2rem;
  }

  .folder-action-btn {
    background:none; border:none; cursor:pointer; padding:0.15rem 0.25rem;
    color:var(--color-sidebar-text); border-radius:4px; display:flex; align-items:center;
    opacity:0; transition:opacity 0.15s;
  }
  .folder-header:hover .folder-action-btn { opacity:1; }
  .folder-delete-btn:hover { color:#ef4444; }

  .folder-content { border-top:1px solid var(--color-border,#e2e8f0); }
  :global(.dark) .folder-content { border-top-color:rgba(255,255,255,0.08); }

  /* Progress logs */
  .proj-progress-overview { background:transparent; border-top:none; padding:0.35rem 1rem; }
  .progress-bar-outer { height:10px; background:var(--color-border); border-radius:999px; overflow:hidden; }
  .progress-bar-inner { height:100%; background:linear-gradient(90deg,#10b981,#3b82f6); border-radius:999px; transition:width 350ms ease; }

  /* ── Feedback tab ──────────────────────────────────────────────────── */
  .feedback-wrap { display:flex; flex-direction:column; gap:0.75rem; padding:0.75rem 1.25rem 1rem; }

  .feedback-thread {
    border:1px solid var(--color-border); border-radius:10px;
    overflow:hidden; background:var(--color-surface);
  }
  .feedback-thread.fb-approved { border-left:3px solid #10b981; }
  .feedback-thread.fb-rejected  { border-left:3px solid #ef4444; }
  :global(body.dark) .feedback-thread { background:#0f1720; border-color:#ffffff0e; }

  .feedback-card {
    padding:0.75rem 1rem 0.6rem;
  }
  .feedback-card-top {
    display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;
    margin-bottom:0.4rem;
  }

  .feedback-reply {
    padding:0.6rem 1rem 0.6rem 1.5rem;
    border-top:1px solid var(--color-border);
    background: rgba(0,0,0,0.02);
  }
  :global(body.dark) .feedback-reply { background:rgba(255,255,255,0.02); border-top-color:#ffffff10; }

  .fb-role-badge {
    font-size:0.72rem; font-weight:700; padding:0.15rem 0.5rem;
    border-radius:999px; background:rgba(99,102,241,0.12);
    color:#6366f1; border:1px solid rgba(99,102,241,0.2);
    font-family:inherit;
  }
  .fb-badge-sup { background:rgba(16,185,129,0.12); color:#059669; border-color:rgba(16,185,129,0.22); }

  .fb-meta { font-size:0.75rem; color:var(--color-sidebar-text); font-family:inherit; }

  .fb-status-pill {
    font-size:0.72rem; font-weight:700; padding:0.12rem 0.55rem;
    border-radius:999px; border:1px solid transparent; font-family:inherit;
  }
  .fb-status-pending  { background:rgba(251,191,36,0.14); color:#b45309; border-color:rgba(251,191,36,0.3); }
  .fb-status-approved { background:rgba(16,185,129,0.14); color:#059669; border-color:rgba(16,185,129,0.3); }
  .fb-status-rejected { background:rgba(239,68,68,0.12);  color:#dc2626; border-color:rgba(239,68,68,0.25); }

  .fb-comment-text {
    font-size:0.88rem; font-family:inherit; color:var(--color-text);
    line-height:1.55; white-space:pre-wrap;
  }
  .fb-status-note {
    margin-top:0.4rem; padding:0.4rem 0.6rem;
    border-radius:6px; background:rgba(239,68,68,0.07);
    font-size:0.8rem; color:#dc2626; font-family:inherit;
  }

  .fb-actions { display:flex; gap:0.5rem; margin-top:0.5rem; flex-wrap:wrap; }
  .fb-reply-btn {
    font-size:0.78rem; background:transparent; border:1px solid var(--color-border);
    border-radius:0.4rem; color:var(--color-sidebar-text); cursor:pointer;
    padding:0.22rem 0.55rem; font-family:inherit;
    transition:background 0.15s;
  }
  .fb-reply-btn:hover { background:var(--color-hover); color:var(--color-heading); }
  /* Approve/reject UI removed */

  .fb-reply-compose {
    padding:0.55rem 1rem 0.6rem 1.5rem;
    border-top:1px solid var(--color-border);
    background:rgba(0,0,0,0.015);
  }
  :global(body.dark) .fb-reply-compose { background:rgba(255,255,255,0.015); }

  .fb-reply-input {
    resize:vertical; width:100%; font-size:0.82rem; font-family:inherit;
    border:1px solid var(--color-border); border-radius:6px;
    background:var(--color-surface); color:var(--color-heading);
    padding:0.4rem 0.6rem; outline:none; margin-bottom:6px;
    box-sizing:border-box;
  }
  .fb-reply-input:focus { border-color:#3b82f6; }

  .fb-new-comment {
    display:flex; flex-direction:column;
    padding:0.6rem 0; border-top:1px solid var(--color-border); margin-top:0.25rem;
  }

  .log-date { font-weight:600; padding:0.45rem 0.75rem; background:transparent; color:var(--color-text); font-size:0.9rem; font-family:inherit; }
  .log-date-block { margin-bottom:8px; overflow:hidden; }
  .log-entry { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; padding:0.6rem 0.75rem; border-bottom:1px solid var(--color-border); }
  .log-entry:last-child { border-bottom:none; }
  .log-entry-left { display:flex; gap:10px; align-items:flex-start; flex:1; }
  .log-check { background:transparent; color:#059669; border-radius:6px; padding:4px; font-size:0.95rem; line-height:1; border:1px solid rgba(5,150,105,0.12); display:inline-flex; align-items:center; justify-content:center; }
  .log-desc { color:var(--color-heading); font-size:0.9rem; font-family:inherit; }
  .log-entry-right { display:flex; gap:8px; align-items:center; }

  /* Milestones */
  .milestone-list { display:flex; flex-direction:column; gap:8px; padding:0.5rem 0.75rem; }
  .milestone-row { display:flex; align-items:center; justify-content:space-between; padding:0.6rem 0.75rem; border-radius:8px; background:transparent; }
  .milestone-left { display:flex; gap:12px; align-items:center; }
  .milestone-icon { width:30px; height:30px; display:grid; place-items:center; border-radius:6px; font-size:0.95rem; }
  .milestone-icon { border:1px solid rgba(255,255,255,0.04); }
  .milestone-title { font-size:0.95rem; font-weight:600; color:var(--color-heading); }
  .milestone-due { font-size:0.88rem; color:var(--color-sidebar-text); }

  /* Collapsible milestone cards */
  .ms-card { border:1px solid var(--color-border,rgba(255,255,255,0.08)); border-radius:10px; overflow:hidden; background:var(--color-card,rgba(255,255,255,0.03)); }
  .ms-header { display:flex; align-items:center; gap:10px; padding:0.6rem 0.9rem; cursor:pointer; user-select:none; }
  .ms-header:hover { background:rgba(255,255,255,0.04); }
  /* small neutral status indicator */
  .ms-icon { width:12px; height:12px; display:inline-block; border-radius:50%; border:1px solid rgba(255,255,255,0.06); background:transparent; box-shadow: none; }
  .ms-icon.status-not-started { background: rgba(249,115,22,0.06); border-color: rgba(249,115,22,0.08); }
  .ms-icon.status-in-progress { background: rgba(16,185,129,0.06); border-color: rgba(16,185,129,0.08); }
  .ms-icon.status-submitted { background: rgba(124,58,237,0.06); border-color: rgba(124,58,237,0.08); }
  .ms-icon.status-needs-revision { background: rgba(239,68,68,0.06); border-color: rgba(239,68,68,0.08); }
  .ms-icon.status-approved { background: rgba(59,130,246,0.06); border-color: rgba(59,130,246,0.08); }
  .ms-title { flex:1; font-size:0.95rem; font-weight:600; color:var(--color-heading); }
  .ms-due { font-size:0.82rem; color:var(--color-sidebar-text); white-space:nowrap; }
  .ms-chevron { font-size:0.75rem; color:var(--color-sidebar-text); margin-left:4px; }
  .ms-body { padding:0.6rem 0.9rem 0.75rem; border-top:1px solid var(--color-border,rgba(255,255,255,0.06)); display:flex; flex-direction:column; gap:10px; }
  .ms-linked-section { display:flex; flex-direction:column; gap:4px; }
  .ms-linked-label { font-size:0.85rem; font-weight:600; color:var(--color-heading); }
  .ms-linked-list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:4px; }
  .ms-linked-item { display:flex; align-items:center; gap:8px; font-size:0.85rem; color:var(--color-heading); }
  .ms-open-link { font-size:0.78rem; color:var(--color-link,#60a5fa); text-decoration:none; }
  .ms-open-link:hover { text-decoration:underline; }
  .ms-unlink-btn { background:none; border:none; cursor:pointer; color:var(--color-muted,#9ca3af); font-size:0.75rem; padding:0 2px; }
  .ms-no-links { font-size:0.82rem; color:var(--color-sidebar-text); }
  .ms-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .ms-file-picker { border:1px solid var(--color-border,rgba(255,255,255,0.08)); border-radius:8px; padding:0.6rem 0.8rem; display:flex; flex-direction:column; gap:6px; background:var(--color-bg-alt,rgba(0,0,0,0.15)); }
  .ms-picker-label { font-size:0.83rem; font-weight:600; color:var(--color-heading); }
  .ms-picker-empty { font-size:0.82rem; color:var(--color-sidebar-text); }
  .ms-picker-item { display:flex; align-items:center; gap:8px; cursor:pointer; padding:3px 0; }
  .ms-picker-item input[type=checkbox] { accent-color:var(--color-primary,#6366f1); cursor:pointer; }
  .ms-picker-name { font-size:0.85rem; color:var(--color-heading); flex:1; }
  .ms-picker-folder { font-size:0.75rem; color:var(--color-sidebar-text); }

  /* Details grid */
  .proj-detail-grid { display:grid; grid-template-columns: 1fr; gap:0.75rem; padding:1rem 1.25rem; }
  .proj-detail-grid.small-details { font-size: 0.9rem; }
  .detail-description { white-space:pre-wrap; }
  .detail-description.collapsed { display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
  .btn-link { background:none; border:0; color:var(--color-link); cursor:pointer; padding:0; font-size:0.9rem }
  .detail-row-two { display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-left:0.5rem; }
  .detail-row-full { display:block; }
  .detail-item { display:flex; flex-direction:column; gap:6px; }
  .detail-label { font-size:0.85rem; color:var(--color-sidebar-text); font-weight:600; }
  .detail-value { font-size:0.95rem; color:var(--color-heading); font-weight:600; }
  .boxed { background: var(--color-surface-muted); border:1px solid var(--color-border); border-radius:8px; padding:10px 12px; box-sizing:border-box; }
  .detail-value.title { font-size:1.05rem; }
  .detail-value.description { color:var(--color-text); font-weight:500; line-height:1.45; }
  /* link and muted helpers may be used in values */
  .meta-link { color:#60a5fa; text-decoration:underline; }
  .muted { color:var(--color-sidebar-text); font-weight:500; }
  .detail-value.timeline { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ── Inline Edit Form (Details tab) ────────────────── */
  .inline-edit-form { padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
  .ief-group { display: flex; flex-direction: column; gap: 0.3rem; }
  .ief-label { font-size: 0.8rem; font-weight: 600; color: var(--color-sidebar-text); }
  .ief-input {
    font-size: 0.88rem; font-family: inherit; color: var(--color-text);
    background: var(--color-surface-muted); border: 1px solid var(--color-border);
    border-radius: 7px; padding: 0.42rem 0.7rem; width: 100%; box-sizing: border-box;
    transition: border-color 0.15s;
  }
  .ief-input:focus { outline: none; border-color: #3b82f6; }
  .ief-textarea { resize: vertical; min-height: 72px; }
  .ief-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .ief-actions { display: flex; justify-content: flex-end; gap: 0.5rem; padding-top: 0.25rem; }

  /* ── Details Read View ──────────────────────────────── */
  .proj-detail-read { padding: 0.75rem 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
  .pdr-header { display: flex; justify-content: flex-end; margin-bottom: 0; }
  .pdr-group { display: flex; flex-direction: column; gap: 0.3rem; }
  .pdr-label { font-size: 0.8rem; font-weight: 600; color: var(--color-sidebar-text); }
  .pdr-box {
    font-size: 0.88rem; font-family: inherit; color: var(--color-text);
    background: var(--color-surface-muted); border: 1px solid var(--color-border);
    border-radius: 7px; padding: 0.42rem 0.7rem; width: 100%; box-sizing: border-box;
    min-height: 2.1rem;
  }
  .pdr-box-desc { white-space: pre-wrap; line-height: 1.45; min-height: 4rem; }
  .pdr-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .progress-bar-outer { height:10px; background:var(--color-border); border-radius:999px; overflow:hidden; }
  .progress-bar-inner { height:100%; background:linear-gradient(90deg,#10b981,#3b82f6); border-radius:999px; transition:width 350ms ease; }
  .pdr-footer { display:flex; justify-content:flex-end; margin-top:0.5rem; }

  .proj-priority-pill {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 0.22rem 0.6rem; border-radius: 999px;
    font-size: 0.78rem; font-weight: 700; color: var(--color-text);
    background: rgba(99,102,241,0.06); border: 1px solid rgba(99,102,241,0.12);
  }

  /* priority color variants */
  .proj-priority-pill.priority-low { background: rgba(56,189,248,0.08); color: #38bdf8; border-color: rgba(56,189,248,0.12); }
  .proj-priority-pill.priority-medium { background: rgba(16,185,129,0.08); color: #10b981; border-color: rgba(16,185,129,0.12); }
  .proj-priority-pill.priority-high { background: rgba(239,68,68,0.08); color: #ef4444; border-color: rgba(239,68,68,0.12); }

  /* center non-name row columns so pills and text align under headers */
  .proj-table-row .proj-col-priority,
  .proj-table-row .proj-col-status,
  .proj-table-row .proj-col-due,
  .proj-table-row .proj-col-actions {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  /* priority pill keeps its variant color */

  .proj-actions-cell { display: inline-flex; align-items: center; gap: 0.8rem; }
  .icon-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; border-radius: 8px; padding: 6px;
    background: var(--color-surface); border: 1px solid var(--color-border);
    color: var(--color-accent); cursor: pointer; margin: 0; transition: transform 0.12s, background 0.12s, border-color 0.12s;
  }
  .icon-btn:hover { background: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface)); border-color: var(--color-accent); transform: translateY(-1px); }
  .icon-btn.archive { background: transparent; border-color: rgba(255,255,255,0.06); color: var(--color-accent); }
  .icon-btn.restore { background: transparent; border-color: rgba(255,255,255,0.06); color: #10b981; }
  .icon-btn.restore:hover { background: rgba(16,185,129,0.1); border-color: #10b981; }

  /* ── Archive table ───────────────────────────────────────────────────── */
  .arc-table-wrap { padding: 1rem 1.25rem; }
  /* Archive row corner action positioning */
  .proj-arc-row { position: relative; }
  .proj-arc-corner { position: absolute; top: 0.5rem; right: 0.9rem; display:flex; gap:0.4rem; }
  /* Archive view header alignment */
  .proj-table-panel.archive-view .proj-table-header > .proj-col-actions { justify-self: end; padding-top: 0.4rem; }

  .proj-arc-meta { display:flex; align-items:center; gap:8px; margin-top:6px; color:var(--color-sidebar-text); font-size:0.77rem; }
  .proj-arc-date { font-weight:700; color:var(--color-heading); margin-left:2px; }
  .arc-table { width: 100%; border-collapse: collapse; }
  .arc-th { padding: 0.55rem 0.75rem; font-size: 0.78rem; font-weight: 700; color: var(--color-heading); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--color-border, rgba(255,255,255,0.08)); text-align: left; }
  .arc-th-main { width: 100%; }
  .arc-th-actions { white-space: nowrap; text-align: center; }
  .arc-row { border-bottom: 1px solid var(--color-border, rgba(255,255,255,0.05)); }
  .arc-row:last-child { border-bottom: none; }
  .arc-row:hover { background: rgba(255,255,255,0.02); }
  .arc-td { padding: 0.65rem 0.75rem; vertical-align: middle; }
  .arc-td-actions { text-align: center; }
  .arc-project-name { font-size: 0.9rem; font-weight: 600; color: var(--color-heading); }
  .arc-project-meta { font-size: 0.77rem; color: var(--color-sidebar-text); display: flex; align-items: center; gap: 4px; margin-top: 2px; }
  .icon-btn :global(svg) { display: block; }

  /* restore project-name color only; keep other column colors as defaults */
  .proj-name-cell { color: var(--color-heading); }
  .proj-action-btn {
    display: inline-flex; align-items: center; gap: 0.3rem;
    padding: 0.28rem 0.65rem; border-radius: 0.55rem;
    font-size: 0.76rem; font-weight: 600; cursor: pointer;
    border: 1px solid var(--color-border); background: var(--color-soft); color: var(--color-text);
    transition: background 120ms;
  }
  .proj-action-btn:hover { background: var(--color-hover); }
  .proj-action-btn.danger { background: #2d0a0a; border-color: #7f1d1d; color: #f87171; }
  .proj-action-btn.danger:hover { background: #3d1010; }

  /* legacy project-list rows */

  .priority-badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 8px; border-radius: 20px; font-size: 10.5px; font-weight: 600;
    border: 1px solid;
  }

  .status-badge {
    display: inline-block; padding: 3px 9px;
    border-radius: 20px; font-size: 10.5px; font-weight: 600;
  }
  .status-not-started { background: #f1f5f9; color: #64748b; }
  .status-in-progress  { background: #fffbeb; color: #d97706; }
  .status-completed    { background: #f0fdf4; color: #16a34a; }
  :global(body.dark) .status-not-started { background: #1e293b; color: #94a3b8; }
  :global(body.dark) .status-in-progress  { background: #3b2600; color: #fbbf24; }
  :global(body.dark) .status-completed    { background: #052e16; color: #4ade80; }

  .project-title { font-size: 14px; font-weight: 600; color: var(--color-heading); }
  .project-desc  { font-size: 12.5px; color: var(--color-sidebar-text); margin: 0; line-height: 1.5; }

  .project-meta { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .meta-item {
    display: flex; align-items: center; gap: 4px;
    font-size: 12px; color: var(--color-sidebar-text);
  }
  .meta-item.deadline-past { color: #dc2626; }
  .meta-item.deadline-near { color: #d97706; }

  .deadline-tag {
    display: inline-block; font-size: 10px; font-weight: 600;
    padding: 1px 7px; border-radius: 20px;
    background: #fef2f2; color: #dc2626;
  }
  .deadline-tag.near { background: #fffbeb; color: #d97706; }

  /* Quick panel (copied from SupervisorActivity) */
  .quick-panel { background: transparent !important; padding: 0; border-radius: 0; border: none !important; box-shadow: none !important; display:flex; align-items:center; justify-content:space-between }
  .quick-head { display:flex; align-items:center; justify-content:space-between; width:100%; gap:0.75rem; flex-wrap: nowrap }
  .view-controls { display:flex; align-items:center; gap:0.45rem; flex-wrap: wrap; }
  .view-controls .btn { display:inline-flex; align-items:center; gap:0.4rem; border-radius:0.7rem; padding:0.32rem 0.72rem; background:transparent; border:1px solid var(--color-border); font-size:0.84rem; height:2.15rem; line-height:1; }
  .view-controls .btn.active { background: var(--color-soft); color: var(--color-heading); border-color: var(--color-border) }
  .btn-compact { padding:0.28rem 0.6rem; font-size:0.8rem; border-radius:0.55rem; }
  .quick-actions { display:flex; gap:0.5rem; align-items:center; margin-left:auto; flex-wrap: nowrap }
  .search-wrap { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0 0.7rem; color: var(--color-muted); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 0.7rem; height: 2.15rem; }
  .search-input { border:0; background:transparent; color:var(--color-text); font-size:0.85rem; width:11.5rem; outline:none; padding:0; height:100%; }
  /* search-icon removed */
  .quick-actions select, .quick-status, .quick-priority {
    padding:0 0.6rem; border-radius:0.7rem; font-size:0.85rem;
    border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text);
    height: 2.15rem;
  }

  .quick-actions .primary { padding:0 0.95rem; font-size:0.85rem; border-radius:0.7rem; background: #2563eb; color: #fff; border: none; height: 2.15rem; display: inline-flex; align-items: center; font-weight: 600; white-space: nowrap; }

  .meta-link {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 12px; font-weight: 500; color: #2563eb;
    text-decoration: none;
  }
  .meta-link:hover { text-decoration: underline; }

  .project-card-footer {
    display: flex; gap: 6px; margin-top: 4px;
    padding-top: 10px; border-top: 1px solid var(--color-border);
  }
  .btn-edit {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 500;
    background: var(--color-soft); color: #2563eb;
    border: 1px solid var(--color-border); cursor: pointer; transition: all .14s;
  }
  .btn-edit:hover { background: #dbeafe; }
  .btn-delete {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 500;
    background: #fef2f2; color: #dc2626;
    border: 1px solid #fecaca; cursor: pointer; transition: all .14s;
  }
  .btn-delete:hover { background: #fee2e2; }

  /* ── Empty State ── */
  .empty-state {
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
    gap: 8px; padding: 28px 20px 24px; min-height: 210px; color: var(--color-sidebar-text); text-align: center;
  }
  .empty-title { font-size: 14px; font-weight: 600; color: var(--color-text); }
  .empty-sub   { font-size: 12.5px; }
  .empty-cta {
    margin-top: 8px;
    padding: 0 0.95rem;
    font-size: 0.85rem;
    border-radius: 0.7rem;
    background: #2563eb;
    color: #fff;
    border: none;
    height: 2.15rem;
    display: inline-flex;
    align-items: center;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .empty-cta:hover { background: #1d4ed8; }
  @media (max-width: 1080px) {
    .quick-head {
      flex-direction: column;
      align-items: stretch;
      gap: 0.65rem;
    }
    .quick-actions {
      margin-left: 0;
      width: 100%;
      flex-wrap: wrap;
      justify-content: flex-start;
    }
  }
  @media (max-width: 680px) {
    .quick-actions {
      gap: 0.5rem;
    }
    .search-wrap {
      width: 100%;
    }
    .search-input {
      width: 100%;
    }
  }

  /* ── Form Panel ── */
  .form-panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px; padding: 20px 22px;
    display: flex; flex-direction: column; gap: 14px;
  }
  .form-title    { font-size: 15px; font-weight: 700; color: var(--color-heading); }
  .form-subtitle { font-size: 12.5px; color: var(--color-sidebar-text); margin-top: -6px; }
  .form-group    { display: flex; flex-direction: column; gap: 5px; }
  .form-label    { font-size: 12px; font-weight: 600; color: var(--color-sidebar-text); }
  .req           { color: #dc2626; }
  .form-input, .form-textarea {
    padding: 8px 10px; border-radius: 7px;
    border: 1px solid var(--color-border);
    background: var(--color-surface-muted);
    color: var(--color-text); font-size: 13px;
    transition: border-color .15s; outline: none; width: 100%; box-sizing: border-box;
  }
  .form-input:focus, .form-textarea:focus { border-color: #2563eb; }
  .form-textarea { resize: vertical; }
  .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  .form-footer { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }
  .btn-submit {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 20px; border-radius: 8px; font-size: 13px; font-weight: 600;
    background: #2563eb; color: #fff; border: none; cursor: pointer; transition: background .15s;
  }
  .btn-submit:hover:not(:disabled) { background: #1d4ed8; }
  .btn-submit:disabled { opacity: .55; cursor: not-allowed; }
  .btn-secondary {
    padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500;
    background: var(--color-soft); color: var(--color-text);
    border: 1px solid var(--color-border); cursor: pointer;
  }
  .btn-secondary:hover { background: var(--color-hover); }

  /* ── Delete Modal ── */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.45);
    display: grid; place-items: center; z-index: 200;
  }
  .modal-box {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px; padding: 24px 26px;
    max-width: 380px; width: 90%; display: flex; flex-direction: column; gap: 12px;
    box-shadow: 0 20px 48px rgba(0,0,0,.18);
  }
  .modal-title  { font-size: 15px; font-weight: 700; color: var(--color-heading); }
  .modal-body   { font-size: 13px; color: var(--color-sidebar-text); margin: 0; line-height: 1.5; }
  .modal-footer { display: flex; justify-content: flex-end; gap: 8px; }
  .btn-delete-confirm {
    padding: 7px 16px; border-radius: 7px; font-size: 13px; font-weight: 600;
    background: #dc2626; color: #fff; border: none; cursor: pointer;
  }
  .btn-delete-confirm:hover:not(:disabled) { background: #b91c1c; }
  .btn-delete-confirm:disabled { opacity: .55; cursor: not-allowed; }

  /* ── Spin animation ── */
  :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Dark mode overrides ── */
  :global(body.dark) .project-card    { background: #1f2937; border-color: #374151; }
  :global(body.dark) .form-panel      { background: #1f2937; border-color: #374151; }
  :global(body.dark) .form-input,
  :global(body.dark) .form-textarea   { background: #111827; border-color: #374151; color: #f1f5f9; }
  :global(body.dark) .modal-box       { background: #1f2937; border-color: #374151; }
  :global(body.dark) .priority-badge  { filter: brightness(.85) saturate(.9); }
  :global(body.dark) .btn-edit        { background: #1e3a5f; border-color: #1e40af; }
  :global(body.dark) .btn-delete      { background: #2d0a0a; border-color: #7f1d1d; color: #f87171; }
  :global(body.dark) .deadline-tag    { background: #2d0a0a; color: #f87171; }
  :global(body.dark) .deadline-tag.near { background: #3b2600; color: #fbbf24; }
  :global(body.dark) .meta-link       { color: #60a5fa; }

  /* Members input styling to match other form controls */
  .members-input { display:flex; justify-content:space-between; align-items:center; padding:8px 10px; border-radius:7px; border:1px solid var(--color-border); background:var(--color-surface-muted); color:var(--color-text); font-size:13px; cursor:pointer; }
  .members-input:focus { outline: none; border-color: #2563eb; }
  .members-input .muted { font-size:13px; color:var(--color-sidebar-text); font-weight:500; }
  .members-panel { margin-top:8px; padding:10px; border-radius:8px; border:1px solid var(--color-border); background:var(--color-surface); }
  .members-item { display:flex; align-items:center; gap:10px; padding:6px 10px; border-radius:6px; cursor:pointer; color:var(--color-heading); font-size:13px; font-weight:600; }
  .members-item + .members-item { margin-top:6px; }
  .members-item input[type="checkbox"] { width:18px; height:18px; accent-color:#60a5fa; }
  .member-avatar { width:26px; height:26px; border-radius:50%; flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center; overflow:hidden; border:1px solid rgba(148,163,184,0.35); background:linear-gradient(135deg, rgba(37,99,235,0.28), rgba(14,165,233,0.18)); color:#dbeafe; font-size:10px; font-weight:800; letter-spacing:0.03em; }
  .member-avatar img { width:100%; height:100%; object-fit:cover; display:block; }
  .members-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .members-item:hover { background:var(--color-surface-muted); }
  .members-name { line-height:1; }


  /* View toggle (tabs below stat cards) */
  /* view-toggle removed */

  /* ── Overview Layout ──────────────────────────────────────────────────── */
  .ov-top-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  @media (max-width: 680px) {
    .ov-top-grid { grid-template-columns: 1fr; }
  }

  .ov-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.9rem;
    padding: 1rem 1.15rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  :global(body.dark) .ov-card { background: #161c27 !important; border-color: #ffffff0f !important; }

  .ov-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .ov-card-title {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--color-heading);
    letter-spacing: -0.01em;
  }

  .ov-refresh-btn {
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 0.2rem 0.55rem;
    font-size: 0.88rem;
    color: var(--color-sidebar-text);
    cursor: pointer;
    line-height: 1.2;
    transition: background 0.14s;
    display: inline-flex; align-items: center; gap: 4px;
  }
  .ov-refresh-btn:hover { background: var(--color-soft); color: var(--color-heading); }
  .ov-refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .ov-view-all-btn {
    background: transparent;
    border: none;
    font-size: 0.8rem;
    font-weight: 600;
    color: #3b82f6;
    cursor: pointer;
    padding: 0;
    transition: opacity 0.14s;
  }
  .ov-view-all-btn:hover { opacity: 0.75; }

  .ov-empty {
    font-size: 0.83rem;
    color: var(--color-sidebar-text);
    padding: 0.25rem 0;
    display: flex; align-items: center; gap: 6px;
  }

  .ov-skeleton {
    position: relative;
    overflow: hidden;
    background: rgba(15, 23, 42, 0.09);
    border-radius: 6px;
  }

  :global(body.dark) .ov-skeleton {
    background: rgba(255, 255, 255, 0.08);
  }

  .shimmer::after {
    content: '';
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background-image: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0) 0,
      rgba(255, 255, 255, 0.35) 25%,
      rgba(255, 255, 255, 0.65) 60%,
      rgba(255, 255, 255, 0) 100%
    );
    animation: ovShimmer 1.4s infinite;
  }

  :global(body.dark) .shimmer::after {
    background-image: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0) 0,
      rgba(255, 255, 255, 0.06) 25%,
      rgba(255, 255, 255, 0.16) 60%,
      rgba(255, 255, 255, 0) 100%
    );
  }

  @keyframes ovShimmer {
    100% {
      transform: translateX(100%);
    }
  }

  .ov-skeleton-list {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .ov-skeleton-row {
    display: grid;
    grid-template-columns: 7.5rem 1fr 2.2rem;
    gap: 0.65rem;
    align-items: center;
  }

  .ov-skeleton-deadline-row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .ov-skeleton-deadline-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* ── Status breakdown bars ── */
  .ov-status-bars { display: flex; flex-direction: column; gap: 0.5rem; }

  .ov-bar-row {
    display: grid;
    grid-template-columns: 7.5rem 1fr 1.8rem;
    align-items: center;
    gap: 0.65rem;
  }

  .ov-bar-label {
    font-size: 0.75rem !important;
    white-space: nowrap;
    justify-self: start;
  }

  .ov-bar-track {
    height: 8px;
    background: var(--color-border);
    border-radius: 999px;
    overflow: hidden;
  }

  .ov-bar-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 500ms ease;
  }

  /* Bar fill colours mapped to status classes */
  .ov-fill-not-started   { background: #f38f49; }
  .ov-fill-in-progress   { background: #10b981; }
  .ov-fill-submitted     { background: #7c3aed; }
  .ov-fill-needs-revision { background: #ef4444; }
  .ov-fill-approved      { background: #3b82f6; }

  .ov-bar-count {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--color-heading);
    text-align: right;
  }

  .ov-archived-note {
    font-size: 0.77rem;
    color: var(--color-sidebar-text);
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 0.15rem;
  }

  /* ── Upcoming Deadlines ── */
  .ov-deadline-list { display: flex; flex-direction: column; gap: 0.55rem; }

  .ov-deadline-row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .ov-deadline-dot {
    width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0;
    background: var(--color-border);
    border: 1.5px solid var(--color-border);
  }
  .ov-deadline-dot.ov-dot-near { background: #fbbf24; border-color: #f59e0b; }
  .ov-deadline-dot.ov-dot-past { background: #ef4444; border-color: #dc2626; }

  .ov-deadline-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }

  .ov-deadline-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-heading);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ov-deadline-date {
    font-size: 0.77rem;
    color: var(--color-sidebar-text);
    display: flex; align-items: center; gap: 4px;
  }
  .ov-deadline-date.ov-date-near { color: #d97706; }
  .ov-deadline-date.ov-date-past { color: #dc2626; }

  /* ── Activity Feed ── */
  .ov-activity-feed { display: flex; flex-direction: column; gap: 0; }

  /* Expanded activity card styles (removed) */

  .ov-bottom-grid { display: grid; grid-template-columns: 1fr; gap: 0.8rem; align-items: start; }

  /* card title styling */
  .ov-card-title { font-size: 0.85rem; font-weight: 700; color: var(--color-heading); letter-spacing: -0.01em; }

  .ov-act-row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--color-border);
  }
  .ov-act-row:last-child { border-bottom: none; }

  .ov-act-icon {
    width: 28px; height: 28px; border-radius: 7px; flex-shrink: 0;
    display: grid; place-items: center; font-size: 0.95rem;
  }
  .ov-act-icon-fb { background: rgba(99,102,241,0.1); }
  .ov-act-icon-ms { background: rgba(16,185,129,0.1); }

  .ov-act-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }

  .ov-act-text {
    font-size: 0.85rem;
    color: var(--color-heading);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ov-act-meta {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  }

  .ov-act-proj {
    font-size: 0.76rem;
    font-weight: 600;
    color: #3b82f6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
  }

  .ov-act-date {
    font-size: 0.74rem;
    color: var(--color-sidebar-text);
    white-space: nowrap;
  }

  /* ── Project Snippets Grid ── */
  .ov-snippets-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 0.8rem;
  }

  .ov-snippet-card {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1.1rem 1.2rem;
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
    background: var(--color-soft);
    transition: border-color 140ms, box-shadow 140ms;
  }
  .ov-snippet-card:hover { border-color: var(--color-accent); box-shadow: 0 6px 18px -14px rgba(15,23,42,.3); }
  :global(body.dark) .ov-snippet-card { background: #0d1117 !important; border-color: #ffffff0f !important; }

  .ov-snippet-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .ov-snippet-top-right { display:flex; align-items:center; gap:0.5rem; }

  .ov-snippet-name {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--color-heading);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ov-snippet-status { display: flex; }

  .ov-snippet-progress {
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }
  .ov-snippet-progress .progress-bar-outer { flex: 1; }

  .ov-snippet-pct {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--color-heading);
    white-space: nowrap;
    width: 32px;
    text-align: right;
  }

  .ov-snippet-due {
    font-size: 0.77rem;
    color: var(--color-sidebar-text);
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .ov-snippet-due.ov-date-past { color: #dc2626; }

  .ov-ms-section { margin-top: 0.75rem; border-top: 1px solid var(--color-border, rgba(255,255,255,0.07)); padding-top: 0.65rem; display: flex; flex-direction: column; gap: 0.45rem; }
  .ov-ms-section-title { font-size: 0.77rem; font-weight: 700; color: var(--color-sidebar-text); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.1rem; }
  .ov-ms-row { display: flex; align-items: center; gap: 0.55rem; }
  .ov-ms-row-name { font-size: 0.78rem; color: var(--color-heading); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; flex-shrink: 0; }
  .ov-ms-row .ov-bar-track { flex: 1; height: 5px; }
  .ov-ms-row-count { font-size: 0.77rem; color: var(--color-sidebar-text); white-space: nowrap; }
  .ov-ms-done { font-weight: 700; color: var(--color-heading); }

  .ov-snippet-actions {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.1rem;
  }
  .ov-snippet-actions .sub-action-btn {
    flex: 1;
    justify-content: center;
    font-size: 0.78rem;
    padding: 0.3rem 0.6rem;
  }
</style>

