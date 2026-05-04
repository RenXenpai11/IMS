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

function projBootstrapNormalizeText_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function projBootstrapSameDepartment_(userDepartment, targetDepartment) {
  var userDept = projBootstrapNormalizeText_(userDepartment);
  var targetDept = projBootstrapNormalizeText_(targetDepartment);
  return Boolean(userDept && targetDept && userDept === targetDept);
}

function projBootstrapIsInternUser_(user) {
  var role = projBootstrapNormalizeText_(user && user.role);
  return role.indexOf('intern') !== -1 || role.indexOf('student') !== -1 || role === 'ojt';
}

function projBootstrapIsSupervisorUser_(user) {
  var role = projBootstrapNormalizeText_(user && user.role);
  return role.indexOf('supervisor') !== -1 || role.indexOf('mentor') !== -1;
}

function projBootstrapFindHeaderIndex_(normalizedHeaders, candidates) {
  for (var i = 0; i < normalizedHeaders.length; i++) {
    for (var j = 0; j < candidates.length; j++) {
      if (normalizedHeaders[i] === candidates[j]) return i;
    }
  }
  return -1;
}

function projBootstrapNormalizeUserForClient_(row, indexes) {
  var userId = indexes.userId >= 0 ? String(row[indexes.userId] || '').trim() : '';
  var fullName = indexes.name >= 0 ? String(row[indexes.name] || '').trim() : '';
  var email = indexes.email >= 0 ? String(row[indexes.email] || '').trim() : '';
  var role = indexes.role >= 0 ? String(row[indexes.role] || '').trim() : '';
  var department = indexes.department >= 0 ? String(row[indexes.department] || '').trim() : '';
  var profilePhotoUrl = indexes.profilePhotoUrl >= 0 ? String(row[indexes.profilePhotoUrl] || '').trim() : '';
  var profilePhotoFileId = indexes.profilePhotoFileId >= 0 ? String(row[indexes.profilePhotoFileId] || '').trim() : '';
  var displayName = fullName || email || userId;

  return {
    id: userId,
    user_id: userId,
    name: displayName,
    full_name: displayName,
    email: email,
    role: role,
    department: department,
    profile_photo_url: profilePhotoUrl,
    profile_photo_file_id: profilePhotoFileId
  };
}

function projBootstrapAssignmentDepartmentForUser_(userId) {
  var targetUserId = String(userId || '').trim();
  if (!targetUserId) return '';

  var assignSheet = getSupervisorAssignmentsSheet_();
  if (!assignSheet) return '';

  var assignData = assignSheet.getDataRange().getValues();
  if (!assignData || assignData.length < 2) return '';

  var headers = assignData[0].map(function(header) {
    return String(header || '').trim().toLowerCase();
  });
  var supervisorIdx = headers.indexOf('supervisor_user_id');
  var studentIdx = headers.indexOf('student_user_id');
  var departmentIdx = headers.indexOf('department');
  var statusIdx = headers.indexOf('status');

  if (departmentIdx === -1) return '';

  for (var i = 1; i < assignData.length; i++) {
    var row = assignData[i];
    var status = statusIdx >= 0 ? projBootstrapNormalizeText_(row[statusIdx]) : 'active';
    if (status === 'inactive' || status === 'removed' || status === 'archived') continue;

    var supervisorId = supervisorIdx >= 0 ? String(row[supervisorIdx] || '').trim() : '';
    var studentId = studentIdx >= 0 ? String(row[studentIdx] || '').trim() : '';
    if (targetUserId === supervisorId || targetUserId === studentId) {
      return String(row[departmentIdx] || '').trim();
    }
  }

  return '';
}

function handleGetProjUsersBootstrap_(payload) {
  var currentUserId = String(payload.user_id || '').trim();
  var usersSheet = getUsersSheet_();
  if (!usersSheet) {
    return { ok: false, error: 'users sheet not found.' };
  }

  var usersData = usersSheet.getDataRange().getValues();
  if (!usersData || usersData.length < 2) {
    return { ok: true, users: [], interns: [], supervisors: [] };
  }

  var normalizedHeaders = usersData[0].map(function(header) {
    return String(header || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  });
  var indexes = {
    userId: projBootstrapFindHeaderIndex_(normalizedHeaders, ['userid', 'id', 'user']),
    name: projBootstrapFindHeaderIndex_(normalizedHeaders, ['fullname', 'name']),
    email: projBootstrapFindHeaderIndex_(normalizedHeaders, ['email', 'emailaddress', 'mail']),
    role: projBootstrapFindHeaderIndex_(normalizedHeaders, ['role', 'userrole', 'type', 'position']),
    department: projBootstrapFindHeaderIndex_(normalizedHeaders, ['department', 'dept', 'departmentname', 'division']),
    profilePhotoUrl: projBootstrapFindHeaderIndex_(normalizedHeaders, ['profilephotourl', 'photo', 'photourl', 'avatar', 'avatarurl']),
    profilePhotoFileId: projBootstrapFindHeaderIndex_(normalizedHeaders, ['profilephotofileid', 'photofileid', 'avatarfileid'])
  };

  if (indexes.userId === -1) {
    return { ok: false, error: 'users sheet missing user id column.' };
  }

  var users = [];
  var usersById = {};
  for (var i = 1; i < usersData.length; i++) {
    var user = projBootstrapNormalizeUserForClient_(usersData[i], indexes);
    if (!user.user_id) continue;
    users.push(user);
    usersById[user.user_id] = user;
  }

  var currentUser = usersById[currentUserId] || null;
  var departmentContext = String(
    payload.department ||
    payload.Department ||
    payload.dept ||
    payload.Dept ||
    payload.departmentName ||
    payload.DepartmentName ||
    (currentUser && currentUser.department) ||
    projBootstrapAssignmentDepartmentForUser_(currentUserId) ||
    ''
  ).trim();

  var allInterns = users.filter(projBootstrapIsInternUser_);
  var allSupervisors = users.filter(projBootstrapIsSupervisorUser_);
  var interns = departmentContext
    ? allInterns.filter(function(user) { return projBootstrapSameDepartment_(user.department, departmentContext); })
    : [];
  var supervisors = departmentContext
    ? allSupervisors.filter(function(user) { return projBootstrapSameDepartment_(user.department, departmentContext); })
    : [];

  if (!departmentContext) {
    Logger.log('Project user bootstrap department context is empty for user_id=' + currentUserId);
  }

  return {
    ok: true,
    users: users,
    interns: interns,
    supervisors: supervisors,
    department: departmentContext
  };
}
