// ProjectsSupervisor.js - project assignment bootstrap helpers.

function projNormalizeText_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function projSameDepartment_(userDepartment, targetDepartment) {
  var userDept = projNormalizeText_(userDepartment);
  var targetDept = projNormalizeText_(targetDepartment);
  return Boolean(userDept && targetDept && userDept === targetDept);
}

function projIsInternUser_(user) {
  var role = projNormalizeText_(user && user.role);
  return role.indexOf('intern') !== -1 || role.indexOf('student') !== -1 || role === 'ojt';
}

function projIsSupervisorUser_(user) {
  var role = projNormalizeText_(user && user.role);
  return role.indexOf('supervisor') !== -1 || role.indexOf('mentor') !== -1;
}

function projFindHeaderIndex_(normalizedHeaders, candidates) {
  for (var i = 0; i < normalizedHeaders.length; i++) {
    for (var j = 0; j < candidates.length; j++) {
      if (normalizedHeaders[i] === candidates[j]) {
        return i;
      }
    }
  }
  return -1;
}

function projNormalizeUserForClient_(row, indexes) {
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

function projGetAssignmentDepartmentForUser_(userId) {
  var targetUserId = String(userId || '').trim();
  if (!targetUserId) {
    return '';
  }

  var assignSheet = getSupervisorAssignmentsSheet_();
  if (!assignSheet) {
    return '';
  }

  var assignData = assignSheet.getDataRange().getValues();
  if (!assignData || assignData.length < 2) {
    return '';
  }

  var headers = assignData[0].map(function(header) {
    return String(header || '').trim().toLowerCase();
  });
  var supervisorIdx = headers.indexOf('supervisor_user_id');
  var studentIdx = headers.indexOf('student_user_id');
  var departmentIdx = headers.indexOf('department');
  var statusIdx = headers.indexOf('status');

  if (departmentIdx === -1) {
    return '';
  }

  for (var i = 1; i < assignData.length; i++) {
    var row = assignData[i];
    var status = statusIdx >= 0 ? projNormalizeText_(row[statusIdx]) : 'active';
    if (status === 'inactive' || status === 'removed' || status === 'archived') {
      continue;
    }

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
    userId: projFindHeaderIndex_(normalizedHeaders, ['userid', 'id', 'user']),
    name: projFindHeaderIndex_(normalizedHeaders, ['fullname', 'name']),
    email: projFindHeaderIndex_(normalizedHeaders, ['email', 'emailaddress', 'mail']),
    role: projFindHeaderIndex_(normalizedHeaders, ['role', 'userrole', 'type', 'position']),
    department: projFindHeaderIndex_(normalizedHeaders, ['department', 'dept', 'departmentname', 'division']),
    profilePhotoUrl: projFindHeaderIndex_(normalizedHeaders, ['profilephotourl', 'photo', 'photourl', 'avatar', 'avatarurl']),
    profilePhotoFileId: projFindHeaderIndex_(normalizedHeaders, ['profilephotofileid', 'photofileid', 'avatarfileid'])
  };

  if (indexes.userId === -1) {
    return { ok: false, error: 'users sheet missing user id column.' };
  }

  var users = [];
  var usersById = {};
  for (var i = 1; i < usersData.length; i++) {
    var user = projNormalizeUserForClient_(usersData[i], indexes);
    if (!user.user_id) {
      continue;
    }
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
    projGetAssignmentDepartmentForUser_(currentUserId) ||
    ''
  ).trim();

  var allInterns = users.filter(projIsInternUser_);
  var allSupervisors = users.filter(projIsSupervisorUser_);
  var interns = departmentContext
    ? allInterns.filter(function(user) { return projSameDepartment_(user.department, departmentContext); })
    : [];
  var supervisors = departmentContext
    ? allSupervisors.filter(function(user) { return projSameDepartment_(user.department, departmentContext); })
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
