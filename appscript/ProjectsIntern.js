// ProjectsIntern.js - handles project management for interns (CRUD operations)
var PROJ_INTERN_SHEET_  = 'proj_intern';
var PROJ_INTERN_HEADERS_ = [
  'proj_id', 'proj_name', 'priority', 'status', 'members', 'supervisor',
  'start_date', 'end_date', 'description',
  'created_at', 'created_by', 'updated_by'
];

var MILESTONE_SHEET_ = 'milestone_intern';
// Columns: milestone_id, proj_id, milestone, status, date, done, created_at, created_by, updated_by
var MILESTONE_HEADERS_ = [
  'milestone_id', 'proj_id', 'milestone', 'status', 'date', 'done',
  'created_at', 'created_by', 'updated_by', 'linked_files'
];

// Utility functions for managing sheets and data transformations
function projInternSheet_() {
  return getOrCreateSheetWithHeaders_(PROJ_INTERN_SHEET_, PROJ_INTERN_HEADERS_);
}

function projInternNextId_() {
  var sheet = projInternSheet_();
  var data  = sheet.getDataRange().getValues();
  var lastId = 0;
  for (var i = 1; i < data.length; i++) {
    var val = String(data[i][0] || '');
    if (/^PROJ_\d+$/.test(val)) {
      var n = parseInt(val.replace('PROJ_', ''), 10);
      if (!isNaN(n) && n > lastId) lastId = n;
    }
  }
  return 'PROJ_' + String(lastId + 1).padStart(4, '0');
}

