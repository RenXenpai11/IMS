<script>
  import {
    AlertCircle,
    CheckCircle2,
    Clock,
    Clock3,
    MoreHorizontal,
    List,
    Plus,
    Search,
    LayoutGrid,
  } from 'lucide-svelte';

  const summaryCards = [
    {
      label: 'Pending',
      value: 2,
      icon: Clock,
      tone: 'amber',
    },
    {
      label: 'Total Tasks',
      value: 6,
      icon: Clock3,
      tone: 'blue',
    },
    {
      label: 'Completed',
      value: 2,
      icon: CheckCircle2,
      tone: 'green',
    },
    {
      label: 'Overdue',
      value: 1,
      icon: AlertCircle,
      tone: 'red',
    },
  ];

  let assignedTasks = [
    {
      title: 'API Integration Testing',
      status: 'In Progress',
      dueDate: 'Apr 5, 2026',
      owner: 'John Rivera',
      priority: 'high',
      description: 'Test all RESTful endpoints for the new customer portal API and document findings.',
      attachments: 2,
      dailyChecklist: [
        { label: 'Validate auth and token refresh flow', done: true },
        { label: 'Run negative tests for payload validation', done: false },
        { label: 'Update API test report notes', done: false },
      ],
    },
    {
      title: 'Write Unit Tests for Auth Module',
      status: 'Pending',
      dueDate: 'Apr 8, 2026',
      owner: 'Sarah Chen',
      priority: 'medium',
      description: 'Add core unit tests for login, refresh token, and logout handlers.',
      attachments: 1,
      dailyChecklist: [
        { label: 'Cover successful login path', done: false },
        { label: 'Cover invalid credential path', done: false },
        { label: 'Add tests for refresh token expiry', done: false },
      ],
    },
    {
      title: 'Code Review - PR #47',
      status: 'Completed',
      dueDate: 'Apr 1, 2026',
      owner: 'John Rivera',
      priority: 'high',
      description: 'Review pull request quality, edge cases, and performance implications.',
      attachments: 0,
      dailyChecklist: [
        { label: 'Reviewed logic and comments', done: true },
        { label: 'Requested final changes', done: true },
      ],
    },
    {
      title: 'Update Technical Documentation',
      status: 'Pending',
      dueDate: 'Apr 12, 2026',
      owner: 'Maria Santos',
      priority: 'low',
      description: 'Refresh setup guide and endpoint references for the current sprint.',
      attachments: 1,
      dailyChecklist: [
        { label: 'Update API endpoint table', done: false },
        { label: 'Revise onboarding quickstart', done: false },
      ],
    },
    {
      title: 'Security Audit Report',
      status: 'Overdue',
      dueDate: 'Mar 30, 2026',
      owner: 'John Rivera',
      priority: 'high',
      description: 'Summarize vulnerability checks and mitigation recommendations.',
      attachments: 3,
      dailyChecklist: [
        { label: 'Confirm open issues and risk level', done: true },
        { label: 'Finalize mitigation plan section', done: false },
        { label: 'Share report draft to team lead', done: false },
      ],
    },
    {
      title: 'UI Component Library Setup',
      status: 'Completed',
      dueDate: 'Mar 28, 2026',
      owner: 'Sarah Chen',
      priority: 'medium',
      description: 'Set up shared UI components and documentation examples.',
      attachments: 2,
      dailyChecklist: [
        { label: 'Published initial component package', done: true },
        { label: 'Added usage examples', done: true },
      ],
    },
  ];

  let archivedTasks = [];

  const statusClassMap = {
    Pending: 'status-pending',
    'In Progress': 'status-progress',
    Completed: 'status-completed',
    Overdue: 'status-overdue',
  };

  const statusOptions = ['All Status', 'Pending', 'In Progress', 'Overdue', 'Completed'];
  const editStatusOptions = ['Pending', 'In Progress', 'Overdue', 'Completed'];
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH_MAP = {
    Jan: '01',
    Feb: '02',
    Mar: '03',
    Apr: '04',
    May: '05',
    Jun: '06',
    Jul: '07',
    Aug: '08',
    Sep: '09',
    Oct: '10',
    Nov: '11',
    Dec: '12',
  };

  let searchQuery = '';
  let statusFilter = 'All Status';
  let activeView = 'Overview';
  let selectedOverviewTaskTitle = '';
  let trackerMenuOpen = false;
  let isEditingTrackerTask = false;
  let trackerEditForm = {
    title: '',
    status: 'Pending',
    dueDate: '',
    description: '',
    dailyChecklist: [],
  };

  function matchesStatus(task, filter) {
    if (filter === 'All Status') {
      return true;
    }

    return task.status === filter;
  }

  function matchesSearch(task, query) {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return true;
    }

    return [task.title, task.status, task.dueDate, task.owner].some((value) =>
      value.toLowerCase().includes(normalized)
    );
  }

  function formatDueDate(dateText) {
    const parts = dateText.replace(',', '').split(' ');

    if (parts.length !== 3) {
      return dateText;
    }

    const [monthText, dayText, yearText] = parts;
    const month = MONTH_MAP[monthText];

    if (!month) {
      return dateText;
    }

    const day = dayText.padStart(2, '0');
    return `${day}-${month}-${yearText}`;
  }

  function parseDueDate(dateText) {
    const parts = dateText.replace(',', '').split(' ');

    if (parts.length !== 3) {
      return null;
    }

    const [monthText, dayText, yearText] = parts;
    const month = MONTH_MAP[monthText];

    if (!month) {
      return null;
    }

    return new Date(`${yearText}-${month}-${dayText.padStart(2, '0')}T00:00:00`);
  }

  function toInputDate(dateText) {
    const parsed = parseDueDate(dateText);

    if (!parsed) {
      return '';
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function fromInputDate(inputDate) {
    if (!inputDate) {
      return '';
    }

    const [year, month, day] = inputDate.split('-');
    const monthIndex = Number(month) - 1;

    if (monthIndex < 0 || monthIndex > 11) {
      return '';
    }

    return `${MONTH_NAMES[monthIndex]} ${Number(day)}, ${year}`;
  }

  function openListWithFilter(filter) {
    statusFilter = filter;
    activeView = 'List';
  }

  function openArchiveView() {
    activeView = 'Archive';
  }

  function selectOverviewTask(task) {
    selectedOverviewTaskTitle = task.title;
    trackerMenuOpen = false;
    isEditingTrackerTask = false;
  }

  function toggleTrackerMenu() {
    trackerMenuOpen = !trackerMenuOpen;
  }

  function openTrackerEdit() {
    if (!selectedOverviewTask) {
      return;
    }

    trackerEditForm = {
      title: selectedOverviewTask.title,
      status: selectedOverviewTask.status,
      dueDate: toInputDate(selectedOverviewTask.dueDate),
      description: selectedOverviewTask.description,
      dailyChecklist: selectedOverviewTask.dailyChecklist.map((item) => ({ ...item })),
    };
    isEditingTrackerTask = true;
    trackerMenuOpen = false;
  }

  function cancelTrackerEdit() {
    isEditingTrackerTask = false;
  }

  function saveTrackerEdit() {
    if (!selectedOverviewTask) {
      return;
    }

    const originalTitle = selectedOverviewTask.title;
    const nextTitle = trackerEditForm.title.trim() || originalTitle;
    const nextTask = {
      ...selectedOverviewTask,
      title: nextTitle,
      status: trackerEditForm.status,
      dueDate: fromInputDate(trackerEditForm.dueDate) || selectedOverviewTask.dueDate,
      description: trackerEditForm.description.trim() || selectedOverviewTask.description,
      dailyChecklist: trackerEditForm.dailyChecklist
        .filter((item) => item.label.trim())
        .map((item) => ({ label: item.label.trim(), done: !!item.done })),
    };

    assignedTasks = assignedTasks.map((task) => (task.title === originalTitle ? nextTask : task));
    selectedOverviewTaskTitle = nextTitle;
    isEditingTrackerTask = false;
  }

  function archiveTask(targetTitle) {
    const taskToArchive = assignedTasks.find((task) => task.title === targetTitle);

    if (!taskToArchive) {
      return;
    }

    archivedTasks = [taskToArchive, ...archivedTasks.filter((task) => task.title !== targetTitle)];
    assignedTasks = assignedTasks.filter((task) => task.title !== targetTitle);

    if (selectedOverviewTaskTitle === targetTitle) {
      selectedOverviewTaskTitle = '';
    }
  }

  function restoreArchivedTask(targetTitle) {
    const taskToRestore = archivedTasks.find((task) => task.title === targetTitle);

    if (!taskToRestore) {
      return;
    }

    assignedTasks = [taskToRestore, ...assignedTasks.filter((task) => task.title !== targetTitle)];
    archivedTasks = archivedTasks.filter((task) => task.title !== targetTitle);
  }

  function handleTrackerAction(action) {
    if (action === 'edit') {
      openTrackerEdit();
      return;
    }

    if (!selectedOverviewTask) {
      trackerMenuOpen = false;
      return;
    }

    const targetTitle = selectedOverviewTask.title;

    if (action === 'delete') {
      assignedTasks = assignedTasks.filter((task) => task.title !== targetTitle);
      selectedOverviewTaskTitle = '';
      isEditingTrackerTask = false;
    }

    if (action === 'archive') {
      archiveTask(targetTitle);
    }

    trackerMenuOpen = false;
  }

  function toggleTrackerChecklistItem(index) {
    if (!selectedOverviewTask) {
      return;
    }

    assignedTasks = assignedTasks.map((task) => {
      if (task.title !== selectedOverviewTask.title) {
        return task;
      }

      return {
        ...task,
        dailyChecklist: task.dailyChecklist.map((item, itemIndex) =>
          itemIndex === index ? { ...item, done: !item.done } : item
        ),
      };
    });
  }

  function addChecklistItem() {
    trackerEditForm = {
      ...trackerEditForm,
      dailyChecklist: [...trackerEditForm.dailyChecklist, { label: '', done: false }],
    };
  }

  function updateChecklistItem(index, field, value) {
    trackerEditForm = {
      ...trackerEditForm,
      dailyChecklist: trackerEditForm.dailyChecklist.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    };
  }

  function removeChecklistItem(index) {
    trackerEditForm = {
      ...trackerEditForm,
      dailyChecklist: trackerEditForm.dailyChecklist.filter((_, itemIndex) => itemIndex !== index),
    };
  }

  $: filteredTasks = assignedTasks.filter(
    (task) => matchesStatus(task, statusFilter) && matchesSearch(task, searchQuery)
  );

  $: filteredArchivedTasks = archivedTasks.filter(
    (task) => matchesStatus(task, statusFilter) && matchesSearch(task, searchQuery)
  );

  $: completedCount = assignedTasks.filter((task) => task.status === 'Completed').length;
  $: completionRate = Math.round((completedCount / assignedTasks.length) * 100);
  $: overdueTasks = assignedTasks.filter((task) => task.status === 'Overdue').slice(0, 3);
  $: dueSoonTasks = [...assignedTasks]
    .filter((task) => task.status !== 'Completed')
    .sort((a, b) => {
      const aDate = parseDueDate(a.dueDate);
      const bDate = parseDueDate(b.dueDate);
      const aTime = aDate ? aDate.getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = bDate ? bDate.getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, 4);
  $: selectedOverviewTask =
    assignedTasks.find((task) => task.title === selectedOverviewTaskTitle) ||
    overdueTasks[0] ||
    dueSoonTasks[0] ||
    null;

</script>

<section class="documents-page">
  <div class="stats-grid">
    {#each summaryCards as card}
      <article class="stat-card">
        <div class={`stat-icon tone-${card.tone}`}>
          <svelte:component this={card.icon} size={17} />
        </div>
        <div>
          <p class="stat-value">{card.value}</p>
          <p class="stat-label">{card.label}</p>
        </div>
      </article>
    {/each}
  </div>

  <div class="controls-bar">
    <div class="view-toggle" role="tablist" aria-label="View mode">
      <button
        type="button"
        role="tab"
        class:active={activeView === 'Overview'}
        aria-selected={activeView === 'Overview'}
        on:click={() => (activeView = 'Overview')}
      >
        <LayoutGrid size={14} />
        <span>Overview</span>
      </button>
      <button
        type="button"
        role="tab"
        class:active={activeView === 'List'}
        aria-selected={activeView === 'List'}
        on:click={() => (activeView = 'List')}
      >
        <List size={14} />
        <span>List</span>
      </button>
      <button
        type="button"
        role="tab"
        class:active={activeView === 'Archive'}
        aria-selected={activeView === 'Archive'}
        on:click={openArchiveView}
      >
        <Clock size={14} />
        <span>Archive</span>
      </button>
    </div>

    <div class="controls-right">
      <label class="search-control" aria-label="Search tasks">
        <Search size={15} />
        <input
          type="text"
          placeholder="Search"
          bind:value={searchQuery}
        />
      </label>

      <label class="status-control" aria-label="Status filter">
        <select bind:value={statusFilter}>
          {#each statusOptions as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </label>

      <button class="new-task-btn" type="button">
        <Plus size={15} />
        <span>Add Task</span>
      </button>
    </div>
  </div>

  <div class="documents-grid">
    <section class="panel tasks-panel">
      <header class="panel-header tasks-header">
        <h3>My Tasks</h3>
        {#if activeView === 'List' || activeView === 'Archive'}
          <div class="tasks-header-columns" aria-hidden="true">
            <span>Status</span>
            <span>{activeView === 'Archive' ? 'Restore' : 'Attachment'}</span>
            <span>Due Date</span>
          </div>
        {/if}
      </header>

      {#if activeView === 'Overview'}
        <div class="overview-shell">
          <div class="overview-panels">
            <section class="overview-panel">
              <h4>Urgent Tasks</h4>
              {#if overdueTasks.length === 0}
                <p class="overview-empty-copy">No overdue tasks.</p>
              {:else}
                <ul>
                  {#each overdueTasks as task}
                    <li>
                      <button
                        type="button"
                        class:active={selectedOverviewTask?.title === task.title}
                        class="overview-task-link"
                        on:click={() => selectOverviewTask(task)}
                      >
                        <span>{task.title}</span>
                        <small>{formatDueDate(task.dueDate)}</small>
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </section>

            <section class="overview-panel">
              <h4>Due Soon</h4>
              {#if dueSoonTasks.length === 0}
                <p class="overview-empty-copy">No upcoming due dates.</p>
              {:else}
                <ul>
                  {#each dueSoonTasks as task}
                    <li>
                      <button
                        type="button"
                        class:active={selectedOverviewTask?.title === task.title}
                        class="overview-task-link"
                        on:click={() => selectOverviewTask(task)}
                      >
                        <span>{task.title}</span>
                        <small>{formatDueDate(task.dueDate)}</small>
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </section>

            <section class="overview-panel completion-panel">
              <h4>Completion Rate</h4>
              <p class="completion-value">{completionRate}%</p>
              <button type="button" class="overview-link" on:click={() => openListWithFilter('All Status')}>
                View all tasks
              </button>
            </section>
          </div>

          {#if selectedOverviewTask}
            <section class="overview-tracker">
              <div class="overview-tracker-head">
                <h4>Daily Task Tracker</h4>
                <div class="tracker-head-actions">
                  <span class={`status-pill ${statusClassMap[selectedOverviewTask.status]}`}>
                    {selectedOverviewTask.status}
                  </span>
                  <button
                    type="button"
                    class="tracker-menu-trigger"
                    aria-label="Tracker task actions"
                    aria-expanded={trackerMenuOpen}
                    on:click={toggleTrackerMenu}
                  >
                    <MoreHorizontal size={14} />
                  </button>

                  {#if trackerMenuOpen}
                    <div class="tracker-menu">
                      <button type="button" on:click={() => handleTrackerAction('edit')}>Edit Task</button>
                      <button type="button" on:click={() => handleTrackerAction('delete')} class="danger">
                        Delete Task
                      </button>
                      <button type="button" on:click={() => handleTrackerAction('archive')}>Archive Task</button>
                    </div>
                  {/if}
                </div>
              </div>

              {#if isEditingTrackerTask}
                <div class="tracker-form">
                  <label>
                    <span>Task Title</span>
                    <input type="text" bind:value={trackerEditForm.title} />
                  </label>

                  <div class="tracker-form-grid">
                    <label>
                      <span>Status</span>
                      <select bind:value={trackerEditForm.status}>
                        {#each editStatusOptions as option}
                          <option value={option}>{option}</option>
                        {/each}
                      </select>
                    </label>

                    <label>
                      <span>Due Date</span>
                      <input type="date" bind:value={trackerEditForm.dueDate} />
                    </label>
                  </div>

                  <label>
                    <span>Description</span>
                    <textarea rows="3" bind:value={trackerEditForm.description}></textarea>
                  </label>

                  <div class="tracker-checklist-editor">
                    <div class="tracker-checklist-editor-head">
                      <span>Checklist</span>
                      <button type="button" on:click={addChecklistItem}>+ Add item</button>
                    </div>

                    {#each trackerEditForm.dailyChecklist as item, index}
                      <div class="tracker-checklist-editor-row">
                        <input
                          type="checkbox"
                          checked={item.done}
                          on:change={() => updateChecklistItem(index, 'done', !item.done)}
                        />
                        <input
                          type="text"
                          value={item.label}
                          on:input={(event) => updateChecklistItem(index, 'label', event.currentTarget.value)}
                          placeholder="Checklist item"
                        />
                        <button type="button" class="remove-item" on:click={() => removeChecklistItem(index)}>
                          Remove
                        </button>
                      </div>
                    {/each}
                  </div>

                  <div class="tracker-form-actions">
                    <button type="button" class="secondary" on:click={cancelTrackerEdit}>Cancel</button>
                    <button type="button" class="primary" on:click={saveTrackerEdit}>Save</button>
                  </div>
                </div>
              {:else}
                <p class="tracker-title">{selectedOverviewTask.title}</p>
                <p class="tracker-meta">
                  Due {formatDueDate(selectedOverviewTask.dueDate)}
                </p>
                <p class="tracker-description">{selectedOverviewTask.description}</p>

                <ul class="tracker-checklist">
                  {#each selectedOverviewTask.dailyChecklist as item}
                    <li>
                      <input
                        type="checkbox"
                        checked={item.done}
                        disabled
                      />
                      <span>{item.label}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </section>
          {/if}
        </div>
      {:else if activeView === 'List'}
        <div class="task-list" role="table" aria-label="Assigned tasks list">
          {#if filteredTasks.length === 0}
            <p class="empty-state">No tasks found for current filter.</p>
          {:else}
            {#each filteredTasks as task}
              <div class="task-row" role="row">
                <span role="cell" class="task-name">{task.title}</span>
                <span role="cell" class={`status-pill ${statusClassMap[task.status]}`}>{task.status}</span>
                <button role="cell" type="button" class="attachment-btn">Add Attachment</button>
                <span role="cell" class="task-due">{formatDueDate(task.dueDate)}</span>
              </div>
            {/each}
          {/if}
        </div>
      {:else}
        <div class="task-list" role="table" aria-label="Archived tasks list">
          {#if filteredArchivedTasks.length === 0}
            <p class="empty-state">No archived tasks yet.</p>
          {:else}
            {#each filteredArchivedTasks as task}
              <div class="task-row archived-row" role="row">
                <span role="cell" class="task-name">{task.title}</span>
                <span role="cell" class={`status-pill ${statusClassMap[task.status]}`}>{task.status}</span>
                <button role="cell" type="button" class="attachment-btn" on:click={() => restoreArchivedTask(task.title)}>
                  Restore
                </button>
                <span role="cell" class="task-due">{formatDueDate(task.dueDate)}</span>
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    </section>
  </div>
</section>

<style>
  .documents-page {
    display: grid;
    gap: 1rem;
  }

  .stats-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .stat-card,
  .panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 1rem;
    box-shadow: 0 12px 24px -24px rgba(15, 23, 42, 0.3);
  }

  .stat-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.1rem;
  }

  .stat-icon,
  .file-icon,
  .upload-icon-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.75rem;
  }

  .stat-icon {
    width: 2.2rem;
    height: 2.2rem;
    border: 1px solid transparent;
  }

  .stat-value {
    margin: 0;
    color: var(--color-heading);
    font-size: 1.6rem;
    font-weight: 700;
    line-height: 1;
  }

  .stat-label {
    margin: 0.15rem 0 0;
    color: var(--color-sidebar-text);
    font-size: 0.86rem;
  }

  .documents-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: 1fr;
  }

  .controls-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    flex-wrap: wrap;
  }

  .controls-right {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    margin-left: auto;
  }

  .search-control,
  .status-control select,
  .new-task-btn,
  .view-toggle button {
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: 0.7rem;
    min-height: 2.25rem;
  }

  .search-control {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0 0.7rem;
    color: #8a94a7;
  }

  .search-control input {
    border: 0;
    background: transparent;
    color: var(--color-heading);
    font-size: 0.85rem;
    width: 12rem;
    outline: none;
  }

  .status-control {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .status-control::after {
    content: '';
    position: absolute;
    right: 0.75rem;
    width: 0.42rem;
    height: 0.42rem;
    border-right: 1.8px solid #6b7280;
    border-bottom: 1.8px solid #6b7280;
    transform: rotate(45deg) translateY(-0.08rem);
    pointer-events: none;
  }

  .status-control select {
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    padding: 0 1.85rem 0 0.75rem;
    color: #4b5563;
    font-size: 0.84rem;
    cursor: pointer;
    outline: none;
  }

  .new-task-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0 0.75rem;
    color: #ffffff;
    background: #4f46e5;
    border-color: #4f46e5;
    font-size: 0.84rem;
    font-weight: 600;
    cursor: pointer;
  }

  .new-task-btn:hover {
    background: #4338ca;
    border-color: #4338ca;
  }

  .view-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .view-toggle button {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0 0.75rem;
    color: #6b7280;
    font-size: 0.84rem;
    cursor: pointer;
  }

  .view-toggle button.active {
    color: #4f46e5;
    border-color: #c7d2fe;
    background: #eef2ff;
  }

  .view-toggle button.active span {
    font-weight: 600;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1rem 0.9rem;
    border-bottom: 1px solid var(--color-border);
  }

  .panel-header h3 {
    margin: 0;
    color: #1f2937;
    font-size: 1rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .tasks-panel {
    overflow: hidden;
  }

  .tasks-header {
    border-bottom: 1px solid var(--color-border);
    padding-bottom: 0.9rem;
  }

  .tasks-header-columns {
    display: inline-grid;
    grid-template-columns: 8rem 7.5rem 8.75rem;
    align-items: center;
    gap: 1.1rem;
    margin-right: 0.8rem;
    color: #1f2937;
    font-size: 1rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .overview-shell {
    display: grid;
    gap: 1rem;
    padding: 1rem;
    background: #fafbff;
  }

  .overview-panels {
    display: grid;
    grid-template-columns: 1fr 1fr 0.8fr;
    gap: 0.85rem;
  }

  .overview-panel {
    border: 1px solid #dbe2f0;
    border-radius: 0.8rem;
    background: #ffffff;
    padding: 0.95rem;
    min-height: 10.25rem;
  }

  .overview-panel h4 {
    margin: 0;
    color: #0f172a;
    font-size: 1rem;
    font-weight: 650;
  }

  .overview-panel ul {
    margin: 0.75rem 0 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.55rem;
  }

  .overview-panel li {
    margin: 0;
  }

  .overview-task-link {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    font-size: 0.76rem;
    color: #334155;
    text-align: left;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    padding: 0.3rem 0.35rem;
    cursor: pointer;
    transition: background-color 120ms ease, border-color 120ms ease;
  }

  .overview-task-link:hover,
  .overview-task-link.active {
    background: #f8fafc;
    border-color: #dbe2f0;
  }

  .overview-panel li span {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .overview-panel li small {
    color: #64748b;
    font-size: 0.72rem;
  }

  .overview-empty-copy {
    margin: 0.7rem 0 0;
    color: #94a3b8;
    font-size: 0.76rem;
  }

  .completion-panel {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .overview-tracker {
    border: 1px solid #dbe2f0;
    border-radius: 0.8rem;
    background: #ffffff;
    padding: 0.95rem;
  }

  .overview-tracker-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }

  .tracker-head-actions {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .tracker-menu-trigger {
    width: 1.4rem;
    height: 1.4rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: 999px;
    color: #94a3b8;
    cursor: pointer;
  }

  .tracker-menu-trigger:hover {
    color: #64748b;
    background: #f8fafc;
    border-color: #dbe2f0;
  }

  .tracker-menu {
    position: absolute;
    top: calc(100% + 0.3rem);
    right: 0;
    min-width: 8rem;
    background: #ffffff;
    border: 1px solid #dbe2f0;
    border-radius: 0.6rem;
    box-shadow: 0 12px 24px -20px rgba(15, 23, 42, 0.35);
    padding: 0.25rem;
    z-index: 6;
  }

  .tracker-menu button {
    width: 100%;
    text-align: left;
    border-radius: 0.45rem;
    padding: 0.42rem 0.5rem;
    color: #475569;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .tracker-menu button:hover {
    background: #f8fafc;
  }

  .tracker-menu .danger {
    color: #dc2626;
  }

  .overview-tracker-head h4 {
    margin: 0;
    color: #0f172a;
    font-size: 1rem;
    font-weight: 650;
  }

  .tracker-title {
    margin: 0.65rem 0 0;
    color: #0f172a;
    font-size: 0.87rem;
    font-weight: 600;
  }

  .tracker-meta {
    margin: 0.35rem 0 0;
    color: #64748b;
    font-size: 0.83rem;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .tracker-description {
    margin: 0.55rem 0 0;
    color: #475569;
    font-size: 0.87rem;
    line-height: 1.45;
  }

  .tracker-checklist {
    list-style: none;
    padding: 0;
    margin: 0.85rem 0 0;
    display: grid;
    gap: 0.45rem;
  }

  .tracker-checklist li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #334155;
    font-size: 0.87rem;
  }

  .tracker-checklist input {
    width: 0.9rem;
    height: 0.9rem;
  }

  .tracker-checklist input:disabled {
    cursor: not-allowed;
    opacity: 0.8;
  }

  .tracker-form {
    display: grid;
    gap: 0.7rem;
    margin-top: 0.6rem;
  }

  .tracker-form label {
    display: grid;
    gap: 0.3rem;
  }

  .tracker-form label span {
    color: #64748b;
    font-size: 0.74rem;
    font-weight: 600;
  }

  .tracker-form input,
  .tracker-form select,
  .tracker-form textarea {
    border: 1px solid #dbe2f0;
    border-radius: 0.55rem;
    background: #ffffff;
    color: #1f2937;
    font-size: 0.82rem;
    padding: 0.45rem 0.55rem;
    outline: none;
  }

  .tracker-form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .tracker-form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.45rem;
  }

  .tracker-form-actions button {
    border-radius: 0.5rem;
    padding: 0.35rem 0.65rem;
    font-size: 0.76rem;
    font-weight: 600;
    cursor: pointer;
  }

  .tracker-form-actions .secondary {
    border: 1px solid #dbe2f0;
    background: #ffffff;
    color: #475569;
  }

  .tracker-form-actions .primary {
    border: 1px solid #4f46e5;
    background: #4f46e5;
    color: #ffffff;
  }

  .tracker-checklist-editor {
    display: grid;
    gap: 0.55rem;
  }

  .tracker-checklist-editor-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }

  .tracker-checklist-editor-head span {
    color: #64748b;
    font-size: 0.74rem;
    font-weight: 600;
  }

  .tracker-checklist-editor-head button,
  .remove-item {
    border: 1px solid #dbe2f0;
    background: #ffffff;
    color: #475569;
    border-radius: 0.45rem;
    padding: 0.32rem 0.5rem;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
  }

  .tracker-checklist-editor-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.45rem;
    align-items: center;
  }

  .tracker-checklist-editor-row input[type='text'] {
    width: 100%;
  }

  .completion-value {
    margin: 0.35rem 0 0;
    color: #4f46e5;
    font-size: 1.6rem;
    font-weight: 800;
  }

  .overview-link {
    border: 1px solid #dbe2f0;
    border-radius: 999px;
    background: #f8fafc;
    color: #475569;
    padding: 0.3rem 0.6rem;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    width: fit-content;
  }

  .task-list {
    display: grid;
    background: #fafbff;
  }

  .task-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 8rem 7.5rem 8.75rem;
    align-items: center;
    gap: 1.1rem;
    padding: 0.85rem 1.8rem 0.85rem 1rem;
  }

  .task-row {
    border-top: 1px solid var(--color-border);
  }

  .archived-row {
    background: #fcfcff;
  }

  .task-name {
    color: #1f2937;
    font-size: 0.87rem;
    font-weight: 600;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tasks-header-columns span:nth-child(1) {
    justify-self: center;
  }

  .tasks-header-columns span:nth-child(3) {
    justify-self: center;
  }

  .tasks-header-columns span:nth-child(2) {
    justify-self: center;
    margin-left: 0;
  }

  .task-due {
    justify-self: center;
    text-align: center;
    color: #6b7280;
    font-size: 0.83rem;
    font-weight: 500;
  }

  .attachment-btn {
    justify-self: center;
    margin-left: 0;
    border: 1px solid #dbe2f0;
    background: #f8fafc;
    color: #6b7280;
    border-radius: 999px;
    padding: 0.28rem 0.55rem;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .attachment-btn:hover {
    background: #eef2ff;
    border-color: #c7d2fe;
  }

  .attachment-btn:focus-visible,
  .view-toggle button:focus-visible,
  .search-control input:focus-visible,
  .status-control select:focus-visible {
    outline: 2px solid #a5b4fc;
    outline-offset: 2px;
  }

  .empty-state {
    margin: 0;
    padding: 1.2rem 1rem;
    color: #8b97ab;
    font-size: 0.85rem;
  }

  .status-pill {
    justify-self: center;
    text-align: center;
    padding: 0;
    font-size: 0.77rem;
    font-weight: 500;
    background: transparent;
    border: 0;
  }

  .status-progress {
    color: #2563eb;
  }

  .status-pending {
    color: #d97706;
  }

  .status-completed {
    color: #059669;
  }

  .status-overdue {
    color: #dc2626;
  }

  .tone-indigo {
    color: #4f46e5;
    background: #eef2ff;
    border-color: #e0e7ff;
  }

  .tone-blue {
    color: #2563eb;
    background: #eff6ff;
    border-color: #dbeafe;
  }

  .tone-green {
    color: #059669;
    background: #ecfdf5;
    border-color: #a7f3d0;
  }

  .tone-red {
    color: #ef4444;
    background: #fef2f2;
    border-color: #fecaca;
  }

  .tone-amber {
    color: #d97706;
    background: #fffbeb;
    border-color: #fde68a;
  }

  .tone-violet {
    color: #7c3aed;
    background: #f5f3ff;
    border-color: #ddd6fe;
  }

  @media (max-width: 1200px) {
    .stats-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

  }

  @media (max-width: 720px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }

    .panel-header h3 {
      font-size: 1.15rem;
    }

    .controls-right,
    .view-toggle {
      width: 100%;
    }

    .search-control,
    .status-control,
    .status-control select,
    .new-task-btn,
    .view-toggle button {
      flex: 1;
    }

    .search-control input {
      width: 100%;
    }

    .task-row {
      grid-template-columns: minmax(0, 1fr) 7rem 7rem 8rem;
      padding-right: 0.8rem;
    }

    .overview-panels {
      grid-template-columns: 1fr;
    }

    .tracker-form-grid {
      grid-template-columns: 1fr;
    }

    .tasks-header-columns {
      grid-template-columns: 7rem 7rem 8rem;
      gap: 0.8rem;
      margin-right: 0;
    }

    .tasks-header-columns span:nth-child(2),
    .attachment-btn {
      margin-left: 0;
    }
  }
</style>
