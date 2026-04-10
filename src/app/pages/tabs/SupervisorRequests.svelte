<script>
  export let currentUser = null;
</script>

<div class="content">
  <div class="card">
    <h3 class="card-title">Request Management</h3>
    <p class="text-muted">Manage intern requests for leave, overtime, and more.</p>
    <button class="btn btn-primary mt-4">📝 Go to Requests Page</button>
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
    white-space: nowrap;
  }

  .btn-primary {
    background: linear-gradient(90deg, #0f6cbd, #0ea5e9);
    color: white;
    box-shadow: 0 4px 12px rgba(15, 108, 189, 0.3);
  }

  .btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(15, 108, 189, 0.4);
  }

  .text-muted {
    color: var(--text-muted);
  }

  .mt-4 {
    margin-top: 1rem;
  }

  :global(.dark) {
    --text-primary: #e5edf8;
    --text-secondary: #cfdceb;
    --text-muted: #9ba3af;
    --border: #2b3c57;
    --surface: #162338;
  }
</style>
