// ProjectsSupervisor.js - supervisor-specific helpers for projects

var PROJ_SUPERVISOR_SHEET_ = 'poj_supervisor';
var PROJ_SUPERVISOR_HEADERS_ = [
  'projsupervisor_id', 'proj_id', 'proj_name', 'priority', 'status', 'members',
  'supervisor', 'start_date', 'end_date', 'description',
  'created_at', 'created_by', 'updated_by'
];

function normalizeProjectTagValue_(value) {
  return String(value || '').trim().toLowerCase();
}

function splitProjectCsvValues_(value) {
  if (Array.isArray(value)) {
    return value.map(function (item) {
      return String(item || '').trim();
    }).filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map(function (item) {
      return String(item || '').trim();
    })
    .filter(Boolean);
}

function joinProjectCsvValues_(value) {
  return splitProjectCsvValues_(value).join(',');
}

function formatSupervisorSheetDate_(value) {
  var s = String(value || '').trim();
  if (!s) return '';

  var d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    d = new Date(s + 'T00:00:00');
  } else {
    d = new Date(s);
  }

  if (isNaN(d)) return s;
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function projSupervisorSheet_() {
  return getOrCreateSheetWithHeaders_(PROJ_SUPERVISOR_SHEET_, PROJ_SUPERVISOR_HEADERS_);
}

function connectSupervisorProjectsDb_() {
  return projSupervisorSheet_();
}

function projSupervisorRowToObj_(row) {
  return {
    projsupervisor_id: String(row[0] || ''),
    proj_id: String(row[1] || ''),
    proj_name: String(row[2] || ''),
    priority: String(row[3] || ''),
    status: String(row[4] || ''),
    members: String(row[5] || ''),
    supervisor: String(row[6] || ''),
    start_date: row[7] ? formatSupervisorSheetDate_(row[7]) : '',
    end_date: row[8] ? formatSupervisorSheetDate_(row[8]) : '',
    description: String(row[9] || ''),
    created_at: String(row[10] || ''),
    created_by: String(row[11] || ''),
    updated_by: String(row[12] || '')
  };
}

function readSupervisorProjectRows_(supervisorUserId) {
  var supervisorTokens = buildSupervisorLookupTokens_(supervisorUserId);
  var sheet = connectSupervisorProjectsDb_();
  var data = getSheetValues_(sheet);
  var projects = [];
  var ownerNameCache = {};

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!String(row[1] || '').trim()) continue;

    var obj = projSupervisorRowToObj_(row);
    var supervisors = splitProjectCsvValues_(obj.supervisor);
    var createdBy = String(obj.created_by || '').trim();

    var supervisorMatch = matchesAnyToken_(supervisors, supervisorTokens);
    var creatorMatch = matchesAnyToken_([createdBy], supervisorTokens);

    // Show rows tagged to the current supervisor, plus supervisor-created rows.
    if (!supervisorMatch && !creatorMatch) continue;

    var ownerName = resolveProjectOwnerName_(createdBy, ownerNameCache);

    projects.push({
      id: obj.proj_id,
      proj_id: obj.proj_id,
      title: obj.proj_name,
      proj_name: obj.proj_name,
      description: obj.description,
      priority_level: String(obj.priority || '').trim() || 'Low',
      priority: String(obj.priority || '').trim() || 'Low',
      status: String(obj.status || '').trim() || 'Not Started',
      members: splitProjectCsvValues_(obj.members),
      supervisor: supervisors,
      supervisors: supervisors,
      timeline_start: obj.start_date,
      timeline_end: obj.end_date,
      deadline: obj.end_date,
      created_at: obj.created_at,
      created_by: createdBy,
      created_by_name: ownerName,
      owner_name: ownerName,
      archived: String(obj.status || '').trim().toLowerCase() === 'archived'
    });
  }

  return projects;
}

function findSupervisorProjectRowIndexByProjId_(sheet, projId) {
  var target = String(projId || '').trim();
  if (!target) return 0;

  var headers = getHeaders_(sheet);
  var projIdCol = findColumnIndex_(headers, 'proj_id');
  if (!projIdCol) return 0;

  var values = getSheetValues_(sheet);
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][projIdCol - 1] || '').trim() === target) {
      return i + 1;
    }
  }
  return 0;
}

function buildSupervisorLookupTokens_(supervisorUserId) {
  var tokenMap = {};

  function addToken(value) {
    var token = normalizeProjectTagValue_(value);
    if (token) tokenMap[token] = true;
  }

  addToken(supervisorUserId);

  try {
    var record = findUserRecordByUserId_(supervisorUserId);
    if (record && record.user) {
      addToken(record.user.full_name);
      addToken(record.user.email);
    }
  } catch (e) {
    // Best effort only. We still match by user id when the lookup fails.
  }

  return tokenMap;
}

