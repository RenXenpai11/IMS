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

// Add an attachment to the supervisor_attch sheet (uploads file to Drive and stores link)
function addSupervisorTaskAttachment(payload) {
  try {
    var suptaskId = String(payload.suptask_id || '').trim();
    if (!suptaskId) return { ok: false, error: 'suptask_id is required.' };

    var fileName    = String(payload.file_name    || 'attachment').trim();
    var fileDataBase64 = String(payload.file_data_base64 || '');
    var mimeType    = String(payload.mime_type    || 'application/octet-stream').trim();
    var fileType    = String(payload.file_type    || '').trim();
    var fileSize    = String(payload.file_size    || '').trim();
    var userId      = String(payload.user_id      || '').trim();
    var uploadedBy  = String(payload.uploaded_by  || userId).trim();
    var uploadedAt  = String(payload.uploaded_at  || isoNow_()).trim();

    if (!suptaskId || !userId) return { ok: false, error: 'suptask_id and user_id are required.' };

    var link = '';

    // Upload to Google Drive using shared folder helper (same as addWorklogAttachment)
    if (fileDataBase64) {
      try {
        var bytes  = Utilities.base64Decode(fileDataBase64);
        var blob   = Utilities.newBlob(bytes, mimeType, fileName || 'attachment');
        var folder = getOrCreateWorklogAttachmentsFolder_();
        var driveFile = folder.createFile(blob);

        // setSharing may fail on certain accounts — never abort the save for it
        try {
          driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        } catch (shareErr) {
          // ignore — file is still saved
        }

        // getUrl may also fail in edge cases — capture gracefully
        try {
          link = driveFile.getUrl();
        } catch (urlErr) {
          link = '';
        }
      } catch (uploadErr) {
        return { ok: false, error: 'Unable to save attachment to Drive: ' + (uploadErr.message || String(uploadErr)) };
      }
    }

    var sheet = getOrCreateSheetWithHeaders_('supervisor_attch', [
      'supattch_id', 'suptask_id', 'user_id', 'file_type', 'file_size', 'file_name', 'link', 'uploaded_at', 'uploaded_by'
    ]);

    // Generate ID matching the WLA_ pattern used for worklogs (SUPA_ prefix)
    var supattchId = '';
    try {
      var rowCount = sheet.getLastRow();
      supattchId = 'SUPA_' + String(rowCount).padStart(4, '0');
    } catch (e) {
      supattchId = createId_('SUPA');
    }

    sheet.appendRow([
      supattchId,
      suptaskId,
      userId,
      fileType,
      fileSize,
      fileName,
      link,
      uploadedAt,
      uploadedBy
    ]);

    return {
      ok: true,
      supattch_id: supattchId,
      link: link,
      attachment: {
        supattch_id: supattchId,
        suptask_id: suptaskId,
        user_id: userId,
        file_type: fileType,
        file_size: fileSize,
        file_name: fileName,
        link: link,
        uploaded_at: uploadedAt,
        uploaded_by: uploadedBy
      }
    };
  } catch (err) {
    return { ok: false, error: err && err.message ? String(err.message) : String(err) };
  }
}

