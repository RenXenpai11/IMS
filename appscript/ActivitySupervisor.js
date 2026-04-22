// Apps Script: Supervisor helper endpoints

// Return a list of all non-supervisor users (students) with minimal fields
function getAllStudents() {
  try {
    var usersSheet = getSheet_('users');
    var users = readSheetObjects_(usersSheet);
    var students = [];
    for (var i = 0; i < users.length; i++) {
      var u = users[i] || {};
      var role = String(u.role || '').trim().toLowerCase();
      if (role === 'supervisor') continue;
      students.push({
        user_id: String(u.user_id || '').trim(),
        full_name: String(u.full_name || '').trim(),
        email: String(u.email || '').trim()
      });
    }
    students.sort(function(a, b) {
      return String(a.full_name || '').localeCompare(String(b.full_name || ''));
    });
    return { ok: true, students: students };
  } catch (err) {
    return { ok: false, error: err && err.message ? String(err.message) : String(err) };
  }
}

  

// Create tasks assigned to one or more students by supervisor
function createSupervisorTasks(payload) {
  try {
    var title = String(payload.title || '').trim();
    var description = String(payload.description || '').trim();
    var dueDate = formatDateYMD_(payload.due_date || payload.dueDate || '');
    var supervisorId = String(payload.supervisor_user_id || '').trim();
    var assignees = Array.isArray(payload.assigned_student_ids) ? payload.assigned_student_ids : [];

    if (!supervisorId) return { ok: false, error: 'supervisor_user_id is required.' };
    if (!title) return { ok: false, error: 'title is required.' };
    if (!assignees.length) return { ok: false, error: 'At least one assigned_student_id is required.' };

    var now = isoNow_();
    var created = 0;
    // Also record a supervisor-level task record in 'supervisor_task' sheet
      var supRow = null;
    try {
      var supSheet = getOrCreateSheetWithHeaders_('supervisor_task', ['sup_taskid','task','description','due_date','status','assigned_to','created_at','created_by','updated_by']);
      supRow = {
        sup_taskid: createId_('SUP'),
        task: title,
        description: description,
          due_date: dueDate,
        status: String(payload.status || 'Pending').trim(),
        assigned_to: JSON.stringify(assignees || []),
        created_at: now,
        created_by: supervisorId,
        updated_by: supervisorId
      };
      appendObjectRow_(supSheet, supRow);
    } catch (e) {
      // If creation fails, clear supRow and continue with per-user tasks
      supRow = null;
    }

    // For each assignee, create an activity task (so it appears in the intern's activity logs)
    for (var j = 0; j < assignees.length; j++) {
      var uid = String(assignees[j] || '').trim();
      if (!uid) continue;

      // find user email by user_id
      var users = readSheetObjects_(getSheet_('users')) || [];
      var userEmail = '';
      for (var k = 0; k < users.length; k++) {
        if (String(users[k].user_id || '').trim() === uid) {
          userEmail = String(users[k].email || '').trim();
          break;
        }
      }

      // prepare payload for activity task
      var activityPayload = {
        title: title,
        description: description,
        due_date: dueDate,
        owner_email: userEmail,
        assigned_by: supervisorId,
        created_at: now,
        // signal to internal handler that supervisor-level row already created
        skipSupervisorCreate: true,
        status: String(payload.status || 'Pending').trim()
      };

      // create activity task (use internal handler)
      try {
        handleCreateActivityTask_(activityPayload);
      } catch (errCreate) {
        // continue on error
      }

      // create notification for the user
      try {
        createNotification_(uid, 'New task assigned', 'A new task "' + title + '" was assigned to you.', 'task', supRow ? supRow.sup_taskid : '');
      } catch (errNotif) {
        // ignore notification failures
      }

      created += 1;
    }

    var response = { ok: true, created_count: created };
    // If initial attempt to create the supervisor-level row failed, try once more now
    if ((!supRow || !supRow.sup_taskid) && Array.isArray(assignees) && assignees.length) {
      try {
        var retrySupSheet = getOrCreateSheetWithHeaders_('supervisor_task', ['sup_taskid','task','description','due_date','status','assigned_to','created_at','created_by','updated_by']);
        var retryRow = {
          sup_taskid: createId_('SUP'),
          task: title,
          description: description,
          due_date: dueDate,
          status: String(payload.status || 'Pending').trim(),
          assigned_to: JSON.stringify(assignees || []),
          created_at: now,
          created_by: supervisorId,
          updated_by: supervisorId
        };
        appendObjectRow_(retrySupSheet, retryRow);
        supRow = retryRow;
      } catch (e) {
        // ignore retry failures
        supRow = supRow || null;
      }
    }

    if (supRow && supRow.sup_taskid) {
      response.sup_taskid = String(supRow.sup_taskid || '').trim();
        response.task = {
        id: response.sup_taskid,
        title: supRow.task,
        description: supRow.description,
        due_date: supRow.due_date,
        status: String(supRow.status || '').trim(),
        assigned_student_ids: (function(){ try { return JSON.parse(String(supRow.assigned_to||'[]')) } catch(e){ return []; } })()
      };
    }
    return response;
  } catch (err) {
    return { ok: false, error: err && err.message ? String(err.message) : String(err) };
  }
}

