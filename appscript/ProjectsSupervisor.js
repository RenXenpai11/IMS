// ProjectsSupervisor.js - supervisor-specific helpers for projects

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
	var uDeptIdx  = findIndex(['department','dept','division']);

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
			user_id:   uid,
			full_name: nameVal || emailVal || uid,
			email:     emailVal,
			role:      roleVal,
			department: deptVal
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
	// Build lists of all interns/supervisors based on role for use as fallback
	var allInterns = [];
	var allSupervisors = [];
	for (var fid in userMap) {
		var fu = userMap[fid];
		var fr = String(fu.role || '').toLowerCase();
		if (fr.indexOf('intern') !== -1 || fr.indexOf('student') !== -1) allInterns.push(fu);
		else if (fr.indexOf('supervisor') !== -1 || fr.indexOf('mentor') !== -1) allSupervisors.push(fu);
	}

	// If no scoped co-interns found, prefer interns in the same department as the current user
	var currentUserDept = internId && userMap[internId] ? String(userMap[internId].department || '').trim() : '';
	if (!internsList.length) {
		if (currentUserDept) {
			var deptMatches = allInterns.filter(function(u){ return String(u.department || '').trim() === currentUserDept; });
			internsList = deptMatches.length ? deptMatches : allInterns.slice();
		} else {
			internsList = allInterns.slice();
		}
	}

	// If no supervisors were found, fall back to all supervisors
	if (!supervisorsList.length) {
		supervisorsList = allSupervisors.slice();
	}

	return { ok: true, interns: internsList, supervisors: supervisorsList };
}
