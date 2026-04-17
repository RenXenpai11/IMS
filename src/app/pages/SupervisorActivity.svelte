<script>
  // @ts-nocheck
  import { onDestroy, onMount } from 'svelte';
  import { Users, Clock3, CheckCircle, AlertCircle } from 'lucide-svelte';

  export let currentUser = null;

  let kpis = {
    today_logs: 0,
    pending_approvals: 0,
    active_interns: 0,
    overdue_tasks: 0
  };
  let recentActivities = [];
  let workLogs = [];
  let progress = [];
  let alerts = {
    missing_notes: 0,
    no_attachments: 0,
    overdue_tasks: 0
  };
  let students = [];
  let selectedStudentId = 'all';
  let selectedInternId = '';
  let activeView = 'Overview';
  let selectedStatus = 'all';
  let searchTerm = '';
  let isLoading = false;
  let loadError = '';
  let selectedDate = '';

  let showAddTask = false;
  let newTaskTitle = '';
  let newTaskDescription = '';
  let newTaskDueDate = '';
  let newTaskStatus = 'Pending';
  let newTaskAssignees = [];
  let isCreatingTask = false;

  let showAssigneeDropdown = false;
  let assigneeSearch = '';
  let assigneeButtonEl;
  let assigneeDropdownEl;

  let internSearch = '';
  let archivedInterns = [];
  let supervisorTasks = [];
  let archivedSupervisorTasks = [];
  let showViewTask = false;
  let viewTask = null;
  let showEditTask = false;
  let editTaskForm = null;
  let editTaskAssignees = [];
  let isSavingEdit = false;
  let showEditAssigneeDropdown = false;
  let editAssigneeSearch = '';
  let editAssigneeButtonEl;
  let editAssigneeDropdownEl;


  let refreshIntervalId;
  let now = new Date();

  // artificial frontend delay (ms) to smooth perceived loading/saving time
  const ARTIFICIAL_DELAY_MS = 500;
  let enableArtificialDelay = true;
  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
  function maybeDelay() { return enableArtificialDelay ? sleep(ARTIFICIAL_DELAY_MS) : Promise.resolve(); }

  function updateNow() {
    now = new Date();
  }

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

  function callSupervisorOverview(payload) {
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
        .getSupervisorActivityOverview(payload);
    });
  }

  function callUpdateWorklogStatus(payload) {
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
        .updateWorklogStatus(payload);
    });
  }

  function callExportWorklogsCsv(payload) {
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
        .getSupervisorWorklogsCsv(payload);
    });
  }

  function callGetAllStudents(payload) {
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
        .getAllStudents(payload);
    });
  }

  function callCreateSupervisorTasks(payload) {
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
        .createSupervisorTasks(payload);
    });
  }

  function callGetSupervisorTasks(payload) {
    return new Promise((resolve, reject) => {
      const run = globalThis?.google?.script?.run;
      if (!run) {
        reject(new Error('Apps Script runtime is not available in this view.'));
        return;
      }
      run.withSuccessHandler(resolve).withFailureHandler((error) => reject(new Error(error?.message || String(error)))).getSupervisorTasks(payload);
    });
  }

  async function refreshOverview() {
    if (!currentUser?.user_id) {
      loadError = 'Unable to load supervisor data.';
      return;
    }

    isLoading = true;
    // small artificial delay to improve perceived responsiveness
    await maybeDelay();
    loadError = '';

    try {
      const result = await callSupervisorOverview({ supervisor_user_id: currentUser.user_id });
      if (!result?.ok) {
        throw new Error(result?.error || 'Unable to load supervisor overview.');
      }

      kpis = result.kpis || kpis;
      recentActivities = Array.isArray(result.recent_activities) ? result.recent_activities : [];
      workLogs = Array.isArray(result.worklogs) ? result.worklogs : [];
      progress = Array.isArray(result.progress) ? result.progress : [];
      alerts = result.alerts || alerts;
      students = Array.isArray(result.students) ? result.students : [];
      // load supervisor-created tasks from server so they persist across refresh/signout
      try {
        const tasksRes = await callGetSupervisorTasks({ supervisor_user_id: currentUser.user_id });
        if (tasksRes && tasksRes.ok && Array.isArray(tasksRes.tasks)) {
          const mapped = tasksRes.tasks.map(t => ({
            id: String(t.id || t.sup_taskid || ''),
            title: String(t.title || t.task || ''),
            description: String(t.description || ''),
            due_date: String(t.due_date || ''),
            status: String(t.status || ''),
            assigned_student_ids: Array.isArray(t.assigned_student_ids) ? t.assigned_student_ids : []
          }));
          supervisorTasks = mapped.filter(x => String(x.status || '').toLowerCase() !== 'archived');
          archivedSupervisorTasks = mapped.filter(x => String(x.status || '').toLowerCase() === 'archived');
        } else {
          supervisorTasks = supervisorTasks || [];
          archivedSupervisorTasks = archivedSupervisorTasks || [];
        }
      } catch (e) {
        // non-fatal
        supervisorTasks = supervisorTasks || [];
      }
    } catch (error) {
      loadError = error?.message || 'Unable to load supervisor overview.';
    } finally {
      isLoading = false;
    }
  }

  async function handleWorklogStatus(taskId, status) {
    if (!taskId) return;
    try {
      await maybeDelay();
      await callUpdateWorklogStatus({
        task_id: taskId,
        status,
        updated_by: currentUser?.user_id || ''
      });
      await refreshOverview();
    } catch (error) {
      loadError = error?.message || 'Unable to update work log.';
    }
  }

  async function approveWorklog(log) {
    if (!log || !log.task_id) return;
    // optimistic status update so it moves to archive immediately
    log.status = 'Approved';
    await handleWorklogStatus(log.task_id, 'Approved');
  }

  async function handleExportCsv() {
    if (!currentUser?.user_id) {
      loadError = 'Unable to export work logs.';
      return;
    }

    try {
      const result = await callExportWorklogsCsv({ supervisor_user_id: currentUser.user_id });
      if (!result?.ok) {
        throw new Error(result?.error || 'Unable to export work logs.');
      }

      const blob = new Blob([result.csv || ''], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'worklogs.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      loadError = error?.message || 'Unable to export work logs.';
    }
  }

  function extractLogDateISO(log) {
    const candidates = [log?.date, log?.work_date, log?.log_date, log?.created_at, log?.timestamp, log?.activity_date, log?.submitted_at];
    for (const c of candidates) {
      if (!c && c !== 0) continue;
      try {
        const maybeNum = Number(c);
        const d = new Date(maybeNum && !Number.isNaN(maybeNum) ? maybeNum : c);
        if (!Number.isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        }
      } catch (e) {
        // ignore
      }

      const ddmm = /^([0-9]{2})-([0-9]{2})-([0-9]{2,4})$/.exec(String(c));
      if (ddmm) {
        let yy = ddmm[3];
        if (yy.length === 2) yy = '20' + yy;
        return `${yy}-${ddmm[2]}-${ddmm[1]}`;
      }

      const mmdd = /^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{2,4})$/.exec(String(c));
      if (mmdd) {
        let yy = mmdd[3];
        if (yy.length === 2) yy = '20' + yy;
        const mm = String(mmdd[1]).padStart(2, '0');
        const dd = String(mmdd[2]).padStart(2, '0');
        return `${yy}-${mm}-${dd}`;
      }
    }
    return '';
  }

  $: approvedWorkLogs = workLogs.filter((log) => {
    const isApproved = String(log.status || '').toLowerCase() === 'approved';
    if (!isApproved) return false;
    if (selectedDate) {
      const logDate = extractLogDateISO(log);
      if (!logDate || logDate !== selectedDate) return false;
    }
    return true;
  });

  $: filteredWorkLogs = workLogs.filter((log) => {
    const isApproved = String(log.status || '').toLowerCase() === 'approved';
    if (isApproved) return false;
    const matchesStudent = selectedStudentId === 'all' || String(log.user_id || '') === selectedStudentId;
    const matchesStatus = selectedStatus === 'all' || String(log.status || '').toLowerCase() === selectedStatus;
    const query = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !query ||
      String(log.task || '').toLowerCase().includes(query) ||
      String(log.notes || '').toLowerCase().includes(query) ||
      String(log.learnings || '').toLowerCase().includes(query) ||
      String(log.user_name || '').toLowerCase().includes(query);
    return matchesStudent && matchesStatus && matchesSearch;
  });

  $: selectedIntern = students.find((student) => String(student.user_id || '') === String(selectedInternId || ''));
  $: selectedInternLogs = workLogs.filter((log) => String(log.user_id || '') === String(selectedInternId || ''));

  // tasks assigned to the currently selected intern (or all)
  $: internTasks = supervisorTasks.filter(t => {
    if (!t) return false;
    if (!t.assigned_student_ids || !Array.isArray(t.assigned_student_ids)) return false;
    // only include tasks assigned to the selected intern (or all)
    const assignedMatch = selectedStudentId === 'all' || t.assigned_student_ids.includes(selectedStudentId);
    // if the task includes created_by, ensure it matches current supervisor; otherwise allow (server already scopes tasks)
    const createdByMatch = t.created_by ? String(t.created_by) === String(currentUser?.user_id || '') : true;
    return assignedMatch && createdByMatch;
  });

  function previewText(txt, max = 80) {
    if (!txt) return '';
    const s = String(txt || '');
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '…';
  }

  // map task status to CSS class names matching ActivityIntern.svelte
  function statusClass(status) {
    if (!status) return '';
    const s = String(status).trim();
    const map = {
      'Pending': 'status-pending',
      'In Progress': 'status-progress',
      'Completed': 'status-completed',
      'Overdue': 'status-overdue'
    };
    return map[s] || '';
  }

  onMount(() => {
    (async () => {
      await refreshOverview();
      try {
        const list = await callGetAllStudents();
        if (list && list.ok && Array.isArray(list.students)) {
          students = list.students.map((s) => ({ user_id: String(s.user_id || ''), full_name: String(s.full_name || '') }));
        }
      } catch (e) {
        // non-fatal
      }
    })();
    refreshIntervalId = setInterval(() => {
      updateNow();
      refreshOverview();
    }, 15000);
  });

  onDestroy(() => {
    clearInterval(refreshIntervalId);
  });

  async function submitNewTask() {
    if (!newTaskTitle.trim() || newTaskAssignees.length === 0) return;
    isCreatingTask = true;
    try {
      function formatDateToDDMMYY(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (Number.isNaN(d.getTime())) return '';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = String(d.getFullYear()).slice(-2);
        return `${dd}-${mm}-${yy}`;
      }

      const formattedDue = formatDateToDDMMYY(newTaskDueDate);

      const payload = {
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim(),
        due_date: formattedDue,
        status: newTaskStatus,
        supervisor_user_id: currentUser?.user_id || '',
        assigned_student_ids: Array.isArray(newTaskAssignees) ? newTaskAssignees : (newTaskAssignees ? [newTaskAssignees] : []),
        created_by: currentUser?.user_id || '',
        updated_by: currentUser?.user_id || ''
      };
      // simulate brief save latency
      await maybeDelay();
      const res = await callCreateSupervisorTasks(payload);
      if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Unable to create tasks.');
      // add to local task list so it appears in List view immediately
      const savedTask = {
        id: (res.task && (res.task.id || res.task.task_id)) || (res.task_id || String(Date.now())),
        title: payload.title,
        description: payload.description,
        due_date: payload.due_date,
        status: payload.status,
        created_by: payload.created_by,
        assigned_student_ids: Array.isArray(payload.assigned_student_ids) ? payload.assigned_student_ids : []
      };
      supervisorTasks = [savedTask, ...supervisorTasks];

      newTaskTitle = '';
      newTaskDescription = '';
      newTaskDueDate = '';
      newTaskAssignees = [];
      showAddTask = false;
      await refreshOverview();
    } catch (err) {
      loadError = err?.message || 'Unable to create tasks.';
    } finally {
      isCreatingTask = false;
    }
  }

  function toggleAssigneeDropdown() {
    showAssigneeDropdown = !showAssigneeDropdown;
  }

  function toggleAssigneeSelection(userId) {
    const idx = newTaskAssignees.indexOf(userId);
    if (idx === -1) newTaskAssignees = [...newTaskAssignees, userId];
    else newTaskAssignees = newTaskAssignees.filter(id => id !== userId);
  }

  function openViewTask(task) {
    viewTask = task || null;
    showViewTask = true;
  }

  function closeViewTask() {
    showViewTask = false;
    viewTask = null;
  }

  function formatDateToMMDDYYYY(dateStr) {
    if (!dateStr) return '';
    // If stored as dd-mm-yy or dd-mm-yyyy, parse it
    const ddmmRegex = /^\s*(\d{1,2})-(\d{1,2})-(\d{2,4})\s*$/;
    const m = String(dateStr).match(ddmmRegex);
    if (m) {
      let dd = parseInt(m[1], 10);
      let mm = parseInt(m[2], 10);
      let yy = m[3];
      if (yy.length === 2) yy = '20' + yy;
      const yyyy = parseInt(yy, 10);
      const d = new Date(yyyy, mm - 1, dd);
      if (!Number.isNaN(d.getTime())) {
        const mmStr = String(d.getMonth() + 1).padStart(2, '0');
        const ddStr = String(d.getDate()).padStart(2, '0');
        const yyyyStr = d.getFullYear();
        return `${mmStr}-${ddStr}-${yyyyStr}`;
      }
      return '';
    }

    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) return '';
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    const yyyy = parsed.getFullYear();
    return `${mm}-${dd}-${yyyy}`;
  }

  function assignedNames(ids) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) return '';
    const names = ids.map(id => {
      const s = students.find(st => String(st.user_id || '') === String(id || ''));
      return s ? s.full_name : id;
    });
    return names.join(', ');
  }

  function formatDateToDDMMYY(dateStr) {
    if (!dateStr) return '';
    // If already in dd-mm-yy or dd-mm-yyyy, normalize to dd-mm-yy (two-digit year)
    const ddmm = /^\s*(\d{1,2})-(\d{1,2})-(\d{2,4})\s*$/.exec(String(dateStr));
    if (ddmm) {
      let dd = String(ddmm[1]).padStart(2, '0');
      let mm = String(ddmm[2]).padStart(2, '0');
      let yy = ddmm[3];
      if (yy.length === 4) yy = yy.slice(-2);
      return `${dd}-${mm}-${yy}`;
    }
    // try ISO parse
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}-${mm}-${yy}`;
  }

  function toISOInputDate(dateStr) {
    if (!dateStr) return '';
    // handle dd-mm-yy / dd-mm-yyyy
    const m = String(dateStr).match(/^\s*(\d{1,2})-(\d{1,2})-(\d{2,4})\s*$/);
    if (m) {
      let dd = String(m[1]).padStart(2, '0');
      let mm = String(m[2]).padStart(2, '0');
      let yy = m[3];
      if (yy.length === 2) yy = '20' + yy;
      return `${yy}-${mm}-${dd}`;
    }
    // try Date parse
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function callUpdateSupervisorTask(payload) {
    return new Promise((resolve, reject) => {
      const run = globalThis?.google?.script?.run;
      if (!run) {
        reject(new Error('Apps Script runtime is not available in this view.'));
        return;
      }
      run.withSuccessHandler(resolve).withFailureHandler((error) => reject(new Error(error?.message || String(error)))).updateSupervisorTask(payload);
    });
  }

  function openEditTask(task) {
    if (!task) return;
    editTaskForm = {
      id: task.id,
      title: task.title || '',
      description: task.description || '',
      due_date: toISOInputDate(task.due_date) || '',
      status: task.status || 'Pending'
    };
    editTaskAssignees = Array.isArray(task.assigned_student_ids) ? [...task.assigned_student_ids] : [];
    showEditTask = true;
  }

  function toggleEditAssigneeSelection(userId) {
    const idx = editTaskAssignees.indexOf(userId);
    if (idx === -1) editTaskAssignees = [...editTaskAssignees, userId];
    else editTaskAssignees = editTaskAssignees.filter(id => id !== userId);
  }

  async function saveEditedTask() {
    if (!editTaskForm || !editTaskForm.title.trim()) return;
    isSavingEdit = true;
    try {
      const formattedDue = formatDateToDDMMYY(editTaskForm.due_date);
      const payload = {
        sup_taskid: editTaskForm.id,
        title: editTaskForm.title.trim(),
        description: editTaskForm.description.trim(),
        due_date: formattedDue,
        status: editTaskForm.status,
        assigned_student_ids: Array.isArray(editTaskAssignees) ? editTaskAssignees : [],
        updated_by: currentUser?.user_id || ''
      };
      // simulate brief save latency
      await maybeDelay();
      const res = await callUpdateSupervisorTask(payload);
      if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Unable to update task.');
      // update local list
      supervisorTasks = supervisorTasks.map(t => {
        if (String(t.id) === String(editTaskForm.id)) {
          return {
            ...t,
            title: payload.title,
            description: payload.description,
            due_date: payload.due_date,
            status: payload.status,
            assigned_student_ids: payload.assigned_student_ids
          };
        }
        return t;
      });
      
      // update viewTask if open
      if (viewTask && String(viewTask.id) === String(editTaskForm.id)) {
        viewTask = supervisorTasks.find(x => String(x.id) === String(editTaskForm.id)) || viewTask;
      }
      showEditTask = false;
      await refreshOverview();
    } catch (err) {
      loadError = err?.message || 'Unable to save changes.';
    } finally {
      isSavingEdit = false;
    }
  }

  


  function assigneeLabel() {
    if (!newTaskAssignees || newTaskAssignees.length === 0) return 'Select interns';
    const names = students.filter(s => newTaskAssignees.includes(s.user_id)).map(s => s.full_name);
    if (names.length === 1) return names[0];
    return names.length + ' selected';
  }

  $: filteredAssignees = (assigneeSearch && assigneeSearch.trim())
    ? students.filter(s => String(s.full_name || '').toLowerCase().includes(assigneeSearch.trim().toLowerCase()))
    : students;

$: filteredEditAssignees = (editAssigneeSearch && editAssigneeSearch.trim())
    ? students.filter(s => String(s.full_name || '').toLowerCase().includes(editAssigneeSearch.trim().toLowerCase()))
    : students;

function editAssigneeLabel() {
  if (!editTaskAssignees || editTaskAssignees.length === 0) return 'Select interns';
  const names = students.filter(s => editTaskAssignees.includes(s.user_id)).map(s => s.full_name);
  if (names.length === 1) return names[0];
  return names.length + ' selected';
}

function toggleEditAssigneeDropdown() {
  showEditAssigneeDropdown = !showEditAssigneeDropdown;
}

  $: filteredInterns = (internSearch && internSearch.trim())
    ? students.filter(s => String(s.full_name || '').toLowerCase().includes(internSearch.trim().toLowerCase()))
    : students;

  function handleDocumentClick(e) {
    const target = e.target;
    if (showAssigneeDropdown) {
      if (!(assigneeDropdownEl && assigneeDropdownEl.contains(target)) && !(assigneeButtonEl && assigneeButtonEl.contains(target))) {
        showAssigneeDropdown = false;
      }
    }
    if (showEditAssigneeDropdown) {
      if (!(editAssigneeDropdownEl && editAssigneeDropdownEl.contains(target)) && !(editAssigneeButtonEl && editAssigneeButtonEl.contains(target))) {
        showEditAssigneeDropdown = false;
      }
    }
    // intern dropdown removed; nothing to close here
  }

  onMount(() => {
    document.addEventListener('click', handleDocumentClick);
  });

  onDestroy(() => {
    document.removeEventListener('click', handleDocumentClick);
  });

  function archiveIntern(userId) {
    if (!userId) return;
    // optimistically update UI and call backend
    const toArchive = students.find(s => String(s.user_id) === String(userId));
    if (!toArchive) return;
    // call backend to archive assignment
    (async () => {
      try {
        const res = await callArchiveSupervisorAssignment({ supervisor_user_id: currentUser?.user_id || '', student_user_id: userId });
        if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Unable to archive intern.');
        archivedInterns = [...archivedInterns, toArchive];
        students = students.filter(s => String(s.user_id) !== String(userId));
        if (selectedInternId === userId) selectedInternId = '';
      } catch (err) {
        loadError = err?.message || 'Unable to archive intern.';
      }
    })();
  }

  async function restoreIntern(userId) {
    if (!userId) return;
    try {
      const res = await callRestoreSupervisorAssignment({ supervisor_user_id: currentUser?.user_id || '', student_user_id: userId });
      if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Unable to restore intern.');
      const restored = archivedInterns.find(s => String(s.user_id) === String(userId));
      if (restored) {
        students = [...students, restored].sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')));
        archivedInterns = archivedInterns.filter(s => String(s.user_id) !== String(userId));
      }
    } catch (err) {
      loadError = err?.message || 'Unable to restore intern.';
    }
  }

  function callArchiveSupervisorAssignment(payload) {
    return new Promise((resolve, reject) => {
      const run = globalThis?.google?.script?.run;
      if (!run) {
        reject(new Error('Apps Script runtime is not available in this view.'));
        return;
      }
      run.withSuccessHandler(resolve).withFailureHandler((error) => reject(new Error(error?.message || String(error)))).archiveSupervisorAssignment(payload);
    });
  }

  function callRestoreSupervisorAssignment(payload) {
    return new Promise((resolve, reject) => {
      const run = globalThis?.google?.script?.run;
      if (!run) {
        reject(new Error('Apps Script runtime is not available in this view.'));
        return;
      }
      run.withSuccessHandler(resolve).withFailureHandler((error) => reject(new Error(error?.message || String(error)))).restoreSupervisorAssignment(payload);
    });
  }

  function archiveTask(taskId) {
    if (!taskId) return;
    const task = supervisorTasks.find(t => String(t.id) === String(taskId));
    if (!task) return;
    // persist archive status to server
    (async () => {
      try {
        await maybeDelay();
        await callUpdateSupervisorTask({ sup_taskid: task.id, status: 'Archived', updated_by: currentUser?.user_id || '' });
      } catch (err) {
        // non-fatal, continue to update UI
      }
      archivedSupervisorTasks = [task, ...archivedSupervisorTasks.filter(t => String(t.id) !== String(taskId))];
      supervisorTasks = supervisorTasks.filter(t => String(t.id) !== String(taskId));
    })();
  }

  function restoreTask(taskId) {
    if (!taskId) return;
    const task = archivedSupervisorTasks.find(t => String(t.id) === String(taskId));
    if (!task) return;
    (async () => {
      try {
        await maybeDelay();
        await callUpdateSupervisorTask({ sup_taskid: task.id, status: 'Pending', updated_by: currentUser?.user_id || '' });
      } catch (err) {
        // non-fatal
      }
      supervisorTasks = [task, ...supervisorTasks.filter(t => String(t.id) !== String(taskId))];
      archivedSupervisorTasks = archivedSupervisorTasks.filter(t => String(t.id) !== String(taskId));
    })();
  }

  // expandable logs state
  let expandedLogIds = [];
  function toggleExpand(id) {
    if (!id) return;
    const idx = expandedLogIds.indexOf(id);
    if (idx === -1) expandedLogIds = [...expandedLogIds, id];
    else expandedLogIds = expandedLogIds.filter(x => x !== id);
  }
</script>

<div class="supervisor-activity">

  {#if loadError}
    <div class="banner error">{loadError}</div>
  {:else if isLoading}
    <div class="banner">Loading supervisor overview...</div>
  {/if}

  

  <section class="kpi-grid">
    <div class="kpi-card kpi-1">
      <Clock3 class="kpi-icon" />
      <span class="kpi-value">{kpis.today_logs}</span>
      <span class="kpi-label">Today logs</span>
    </div>
    <div class="kpi-card kpi-2">
      <CheckCircle class="kpi-icon" />
      <span class="kpi-value">{kpis.pending_approvals}</span>
      <span class="kpi-label">Pending approvals</span>
    </div>
    <div class="kpi-card kpi-3">
      <Users class="kpi-icon" />
      <span class="kpi-value">{kpis.active_interns}</span>
      <span class="kpi-label">Active interns</span>
    </div>
    <div class="kpi-card kpi-4">
      <AlertCircle class="kpi-icon" />
      <span class="kpi-value">{kpis.overdue_tasks}</span>
      <span class="kpi-label">Overdue tasks</span>
    </div>
  </section>

  <!-- Task creation / quick panel -->
  <section class="card quick-panel">
    <div class="quick-head">
      <div class="view-controls">
        <button class="btn btn-ghost" class:active={activeView === 'Overview'} on:click={() => activeView = 'Overview'}>Overview</button>
        <button class="btn btn-ghost" class:active={activeView === 'List'} on:click={() => activeView = 'List'}>List</button>
        <button class="btn btn-ghost" class:active={activeView === 'Archive'} on:click={() => activeView = 'Archive'}>Archive</button>
      </div>

      <div class="quick-actions">
        <input class="search-input" type="text" placeholder="Search" bind:value={searchTerm} />
        <select class="quick-status" bind:value={selectedStatus} aria-label="Filter by status">
          <option value="all">All status</option>
          <option value="completed">Completed</option>
          <option value="in progress">In Progress</option>
          <option value="overdue">Overdue</option>
          <option value="pending">Pending</option>
        </select>
        <button class="primary" on:click={() => showAddTask = true}>+ Add Task</button>
      </div>
    </div>
  </section>

  {#if showAddTask}
    <div class="modal-backdrop" role="button" tabindex="0" aria-label="Close dialog" on:click={() => showAddTask = false} on:keydown={(e) => { if (e.key === 'Escape') showAddTask = false; }}></div>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Add Task">
      <h3 style="font-weight:700; margin:0 0 0.5rem 0;">Add Task</h3>

      <label for="task-title">Task</label>
      <input id="task-title" type="text" bind:value={newTaskTitle} />

      <label for="task-desc">Description</label>
      <textarea id="task-desc" rows="6" bind:value={newTaskDescription}></textarea>

      <label for="task-status">Status</label>
      <select id="task-status" bind:value={newTaskStatus} style="width:100%; padding:0.5rem; border-radius:0.5rem; border:1px solid var(--border); background:var(--soft); margin-bottom:0.4rem;">
        <option value="Pending">Pending</option>
        <option value="In Progress">In Progress</option>
        <option value="Overdue">Overdue</option>
        <option value="Completed">Completed</option>
      </select>

      <label for="task-due">Due Date</label>
      <input id="task-due" type="date" bind:value={newTaskDueDate} />

      <label for="task-assigned">Assigned To</label>
      <div style="position:relative;">
        <button bind:this={assigneeButtonEl} type="button" class="ghost btn-compact" on:click={toggleAssigneeDropdown} aria-haspopup="listbox" aria-expanded={showAssigneeDropdown} style="width:100%; text-align:left; display:flex; justify-content:space-between; align-items:center; border-radius:0.5rem; padding:0.45rem 0.6rem;">
          <span>{assigneeLabel()}</span>
          <span style="opacity:0.7">▾</span>
        </button>
        {#if showAssigneeDropdown}
          <div bind:this={assigneeDropdownEl} role="listbox" tabindex="-1" style="position:absolute; z-index:70; left:0; right:0; max-height:220px; overflow:auto; background:var(--surface); border:1px solid var(--border); border-radius:0.5rem; margin-top:0.4rem; padding:0.4rem; box-shadow: none;">
            <!-- search removed: show checkboxes only -->
            {#if filteredAssignees.length === 0}
              <div style="padding:0.5rem; color:var(--muted);">No interns found.</div>
            {:else}
              {#each filteredAssignees as s}
                <label style="display:flex; align-items:center; gap:0.5rem; padding:0.25rem 0.4rem; cursor:pointer;">
                  <input type="checkbox" checked={newTaskAssignees.indexOf(s.user_id) !== -1} on:change={() => toggleAssigneeSelection(s.user_id)} />
                  <span style="font-size:0.95rem;">{s.full_name}</span>
                </label>
              {/each}
            {/if}
          </div>
        {/if}
      </div>

      <div class="modal-actions">
        <button class="ghost btn-compact" type="button" on:click={() => { showAddTask = false; }}>Cancel</button>
        <button class="primary btn-compact" type="button" on:click={submitNewTask} disabled={isCreatingTask}>Submit</button>
      </div>
    </div>
  {/if}


  {#if activeView === 'Overview'}
  <section class="grid-two">
    <div class="panel">
      <div class="panel-head fullwidth">
        <div>
          <h3>Intern work logs</h3>
        </div>
        <div class="filters" style="display:flex; align-items:center; gap:0.6rem;">
          <select class="small-select" bind:value={selectedStudentId} aria-label="Filter interns">
            <option value="all">All interns</option>
            {#each students as student}
              <option value={student.user_id}>{student.full_name}</option>
            {/each}
          </select>

          
        </div>
        </div>
      
      <div class="log-list">
        {#if filteredWorkLogs.length === 0}
          <p class="empty">No work logs found.</p>
        {:else}
          {#each filteredWorkLogs as log}
            <div class="log-card {expandedLogIds.indexOf(log.task_id) !== -1 ? 'expanded' : 'collapsed'}" on:click={() => toggleExpand(log.task_id)} role="button" tabindex="0">
              <div class="log-meta">
                <div>
                  <div class="log-user"><strong>{log.user_name || 'Unknown'}</strong></div>
                  <div class="log-task"><span class="row-label">Task:</span> <span class="task-name">{log.task}</span></div>
                </div>
                <span class={`status-pill ${String(log.status || '').toLowerCase() === 'approved' ? 'approved' : String(log.status || '').toLowerCase() === 'needs review' ? 'review' : 'pending'}`}>{log.status}</span>
              </div>

              <div class="log-collapse" aria-hidden={expandedLogIds.indexOf(log.task_id) === -1} on:click|stopPropagation>
                <div class="log-details">
                  <div class="detail-row"><span class="row-label">Notes:</span> <div class="detail-value">{log.notes || 'No notes'}</div></div>
                  <div class="detail-row"><span class="row-label">Learnings:</span> <div class="detail-value">{log.learnings || 'No learnings'}</div></div>
                </div>

                <div class="log-foot">
                  <div class="attachments"><span class="row-label">Attachment:</span>&nbsp;<span class="detail-value">{log.attachments?.length || 0}</span></div>
                  <div class="log-actions">
                    <button class="primary btn-compact" on:click|stopPropagation={() => approveWorklog(log)} disabled={isLoading}>Approve</button>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head fullwidth">
        <div>
          <h3>Intern Tasks</h3>
        </div>
        <div class="filters" style="display:flex; align-items:center; gap:0.6rem;">
          <select class="small-select" bind:value={selectedStudentId} aria-label="Filter interns">
            <option value="all">All interns</option>
            {#each students as student}
              <option value={student.user_id}>{student.full_name}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="progress-list">
        {#if internTasks.length === 0}
          <p class="empty">No tasks for selected intern.</p>
        {:else}
          {#each internTasks as item}
            <button type="button" class="intern-row-button intern-tasks-compact" on:click={() => openViewTask(item)} aria-label={`View ${item.title}`}>
              <div style="flex:1; min-width:0">
                <div class="title-text">{item.title}</div>
                <div style="color:var(--muted); font-size:0.85rem; margin-top:0.25rem">Due: {formatDateToMMDDYYYY(item.due_date) || 'No due date'}</div>
              </div>
              <div style="display:flex; gap:0.6rem; align-items:center;">
                <div class={`status-badge ${statusClass(item.status)}`}>{item.status}</div>
              </div>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </section>
  {/if}

  {#if activeView === 'Archive'}
    <section class="panel">
      <div class="panel-head fullwidth">
        <div>
          <h3>Archive</h3>
        </div>
        <div class="filters" style="display:flex; align-items:center; gap:0.6rem;">
          <strong>Restore</strong>
        </div>
      </div>
      <div class="archived-list">
        {#if archivedSupervisorTasks.length === 0}
          <p class="empty">No archived items yet.</p>
        {:else}
          <ul style="list-style:none; margin:0; padding:0; display:grid; gap:0.6rem;">
            {#each archivedSupervisorTasks as a}
              <li style="display:flex; justify-content:space-between; align-items:center; padding:0.6rem; border-radius:0.6rem; background:var(--surface); border:1px solid var(--border);">
                <div style="min-width:0">
                  <div style="font-weight:700">{a.title}</div>
                  <div class="muted" style="font-size:0.9rem">{formatDateToMMDDYYYY(a.due_date) || ''} — {a.status || ''}</div>
                </div>
                <div style="display:flex; gap:0.4rem; align-items:center;">
                  <button class="ghost btn-compact" type="button" on:click={() => restoreTask(a.id)}>Restore</button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </section>

    <section class="panel">
      <div class="panel-head fullwidth">
        <div>
          <h3>Worklogs</h3>
        </div>
        <div class="filters" style="display:flex; align-items:center; gap:0.6rem;">
          <div style="display:flex; align-items:center; gap:0.4rem;">
            <input aria-label="Filter by date" class="small-date" type="date" bind:value={selectedDate} />
            {#if selectedDate}
              <button type="button" class="ghost btn-compact" on:click={() => selectedDate = ''} aria-label="Clear date">Clear</button>
            {/if}
          </div>
        </div>
      </div>
      <div class="log-list">
        {#if approvedWorkLogs.length === 0}
          <p class="empty">No approved work logs yet.</p>
        {:else}
          {#each approvedWorkLogs as log}
            <div class="log-card {expandedLogIds.indexOf(log.task_id) !== -1 ? 'expanded' : 'collapsed'}" on:click={() => toggleExpand(log.task_id)} role="button" tabindex="0">
              <div class="log-meta">
                <div>
                  <div class="log-user"><strong>{log.user_name || 'Unknown'}</strong></div>
                  <div class="log-task"><span class="row-label">Task:</span> <span class="task-name">{log.task}</span></div>
                </div>
                <span class="status-pill approved">Approved</span>
              </div>

              <div class="log-collapse" aria-hidden={expandedLogIds.indexOf(log.task_id) === -1} on:click|stopPropagation>
                <div class="log-details">
                  <div class="detail-row"><span class="row-label">Notes:</span> <div class="detail-value">{log.notes || 'No notes'}</div></div>
                  <div class="detail-row"><span class="row-label">Learnings:</span> <div class="detail-value">{log.learnings || 'No learnings'}</div></div>
                </div>

                <div class="log-foot">
                  <div class="attachments"><span class="row-label">Attachment:</span>&nbsp;<span class="detail-value">{log.attachments?.length || 0}</span></div>
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </section>
  {/if}

  {#if activeView === 'List'}
  <section class="panel intern-panel">
    <div class="panel-head fullwidth">
      <div class="panel-head-inner">
        <h3>Tasks</h3>
      </div>
      <div class="filters">
        <div class="tasks-controls-header" aria-hidden="true">
          <div class="col col-title"></div>
          <div class="col col-due"><strong>Due Date</strong></div>
          <div class="col col-status"><strong>Status</strong></div>
          <div class="col col-actions"><strong>Actions</strong></div>
        </div>
      </div>
    </div>

      <!-- Tasks list (supervisor-created tasks) -->
      <div class="tasks-list-panel">
        {#if supervisorTasks.length === 0}
          <p class="empty">No tasks yet. Add a task to see it here.</p>
        {:else}
          <div class="tasks-table">
            <!-- header labels moved to panel head for cleaner top alignment -->
            <ul class="intern-list">
              {#each supervisorTasks as t}
                <li class="intern-list-item task-row">
                  <div class="col col-title" style="text-align:left;">
                    <div style="font-weight:700">{t.title}</div>
                  </div>
                  <div class="col col-due">{formatDateToMMDDYYYY(t.due_date) || 'No due date'}</div>
                  <div class="col col-status"><div class={`status-badge ${statusClass(t.status)}`}>{t.status || 'Pending'}</div></div>
                  <div class="col col-actions" style="display:flex; gap:0.5rem; justify-content:center;">
                    <button class="action-link" type="button" on:click={() => openViewTask(t)}>View</button>
                    <button type="button" class="action-link" on:click={(e) => { e.stopPropagation(); archiveTask(t.id); }} aria-label="Archive task">Archive</button>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>

      

    </section>
    {/if}

      {#if showViewTask}
        <div class="task-view-modal-overlay" role="presentation" on:click={closeViewTask}>
          <div class="task-view-modal" role="dialog" aria-modal="true" aria-label="Task details form" on:click|stopPropagation>
            <div class="task-view-modal-head">
              <h4>Task Details</h4>
              <div class="task-view-head-actions">
                <button type="button" class="task-view-action" on:click={() => { openEditTask(viewTask); }}>Edit Task</button>
                <button type="button" class="task-view-close" on:click={closeViewTask}>Close</button>
              </div>
            </div>

            <div class="task-view-grid">
              <label>
                <span>Task Title</span>
                <input type="text" value={viewTask?.title} readonly />
              </label>

              <label>
                <span>Status</span>
                <input type="text" value={viewTask?.status || 'Pending'} readonly />
              </label>

              <label>
                <span>Due Date</span>
                <input type="text" value={formatDateToMMDDYYYY(viewTask?.due_date) || 'No due date'} readonly />
              </label>

              <label>
                <span>Assigned To</span>
                <input type="text" value={assignedNames(viewTask?.assigned_student_ids) || '—'} readonly />
              </label>
            </div>

            <label class="task-view-description">
              <span>Description</span>
              <textarea rows="3" readonly>{viewTask?.description || 'No description'}</textarea>
            </label>

            <div class="task-view-section">
              <span>Attachments</span>
              {#if viewTask?.attachments && viewTask.attachments.length > 0}
                <ul class="attachment-list">
                  {#each viewTask.attachments as a}
                    <li><span>{a}</span></li>
                  {/each}
                </ul>
              {:else}
                <p class="overview-empty-copy">No attachments.</p>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      {#if showEditTask}
        <div class="task-view-modal-overlay" role="presentation" on:click={() => { showEditTask = false; }}>
          <div class="task-view-modal" role="dialog" aria-modal="true" aria-label="Edit Task" on:click|stopPropagation>
            <div class="task-view-modal-head">
              <h4>Edit Task</h4>
              <div class="task-view-head-actions">
                <button type="button" class="task-view-action primary" on:click={saveEditedTask} disabled={isSavingEdit}>{isSavingEdit ? 'Saving...' : 'Save'}</button>
                <button type="button" class="task-view-close" on:click={() => { showEditTask = false; }}>Cancel</button>
              </div>
            </div>

            <div class="task-view-grid">
              <label>
                <span>Task Title</span>
                <input type="text" bind:value={editTaskForm.title} />
              </label>

              <label>
                <span>Status</span>
                <select bind:value={editTaskForm.status}>
                  <option>Pending</option>
                  <option>In Progress</option>
                  <option>Overdue</option>
                  <option>Completed</option>
                </select>
              </label>

              <label>
                <span>Due Date</span>
                <input type="date" bind:value={editTaskForm.due_date} />
              </label>

              <label>
                <span>Assigned To</span>
                <div style="position:relative;">
                  <button bind:this={editAssigneeButtonEl} type="button" class="ghost btn-compact" on:click={toggleEditAssigneeDropdown} aria-haspopup="listbox" aria-expanded={showEditAssigneeDropdown} style="width:100%; text-align:left; display:flex; justify-content:space-between; align-items:center; border-radius:0.5rem; padding:0.45rem 0.6rem;">
                    <span>{editAssigneeLabel()}</span>
                    <span style="opacity:0.7">▾</span>
                  </button>

                  {#if showEditAssigneeDropdown}
                    <div bind:this={editAssigneeDropdownEl} role="listbox" tabindex="-1" style="position:absolute; z-index:70; left:0; right:0; max-height:240px; overflow:auto; background:var(--surface); border:1px solid var(--border); border-radius:0.5rem; margin-top:0.4rem; padding:0.4rem; box-shadow: none;">
                      {#if filteredEditAssignees.length === 0}
                        <div style="padding:0.5rem; color:var(--muted);">No interns found.</div>
                      {:else}
                        {#each filteredEditAssignees as s}
                          <label class="edit-assignee-item">
                            <input type="checkbox" checked={editTaskAssignees.indexOf(s.user_id) !== -1} on:change={() => toggleEditAssigneeSelection(s.user_id)} />
                            <span class="edit-assignee-name">{s.full_name}</span>
                          </label>
                        {/each}
                      {/if}
                    </div>
                  {/if}
                </div>
              </label>
            </div>

            <label class="task-view-description">
              <span>Description</span>
              <textarea rows="4" bind:value={editTaskForm.description}></textarea>
            </label>
          </div>
        </div>
      {/if}

  </div>

  <style>
  :root {
    --ink: var(--color-text, #0f172a);
    --muted: var(--color-muted, #5b677a);
    --border: var(--color-border, #d7e3f1);
    --surface: var(--color-surface, #ffffff);
    --soft: var(--color-soft, #f4f7fb);
    --accent: var(--color-accent, #0f6cbd);
    --accent-dark: #0a4a8f;
    --shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  }

  .supervisor-activity {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    color: var(--ink);
  }

  /* header removed: styles intentionally omitted to keep layout compact */

  button {
    border-radius: 999px;
    border: none;
    padding: 0.5rem 1.2rem;
    font-weight: 600;
    cursor: pointer;
  }

  button.ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
  }

  button.primary {
    background: var(--accent);
    color: #fff;
    border-radius: 0.55rem;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
  }

  .grid-two { align-items: start; }

  .kpi-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 1.1rem;
    box-shadow: 0 18px 36px -30px rgba(15, 23, 42, 0.42);
    padding: 1rem 1.1rem;
    min-height: 5.45rem;
    transition: transform 0.22s ease, box-shadow 0.22s ease;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.45rem;
    position: relative;
    overflow: hidden;
  }

  .kpi-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 20px 36px -26px rgba(15, 23, 42, 0.45);
  }

  .kpi-label {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .kpi-row {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    margin-top: 0.4rem;
  }

  .kpi-value {
    font-size: 1.5rem;
    font-weight: 700;
  }

  .kpi-trend {
    font-size: 0.85rem;
    color: var(--accent-dark);
    background: rgba(15, 108, 189, 0.12);
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
  }

  .grid-two {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 1.2rem;
    align-items: start;
  }

  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 1.1rem;
    box-shadow: 0 18px 36px -30px rgba(15, 23, 42, 0.42);
    padding: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    transition: box-shadow 0.22s ease, border-color 0.22s ease;
    overflow: hidden;
  }

  .panel:hover {
    box-shadow: 0 20px 38px -28px rgba(15, 23, 42, 0.48);
  }

  .kpi-icon, .stat-icon { display:inline-flex; align-items:center; justify-content:center; border-radius:0.75rem }
  .kpi-icon { width:2.2rem; height:2.2rem }

  .kpi-value { font-size:1.45rem; font-weight:800 }

  /* top color bar for each KPI card (matches Activity style) */
  :global(.kpi-card):before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 6px;
    background: transparent;
  }

  /* icon background */
  .kpi-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    border-radius: 0.7rem;
    background: rgba(15,108,189,0.08);
    color: var(--accent-dark);
  }

  /* per-card colors */
  :global(.kpi-card.kpi-1):before { background: #0f6cbd }
  :global(.kpi-card.kpi-1) .kpi-icon { background: #0f6cbd; color: #fff }

  :global(.kpi-card.kpi-2):before { background: #7c3aed }
  :global(.kpi-card.kpi-2) .kpi-icon { background: #7c3aed; color: #fff }

  :global(.kpi-card.kpi-3):before { background: #10b981 }
  :global(.kpi-card.kpi-3) .kpi-icon { background: #10b981; color: #fff }

  :global(.kpi-card.kpi-4):before { background: #f59e0b }
  :global(.kpi-card.kpi-4) .kpi-icon { background: #f59e0b; color: #fff }

  /* color common icons used in this view */
  :global(.icon-btn svg), :global(.folder-icon svg), :global(.file-icon svg) {
    color: var(--muted);
  }

  :global(.icon-btn.share-btn svg) { color: var(--accent); }
  :global(.icon-btn.delete-btn svg) { color: #ef4444; }
  :global(.folder-icon svg) { color: var(--accent-dark); }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.55rem 0 0.55rem;
    border-bottom: 1px solid var(--border);
    gap: 1rem;
  }

  /* full-width header that spans the panel edges (matches ActivityIntern look) */
  .panel-head.fullwidth {
    /* match ActivityIntern header sizing */
    margin: -1.2rem -1.2rem 0 -1.2rem;
    padding: 1rem 1rem 0.9rem;
    border-bottom: 1px solid rgba(15, 108, 189, 0.12);
    background: color-mix(in srgb, #0f6cbd 10%, var(--surface));
    border-top-left-radius: 1.1rem;
    border-top-right-radius: 1.1rem;
    box-sizing: border-box;
  }

  .panel-head.fullwidth h3 {
    color: var(--ink);
  }

  /* smaller select used in the panel header */
  .panel-head.fullwidth .filters .small-select {
    min-width: 160px;
    padding: 0.36rem 0.6rem;
    border-radius: 0.55rem;
    font-size: 0.95rem;
  }

  .panel-head h3 {
    margin: 0;
    color: var(--ink);
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    text-shadow: 0 1px 2px rgba(17,24,39,0.08);
  }

  :global(.dark) .panel-head h3 {
    color: #7cc3ff;
    text-shadow: 0 1px 2px rgba(165,180,252,0.12);
  }

  /* ensure fullwidth headers use a neutral light color in dark mode (not the blue accent) */
  :global(.dark) .panel-head.fullwidth h3 {
    color: #e5edf8;
    text-shadow: 0 1px 2px rgba(0,0,0,0.12);
  }

  .muted {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 0.2rem 0 0;
  }

  .pill {
    background: rgba(15, 108, 189, 0.12);
    color: var(--accent-dark);
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .activity-scroll {
    max-height: 240px;
    overflow-y: auto;
  }

  .banner {
    padding: 0.7rem 1rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
  }

  .banner.error {
    background: rgba(220, 38, 38, 0.08);
    border-color: rgba(220, 38, 38, 0.3);
    color: #b91c1c;
  }

  .empty {
    color: var(--muted);
    font-size: 0.9rem;
    margin: 0;
  }

  /* removed unused .activity-scroll rules (not used in this component) */

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
    margin-top: 0.35rem;
  }

  .activity-text {
    margin: 0;
    font-size: 0.9rem;
  }

  .activity-time {
    font-size: 0.78rem;
    color: var(--muted);
  }

  .alert-stack {
    display: grid;
    gap: 0.8rem;
  }

  .alert-card {
    background: #fff6e8;
    border: 1px solid #f4d7a8;
    border-radius: 0.9rem;
    padding: 0.9rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .filters {
    display: flex;
    gap: 0.6rem;
  }

  select {
    padding: 0.4rem 0.7rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border);
    background: var(--soft);
  }

  

  .log-list {
    display: grid;
    gap: 0.9rem;
  }

  .log-card {
    border: 1px solid var(--border);
    border-radius: 0.9rem;
    padding: 0.9rem 1rem;
    background: var(--surface);
    color: var(--ink);
    position: relative;
    padding-bottom: 1rem;
  }

  .log-card h4 {
    margin: 0;
  }

  .log-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .log-user strong { font-size: 1rem; display:block; margin-bottom:0.15rem }
  .log-task { font-size: 0.95rem; color: var(--muted); margin-bottom:0.4rem }
  .task-name { font-size: 0.95rem; color: var(--ink); font-weight:600 }

  .log-details { display:flex; flex-direction:column; gap:0.45rem; margin-top:0.25rem }
  .detail-row { display:flex; gap:0.6rem; align-items:flex-start }
  .detail-value { color: var(--muted); font-size:0.92rem }

  .status-pill {
    padding: 0.2rem 0.7rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 10;
  }

  /* status color classes (mirror ActivityIntern.svelte) */
  .status-progress { color: #2563eb; }
  .status-pending { color: #d97706; }
  .status-completed { color: #059669; }
  .status-overdue { color: #dc2626; }

  /* inline action link used in compact lists */
  .action-link { background: transparent; border: none; padding: 0; margin: 0; font-size: 0.9rem; color: var(--muted); cursor: pointer }
  .action-link:hover { color: var(--accent); text-decoration: underline }

  /* slightly smaller compact intern task rows */
  .intern-tasks-compact { font-size: 0.92rem }

  /* clickable title link in compact intern tasks */
  .title-link { background: transparent; border: none; padding: 0; margin: 0; font-weight:700; font-size:0.95rem; color: inherit; text-align:left; cursor: pointer }
  .title-link:hover { color: var(--accent); text-decoration: underline }
  .title-link:focus { outline: 2px solid rgba(15,108,189,0.18); outline-offset: 2px }

  /* full-row clickable intern task */
  .intern-row-button {
    display:flex; align-items:flex-start; gap:0.6rem; width:100%; background:transparent; border:none; text-align:left; padding:0.6rem 0.6rem; border-radius:0.55rem; cursor:pointer
  }
  .intern-row-button:hover { background: color-mix(in srgb, var(--accent) 6%, var(--surface)); }

  .title-text { font-weight:700; font-size:0.95rem }

  /* make status-badge match the smaller work-log status-pill styling */
  .status-badge { padding: 0.18rem 0.6rem; border-radius: 999px; font-weight: 600; font-size: 0.75rem; display:inline-block }
  .status-badge.status-progress { background: rgba(37,99,235,0.08); color: #2563eb }
  .status-badge.status-pending { background: rgba(255,243,205,0.7); color: #8b6a00 }
  .status-badge.status-completed { background: rgba(5,150,105,0.08); color: #059669 }
  .status-badge.status-overdue { background: rgba(220,38,38,0.08); color: #dc2626 }

  .status-pill.pending {
    background: #fff3cd;
    color: #8b6a00;
  }

  .status-pill.approved {
    background: #e3f7e8;
    color: #1f7a3a;
  }

  .status-pill.review {
    background: #fee2e2;
    color: #b91c1c;
  }

  .log-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.6rem;
    gap: 0.6rem;
    padding-right: 0.6rem;
  }

  .log-actions {
    display: flex;
    gap: 0.5rem;
    position: static;
  }

  .attachments { color: var(--muted); font-weight:600 }

  /* collapse animation */
  .log-collapse { max-height: 0; overflow: hidden; transition: max-height 220ms ease; }
  .log-card.expanded .log-collapse { max-height: 420px; }
  .log-card.collapsed { min-height: 96px; }

  .progress-list {
    display: grid;
    gap: 1rem;
  }

  .progress-row {
    display: grid;
    gap: 0.4rem;
  }

  .progress-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .progress-bar {
    height: 8px;
    border-radius: 999px;
    background: #eef2f7;
    overflow: hidden;
  }

  .progress-bar span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #0f6cbd, #3b82f6);
  }

  .progress-value {
    font-size: 0.8rem;
    color: var(--muted);
  }

  /* Intern card styles (match supervisor overview) */
  .intern-grid {
    display: grid;
    gap: 1rem;
  }

  .intern-list-panel { margin-bottom: 0.8rem }
  .intern-list { list-style:none; margin:0; padding:0; display:grid; gap:0.5rem }
  .intern-list-item { display:flex; align-items:center; justify-content:space-between; gap:0.6rem; border-radius:0.6rem; background: var(--surface); border:1px solid var(--border) }
  .intern-list-button { display:block; width:100%; text-align:left; padding:0.75rem 1rem; background:transparent; border:none; cursor:pointer }
  .intern-item-actions { margin-left:0.6rem; position:relative }

  /* tasks table header and columns */
  .tasks-table { display:block }
  .tasks-header { display:none }
  .tasks-controls-header { display:grid; grid-template-columns: 1fr 160px 120px 160px; gap:0.6rem; align-items:center }
  .tasks-controls-header .col { text-align: center }
  .task-row { display:grid; grid-template-columns: 1fr 160px 120px 160px; gap:0.6rem; padding:0.65rem 0.8rem; align-items:center }
  .col { font-size:0.95rem }
  .task-row .col-due, .task-row .col-status { text-align:center }
  .task-row .col-actions { text-align:center }

  .col-actions .action-link { background: transparent; border: none; padding: 0; margin: 0 0.4rem; font-size: 0.85rem; color: var(--muted); cursor: pointer }
  .col-actions .action-link:hover { text-decoration: underline; color: var(--accent) }

  .intern-panel .panel-head-inner { padding-left: 1.05rem }
  .intern-panel .filters { padding-right: 1.05rem }
  .intern-menu { position:absolute; right:0; top:calc(100% + 6px); background:var(--surface); border:1px solid var(--border); border-radius:0.45rem; padding:0.3rem; z-index:80 }

  @media (min-width: 720px) {
    .intern-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .intern-card {
    border: 1px solid var(--border);
    background: var(--surface-soft, #f9fbff);
    border-radius: 1rem;
    padding: 1rem;
  }

  .intern-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.85rem;
  }

  .intern-title { min-width: 0; }

  .intern-name {
    margin: 0;
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--ink);
  }

  .intern-meta { margin: 0.25rem 0 0; color: var(--muted); font-size:0.9rem }

  .intern-body { display: grid; gap: 0.5rem }

  .intern-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.9rem;
  }

  .row-label { color: var(--muted); font-weight: 600 }
  .row-value { color: var(--ink); font-weight: 700 }

  .pill { display:inline-flex; align-items:center; justify-content:center; border-radius:9999px; padding:0.25rem 0.65rem; font-size:0.7rem; font-weight:800 }
  .tone-muted { background: rgba(148,163,184,0.18); color:#475569; border:1px solid rgba(148,163,184,0.26) }

  /* Quick panel */
  .quick-panel { background: linear-gradient(180deg, var(--surface) 0%, var(--surface-soft, #f9fbff) 100%); padding: 0.48rem 0.8rem; border-radius: 0.9rem; border: 1px solid var(--border); display:flex; align-items:center; justify-content:space-between }
  .quick-head { display:flex; align-items:center; justify-content:space-between; width:100%; gap:0.75rem }
  .view-controls .btn { margin-right:0.4rem; border-radius:0.55rem; padding:0.32rem 0.6rem; background:transparent; border:1px solid var(--border); font-size:0.92rem }
  .view-controls .btn.active { background: var(--soft); color: var(--ink); border-color: var(--border) }
  .btn-compact { padding:0.28rem 0.6rem; font-size:0.9rem; border-radius:0.55rem; }
  .quick-actions { display:flex; gap:0.45rem; align-items:center }
  .search-input { padding:0.34rem 0.6rem; border-radius:999px; border:1px solid var(--border); background:var(--soft); min-width:200px; font-size:0.95rem }
  .quick-actions select { padding:0.34rem 0.6rem; border-radius:0.55rem; font-size:0.95rem }
  .quick-actions .primary { padding:0.36rem 0.9rem; font-size:0.95rem }

  /* Modal */
  .modal-backdrop { position:fixed; inset:0; background:rgba(2,6,23,0.4); border:none }
  .modal { position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:min(720px,96%); background:var(--surface); border-radius:0.8rem; padding:1rem; z-index:60; box-shadow:none; border:1px solid var(--border) }
  .modal label { display:block; margin-top:0.6rem; margin-bottom:0.25rem; font-weight:600 }
  .modal input[type="text"], .modal input[type="date"], .modal textarea { width:100%; padding:0.5rem; border-radius:0.5rem; border:1px solid var(--border); background:var(--soft) }
  .modal-actions { display:flex; justify-content:flex-end; gap:0.6rem; margin-top:0.8rem }


  @media (max-width: 900px) {
    .page-head {
      flex-direction: column;
    }

    .head-actions {
      width: 100%;
      justify-content: flex-start;
    }
  }

  :global(.dark) {
    --ink: #e5edf8;
    --muted: #9ba3af;
    --border: #2b3c57;
    --surface: #162338;
    --soft: #1c2a44;
  }

  /* small date input used in header filters */
  .small-date {
    padding: 0.36rem 0.5rem;
    border-radius: 0.55rem;
    border: 1px solid var(--border);
    background: var(--soft);
    font-size: 0.95rem;
  }

  /* Task view / edit modal styles copied from ActivityIntern design */
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
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.9rem;
    box-shadow: 0 28px 48px -32px rgba(15, 23, 42, 0.55);
    padding: 1rem;
    display: grid;
    gap: 0.9rem;
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
    color: var(--ink);
    font-size: 1rem;
    font-weight: 700;
  }

  .task-view-close {
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--soft);
    color: var(--ink);
    padding: 0.3rem 0.7rem;
    font-size: 0.74rem;
    font-weight: 600;
    cursor: pointer;
  }

  .task-view-action {
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--soft);
    color: var(--ink);
    padding: 0.3rem 0.65rem;
    font-size: 0.74rem;
    font-weight: 600;
    cursor: pointer;
  }

  .task-view-action.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: #ffffff;
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
    color: var(--muted);
    font-size: 0.74rem;
    font-weight: 600;
  }

  .task-view-grid input,
  .task-view-grid select,
  .task-view-description textarea {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 0.55rem;
    background: var(--soft);
    color: var(--ink);
    font-size: 0.82rem;
    padding: 0.45rem 0.55rem;
  }

  .task-view-description textarea { resize: vertical }

  .task-view-section { display:grid; gap:0.4rem }

  .attachment-list { margin:0; padding:0; list-style:none; display:grid; gap:0.35rem }

  /* Edit assignee dropdown item styles */
  .edit-assignee-item { display:flex; align-items:center; gap:0.6rem; padding:0.28rem 0.45rem; cursor:pointer }
  .edit-assignee-item input[type='checkbox'] { width:1rem; height:1rem; margin:0; flex-shrink:0 }
  .edit-assignee-name { font-size:0.95rem; line-height:1.1; display:block }

</style>
