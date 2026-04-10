<script>
  import { CheckCircle, AlertCircle, FileText } from 'lucide-svelte';
  import { subscribeToCurrentUser } from '../lib/auth.js';

  export let currentUser = null;

  let loading = true;
  let todayLogs = [];
  let pendingRequests = [];
  let recentSubmissions = [];
  let unsubscribe;

  function normalizeDate(value) {
    const text = String(value || '').trim();
    if (!text) return '-';
    const parsed = new Date(`${text}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return text;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
  }

  function getToday() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  async function loadData() {
    loading = true;

    try {
      const today = getToday();
      
      // TODO: Connect to real backend for time_logs
      todayLogs = [];

      // TODO: Connect to real backend for pending requests
      pendingRequests = [
        { id: 1, student_name: 'John Doe', type: 'Leave', date: today },
        { id: 2, student_name: 'Jane Smith', type: 'Overtime', date: today },
      ];

      // TODO: Connect to real backend for recent submissions
      recentSubmissions = [
        { id: 1, student_name: 'Mike Johnson', title: 'Project Report', uploaded: today },
      ];
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      loading = false;
    }
  }

  const onMount = () => {
    unsubscribe = subscribeToCurrentUser(() => {
      loadData();
    });
    loadData();
  };

  const onDestroy = () => {
    if (typeof unsubscribe === 'function') unsubscribe();
  };

  onMount();
</script>

<div class="content">
  <div class="stats-grid">
    <div class="stat-card stat-blue">
      <div class="stat-icon"><FileText size={18} /></div>
      <p class="stat-value">{pendingRequests.length}</p>
      <p class="stat-label">Pending Requests</p>
    </div>
    <div class="stat-card stat-success">
      <div class="stat-icon"><CheckCircle size={18} /></div>
      <p class="stat-value">{recentSubmissions.length}</p>
      <p class="stat-label">Recent Submissions</p>
    </div>
  </div>

  <div class="card">
    <h3 class="card-title">Pending Requests</h3>
    {#if loading}
      <p class="text-muted">Loading...</p>
    {:else if pendingRequests.length === 0}
      <p class="text-muted">No pending requests.</p>
    {:else}
      {#each pendingRequests as req (req.id)}
        <div class="list-item">
          <div>
            <p class="font-semibold text-sm">{req.student_name}</p>
            <p class="text-xs text-muted">{req.type} • {normalizeDate(req.date)}</p>
          </div>
          <button class="btn btn-sm">Review</button>
        </div>
      {/each}
    {/if}
  </div>

  <div class="card">
    <h3 class="card-title">Recent Submissions</h3>
    {#if recentSubmissions.length === 0}
      <p class="text-muted">No recent submissions.</p>
    {:else}
      {#each recentSubmissions as sub (sub.id)}
        <div class="list-item">
          <div>
            <p class="font-semibold text-sm">{sub.student_name}</p>
            <p class="text-xs text-muted">{sub.title} • {normalizeDate(sub.uploaded)}</p>
          </div>
          <button class="btn btn-sm">View</button>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  :root {
    --text-primary: #0f172a;
    --text-secondary: #1f2937;
    --text-muted: #6b7280;
    --border: #d7e3f1;
    --surface: #ffffff;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 1rem;
    padding: 1.25rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    border-top: 3px solid;
  }

  .stat-blue { border-top-color: #0f6cbd; }
  .stat-success { border-top-color: #10b981; }

  .stat-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.75rem;
    color: white;
    margin-bottom: 0.5rem;
  }

  .stat-blue .stat-icon { background: linear-gradient(135deg, #0f6cbd, #0ea5e9); }
  .stat-success .stat-icon { background: linear-gradient(135deg, #10b981, #34d399); }

  .stat-value {
    margin: 0.5rem 0 0.25rem 0;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .stat-label {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 1rem;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .card-title {
    margin: 0 0 1rem 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .list-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    background: #f9fbff;
    margin-bottom: 0.5rem;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-sm {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    background: #edf4fb;
    border: 1px solid var(--border);
    color: var(--text-primary);
  }

  .btn-sm:hover {
    background: #e0eef9;
  }

  .text-muted {
    color: var(--text-muted);
  }

  .font-semibold {
    font-weight: 600;
  }

  .text-sm {
    font-size: 0.875rem;
  }

  .text-xs {
    font-size: 0.75rem;
  }

  :global(.dark) {
    --text-primary: #e5edf8;
    --text-secondary: #cfdceb;
    --text-muted: #9ba3af;
    --border: #2b3c57;
    --surface: #162338;
  }

  :global(.dark) .list-item {
    background: #1a2c45;
  }

  :global(.dark) .btn-sm {
    background: #1a2c45;
  }

  :global(.dark) .btn-sm:hover {
    background: #223653;
  }

  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
