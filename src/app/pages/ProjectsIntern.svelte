<script>
// @ts-nocheck
  import { onMount, onDestroy } from 'svelte';
  import { getCurrentUser, subscribeToCurrentUser } from '../lib/auth.js';
  import {
    FolderOpen, Plus, Pencil, Trash2, ExternalLink, Loader2, Eye,
    CalendarDays, Tag, CheckCircle2, Clock3, AlertCircle, Link2,
    Grid, List, Archive, Download
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
  const STATUS_OPTIONS    = ['Not Started', 'In Progress', 'For Review', 'Completed'];

  // Populated from backend on mount
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
    'Pending':      { cls: 'status-pending',       label: 'Pending'      },
    'In Progress':  { cls: 'status-in-progress',   label: 'In Progress'  },
    'For Review':   { cls: 'status-review',        label: 'For Review'   },
    'Completed':    { cls: 'status-completed',     label: 'Completed'    },
    // legacy mappings
    'Not Started':  { cls: 'status-not-started',   label: 'Not Started'  },
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
  // GAS functions ending in _ are private and cannot be called from the client.
  // Use the public `apiAction(action, payload)` wrapper instead.
  function dispatchAction(action, payload = {}) {
    return new Promise((resolve, reject) => {
      const run = globalThis?.google?.script?.run;
      if (!run) { reject(new Error('Apps Script runtime not available.')); return; }
      run
        .withSuccessHandler(resolve)
        .withFailureHandler(e => reject(new Error(e?.message || String(e))))
        .apiAction(action, payload);
    });
  }

  // ── Load projects + user bootstrap from backend ────────────────────────
  async function loadBootstrap() {
    isLoading = true;
    try {
      const uid = String(currentUser?.user_id || getCurrentUser()?.user_id || '');
      if (!uid) {
        try { console.warn('loadBootstrap: no user_id - currentUser:', currentUser); } catch(e) {}
        return;
      }

      // Fetch user lists and projects in parallel
      const [bootstrapRes, projectsRes] = await Promise.all([
        dispatchAction('get_proj_users_bootstrap', { user_id: uid }),
        dispatchAction('list_proj_intern', { user_id: uid })
      ]);

      try { console.log('loadBootstrap -> uid=', uid, 'bootstrapRes=', bootstrapRes, 'projectsRes=', projectsRes); } catch(e) {}

      if (bootstrapRes?.ok) {
        SUPERVISOR_OPTIONS = (bootstrapRes.supervisors || []).map(u => ({
          value: u.user_id,
          label: u.full_name || u.email || u.user_id
        }));
        MEMBER_OPTIONS = (bootstrapRes.interns || []).map(u => ({
          value: u.user_id,
          label: u.full_name || u.email || u.user_id
        }));
      } else if (bootstrapRes && !bootstrapRes.ok) {
        console.warn('Bootstrap error:', bootstrapRes.error);
      }

      if (projectsRes?.ok) {
        projects = (projectsRes.projects || []).map(normalizeProject);
      }

      // Folders are loaded lazily when a project is opened — just ensure the property exists
      projects = projects.map(p => ({ ...p, folders: p.folders || null }));
    } catch (e) {
      console.error('loadBootstrap error', e);
    } finally {
      isLoading = false;
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
      archived:       false,
      folders:        null,           // null = not yet loaded; [] = loaded and empty
      progress_logs:  [],
      milestones:     []
    };
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  async function submitProject() {
    const err = validateForm();
    formError   = err;
    formSuccess  = '';
    if (err) return;
    isSubmitting = true;

    const uid = String(currentUser?.user_id || getCurrentUser()?.user_id || '');
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
    const uid = String(currentUser?.user_id || getCurrentUser()?.user_id || '');
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
  }

  function closeAddProjectModal() {
    showAddProjectModal = false;
    resetForm();
  }

  async function confirmDelete() {
    if (!projectToDelete) return;
    isDeleting = true;
    const uid = String(currentUser?.user_id || getCurrentUser()?.user_id || '');
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
    } else {
      viewingProjectId  = p.id;
      viewingProjectTab = 'Details';
      // Load folders if not yet fetched
      if (!p.folders || p.folders === null) {
        loadProjectFolders(p.id);
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
    const uid    = String(currentUser?.user_id || getCurrentUser()?.user_id || '');
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
    const uid      = String(currentUser?.user_id || getCurrentUser()?.user_id || '');
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
    const uid        = String(currentUser?.user_id || getCurrentUser()?.user_id || '');

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
    const uid    = String(currentUser?.user_id || getCurrentUser()?.user_id || '');
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

  function viewSubmission(sub) {
    if (!sub) return;
    const url = sub.kind === 'file' ? (sub.drive_url || '') : (sub.url || '');
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

  function downloadSubmission(sub) {
    if (!sub) return;
    const url = sub.kind === 'file' ? (sub.drive_url || '') : (sub.url || '');
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
    const uid = String(currentUser?.user_id || getCurrentUser()?.user_id || '');
    try {
      const res = await dispatchAction('update_proj_intern', {
        proj_id: p.proj_id || p.id,
        user_id: uid,
        status:  'Archived'
      });
      if (!res?.ok) { formError = res?.error || 'Archive failed.'; return; }
      projects = projects.map(item => item.id === p.id ? { ...item, archived: true, status: 'Archived' } : item);
      formSuccess = 'Project archived.';
      setTimeout(() => { formSuccess = ''; }, 2000);
    } catch (e) {
      formError = e?.message || 'Archive failed.';
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
  $: filteredProjects = projects.filter(p => {
    const matchPriority = filterPriority === 'all' || p.priority_level === filterPriority;
    const matchStatus   = filterStatus   === 'all' || p.status === filterStatus;
    return matchPriority && matchStatus;
  });

  $: totalProjects     = projects.length;
  $: inProgressCount   = projects.filter(p => p.status === 'In Progress').length;
  $: completedCount    = projects.filter(p => p.status === 'Completed').length;
  $: isFormValid       = String(form.title || '').trim() && String(form.timeline_start || '').trim() && String(form.timeline_end || '').trim();

  // Derived sets for tab views
  $: archivedProjects = projects.filter(p => !!p.archived);
  $: recentProjects   = projects.slice(0, 3);
</script>
<section class="projects-page">

  <!-- Stat Cards -->
  <div class="stat-cards">
    <div class="stat-card blue">
      <div class="stat-card-top">
        <div style="flex:1"></div>
        <div class="stat-icon blue"><FolderOpen size={16} /></div>
      </div>
      <div class="stat-value">{totalProjects}</div>
      <div class="stat-label">Total Projects</div>
    </div>
    <div class="stat-card amber">
      <div class="stat-card-top">
        <div style="flex:1"></div>
        <div class="stat-icon amber"><Clock3 size={16} /></div>
      </div>
      <div class="stat-value">{inProgressCount}</div>
      <div class="stat-label">In Progress</div>
    </div>
    <div class="stat-card green">
      <div class="stat-card-top">
        <div style="flex:1"></div>
        <div class="stat-icon green"><CheckCircle2 size={16} /></div>
      </div>
      <div class="stat-value">{completedCount}</div>
      <div class="stat-label">Completed</div>
    </div>
  </div>
  
    <!-- Quick panel (copied from SupervisorActivity) -->
    <section class="card quick-panel">
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
            <option value="all">All status</option>
            {#each STATUS_OPTIONS as s}
              <option value={s}>{s}</option>
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
      {#if isLoading}
        <div class="empty-state">
          <Loader2 size={22} class="spin" />
          <span>Loading projects…</span>
        </div>
      {:else if projects.length === 0}
        <div class="empty-state">
          <FolderOpen size={32} />
          <div class="empty-title">No projects yet</div>
          <div class="empty-sub">Click "Add Project" to get started.</div>
        </div>
      {:else}
        <div class="project-list">
          <ul>
            {#each recentProjects as p (p.id)}
              <li class="proj-item">{p.title} <span class="muted">— {p.status}</span></li>
            {/each}
          </ul>
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
                        <button class="proj-detail-tab-btn" class:active={viewingProjectTab === 'Milestones'} on:click={() => viewingProjectTab = 'Milestones'}>Milestones</button>
                        <button class="proj-detail-tab-btn" class:active={viewingProjectTab === 'Feedback'} on:click={() => viewingProjectTab = 'Feedback'}>Feedback</button>
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
                                  {#each MEMBER_OPTIONS as m}
                                    <label class="members-item"><input type="checkbox" checked={(inlineForm.members || []).includes(m.value)} on:change={() => toggleInlineMember(m.value)} /> <span class="members-name">{m.label}</span></label>
                                  {/each}
                                  {#if MEMBER_OPTIONS.length === 0}<span class="muted" style="font-size:12px;padding:4px 8px">No interns found</span>{/if}
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
                                  {#each SUPERVISOR_OPTIONS as s}
                                    <label class="members-item"><input type="checkbox" checked={(inlineForm.supervisor || []).includes(s.value)} on:change={() => toggleInlineSupervisor(s.value)} /> <span class="members-name">{s.label}</span></label>
                                  {/each}
                                  {#if SUPERVISOR_OPTIONS.length === 0}<span class="muted" style="font-size:12px;padding:4px 8px">No supervisors found</span>{/if}
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
                      {#if p.milestones && p.milestones.length > 0}
                        <div class="milestone-list">
                          {#each p.milestones as m}
                            <div class="milestone-row">
                              <div class="milestone-left">
                                <div class="milestone-icon">{m.status === 'done' ? '✔' : (m.status === 'in-progress' ? '🟡' : '⬜')}</div>
                                <div class="milestone-title">{m.title}</div>
                              </div>
                              <div class="milestone-due">Due: <span class="muted">{formatDate(m.due)}</span></div>
                            </div>
                          {/each}
                        </div>
                      {:else}
                        <div class="proj-detail-empty">
                          No milestones defined yet.
                          <div style="margin-top:8px">
                            <button class="sub-action-btn" on:click={() => addSampleMilestones(p.id)}>Add sample milestones</button>
                          </div>
                        </div>
                      {/if}
                    {:else if viewingProjectTab === 'Feedback'}
                      <div class="proj-detail-empty">No feedback available.</div>
                    {/if}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </section>
    {:else if activeView === 'Archive'}
      {#if archivedProjects.length === 0}
        <div class="empty-state">
          <FolderOpen size={28} />
          <div class="empty-title">No archived projects</div>
          <div class="empty-sub">Archived projects will appear here.</div>
        </div>
      {:else}
        <div class="project-list">
          <ul>
            {#each archivedProjects as p (p.id)}
              <li class="proj-item">{p.title}</li>
            {/each}
          </ul>
        </div>
      {/if}
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
            {#each MEMBER_OPTIONS as m}
              <label class="members-item"><input type="checkbox" checked={(form.members || []).includes(m.value)} on:change={() => toggleMember(m.value)} /> <span class="members-name">{m.label}</span></label>
            {/each}
            {#if MEMBER_OPTIONS.length === 0}<span class="muted" style="font-size:12px;padding:4px 8px">No interns found</span>{/if}
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
            {#each SUPERVISOR_OPTIONS as s}
              <label class="members-item"><input type="checkbox" checked={(form.supervisor || []).includes(s.value)} on:change={() => toggleSupervisor(s.value)} /> <span class="members-name">{s.label}</span></label>
            {/each}
            {#if SUPERVISOR_OPTIONS.length === 0}<span class="muted" style="font-size:12px;padding:4px 8px">No supervisors found</span>{/if}
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
  .projects-page { padding: 4px 0 12px; display: flex; flex-direction: column; gap: 10px; }

  /* ── Stat Cards ── */
  .stat-cards { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 0; }
  .stat-card {
    flex: 1; min-width: 120px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 12px 14px 10px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .stat-card-top { display: flex; align-items: center; margin-bottom: 4px; }
  .stat-icon {
    width: 28px; height: 28px; border-radius: 7px;
    display: grid; place-items: center;
  }
  .stat-icon.blue  { background: #dbeafe; color: #2563eb; }
  .stat-icon.amber { background: #fef3c7; color: #d97706; }
  .stat-icon.green { background: #dcfce7; color: #16a34a; }
  :global(body.dark) .stat-icon.blue  { background: #1e3a5f; color: #60a5fa; }
  :global(body.dark) .stat-icon.amber { background: #3b2600; color: #fbbf24; }
  :global(body.dark) .stat-icon.green { background: #052e16; color: #4ade80; }
  .stat-value { font-size: 22px; font-weight: 700; color: var(--color-heading); line-height: 1; }
  .stat-label { font-size: 11.5px; color: var(--color-sidebar-text); }

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

  .log-date { font-weight:600; padding:0.45rem 0.75rem; background:transparent; color:var(--color-text); font-size:0.9rem; font-family:inherit; }
  .log-date-block { margin-bottom:8px; overflow:hidden; }
  .log-entry { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; padding:0.6rem 0.75rem; border-bottom:1px solid var(--color-border); }
  .log-entry:last-child { border-bottom:none; }
  .log-entry-left { display:flex; gap:10px; align-items:flex-start; flex:1; }
  .log-check { background:transparent; color:#059669; border-radius:6px; padding:4px; font-size:0.95rem; line-height:1; border:1px solid rgba(5,150,105,0.12); display:inline-flex; align-items:center; justify-content:center; }
  .log-desc { color:var(--color-heading); font-size:0.9rem; font-family:inherit; }
  .log-entry-right { display:flex; gap:8px; align-items:center; }

  /* Milestones */
  .milestone-list { display:flex; flex-direction:column; gap:6px; padding:0.5rem 0.75rem; }
  .milestone-row { display:flex; align-items:center; justify-content:space-between; padding:0.6rem 0.75rem; border-radius:8px; background:transparent; }
  .milestone-left { display:flex; gap:12px; align-items:center; }
  .milestone-icon { width:30px; height:30px; display:grid; place-items:center; border-radius:6px; font-size:0.95rem; }
  .milestone-icon { border:1px solid rgba(255,255,255,0.04); }
  .milestone-title { font-size:0.95rem; font-weight:600; color:var(--color-heading); }
  .milestone-due { font-size:0.88rem; color:var(--color-sidebar-text); }

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
  .quick-panel { background: linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface) 100%); padding: 0.48rem 0.8rem; border-radius: 0.9rem; border: 1px solid var(--color-border); display:flex; align-items:center; justify-content:space-between }
  .quick-head { display:flex; align-items:center; justify-content:space-between; width:100%; gap:0.75rem }
  .view-controls .btn { display:inline-flex; align-items:center; gap:0.4rem; margin-right:0.4rem; border-radius:0.55rem; padding:0.32rem 0.6rem; background:transparent; border:1px solid var(--color-border); font-size:0.82rem }
  .view-controls .btn.active { background: var(--color-soft); color: var(--color-heading); border-color: var(--color-border) }
  .btn-compact { padding:0.28rem 0.6rem; font-size:0.8rem; border-radius:0.55rem; }
  .quick-actions { display:flex; gap:0.45rem; align-items:center }
  .search-wrap { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0 0.7rem; color: var(--color-muted); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 0.7rem; }
  .search-input { border:0; background:transparent; color:var(--color-text); font-size:0.85rem; width:9rem; outline:none; padding:0.34rem 0; }
  /* search-icon removed */
  .quick-actions select, .quick-status { padding:0.34rem 0.6rem; border-radius:0.7rem; font-size:0.85rem }
  .quick-actions .primary { padding:0.36rem 0.9rem; font-size:0.85rem; border-radius:0.7rem; background: #2563eb; color: #fff; border: none }

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
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 8px; padding: 48px 20px; color: var(--color-sidebar-text); text-align: center;
  }
  .empty-title { font-size: 14px; font-weight: 600; color: var(--color-text); }
  .empty-sub   { font-size: 12.5px; }

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
  .members-item:hover { background:var(--color-surface-muted); }
  .members-name { line-height:1; }


  /* View toggle (tabs below stat cards) */
  /* view-toggle removed */

</style>
