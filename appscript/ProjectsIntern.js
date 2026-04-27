// ProjectsIntern.js - handles project management for interns (CRUD operations)
var PROJ_INTERN_SHEET_  = 'proj_intern';
var PROJ_INTERN_HEADERS_ = [
  'proj_id', 'proj_name', 'priority', 'status', 'members', 'supervisor',
  'start_date', 'end_date', 'description',
  'created_at', 'created_by', 'updated_by'
];


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
    String(payload.status      || 'Pending').trim(),
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

// Returns all interns (for members) and supervisors separately

// ── Bootstrap: returns the supervisor assigned to this intern + co-interns ──
// Uses supervisor_assignments (cols: assignment_id, supervisor_user_id,
// student_user_id, company, department, status) to scope the dropdowns.

function handleGetProjUsersBootstrap_(payload) {
  var internId = String(payload.user_id || '').trim();

  // ── 1. Build a map of all users ──────────────────────────────────────────
  var usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('users');
  if (!usersSheet) return { ok: false, error: 'users sheet not found.' };

  var usersData = usersSheet.getDataRange().getValues();
  if (!usersData || usersData.length < 2) return { ok: true, interns: [], supervisors: [] };

  // Flexible header detection (accept 'user_id', 'id', 'userid', 'user', etc.)
  var rawUHeaders = usersData[0].map(function(h){ return String(h || '').trim(); });
  var uHeaders = rawUHeaders.map(function(h){ return String(h || '').toLowerCase().replace(/\s+/g,''); });

  function findIndex(cands) {
    for (var ii = 0; ii < uHeaders.length; ii++) {
      for (var jj = 0; jj < cands.length; jj++) {
        if (uHeaders[ii] === cands[jj] || uHeaders[ii].indexOf(cands[jj]) !== -1) return ii;
      }
    }
    return -1;
  }

  var uIdIdx    = findIndex(['userid','user_id','id','user']);
  var uNameIdx  = findIndex(['fullname','full_name','name']);
  var uEmailIdx = findIndex(['email','e-mail','mail']);
  var uRoleIdx  = findIndex(['role','type','position','userrole']);

  if (uIdIdx === -1) return { ok: false, error: 'users sheet missing user id column.' };

  var userMap = {}; // user_id -> { user_id, full_name, email, role }
  for (var i = 1; i < usersData.length; i++) {
    var r = usersData[i];
    var uid = String(r[uIdIdx] || '').trim();
    if (!uid) continue;
    var nameVal = uNameIdx >= 0 ? String(r[uNameIdx] || '').trim() : '';
    var emailVal = uEmailIdx >= 0 ? String(r[uEmailIdx] || '').trim() : '';
    var roleVal = uRoleIdx >= 0 ? String(r[uRoleIdx] || '').toLowerCase().trim() : '';
    userMap[uid] = {
      user_id:   uid,
      full_name: nameVal || emailVal || uid,
      email:     emailVal,
      role:      roleVal
    };
  }

  // ── 2. Read supervisor_assignments ───────────────────────────────────────
  // Headers: assignment_id, supervisor_user_id, student_user_id, company, department, status, created_at
  var assignSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('supervisor_assignments');

  // Fallback: no assignments sheet yet → return all interns + all supervisors
  if (!assignSheet) {
    var allInterns = [], allSupervisors = [];
    for (var uid2 in userMap) {
      var u = userMap[uid2];
      var rl = u.role;
      if (rl.indexOf('intern') !== -1 || rl.indexOf('student') !== -1) allInterns.push(u);
      else if (rl.indexOf('supervisor') !== -1 || rl.indexOf('mentor') !== -1) allSupervisors.push(u);
    }
    return { ok: true, interns: allInterns, supervisors: allSupervisors };
  }

  var assignData = assignSheet.getDataRange().getValues();
  if (!assignData || assignData.length < 2) {
    return { ok: true, interns: [], supervisors: [] };
  }

  var aHeaders      = assignData[0].map(function(h){ return String(h || '').toLowerCase().trim(); });
  var aSupIdx       = aHeaders.indexOf('supervisor_user_id');
  var aStudIdx      = aHeaders.indexOf('student_user_id');
  var aCompanyIdx   = aHeaders.indexOf('company');
  var aDeptIdx      = aHeaders.indexOf('department');
  var aStatusIdx    = aHeaders.indexOf('status');

  // ── 3. Find this intern's assignment ────────────────────────────────────
  var internSupervisorId = '';
  var internCompany      = '';
  var internDept         = '';

  if (internId && aStudIdx !== -1) {
    for (var j = 1; j < assignData.length; j++) {
      var ar = assignData[j];
      var statusVal = aStatusIdx >= 0 ? String(ar[aStatusIdx] || '').toLowerCase().trim() : 'active';
      if (String(ar[aStudIdx] || '').trim() !== internId) continue;
      if (statusVal === 'inactive' || statusVal === 'removed') continue;
      internSupervisorId = aSupIdx    >= 0 ? String(ar[aSupIdx]     || '').trim() : '';
      internCompany      = aCompanyIdx >= 0 ? String(ar[aCompanyIdx] || '').trim() : '';
      internDept         = aDeptIdx    >= 0 ? String(ar[aDeptIdx]    || '').trim() : '';
      break; // use first active assignment
    }
  }

  // ── 4. Find co-interns in the same company+department ───────────────────
  var coInternIds = {};
  if (aStudIdx !== -1 && (internCompany || internDept)) {
    for (var k = 1; k < assignData.length; k++) {
      var kr = assignData[k];
      var kStatus = aStatusIdx >= 0 ? String(kr[aStatusIdx] || '').toLowerCase().trim() : 'active';
      if (kStatus === 'inactive' || kStatus === 'removed') continue;

      var kCompany = aCompanyIdx >= 0 ? String(kr[aCompanyIdx] || '').trim() : '';
      var kDept    = aDeptIdx    >= 0 ? String(kr[aDeptIdx]    || '').trim() : '';
      var kStud    = String(kr[aStudIdx] || '').trim();

      // Match on company (and department if available)
      var sameCompany = !internCompany || kCompany === internCompany;
      var sameDept    = !internDept    || kDept    === internDept;
      if (sameCompany && sameDept && kStud && kStud !== internId) {
        coInternIds[kStud] = true;
      }
    }
  }

  // ── 5. Build result arrays ───────────────────────────────────────────────
  var internsList = [];
  for (var coId in coInternIds) {
    var coUser = userMap[coId];
    if (coUser) internsList.push(coUser);
  }

  var supervisorsList = [];
  if (internSupervisorId && userMap[internSupervisorId]) {
    supervisorsList.push(userMap[internSupervisorId]);
  }

  // Fallback: if no assignment found, return all users by role
  if (!internSupervisorId && !internsList.length) {
    for (var fid in userMap) {
      var fu = userMap[fid];
      var fr = fu.role;
      if (fr.indexOf('intern') !== -1 || fr.indexOf('student') !== -1) internsList.push(fu);
      else if (fr.indexOf('supervisor') !== -1 || fr.indexOf('mentor') !== -1) supervisorsList.push(fu);
    }
  }

  return { ok: true, interns: internsList, supervisors: supervisorsList };
}