// Retrieve all attachments for a supervisor task from supervisor_attch,
// and also from act_attachments for intern-uploaded files linked to the same task.
function getSupervisorTaskAttachments(payload) {
  try {
    var suptaskId = String(payload.suptask_id || '').trim();
    if (!suptaskId) return { ok: false, error: 'suptask_id is required.' };

    var attachments = [];

    // 1. Fetch supervisor-uploaded attachments from supervisor_attch
    try {
      var sheet = getOrCreateSheetWithHeaders_('supervisor_attch', [
        'supattch_id', 'suptask_id', 'user_id', 'file_type', 'file_size', 'file_name', 'link', 'uploaded_at', 'uploaded_by'
      ]);
      var rows = readSheetObjects_(sheet) || [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i] || {};
        if (String(r.suptask_id || '').trim() === suptaskId) {
          attachments.push({
            attachment_id: String(r.supattch_id || '').trim(),
            supattch_id: String(r.supattch_id || '').trim(),
            suptask_id: String(r.suptask_id || '').trim(),
            user_id: String(r.user_id || '').trim(),
            file_type: String(r.file_type || '').trim(),
            file_size: String(r.file_size || '').trim(),
            file_name: String(r.file_name || '').trim(),
            link: String(r.link || '').trim(),
            uploaded_at: String(r.uploaded_at || '').trim(),
            uploaded_by: String(r.uploaded_by || '').trim()
          });
        }
      }
    } catch (e) {
      // supervisor_attch sheet may not exist yet
    }

    // 2. Fetch intern-uploaded attachments from act_attachments.
    //    Find the supervisor_task row to get its title and created_by (the supervisor/intern who owns it).
    //    Then find matching activity_logs rows (intern tasks) linked by task_name + assigned_by,
    //    and return their attachments from act_attachments.
    try {
      var supTaskSheet = getOrCreateSheetWithHeaders_('supervisor_task', ['sup_taskid','task','description','due_date','status','assigned_to','created_at','created_by','updated_by']);
      var supTaskRows = readSheetObjects_(supTaskSheet) || [];
      var supTaskRow = null;
      for (var st = 0; st < supTaskRows.length; st++) {
        if (String(supTaskRows[st].sup_taskid || '').trim() === suptaskId) {
          supTaskRow = supTaskRows[st];
          break;
        }
      }
      if (supTaskRow) {
        var taskTitle = String(supTaskRow.task || '').trim().toLowerCase();
        var createdBy = String(supTaskRow.created_by || '').trim();

        // Find matching activity_logs (intern task) rows: task_name matches and assigned_by = createdBy
        try {
          var actSheet = getSheet_('activity_logs');
          var actRows = readSheetObjects_(actSheet) || [];
          var matchingActivityIds = [];
          for (var ai = 0; ai < actRows.length; ai++) {
            var ar = actRows[ai] || {};
            var arTitle = String(ar.task_name || ar.title || '').trim().toLowerCase();
            var arAssignedBy = String(ar.assigned_by || '').trim();
            if (arTitle === taskTitle && arAssignedBy === createdBy) {
              matchingActivityIds.push(String(ar.id || '').trim());
            }
          }

          // Fetch attachments from act_attachments for each matching activity task
          if (matchingActivityIds.length > 0) {
            try {
              var actAttchSheet = getSheet_('act_attachments');
              var actAttchRows = readSheetObjects_(actAttchSheet) || [];
              for (var ac = 0; ac < actAttchRows.length; ac++) {
                var acr = actAttchRows[ac] || {};
                var acrTaskId = String(acr.task_id || '').trim();
                if (matchingActivityIds.indexOf(acrTaskId) !== -1) {
                  attachments.push({
                    attachment_id: String(acr.id || '').trim(),
                    file_type: String(acr.file_type || '').trim(),
                    file_size: String(acr.file_size || '').trim(),
                    file_name: String(acr.file_name || '').trim(),
                    link: String(acr.link || '').trim(),
                    uploaded_at: String(acr.uploaded_at || '').trim(),
                    uploaded_by: String(acr.uploaded_by || '').trim()
                  });
                }
              }
            } catch (e) {
              // act_attachments sheet may not exist
            }
          }
        } catch (e) {
          // activity_logs sheet may not exist
        }
      }
    } catch (e) {
      // ignore errors fetching intern attachments
    }

    return { ok: true, attachments: attachments };
  } catch (err) {
    return { ok: false, error: err && err.message ? String(err.message) : String(err) };
  }
}

// Delete a supervisor attachment by supattch_id (removes the row from supervisor_attch)
function deleteSupervisorTaskAttachment(payload) {
  try {
    var supattchId = String(payload.supattch_id || '').trim();
    if (!supattchId) return { ok: false, error: 'supattch_id is required.' };

    var sheet = getOrCreateSheetWithHeaders_('supervisor_attch', [
      'supattch_id', 'suptask_id', 'user_id', 'file_type', 'file_size', 'file_name', 'link', 'uploaded_at', 'uploaded_by'
    ]);

    var values = getSheetValues_(sheet) || [];
    if (values.length <= 1) return { ok: false, error: 'No rows found.' };

    var headers = values[0].map(function(h){ return normalizeHeader_(h); });
    var idCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c] || '').toLowerCase() === 'supattch_id') { idCol = c + 1; break; }
    }
    if (idCol === -1) return { ok: false, error: 'supattch_id column not found.' };

    var foundRow = -1;
    for (var r = 1; r < values.length; r++) {
      var cell = String(values[r][idCol - 1] || '').trim();
      if (cell === supattchId) { foundRow = r + 1; break; }
    }
    if (foundRow === -1) return { ok: false, error: 'Attachment not found.' };

    try {
      sheet.deleteRow(foundRow);
    } catch (delErr) {
      return { ok: false, error: 'Unable to delete row: ' + (delErr && delErr.message ? String(delErr.message) : String(delErr)) };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err && err.message ? String(err.message) : String(err) };
  }
}