function matchesAnyToken_(values, tokenMap) {
  var items = splitProjectCsvValues_(values);
  for (var i = 0; i < items.length; i++) {
    var token = normalizeProjectTagValue_(items[i]);
    if (token && tokenMap[token]) return true;
  }
  return false;
}

function resolveProjectOwnerName_(userId, cache) {
  var key = String(userId || '').trim();
  if (!key) return '';

  if (cache && Object.prototype.hasOwnProperty.call(cache, key)) {
    return cache[key];
  }

  var displayName = key;
  try {
    var record = findUserRecordByUserId_(key);
    if (record && record.user) {
      displayName = String(record.user.full_name || record.user.email || key).trim() || key;
    }
  } catch (e) {
    // Fall back to the raw user id.
  }

  if (cache) {
    cache[key] = displayName;
  }

  return displayName;
}

function syncSupervisorProjectMirror_(project) {
  var projId = String(project && (project.proj_id || project.id) || '').trim();
  if (!projId) {
    return { ok: false, error: 'proj_id is required.' };
  }

  var sheet = connectSupervisorProjectsDb_();
  var rowIndex = findSupervisorProjectRowIndexByProjId_(sheet, projId);
  var existing = rowIndex ? projSupervisorRowToObj_(getSheetValues_(sheet)[rowIndex - 1]) : null;
  var createdAt = String((existing && existing.created_at) || project.created_at || '').trim();
  var createdBy = String((existing && existing.created_by) || project.created_by || '').trim();
  var updatedBy = String(project.updated_by || project.created_by || createdBy || '').trim();
  var row = {
    projsupervisor_id: String((existing && existing.projsupervisor_id) || createId_('PSP')).trim(),
    proj_id: projId,
    proj_name: String(project.proj_name || project.title || '').trim(),
    priority: String(project.priority || project.priority_level || 'Medium').trim() || 'Medium',
    status: String(project.status || 'Not Started').trim() || 'Not Started',
    members: joinProjectCsvValues_(project.members),
    supervisor: joinProjectCsvValues_(project.supervisor !== undefined ? project.supervisor : project.supervisors),
    start_date: formatSupervisorSheetDate_(project.start_date || project.timeline_start || ''),
    end_date: formatSupervisorSheetDate_(project.end_date || project.timeline_end || project.deadline || ''),
    description: String(project.description || '').trim(),
    created_at: createdAt || formatTimestamp_(new Date()),
    created_by: createdBy,
    updated_by: updatedBy
  };

  if (rowIndex) {
    updateObjectRow_(sheet, rowIndex, row);
  } else {
    appendObjectRow_(sheet, row);
  }

  return { ok: true, proj_id: projId, projsupervisor_id: row.projsupervisor_id };
}

function deleteSupervisorProjectMirror_(projId) {
  var target = String(projId || '').trim();
  if (!target) return { ok: false, error: 'proj_id is required.' };

  var sheet = connectSupervisorProjectsDb_();
  var rowIndex = findSupervisorProjectRowIndexByProjId_(sheet, target);
  if (!rowIndex) {
    return { ok: true, proj_id: target, deleted: false };
  }

  sheet.deleteRow(rowIndex);
  return { ok: true, proj_id: target, deleted: true };
}

function handleListProjSupervisor_(payload) {
  var supervisorUserId = String(payload.supervisor_user_id || '').trim();
  if (!supervisorUserId) return { ok: false, error: 'supervisor_user_id is required.' };

  return { ok: true, projects: readSupervisorProjectRows_(supervisorUserId) };
}

