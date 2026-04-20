<script>
// @ts-nocheck

let workLogs = [];
let isLoadingWorkLogs = false;
let workLogsError = '';

let allUsers = [];

let expandedWorkLog = null;
let hoveredWorkLog = null;
import { onMount, onDestroy } from 'svelte';
import { theme } from '../context/ThemeContext.js';
// For real-time update of 'Updated X minutes ago'
let now = new Date();
let nowIntervalId;
let recentActivitiesIntervalId;
let stopUserSubscription = () => {};
let forceUpdate = 0; // dummy variable to trigger Svelte reactivity

function updateNow() {
  now = new Date();
  forceUpdate += 1; // force Svelte to update
}

onMount(() => {
  nowIntervalId = setInterval(() => {
    updateNow();
  }, 5000); // update every 5 seconds for better real-time relative time display
});

onDestroy(() => {
  clearInterval(nowIntervalId);
  clearInterval(recentActivitiesIntervalId);
  stopUserSubscription();
});
// For Recent Activity (automatic, backend-driven)
let recentActivities = [];

// Fetch recent activities from backend
async function fetchRecentActivities() {
  return new Promise((resolve) => {
    try {
      const run = globalThis?.google?.script?.run;
      if (!run) {
        resolve();
        return;
      }
      run
        .withSuccessHandler((data) => {
          if (Array.isArray(data)) {
            recentActivities = data;
          }
          resolve();
        })
        .withFailureHandler(() => {
          resolve();
        })
        .getRecentActivities();
    } catch (e) {
      resolve();
    }
  });
}

// Log a new activity to backend
async function logUserActivity(activity) {
  return new Promise((resolve) => {
    try {
      const run = globalThis?.google?.script?.run;
      if (!run) {
        resolve();
        return;
      }
      run
        .withSuccessHandler(() => {
          // Fetch activities immediately after logging to show in real-time
          setTimeout(() => fetchRecentActivities(), 300);
          resolve();
        })
        .withFailureHandler(() => {
          resolve();
        })
        .logUserActivity(activity);
    } catch (e) {
      resolve();
    }
  });
}

// Format timestamp to relative time (e.g., "3 minutes ago")
function formatRelativeTime(timestamp) {
  const activityDate = new Date(timestamp);
  const diffMs = now - activityDate;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes === 1) return '1 minute ago';
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return activityDate.toLocaleDateString();
}

// Format recent activity message consistently: append relative time only when message doesn't already include it
function formatActivityLine(activity) {
  const msg = String(activity?.message || '').trim();
  if (!msg) {
    return formatRelativeTime(activity?.timestamp || '') || '';
  }

  const lower = msg.toLowerCase();
  // if message already contains a relative-time phrase or a date, don't append
  if (lower.includes('ago') || /\b\d{4}-\d{2}-\d{2}\b/.test(msg) || /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(msg)) {
    return msg.replace(/\s+,\s*/, ', '); // normalize any stray commas
  }

  const rel = formatRelativeTime(activity?.timestamp || '');
  if (!rel) return msg;

  // ensure punctuation spacing
  const endsPunct = /[.!?]$/.test(msg);
  if (endsPunct) return `${msg} ${rel}.`;
  return `${msg}, ${rel}.`;
}

onMount(() => {
  fetchRecentActivities();
  recentActivitiesIntervalId = setInterval(() => {
    updateNow();
    fetchRecentActivities(); // refresh activities every 10 seconds for more real-time feel
  }, 10000);
});

onMount(async () => {
  try {
    const res = await callGetAllStudents();
    if (res && res.ok && Array.isArray(res.students)) {
      allUsers = res.students.map(s => ({ user_id: String(s.user_id || ''), full_name: String(s.full_name || ''), email: String(s.email || '') }));
    }
  } catch (e) {
    // ignore
  }
});

onMount(() => {
  fetchAssignedTasks();
  fetchWorkLogs();
  stopUserSubscription = subscribeToCurrentUser(() => {
    fetchAssignedTasks();
    fetchWorkLogs();
  });
});

onMount(() => {
  fetchAssignedTasks();
  stopUserSubscription = subscribeToCurrentUser(() => {
    fetchAssignedTasks();
  });
});

