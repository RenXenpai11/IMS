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
	];
	sheet.appendRow(row);
	return { ok: true, task_id: uniqueKey };
}

var WORKLOG_ATTACHMENTS_SHEET_ = 'worklogs_attachment';
var WORKLOG_ATTACHMENTS_HEADERS_ = ['attachment_id', 'task_id', 'user_id', 'file_type', 'file_size', 'link', 'uploaded_at', 'uploaded_by'];

function addWorklogAttachment(payload) {
	try {
		var taskId = String(payload.task_id || '').trim();
		var userId = String(payload.user_id || '').trim();
		var fileType = String(payload.file_type || '').trim();
		var fileSize = String(payload.file_size || '').trim();
		var uploadedAt = String(payload.uploaded_at || new Date().toISOString()).trim();
		var uploadedBy = String(payload.uploaded_by || '').trim();
		var fileName = String(payload.file_name || 'upload').trim();

		if (!fileType && !fileSize && fileName === 'upload') {
			return { ok: true, skipped: true };
		}

		if (!taskId || !userId) {
			return { ok: false, error: 'task_id and user_id are required.' };
		}

		var attachmentId = String(payload.attachment_id || '').trim();
		if (!attachmentId) {
			var sheet = getOrCreateSheetWithHeaders_(WORKLOG_ATTACHMENTS_SHEET_, WORKLOG_ATTACHMENTS_HEADERS_);
			var rowCount = sheet.getLastRow();
			var nextNumber = rowCount; // Row 1 is header, so row 2 = WLA_0001
			var paddedNumber = String(nextNumber).padStart(4, '0');
			attachmentId = 'WLA_' + paddedNumber;
		} else {
			var sheet = getOrCreateSheetWithHeaders_(WORKLOG_ATTACHMENTS_SHEET_, WORKLOG_ATTACHMENTS_HEADERS_);
		}
		sheet.appendRow([
			attachmentId,
			taskId,
			userId,
			fileType,
			fileSize,
			'',
			uploadedAt,
			uploadedBy
		]);

		return {
			ok: true,
			attachment: {
				attachment_id: attachmentId,
				task_id: taskId,
				user_id: userId,
				file_type: fileType,
				file_size: fileSize,
				file_name: fileName,
				uploaded_at: uploadedAt,
				uploaded_by: uploadedBy
			}
		};
	} catch (err) {
		return { ok: false, error: err.message || String(err) };
	}
}

function getActivityWorklogs(payload) {
	var filter = payload || {};
	var sheet = getSheet_('activity_worklogs');
	var rows = readSheetObjects_(sheet);
	var requestedUserId = String(filter.user_id || '').trim();

	var worklogsMap = {};
	var worklogs = rows
		.filter(function (row) {
			if (requestedUserId) {
				return String(row.user_id || '').trim() === requestedUserId;
			}
			return true;
		})
		.map(function (row) {
			var taskId = String(row.task_id || row.id || '').trim();
			var worklog = {
				task_id: taskId,
				user_id: String(row.user_id || '').trim(),
				task: String(row.task || '').trim(),
				notes: String(row.notes || '').trim(),
				learnings: String(row.learnings || '').trim(),
				date: String(row.date || '').trim(),
				created_at: String(row.created_at || '').trim(),
				created_by: String(row.created_by || '').trim(),
				updated_by: String(row.updated_by || '').trim(),
				attachments: []
			};
			worklogsMap[taskId] = worklog;
			return worklog;
		});

	try {
		var attachmentSheet = getSheet_('worklogs_attachment');
		var attachmentRows = readSheetObjects_(attachmentSheet);
		for (var i = 0; i < attachmentRows.length; i++) {
			var attachRow = attachmentRows[i];
			var attachTaskId = String(attachRow.task_id || '').trim();
			if (worklogsMap[attachTaskId]) {
				var attachmentId = String(attachRow.attachment_id || '').trim();
				var fileType = String(attachRow.file_type || '').trim();
				var fileSize = String(attachRow.file_size || '').trim();
				
				// Check if attachment already exists to avoid duplicates
				var alreadyExists = worklogsMap[attachTaskId].attachments.some(function(att) {
					return String(att.attachment_id || '').trim() === attachmentId;
				});
				
				// Also check by file_type and file_size combination
				if (!alreadyExists) {
					alreadyExists = worklogsMap[attachTaskId].attachments.some(function(att) {
						return String(att.file_type || '').trim() === fileType && 
							   String(att.file_size || '').trim() === fileSize;
					});
				}
				
				if (!alreadyExists) {
					worklogsMap[attachTaskId].attachments.push({
						attachment_id: attachmentId,
						file_type: fileType,
						file_size: fileSize,
						uploaded_at: String(attachRow.uploaded_at || '').trim()
					});
				}
			}
		}
	} catch (err) {
		// If sheet doesn't exist, just skip attachments
	}

	worklogs.sort(function (left, right) {
		var rightTime = new Date(right.created_at || right.date || 0).getTime() || 0;
		var leftTime = new Date(left.created_at || left.date || 0).getTime() || 0;
		return rightTime - leftTime;
	});

	return { ok: true, worklogs: worklogs };
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
	try {
		var sheet = getOrCreateSheetWithHeaders_('recent_activities', ['id', 'user', 'message', 'timestamp']);
		var now = new Date();
		var id = 'ACT-' + now.getTime();
		var row = [
			id,
			activity.user || '',
			activity.message || '',
			activity.timestamp || now.toISOString()
		];
		sheet.appendRow(row);
		// Clean up old activities to keep sheet manageable (keep last 100)
		cleanupOldActivities_(100);
		return { ok: true, id: id };
	} catch (err) {
		return { ok: false, error: err.message || String(err) };
	}
}