// Transforms a row from the proj_intern sheet into a project object
function projRowToObj_(row) {
  return {
    proj_id:     String(row[0]  || ''),
    proj_name:   String(row[1]  || ''),
    priority:    String(row[2]  || ''),
    status:      String(row[3]  || ''),
    members:     String(row[4]  || ''),   // stored as comma-separated user_ids
    supervisor:  String(row[5]  || ''),
    start_date:  row[6]  ? Utilities.formatDate(new Date(row[6]),  Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
    end_date:    row[7]  ? Utilities.formatDate(new Date(row[7]),  Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
    description: String(row[8]  || ''),
    created_at:  row[9]  ? String(row[9])  : '',
    created_by:  String(row[10] || ''),
    updated_by:  String(row[11] || '')
  };
}

// Similar utility functions for milestones
function milestoneSheet_() {
  return getOrCreateSheetWithHeaders_(MILESTONE_SHEET_, MILESTONE_HEADERS_);
}

function milestoneNextId_() {
  var sheet = milestoneSheet_();
  var data  = sheet.getDataRange().getValues();
  var lastId = 0;
  for (var i = 1; i < data.length; i++) {
    var val = String(data[i][0] || '');
    if (/^Miles_\d+$/.test(val)) {
      var n = parseInt(val.replace('Miles_', ''), 10);
      if (!isNaN(n) && n > lastId) lastId = n;
    }
  }
  return 'Miles_' + String(lastId + 1).padStart(4, '0');
}

function milestoneRowToObj_(row) {
  return {
    milestone_id: String(row[0] || ''),
    proj_id:      String(row[1] || ''),
    milestone:    String(row[2] || ''),
    status:       String(row[3] || '') || 'Not Started',
    date:         row[4] ? Utilities.formatDate(new Date(row[4]), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
    done:         (function(v){ v = String(v || '').toLowerCase(); return v === 'true' || v === '1' || v === 'yes'; })(row[5]),
    created_at:   String(row[6] || ''),
    created_by:   String(row[7] || ''),
    updated_by:   String(row[8] || ''),
    linked_files: String(row[9] || '')
  };
}

// ── List projects for an intern (created_by = user_id) ──────────────────────

function handleListProjIntern_(payload) {
  var userId = String(payload.user_id || '').trim();
  if (!userId) return { ok: false, error: 'user_id is required.' };

  var sheet = projInternSheet_();
  var data  = sheet.getDataRange().getValues();
  var projects = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!String(row[0] || '').trim()) continue;   // skip blank rows
    var obj = projRowToObj_(row);
    // Return projects where this user is the creator OR a member
    var memberIds = obj.members.split(',').map(function(s){ return s.trim(); });
    if (obj.created_by === userId || memberIds.indexOf(userId) !== -1) {
      projects.push(obj);
    }
  }

  return { ok: true, projects: projects };
}

// ── Create a new project ─────────────────────────────────────────────────────

function handleCreateProjIntern_(payload) {
  var userId = String(payload.user_id || '').trim();
  if (!userId) return { ok: false, error: 'user_id is required.' };

  var projName = String(payload.proj_name || '').trim();
  if (!projName) return { ok: false, error: 'proj_name is required.' };

  var startDate = String(payload.start_date || '').trim();
  var endDate   = String(payload.end_date   || '').trim();
  if (!startDate || !endDate) return { ok: false, error: 'start_date and end_date are required.' };

  var sheet  = projInternSheet_();
  var projId = projInternNextId_();
  var now    = new Date();

  // members is an array from frontend, stored as comma-separated user_ids
  var membersRaw = payload.members;
  var membersStr = '';
  if (Array.isArray(membersRaw)) {
    membersStr = membersRaw.map(function(m){ return String(m).trim(); }).filter(Boolean).join(',');
  } else {
    membersStr = String(membersRaw || '').trim();
  }

  var row = [
    projId,
    projName,
    String(payload.priority    || 'Medium').trim(),
    String(payload.status      || 'Not Started').trim(),
    membersStr,
    String(payload.supervisor  || '').trim(),
    startDate,
    endDate,
    String(payload.description || '').trim(),
    formatTimestamp_(now),
    userId,
    userId
  ];

  sheet.appendRow(row);
  return { ok: true, proj_id: projId };
}

// ── Update an existing project ───────────────────────────────────────────────

function handleUpdateProjIntern_(payload) {
  var projId = String(payload.proj_id || '').trim();
  var userId = String(payload.user_id || '').trim();
  if (!projId) return { ok: false, error: 'proj_id is required.' };
  if (!userId) return { ok: false, error: 'user_id is required.' };

  var sheet = projInternSheet_();
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === projId) {
      var membersRaw = payload.members;
      var membersStr = data[i][4]; // keep existing if not provided
      if (membersRaw !== undefined) {
        if (Array.isArray(membersRaw)) {
          membersStr = membersRaw.map(function(m){ return String(m).trim(); }).filter(Boolean).join(',');
        } else {
          membersStr = String(membersRaw || '').trim();
        }
      }

      sheet.getRange(i + 1, 2).setValue(String(payload.proj_name   !== undefined ? payload.proj_name   : data[i][1]));
      sheet.getRange(i + 1, 3).setValue(String(payload.priority    !== undefined ? payload.priority    : data[i][2]));
      sheet.getRange(i + 1, 4).setValue(String(payload.status      !== undefined ? payload.status      : data[i][3]));
      sheet.getRange(i + 1, 5).setValue(membersStr);
      sheet.getRange(i + 1, 6).setValue(String(payload.supervisor  !== undefined ? payload.supervisor  : data[i][5]));
      sheet.getRange(i + 1, 7).setValue(String(payload.start_date  !== undefined ? payload.start_date  : data[i][6]));
      sheet.getRange(i + 1, 8).setValue(String(payload.end_date    !== undefined ? payload.end_date    : data[i][7]));
      sheet.getRange(i + 1, 9).setValue(String(payload.description !== undefined ? payload.description : data[i][8]));
      sheet.getRange(i + 1, 12).setValue(userId);
      return { ok: true, proj_id: projId };
    }
  }

  return { ok: false, error: 'Project not found: ' + projId };
}

// ── Restore an archived project (set status back to Not Started) ─────────────

function handleRestoreProjIntern_(payload) {
  var projId = String(payload.proj_id || '').trim();
  var userId = String(payload.user_id || '').trim();
  if (!projId) return { ok: false, error: 'proj_id is required.' };
  if (!userId) return { ok: false, error: 'user_id is required.' };

  var sheet = projInternSheet_();
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === projId) {
      var restoredStatus = 'Not Started';
      sheet.getRange(i + 1, 4).setValue(restoredStatus);
      sheet.getRange(i + 1, 12).setValue(userId);
      return { ok: true, proj_id: projId, status: restoredStatus };
    }
  }

  return { ok: false, error: 'Project not found: ' + projId };
}

// ── Delete a project ─────────────────────────────────────────────────────────

function handleDeleteProjIntern_(payload) {
  var projId = String(payload.proj_id || '').trim();
  if (!projId) return { ok: false, error: 'proj_id is required.' };

  var sheet = projInternSheet_();
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === projId) {
      sheet.deleteRow(i + 1);
      return { ok: true, proj_id: projId };
    }
  }

  return { ok: false, error: 'Project not found: ' + projId };
}

// (Supervisor-specific bootstrap moved to ProjectsSupervisor.js)