// Return supervisor-created tasks for a supervisor
function getSupervisorTasks(payload) {
  try {
    var supervisorId = String(payload.supervisor_user_id || '').trim();
    if (!supervisorId) return { ok: false, error: 'supervisor_user_id is required.' };
    var supervisorRecord = null;
    var supervisorEmail = '';
    try {
      supervisorRecord = findUserRecordByUserId_(supervisorId);
      supervisorEmail = supervisorRecord && supervisorRecord.user ? String(supervisorRecord.user.email || '').trim() : '';
    } catch (e) {
      supervisorRecord = null;
      supervisorEmail = '';
    }
    var sheet = getOrCreateSheetWithHeaders_('supervisor_task', ['sup_taskid','task','description','due_date','status','assigned_to','created_at','created_by','updated_by']);
    var rows = readSheetObjects_(sheet) || [];
    var tasks = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i] || {};
      var createdBy = String(r.created_by || '').trim();
      if (createdBy && createdBy !== supervisorId && (!supervisorEmail || createdBy !== supervisorEmail)) {
        continue;
      }
      var assigned = [];
      try { assigned = JSON.parse(String(r.assigned_to || '[]')) || []; } catch (e) { assigned = []; }
      tasks.push({
        id: String(r.sup_taskid || '').trim(),
        title: String(r.task || '').trim(),
        description: String(r.description || '').trim(),
        due_date: String(r.due_date || '').trim(),
        status: String(r.status || '').trim(),
        assigned_student_ids: Array.isArray(assigned) ? assigned : []
      });
    }
    // Reverse so that the most recently created task (last row in sheet) appears first.
    tasks.reverse();
    return { ok: true, tasks: tasks };
  } catch (err) {
    return { ok: false, error: err && err.message ? String(err.message) : String(err) };
  }
}

// Return attachments for a given task_id from worklog or activity attachment sheets
function getTaskAttachments(payload) {
  try {
    var taskId = String(payload.task_id || '').trim();
    if (!taskId) return { ok: false, error: 'task_id is required.' };
    var attachments = [];
    // check worklogs attachments
    try {
      var wSheet = getSheet_('worklogs_attachment');
      var wRows = readSheetObjects_(wSheet) || [];
      for (var i = 0; i < wRows.length; i++) {
        var r = wRows[i] || {};
        if (String(r.task_id || '').trim() === taskId) {
          attachments.push({
            attachment_id: String(r.attachment_id || '').trim(),
            task_id: String(r.task_id || '').trim(),
            file_name: String(r.file_name || '').trim(),
            file_type: String(r.file_type || '').trim(),
            file_size: String(r.file_size || '').trim(),
            link: String(r.link || '').trim(),
            uploaded_at: String(r.uploaded_at || '').trim(),
            uploaded_by: String(r.uploaded_by || '').trim()
          });
        }
      }
    } catch (e) {
      // ignore
    }

    // check activity attachments (act_attachments)
    try {
      var aSheet = getSheet_('act_attachments');
      var aRows = readSheetObjects_(aSheet) || [];
      for (var j = 0; j < aRows.length; j++) {
        var ar = aRows[j] || {};
        if (String(ar.task_id || '').trim() === taskId) {
          attachments.push({
            attachment_id: String(ar.id || '').trim(),
            task_id: String(ar.task_id || '').trim(),
            file_name: String(ar.file_name || '').trim(),
            file_type: String(ar.file_type || '').trim(),
            file_size: String(ar.file_size || '').trim(),
            link: String(ar.link || '').trim(),
            uploaded_at: String(ar.uploaded_at || '').trim(),
            uploaded_by: String(ar.uploaded_by || '').trim()
          });
        }
      }
    } catch (e) {
      // ignore
    }

    return { ok: true, attachments: attachments };
  } catch (err) {
    return { ok: false, error: err && err.message ? String(err.message) : String(err) };
  }
}

// Update an existing supervisor task row by sup_taskid
function updateSupervisorTask(payload) {
  try {
    var supTaskId = String(payload.sup_taskid || '').trim();
    if (!supTaskId) return { ok: false, error: 'sup_taskid is required.' };

    var sheet = getOrCreateSheetWithHeaders_('supervisor_task', ['sup_taskid','task','description','due_date','status','assigned_to','created_at','created_by','updated_by']);
    var values = getSheetValues_(sheet) || [];
    if (values.length <= 1) return { ok: false, error: 'No rows found.' };

    var headers = values[0].map(function(h){ return normalizeHeader_(h); });
    var idCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c] || '').toLowerCase() === 'sup_taskid') { idCol = c + 1; break; }
    }
    if (idCol === -1) return { ok: false, error: 'sup_taskid column not found.' };

    var foundRow = -1;
    for (var r = 1; r < values.length; r++) {
      var cell = String(values[r][idCol - 1] || '').trim();
      if (cell === supTaskId) { foundRow = r + 1; break; }
    }
    if (foundRow === -1) return { ok: false, error: 'Task not found.' };

    var obj = {};
    if (payload.title !== undefined) obj.task = String(payload.title || '');
    if (payload.description !== undefined) obj.description = String(payload.description || '');
    if (payload.due_date !== undefined) obj.due_date = String(payload.due_date || '');
    if (payload.status !== undefined) obj.status = String(payload.status || '');
    if (payload.assigned_student_ids !== undefined) obj.assigned_to = JSON.stringify(payload.assigned_student_ids || []);
    if (payload.updated_by !== undefined) obj.updated_by = String(payload.updated_by || '');
    if (Object.keys(obj).length === 0) return { ok: false, error: 'No fields to update.' };

    updateObjectRow_(sheet, foundRow, obj);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err && err.message ? String(err.message) : String(err) };
  }
}
 
