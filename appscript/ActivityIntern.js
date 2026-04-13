// Save a worklog to the 'activity_worklogs' sheet
function addActivityWorklog(payload) {
	var sheet = getSheet_('activity_worklogs');
	var now = new Date();
	// Generate unique key for task_id if not provided, format WL_0001, WL_0002, ...
	var uniqueKey = payload.task_id;
	if (!uniqueKey) {
		var data = sheet.getDataRange().getValues();
		var lastId = 0;
		for (var i = 1; i < data.length; i++) {
			var val = String(data[i][0] || '');
			if (/^WL_\d+$/.test(val)) {
				var num = parseInt(val.replace('WL_', ''), 10);
				if (!isNaN(num) && num > lastId) lastId = num;
			}
		}
		uniqueKey = 'WL_' + String(lastId + 1).padStart(4, '0');
	}
	var row = [
		uniqueKey,
		payload.user_id || '',
		payload.task || '',
		payload.notes || '',
		payload.learnings || '',
		payload.date || '',
		payload.created_at || now.toISOString(),
		payload.created_by || '',
		payload.updated_by || '',
		payload.attachment_id || '',
		payload.user_id || '', // user_id again for attachment
		payload.file_type || '',
		payload.file_size || '',
		payload.link || '',
		payload.uploaded_at || '',
		payload.uploaded_by || ''
	];
	sheet.appendRow(row);
	return { ok: true, task_id: uniqueKey };
}
// Log a generic user activity (for Recent Activity panel)
function logUserActivity(activity) {
	var sheet = getSheet_('recent_activities');
	var now = new Date();
	var id = 'ACT-' + now.getTime();
	var row = [
		id,
		activity.user || '',
		activity.message || '',
		activity.timestamp || now.toISOString()
	];
	sheet.appendRow(row);
	return { ok: true, id: id };
}

// Get recent activities (latest 20)
function getRecentActivities() {
	var sheet = getSheet_('recent_activities');
	var data = sheet.getDataRange().getValues();
	var activities = [];
	for (var i = data.length - 1; i > 0 && activities.length < 20; i--) {
		activities.push({
			id: data[i][0],
			user: data[i][1],
			message: data[i][2],
			timestamp: data[i][3]
		});
	}
	return activities;
}
// Update a task by id
function updateActivityTask(payload) {
	var sheet = getSheet_('activity_logs');
	var id = String(payload.id || '').trim();
	if (!id) {
		return { ok: false, error: 'id is required.' };
	}
	var data = sheet.getDataRange().getValues();
	var headers = data[0];
	var idIdx = headers.indexOf('id');
	var statusIdx = headers.indexOf('status');
	var checklistIdx = headers.indexOf('checklist');
	var descriptionIdx = headers.indexOf('description');
	var updatedByIdx = headers.indexOf('updated_by');
	var updatedAtIdx = headers.indexOf('updated_at');
	if (idIdx === -1 || statusIdx === -1) {
		return { ok: false, error: 'Sheet missing id or status column.' };
	}
	for (var i = 1; i < data.length; i++) {
		if (String(data[i][idIdx]).trim() === id) {
			if (payload.status) sheet.getRange(i+1, statusIdx+1).setValue(String(payload.status).trim());
			if (payload.checklist && checklistIdx !== -1) sheet.getRange(i+1, checklistIdx+1).setValue(JSON.stringify(payload.checklist));
			if (payload.description && descriptionIdx !== -1) sheet.getRange(i+1, descriptionIdx+1).setValue(String(payload.description));
			if (updatedByIdx !== -1 && payload.updated_by) sheet.getRange(i+1, updatedByIdx+1).setValue(String(payload.updated_by));
			if (updatedAtIdx !== -1) sheet.getRange(i+1, updatedAtIdx+1).setValue(isoNow_());
			return { ok: true, message: 'Task updated.' };
		}
	}
	return { ok: false, error: 'Task not found.' };
}
// Helper: Fetch user info from users sheet by email 
function getUserInfoByEmail_(email) {
	var usersSheet = getSheet_('users');
	var data = usersSheet.getDataRange().getValues();
	var headers = data[0];
	var userIdIdx = headers.indexOf('user_id');
	var fullNameIdx = headers.indexOf('full_name');
	var emailIdx = headers.indexOf('email');
	var roleIdx = headers.indexOf('role');
	if (userIdIdx === -1 || fullNameIdx === -1 || emailIdx === -1) return null;
	for (var i = 1; i < data.length; i++) {
		if ((data[i][emailIdx] || '').toString().trim().toLowerCase() === (email || '').toString().trim().toLowerCase()) {
			return {
				user_id: data[i][userIdIdx],
				full_name: data[i][fullNameIdx],
				email: data[i][emailIdx],
				role: roleIdx !== -1 ? data[i][roleIdx] : ''
			};
		}
	}
	return null;
}
// Create a new activity task
function createActivityTask(payload) {
	return handleCreateActivityTask_(payload || {});
}

// Internal function to handle activity task creation logic
function handleCreateActivityTask_(payload) {
	var sheet = getSheet_('activity_logs');
	var taskName = String(payload.title || payload.task_name || '').trim();
	if (!taskName) {
		return { ok: false, error: 'title is required.' };
	}
	var ownerEmail = String(payload.owner_email || payload.email || '').trim();
	var dueDate = String(payload.due_date || '').trim();
	// dateCreated logic removed
	var createdAt = String(payload.created_at || isoNow_());
	var userInfo = getUserInfoByEmail_(ownerEmail);
	var user_id = userInfo ? String(userInfo.user_id).trim() : '';
	var full_name = userInfo ? String(userInfo.full_name).trim() : ownerEmail;
	var createdBy = user_id;
	var updatedBy = user_id;

	var rowObject = {
		id: String(payload.id || payload.activity_id || createId_('ACT')),
		user_id: user_id,
		task_name: taskName,
		due_date: dueDate,
		status: String(payload.status || 'Pending').trim(),
		description: String(payload.description || '').trim(),
		assigned_by: String(payload.assigned_by || '').trim(),
		checklist: JSON.stringify(payload.dailyChecklist || []),
		created_at: createdAt,
		created_by: createdBy,
		updated_by: updatedBy
	};

	appendObjectRow_(sheet, rowObject);

	return {
		ok: true,
		message: 'Activity task created successfully.',
		task: {
			id: rowObject.id,
			user_id: rowObject.user_id,
			task_name: rowObject.task_name,
			due_date: rowObject.due_date,
			status: rowObject.status,
			description: rowObject.description,
			assigned_by: rowObject.assigned_by,
			created_at: rowObject.created_at,
			created_by: rowObject.created_by,
			updated_by: rowObject.updated_by
		}
	};
}
