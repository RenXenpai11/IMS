// Apps Script: Supervisor helper endpoints

// Return a list of all non-supervisor users (students) with minimal fields
function getAllStudents() {
  try {
    var usersSheet = getSheet_('users');
    var users = readSheetObjects_(usersSheet);
    var students = [];
    for (var i = 0; i < users.length; i++) {
      var u = users[i] || {};
      var role = String(u.role || '').trim().toLowerCase();
      if (role === 'supervisor') continue;
      students.push({
        user_id: String(u.user_id || '').trim(),
        full_name: String(u.full_name || '').trim(),
        email: String(u.email || '').trim()
      });
    }
    students.sort(function(a, b) {
      return String(a.full_name || '').localeCompare(String(b.full_name || ''));
    });
    return { ok: true, students: students };
  } catch (err) {
    return { ok: false, error: err && err.message ? String(err.message) : String(err) };
  }
}

// Create tasks assigned to one or more students by supervisor
function createSupervisorTasks(payload) {
  try {
    var title = String(payload.title || '').trim();
    var description = String(payload.description || '').trim();
    var dueDate = String(payload.due_date || '').trim();
    var supervisorId = String(payload.supervisor_user_id || '').trim();
    var assignees = Array.isArray(payload.assigned_student_ids) ? payload.assigned_student_ids : [];

    if (!supervisorId) return { ok: false, error: 'supervisor_user_id is required.' };
    if (!title) return { ok: false, error: 'title is required.' };
    if (!assignees.length) return { ok: false, error: 'At least one assigned_student_id is required.' };

    var sheet = getSheet_('tasks');
    var now = isoNow_();
    var created = 0;

    for (var i = 0; i < assignees.length; i++) {
      var userId = String(assignees[i] || '').trim();
      if (!userId) continue;
      var rowObj = {
        id: createId_('TSK'),
        user_id: userId,
        task_name: title,
        due_date: dueDate,
        status: 'Pending',
        description: description,
        assigned_by: supervisorId,
        created_at: now,
        created_by: supervisorId,
        updated_at: now,
        updated_by: supervisorId
      };
      appendObjectRow_(sheet, rowObj);
      created += 1;
    }

    return { ok: true, created_count: created };
  } catch (err) {
    return { ok: false, error: err && err.message ? String(err.message) : String(err) };
  }
}