// ── Milestones (CRUD) ─────────────────────────────────────────────────────
function handleListMilestones_(payload) {
  var projId = String(payload.proj_id || '').trim();
  if (!projId) return { ok: false, error: 'proj_id is required.' };
  var sheet = milestoneSheet_();
  var data  = sheet.getDataRange().getValues();
  var items = [];
  for (var i = 1; i < data.length; i++) {
    if (!String(data[i][0] || '').trim()) continue;
    var obj = milestoneRowToObj_(data[i]);
    if (obj.proj_id === projId) items.push(obj);
  }
  return { ok: true, milestones: items };
}

function handleCreateMilestone_(payload) {
  var projId = String(payload.proj_id || '').trim();
  var text   = String(payload.milestone || '').trim();
  var date   = String(payload.date || '').trim();
  var status = String(payload.status || '').trim() || 'Not Started';
  var userId = String(payload.user_id || '').trim();
  if (!projId) return { ok: false, error: 'proj_id is required.' };
  if (!text) return { ok: false, error: 'milestone is required.' };
  if (!userId) return { ok: false, error: 'user_id is required.' };

  var sheet = milestoneSheet_();
  var id    = milestoneNextId_();
  var now   = formatTimestamp_(new Date());

  var doneVal = payload.done ? 'TRUE' : 'FALSE';
  var linkedFiles = String(payload.linked_files || '').trim();
  var row = [ id, projId, text, status, date || '', doneVal, now, userId, userId, linkedFiles ];
  sheet.appendRow(row);
  return { ok: true, milestone_id: id, created_at: now };
}

function handleDeleteMilestone_(payload) {
  var id = String(payload.milestone_id || '').trim();
  if (!id) return { ok: false, error: 'milestone_id is required.' };
  var sheet = milestoneSheet_();
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === id) { sheet.deleteRow(i + 1); return { ok: true, milestone_id: id }; }
  }
  return { ok: false, error: 'Milestone not found: ' + id };
}

function handleUpdateMilestone_(payload) {
  var id = String(payload.milestone_id || '').trim();
  var text = payload.milestone !== undefined ? String(payload.milestone || '').trim() : undefined;
  var date = payload.date !== undefined ? String(payload.date || '').trim() : undefined;
  var userId = String(payload.user_id || '').trim();
  if (!id) return { ok: false, error: 'milestone_id is required.' };
  if (!userId) return { ok: false, error: 'user_id is required.' };

  var sheet = milestoneSheet_();
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === id) {
      if (text !== undefined) sheet.getRange(i + 1, 3).setValue(text);
      if (payload.status !== undefined) sheet.getRange(i + 1, 4).setValue(String(payload.status));
      if (date !== undefined) sheet.getRange(i + 1, 5).setValue(date);
      if (payload.done !== undefined) sheet.getRange(i + 1, 6).setValue(payload.done ? 'TRUE' : 'FALSE');
      if (payload.linked_files !== undefined) sheet.getRange(i + 1, 10).setValue(String(payload.linked_files || ''));
      sheet.getRange(i + 1, 9).setValue(userId);
      return { ok: true, milestone_id: id };
    }
  }
  return { ok: false, error: 'Milestone not found: ' + id };
}

// ── Feedback (CRUD) ──────────────────────────────────────────────────────────
var FEEDBACK_SHEET_ = 'feedback_intern';
var FEEDBACK_HEADERS_ = [
  'feedback_id', 'proj_id', 'parent_id',
  'commenter_id', 'commenter_role', 'comment_text',
  'created_at', 'created_by', 'updated_by'
];

function feedbackSheet_() {
  return getOrCreateSheetWithHeaders_(FEEDBACK_SHEET_, FEEDBACK_HEADERS_);
}

function feedbackNextId_() {
  var sheet = feedbackSheet_();
  var data  = sheet.getDataRange().getValues();
  var lastId = 0;
  for (var i = 1; i < data.length; i++) {
    var val = String(data[i][0] || '');
    if (/^FEED_\d+$/.test(val)) {
      var n = parseInt(val.replace('FEED_', ''), 10);
      if (!isNaN(n) && n > lastId) lastId = n;
    }
  }
  return 'FEED_' + String(lastId + 1).padStart(4, '0');
}

