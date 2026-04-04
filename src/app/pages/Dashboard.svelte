<section class="page-shell">
  <div class="dashboard-container">
    <!-- Attendance Summary Section -->
    <div class="summary-grid">
      <div class="summary-card">
        <div class="card-header">
          <h3>Days Completed</h3>
          <span class="card-icon">📅</span>
        </div>
        <div class="card-content">
          <div class="stat-value">45</div>
          <div class="stat-label">out of 120 days</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: 37.5%"></div>
          </div>
          <p class="remaining-text">75 days remaining</p>
        </div>
      </div>

      <div class="summary-card">
        <div class="card-header">
          <h3>Hours Completed</h3>
          <span class="card-icon">⏱️</span>
        </div>
        <div class="card-content">
          <div class="stat-value">360</div>
          <div class="stat-label">out of 960 hours</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: 37.5%"></div>
          </div>
          <p class="remaining-text">600 hours remaining</p>
        </div>
      </div>

      <div class="summary-card">
        <div class="card-header">
          <h3>Tasks Assigned</h3>
          <span class="card-icon">📋</span>
        </div>
        <div class="card-content">
          <div class="stat-value">12</div>
          <div class="stat-label">total tasks</div>
          <div class="task-status">
            <span class="task-badge completed">8 Completed</span>
            <span class="task-badge pending">4 Pending</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content Grid -->
    <div class="content-grid">
      <!-- Recent Activity -->
      <div class="card">
        <div class="card-header-main">
          <h3>Recent Activity</h3>
          <a href="/activity" class="view-all">View All →</a>
        </div>
        <div class="activity-list">
          <div class="activity-item">
            <div class="activity-dot completed"></div>
            <div class="activity-content">
              <p class="activity-title">Task Completed: Database Design</p>
              <p class="activity-time">2 hours ago</p>
            </div>
          </div>

          <div class="activity-item">
            <div class="activity-dot submitted"></div>
            <div class="activity-content">
              <p class="activity-title">Document Submitted: System Architecture</p>
              <p class="activity-time">5 hours ago</p>
            </div>
          </div>

          <div class="activity-item">
            <div class="activity-dot reviewed"></div>
            <div class="activity-content">
              <p class="activity-title">Supervisor Review: Login Module</p>
              <p class="activity-time">1 day ago</p>
            </div>
          </div>

          <div class="activity-item">
            <div class="activity-dot assigned"></div>
            <div class="activity-content">
              <p class="activity-title">New Task Assigned: API Integration</p>
              <p class="activity-time">2 days ago</p>
            </div>
          </div>

          <div class="activity-item">
            <div class="activity-dot completed"></div>
            <div class="activity-content">
              <p class="activity-title">Task Completed: UI Redesign</p>
              <p class="activity-time">3 days ago</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Upcoming Tasks -->
      <div class="card">
        <div class="card-header-main">
          <h3>Upcoming Tasks</h3>
          <a href="/tasks" class="view-all">View All →</a>
        </div>
        <div class="tasks-list">
          <div class="task-item">
            <div class="task-info">
              <p class="task-name">API Integration</p>
              <p class="task-deadline">Due: April 10, 2026</p>
            </div>
            <span class="priority-badge high">High</span>
          </div>

          <div class="task-item">
            <div class="task-info">
              <p class="task-name">Testing & QA</p>
              <p class="task-deadline">Due: April 15, 2026</p>
            </div>
            <span class="priority-badge medium">Medium</span>
          </div>

          <div class="task-item">
            <div class="task-info">
              <p class="task-name">Documentation Review</p>
              <p class="task-deadline">Due: April 20, 2026</p>
            </div>
            <span class="priority-badge low">Low</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  .dashboard-container {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  /* Summary Grid */
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
    margin-bottom: 1rem;
  }

  .summary-card {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 12px;
    padding: 1.5rem;
    color: white;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
  }

  .summary-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 10px 15px rgba(0, 0, 0, 0.2);
  }

  .summary-card:nth-child(2) {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  }

  .summary-card:nth-child(3) {
    background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .card-header h3 {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0;
    opacity: 0.95;
  }

  .card-icon {
    font-size: 1.5rem;
  }

  .card-content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .stat-value {
    font-size: 2.5rem;
    font-weight: 700;
    line-height: 1;
  }

  .stat-label {
    font-size: 0.9rem;
    opacity: 0.9;
  }

  .progress-bar {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
    overflow: hidden;
    margin: 0.5rem 0;
  }

  .progress-fill {
    height: 100%;
    background: rgba(255, 255, 255, 0.8);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .remaining-text {
    font-size: 0.85rem;
    opacity: 0.85;
    margin: 0;
  }

  .task-status {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }

  .task-badge {
    font-size: 0.8rem;
    padding: 0.3rem 0.6rem;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.2);
  }

  .task-badge.completed {
    background: rgba(34, 197, 94, 0.3);
  }

  .task-badge.pending {
    background: rgba(251, 146, 60, 0.3);
  }

  /* Content Grid */
  .content-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 2rem;
  }

  .card {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    border: 1px solid #e5e7eb;
    transition: box-shadow 0.3s ease;
  }

  .card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .card-header-main {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .card-header-main h3 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0;
    color: #111827;
  }

  .view-all {
    color: #667eea;
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 500;
    transition: color 0.3s ease;
  }

  .view-all:hover {
    color: #764ba2;
  }

  /* Activity List */
  .activity-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .activity-item {
    display: flex;
    gap: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #f3f4f6;
  }

  .activity-item:last-child {
    border-bottom: none;
  }

  .activity-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 4px;
  }

  .activity-dot.completed {
    background: #22c55e;
  }

  .activity-dot.submitted {
    background: #3b82f6;
  }

  .activity-dot.reviewed {
    background: #f59e0b;
  }

  .activity-dot.assigned {
    background: #8b5cf6;
  }

  .activity-content {
    flex: 1;
  }

  .activity-title {
    font-size: 0.95rem;
    font-weight: 500;
    color: #111827;
    margin: 0 0 0.25rem 0;
  }

  .activity-time {
    font-size: 0.85rem;
    color: #6b7280;
    margin: 0;
  }

  /* Tasks List */
  .tasks-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .task-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: #f9fafb;
    border-radius: 8px;
    transition: background 0.3s ease;
  }

  .task-item:hover {
    background: #f3f4f6;
  }

  .task-info {
    flex: 1;
  }

  .task-name {
    font-weight: 500;
    color: #111827;
    margin: 0 0 0.25rem 0;
    font-size: 0.95rem;
  }

  .task-deadline {
    font-size: 0.85rem;
    color: #6b7280;
    margin: 0;
  }

  .priority-badge {
    display: inline-block;
    padding: 0.35rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .priority-badge.high {
    background: #fee2e2;
    color: #991b1b;
  }

  .priority-badge.medium {
    background: #fef3c7;
    color: #92400e;
  }

  .priority-badge.low {
    background: #dcfce7;
    color: #166534;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .summary-grid {
      grid-template-columns: 1fr;
    }

    .content-grid {
      grid-template-columns: 1fr;
    }

    .stat-value {
      font-size: 2rem;
    }
  }
</style>
