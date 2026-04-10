<script>
  export let currentUser = null;
</script>

<div class="content">
  <div class="card">
    <h3 class="card-title">Activity Monitoring</h3>
    <p class="text-muted">Monitor intern productivity and daily activities.</p>
    <div class="card-placeholder">🚀 Activity monitoring features coming soon...</div>
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

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 1rem;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .card-title {
    margin: 0 0 0.5rem 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .card-placeholder {
    padding: 2rem 1rem;
    text-align: center;
    background: rgba(15, 108, 189, 0.05);
    border-radius: 0.75rem;
    color: var(--text-muted);
  }

  .text-muted {
    color: var(--text-muted);
  }

  :global(.dark) {
    --text-primary: #e5edf8;
    --text-secondary: #cfdceb;
    --text-muted: #9ba3af;
    --border: #2b3c57;
    --surface: #162338;
  }
</style>
