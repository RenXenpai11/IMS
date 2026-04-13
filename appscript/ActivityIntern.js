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

function parseActivityJsonArray_(value) {
	if (Array.isArray(value)) {
		return value;
	}

	var raw = String(value || '').trim();
	if (!raw) {
		return [];
	}

	try {
		var parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch (error) {
		return [];
	}
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

function getActivityTasks(payload) {
	var filter = payload || {};
	var sheet = getSheet_('activity_logs');
	var rows = readSheetObjects_(sheet);
	var requestedUserId = String(filter.user_id || '').trim();
	var requestedEmail = String(filter.email || '').trim().toLowerCase();
	var tasks = rows
		.filter(function(row) {
			if (requestedUserId) {
				return String(row.user_id || '').trim() === requestedUserId;
			}
			if (requestedEmail && String(row.owner_email || row.email || '').trim().toLowerCase() !== requestedEmail) {
				return false;
			}
			return true;
		})
		.map(function(row) {
			return {
				id: String(row.id || '').trim(),
				user_id: String(row.user_id || '').trim(),
				task_name: String(row.task_name || row.title || '').trim(),
				due_date: String(row.due_date || '').trim(),
				status: String(row.status || 'Pending').trim(),
				description: String(row.description || '').trim(),
				assigned_by: String(row.assigned_by || '').trim(),
				checklist: parseActivityJsonArray_(row.checklist),
				attachments: parseActivityJsonArray_(row.attachments),
				priority: String(row.priority || 'medium').trim(),
				created_at: String(row.created_at || '').trim(),
				created_by: String(row.created_by || '').trim(),
				updated_at: String(row.updated_at || '').trim(),
				updated_by: String(row.updated_by || '').trim()
			};
		})
		.sort(function(left, right) {
			var rightTime = new Date(right.created_at || 0).getTime() || 0;
			var leftTime = new Date(left.created_at || 0).getTime() || 0;
			return rightTime - leftTime;
		});

	return {
		ok: true,
		tasks: tasks
	};
}
// Update a task by id
function updateActivityTask(payload) {
	var sheet = getSheet_('activity_logs');
	var id = String(payload.id || payload.activity_id || '').trim();
	if (!id) {
		return { ok: false, error: 'id is required.' };
	}
	var data = sheet.getDataRange().getValues();
	if (!data.length) {
		return { ok: false, error: 'activity_logs sheet is empty.' };
	}
	var headers = data[0];
	var idIdx = headers.indexOf('id');
	if (idIdx === -1) {
		return { ok: false, error: 'Sheet missing id column.' };
	}
	var nextChecklist = Array.isArray(payload.checklist) ? payload.checklist : payload.dailyChecklist;
	var nextAttachments = Array.isArray(payload.attachments) ? payload.attachments : null;
	for (var i = 1; i < data.length; i++) {
		if (String(data[i][idIdx]).trim() === id) {
			var existingTask = mapRowValuesToObject_(headers, data[i]);
			var nextTask = {
				id: String(existingTask.id || id).trim(),
				user_id: String(payload.user_id || existingTask.user_id || '').trim(),
				task_name: String(payload.title || payload.task_name || existingTask.task_name || '').trim(),
				due_date: String(payload.due_date || existingTask.due_date || '').trim(),
				status: String(payload.status || existingTask.status || 'Pending').trim(),
				description: String(payload.description || existingTask.description || '').trim(),
				assigned_by: String(payload.assigned_by || existingTask.assigned_by || '').trim(),
				checklist: JSON.stringify(nextChecklist || parseActivityJsonArray_(existingTask.checklist)),
				attachments: JSON.stringify(nextAttachments || parseActivityJsonArray_(existingTask.attachments)),
				priority: String(payload.priority || existingTask.priority || 'medium').trim(),
				owner_email: String(payload.owner_email || existingTask.owner_email || existingTask.email || '').trim(),
				created_at: String(existingTask.created_at || payload.created_at || isoNow_()).trim(),
				created_by: String(existingTask.created_by || payload.created_by || '').trim(),
				updated_at: isoNow_(),
				updated_by: String(payload.updated_by || existingTask.updated_by || '').trim()
			};

			updateObjectRow_(sheet, i + 1, nextTask);

			return {
				ok: true,
				message: 'Task updated.',
				task: {
					id: nextTask.id,
					user_id: nextTask.user_id,
					task_name: nextTask.task_name,
					due_date: nextTask.due_date,
					status: nextTask.status,
					description: nextTask.description,
					assigned_by: nextTask.assigned_by,
					checklist: parseActivityJsonArray_(nextTask.checklist),
					attachments: parseActivityJsonArray_(nextTask.attachments),
					priority: nextTask.priority,
					owner_email: nextTask.owner_email,
					created_at: nextTask.created_at,
					created_by: nextTask.created_by,
					updated_at: nextTask.updated_at,
					updated_by: nextTask.updated_by
				}
			};
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
		attachments: JSON.stringify(payload.attachments || []),
		checklist: JSON.stringify(payload.dailyChecklist || []),
		priority: String(payload.priority || 'medium').trim(),
		owner_email: ownerEmail,
		created_at: createdAt,
		created_by: createdBy,
		updated_at: createdAt,
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
			checklist: payload.dailyChecklist || [],
			attachments: payload.attachments || [],
			priority: rowObject.priority,
			owner_email: rowObject.owner_email,
			created_at: rowObject.created_at,
			created_by: rowObject.created_by,
			updated_at: rowObject.updated_at,
			updated_by: rowObject.updated_by
		}
	};
}
