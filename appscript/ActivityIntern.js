function createActivityTask(payload) {
	return handleCreateActivityTask_(payload || {});
}

function handleCreateActivityTask_(payload) {
	var sheet = getSheet_('activity_logs');
	var taskName = String(payload.title || payload.task_name || '').trim();

	if (!taskName) {
		return { ok: false, error: 'title is required.' };
	}

	var owner = String(payload.owner || payload.assigned_by || '').trim();
	var dueDate = String(payload.due_date || '').trim();
	var createdAt = String(payload.created_at || isoNow_());
	var createdBy = String(payload.created_by || payload.createdBy || owner).trim();
	var updatedBy = String(payload.updated_by || payload.updatedBy || createdBy).trim();

	var rowObject = {
		id: String(payload.id || payload.activity_id || createId_('ACT')),
		user_id: String(payload.user_id || '').trim(),
		full_name: String(payload.full_name || owner || '').trim(),
		role: String(payload.role || '').trim(),
		task_name: taskName,
		action_type: String(payload.action_type || 'create_task').trim(),
		due_date: dueDate,
		status: String(payload.status || 'Pending').trim(),
		description: String(payload.description || '').trim(),
		assigned_by: String(payload.assigned_by || owner || '').trim(),
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
			full_name: rowObject.full_name,
			role: rowObject.role,
			title: rowObject.task_name,
			task_name: rowObject.task_name,
			action_type: rowObject.action_type,
			due_date: rowObject.due_date,
			status: rowObject.status,
			description: rowObject.description,
			assigned_by: rowObject.assigned_by,
			owner: rowObject.assigned_by,
			priority: String(payload.priority || 'medium').trim(),
			attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
			daily_checklist: Array.isArray(payload.dailyChecklist)
				? payload.dailyChecklist.map(function (item) {
						return {
							label: String((item && item.label) || '').trim(),
							done: !!(item && item.done)
						};
					}).filter(function (item) {
						return item.label;
					})
				: [],
			created_at: rowObject.created_at,
			created_by: rowObject.created_by,
			updated_by: rowObject.updated_by
		}
	};
}