// Get recent activities (latest 20)
function getRecentActivities() {
	try {
		var sheet = getOrCreateSheetWithHeaders_('recent_activities', ['id', 'user', 'message', 'timestamp']);
		var rows = readSheetObjects_(sheet);
		var activities = [];
		
		// Return in reverse order (newest first)
		for (var i = rows.length - 1; i >= 0 && activities.length < 20; i--) {
			activities.push({
				id: String(rows[i].id || '').trim(),
				user: String(rows[i].user || '').trim(),
				message: String(rows[i].message || '').trim(),
				timestamp: String(rows[i].timestamp || '').trim()
			});
		}
		
		return activities;
	} catch (err) {
		return [];
	}
}

// Clean up old activities - keep only the latest 100
function cleanupOldActivities_(maxActivities) {
	try {
		maxActivities = maxActivities || 100;
		var sheet = getOrCreateSheetWithHeaders_('recent_activities', ['id', 'user', 'message', 'timestamp']);
		var rows = readSheetObjects_(sheet);
		
		// If we have more than maxActivities, delete the oldest ones
		if (rows.length > maxActivities) {
			var rowsToDelete = rows.length - maxActivities;
			// Delete from the beginning (oldest records are at the top after header)
			sheet.deleteRows(2, rowsToDelete);
		}
	} catch (err) {
		// Silently fail - cleanup is not critical
	}
}

function getActivityTasks(payload) {
	var filter = payload || {};
	var sheet = getSheet_('activity_logs');
	var rows = readSheetObjects_(sheet);
	var requestedUserId = String(filter.user_id || '').trim();
	var requestedEmail = String(filter.email || '').trim().toLowerCase();
	
	var tasksMap = {};
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
			var taskId = String(row.id || '').trim();
			var task = {
				id: taskId,
				user_id: String(row.user_id || '').trim(),
				task_name: String(row.task_name || row.title || '').trim(),
				due_date: String(row.due_date || '').trim(),
				status: String(row.status || 'Pending').trim(),
				description: String(row.description || '').trim(),
				assigned_by: String(row.assigned_by || '').trim(),
				checklist: parseActivityJsonArray_(row.checklist),
				attachments: parseActivityJsonArray_(row.attachments) || [],
				priority: String(row.priority || 'medium').trim(),
				created_at: String(row.created_at || '').trim(),
				created_by: String(row.created_by || '').trim(),
				updated_at: String(row.updated_at || '').trim(),
				updated_by: String(row.updated_by || '').trim()
			};
			tasksMap[taskId] = task;
			return task;
		});

	tasks.sort(function(left, right) {
		var rightTime = new Date(right.created_at || 0).getTime() || 0;
		var leftTime = new Date(left.created_at || 0).getTime() || 0;
		return rightTime - leftTime;
	});

	return {
		ok: true,
		tasks: tasks
	};
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

	var activityId = String(payload.id || payload.activity_id || '').trim();
	if (!activityId) {
		var lastId = 0;
		for (var i = 1; i < sheet.getLastRow(); i++) {
			var val = String(sheet.getRange(i + 1, 1).getValue() || '');
			if (/^ACT_\d+$/.test(val)) {
				var num = parseInt(val.replace('ACT_', ''), 10);
				if (!isNaN(num) && num > lastId) lastId = num;
			}
		}
		activityId = 'ACT_' + String(lastId + 1).padStart(4, '0');
	}

	var rowObject = {
		id: activityId,
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