// Bootstrap returns the supervisor assigned to this intern plus co-interns.
// Uses supervisor_assignments (cols: assignment_id, supervisor_user_id,
// student_user_id, company, department, status) to scope the dropdowns.
function handleGetProjUsersBootstrap_(payload) {
  var internId = String(payload.user_id || '').trim();

  // 1. Build a map of all users
  var usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('users');
  if (!usersSheet) return { ok: false, error: 'users sheet not found.' };

  var usersData = usersSheet.getDataRange().getValues();
  if (!usersData || usersData.length < 2) return { ok: true, interns: [], supervisors: [] };

  // Flexible header detection (accept user_id, id, userid, user, etc.)
  var rawUHeaders = usersData[0].map(function (h) { return String(h || '').trim(); });
  var uHeaders = rawUHeaders.map(function (h) { return String(h || '').toLowerCase().replace(/\s+/g, ''); });

  function findIndex(cands) {
    for (var ii = 0; ii < uHeaders.length; ii++) {
      for (var jj = 0; jj < cands.length; jj++) {
        if (uHeaders[ii] === cands[jj] || uHeaders[ii].indexOf(cands[jj]) !== -1) return ii;
      }
    }
    return -1;
  }

  var uIdIdx = findIndex(['userid', 'user_id', 'id', 'user']);
  var uNameIdx = findIndex(['fullname', 'full_name', 'name']);
  var uEmailIdx = findIndex(['email', 'e-mail', 'mail']);
  var uRoleIdx = findIndex(['role', 'type', 'position', 'userrole']);
  var uDeptIdx = findIndex(['department', 'dept', 'division']);

  if (uIdIdx === -1) return { ok: false, error: 'users sheet missing user id column.' };

  var userMap = {}; // user_id -> { user_id, full_name, email, role }
  for (var i = 1; i < usersData.length; i++) {
    var r = usersData[i];
    var uid = String(r[uIdIdx] || '').trim();
    if (!uid) continue;
    var nameVal = uNameIdx >= 0 ? String(r[uNameIdx] || '').trim() : '';
    var emailVal = uEmailIdx >= 0 ? String(r[uEmailIdx] || '').trim() : '';
    var roleVal = uRoleIdx >= 0 ? String(r[uRoleIdx] || '').toLowerCase().trim() : '';
    var deptVal = uDeptIdx >= 0 ? String(r[uDeptIdx] || '').trim() : '';
    userMap[uid] = {
      user_id: uid,
      full_name: nameVal || emailVal || uid,
      email: emailVal,
      role: roleVal,
      department: deptVal
    };
  }

  // 2. Read supervisor_assignments
  // Headers: assignment_id, supervisor_user_id, student_user_id, company, department, status, created_at
  var assignSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('supervisor_assignments');

  // Fallback: no assignments sheet yet -> return all interns + all supervisors
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

  var aHeaders = assignData[0].map(function (h) { return String(h || '').toLowerCase().trim(); });
  var aSupIdx = aHeaders.indexOf('supervisor_user_id');
  var aStudIdx = aHeaders.indexOf('student_user_id');
  var aCompanyIdx = aHeaders.indexOf('company');
  var aDeptIdx = aHeaders.indexOf('department');
  var aStatusIdx = aHeaders.indexOf('status');

  // 3. Find this intern's assignment
  var internSupervisorId = '';
  var internCompany = '';
  var internDept = '';

  if (internId && aStudIdx !== -1) {
    for (var j = 1; j < assignData.length; j++) {
      var ar = assignData[j];
      var statusVal = aStatusIdx >= 0 ? String(ar[aStatusIdx] || '').toLowerCase().trim() : 'active';
      if (String(ar[aStudIdx] || '').trim() !== internId) continue;
      if (statusVal === 'inactive' || statusVal === 'removed') continue;
      internSupervisorId = aSupIdx >= 0 ? String(ar[aSupIdx] || '').trim() : '';
      internCompany = aCompanyIdx >= 0 ? String(ar[aCompanyIdx] || '').trim() : '';
      internDept = aDeptIdx >= 0 ? String(ar[aDeptIdx] || '').trim() : '';
      break; // use first active assignment
    }
  }

  // 4. Find co-interns in the same company + department
  var coInternIds = {};
  if (aStudIdx !== -1 && (internCompany || internDept)) {
    for (var k = 1; k < assignData.length; k++) {
      var kr = assignData[k];
      var kStatus = aStatusIdx >= 0 ? String(kr[aStatusIdx] || '').toLowerCase().trim() : 'active';
      if (kStatus === 'inactive' || kStatus === 'removed') continue;

      var kCompany = aCompanyIdx >= 0 ? String(kr[aCompanyIdx] || '').trim() : '';
      var kDept = aDeptIdx >= 0 ? String(kr[aDeptIdx] || '').trim() : '';
      var kStud = String(kr[aStudIdx] || '').trim();

      // Match on company (and department if available)
      var sameCompany = !internCompany || kCompany === internCompany;
      var sameDept = !internDept || kDept === internDept;
      if (sameCompany && sameDept && kStud && kStud !== internId) {
        coInternIds[kStud] = true;
      }
    }
  }

  // 5. Build result arrays
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
  // Build lists of all interns/supervisors based on role for use as fallback
  var allInternsFallback = [];
  var allSupervisorsFallback = [];
  for (var fid in userMap) {
    var fu = userMap[fid];
    var fr = String(fu.role || '').toLowerCase();
    if (fr.indexOf('intern') !== -1 || fr.indexOf('student') !== -1) allInternsFallback.push(fu);
    else if (fr.indexOf('supervisor') !== -1 || fr.indexOf('mentor') !== -1) allSupervisorsFallback.push(fu);
  }

  // If no scoped co-interns found, prefer interns in the same department as the current user
  var currentUserDept = internId && userMap[internId] ? String(userMap[internId].department || '').trim() : '';
  if (!internsList.length) {
    if (currentUserDept) {
      var deptMatches = allInternsFallback.filter(function (u) { return String(u.department || '').trim() === currentUserDept; });
      internsList = deptMatches.length ? deptMatches : allInternsFallback.slice();
    } else {
      internsList = allInternsFallback.slice();
    }
  }

  // If no supervisors were found, fall back to all supervisors
  if (!supervisorsList.length) {
    supervisorsList = allSupervisorsFallback.slice();
  }

  return { ok: true, interns: internsList, supervisors: supervisorsList };
}
