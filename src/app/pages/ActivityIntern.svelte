<script>
import { onMount, onDestroy, tick } from 'svelte';
import { theme } from '../context/ThemeContext.js';
// For real-time update of 'Updated X minutes ago'
let now = new Date();
let intervalId;
let forceUpdate = 0; // dummy variable to trigger Svelte reactivity

function updateNow() {
  now = new Date();
  forceUpdate += 1; // force Svelte to update
}

onMount(() => {
  intervalId = setInterval(() => {
    updateNow();
  }, 60000); // update every minute
});

onDestroy(() => {
  clearInterval(intervalId);
});
// For Recent Activity (automatic, backend-driven)
let recentActivities = [];

// Fetch recent activities from backend
async function fetchRecentActivities() {
  try {
    const run = globalThis?.google?.script?.run;
    if (!run) return;
    run.withSuccessHandler((data) => {
      if (Array.isArray(data)) recentActivities = data;
    }).getRecentActivities();
  } catch (e) { /* ignore */ }
}

// Log a new activity to backend
function logUserActivity(activity) {
  try {
    const run = globalThis?.google?.script?.run;
    if (!run) return;
    run.logUserActivity(activity);
  } catch (e) { /* ignore */ }
}

onMount(() => {
  fetchRecentActivities();
  intervalId = setInterval(() => {
    updateNow();
    fetchRecentActivities(); // refresh activities every minute
  }, 60000);
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
import { getCurrentUser } from '../lib/auth.js';
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
} from 'lucide-svelte';

const summaryCards = [
  {
    label: 'Pending',
    value: 2,
    icon: Clock,
    tone: 'indigo',
  },
  {
    label: 'Total Tasks',
    value: 6,
    icon: Clock3,
    tone: 'green',
  },
  {
    label: 'Completed',
    value: 2,
    icon: CheckCircle2,
    tone: 'blue',
  },
  {
    label: 'Overdue',
    value: 1,
    icon: AlertCircle,
    tone: 'violet',
  },
];

  let assignedTasks = [
    {
      title: 'API Integration Testing',
      status: 'In Progress',
      dueDate: 'Apr 5, 2026',
      owner: 'John Rivera',
      priority: 'high',
      description: 'Test all RESTful endpoints for the new customer portal API and document findings.',
      attachments: ['api-test-cases.pdf', 'endpoint-results.xlsx'],
      dailyChecklist: [
        { label: 'Validate auth and token refresh flow', done: true },
        { label: 'Run negative tests for payload validation', done: false },
        { label: 'Update API test report notes', done: false },
      ],
    },
    {
      title: 'Write Unit Tests for Auth Module',
      status: 'Pending',
      dueDate: 'Apr 8, 2026',
      owner: 'Sarah Chen',
      priority: 'medium',
      description: 'Add core unit tests for login, refresh token, and logout handlers.',
      attachments: ['auth-unit-test-plan.docx'],
      dailyChecklist: [
        { label: 'Cover successful login path', done: false },
        { label: 'Cover invalid credential path', done: false },
        { label: 'Add tests for refresh token expiry', done: false },
      ],
    },
    {
      title: 'Code Review - PR #47',
      status: 'Completed',
      dueDate: 'Apr 1, 2026',
      owner: 'John Rivera',
      priority: 'high',
      description: 'Review pull request quality, edge cases, and performance implications.',
      attachments: [],
      dailyChecklist: [
        { label: 'Reviewed logic and comments', done: true },
        { label: 'Requested final changes', done: true },
      ],
    },
    {
      title: 'Update Technical Documentation',
      status: 'Pending',
      dueDate: 'Apr 12, 2026',
      owner: 'Maria Santos',
      priority: 'low',
      description: 'Refresh setup guide and endpoint references for the current sprint.',
      attachments: ['api-guide-v2.md'],
      dailyChecklist: [
        { label: 'Update API endpoint table', done: false },
        { label: 'Revise onboarding quickstart', done: false },
      ],
    },
    {
      title: 'Security Audit Report',
      status: 'Overdue',
      dueDate: 'Mar 30, 2026',
      owner: 'John Rivera',
      priority: 'high',
      description: 'Summarize vulnerability checks and mitigation recommendations.',
      attachments: ['vuln-scan.csv', 'risk-summary.pdf', 'mitigation-plan.docx'],
      dailyChecklist: [
        { label: 'Confirm open issues and risk level', done: true },
        { label: 'Finalize mitigation plan section', done: false },
        { label: 'Share report draft to team lead', done: false },
      ],
    },
    {
      title: 'UI Component Library Setup',
      status: 'Completed',
      dueDate: 'Mar 28, 2026',
      owner: 'Sarah Chen',
      priority: 'medium',
      description: 'Set up shared UI components and documentation examples.',
      attachments: ['ui-library-spec.pdf', 'storybook-notes.txt'],
      dailyChecklist: [
        { label: 'Published initial component package', done: true },
        { label: 'Added usage examples', done: true },
      ],
    },
  ];

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
    const parts = dateText.replace(',', '').split(' ');

    if (parts.length !== 3) {
      return dateText;
    }

    const [monthText, dayText, yearText] = parts;
    const month = MONTH_MAP[monthText];

    if (!month) {
      return dateText;
    }

    const day = dayText.padStart(2, '0');
    return `${day}-${month}-${yearText}`;
  }

  function parseDueDate(dateText) {
    const parts = dateText.replace(',', '').split(' ');

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
      return attachments.map((item) => String(item || '').trim()).filter(Boolean);
    }

    return [];
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

  function mapCreatedTaskToUi(task, fallback) {
    const source = task || {};
    const defaultValue = fallback || {};

    return {
      title: String(source.title || defaultValue.title || '').trim(),
      status: String(source.status || defaultValue.status || 'Pending'),
      dueDate: fromInputDate(String(source.due_date || defaultValue.dueDate || '')) || defaultValue.dueDate || '',
      owner: String(source.owner || defaultValue.owner || ''),
      priority: String(source.priority || defaultValue.priority || 'medium'),
      description: String(source.description || defaultValue.description || 'No description provided yet.'),
      attachments: getAttachmentNames(source.attachments || defaultValue.attachments),
      dailyChecklist: Array.isArray(source.daily_checklist)
        ? source.daily_checklist.map((item) => ({
            label: String(item?.label || '').trim(),
            done: !!item?.done,
          }))
        : defaultValue.dailyChecklist || [],
    };
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
      assignedTasks = [savedTask, ...assignedTasks];
      selectedOverviewTaskTitle = savedTask.title;
      activeView = 'Overview';
      isAddTaskOpen = false;
      resetAddTaskForm();
      // Log activity
      logUserActivity({
        message: `Added a new task: ${savedTask.title}`,
        timestamp: new Date().toISOString(),
        user: user && user.email ? user.email : 'Unknown'
      });
      fetchRecentActivities();
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
      attachments: [...addTaskForm.attachments, ...files.map((file) => file.name)],
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
    // Find the task by id (or fallback to viewedTask)
    // If your tasks have an 'id' field, use it. Otherwise, use title as fallback.
    let taskIndex = assignedTasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1 && viewedTask) {
      taskIndex = assignedTasks.findIndex((t) => t.title === viewedTask.title);
    }
    if (taskIndex === -1) return;

    // Prepare payload for backend
    const task = assignedTasks[taskIndex];
    const payload = {
      id: taskId,
      status: newStatus,
      // Optionally include other fields if needed
    };
    try {
      await callUpdateActivityTask(payload);
      // Update local state
      assignedTasks = assignedTasks.map((t, i) =>
        i === taskIndex ? { ...t, status: newStatus } : t
      );
      // Also update viewedTask if open
      if (viewedTask && viewedTask.id === taskId) {
        viewedTask.status = newStatus;
        taskViewEditForm.status = newStatus;
      }
    } catch (err) {
      // Optionally show error to user
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
      // Fix: Add updateTaskStatus for status dropdown
      async function updateTaskStatus(taskId, newStatus) {
        // Find the task by id (or fallback to viewedTask)
        // If your tasks have an 'id' field, use it. Otherwise, use title as fallback.
        let taskIndex = assignedTasks.findIndex((t) => t.id === taskId);
        if (taskIndex === -1 && viewedTask) {
          taskIndex = assignedTasks.findIndex((t) => t.title === viewedTask.title);
        }
        if (taskIndex === -1) return;

        // Prepare payload for backend
        const task = assignedTasks[taskIndex];
        const payload = {
          id: taskId,
          status: newStatus,
          // Optionally include other fields if needed
        };
        try {
          await callUpdateActivityTask(payload);
          // Update local state
          assignedTasks = assignedTasks.map((t, i) =>
            i === taskIndex ? { ...t, status: newStatus } : t
          );
          // Also update viewedTask if open
          if (viewedTask && viewedTask.id === taskId) {
            viewedTask.status = newStatus;
            taskViewEditForm.status = newStatus;
          }
        } catch (err) {
          // Optionally show error to user
          alert('Failed to update status: ' + (err?.message || err));
        }
      }
    taskViewEditForm = {
      ...taskViewEditForm,
      attachments: taskViewEditForm.attachments.filter((_, itemIndex) => itemIndex !== index),
    };
  }

  function saveTaskEditFromView() {
    if (!viewedTask) {
      return;
    }

    const originalTitle = viewedTask.title;
    const nextTitle = taskViewEditForm.title.trim() || originalTitle;
    const nextTask = {
      ...viewedTask,
      title: nextTitle,
      status: taskViewEditForm.status,
      dueDate: fromInputDate(taskViewEditForm.dueDate) || viewedTask.dueDate,
      description: taskViewEditForm.description.trim() || viewedTask.description,
      attachments: getAttachmentNames(taskViewEditForm.attachments),
      dailyChecklist: taskViewEditForm.dailyChecklist
        .filter((item) => item.label.trim())
        .map((item) => ({ label: item.label.trim(), done: !!item.done })),
    };

    assignedTasks = assignedTasks.map((task) => (task.title === originalTitle ? nextTask : task));

    if (selectedOverviewTaskTitle === originalTitle) {
      selectedOverviewTaskTitle = nextTitle;
    }

    if (expandedListTaskTitle === originalTitle) {
      expandedListTaskTitle = nextTitle;
    }

    viewedTaskTitle = nextTitle;
    isEditingViewedTask = false;
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
  }

  function saveTrackerEdit() {
    if (!selectedOverviewTask) {
      return;
    }

    const originalTitle = selectedOverviewTask.title;
    const nextTitle = trackerEditForm.title.trim() || originalTitle;
    // Set dueDate to now in display format for 'last updated' effect
    const nowDate = new Date();
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formattedNow = `${MONTH_NAMES[nowDate.getMonth()]} ${nowDate.getDate()}, ${nowDate.getFullYear()}`;
    const nextTask = {
      ...selectedOverviewTask,
      title: nextTitle,
      status: trackerEditForm.status,
      dueDate: formattedNow, // update dueDate to now for immediate update
      description: trackerEditForm.description.trim() || selectedOverviewTask.description,
      attachments: getAttachmentNames(trackerEditForm.attachments),
      dailyChecklist: trackerEditForm.dailyChecklist
        .filter((item) => item.label.trim())
        .map((item) => ({ label: item.label.trim(), done: !!item.done })),
    };

    assignedTasks = assignedTasks.map((task) => (task.title === originalTitle ? nextTask : task));
    selectedOverviewTaskTitle = nextTitle;
    isEditingTrackerTask = false;
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

  $: completedCount = assignedTasks.filter((task) => task.status === 'Completed').length;
  $: completionRate = Math.round((completedCount / assignedTasks.length) * 100);
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

<section class="documents-page">
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
              <button type="submit" class="task-view-action primary" disabled={isSavingAddTask}>
                {isSavingAddTask ? 'Saving...' : 'Save Task'}
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
                />
              </div>

              {#if addTaskForm.attachments.length === 0}
                <p class="overview-empty-copy">No attachments.</p>
              {:else}
                <ul class="attachment-list">
                  {#each addTaskForm.attachments as fileName, index}
                    <li>
                      <span>{fileName}</span>
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
                <LayoutGrid size={18} style="color: #6366f1; background: color-mix(in srgb, #6366f1 10%, var(--color-surface)); border-radius: 0.4rem; padding: 0.18rem;" />
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
                <List size={18} style="color: #a21caf; background: color-mix(in srgb, #a21caf 10%, var(--color-surface)); border-radius: 0.4rem; padding: 0.18rem;" />
                <div class="notes-title">Recent Activity</div>
              </div>
              <div class="recent-activity-list" style="margin-bottom: 0.5rem;">
                {#if recentActivities.length === 0}
                  <p class="overview-empty-copy">No recent activities yet.</p>
                {:else}
                  <ul style="list-style: none; padding: 0; margin: 0;">
                    {#each recentActivities as activity (activity.id)}
                      <li style="margin-bottom: 0.5rem; display: flex; align-items: flex-start; gap: 0.5rem;">
                        <span style="font-size: 1.1rem; color: var(--color-primary, #a21caf);">•</span>
                        <div>
                          <div style="font-size: 1rem; color: var(--color-text); font-family: inherit;">{activity.message}</div>
                          <div style="font-size: 0.85rem; color: #888;">{new Date(activity.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>
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
                  <LayoutGrid size={18} style="color: #6366f1; background: color-mix(in srgb, #6366f1 10%, var(--color-surface)); border-radius: 0.4rem; padding: 0.18rem;" />
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
                  <p class="tracker-meta" style="font-style: italic; color: var(--color-muted); font-size: 0.97em; margin-bottom: 0.1em; line-height: 1.3;">
                    Due {selectedOverviewTask.dueDate}
                    <span aria-hidden="true">•</span>
                    {formatAttachmentMeta(selectedOverviewTask.attachments)}
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
                  <svelte:component
                    this={ChevronDown}
                    size={15}
                    class={expandedListTaskTitle === task.title ? 'chevron-open' : ''}
                  />
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
    <section class="panel daily-logs-panel" style="margin-top: 1.2rem;">
      <header class="panel-header">
        <h3>Daily Work Logs</h3>
      </header>
      <div class="daily-logs-content" style="padding: 1.2rem 1.1rem; display: flex; gap: 1.5rem; flex-wrap: wrap; background: var(--color-bg);">
        <!-- Add Work Log Card -->
        <div style="flex: 1 1 340px; min-width: 320px; background: var(--color-surface); border-radius: 1rem; box-shadow: 0 2px 12px 0 rgba(60, 72, 100, 0.07); padding: 1.2rem; border: 1px solid var(--color-border); max-width: 420px;">
          <h4 style="font-size: 0.93rem; font-weight: 700; color: var(--color-heading); margin-bottom: 1rem; font-family: inherit; display: flex; align-items: center; gap: 0.5rem;">
            <FileEdit size={18} style="color: var(--color-accent);" />
            Add Work Log
          </h4>
          <form>
            <label style="display: block; margin-bottom: 0.7rem;">
              <span style="font-size: 0.97rem; font-weight: 400; color: var(--color-text); font-family: inherit;">Task</span>
              <input type="text" placeholder="Task worked on" style="width: 100%; margin-top: 0.2rem; font-size: 0.83rem; padding: 0.5rem 0.7rem; border-radius: 0.5rem; border: 1px solid var(--color-border); background: var(--color-soft); color: var(--color-text); font-family: inherit;" />
            </label>
            <label style="display: block; margin-bottom: 0.7rem;">
              <span style="font-size: 0.97rem; font-weight: 400; color: var(--color-text); font-family: inherit;">Notes</span>
              <textarea placeholder="Notes" rows="2" style="width: 100%; margin-top: 0.2rem; font-size: 0.83rem; padding: 0.5rem 0.7rem; border-radius: 0.5rem; border: 1px solid var(--color-border); background: var(--color-soft); color: var(--color-text); font-family: inherit;"></textarea>
            </label>
            <label style="display: block; margin-bottom: 1.1rem;">
              <span style="font-size: 0.97rem; font-weight: 400; color: var(--color-text); font-family: inherit;">Learnings</span>
              <textarea placeholder="What did you learn today?" rows="2" style="width: 100%; margin-top: 0.2rem; font-size: 0.83rem; padding: 0.5rem 0.7rem; border-radius: 0.5rem; border: 1px solid var(--color-border); background: var(--color-soft); color: var(--color-text); font-family: inherit;"></textarea>
            </label>
            <button type="submit" style="font-size: 0.97rem; font-weight: 600; color: #fff; background: #4f46e5; border: none; border-radius: 0.5rem; padding: 0.5rem 1.3rem; cursor: pointer;">Submit</button>
          </form>
        </div>
        <!-- Work Logs Card -->
        <div style="flex: 2 1 0%; min-width: 320px; background: var(--color-surface); border-radius: 1rem; box-shadow: 0 2px 12px 0 rgba(60, 72, 100, 0.07); padding: 1.2rem; border: 1px solid var(--color-border); width: 100%; max-width: none;">
          <h4 style="font-size: 0.93rem; font-weight: 700; color: var(--color-heading); margin-bottom: 1rem; font-family: inherit; display: flex; align-items: center; gap: 0.5rem;">
            <BookOpen size={18} style="color: var(--color-accent);" />
            Work Logs
          </h4>
        </div>
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
          <input type="text" value={viewedTask.owner} readonly />
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
    background: var(--color-surface);
    border-radius: 1.1rem;
    box-shadow: 0 2px 12px 0 rgba(60, 72, 100, 0.07);
    padding: 1.2rem 1.3rem 1.1rem 1.3rem;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    min-height: 210px;
    border: 1px solid var(--color-border);
    gap: 0.7rem;
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
    background: color-mix(in srgb, #ede9fe 50%, var(--color-surface));
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
    font-family: 'Inter', 'Roboto', 'Segoe UI', Arial, sans-serif;
    font-weight: 500;
  }
  .notes-textarea::placeholder {
    color: var(--color-muted);
    font-size: 0.9rem;
    font-family: 'Inter', 'Roboto', 'Segoe UI', Arial, sans-serif;
    font-weight: 500;
    opacity: 1;
  }
  :global(html) {
    font-family: 'Inter', 'Roboto', 'Segoe UI', Arial, sans-serif;
    --color-bg: #f8fafc;
    --color-surface: #ffffff;
    --color-soft: #f3f4f6;
    --color-card: #ffffff;
    --color-border: #e5e7eb;
    --color-heading: #0f172a;
    --color-text: #1f2937;
    --color-muted: #605f5f;
    --color-accent: #6366f1;
    --color-accent-bg: #232263;
    --color-danger: #ef4444;
    --color-success: #22c55e;
    --color-warning: #f59e42;
    background: var(--color-bg);
    color: var(--color-text);
    scrollbar-gutter: stable;
  }
  :global(html.dark) {
    --color-bg: #181a20;
    --color-surface: #23263a;
    --color-soft: #2a2d42;
    --color-card: #23263a;
    --color-border: #3a3f5a;
    --color-heading: #f3f4f6;
    --color-text: #e5e7eb;
    --color-muted: #a1a1aa;
    --color-accent: #6366f1;
    --color-accent-bg: #232263;
    --color-danger: #ef4444;
    --color-success: #22c55e;
    --color-warning: #f59e42;
    background: #181a20;
    color: #e5e7eb;
  }

  .documents-page {
    display: grid;
    gap: 1rem;
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
    box-shadow: 0 12px 24px -24px rgba(15, 23, 42, 0.3);
    /* Ensure all corners are equally rounded */
    -webkit-border-radius: 1.1rem;
    -moz-border-radius: 1.1rem;
    border-bottom-left-radius: 1.1rem;
    border-bottom-right-radius: 1.1rem;
    border-top-left-radius: 1.1rem;
    border-top-right-radius: 1.1rem;
  }

  .stat-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.1rem;
    min-height: 5.45rem;
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
    border: 1px solid transparent;
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
    color: #a5b4fc;
    text-shadow: 0 1px 2px rgba(165,180,252,0.18);
  }

  .stat-label {
    margin: 0.15rem 0 0;
    color: var(--color-muted);
    font-size: 0.86rem;
    font-weight: 700;
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
  }

  .search-control input {
    border: 0;
    background: transparent;
    color: var(--color-heading);
    font-size: 0.85rem;
    width: 12rem;
    outline: none;
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
  }

  .new-task-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0 0.75rem;
    color: #ffffff;
    background: #4f46e5;
    border-color: #4f46e5;
    font-size: 0.84rem;
    font-weight: 600;
    cursor: pointer;
  }

  .new-task-btn:hover {
    background: #4338ca;
    border-color: #4338ca;
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
  }

  .view-toggle button.active {
    color: #4f46e5;
    border-color: #c7d2fe;
    background: color-mix(in srgb, #4f46e5 10%, var(--color-surface));
  }

  .view-toggle button.active span {
    font-weight: 600;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1rem 0.9rem;
    border-bottom: 1px solid var(--color-border);
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
    color: #a5b4fc;
    text-shadow: 0 1px 2px rgba(165,180,252,0.12);
  }

  .tasks-panel {
    overflow: hidden;
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
    background: var(--color-soft);
  }

  .overview-panels {
    display: grid;
    grid-template-columns: 1fr 1fr 0.8fr;
    gap: 0.85rem;
  }

  .overview-panel {
    border: 1px solid var(--color-border);
    border-radius: 0.8rem;
    background: var(--color-surface);
    padding: 0.95rem;
    min-height: 10.25rem;
  }

  .overview-panel h4 {
    margin: 0;
    color: var(--color-heading);
    font-size: 1rem;
    font-weight: 650;
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

  .overview-task-link:hover,
  .overview-task-link.active {
    background: var(--color-soft);
    border-color: var(--color-border);
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
    box-shadow: 0 12px 24px -24px rgba(15, 23, 42, 0.3);
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
    color: #6366f1;
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
    border: 1px solid #4f46e5;
    background: #4f46e5;
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
    color: #4f46e5;
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
    padding: 0.9rem 1rem;
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
    background: rgba(15, 23, 42, 0.3);
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
    box-shadow: 0 24px 40px -30px rgba(15, 23, 42, 0.45);
    padding: 1rem;
    display: grid;
    gap: 0.9rem;
  }
  :global(html.dark) .task-view-modal {
    background: #23263a;
    border: 1px solid #23263a;
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
    border-color: #4f46e5;
    background: #4f46e5;
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
    background: color-mix(in srgb, #6366f1 10%, var(--color-surface));
    border-color: var(--color-accent);
  }

  .attachment-btn:focus-visible,
  .view-toggle button:focus-visible,
  .search-control input:focus-visible,
  .status-control select:focus-visible {
    outline: 2px solid #a5b4fc;
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
    color: #4f46e5;
    background: #eef2ff;
    border-color: #e0e7ff;
  }

  .tone-card-indigo {
    background: #f5f7ff;
    border-color: #bfd0ff;
  }

  .tone-card-blue {
    background: #f3f7ff;
    border-color: #bfd5ff;
  }

  .tone-card-green {
    background: #edf8f4;
    border-color: #a8e6c7;
  }

  .tone-card-violet {
    background: #f7f5ff;
    border-color: #d7cdfa;
  }

  .tone-card-red {
    background: #fff3f2;
    border-color: #ffc9c4;
  }

  .tone-card-amber {
    background: #fffaf0;
    border-color: #f8dfa3;
  }

  .tone-blue {
    color: #2563eb;
    background: #eff6ff;
    border-color: #dbeafe;
  }

  .tone-green {
    color: #059669;
    background: #ecfdf5;
    border-color: #a7f3d0;
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

  @media (max-width: 1200px) {
    .stats-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

  }

  @media (max-width: 720px) {
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
</style>