function feedbackRowToObj_(row) {
  return {
    feedback_id:    String(row[0]  || ''),
    proj_id:        String(row[1]  || ''),
    parent_id:      String(row[2]  || ''),
    commenter_id:   String(row[3]  || ''),
    commenter_role: String(row[4]  || ''),
    comment_text:   String(row[5]  || ''),
    created_at:     String(row[6] || ''),
    created_by:     String(row[7] || ''),
    updated_by:     String(row[8] || '')
  };
}
// For feedback, we can have root comments (parent_id = '') and replies (parent_id = feedback_id of the parent comment).
function handleListFeedback_(payload) {
  var projId = String(payload.proj_id || '').trim();
  if (!projId) return { ok: false, error: 'proj_id is required.' };
  var sheet = feedbackSheet_();
  var data  = sheet.getDataRange().getValues();
  var items = [];
  for (var i = 1; i < data.length; i++) {
    if (!String(data[i][0] || '').trim()) continue;
    var obj = feedbackRowToObj_(data[i]);
    if (obj.proj_id === projId) items.push(obj);
  }
  return { ok: true, feedback: items };
}

function handleCreateFeedback_(payload) {
  var projId  = String(payload.proj_id       || '').trim();
  var userId  = String(payload.user_id       || '').trim();
  var text    = String(payload.comment_text  || '').trim();
  var role    = String(payload.commenter_role|| '').trim();
  if (!projId)  return { ok: false, error: 'proj_id is required.' };
  if (!userId)  return { ok: false, error: 'user_id is required.' };
  if (!text)    return { ok: false, error: 'comment_text is required.' };

  var sheet = feedbackSheet_();
  var id    = feedbackNextId_();
  var now   = formatTimestamp_(new Date());

  var row = [
    id,
    projId,
    String(payload.parent_id     || '').trim(),
    userId,
    role,
    text,
    now,         // created_at
    userId,      // created_by
    userId       // updated_by
  ];
  sheet.appendRow(row);
  return { ok: true, feedback_id: id, created_at: now };
}

function handleDeleteFeedback_(payload) {
  var id = String(payload.feedback_id || '').trim();
  if (!id) return { ok: false, error: 'feedback_id is required.' };
  var sheet = feedbackSheet_();
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === id) { sheet.deleteRow(i + 1); return { ok: true, feedback_id: id }; }
  }
  return { ok: false, error: 'Feedback not found: ' + id };
}

// ── Overview: Recent Activity aggregation ─────────────────────────────────────
// Returns recent feedback comments + recently created milestones for all of the
// user's projects, sorted by created_at descending (max 15 items).
function handleGetProjRecentActivity_(payload) {
  var userId = String(payload.user_id || '').trim();
  if (!userId) return { ok: false, error: 'user_id is required.' };

  // 1. Gather all project IDs belonging to this user
  var projResult = handleListProjIntern_({ user_id: userId });
  if (!projResult.ok || !projResult.projects || !projResult.projects.length) {
    return { ok: true, activities: [] };
  }

  var projIdSet = {};
  var projNameMap = {};
  (projResult.projects || []).forEach(function(p) {
    var pid = String(p.proj_id || '');
    if (pid) {
      projIdSet[pid]   = true;
      projNameMap[pid] = String(p.proj_name || '');
    }
  });

  var activities = [];

  // 2. Collect recent root feedback comments across those projects
  try {
    var fbSheet = feedbackSheet_();
    var fbData  = fbSheet.getDataRange().getValues();
    for (var i = 1; i < fbData.length; i++) {
      var row = fbData[i];
      if (!String(row[0] || '').trim()) continue;
      var rowProjId = String(row[1] || '').trim();
      if (!projIdSet[rowProjId]) continue;
      // row[2] = parent_id — skip replies to keep feed concise
      if (String(row[2] || '').trim()) continue;
      activities.push({
        type:       'feedback',
        proj_id:    rowProjId,
        proj_name:  projNameMap[rowProjId] || '',
        text:       String(row[5] || ''),
        role:       String(row[4] || ''),
        created_at: String(row[6] || '')
      });
    }
  } catch (fbErr) { /* ignore read errors gracefully */ }

  // 3. Collect recently created milestones across those projects
  try {
    var msSheet = milestoneSheet_();
    var msData  = msSheet.getDataRange().getValues();
    for (var j = 1; j < msData.length; j++) {
      var msRow = msData[j];
      if (!String(msRow[0] || '').trim()) continue;
      var msProjId = String(msRow[1] || '').trim();
      if (!projIdSet[msProjId]) continue;
      activities.push({
        type:       'milestone',
        proj_id:    msProjId,
        proj_name:  projNameMap[msProjId] || '',
        text:       String(msRow[2] || ''),
        status:     String(msRow[3] || 'Not Started'),
        created_at: String(msRow[6] || '')
      });
    }
  } catch (msErr) { /* ignore read errors gracefully */ }

  // 4. Sort newest-first, cap at 15
  activities.sort(function(a, b) {
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });

  return { ok: true, activities: activities.slice(0, 15) };
}