// Helper to compute minutes ago from a date string (using dueDate as a stand-in for last updated)
function getUpdatedMinutesAgo(dateString) {
  // Try to parse the date string (e.g., 'Apr 5, 2026')
  const parsed = parseDueDate(dateString);
  if (!parsed) return '';
  // Use the reactive 'now' variable so Svelte updates the UI
  const diffMs = now.getTime() - parsed.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 0) return '';
  if (diffMinutes < 60) {
    return `Updated ${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Updated ${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
  // If more than 24 hours, show the date
  return `Updated ${dateString}`;
}

function getUserFullName(idOrEmail) {
  if (!idOrEmail) return '';
  const byId = allUsers.find(u => String(u.user_id || '') === String(idOrEmail));
  if (byId) return byId.full_name || byId.user_id || '';
  const byEmail = allUsers.find(u => String(u.email || '').toLowerCase() === String(idOrEmail).toLowerCase());
  if (byEmail) return byEmail.full_name || byEmail.email || '';
  return String(idOrEmail);
}

import { getCurrentUser, subscribeToCurrentUser } from '../lib/auth.js';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Clock3,
  MoreHorizontal,
  List,
  Plus,
  Search,
  LayoutGrid,
  FileEdit,
  BookOpen,
  Loader2,
  Download,
  ExternalLink
} from 'lucide-svelte';

// --- Work Log Form State and Handlers ---

let workLogTask = '';
let workLogNotes = '';
let workLogLearnings = '';
let workLogAttachments = [];
let workLogFileInput; // Reference to file input for resetting
let isSavingWorkLog = false;

// --- Work Log Filters ---
let workLogFilterKeyword = '';
let workLogFilterDate = '';

function callGetActivityWorklogs(payload = {}) {
  return new Promise((resolve, reject) => {
    const run = globalThis?.google?.script?.run;

    if (!run) {
      reject(new Error('Apps Script runtime is not available in this view.'));
      return;
    }

    run
      .withSuccessHandler(resolve)
      .withFailureHandler((error) => {
        reject(new Error(error?.message || String(error)));
      })
      .getActivityWorklogs(payload);
  });
}

function callGetAllStudents(payload = {}) {
  return new Promise((resolve, reject) => {
    const run = globalThis?.google?.script?.run;
    if (!run) {
      reject(new Error('Apps Script runtime is not available in this view.'));
      return;
    }
    run.withSuccessHandler(resolve).withFailureHandler((error) => reject(new Error(error?.message || String(error)))).getAllStudents(payload);
  });
}

function mapWorklogToUi(row) {
  const source = row || {};
  const attachments = Array.isArray(source.attachments) ? source.attachments : [];
  return {
    task_id: String(source.task_id || source.id || '').trim(),
    user_id: String(source.user_id || '').trim(),
    task: String(source.task || '').trim(),
    notes: String(source.notes || '').trim(),
    learnings: String(source.learnings || '').trim(),
    date: String(source.date || '').trim(),
    created_at: String(source.created_at || '').trim(),
    created_by: String(source.created_by || '').trim(),
    updated_by: String(source.updated_by || '').trim(),
    attachments: attachments.map(a => ({
      attachment_id: String(a.attachment_id || '').trim(),
      file_type: String(a.file_type || '').trim(),
      file_size: String(a.file_size || '').trim(),
      file_name: String(a.file_name || '').trim(),
      link: String(a.link || '').trim(),
      uploaded_at: String(a.uploaded_at || '').trim()
    }))
  };
}

function getDriveDownloadUrl(link) {
  const url = String(link || '').trim();
  if (!url) return '';
  if (url.includes('uc?export=download')) return url;
  const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  const fileId = idMatch ? idMatch[1] : '';
  return fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : url;
}

async function fetchWorkLogs() {
  const user = getCurrentUser();

  if (!user?.user_id) {
    workLogs = [];
    workLogsError = '';
    return;
  }

  isLoadingWorkLogs = true;
  workLogsError = '';

  try {
    const result = await callGetActivityWorklogs({
      user_id: user.user_id,
    });

    if (!result?.ok) {
      throw new Error(result?.error || 'Unable to load work logs.');
    }

    workLogs = Array.isArray(result.worklogs)
      ? result.worklogs.map((row) => mapWorklogToUi(row))
      : [];
  } catch (error) {
    workLogs = [];
    workLogsError = error?.message || 'Unable to load work logs.';
  } finally {
    isLoadingWorkLogs = false;
  }
}

// Returns true if log matches keyword (in task, notes, learnings, or attachment)
function matchesWorkLogKeyword(log, keyword) {
  if (!keyword.trim()) return true;
  const lower = keyword.trim().toLowerCase();
  return (
    log.task.toLowerCase().includes(lower) ||
    log.notes.toLowerCase().includes(lower) ||
    log.learnings.toLowerCase().includes(lower) ||
    (log.attachments && log.attachments.some(f => f.toLowerCase().includes(lower)))
  );
}

// Returns true if log matches the selected date (YYYY-MM-DD)
function matchesWorkLogDate(log, dateStr) {
  if (!dateStr) return true;
  // log.date is like 'Apr 10, 2026', convert to YYYY-MM-DD
  const parsed = parseDueDate(log.date);
  if (!parsed) return false;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  const logDateStr = `${y}-${m}-${d}`;
  return logDateStr === dateStr;
}

function formatWorklogDate(dateText) {
  const parsed = parseDueDate(dateText);
  const date = parsed || new Date();
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

$: filteredWorkLogs = workLogs.filter(
  log => matchesWorkLogKeyword(log, workLogFilterKeyword) && matchesWorkLogDate(log, workLogFilterDate)
);

function handleWorkLogFileUpload(event) {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) {
    return;
  }
  // store as objects so name can be edited before upload
  const wrapped = files.map(f => ({ file: f, name: f.name }));
  workLogAttachments = [...workLogAttachments, ...wrapped];
  event.target.value = '';
}

function renameWorkLogAttachment(index, newName) {
  if (typeof index !== 'number') return;
  workLogAttachments = workLogAttachments.map((att, i) => i === index ? { ...att, name: String(newName || '').trim() } : att);
}

function removeWorkLogAttachment(index) {
  if (typeof index !== 'number') return;
  workLogAttachments = workLogAttachments.filter((_, i) => i !== index);
  // try resetting file input if empty
  if (workLogAttachments.length === 0 && workLogFileInput) workLogFileInput.value = '';
}

function fileToBase64_(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file selected.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const commaIndex = dataUrl.indexOf(',');
      resolve(commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : '');
    };
    reader.onerror = () => reject(new Error('Unable to read selected file.'));
    reader.readAsDataURL(file);
  });
}

function getFileExtension_(fileName) {
  const name = String(fileName || '').trim();
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex === -1) {
    return '';
  }
  return name.slice(dotIndex + 1).toLowerCase();
}

function callAddActivityWorklog(payload) {
  return new Promise((resolve, reject) => {
    const run = globalThis?.google?.script?.run;
    if (!run) {
      reject(new Error('Apps Script runtime is not available in this view.'));
      return;
    }

    run
      .withSuccessHandler(resolve)
      .withFailureHandler((error) => {
        reject(new Error(error?.message || String(error)));
      })
      .addActivityWorklog(payload);
  });
}

function callAddWorklogAttachment(payload) {
  return new Promise((resolve, reject) => {
    const run = globalThis?.google?.script?.run;
    if (!run) {
      reject(new Error('Apps Script runtime is not available in this view.'));
      return;
    }

    run
      .withSuccessHandler(resolve)
      .withFailureHandler((error) => {
        reject(new Error(error?.message || String(error)));
      })
      .addWorklogAttachment(payload);
  });
}

async function handleAddWorkLog() {
  if (isSavingWorkLog) return;
  if (!workLogTask.trim() && !workLogNotes.trim() && !workLogLearnings.trim()) return;
  
  isSavingWorkLog = true;
  const now = new Date();
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const date = `${MONTH_NAMES[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

  let user = null;
  try {
    user = await getCurrentUser();
  } catch (e) {}

  const payload = {
    task_id: '',
    user_id: user?.user_id || '',
    task: workLogTask.trim(),
    notes: workLogNotes.trim(),
    learnings: workLogLearnings.trim(),
    date,
    created_at: now.toISOString(),
    created_by: user?.user_id || '',
    updated_by: user?.user_id || ''
  };

  try {
    const result = await callAddActivityWorklog(payload);
    const taskId = String(result?.task_id || payload.task_id || '').trim();
    const uploadErrors = [];
    // workLogAttachments entries are { file, name }
    const validAttachments = workLogAttachments.filter((a) => a && a.file && a.file.size > 0);

    if (taskId && validAttachments.length > 0) {
      for (const entry of validAttachments) {
        const file = entry.file;
        const fileName = String(entry.name || file.name || '').trim();
        try {
          const ext = getFileExtension_(fileName);
          const mimeSuffix = String(file.type || '').includes('/') ? String(file.type).split('/').pop() : '';
          const sizeMb = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
          const fileDataBase64 = await fileToBase64_(file);
          const uploadResult = await callAddWorklogAttachment({
            attachment_id: '',
            task_id: taskId,
            user_id: user?.user_id || '',
            file_type: ext || mimeSuffix || String(file.type || '').trim(),
            file_size: sizeMb,
            file_name: fileName,
            file_data_base64: fileDataBase64,
            mime_type: file.type || 'application/octet-stream',
            uploaded_at: now.toISOString(),
            uploaded_by: user?.user_id || ''
          });

          if (!uploadResult?.ok) {
            throw new Error(uploadResult?.error || 'Save failed.');
          }
        } catch (uploadError) {
          uploadErrors.push(`${fileName}: ${uploadError?.message || uploadError}`);
        }
      }
    }

    fetchWorkLogs();
    
    // Log activity
    await logUserActivity({
      message: `Added a new work log`,
      timestamp: new Date().toISOString(),
      user: user && user.email ? user.email : 'Unknown'
    });
    
    workLogTask = '';
    workLogNotes = '';
    workLogLearnings = '';
    workLogAttachments = [];
    
    // Reset the file input element
    if (workLogFileInput) {
      workLogFileInput.value = '';
    }

    if (uploadErrors.length > 0) {
      alert(`Some attachments failed to save:\n${uploadErrors.join('\n')}`);
    }
  } catch (e) {
    alert(`Failed to save work log: ${e?.message || e}`);
  } finally {
    isSavingWorkLog = false;
  }
}

let assignedTasks = [];
let isLoadingAssignedTasks = false;
let assignedTasksError = '';

  let archivedTasks = [];

  const statusClassMap = {
    Pending: 'status-pending',
    'In Progress': 'status-progress',
    Completed: 'status-completed',
    Overdue: 'status-overdue',
  };

  const statusOptions = ['All Status', 'Pending', 'In Progress', 'Overdue', 'Completed'];
  const editStatusOptions = ['Pending', 'In Progress', 'Overdue', 'Completed'];
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH_MAP = {
    Jan: '01',
    Feb: '02',
    Mar: '03',
    Apr: '04',
    May: '05',
    Jun: '06',
    Jul: '07',
    Aug: '08',
    Sep: '09',
    Oct: '10',
    Nov: '11',
    Dec: '12',
  };

  let searchQuery = '';
  let statusFilter = 'All Status';
  let activeView = 'Overview';
  let selectedOverviewTaskTitle = '';
  let expandedListTaskTitle = '';
  let isViewTaskModalOpen = false;
  let viewedTaskTitle = '';
  let isEditingViewedTask = false;
  let taskViewEditForm = {
    title: '',
    status: 'Pending',
    dueDate: '',
    description: '',
    dailyChecklist: [],
    attachments: [],
  };
  let trackerMenuOpen = false;
  let isEditingTrackerTask = false;
  let isAddTaskOpen = false;
  let isSavingAddTask = false;
  let addTaskError = '';
  let addTaskForm = {
    title: '',
    status: 'Pending',
    owner: '',
    dueDate: '',
    description: '',
    dailyChecklist: [],
    attachments: [],
  };
  let trackerEditForm = {
    title: '',
    status: 'Pending',
    dueDate: '',
    description: '',
    dailyChecklist: [],
    attachments: [],
  };
  let addTaskFileInput; // Reference to file input for task form
  let trackerFileInput; // Reference to file input for tracker form
  let taskViewFileInput; // Reference to file input for task view form

  function matchesStatus(task, filter) {
    if (filter === 'All Status') {
      return true;
    }

    return task.status === filter;
  }

  function matchesSearch(task, query) {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return true;
    }

    return [task.title, task.status, task.dueDate, task.owner].some((value) =>
      value.toLowerCase().includes(normalized)
    );
  }

  function formatDueDate(dateText) {
    const normalizedDate = normalizeDisplayDueDate(dateText);
    const parts = normalizedDate.replace(',', '').split(' ');

    if (parts.length !== 3) {
      return normalizedDate;
    }

    const [monthText, dayText, yearText] = parts;
    const month = MONTH_MAP[monthText];

    if (!month) {
      return normalizedDate;
    }

    const day = dayText.padStart(2, '0');
    return `${day}-${month}-${yearText}`;
  }

  function parseDueDate(dateText) {
    if (dateText instanceof Date) {
      return Number.isNaN(dateText.getTime()) ? null : new Date(dateText);
    }

    const raw = String(dateText || '').trim();
    if (!raw) {
      return null;
    }

    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return new Date(`${year}-${month}-${day}T00:00:00`);
    }

    const nativeParsed = new Date(raw);
    if (!Number.isNaN(nativeParsed.getTime()) && /\bGMT|^\d{4}-\d{2}-\d{2}|^[A-Z][a-z]{2}\s[A-Z][a-z]{2}\s\d{1,2}/.test(raw)) {
      nativeParsed.setHours(0, 0, 0, 0);
      return nativeParsed;
    }

    const parts = raw.replace(',', '').split(' ');

    if (parts.length !== 3) {
      return null;
    }

    const [monthText, dayText, yearText] = parts;
    const month = MONTH_MAP[monthText];

    if (!month) {
      return null;
    }

    return new Date(`${yearText}-${month}-${dayText.padStart(2, '0')}T00:00:00`);
  }

  function normalizeDisplayDueDate(dateValue) {
    const parsed = parseDueDate(dateValue);

    if (!parsed) {
      return String(dateValue || '').trim();
    }

    return `${MONTH_NAMES[parsed.getMonth()]} ${parsed.getDate()}, ${parsed.getFullYear()}`;
  }

  function toInputDate(dateText) {
    const parsed = parseDueDate(dateText);

    if (!parsed) {
      return '';
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function fromInputDate(inputDate) {
    if (!inputDate) {
      return '';
    }

    const [year, month, day] = inputDate.split('-');
    const monthIndex = Number(month) - 1;

    if (monthIndex < 0 || monthIndex > 11) {
      return '';
    }

    return `${MONTH_NAMES[monthIndex]} ${Number(day)}, ${year}`;
  }

  function getAttachmentNames(attachments) {
    if (Array.isArray(attachments)) {
      return attachments.map((item) => {
        if (typeof item === 'object' && item instanceof File) {
          return item.name;
        }
        return String(item || '').trim();
      }).filter(Boolean);
    }

    return [];
  }

  function callAddActivityTaskAttachment(payload) {
    return new Promise((resolve, reject) => {
      const run = globalThis?.google?.script?.run;
      if (!run) {
        reject(new Error('Apps Script runtime is not available.'));
        return;
      }

      run
        .withSuccessHandler(resolve)
        .withFailureHandler((error) => {
          reject(new Error(error?.message || String(error)));
        })
        .addActivityTaskAttachment(payload);
    });
  }

  function formatAttachmentCell(attachments) {
    const names = getAttachmentNames(attachments);

    if (names.length === 0) {
      return 'No files';
    }

    return `${names.length} ${names.length === 1 ? 'file' : 'files'}`;
  }

  function formatAttachmentMeta(attachments) {
    const count = getAttachmentNames(attachments).length;
    return `${count} ${count === 1 ? 'attachment' : 'attachments'}`;
  }

  function formatChecklistMeta(dailyChecklist) {
    const items = Array.isArray(dailyChecklist) ? dailyChecklist : [];
    return `${items.length} ${items.length === 1 ? 'checklist item' : 'checklist items'}`;
  }

  function normalizeDate(date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function isSameCalendarDay(left, right) {
    return (
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate()
    );
  }

  function getUniqueTaskTitle(baseTitle) {
    const trimmedBase = baseTitle.trim();

    if (!assignedTasks.some((task) => task.title === trimmedBase)) {
      return trimmedBase;
    }

    let suffix = 2;
    let candidate = `${trimmedBase} (${suffix})`;

    while (assignedTasks.some((task) => task.title === candidate)) {
      suffix += 1;
      candidate = `${trimmedBase} (${suffix})`;
    }

    return candidate;
  }

  function resetAddTaskForm() {
    addTaskForm = {
      title: '',
      status: 'Pending',
      owner: '',
      dueDate: '',
      description: '',
      dailyChecklist: [],
      attachments: [],
      dateCreated: '',
    };
    addTaskError = '';
    
    // Reset the file input element
    if (addTaskFileInput) {
      addTaskFileInput.value = '';
    }
  }

  function toggleAddTaskForm() {
    isAddTaskOpen = !isAddTaskOpen;

    if (isAddTaskOpen) {
      // Set dateCreated to today when opening the form
      const nowDate = new Date();
      const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      addTaskForm.dateCreated = `${MONTH_NAMES[nowDate.getMonth()]} ${nowDate.getDate()}, ${nowDate.getFullYear()}`;
    } else {
      resetAddTaskForm();
    }
  }

  function cancelAddTask() {
    isAddTaskOpen = false;
    addTaskError = '';
    resetAddTaskForm();
  }

  function handleAddTaskOverlayClick(event) {
    if (event.target === event.currentTarget) {
      cancelAddTask();
    }
  }

  function callCreateActivityTask(payload) {
    return new Promise((resolve, reject) => {
      const run = globalThis?.google?.script?.run;

      if (!run) {
        reject(new Error('Apps Script runtime is not available in this view.'));
        return;
      }

      run
        .withSuccessHandler(resolve)
        .withFailureHandler((error) => {
          reject(new Error(error?.message || String(error)));
        })
        .createActivityTask(payload);
    });
  }

  function callGetActivityTasks(payload = {}) {
    return new Promise((resolve, reject) => {
      const run = globalThis?.google?.script?.run;

      if (!run) {
        reject(new Error('Apps Script runtime is not available in this view.'));
        return;
      }

      run
        .withSuccessHandler(resolve)
        .withFailureHandler((error) => {
          reject(new Error(error?.message || String(error)));
        })
        .getActivityTasks(payload);
    });
  }

  function callUpdateActivityTask(payload) {
    return new Promise((resolve, reject) => {
      const run = globalThis?.google?.script?.run;
      if (!run) {
        reject(new Error('Apps Script runtime is not available in this view.'));
        return;
      }
      run
        .withSuccessHandler(resolve)
        .withFailureHandler((error) => {
          reject(new Error(error?.message || String(error)));
        })
        .updateActivityTask(payload);
    });
  }

  function parseTaskItems(value) {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();

      if (!trimmed) {
        return [];
      }

      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    return [];
  }

  function normalizeTaskChecklist(value, fallback = []) {
    const items = parseTaskItems(value);

    if (items.length > 0) {
      return items
        .map((item) => ({
          label: String(item?.label || item || '').trim(),
          done: !!item?.done,
        }))
        .filter((item) => item.label);
    }

    return Array.isArray(fallback)
      ? fallback.map((item) => ({
          label: String(item?.label || '').trim(),
          done: !!item?.done,
        })).filter((item) => item.label)
      : [];
  }

  function mapCreatedTaskToUi(task, fallback) {
    const source = task || {};
    const defaultValue = fallback || {};
    const dueDateValue = normalizeDisplayDueDate(
      source.due_date || source.dueDate || defaultValue.due_date || defaultValue.dueDate || ''
    );

    return {
      id: String(source.id || defaultValue.id || '').trim(),
      userId: String(source.user_id || source.userId || defaultValue.user_id || defaultValue.userId || '').trim(),
      title: String(source.task_name || source.title || defaultValue.task_name || defaultValue.title || '').trim(),
      status: String(source.status || defaultValue.status || 'Pending'),
      dueDate: dueDateValue,
      owner: String(source.assigned_by || source.owner || defaultValue.assigned_by || defaultValue.owner || ''),
      priority: String(source.priority || defaultValue.priority || 'medium'),
      description: String(source.description || defaultValue.description || 'No description provided yet.'),
      attachments: getAttachmentNames(source.attachments || defaultValue.attachments),
      dailyChecklist: normalizeTaskChecklist(
        source.daily_checklist || source.checklist,
        defaultValue.dailyChecklist || defaultValue.checklist
      ),
    };
  }

  async function fetchAssignedTasks() {
    const user = getCurrentUser();

    if (!user?.user_id) {
      assignedTasks = [];
      assignedTasksError = '';
      return;
    }

    isLoadingAssignedTasks = true;
    assignedTasksError = '';

    try {
      const result = await callGetActivityTasks({
        user_id: user.user_id,
        email: user.email || '',
      });

      if (!result?.ok) {
        throw new Error(result?.error || 'Unable to load tasks.');
      }

      assignedTasks = Array.isArray(result.tasks)
        ? result.tasks.map((task) => mapCreatedTaskToUi(task))
        : [];

      if (
        selectedOverviewTaskTitle &&
        !assignedTasks.some((task) => task.title === selectedOverviewTaskTitle)
      ) {
        selectedOverviewTaskTitle = '';
      }

      if (viewedTaskTitle && !assignedTasks.some((task) => task.title === viewedTaskTitle)) {
        closeTaskViewForm();
      }
    } catch (error) {
      assignedTasks = [];
      assignedTasksError = error?.message || 'Unable to load tasks.';
    } finally {
      isLoadingAssignedTasks = false;
    }
  }

  async function addNewTask() {
    const rawTitle = addTaskForm.title.trim();
    const assignedBy = addTaskForm.owner.trim();
    const cleanedChecklist = addTaskForm.dailyChecklist
      .filter((item) => item.label.trim())
      .map((item) => ({ label: item.label.trim(), done: !!item.done }));
    const cleanedAttachments = getAttachmentNames(addTaskForm.attachments);

    if (!rawTitle || !addTaskForm.dueDate) {
      return;
    }

    const user = getCurrentUser();
    const nowDate = new Date();
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formattedNow = `${MONTH_NAMES[nowDate.getMonth()]} ${nowDate.getDate()}, ${nowDate.getFullYear()}`;
    const nextTaskPayload = {
      title: rawTitle,
      status: addTaskForm.status,
      due_date: addTaskForm.dueDate,
      assigned_by: assignedBy,
      owner_email: user && user.email ? user.email : '',
      priority: 'medium',
      description: addTaskForm.description.trim() || 'No description provided yet.',
      attachments: cleanedAttachments,
      dailyChecklist: cleanedChecklist,
      dateCreated: formattedNow,
      // createdBy and updatedBy will be set by backend
    };

    isSavingAddTask = true;
    addTaskError = '';

    try {
      const result = await callCreateActivityTask(nextTaskPayload);

      if (!result?.ok) {
        throw new Error(result?.error || 'Unable to save the task.');
      }

      const savedTask = mapCreatedTaskToUi(result.task, nextTaskPayload);
      const taskId = result.task?.id || '';
      
      // Save attachments to act_attachments sheet
      const attachmentErrors = [];
      if (addTaskForm.attachments.length > 0) {
        for (const attachment of addTaskForm.attachments) {
          if (attachment instanceof File) {
            try {
              const ext = attachment.name.split('.').pop()?.toLowerCase() || '';
              const sizeMB = `${(attachment.size / 1024 / 1024).toFixed(2)}MB`;
              await callAddActivityTaskAttachment({
                task_id: taskId,
                user_id: user?.user_id || '',
                file_type: ext || '',
                file_size: sizeMB,
                file_name: attachment.name,
                link: '',
                uploaded_at: nowDate.toISOString(),
                uploaded_by: user?.user_id || ''
              });
            } catch (attachError) {
              attachmentErrors.push(`${attachment.name}: ${attachError?.message || attachError}`);
            }
          }
        }
      }
      
      await fetchAssignedTasks();
      selectedOverviewTaskTitle = savedTask.title;
      activeView = 'Overview';
      isAddTaskOpen = false;
      resetAddTaskForm();
      // Log activity
      await logUserActivity({
        message: `Added a new task: ${savedTask.title}`,
        timestamp: new Date().toISOString(),
        user: user && user.email ? user.email : 'Unknown'
      });
      fetchRecentActivities();
      
      if (attachmentErrors.length > 0) {
        alert(`Task saved but some attachments failed:\n${attachmentErrors.join('\n')}`);
      }
    } catch (error) {
      addTaskError = error?.message || 'Unable to save the task.';
    } finally {
      isSavingAddTask = false;
    }
  }

  function addNewTaskChecklistItem() {
    addTaskForm = {
      ...addTaskForm,
      dailyChecklist: [...addTaskForm.dailyChecklist, { label: '', done: false }],
    };
  }

  function updateNewTaskChecklistItem(index, field, value) {
    addTaskForm = {
      ...addTaskForm,
      dailyChecklist: addTaskForm.dailyChecklist.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    };
  }

  function removeNewTaskChecklistItem(index) {
    addTaskForm = {
      ...addTaskForm,
      dailyChecklist: addTaskForm.dailyChecklist.filter((_, itemIndex) => itemIndex !== index),
    };
  }

  function handleAddTaskAttachmentUpload(event) {
    const files = Array.from(event.currentTarget.files || []);

    if (files.length === 0) {
      return;
    }

    addTaskForm = {
      ...addTaskForm,
      attachments: [...addTaskForm.attachments, ...files],
    };

    event.currentTarget.value = '';
  }

  function removeAddTaskAttachment(index) {
    addTaskForm = {
      ...addTaskForm,
      attachments: addTaskForm.attachments.filter((_, itemIndex) => itemIndex !== index),
    };
  }

  function openListWithFilter(filter) {
    statusFilter = filter;
    activeView = 'List';
  }

  function toggleListTask(taskTitle) {
    expandedListTaskTitle = expandedListTaskTitle === taskTitle ? '' : taskTitle;
  }

  function openTaskViewForm(task) {
    viewedTaskTitle = task.title;
    taskViewEditForm = {
      title: task.title,
      status: task.status,
      dueDate: toInputDate(task.dueDate),
      description: task.description,
      dailyChecklist: (task.dailyChecklist || []).map((item) => ({ ...item })),
      attachments: getAttachmentNames(task.attachments),
    };
    isViewTaskModalOpen = true;
  }

  function closeTaskViewForm() {
    isViewTaskModalOpen = false;
    viewedTaskTitle = '';
    isEditingViewedTask = false;
    taskViewEditForm = {
      title: '',
      status: 'Pending',
      dueDate: '',
      description: '',
      dailyChecklist: [],
      attachments: [],
    };
    
    // Reset the file input element
    if (taskViewFileInput) {
      taskViewFileInput.value = '';
    }
  }

  function handleTaskViewOverlayClick(event) {
    if (event.target === event.currentTarget) {
      closeTaskViewForm();
    }
  }

  function openTaskEditFromView() {
    if (!viewedTask) {
      return;
    }

    taskViewEditForm = {
      title: viewedTask.title,
      status: viewedTask.status,
      dueDate: toInputDate(viewedTask.dueDate),
      description: viewedTask.description,
      dailyChecklist: viewedTask.dailyChecklist.map((item) => ({ ...item })),
      attachments: getAttachmentNames(viewedTask.attachments),
    };
    isEditingViewedTask = true;
  }

  function cancelTaskEditFromView() {
    if (viewedTask) {
      taskViewEditForm = {
        title: viewedTask.title,
        status: viewedTask.status,
        dueDate: toInputDate(viewedTask.dueDate),
        description: viewedTask.description,
        dailyChecklist: viewedTask.dailyChecklist.map((item) => ({ ...item })),
        attachments: getAttachmentNames(viewedTask.attachments),
      };
    }

    isEditingViewedTask = false;
  }

  function addTaskViewChecklistItem() {
    taskViewEditForm = {
      ...taskViewEditForm,
      dailyChecklist: [...taskViewEditForm.dailyChecklist, { label: '', done: false }],
    };
  }

  function updateTaskViewChecklistItem(index, field, value) {
    taskViewEditForm = {
      ...taskViewEditForm,
      dailyChecklist: taskViewEditForm.dailyChecklist.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    };
  }

  function removeTaskViewChecklistItem(index) {
    taskViewEditForm = {
      ...taskViewEditForm,
      dailyChecklist: taskViewEditForm.dailyChecklist.filter((_, itemIndex) => itemIndex !== index),
    };
  }

  // Fix: Move updateTaskStatus to top-level scope
  async function updateTaskStatus(taskId, newStatus) {
    let taskIndex = assignedTasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1 && viewedTask) {
      taskIndex = assignedTasks.findIndex((t) => t.title === viewedTask.title);
    }
    if (taskIndex === -1) return;

    const task = assignedTasks[taskIndex];
    const user = getCurrentUser();
    const payload = {
      id: taskId || task.id,
      title: task.title,
      status: newStatus,
      due_date: toInputDate(task.dueDate),
      description: task.description,
      assigned_by: task.owner,
      checklist: task.dailyChecklist,
      attachments: task.attachments,
      priority: task.priority,
      user_id: task.userId || user?.user_id || '',
      owner_email: user?.email || '',
      updated_by: user?.user_id || '',
    };
    try {
      const result = await callUpdateActivityTask(payload);
      const nextTask = result?.task ? mapCreatedTaskToUi(result.task, payload) : { ...task, status: newStatus };
      assignedTasks = assignedTasks.map((t, i) =>
        i === taskIndex ? nextTask : t
      );
      if (viewedTask && viewedTask.id === (taskId || task.id)) {
        taskViewEditForm.status = newStatus;
      }
      
      // Log activity
      await logUserActivity({
        message: `Updated task status: ${task.title} → ${newStatus}`,
        timestamp: new Date().toISOString(),
        user: user && user.email ? user.email : 'Unknown'
      });
    } catch (err) {
      alert('Failed to update status: ' + (err?.message || err));
    }
  }

  function handleTaskViewAttachmentUpload(event) {
    const files = Array.from(event.currentTarget.files || []);

    if (files.length === 0) {
      return;
    }

    taskViewEditForm = {
      ...taskViewEditForm,
      attachments: [...taskViewEditForm.attachments, ...files.map((file) => file.name)],
    };

    event.currentTarget.value = '';
  }

  function removeTaskViewAttachment(index) {
    taskViewEditForm = {
      ...taskViewEditForm,
      attachments: taskViewEditForm.attachments.filter((_, itemIndex) => itemIndex !== index),
    };
  }

  function buildTaskUpdatePayload(task, formState) {
    const user = getCurrentUser();
    const cleanedChecklist = formState.dailyChecklist
      .filter((item) => item.label.trim())
      .map((item) => ({ label: item.label.trim(), done: !!item.done }));
    const cleanedAttachments = getAttachmentNames(formState.attachments);

    return {
      id: task.id,
      user_id: task.userId || user?.user_id || '',
      title: formState.title.trim() || task.title,
      status: formState.status || task.status,
      due_date: formState.dueDate || toInputDate(task.dueDate),
      description: formState.description.trim() || task.description,
      assigned_by: task.owner,
      checklist: cleanedChecklist,
      attachments: cleanedAttachments,
      priority: task.priority || 'medium',
      owner_email: user?.email || '',
      updated_by: user?.user_id || '',
    };
  }

  function applyTaskUpdateToUi(originalTitle, nextTask) {
    assignedTasks = assignedTasks.map((task) => (task.title === originalTitle ? nextTask : task));

    if (selectedOverviewTaskTitle === originalTitle) {
      selectedOverviewTaskTitle = nextTask.title;
    }

    if (expandedListTaskTitle === originalTitle) {
      expandedListTaskTitle = nextTask.title;
    }

    if (viewedTaskTitle === originalTitle) {
      viewedTaskTitle = nextTask.title;
    }
  }

  async function saveTaskEditFromView() {
    if (!viewedTask) {
      return;
    }

    const originalTitle = viewedTask.title;
    const payload = buildTaskUpdatePayload(viewedTask, taskViewEditForm);

    try {
      const result = await callUpdateActivityTask(payload);
      if (!result?.ok) {
        throw new Error(result?.error || 'Unable to save task changes.');
      }

      const nextTask = mapCreatedTaskToUi(result.task, payload);
      applyTaskUpdateToUi(originalTitle, nextTask);
      isEditingViewedTask = false;
      
      // Reset the file input element
      if (taskViewFileInput) {
        taskViewFileInput.value = '';
      }
    } catch (error) {
      alert('Failed to save task: ' + (error?.message || error));
    }
  }

  function archiveTaskFromView() {
    if (!viewedTask) {
      return;
    }

    const targetTitle = viewedTask.title;
    closeTaskViewForm();
    archiveTask(targetTitle);

    if (expandedListTaskTitle === targetTitle) {
      expandedListTaskTitle = '';
    }
  }

  function openArchiveView() {
    activeView = 'Archive';
  }

  function selectOverviewTask(task) {
    selectedOverviewTaskTitle = task.title;
    trackerMenuOpen = false;
    isEditingTrackerTask = false;
  }

  function toggleTrackerMenu() {
    trackerMenuOpen = !trackerMenuOpen;
  }

  function openTrackerEdit() {
    if (!selectedOverviewTask) {
      return;
    }

    trackerEditForm = {
      title: selectedOverviewTask.title,
      status: selectedOverviewTask.status,
      dueDate: toInputDate(selectedOverviewTask.dueDate),
      description: selectedOverviewTask.description,
      dailyChecklist: selectedOverviewTask.dailyChecklist.map((item) => ({ ...item })),
      attachments: getAttachmentNames(selectedOverviewTask.attachments),
    };
    isEditingTrackerTask = true;
    trackerMenuOpen = false;
  }

  function cancelTrackerEdit() {
    isEditingTrackerTask = false;
    
    // Reset the file input element
    if (trackerFileInput) {
      trackerFileInput.value = '';
    }
  }

  async function saveTrackerEdit() {
    if (!selectedOverviewTask) {
      return;
    }

    const originalTitle = selectedOverviewTask.title;
    const payload = buildTaskUpdatePayload(selectedOverviewTask, trackerEditForm);

    try {
      const result = await callUpdateActivityTask(payload);
      if (!result?.ok) {
        throw new Error(result?.error || 'Unable to save task changes.');
      }

      const nextTask = mapCreatedTaskToUi(result.task, payload);
      applyTaskUpdateToUi(originalTitle, nextTask);
      selectedOverviewTaskTitle = nextTask.title;
      isEditingTrackerTask = false;
      
      // Reset the file input element
      if (trackerFileInput) {
        trackerFileInput.value = '';
      }
    } catch (error) {
      alert('Failed to save task: ' + (error?.message || error));
    }
  }

  function archiveTask(targetTitle) {
    const taskToArchive = assignedTasks.find((task) => task.title === targetTitle);

    if (!taskToArchive) {
      return;
    }

    archivedTasks = [taskToArchive, ...archivedTasks.filter((task) => task.title !== targetTitle)];
    assignedTasks = assignedTasks.filter((task) => task.title !== targetTitle);

    if (selectedOverviewTaskTitle === targetTitle) {
      selectedOverviewTaskTitle = '';
    }
  }

  function restoreArchivedTask(targetTitle) {
    const taskToRestore = archivedTasks.find((task) => task.title === targetTitle);

    if (!taskToRestore) {
      return;
    }

    assignedTasks = [taskToRestore, ...assignedTasks.filter((task) => task.title !== targetTitle)];
    archivedTasks = archivedTasks.filter((task) => task.title !== targetTitle);
  }

  function handleTrackerAction(action) {
    if (action === 'edit') {
      openTrackerEdit();
      return;
    }

    if (action === 'view') {
      if (selectedOverviewTask) {
        openTaskViewForm(selectedOverviewTask);
      }

      trackerMenuOpen = false;
      return;
    }

    if (!selectedOverviewTask) {
      trackerMenuOpen = false;
      return;
    }

    const targetTitle = selectedOverviewTask.title;

    if (action === 'archive') {
      archiveTask(targetTitle);
    }

    trackerMenuOpen = false;
  }

  function toggleTrackerChecklistItem(index) {
    if (!selectedOverviewTask) {
      return;
    }

    assignedTasks = assignedTasks.map((task) => {
      if (task.title !== selectedOverviewTask.title) {
        return task;
      }

      return {
        ...task,
        dailyChecklist: task.dailyChecklist.map((item, itemIndex) =>
          itemIndex === index ? { ...item, done: !item.done } : item
        ),
      };
    });
  }

  function addChecklistItem() {
    trackerEditForm = {
      ...trackerEditForm,
      dailyChecklist: [...trackerEditForm.dailyChecklist, { label: '', done: false }],
    };
  }

  function updateChecklistItem(index, field, value) {
    trackerEditForm = {
      ...trackerEditForm,
      dailyChecklist: trackerEditForm.dailyChecklist.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    };
  }

  function removeChecklistItem(index) {
    trackerEditForm = {
      ...trackerEditForm,
      dailyChecklist: trackerEditForm.dailyChecklist.filter((_, itemIndex) => itemIndex !== index),
    };
  }

  function handleEditTaskAttachmentUpload(event) {
    const files = Array.from(event.currentTarget.files || []);

    if (files.length === 0) {
      return;
    }

    trackerEditForm = {
      ...trackerEditForm,
      attachments: [...trackerEditForm.attachments, ...files.map((file) => file.name)],
    };

    event.currentTarget.value = '';
  }

  function removeEditTaskAttachment(index) {
    trackerEditForm = {
      ...trackerEditForm,
      attachments: trackerEditForm.attachments.filter((_, itemIndex) => itemIndex !== index),
    };
  }

  $: filteredTasks = assignedTasks.filter(
    (task) => matchesStatus(task, statusFilter) && matchesSearch(task, searchQuery)
  );

  $: filteredArchivedTasks = archivedTasks.filter(
    (task) => matchesStatus(task, statusFilter) && matchesSearch(task, searchQuery)
  );

  $: pendingCount = assignedTasks.filter((task) => task.status === 'Pending').length;
  $: completedCount = assignedTasks.filter((task) => task.status === 'Completed').length;
  $: totalTaskCount = assignedTasks.length;
  $: overdueCount = assignedTasks.filter((task) => task.status === 'Overdue').length;
  $: completionRate = totalTaskCount > 0 ? Math.round((completedCount / totalTaskCount) * 100) : 0;
  $: summaryCards = [
    {
      label: 'Pending',
      value: pendingCount,
      icon: Clock,
      tone: 'indigo',
    },
    {
      label: 'Total Tasks',
      value: totalTaskCount,
      icon: Clock3,
      tone: 'green',
    },
    {
      label: 'Completed',
      value: completedCount,
      icon: CheckCircle2,
      tone: 'blue',
    },
    {
      label: 'Overdue',
      value: overdueCount,
      icon: AlertCircle,
      tone: 'violet',
    },
  ];
  $: todayDate = normalizeDate(new Date());
  $: todayTasks = assignedTasks
    .filter((task) => task.status !== 'Completed')
    .filter((task) => {
      const parsedDueDate = parseDueDate(task.dueDate);
      return parsedDueDate ? isSameCalendarDay(normalizeDate(parsedDueDate), todayDate) : false;
    })
    .slice(0, 4);
  $: overdueTasks = assignedTasks.filter((task) => task.status === 'Overdue').slice(0, 3);
  $: dueSoonTasks = [...assignedTasks]
    .filter((task) => task.status !== 'Completed')
    .sort((a, b) => {
      const aDate = parseDueDate(a.dueDate);
      const bDate = parseDueDate(b.dueDate);
      const aTime = aDate ? aDate.getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = bDate ? bDate.getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, 4);
  $: selectedOverviewTask =
    assignedTasks.find((task) => task.title === selectedOverviewTaskTitle) ||
    todayTasks[0] ||
    overdueTasks[0] ||
    dueSoonTasks[0] ||
    null;
  $: viewedTask = assignedTasks.find((task) => task.title === viewedTaskTitle) || null;

</script>

<section class="activity-shell documents-page">

  <style>
    /* Use Segoe UI for this page for a professional look */
    .activity-shell {
      font-family: 'Segoe UI', system-ui, -apple-system, 'Roboto', 'Helvetica Neue', Arial, sans-serif;
    }
  </style>
  <div class="stats-grid">
    {#each summaryCards as card}
      <article class={`stat-card tone-card-${card.tone}`}>
        <div class={`stat-icon tone-${card.tone}`}>
          <svelte:component this={card.icon} size={17} />
        </div>
        <div>
          <p class="stat-value">{card.value}</p>
          <p class="stat-label">{card.label}</p>
        </div>
      </article>
    {/each}
  </div>

  <div class="controls-bar">
    <div class="view-toggle" role="tablist" aria-label="View mode">
      <button
        type="button"
        role="tab"
        class:active={activeView === 'Overview'}
        aria-selected={activeView === 'Overview'}
        on:click={() => (activeView = 'Overview')}
      >
        <LayoutGrid size={14} />
        <span>Overview</span>
      </button>
      <button
        type="button"
        role="tab"
        class:active={activeView === 'List'}
        aria-selected={activeView === 'List'}
        on:click={() => (activeView = 'List')}
      >
        <List size={14} />
        <span>List</span>
      </button>
      <button
        type="button"
        role="tab"
        class:active={activeView === 'Archive'}
        aria-selected={activeView === 'Archive'}
        on:click={openArchiveView}
      >
        <Clock size={14} />
        <span>Archive</span>
      </button>
    </div>

    <div class="controls-right">
      <label class="search-control" aria-label="Search tasks">
        <Search size={15} />
        <input
          type="text"
          placeholder="Search"
          bind:value={searchQuery}
        />
      </label>

      <label class="status-control" aria-label="Status filter">
        <select bind:value={statusFilter}>
          {#each statusOptions as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </label>

      <button class="new-task-btn" type="button" on:click={toggleAddTaskForm}>
        <Plus size={15} />
        <span>Add Task</span>
      </button>
    </div>
  </div>

  {#if isLoadingAssignedTasks}
    <p class="empty-state">Loading saved tasks...</p>
  {:else if assignedTasksError}
    <p class="task-form-error">{assignedTasksError}</p>
  {/if}

  {#if isAddTaskOpen}
    <div class="task-view-modal-overlay" role="presentation" on:click={handleAddTaskOverlayClick}>
      <div
        class="task-view-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add task form"
      >
        <form on:submit|preventDefault={addNewTask}>
          <div class="task-view-modal-head">
            <h4>Add Task</h4>
            <div class="task-view-head-actions">
              <button type="button" class="task-view-action" on:click={cancelAddTask}>Cancel</button>
              <button type="submit" class="task-view-action primary" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;" disabled={isSavingAddTask}>
                {#if isSavingAddTask}
                  <span class="spinning-icon"><Loader2 size={16} /></span>
                {/if}
                <span>{isSavingAddTask ? 'Saving...' : 'Save Task'}</span>
              </button>
            </div>
          </div>

          {#if addTaskError}
            <p class="task-form-error">{addTaskError}</p>
          {/if}

          <div class="task-view-grid">
                        <!-- Date Created field removed -->
            <label>
              <span>Task Title</span>
              <input type="text" bind:value={addTaskForm.title} placeholder="Enter task title" required />
            </label>

            <label>
              <span>Status</span>
              <select bind:value={addTaskForm.status}>
                {#each editStatusOptions as option}
                  <option value={option}>{option}</option>
                {/each}
              </select>
            </label>

            <label>
              <span>Due Date</span>
              <input type="date" bind:value={addTaskForm.dueDate} required />
            </label>

            <label>
              <span>Assigned by</span>
              <input type="text" bind:value={addTaskForm.owner} placeholder="Who is assigning this task?" />
            </label>
          </div>

          <label class="task-view-description">
            <span>Description</span>
            <textarea rows="3" bind:value={addTaskForm.description} placeholder="Task details"></textarea>
          </label>

          <div class="task-view-section">
            <span>Checklist</span>
            <div class="tracker-checklist-editor">
              <div class="tracker-checklist-editor-head">
                <button type="button" on:click={addNewTaskChecklistItem}>+ Add item</button>
              </div>

              {#if addTaskForm.dailyChecklist.length === 0}
                <p class="overview-empty-copy">No checklist items.</p>
              {:else}
                {#each addTaskForm.dailyChecklist as item, index}
                  <div class="tracker-checklist-editor-row">
                    <input
                      type="checkbox"
                      checked={item.done}
                      on:change={() => updateNewTaskChecklistItem(index, 'done', !item.done)}
                    />
                    <input
                      type="text"
                      value={item.label}
                      on:input={(event) => updateNewTaskChecklistItem(index, 'label', event.currentTarget.value)}
                      placeholder="Checklist item"
                    />
                    <button type="button" class="remove-item" on:click={() => removeNewTaskChecklistItem(index)}>
                      Remove
                    </button>
                  </div>
                {/each}
              {/if}
            </div>
          </div>

          <div class="task-view-section">
            <span>Attachments</span>
            <div class="attachment-editor">
              <div class="attachment-editor-head">
                <label class="attachment-upload-btn" for="add-task-file-upload">Upload files</label>
                <input
                  id="add-task-file-upload"
                  class="hidden-file-input"
                  type="file"
                  multiple
                  on:change={handleAddTaskAttachmentUpload}
                  bind:this={addTaskFileInput}
                />
              </div>

              {#if addTaskForm.attachments.length === 0}
                <p class="overview-empty-copy">No attachments.</p>
              {:else}
                <ul class="attachment-list">
                  {#each addTaskForm.attachments as attachment, index}
                    <li>
                      {#if attachment instanceof File}
                        <span>
                          {attachment.name} 
                          <span style="font-size: 0.85rem; color: var(--color-muted);">
                            ({attachment.name.split('.').pop()?.toUpperCase() } - {(attachment.size / 1024 / 1024).toFixed(2)}MB)
                          </span>
                        </span>
                      {:else}
                        <span>{attachment}</span>
                      {/if}
                      <button type="button" class="remove-item" on:click={() => removeAddTaskAttachment(index)}>
                        Remove
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          </div>

        </form>
      </div>
    </div>
  {/if}

  <div class="documents-grid">
    <section class="panel tasks-panel">
      <header class="panel-header tasks-header">
        <h3>My Tasks</h3>
        {#if activeView === 'Archive'}
          <div class="tasks-header-columns" aria-hidden="true">
            <span>Status</span>
            <span>{activeView === 'Archive' ? 'Restore' : 'Attachment'}</span>
            <span>Due Date</span>
          </div>
        {/if}
      </header>

      {#if activeView === 'Overview'}
        <div class="overview-shell">
          <div class="overview-panels">
            <section class="overview-panel" style="background: var(--color-surface);">
              <h4 style="display: flex; align-items: center; gap: 0.5rem;">
                <LayoutGrid size={18} style="color: #0f6cbd; background: color-mix(in srgb, #0f6cbd 10%, var(--color-surface)); border-radius: 0.4rem; padding: 0.18rem;" />
                Today's Task
              </h4>
              {#if todayTasks.length === 0}
                <p class="overview-empty-copy">No tasks with today's deadline.</p>
              {:else}
                <ul>
                  {#each todayTasks as task}
                    <li>
                      <button
                        type="button"
                        class:active={selectedOverviewTask?.title === task.title}
                        class="overview-task-link"
                        on:click={() => selectOverviewTask(task)}
                      >
                        <span>{task.title}</span>
                        <small>{formatDueDate(task.dueDate)}</small>
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </section>

            <section class="overview-panel">
              <h4 style="display: flex; align-items: center; gap: 0.5rem;">
                <Clock size={18} style="color: #22c55e; background: color-mix(in srgb, #22c55e 10%, var(--color-surface)); border-radius: 0.4rem; padding: 0.18rem;" />
                Due Soon
              </h4>
              {#if dueSoonTasks.length === 0}
                <p class="overview-empty-copy">No upcoming due dates.</p>
              {:else}
                <ul>
                  {#each dueSoonTasks as task}
                    <li>
                      <button
                        type="button"
                        class:active={selectedOverviewTask?.title === task.title}
                        class="overview-task-link"
                        on:click={() => selectOverviewTask(task)}
                      >
                        <span>{task.title}</span>
                        <small>{formatDueDate(task.dueDate)}</small>
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </section>

            <section class="overview-panel notes-panel">
              <div class="notes-header" style="display: flex; align-items: center; gap: 0.5rem;">
                <List size={18} style="color: #0f6cbd; background: color-mix(in srgb, #0f6cbd 10%, var(--color-surface)); border-radius: 0.4rem; padding: 0.18rem;" />
                <div class="notes-title">Recent Activity</div>
              </div>
              <div class="recent-activity-list" style="margin-bottom: 0.5rem; max-height: 180px; overflow-y: auto; overflow-x: hidden;">
                {#if recentActivities.length === 0}
                  <p class="overview-empty-copy">No recent activities yet.</p>
                {:else}
                  <ul style="list-style: none; padding: 0; margin: 0;">
                    {#each recentActivities.slice(0, 3) as activity (activity.id)}
                      <li style="margin-bottom: 0.8rem; display: flex; align-items: flex-start; gap: 0.5rem;">
                        <span style="font-size: 1.1rem; color: var(--color-primary, #0f6cbd); margin-top: 0.1rem;">•</span>
                        <div style="flex: 1;">
                                <div style="font-size: 0.9rem; font-style: italic; color: var(--color-text);">{formatActivityLine(activity)}</div>
                              </div>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            </section>
          </div>

          {#if selectedOverviewTask}
            <section class="overview-tracker tracker-card">
              <div class="tracker-card-head" style="display: flex; align-items: center; gap: 0.5rem;">
                <div class="tracker-card-heading" style="display: flex; align-items: center; gap: 0.5rem;">
                  <LayoutGrid size={18} style="color: #0f6cbd; background: color-mix(in srgb, #0f6cbd 10%, var(--color-surface)); border-radius: 0.4rem; padding: 0.18rem;" />
                  <h4 style="margin: 0;">Task Focus</h4>
                </div>
                <div class="tracker-head-actions">
                  <span class={`status-pill ${statusClassMap[selectedOverviewTask.status]}`}>
                    {selectedOverviewTask.status}
                  </span>
                  <button
                    type="button"
                    class="tracker-menu-trigger"
                    aria-label="Tracker task actions"
                    aria-expanded={trackerMenuOpen}
                    on:click={toggleTrackerMenu}
                  >
                    <MoreHorizontal size={14} />
                  </button>

                  {#if trackerMenuOpen}
                    <div class="tracker-menu">
                      <button type="button" on:click={() => handleTrackerAction('view')}>
                        View Task
                      </button>
                    </div>
                  {/if}
                </div>
              </div>

              {#if isEditingTrackerTask}
                <div class="tracker-form">
                  <label>
                    <span>Task Title</span>
                    <input type="text" bind:value={trackerEditForm.title} />
                  </label>

                  <div class="tracker-form-grid">
                    <label>
                      <span>Status</span>
                      <select bind:value={trackerEditForm.status}>
                        {#each editStatusOptions as option}
                          <option value={option}>{option}</option>
                        {/each}
                      </select>
                    </label>

                    <label>
                      <span>Due Date</span>
                      <input type="date" bind:value={trackerEditForm.dueDate} />
                    </label>
                  </div>

                  <label>
                    <span>Description</span>
                    <textarea rows="3" bind:value={trackerEditForm.description}></textarea>
                  </label>

                  <div class="tracker-checklist-editor">
                    <div class="tracker-checklist-editor-head">
                      <span>Checklist</span>
                      <button type="button" on:click={addChecklistItem}>+ Add item</button>
                    </div>

                    {#each trackerEditForm.dailyChecklist as item, index}
                      <div class="tracker-checklist-editor-row">
                        <input
                          type="checkbox"
                          checked={item.done}
                          on:change={() => updateChecklistItem(index, 'done', !item.done)}
                        />
                        <input
                          type="text"
                          value={item.label}
                          on:input={(event) => updateChecklistItem(index, 'label', event.currentTarget.value)}
                          placeholder="Checklist item"
                        />
                        <button type="button" class="remove-item" on:click={() => removeChecklistItem(index)}>
                          Remove
                        </button>
                      </div>
                    {/each}
                  </div>

                  <div class="attachment-editor">
                    <div class="attachment-editor-head">
                      <span>Attachments</span>
                      <label class="attachment-upload-btn" for="edit-task-file-upload">Upload files</label>
                      <input
                        id="edit-task-file-upload"
                        class="hidden-file-input"
                        type="file"
                        multiple
                        on:change={handleEditTaskAttachmentUpload}
                        bind:this={trackerFileInput}
                      />
                    </div>

                    {#if trackerEditForm.attachments.length === 0}
                      <p class="overview-empty-copy">No attachments yet.</p>
                    {:else}
                      <ul class="attachment-list">
                        {#each trackerEditForm.attachments as fileName, index}
                          <li>
                            <span>{fileName}</span>
                            <button type="button" class="remove-item" on:click={() => removeEditTaskAttachment(index)}>
                              Remove
                            </button>
                          </li>
                        {/each}
                      </ul>
                    {/if}
                  </div>

                  <div class="tracker-form-actions">
                    <button type="button" class="secondary" on:click={cancelTrackerEdit}>Cancel</button>
                    <button type="button" class="primary" on:click={saveTrackerEdit}>Save</button>
                  </div>
                </div>
              {:else}
                <div class="tracker-summary">
                  <p class="tracker-title">{selectedOverviewTask.title}</p>
                  <p class="tracker-description" style="color: var(--color-text); margin-bottom: 0.25em; line-height: 1.4;">{selectedOverviewTask.description}</p>
                  <p class="tracker-meta due-attachment-meta">
                    <span class="due-label">Due {selectedOverviewTask.dueDate}</span>
                    <span aria-hidden="true">•</span>
                    <span class="attachment-label">{formatAttachmentMeta(selectedOverviewTask.attachments)}</span>
                  </p>
                </div>
              {/if}
            </section>
          {/if}
        </div>
      {:else if activeView === 'List'}
        <div class="task-list" role="table" aria-label="Assigned tasks list">
          {#if filteredTasks.length === 0}
            <p class="empty-state">No tasks found for current filter.</p>
          {:else}
            {#each filteredTasks as task}
                <div class="task-accordion-item" class:expanded={expandedListTaskTitle === task.title}>
                <button
                  class="task-accordion-trigger"
                  type="button"
                  on:click={() => toggleListTask(task.title)}
                >
                  <span class="task-trigger-left">
                    <span class="task-dot"></span>
                    <span class="task-trigger-title">{task.title}</span>
                  </span>
                  <span class="chevron-corner">
                    <svelte:component
                      this={ChevronDown}
                      size={15}
                      class={expandedListTaskTitle === task.title ? 'chevron-open' : ''}
                    />
                  </span>
                </button>

                {#if expandedListTaskTitle === task.title}
                  <div class="task-accordion-body-modern">
                    <div class="task-accordion-meta-modern">
                      <span class={`status-chip ${statusClassMap[task.status]}`}>{task.status}</span>
                      <span>Due {task.dueDate}</span>
                    </div>
                    <div class="task-description-row">
                      <p class="task-description-modern">{task.description}</p>
                      {#if task.dateCreated}
                        <p class="task-meta-modern" style="font-style: italic; color: var(--color-muted); font-size: 0.92em; margin-bottom: 0.2em;">
                          Date Created: {task.dateCreated}
                        </p>
                      {/if}
                      <button type="button" class="task-view-form-btn" on:click={() => openTaskViewForm(task)}>
                        View Task
                      </button>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      {:else}
        <div class="task-list" role="table" aria-label="Archived tasks list">
          {#if filteredArchivedTasks.length === 0}
            <p class="empty-state">No archived tasks yet.</p>
          {:else}
            {#each filteredArchivedTasks as task}
              <div class="task-row archived-row" role="row">
                <span role="cell" class="task-name">{task.title}</span>
                <span role="cell" class={`status-pill ${statusClassMap[task.status]}`}>{task.status}</span>
                <button role="cell" type="button" class="attachment-btn" on:click={() => restoreArchivedTask(task.title)}>
                  Restore
                </button>
                <span role="cell" class="task-due">{formatDueDate(task.dueDate)}</span>
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    </section>

    {#if activeView === 'Overview'}
    <!-- Daily Work Logs Card -->
    <section class="panel daily-logs-panel">
      <header class="panel-header">
        <h3>Daily Work Logs</h3>
      </header>
      <div class="daily-logs-content">
        <!-- Add Work Log Card -->
        <div class="worklog-card worklog-form-card">
          <h4 class="worklog-card-head">
            <span class="wl-icon"><FileEdit size={13} /></span>
            Add Work Log
          </h4>
          <form on:submit|preventDefault={handleAddWorkLog}>
              <label class="form-group">
                <span class="form-label">Task</span>
                <textarea class="form-textarea" bind:value={workLogTask} placeholder="Task worked on" rows="2"></textarea>
              </label>
              <label class="form-group">
                <span class="form-label">Notes</span>
                <textarea class="form-textarea" bind:value={workLogNotes} placeholder="Notes" rows="2"></textarea>
              </label>
              <label class="form-group">
                <span class="form-label">Learnings</span>
                <textarea class="form-textarea" bind:value={workLogLearnings} placeholder="What did you learn today?" rows="2"></textarea>
              </label>
              <div class="form-group">
                <span class="form-label">Attachment</span>
                <label class="file-label" for="work-log-file-upload">
                  <FileEdit size={13} />
                  Upload files
                </label>
                <input id="work-log-file-upload" class="file-input" type="file" multiple on:change={handleWorkLogFileUpload} bind:this={workLogFileInput} />
                {#if workLogAttachments.length > 0}
                  <div style="margin-top: 0.6rem; display:flex; flex-direction:column; gap:0.45rem;">
                    {#each workLogAttachments as att, idx}
                      <div class="worklog-attachment-row" style="display:flex; align-items:center; gap:0.6rem;">
                        <div style="flex:1; min-width:0; display:flex; gap:0.6rem; align-items:center;">
                          <div style="font-size:0.82rem; color:var(--color-muted); width:56px; text-align:center;">{getFileExtension_(att.name) || (att.file.type || '').split('/').pop() || 'file'}</div>
                          <input
                            type="text"
                            class="worklog-attachment-name-input"
                            value={att.name}
                            on:input={(e) => renameWorkLogAttachment(idx, e.currentTarget.value)}
                            style="width:100%; padding:0.4rem 0.6rem; border-radius:0.45rem; border:1px solid var(--color-border); background:var(--color-surface); color:var(--color-text);"
                          />
                          <div style="font-size:0.82rem; color:var(--color-muted); white-space:nowrap;">{(att.file.size / 1024 / 1024).toFixed(2)} MB</div>
                        </div>
                        <div style="display:flex; gap:0.4rem;">
                          <button type="button" class="ghost btn-compact" on:click={() => removeWorkLogAttachment(idx)} aria-label="Remove attachment">Remove</button>
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
              <button type="submit" class="submit-worklog-btn" disabled={isSavingWorkLog}>
                {#if isSavingWorkLog}
                  <span class="spinning-icon"><Loader2 size={16} /></span>
                {/if}
                <span>{isSavingWorkLog ? 'Saving...' : 'Submit'}</span>
              </button>
            </form>
        </div>
        <!-- Work Logs Card -->
        <div class="worklog-card worklog-list-card">
          <div class="worklog-list-head">
            <h4 class="worklog-card-head">
              <span class="wl-icon"><BookOpen size={13} /></span>
              Work Logs
            </h4>
            <div class="wl-filters">
              <label class="wl-search-box">
                <Search size={13} />
                <input type="text" placeholder="Search task, notes, learnings..." bind:value={workLogFilterKeyword} />
              </label>
              <input class="wl-date-input" type="date" bind:value={workLogFilterDate} />
            </div>
          </div>
          {#if filteredWorkLogs.length === 0}
            <p class="worklogs-empty">No work logs found for current filter.</p>
          {:else}
            <div class="worklogs-accordion-list">
              {#each filteredWorkLogs as log, idx}
                <div class="worklog-accordion-item {expandedWorkLog === idx ? 'expanded' : ''}" role="group" on:mouseenter={() => hoveredWorkLog = idx} on:mouseleave={() => hoveredWorkLog = null}>
                  <button class="worklog-accordion-trigger" type="button" aria-expanded={expandedWorkLog === idx} on:click={() => expandedWorkLog = expandedWorkLog === idx ? null : idx}>
                    <span class="worklog-title-meta">
                      <span class="worklog-task-title">{log.task}</span>
                      <span class="worklog-date">{formatWorklogDate(log.date)}</span>
                    </span>
                    <span class="chevron-corner">
                      <span class="chevron-corner">
                        <svelte:component this={ChevronDown} size={16} class={expandedWorkLog === idx ? 'chevron-open' : ''} />
                      </span>
                    </span>
                  </button>
                  {#if expandedWorkLog === idx}
                    <div class="worklog-accordion-body">
                      <div class="worklog-section">
                        <span class="worklog-label">Notes</span>
                        <div class="worklog-notes">{log.notes}</div>
                      </div>
                      <div class="worklog-section">
                        <span class="worklog-label">Learnings</span>
                        <div class="worklog-learnings">{log.learnings}</div>
                      </div>
                      {#if log.attachments && log.attachments.length > 0}
                        <div class="worklog-section">
                          <span class="worklog-label">Attachments ({log.attachments.length})</span>
                          <div class="worklog-attachments">
                            {#each log.attachments as file}
                              <div class="worklog-attachment-item">
                                <div class="worklog-attachment-main">
                                  <span class="worklog-attachment-name">
                                    {file.file_name || `${file.file_type || 'file'}`}
                                  </span>
                                  <span class="worklog-attachment-meta">
                                    {file.file_type || 'file'} • {file.file_size || ''}
                                  </span>
                                </div>
                                <div class="worklog-attachment-actions">
                                  {#if file.link}
                                    <a
                                      class="worklog-attachment-action"
                                      href={file.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      aria-label="View attachment"
                                      title="View"
                                    >
                                      <ExternalLink size={14} />
                                    </a>
                                    <a
                                      class="worklog-attachment-action"
                                      href={getDriveDownloadUrl(file.link)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      aria-label="Download attachment"
                                      title="Download"
                                    >
                                      <Download size={14} />
                                    </a>
                                  {:else}
                                    <span class="worklog-attachment-chip">No link</span>
                                  {/if}
                                </div>
                              </div>
                            {/each}
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>

      <style>
        .worklogs-empty {
          color: var(--color-muted);
          font-size: 0.92rem;
          margin: 1.2rem 0 0 0.2rem;
        }
        .worklogs-accordion-list {
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
        }
        .worklog-accordion-item {
          border-radius: 0.7rem;
          transition: box-shadow 0.15s, border-color 0.15s, background 0.15s;
          box-shadow: 0 2px 8px -6px rgba(60,72,100,0.08);
          overflow: hidden;
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          position: relative;
        }
        :global(html.dark) .worklog-accordion-item {
          border: 1px solid #ffffff0f !important;
          background: #161c27 !important;
        }
        .worklog-accordion-item.expanded,
        .worklog-accordion-item:hover {
          border-color: var(--color-accent);
          background: color-mix(in srgb, var(--color-border) 30%, var(--color-surface));
        }
        :global(html.dark) .worklog-accordion-item.expanded,
        :global(html.dark) .worklog-accordion-item:hover {
          border-color: #38bdf8 !important;
          background: #1e2736 !important;
          box-shadow: 0 4px 16px -8px rgba(56,189,248,0.2) !important;
        }
        }
        .worklog-accordion-trigger {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.7rem;
          text-align: left;
          background: transparent;
          border: none;
          outline: none;
          padding: 0.9rem 1rem;
          cursor: pointer;
          font-family: inherit;
          font-size: 1rem;
          font-weight: 600;
          color: var(--color-heading);
          transition: background 0.12s;
          position: relative; /* allow absolutely-positioned chevron inside */
        }
        :global(html.dark) .worklog-accordion-trigger {
          color: #e5edf8 !important;
        }
        .worklog-title-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.13rem;
        }
        /* Corner chevron common style used for both task and worklog items */
        .chevron-corner {
          position: absolute;
          top: 12px;
          right: 14px;
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          color: var(--color-muted);
          background: transparent;
          transition: background 0.12s, color 0.12s, transform 0.12s;
          pointer-events: none; /* let the button handle clicks */
        }

        .worklog-accordion-item:hover .chevron-corner,
        .worklog-accordion-item.expanded .chevron-corner {
          color: var(--color-accent);
        }

        /* Ensure content doesn't overlap the chevron */
        .worklog-accordion-trigger {
          padding: 1.05rem 1.4rem;
          padding-right: 3.4rem;
        }

        /* also ensure task accordion trigger supports corner chevron */
        .task-accordion-trigger {
          position: relative;
        }
        .worklog-task-title {
          font-size: 1rem;
          font-weight: 700;
          color: var(--color-heading);
          margin-bottom: 0.1rem;
        }
        :global(html.dark) .worklog-task-title {
          color: #e5edf8 !important;
        }
        .worklog-date {
          font-size: 0.85rem;
          color: var(--color-muted);
          font-weight: 500;
        }
        :global(html.dark) .worklog-date {
          color: #8eaec9 !important;
        }
        .worklog-accordion-body {
          padding: 0.7rem 1.2rem 1.1rem 2.1rem;
          background: var(--color-soft);
          border-top: 1px solid var(--color-border);
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
          animation: fadeIn 0.18s;
        }
        :global(html.dark) .worklog-accordion-body {
          background: #0d1117 !important;
          border-top: 1px solid #ffffff0f !important;
        }
        .worklog-section {
          margin-bottom: 0.1rem;
        }
        .worklog-label {
          display: inline-block;
          font-size: 0.89rem;
          font-weight: 700;
          color: var(--color-heading);
          margin-bottom: 0.18rem;
        }
        :global(html.dark) .worklog-label {
          color: #e5edf8 !important;
        }
        .worklog-notes, .worklog-learnings {
          font-size: 0.97rem;
          color: var(--color-text);
          margin-left: 0.1rem;
          margin-bottom: 0.1rem;
          line-height: 1.5;
          font-style: normal;
        }
        :global(html.dark) .worklog-notes, :global(html.dark) .worklog-learnings {
          color: #cfdceb !important;
        }
        .worklog-attachment-chip {
          border-radius: 0.5rem;
          padding: 0.18rem 0.7rem;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.13s, border-color 0.13s;
          background: var(--color-border);
          color: var(--color-accent);
          border: 1px solid var(--color-border);
        }
        :global(html.dark) .worklog-attachment-chip {
          background: #1e2736 !important;
          color: #38bdf8 !important;
          border: 1px solid #ffffff1a !important;
        }
        .worklog-attachment-chip:focus,
        .worklog-attachment-chip:hover {
          background: var(--color-border);
          border-color: var(--color-accent);
          outline: none;
          color: var(--color-accent);
        }
        :global(html.dark) .worklog-attachment-chip:focus,
        :global(html.dark) .worklog-attachment-chip:hover {
          background: #1e2736 !important;
          border-color: #38bdf8 !important;
          outline: none;
          color: #38bdf8 !important;
        }
        .worklog-attachments {
          display: grid;
          gap: 0.6rem;
          margin-top: 0.2rem;
        }

        .worklog-attachment-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.8rem;
          padding: 0.5rem 0.7rem;
          border-radius: 0.7rem;
          background: color-mix(in srgb, var(--color-border) 35%, var(--color-surface));
          border: 1px solid var(--color-border);
        }

        :global(html.dark) .worklog-attachment-item {
          background: #1e2736 !important;
          border: 1px solid #ffffff1a !important;
        }

        .worklog-attachment-main {
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
          min-width: 0;
        }

        .worklog-attachment-name {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--color-heading);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        :global(html.dark) .worklog-attachment-name {
          color: #e5edf8 !important;
        }

        .worklog-attachment-meta {
          font-size: 0.78rem;
          color: var(--color-muted);
          font-weight: 600;
        }

        .worklog-attachment-actions {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          flex-shrink: 0;
        }

        .worklog-attachment-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 0.55rem;
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          color: var(--color-accent);
          transition: transform 0.12s, background 0.12s, border-color 0.12s;
        }

        .worklog-attachment-action:hover {
          background: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface));
          border-color: var(--color-accent);
          transform: translateY(-1px);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: none; }
        }
      </style>
      </div>
    </section>
    {/if}
  </div>
</section>

{#if isViewTaskModalOpen && viewedTask}
  <div class="task-view-modal-overlay" role="presentation" on:click={handleTaskViewOverlayClick}>
    <div
      class="task-view-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Task details form"
    >
      <div class="task-view-modal-head">
        <h4>Task Details</h4>
        <div class="task-view-head-actions">
          {#if isEditingViewedTask}
            <button type="button" class="task-view-action" on:click={saveTaskEditFromView}>Save</button>
            <button type="button" class="task-view-action" on:click={cancelTaskEditFromView}>Cancel</button>
          {:else}
            <button type="button" class="task-view-action" on:click={openTaskEditFromView}>Edit Task</button>
            <button type="button" class="task-view-action danger" on:click={archiveTaskFromView}>Archive Task</button>
          {/if}
          <button type="button" class="task-view-close" on:click={closeTaskViewForm}>Close</button>
        </div>
      </div>

      <div class="task-view-grid">
        <label>
          <span>Task Title</span>
          <input type="text" bind:value={taskViewEditForm.title} readonly={!isEditingViewedTask} />
        </label>

        <label>
          <span>Status</span>
          {#if isEditingViewedTask}
            <select bind:value={taskViewEditForm.status} on:change={async (e) => {
              let value = '';
              if (e.target && typeof e.target === 'object' && 'value' in e.target) {
                value = String(e.target.value);
              }
              await updateTaskStatus(viewedTask.id, value);
              // Optionally update local state/UI here
            }}>
              {#each editStatusOptions as option}
                <option value={option}>{option}</option>
              {/each}
            </select>
          {:else}
            <input type="text" value={viewedTask.status} readonly />
          {/if}
        </label>

        <label>
          <span>Due Date</span>
          {#if isEditingViewedTask}
            <input type="date" bind:value={taskViewEditForm.dueDate} />
          {:else}
            <input type="text" value={formatDueDate(viewedTask.dueDate)} readonly />
          {/if}
        </label>

        <label>
          <span>Assigned by</span>
          <input type="text" value={getUserFullName(viewedTask.owner) || viewedTask.owner} readonly />
        </label>
      </div>

      <label class="task-view-description">
        <span>Description</span>
        <textarea rows="3" bind:value={taskViewEditForm.description} readonly={!isEditingViewedTask}></textarea>
      </label>

      <div class="task-view-section">
        <span>Checklist</span>
        {#if isEditingViewedTask}
          <div class="tracker-checklist-editor">
            <div class="tracker-checklist-editor-head">
              <button type="button" on:click={addTaskViewChecklistItem}>+ Add item</button>
            </div>

            {#if taskViewEditForm.dailyChecklist.length === 0}
              <p class="overview-empty-copy">No checklist items.</p>
            {:else}
              {#each taskViewEditForm.dailyChecklist as item, index}
                <div class="tracker-checklist-editor-row">
                  <input
                    type="checkbox"
                    checked={item.done}
                    on:change={() => updateTaskViewChecklistItem(index, 'done', !item.done)}
                  />
                  <input
                    type="text"
                    value={item.label}
                    on:input={(event) => updateTaskViewChecklistItem(index, 'label', event.currentTarget.value)}
                    placeholder="Checklist item"
                  />
                  <button type="button" class="remove-item" on:click={() => removeTaskViewChecklistItem(index)}>
                    Remove
                  </button>
                </div>
              {/each}
            {/if}
          </div>
        {:else if viewedTask.dailyChecklist.length === 0}
          <p class="overview-empty-copy">No checklist items.</p>
        {:else}
          <ul>
            {#each viewedTask.dailyChecklist as item}
              <li>
                <input type="checkbox" checked={item.done} disabled />
                <span>{item.label}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="task-view-section">
        <span>Attachments</span>
        {#if isEditingViewedTask}
          <div class="attachment-editor">
            <div class="attachment-editor-head">
              <label class="attachment-upload-btn" for="view-task-file-upload">Upload files</label>
              <input
                id="view-task-file-upload"
                class="hidden-file-input"
                type="file"
                multiple
                on:change={handleTaskViewAttachmentUpload}
                bind:this={taskViewFileInput}
              />
            </div>

            {#if taskViewEditForm.attachments.length === 0}
              <p class="overview-empty-copy">No attachments.</p>
            {:else}
              <ul class="attachment-list">
                {#each taskViewEditForm.attachments as fileName, index}
                  <li>
                    <span>{fileName}</span>
                    <button type="button" class="remove-item" on:click={() => removeTaskViewAttachment(index)}>
                      Remove
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {:else if viewedTask.attachments.length === 0}
          <p class="overview-empty-copy">No attachments.</p>
        {:else}
          <ul class="attachment-list">
            {#each viewedTask.attachments as fileName}
              <li><span>{fileName}</span></li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </div>
{/if}

  <style>
  .notes-panel {
    border: 1px solid var(--color-border);
    border-radius: 1.1rem;
    box-shadow: 0 2px 12px 0 rgba(60, 72, 100, 0.07);
    padding: 1.2rem 1.3rem 1.1rem 1.3rem;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    min-height: 210px;
    gap: 0.7rem;
    background: var(--color-surface);
  }
  :global(html.dark) .notes-panel {
    background: #161c27 !important;
    border: 1px solid #ffffff0f !important;
  }
  .notes-header {
    display: flex;
    align-items: flex-start;
    gap: 0.9rem;
    margin-bottom: 0.2rem;
  }
  .notes-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, #dbeafe 50%, var(--color-surface));
    border-radius: 0.7rem;
    width: 2.5rem;
    height: 2.5rem;
  }
  .notes-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-heading);
    margin-bottom: 0.1rem;
    letter-spacing: 0.01em;
  }
  .notes-subtitle {
    font-size: 0.86rem;
    color: var(--color-muted);
    font-weight: 500;
    margin-bottom: 0.1rem;
  }
  .notes-textarea-wrap {
    background: var(--color-soft);
    border-radius: 0.7rem;
    padding: 0.7rem 0.7rem 0.5rem 0.7rem;
    border: 1.5px solid var(--color-border);
  }
  .notes-textarea {
    width: 100%;
    border: none;
    background: transparent;
    font-size: 0.9rem;
    color: var(--color-text);
    min-height: 90px;
    resize: vertical;
    outline: none;
    font-family: 'Segoe UI', system-ui, -apple-system, 'Roboto', 'Helvetica Neue', Arial, sans-serif;
    font-weight: 500;
  }
  .notes-textarea::placeholder {
    color: var(--color-muted);
    font-size: 0.9rem;
    font-family: 'Segoe UI', system-ui, -apple-system, 'Roboto', 'Helvetica Neue', Arial, sans-serif;
    font-weight: 500;
    opacity: 1;
  }
  :global(html) {
    font-family: 'Inter', 'Roboto', 'Segoe UI', Arial, sans-serif;
    --color-bg: #f7fbff;
    --color-surface: #ffffff;
    --color-soft: #f4f8fc;
    --color-card: #ffffff;
    --color-border: #d8e2ef;
    --color-heading: #0f172a;
    --color-text: #1f2937;
    --color-muted: #5f7188;
    --color-accent: #0f6cbd;
    --color-accent-bg: #d8ebff;
    --color-danger: #ef4444;
    --color-success: #22c55e;
    --color-warning: #f59e42;
    background: var(--color-app-bg);
    color: var(--color-text);
    scrollbar-gutter: stable;
  }
  :global(html.dark) {
    --color-bg: #0d1117;
    --color-surface: #161c27;
    --color-soft: #1e2736;
    --color-card: #1e2736;
    --color-border: #ffffff1a;
    --color-heading: #e5edf8;
    --color-text: #cfdceb;
    --color-muted: #9ab0cb;
    --color-accent: #7cc3ff;
    --color-accent-bg: #1e2736;
    --color-danger: #ef4444;
    --color-success: #22c55e;
    --color-warning: #f59e42;
    background: var(--color-app-bg);
    color: #cfdceb;
  }

  .activity-shell {
    position: relative;
    border-radius: 1.25rem;
    padding: 0.35rem;
    isolation: isolate;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .activity-shell::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -2;
    border-radius: 1.25rem;
    background: var(--color-app-bg);
  }

  .activity-shell::after {
    display: none;
  }

  :global(html.dark) .activity-shell::before {
    background: var(--color-app-bg);
  }

  :global(html.dark) .activity-shell::after {
    display: none;
  }

  .documents-page {
    display: grid;
    gap: 1.1rem;
    align-content: start;
  }

  .stats-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    align-items: stretch;
  }

  .stat-card,
  .panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 1.1rem;
    box-shadow: 0 18px 36px -30px rgba(15, 23, 42, 0.42);
    /* Ensure all corners are equally rounded */
    -webkit-border-radius: 1.1rem;
    -moz-border-radius: 1.1rem;
    border-bottom-left-radius: 1.1rem;
    border-bottom-right-radius: 1.1rem;
    border-top-left-radius: 1.1rem;
    border-top-right-radius: 1.1rem;
  }

  .stat-card {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 1.1rem 1.2rem;
    min-height: 5.45rem;
    transition: transform 0.22s ease, box-shadow 0.22s ease;
  }

  :global(html.dark) .stat-card {
    background: #161c27 !important;
    border-color: #ffffff0f !important;
    box-shadow: 0 18px 36px -20px rgba(0,0,0,0.5) !important;
  }

  .stat-card::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 3px;
    opacity: 0.9;
  }

  .tone-card-indigo::before {
    background: linear-gradient(90deg, #0f6cbd, #38bdf8);
  }

  .tone-card-green::before {
    background: linear-gradient(90deg, #0d9488, #10b981);
  }

  .tone-card-blue::before {
    background: linear-gradient(90deg, #1d4ed8, #3b82f6);
  }

  .tone-card-violet::before {
    background: linear-gradient(90deg, #0891b2, #22d3ee);
  }

  .stat-card:hover {
    transform: translateY(-2px);
  }

  :global(html.dark) .stat-card:hover {
    border-color: #ffffff1a !important;
  }

  .panel {
    transition: box-shadow 0.22s ease, border-color 0.22s ease;
  }

  .panel:hover {
    box-shadow: 0 20px 38px -28px rgba(15, 23, 42, 0.48);
  }

  .stat-icon,
  .file-icon,
  .upload-icon-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.75rem;
  }

  .stat-icon {
    width: 2.2rem;
    height: 2.2rem;
    border-bottom: 2px solid transparent;
  }
  
  .submit-worklog-btn {
    font-size: 0.97rem;
    font-weight: 600;
    color: #fff;
    background: #0f6cbd;
    border: none;
    border-radius: 0.5rem;
    padding: 0.5rem 1.3rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    transition: all 0.2s;
  }
  
  .submit-worklog-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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

  .stat-value {
    margin: 0;
    color: var(--color-heading);
    font-size: 1.7rem;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.01em;
    text-shadow: 0 1px 2px rgba(17,24,39,0.10);
  }

  :global(html.dark) .stat-value {
    color: #e5edf8 !important;
    text-shadow: none;
  }

  .stat-label {
    margin: 0.15rem 0 0;
    color: var(--color-muted);
    font-size: 0.86rem;
    font-weight: 700;
  }

  :global(html.dark) .stat-label {
    color: #8eaec9 !important;
  }

  .documents-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: 1fr;
  }

  .controls-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    flex-wrap: wrap;
    padding: 0.85rem 0.95rem;
    border-radius: 0.95rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    box-shadow: 0 14px 28px -26px rgba(15, 23, 42, 0.4);
  }

  :global(html.dark) .controls-bar {
    border: 1px solid #ffffff0f !important;
    background: #161c27 !important;
  }

  .controls-right {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    margin-left: auto;
  }

  .search-control,
  .status-control select,
  .new-task-btn,
  .view-toggle button {
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: 0.7rem;
    min-height: 2.25rem;
  }

  .search-control {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0 0.7rem;
    color: var(--color-muted);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.7rem;
  }

  :global(html.dark) .search-control {
    background: #161c27 !important;
    border-color: #ffffff0f !important;
  }

  .search-control input {
    border: 0;
    background: transparent;
    color: var(--color-text);
    font-size: 0.85rem;
    width: 12rem;
    outline: none;
  }

  :global(html.dark) .search-control input {
    color: #e5edf8 !important;
  }

  .status-control {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .status-control::after {
    content: '';
    position: absolute;
    right: 0.75rem;
    width: 0.42rem;
    height: 0.42rem;
    border-right: 1.8px solid var(--color-muted);
    border-bottom: 1.8px solid var(--color-muted);
    transform: rotate(45deg) translateY(-0.08rem);
    pointer-events: none;
  }

  .status-control select {
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    padding: 0 1.85rem 0 0.75rem;
    color: var(--color-text);
    font-size: 0.84rem;
    cursor: pointer;
    outline: none;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.7rem;
  }

  :global(html.dark) .status-control select {
    background: #161c27 !important;
    border: 1px solid #ffffff0f !important;
    color: #e5edf8 !important;
  }

  .new-task-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0 0.75rem;
    color: #ffffff;
    background: linear-gradient(90deg, #0f6cbd, #0ea5e9);
    border-color: #0f6cbd;
    font-size: 0.84rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 12px 24px -16px rgba(15, 108, 189, 0.9);
  }

  .new-task-btn:hover {
    filter: brightness(1.05);
    transform: translateY(-1px);
  }


  .view-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .view-toggle button {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0 0.75rem;
    color: var(--color-muted);
    font-size: 0.84rem;
    cursor: pointer;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.7rem;
  }

  :global(html.dark) .view-toggle button {
    color: #8eaec9 !important;
    background: #161c27 !important;
    border: 1px solid #ffffff0f !important;
  }

  .view-toggle button.active {
    color: var(--color-accent);
    border-color: var(--color-accent);
    background: var(--color-surface);
  }

  :global(html.dark) .view-toggle button.active {
    color: #38bdf8 !important;
    border-color: #38bdf8 !important;
    background: #1e2736 !important;
  }

  .view-toggle button.active span {
    font-weight: 600;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1rem 0.9rem;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }
  :global(html.dark) .panel-header {
    background: #161c27 !important;
    border-bottom: 1px solid #ffffff0f !important;
  }

  .panel-header h3 {
    margin: 0;
    color: var(--color-heading);
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    text-shadow: 0 1px 2px rgba(17,24,39,0.08);
  }
  :global(html.dark) .panel-header h3 {
    color: #e5edf8 !important;
  }

  .tasks-panel {
    overflow: hidden;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
  }
  :global(html.dark) .tasks-panel {
    background: #0d1117 !important;
    border-color: #ffffff0f !important;
  }

  .tasks-header {
    border-bottom: 1px solid var(--color-border);
    padding-bottom: 0.9rem;
  }

  .tasks-header-columns {
    display: inline-grid;
    grid-template-columns: 8rem 7.5rem 8.75rem;
    align-items: center;
    gap: 1.1rem;
    margin-right: 0.8rem;
    color: var(--color-heading);
    font-size: 1rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .overview-shell {
    display: grid;
    gap: 1rem;
    padding: 1rem;
  }

  :global(html.dark) .overview-shell {
    background: #0d1117 !important;
  }

  .overview-panels {
    display: grid;
    grid-template-columns: 1fr 1fr 0.8fr;
    gap: 0.85rem;
  }

  .overview-panel {
    border-radius: 0.8rem;
    padding: 0.95rem;
    min-height: 10.25rem;
    box-shadow: 0 12px 24px -20px rgba(0,0,0,0.4);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  :global(html.dark) .overview-panel {
    border: 1px solid #ffffff0f !important;
    background: #161c27 !important;
  }

  .overview-panel h4 {
    margin: 0;
    color: var(--color-heading);
    font-size: 1rem;
    font-weight: 650;
  }

  :global(html.dark) .overview-panel h4 {
    color: #e5edf8 !important;
  }

  .overview-panel ul {
    margin: 0.75rem 0 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.55rem;
  }

  .overview-panel li {
    margin: 0;
  }

  .overview-task-link {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    font-size: 0.81rem;
    color: var(--color-text);
    text-align: left;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    padding: 0.3rem 0.35rem;
    cursor: pointer;
    transition: background-color 120ms ease, border-color 120ms ease;
  }

  :global(html.dark) .overview-task-link {
    color: #cfdceb !important;
  }

  .overview-task-link:hover,
  .overview-task-link.active {
    background: var(--color-border);
    border-color: var(--color-border);
  }

  :global(html.dark) .overview-task-link:hover,
  :global(html.dark) .overview-task-link.active {
    background: #1e2736 !important;
    border-color: #ffffff1a !important;
  }

  .overview-panel li span {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .overview-panel li small {
    color: var(--color-muted);
    font-size: 0.77rem;
  }

  .overview-empty-copy {
    margin: 0.7rem 0 0;
    color: var(--color-muted);
    font-size: 0.76rem;
  }

  :global(html.dark) .overview-empty-copy {
    color: #8eaec9 !important;
  }

  .completion-panel {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .overview-tracker {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-radius: 0.8rem;
    background: var(--color-surface);
    padding: 0.95rem;
    min-height: 10.25rem;
    box-shadow: 0 16px 30px -24px rgba(15, 23, 42, 0.4);
  }

  .tracker-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.55rem;
    padding-left: 0.15rem;
  }

  .tracker-card-heading {
    display: grid;
    gap: 0.18rem;
    min-width: 0;
  }

  .tracker-eyebrow {
    margin: 0;
    color: #0f6cbd;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .tracker-card-heading h4 {
    margin: 0;
    color: var(--color-heading);
    font-size: 1rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .tracker-purpose {
    margin: 0.12rem 0 0;
    color: var(--color-muted);
    font-size: 0.82rem;
    line-height: 1.35;
  }

  .tracker-head-actions {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    flex-shrink: 0;
  }

  .tracker-menu-trigger {
    width: 1.4rem;
    height: 1.4rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: 999px;
    color: var(--color-muted);
    cursor: pointer;
  }

  .tracker-menu-trigger:hover {
    color: var(--color-text);
    background: var(--color-soft);
    border-color: var(--color-border);
  }

  .tracker-menu {
    position: absolute;
    top: calc(100% + 0.3rem);
    right: 0;
    min-width: 8rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.6rem;
    box-shadow: 0 12px 24px -20px rgba(15, 23, 42, 0.35);
    padding: 0.25rem;
    z-index: 6;
  }

  .tracker-menu button {
    width: 100%;
    text-align: left;
    border-radius: 0.45rem;
    padding: 0.42rem 0.5rem;
    color: var(--color-text);
    font-size: 0.75rem;
    cursor: pointer;
  }

  .tracker-menu button:hover {
    background: var(--color-soft);
  }

  .tracker-title {
    margin: 0.2rem 0 0;
    color: var(--color-heading);
    font-size: 0.87rem;
    font-weight: 600;
  }

  .tracker-meta {
    margin: 0.35rem 0 0;
    color: var(--color-muted);
    font-size: 0.83rem;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .tracker-description {
    margin: 0.55rem 0 0;
    color: var(--color-text);
    font-size: 0.87rem;
    line-height: 1.45;
  }

  .tracker-summary {
    display: grid;
    gap: 0.1rem;
    padding: 0.5rem 0.75rem 0.65rem;
    border: 1px solid var(--color-border);
    border-radius: 0.85rem;
    background: none;
  }

  .tracker-section-shell {
    margin-top: 0.55rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 0.85rem;
    background: none;
  }

  .tracker-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }


  .tracker-form {
    display: grid;
    gap: 0.7rem;
    margin-top: 0.6rem;
  }

  .tracker-form label {
    display: grid;
    gap: 0.3rem;
  }

  .tracker-form label span {
    color: var(--color-muted);
    font-size: 0.74rem;
    font-weight: 600;
  }

  .tracker-form input,
  .tracker-form select,
  .tracker-form textarea {
    border: 1px solid var(--color-border);
    border-radius: 0.55rem;
    background: var(--color-soft);
    color: var(--color-text);
    font-size: 0.82rem;
    padding: 0.45rem 0.55rem;
    outline: none;
  }

  .tracker-form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .tracker-form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.45rem;
  }

  .tracker-form-actions button {
    border-radius: 0.5rem;
    padding: 0.35rem 0.65rem;
    font-size: 0.76rem;
    font-weight: 600;
    cursor: pointer;
  }

  .tracker-form-actions .secondary {
    border: 1px solid var(--color-border);
    background: var(--color-soft);
    color: var(--color-text);
  }

  .tracker-form-actions .primary {
    border: 1px solid #0f6cbd;
    background: #0f6cbd;
    color: #ffffff;
  }

  .tracker-checklist-editor {
    background: none;
  }

  .tracker-checklist-editor-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }

  .tracker-checklist-editor-head span {
    color: var(--color-muted);
    font-size: 0.74rem;
    font-weight: 600;
  }

  .tracker-checklist-editor-head button,
  .remove-item {
    border: 1px solid var(--color-border);
    background: var(--color-soft);
    color: var(--color-text);
    border-radius: 0.45rem;
    padding: 0.32rem 0.5rem;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
  }

  .tracker-checklist-editor-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.35rem;
    align-items: center;
  }

  .tracker-checklist-editor-row input[type='checkbox'] {
    width: 0.82rem;
    height: 0.82rem;
  }

  .tracker-checklist-editor-row input[type='text'] {
    width: 100%;
    font-size: 0.78rem;
    padding: 0.32rem 0.45rem;
  }

  .attachment-editor {
    display: grid;
    gap: 0.5rem;
  }

  .attachment-editor-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }

  .attachment-editor-head span {
    color: var(--color-muted);
    font-size: 0.74rem;
    font-weight: 600;
  }

  .attachment-upload-btn {
    border: 1px solid var(--color-border);
    background: var(--color-soft);
    color: var(--color-text);
    border-radius: 0.45rem;
    padding: 0.32rem 0.5rem;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
  }

  .hidden-file-input {
    display: none;
  }

  .attachment-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }

  .attachment-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.45rem;
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    padding: 0.32rem 0.45rem;
    background: var(--color-soft);
  }

  .attachment-list li span {
    color: var(--color-text);
    font-size: 0.78rem;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .completion-value {
    margin: 0.35rem 0 0;
    color: #0f6cbd;
    font-size: 1.6rem;
    font-weight: 800;
  }

  .overview-link {
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-soft);
    color: var(--color-text);
    padding: 0.3rem 0.6rem;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    width: fit-content;
  }

  .task-list {
    display: grid;
    background: var(--color-soft);
    padding: 0.4rem;
    gap: 0.45rem;
  }

  .task-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 8rem 7.5rem 8.75rem;
    align-items: center;
    gap: 1.1rem;
    padding: 0.9rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: 0.65rem;
    background: var(--color-surface);
    transition: border-color 140ms ease, box-shadow 140ms ease, background-color 140ms ease;
  }

  .task-row:hover {
    border-color: var(--color-accent);
    background: var(--color-soft);
    box-shadow: 0 8px 22px -20px rgba(15, 23, 42, 0.35);
  }

  .task-accordion-item {
    border: 1px solid var(--color-border);
    border-radius: 0.65rem;
    background: var(--color-surface);
    overflow: hidden;
    transition: border-color 140ms ease, box-shadow 140ms ease;
  }

  .task-accordion-item.expanded {
    border-color: var(--color-accent);
    box-shadow: 0 8px 22px -20px rgba(15, 23, 42, 0.45);
  }

  .task-accordion-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
    text-align: left;
    background: var(--color-surface);
    padding: 1rem 1.4rem;
    padding-right: 3.4rem;
    cursor: pointer;
    transition: background-color 140ms ease;
  }

  .task-accordion-trigger:hover {
    background: var(--color-soft);
  }

  .task-trigger-left {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
  }

  .task-dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 999px;
    background: var(--color-muted);
    flex-shrink: 0;
  }

  .task-trigger-title {
    color: var(--color-heading);
    font-size: 0.9rem;
    font-weight: 500;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .task-accordion-trigger :global(svg) {
    color: var(--color-muted);
    transition: transform 140ms ease;
    flex-shrink: 0;
  }

  .task-accordion-trigger :global(svg.chevron-open) {
    transform: rotate(180deg);
  }

  .task-accordion-body-modern {
    display: grid;
    gap: 0.75rem;
    padding: 0.1rem 1rem 1rem 2rem;
    border-top: 1px solid var(--color-border);
    background: var(--color-soft);
  }

  .task-accordion-meta-modern {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.65rem;
    color: var(--color-muted);
    font-size: 0.79rem;
    font-weight: 600;
  }

  .status-chip {
    padding: 0;
    font-size: 0.79rem;
    font-weight: 700;
    border: 0;
    background: transparent;
  }

  .task-description-modern {
    margin: 0;
    color: var(--color-text);
    font-size: 0.87rem;
    line-height: 1.45;
    flex: 1 1 auto;
    min-width: 0;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .task-description-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .task-view-form-btn {
    border: 0;
    background: transparent;
    color: var(--color-muted);
    font-size: 0.76rem;
    font-weight: 700;
    padding: 0;
    cursor: pointer;
    width: auto;
    flex-shrink: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .task-view-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(10, 20, 38, 0.45);
    display: grid;
    place-items: center;
    z-index: 40;
    padding: 1rem;
  }

  .task-view-modal {
    width: min(38rem, 100%);
    max-height: calc(100vh - 2rem);
    overflow: auto;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.9rem;
    box-shadow: 0 28px 48px -32px rgba(15, 23, 42, 0.55);
    padding: 1rem;
    display: grid;
    gap: 0.9rem;
  }
  :global(html.dark) .task-view-modal {
    background: #161c27;
    border: 1px solid #ffffff0f;
  }

  .task-view-modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .task-view-head-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .task-view-modal-head h4 {
    margin: 0;
    color: var(--color-heading);
    font-size: 1rem;
    font-weight: 700;
  }

  .task-view-close {
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-soft);
    color: var(--color-text);
    padding: 0.3rem 0.7rem;
    font-size: 0.74rem;
    font-weight: 600;
    cursor: pointer;
  }

  .task-view-action {
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-soft);
    color: var(--color-text);
    padding: 0.3rem 0.65rem;
    font-size: 0.74rem;
    font-weight: 600;
    cursor: pointer;
  }

  .task-view-action.danger {
    border-color: var(--color-border);
    color: var(--color-text);
    background: var(--color-soft);
  }

  .task-view-action.primary {
    border-color: #0f6cbd;
    background: #0f6cbd;
    color: #ffffff;
  }

  .task-view-action.primary:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .task-form-error {
    margin: 0;
    color: #dc2626;
    font-size: 0.78rem;
    font-weight: 600;
  }

  .task-view-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .task-view-grid label,
  .task-view-description {
    display: grid;
    gap: 0.35rem;
  }

  .task-view-grid label span,
  .task-view-description span {
    color: var(--color-muted);
    font-size: 0.74rem;
    font-weight: 600;
  }

  .task-view-section > span {
    color: var(--color-muted);
    font-size: 0.74rem;
    font-weight: 600;
  }

  .task-view-grid input,
  .task-view-grid select,
  .task-view-description textarea {
    width: 100%;
    border: 1px solid var(--color-border);
    border-radius: 0.55rem;
    background: var(--color-soft);
    color: var(--color-text);
    font-size: 0.82rem;
    padding: 0.45rem 0.55rem;
  }

  .task-view-description textarea {
    resize: vertical;
  }

  .task-view-section {
    display: grid;
    gap: 0.4rem;
  }

  .task-view-section ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.35rem;
  }

  .task-view-section li {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--color-text);
    font-size: 0.82rem;
  }

  .task-view-section .attachment-list li {
    background: var(--color-soft);
  }

  .task-view-section .attachment-list li span {
    color: var(--color-text);
    font-size: 0.82rem;
  }

  .task-view-section li input[type='checkbox'] {
    width: 0.9rem;
    height: 0.9rem;
  }

  .archived-row {
    background: var(--color-surface);
  }

  .task-name {
    color: var(--color-text);
    font-size: 0.87rem;
    font-weight: 600;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tasks-header-columns span:nth-child(1) {
    justify-self: center;
  }

  .tasks-header-columns span:nth-child(3) {
    justify-self: center;
  }

  .tasks-header-columns span:nth-child(2) {
    justify-self: center;
    margin-left: 0;
  }

  .task-due {
    justify-self: center;
    text-align: center;
    color: var(--color-muted);
    font-size: 0.83rem;
    font-weight: 500;
  }

  .attachment-btn {
    justify-self: center;
    margin-left: 0;
    border: 1px solid var(--color-border);
    background: var(--color-soft);
    color: var(--color-muted);
    border-radius: 999px;
    padding: 0.28rem 0.55rem;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .attachment-text {
    justify-self: center;
    color: #475569;
    font-size: 0.78rem;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .attachment-btn:hover {
    background: color-mix(in srgb, #0f6cbd 10%, var(--color-surface));
    border-color: var(--color-accent);
  }

  .attachment-btn:focus-visible,
  .view-toggle button:focus-visible,
  .search-control input:focus-visible,
  .status-control select:focus-visible {
    outline: 2px solid #7cc3ff;
    outline-offset: 2px;
  }

  .empty-state {
    margin: 0;
    padding: 1.2rem 1rem;
    color: var(--color-muted);
    font-size: 0.85rem;
  }

  .status-pill {
    justify-self: center;
    text-align: center;
    padding: 0;
    font-size: 0.77rem;
    font-weight: 500;
    background: transparent;
    border: 0;
  }

  .status-progress {
    color: #2563eb;
  }

  .status-pending {
    color: #d97706;
  }

  .status-completed {
    color: #059669;
  }

  .status-overdue {
    color: #dc2626;
  }

  .tone-indigo {
    color: #0f6cbd;
    background: #edf4fb;
    border-color: #dbeafe;
  }

  :global(html.dark) .tone-indigo {
    color: #38bdf8 !important;
    background: rgba(56,189,248,0.15) !important;
    border-color: rgba(56,189,248,0.25) !important;
  }

  .tone-card-indigo {
    background: var(--color-surface);
    border-color: var(--color-border);
  }

  .tone-card-blue {
    background: var(--color-surface);
    border-color: var(--color-border);
  }

  .tone-card-green {
    background: var(--color-surface);
    border-color: var(--color-border);
  }

  .tone-card-violet {
    background: var(--color-surface);
    border-color: var(--color-border);
  }

  .tone-card-red {
    background: var(--color-surface);
    border-color: var(--color-border);
  }

  .tone-card-amber {
    background: var(--color-surface);
    border-color: var(--color-border);
  }

  .tone-blue {
    color: #2563eb;
    background: #eff6ff;
    border-color: #dbeafe;
  }

  :global(html.dark) .tone-blue {
    color: #60a5fa !important;
    background: rgba(96,165,250,0.15) !important;
    border-color: rgba(96,165,250,0.25) !important;
  }

  .tone-green {
    color: #059669;
    background: #ecfdf5;
    border-color: #a7f3d0;
  }

  :global(html.dark) .tone-green {
    color: #34d399 !important;
    background: rgba(52,211,153,0.15) !important;
    border-color: rgba(52,211,153,0.25) !important;
  }

  .tone-red {
    color: #ef4444;
    background: #fef2f2;
    border-color: #fecaca;
  }

  .tone-amber {
    color: #d97706;
    background: #fffbeb;
    border-color: #fde68a;
  }

  .tone-violet {
    color: #7c3aed;
    background: #f5f3ff;
    border-color: #ddd6fe;
  }

  :global(html.dark) .tone-violet {
    color: #22d3ee !important;
    background: rgba(34,211,238,0.15) !important;
    border-color: rgba(34,211,238,0.25) !important;
  }

  :global(html.dark) .tone-indigo {
    color: #7cc3ff;
    background: rgba(91, 177, 255, 0.16);
    border-color: rgba(125, 211, 252, 0.38);
  }

  :global(html.dark) .tone-blue {
    color: #93c5fd;
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(147, 197, 253, 0.36);
  }

  :global(html.dark) .tone-green {
    color: #86efac;
    background: rgba(34, 197, 94, 0.2);
    border-color: rgba(134, 239, 172, 0.38);
  }

  :global(html.dark) .tone-violet {
    color: #67e8f9;
    background: rgba(6, 182, 212, 0.18);
    border-color: rgba(103, 232, 249, 0.34);
  }

  @media (max-width: 1200px) {
    .stats-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

  }

  @media (max-width: 720px) {
    .activity-shell {
      border-radius: 1rem;
      padding: 0;
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }

    .panel-header h3 {
      font-size: 1.15rem;
    }

    .controls-right,
    .view-toggle {
      width: 100%;
    }

    .search-control,
    .status-control,
    .status-control select,
    .new-task-btn,
    .view-toggle button {
      flex: 1;
    }

    .search-control input {
      width: 100%;
    }

    .task-row {
      grid-template-columns: minmax(0, 1fr) 7rem 7rem 8rem;
      padding-right: 0.8rem;
    }

    .overview-panels {
      grid-template-columns: 1fr;
    }

    .tracker-form-grid {
      grid-template-columns: 1fr;
    }

    .tasks-header-columns {
      grid-template-columns: 7rem 7rem 8rem;
      gap: 0.8rem;
      margin-right: 0;
    }

    .tasks-header-columns span:nth-child(2),
    .attachment-btn {
      margin-left: 0;
    }
  }

  /* Scrollbar styling for Recent Activity */
  .recent-activity-list {
    scrollbar-width: thin;
    scrollbar-color: #0f6cbd rgba(0, 0, 0, 0.1);
  }

  .recent-activity-list::-webkit-scrollbar {
    width: 8px;
  }

  .recent-activity-list::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
  }

  .recent-activity-list::-webkit-scrollbar-thumb {
    background: #0f6cbd;
    border-radius: 4px;
  }

  .recent-activity-list::-webkit-scrollbar-thumb:hover {
    background: #0a4a8f;
  }

  /* Reference Activity Log restyle */
  :global(html) {
    --ims-ref-bg: #f0f4f8;
    --ims-ref-surface: #ffffff;
    --ims-ref-surface2: #f8fafc;
    --ims-ref-surface3: #f1f5f9;
    --ims-ref-border: #e2e8f0;
    --ims-ref-border2: #cbd5e1;
    --ims-ref-accent: #2563eb;
    --ims-ref-accent2: #3b82f6;
    --ims-ref-accent-glow: #2563eb20;
    --ims-ref-green: #16a34a;
    --ims-ref-green-dim: #16a34a18;
    --ims-ref-amber: #d97706;
    --ims-ref-amber-dim: #d9770618;
    --ims-ref-red: #dc2626;
    --ims-ref-red-dim: #dc262618;
    --ims-ref-text: #0f172a;
    --ims-ref-text2: #64748b;
    --ims-ref-text3: #94a3b8;
    --ims-ref-radius: 14px;
    --ims-ref-radius-sm: 8px;
    --ims-ref-shadow-sm: 0 1px 3px #0000000d, 0 1px 2px #00000008;
    --ims-ref-shadow: 0 4px 16px #0000001a;
    --ims-ref-input-bg: #f8fafc;
  }

  :global(html.dark),
  :global(body.dark) {
    --ims-ref-bg: #0d1117;
    --ims-ref-surface: #161c27;
    --ims-ref-surface2: #1e2736;
    --ims-ref-surface3: #242f42;
    --ims-ref-border: #ffffff0f;
    --ims-ref-border2: #ffffff1a;
    --ims-ref-accent: #3b82f6;
    --ims-ref-accent2: #60a5fa;
    --ims-ref-accent-glow: #3b82f630;
    --ims-ref-green: #22c55e;
    --ims-ref-green-dim: #22c55e22;
    --ims-ref-amber: #f59e0b;
    --ims-ref-amber-dim: #f59e0b18;
    --ims-ref-red: #ef4444;
    --ims-ref-red-dim: #ef444418;
    --ims-ref-text: #f1f5f9;
    --ims-ref-text2: #94a3b8;
    --ims-ref-text3: #4b5563;
    --ims-ref-shadow-sm: 0 1px 3px #00000030;
    --ims-ref-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
    --ims-ref-input-bg: #1e2736;
  }

  .activity-shell {
    --color-bg: var(--ims-ref-bg);
    --color-surface: var(--ims-ref-surface);
    --color-soft: var(--ims-ref-surface2);
    --color-card: var(--ims-ref-surface);
    --color-border: var(--ims-ref-border);
    --color-heading: var(--ims-ref-text);
    --color-text: var(--ims-ref-text);
    --color-muted: var(--ims-ref-text2);
    --color-accent: var(--ims-ref-accent);
    --color-accent-bg: var(--ims-ref-accent-glow);
    width: 100%;
    padding: 20px 24px;
    border-radius: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
    color: var(--ims-ref-text);
    background: transparent;
    font-family: 'DM Sans', 'Segoe UI', system-ui, -apple-system, sans-serif;
  }

  .activity-shell::before,
  .activity-shell::after {
    display: none !important;
  }

  .stats-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .stat-card {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 14px;
    min-height: 0;
    padding: 14px 16px;
    border-radius: var(--ims-ref-radius-sm);
    background: var(--ims-ref-surface);
    border: 1px solid var(--ims-ref-border);
    box-shadow: var(--ims-ref-shadow-sm);
    overflow: visible;
  }

  .stat-card::before {
    display: none;
  }

  .stat-card:hover {
    box-shadow: var(--ims-ref-shadow);
    transform: translateY(-2px);
  }

  .stat-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    border: 0;
  }

  .tone-indigo {
    color: #0f6cbd;
    background: #edf4fb;
  }

  .tone-green {
    color: #059669;
    background: #ecfdf5;
  }

  .tone-blue {
    color: #2563eb;
    background: #eff6ff;
  }

  .tone-violet {
    color: #0891b2;
    background: #ecfeff;
  }

  :global(html.dark) .tone-indigo,
  :global(body.dark) .tone-indigo {
    color: #38bdf8 !important;
    background: rgba(56, 189, 248, 0.12) !important;
  }

  :global(html.dark) .tone-green,
  :global(body.dark) .tone-green {
    color: #34d399 !important;
    background: rgba(52, 211, 153, 0.12) !important;
  }

  :global(html.dark) .tone-blue,
  :global(body.dark) .tone-blue {
    color: #60a5fa !important;
    background: rgba(96, 165, 250, 0.12) !important;
  }

  :global(html.dark) .tone-violet,
  :global(body.dark) .tone-violet {
    color: #22d3ee !important;
    background: rgba(34, 211, 238, 0.12) !important;
  }

  .stat-value {
    color: var(--ims-ref-text);
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.4px;
    line-height: 1;
    text-shadow: none;
  }

  .stat-label {
    color: var(--ims-ref-text2);
    font-size: 11px;
    margin-top: 3px;
    font-weight: 500;
  }

  .controls-bar {
    padding: 10px 14px;
    border-radius: var(--ims-ref-radius-sm);
    background: var(--ims-ref-surface);
    border: 1px solid var(--ims-ref-border);
    box-shadow: var(--ims-ref-shadow-sm);
    gap: 10px;
  }

  .view-toggle {
    gap: 6px;
  }

  .view-toggle button,
  .search-control,
  .status-control select {
    min-height: 0;
    border-radius: var(--ims-ref-radius-sm);
    border: 1px solid var(--ims-ref-border);
    background: transparent;
    color: var(--ims-ref-text2);
    font-size: 13px;
    font-weight: 500;
    box-shadow: none;
  }

  .view-toggle button {
    padding: 7px 14px;
    gap: 6px;
  }

  .view-toggle button:hover {
    background: var(--ims-ref-surface2);
    color: var(--ims-ref-text);
  }

  .view-toggle button.active {
    background: var(--ims-ref-accent-glow);
    color: var(--ims-ref-accent2);
    border-color: var(--ims-ref-accent2);
  }

  .search-control {
    padding: 7px 12px;
    gap: 7px;
    background: var(--ims-ref-surface2);
  }

  .search-control input {
    width: 130px;
    color: var(--ims-ref-text);
    font-size: 13px;
  }

  .search-control input::placeholder {
    color: var(--ims-ref-text3);
  }

  .status-control::after {
    right: 10px;
    width: 6px;
    height: 6px;
    border-right: 1.5px solid var(--ims-ref-text2);
    border-bottom: 1.5px solid var(--ims-ref-text2);
    transform: translateY(-65%) rotate(45deg);
  }

  .status-control select {
    padding: 7px 30px 7px 12px;
    background: var(--ims-ref-surface2);
    color: var(--ims-ref-text);
  }

  .new-task-btn {
    min-height: 0;
    padding: 8px 16px;
    border-radius: var(--ims-ref-radius-sm);
    border: 0;
    background: linear-gradient(90deg, #2563eb, #3b82f6);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
  }

  .panel {
    border-radius: var(--ims-ref-radius);
    background: var(--ims-ref-surface);
    border: 1px solid var(--ims-ref-border);
    box-shadow: var(--ims-ref-shadow-sm);
    overflow: hidden;
  }

  .panel:hover {
    box-shadow: var(--ims-ref-shadow-sm);
  }

  .panel-header {
    padding: 14px 18px;
    background: var(--ims-ref-surface);
    border-bottom: 1px solid var(--ims-ref-border);
  }

  .panel-header h3 {
    color: var(--ims-ref-text);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0;
    text-shadow: none;
  }

  .tasks-panel,
  .overview-shell,
  .task-list {
    background: var(--ims-ref-surface);
  }

  .overview-shell {
    gap: 14px;
    padding: 16px;
  }

  .overview-panels {
    grid-template-columns: 1fr 1fr 0.9fr;
    gap: 12px;
  }

  .overview-panel,
  .notes-panel {
    min-height: 180px;
    padding: 16px;
    border-radius: var(--ims-ref-radius);
    background: var(--ims-ref-surface);
    border: 1px solid var(--ims-ref-border);
    box-shadow: var(--ims-ref-shadow-sm);
    gap: 0;
  }

  .overview-panel h4,
  .notes-title,
  .tracker-card-heading h4 {
    color: var(--ims-ref-text);
    font-size: 13.5px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .overview-panel h4 :global(svg),
  .notes-header :global(svg),
  .tracker-card-heading :global(svg) {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    padding: 6px;
  }

  .overview-empty-copy {
    color: var(--ims-ref-text3);
    font-size: 12px;
    margin-top: 12px;
  }

  .overview-panel ul {
    margin-top: 12px;
    gap: 5px;
  }

  .overview-task-link {
    padding: 8px 10px;
    border-radius: var(--ims-ref-radius-sm);
    color: var(--ims-ref-text2);
    font-size: 13px;
    background: transparent;
    border: 1px solid transparent;
  }

  .overview-task-link span {
    color: var(--ims-ref-text);
    font-size: 12.5px;
    font-weight: 600;
  }

  .overview-task-link small,
  .worklog-date {
    color: var(--ims-ref-text3);
    font-family: 'DM Mono', ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 11.5px;
  }

  .overview-task-link:hover,
  .overview-task-link.active {
    background: var(--ims-ref-surface2);
    border-color: var(--ims-ref-border);
  }

  .recent-activity-list li {
    margin-bottom: 10px !important;
    gap: 8px !important;
    font-size: 12.5px;
    line-height: 1.5;
  }

  .recent-activity-list li > span {
    width: 6px;
    height: 6px;
    min-width: 6px;
    margin-top: 6px !important;
    color: transparent !important;
    background: var(--ims-ref-accent2);
    border-radius: 999px;
    overflow: hidden;
  }

  .recent-activity-list li div div {
    color: var(--ims-ref-text2) !important;
    font-size: 12.5px !important;
    line-height: 1.5;
  }

  .overview-tracker {
    min-height: 0;
    padding: 16px 18px;
    border-radius: var(--ims-ref-radius);
    background: var(--ims-ref-surface);
    border: 1px solid var(--ims-ref-border);
    box-shadow: var(--ims-ref-shadow-sm);
  }

  .tracker-card-head {
    align-items: center;
    margin-bottom: 12px;
    padding-left: 0;
  }

  .tracker-summary {
    border: 0;
    padding: 0;
    background: transparent;
  }

  .tracker-title {
    color: var(--ims-ref-text);
    font-size: 14px;
    font-weight: 700;
    margin: 0 0 4px;
  }

  .tracker-description {
    color: var(--ims-ref-text2) !important;
    font-size: 12.5px;
    margin: 0 0 8px !important;
    line-height: 1.5;
  }

  .tracker-meta {
    color: var(--ims-ref-text3);
    font-size: 12px;
    gap: 8px;
  }

  .tracker-menu-trigger,
  .btn-more {
    width: 30px;
    height: 30px;
    border-radius: var(--ims-ref-radius-sm);
    border: 1px solid var(--ims-ref-border);
    color: var(--ims-ref-text2);
    background: transparent;
  }

  .tracker-menu-trigger:hover {
    background: var(--ims-ref-surface2);
    color: var(--ims-ref-text);
  }

  .status-pill,
  .status-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 11px;
    border-radius: 40px;
    font-size: 11.5px;
    font-weight: 700;
  }

  .status-pill::before,
  .status-chip::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: currentColor;
  }

  .status-pending {
    color: var(--ims-ref-amber);
    background: var(--ims-ref-amber-dim);
  }

  .status-progress {
    color: var(--ims-ref-accent2);
    background: var(--ims-ref-accent-glow);
  }

  .status-completed {
    color: var(--ims-ref-green);
    background: var(--ims-ref-green-dim);
  }

  .status-overdue {
    color: var(--ims-ref-red);
    background: var(--ims-ref-red-dim);
  }

  .daily-logs-panel {
    margin-top: 0;
  }

  .daily-logs-content {
    display: grid;
    grid-template-columns: 340px minmax(0, 1fr);
    gap: 14px;
    padding: 16px;
    background: var(--ims-ref-bg);
  }

  .worklog-card {
    min-width: 0;
    padding: 18px;
    border-radius: var(--ims-ref-radius);
    background: var(--ims-ref-surface);
    border: 1px solid var(--ims-ref-border);
    box-shadow: var(--ims-ref-shadow-sm);
  }

  .worklog-card-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 16px;
    color: var(--ims-ref-text);
    font-size: 13.5px;
    font-weight: 700;
  }

  .wl-icon {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    color: var(--ims-ref-accent2);
    background: var(--ims-ref-accent-glow);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 12px;
  }

  .form-label {
    color: var(--ims-ref-text2);
    font-size: 12px;
    font-weight: 700;
  }

  .form-input,
  .form-textarea,
  .task-view-grid input,
  .task-view-grid select,
  .task-view-description textarea,
  .tracker-form input,
  .tracker-form select,
  .tracker-form textarea {
    width: 100%;
    padding: 9px 12px;
    border-radius: var(--ims-ref-radius-sm);
    border: 1px solid var(--ims-ref-border2);
    background: var(--ims-ref-input-bg);
    color: var(--ims-ref-text);
    font-family: inherit;
    font-size: 12.5px;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .form-textarea,
  .task-view-description textarea,
  .tracker-form textarea {
    min-height: 60px;
    resize: vertical;
  }

  .form-input:focus,
  .form-textarea:focus,
  .task-view-grid input:focus,
  .task-view-grid select:focus,
  .task-view-description textarea:focus,
  .tracker-form input:focus,
  .tracker-form select:focus,
  .tracker-form textarea:focus {
    border-color: var(--ims-ref-accent2);
    box-shadow: 0 0 0 3px var(--ims-ref-accent-glow);
  }

  .file-label,
  .attachment-upload-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: fit-content;
    padding: 7px 12px;
    border-radius: var(--ims-ref-radius-sm);
    border: 1px dashed var(--ims-ref-border2);
    background: var(--ims-ref-surface2);
    color: var(--ims-ref-text2);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .file-label:hover,
  .attachment-upload-btn:hover {
    border-color: var(--ims-ref-accent2);
    color: var(--ims-ref-accent2);
  }

  .file-input {
    display: none;
  }

  .submit-worklog-btn,
  .btn-submit {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    margin-top: 4px;
    padding: 10px;
    border: 0;
    border-radius: var(--ims-ref-radius-sm);
    background: linear-gradient(90deg, #2563eb, #3b82f6);
    color: #fff;
    font-family: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3);
  }

  .submit-worklog-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .worklog-list-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }

  .worklog-list-head .worklog-card-head {
    margin-bottom: 0;
  }

  .wl-filters {
    display: flex;
    gap: 8px;
    margin: 0;
    flex-wrap: wrap;
  }

  .wl-search-box {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 160px;
    flex: 1;
    padding: 7px 12px;
    border-radius: var(--ims-ref-radius-sm);
    border: 1px solid var(--ims-ref-border);
    background: var(--ims-ref-surface2);
    color: var(--ims-ref-text2);
    font-size: 12.5px;
  }

  .wl-search-box input {
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ims-ref-text);
    font-family: inherit;
    font-size: 12.5px;
  }

  .wl-date-input {
    padding: 7px 10px;
    border-radius: var(--ims-ref-radius-sm);
    border: 1px solid var(--ims-ref-border);
    background: var(--ims-ref-surface2);
    color: var(--ims-ref-text);
    font-family: 'DM Mono', ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 12px;
    outline: none;
  }

  .worklogs-empty {
    color: var(--ims-ref-text3);
    font-size: 12.5px;
    text-align: center;
    padding: 28px 0;
    margin: 0;
  }

  .worklogs-accordion-list {
    gap: 8px;
  }

  .worklog-accordion-item,
  .task-accordion-item,
  .task-row {
    border-radius: var(--ims-ref-radius-sm);
    border: 1px solid var(--ims-ref-border);
    background: var(--ims-ref-surface2);
    box-shadow: none;
  }

  .worklog-accordion-item:hover,
  .worklog-accordion-item.expanded,
  .task-accordion-item:hover,
  .task-accordion-item.expanded {
    border-color: var(--ims-ref-accent2);
  }

  .worklog-accordion-trigger,
  .task-accordion-trigger {
    padding: 12px 14px;
    background: transparent;
  }

  .worklog-task-title,
  .task-trigger-title {
    color: var(--ims-ref-text);
    font-size: 13px;
    font-weight: 700;
  }

  .worklog-accordion-body,
  .task-accordion-body-modern {
    padding: 12px 14px 14px;
    border-top: 1px solid var(--ims-ref-border);
    background: transparent;
  }

  .worklog-label {
    color: var(--ims-ref-text3);
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .worklog-notes,
  .worklog-learnings,
  .task-description-modern {
    color: var(--ims-ref-text2);
    font-size: 12.5px;
    line-height: 1.5;
  }

  .worklog-attachment-chip,
  .worklog-attachment-item,
  .attachment-list li {
    border-radius: var(--ims-ref-radius-sm);
    border: 1px solid var(--ims-ref-border);
    background: var(--ims-ref-surface2);
    color: var(--ims-ref-text2);
  }

  .worklog-attachment-chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }

  .task-list {
    padding: 12px;
    gap: 8px;
  }

  .task-view-modal {
    width: min(500px, 100%);
    padding: 20px;
    border-radius: var(--ims-ref-radius);
    background: var(--ims-ref-surface);
    border: 1px solid var(--ims-ref-border);
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.25);
  }

  .task-view-modal-head h4 {
    color: var(--ims-ref-text);
    font-size: 15px;
    font-weight: 700;
  }

  .task-view-action,
  .task-view-close,
  .tracker-form-actions button,
  .remove-item {
    border-radius: 40px;
    border: 1px solid var(--ims-ref-border);
    background: var(--ims-ref-surface2);
    color: var(--ims-ref-text2);
    font-size: 12.5px;
    font-weight: 600;
  }

  .task-view-action.primary,
  .tracker-form-actions .primary {
    border-color: var(--ims-ref-accent);
    background: var(--ims-ref-accent);
    color: #fff;
  }

  :global(html.dark) .stat-card,
  :global(html.dark) .panel,
  :global(html.dark) .controls-bar,
  :global(html.dark) .panel-header,
  :global(html.dark) .overview-panel,
  :global(html.dark) .notes-panel,
  :global(html.dark) .overview-tracker,
  :global(html.dark) .worklog-card,
  :global(html.dark) .task-view-modal,
  :global(body.dark) .stat-card,
  :global(body.dark) .panel,
  :global(body.dark) .controls-bar,
  :global(body.dark) .panel-header,
  :global(body.dark) .overview-panel,
  :global(body.dark) .notes-panel,
  :global(body.dark) .overview-tracker,
  :global(body.dark) .worklog-card,
  :global(body.dark) .task-view-modal {
    background: var(--ims-ref-surface) !important;
    border-color: var(--ims-ref-border) !important;
    color: var(--ims-ref-text) !important;
  }

  :global(html.dark) .overview-shell,
  :global(html.dark) .daily-logs-content,
  :global(body.dark) .overview-shell,
  :global(body.dark) .daily-logs-content {
    background: var(--ims-ref-bg) !important;
  }

  :global(html.dark) .view-toggle button,
  :global(html.dark) .search-control,
  :global(html.dark) .status-control select,
  :global(html.dark) .wl-search-box,
  :global(html.dark) .wl-date-input,
  :global(html.dark) .form-input,
  :global(html.dark) .form-textarea,
  :global(body.dark) .view-toggle button,
  :global(body.dark) .search-control,
  :global(body.dark) .status-control select,
  :global(body.dark) .wl-search-box,
  :global(body.dark) .wl-date-input,
  :global(body.dark) .form-input,
  :global(body.dark) .form-textarea {
    background: var(--ims-ref-surface2) !important;
    border-color: var(--ims-ref-border) !important;
    color: var(--ims-ref-text) !important;
  }

  :global(html.dark) .activity-shell,
  :global(body.dark) .activity-shell {
    background: #0d1117 !important;
  }

  :global(html.dark) .activity-shell .stat-card,
  :global(html.dark) .activity-shell .controls-bar,
  :global(html.dark) .activity-shell .panel,
  :global(html.dark) .activity-shell .panel-header,
  :global(html.dark) .activity-shell .tasks-panel,
  :global(html.dark) .activity-shell .overview-panel,
  :global(html.dark) .activity-shell .notes-panel,
  :global(html.dark) .activity-shell .overview-tracker,
  :global(html.dark) .activity-shell .worklog-card,
  :global(html.dark) .activity-shell .task-view-modal,
  :global(body.dark) .activity-shell .stat-card,
  :global(body.dark) .activity-shell .controls-bar,
  :global(body.dark) .activity-shell .panel,
  :global(body.dark) .activity-shell .panel-header,
  :global(body.dark) .activity-shell .tasks-panel,
  :global(body.dark) .activity-shell .overview-panel,
  :global(body.dark) .activity-shell .notes-panel,
  :global(body.dark) .activity-shell .overview-tracker,
  :global(body.dark) .activity-shell .worklog-card,
  :global(body.dark) .activity-shell .task-view-modal {
    background-color: #161c27 !important;
    border-color: #ffffff0f !important;
    box-shadow: 0 1px 3px #00000030 !important;
  }

  :global(html.dark) .activity-shell .overview-shell,
  :global(html.dark) .activity-shell .daily-logs-content,
  :global(html.dark) .activity-shell .task-list,
  :global(body.dark) .activity-shell .overview-shell,
  :global(body.dark) .activity-shell .daily-logs-content,
  :global(body.dark) .activity-shell .task-list {
    background-color: #0d1117 !important;
  }

  :global(html.dark) .activity-shell .search-control,
  :global(html.dark) .activity-shell .status-control select,
  :global(html.dark) .activity-shell .view-toggle button,
  :global(html.dark) .activity-shell .form-textarea,
  :global(html.dark) .activity-shell .form-input,
  :global(html.dark) .activity-shell .wl-search-box,
  :global(html.dark) .activity-shell .wl-date-input,
  :global(html.dark) .activity-shell .file-label,
  :global(html.dark) .activity-shell .attachment-upload-btn,
  :global(html.dark) .activity-shell .task-accordion-item,
  :global(html.dark) .activity-shell .worklog-accordion-item,
  :global(html.dark) .activity-shell .worklog-attachment-item,
  :global(html.dark) .activity-shell .attachment-list li,
  :global(body.dark) .activity-shell .search-control,
  :global(body.dark) .activity-shell .status-control select,
  :global(body.dark) .activity-shell .view-toggle button,
  :global(body.dark) .activity-shell .form-textarea,
  :global(body.dark) .activity-shell .form-input,
  :global(body.dark) .activity-shell .wl-search-box,
  :global(body.dark) .activity-shell .wl-date-input,
  :global(body.dark) .activity-shell .file-label,
  :global(body.dark) .activity-shell .attachment-upload-btn,
  :global(body.dark) .activity-shell .task-accordion-item,
  :global(body.dark) .activity-shell .worklog-accordion-item,
  :global(body.dark) .activity-shell .worklog-attachment-item,
  :global(body.dark) .activity-shell .attachment-list li {
    background-color: #1e2736 !important;
    border-color: #ffffff1a !important;
  }

  :global(html.dark) .activity-shell .overview-task-link:hover,
  :global(html.dark) .activity-shell .overview-task-link.active,
  :global(html.dark) .activity-shell .view-toggle button:hover,
  :global(body.dark) .activity-shell .overview-task-link:hover,
  :global(body.dark) .activity-shell .overview-task-link.active,
  :global(body.dark) .activity-shell .view-toggle button:hover {
    background-color: #1e2736 !important;
    border-color: #ffffff1a !important;
  }

  :global(html.dark) .activity-shell .view-toggle button.active,
  :global(body.dark) .activity-shell .view-toggle button.active {
    background-color: #3b82f630 !important;
    border-color: #60a5fa !important;
    color: #60a5fa !important;
  }

  @media (max-width: 980px) {
    .overview-panels,
    .daily-logs-content {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .activity-shell {
      gap: 12px;
      padding: 16px;
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }

    .controls-right,
    .view-toggle {
      width: 100%;
    }

    .search-control,
    .status-control,
    .status-control select,
    .new-task-btn,
    .view-toggle button {
      flex: 1;
    }

    .search-control input {
      width: 100%;
    }

    .daily-logs-content,
    .overview-shell {
      padding: 12px;
    }
  }
</style>
