<script>
  import { onMount } from 'svelte';
  import { Upload, Link2, Folder, FolderOpen, Download, Trash2, Eye, Plus, Search, Share2, Copy, X, Check, ChevronRight, Home } from 'lucide-svelte';

  // Folder structure
  const folderStructure = {
    root: {
      name: 'My Documents',
      path: '/',
      subfolders: ['Legal', 'Meetings', 'Work', 'Reference'],
    },
  };

  let documents = [
    {
      id: 'doc1',
      name: 'NDA Agreement',
      category: 'Legal',
      type: 'pdf',
      size: '2.4 MB',
      uploadedDate: '2025-04-01',
      url: '#',
      folder: '/Legal',
      sharedWith: [
        { email: 'supervisor@company.com', role: 'Supervisor', sharedDate: '2025-04-01' }
      ],
      accessLevel: 'restricted',
    },
    {
      id: 'doc2',
      name: 'Company Handbook',
      category: 'Reference',
      type: 'pdf',
      size: '5.1 MB',
      uploadedDate: '2025-04-02',
      url: '#',
      folder: '/Reference',
      sharedWith: [],
      accessLevel: 'private',
    },
    {
      id: 'doc3',
      name: 'Meeting Recording - Week 1',
      category: 'Meetings',
      type: 'link',
      url: 'https://drive.google.com/...',
      uploadedDate: '2025-04-03',
      isLink: true,
      folder: '/Meetings',
      sharedWith: [
        { email: 'team@company.com', role: 'Team', sharedDate: '2025-04-03' }
      ],
      accessLevel: 'shared',
    },
    {
      id: 'doc4',
      name: 'Project Specifications',
      category: 'Work',
      type: 'pdf',
      size: '3.2 MB',
      uploadedDate: '2025-04-05',
      url: '#',
      folder: '/Work',
      sharedWith: [],
      accessLevel: 'private',
    },
  ];

  let searchQuery = '';
  let selectedCategory = 'All';
  let currentFolder = '/';
  let showUploadModal = false;
  let showLinkModal = false;
  let showShareModal = false;
  let selectedDocForShare = null;
  let newLinkName = '';
  let newLinkUrl = '';
  let shareEmail = '';
  let shareRole = 'Viewer';
  let copiedId = null;

  const categories = ['All', 'Legal', 'Reference', 'Meetings', 'Work', 'Other'];

  $: filteredDocuments = documents.filter((doc) => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || doc.category === selectedCategory;
    const matchesFolder = currentFolder === '/' || doc.folder === currentFolder;
    return matchesSearch && matchesCategory && matchesFolder;
  });

  $: folderDocuments = documents.filter(doc => doc.folder === currentFolder);
  $: documentsInFolder = folderDocuments.length;

  function handleFileUpload(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const newDoc = {
        id: 'doc' + Date.now(),
        name: file.name,
        category: 'Other',
        type: file.type.includes('pdf') ? 'pdf' : 'file',
        size: (file.size / 1024 / 1024).toFixed(1) + ' MB',
        uploadedDate: new Date().toISOString().slice(0, 10),
        url: '#',
        folder: currentFolder,
        sharedWith: [],
        accessLevel: 'private',
      };
      documents = [newDoc, ...documents];
      showUploadModal = false;
    }
  }

  function addLink() {
    if (newLinkName.trim() && newLinkUrl.trim()) {
      const newDoc = {
        id: 'doc' + Date.now(),
        name: newLinkName,
        category: 'Meetings',
        type: 'link',
        url: newLinkUrl,
        uploadedDate: new Date().toISOString().slice(0, 10),
        isLink: true,
        folder: currentFolder,
        sharedWith: [],
        accessLevel: 'private',
      };
      documents = [newDoc, ...documents];
      newLinkName = '';
      newLinkUrl = '';
      showLinkModal = false;
    }
  }

  function openShareModal(doc) {
    selectedDocForShare = doc;
    showShareModal = true;
    shareEmail = '';
  }

  function shareDocument() {
    if (!selectedDocForShare || !shareEmail.trim()) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(shareEmail)) {
      alert('Please enter a valid email address');
      return;
    }

    const docIndex = documents.findIndex(d => d.id === selectedDocForShare.id);
    if (docIndex !== -1) {
      const existingShare = documents[docIndex].sharedWith.find(s => s.email === shareEmail);
      
      if (!existingShare) {
        documents[docIndex].sharedWith.push({
          email: shareEmail,
          role: shareRole,
          sharedDate: new Date().toISOString().slice(0, 10),
        });
        documents[docIndex].accessLevel = 'shared';
        documents = documents;
      }
    }

    shareEmail = '';
    shareRole = 'Viewer';
  }

  function removeShare(docId, email) {
    const docIndex = documents.findIndex(d => d.id === docId);
    if (docIndex !== -1) {
      documents[docIndex].sharedWith = documents[docIndex].sharedWith.filter(s => s.email !== email);
      if (documents[docIndex].sharedWith.length === 0) {
        documents[docIndex].accessLevel = 'private';
      }
      documents = documents;
    }
  }

  function copyShareLink(docId) {
    const shareLink = `${window.location.origin}/#/documents/${docId}`;
    navigator.clipboard.writeText(shareLink);
    copiedId = docId;
    setTimeout(() => {
      copiedId = null;
    }, 2000);
  }

  function deleteDocument(id) {
    documents = documents.filter((doc) => doc.id !== id);
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function getAccessBadgeColor(level) {
    switch(level) {
      case 'private': return '#ef4444';
      case 'shared': return '#3b82f6';
      case 'restricted': return '#f59e0b';
      default: return '#6b7280';
    }
  }

  onMount(() => {
    // Initialize if needed
  });
</script>

<section class="page-shell">
  <div class="documents-container">
    <!-- Header -->
    <div class="documents-header">
      <div>
        <h1 class="page-title">Documents</h1>
        <p class="page-subtitle">Upload documents, add links, and organize your important files</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" on:click={() => (showUploadModal = true)}>
          <Upload size={18} />
          <span>Upload Document</span>
        </button>
        <button class="btn btn-secondary" on:click={() => (showLinkModal = true)}>
          <Link2 size={18} />
          <span>Add Link</span>
        </button>
      </div>
    </div>

    <!-- Folder Navigation -->
    <div class="folder-nav">
      <div class="breadcrumb">
        <button 
          class:active={currentFolder === '/'} 
          on:click={() => currentFolder = '/'}
          class="breadcrumb-item"
        >
          <Home size={16} />
          <span>My Documents</span>
        </button>
        {#if currentFolder !== '/'}
          <ChevronRight size={16} />
          <span class="breadcrumb-current">{currentFolder.slice(1)}</span>
        {/if}
      </div>

      <div class="folder-list">
        <h3>Folders</h3>
        <div class="folders-grid">
          {#each folderStructure.root.subfolders as folder (folder)}
            {@const folderPath = '/' + folder}
            {@const docCount = documents.filter(d => d.folder === folderPath).length}
            <button 
              class="folder-item"
              class:active={currentFolder === folderPath}
              on:click={() => currentFolder = folderPath}
            >
              <div class="folder-icon">
                {#if currentFolder === folderPath}
                  <FolderOpen size={24} />
                {:else}
                  <Folder size={24} />
                {/if}
              </div>
              <div class="folder-info">
                <div class="folder-name">{folder}</div>
                <div class="folder-count">{docCount} items</div>
              </div>
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Search and Filter -->
    <div class="search-filter-bar">
      <div class="search-box">
        <Search size={18} />
        <input
          type="text"
          placeholder="Search documents..."
          bind:value={searchQuery}
        />
      </div>

      <div class="category-filter">
        {#each categories as category (category)}
          <button
            class="category-btn"
            class:active={selectedCategory === category}
            on:click={() => (selectedCategory = category)}
          >
            {category}
          </button>
        {/each}
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-row">
      <div class="stat-card">
        <Folder size={20} />
        <div>
          <div class="stat-value">{filteredDocuments.length}</div>
          <div class="stat-label">Documents Found</div>
        </div>
      </div>
    </div>

    <!-- Documents List -->
    <div class="documents-section">
      <div class="section-header">
        <h2>Your Documents</h2>
        <span class="doc-count">{filteredDocuments.length} items</span>
      </div>

      {#if filteredDocuments.length > 0}
        <div class="documents-grid">
          {#each filteredDocuments as doc (doc.id)}
            <div class="document-card">
              <div class="doc-header">
                <div class="doc-icon-wrapper">
                  {#if doc.isLink}
                    <Link2 size={24} />
                  {:else}
                    <Folder size={24} />
                  {/if}
                </div>
                <div class="doc-access-badge" style={`background-color: ${getAccessBadgeColor(doc.accessLevel)}20; color: ${getAccessBadgeColor(doc.accessLevel)}`}>
                  {doc.accessLevel === 'private' ? '🔒 Private' : doc.accessLevel === 'shared' ? '👥 Shared' : '⚠️ Restricted'}
                </div>
              </div>

              <div class="doc-content">
                <h3 class="doc-name" title={doc.name}>{doc.name}</h3>
                <div class="doc-meta">
                  <span class="category-badge">{doc.category}</span>
                  {#if doc.size}
                    <span class="doc-size">{doc.size}</span>
                  {/if}
                  <span class="doc-date">{formatDate(doc.uploadedDate)}</span>
                </div>
              </div>

              <div class="doc-actions">
                <button
                  class="action-btn"
                  title="View/Download"
                  on:click={() => {
                    if (doc.isLink) {
                      window.open(doc.url, '_blank');
                    }
                  }}
                >
                  {#if doc.isLink}
                    <Eye size={16} />
                  {:else}
                    <Download size={16} />
                  {/if}
                </button>
                <button
                  class="action-btn share-btn"
                  title="Share"
                  on:click={() => openShareModal(doc)}
                >
                  <Share2 size={16} />
                </button>
                <button
                  class="action-btn delete-btn"
                  title="Delete"
                  on:click={() => deleteDocument(doc.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {#if doc.sharedWith && doc.sharedWith.length > 0}
                <div class="shared-with-preview">
                  <span class="shared-label">Shared with {doc.sharedWith.length}</span>
                  <div class="shared-avatars">
                    {#each doc.sharedWith.slice(0, 3) as share (share.email)}
                      <div class="avatar" title={share.email}>
                        {share.email.charAt(0).toUpperCase()}
                      </div>
                    {/each}
                    {#if doc.sharedWith.length > 3}
                      <div class="avatar more">+{doc.sharedWith.length - 3}</div>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-state">
          <Folder size={48} />
          <h3>No documents found</h3>
          <p>Start by uploading a document or adding a link</p>
        </div>
      {/if}
    </div>
  </div>

  <!-- Upload Modal -->
  {#if showUploadModal}
    <div class="modal-overlay" on:click={() => (showUploadModal = false)}>
      <div class="modal" on:click={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Upload Document</h2>
          <button class="close-btn" on:click={() => (showUploadModal = false)}>×</button>
        </div>

        <div class="modal-body">
          <div class="upload-area">
            <input
              type="file"
              id="fileInput"
              hidden
              on:change={handleFileUpload}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.png"
            />
            <label for="fileInput" class="upload-label">
              <Upload size={40} />
              <p>Drag and drop your file here</p>
              <span>or click to browse</span>
              <p class="file-hint">PDF, Word, Excel, PowerPoint (Max 50MB)</p>
            </label>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => (showUploadModal = false)}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Link Modal -->
  {#if showLinkModal}
    <div class="modal-overlay" on:click={() => (showLinkModal = false)}>
      <div class="modal" on:click={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Add Link</h2>
          <button class="close-btn" on:click={() => (showLinkModal = false)}>×</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label for="linkName">Link Name</label>
            <input
              id="linkName"
              type="text"
              placeholder="e.g., Meeting Recording - Week 1"
              bind:value={newLinkName}
            />
          </div>

          <div class="form-group">
            <label for="linkUrl">URL</label>
            <input
              id="linkUrl"
              type="url"
              placeholder="https://..."
              bind:value={newLinkUrl}
            />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => (showLinkModal = false)}>Cancel</button>
          <button class="btn btn-primary" on:click={addLink} disabled={!newLinkName.trim() || !newLinkUrl.trim()}>
            <Plus size={18} />
            <span>Add Link</span>
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Share Modal -->
  {#if showShareModal && selectedDocForShare}
    <div class="modal-overlay" on:click={() => (showShareModal = false)}>
      <div class="modal" on:click={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Share "{selectedDocForShare.name}"</h2>
          <button class="close-btn" on:click={() => (showShareModal = false)}>×</button>
        </div>

        <div class="modal-body">
          <!-- Shareable Link -->
          <div class="form-group">
            <label>Shareable Link</label>
            <div class="share-link-box">
              <input
                type="text"
                readonly
                value={`${window.location.origin}/#/documents/${selectedDocForShare.id}`}
              />
              <button
                class="copy-btn"
                on:click={() => copyShareLink(selectedDocForShare.id)}
                title="Copy link"
              >
                {#if copiedId === selectedDocForShare.id}
                  <Check size={18} />
                {:else}
                  <Copy size={18} />
                {/if}
              </button>
            </div>
          </div>

          <!-- Share with Email -->
          <div class="share-form">
            <div class="form-group">
              <label for="shareEmail">Share with Email</label>
              <input
                id="shareEmail"
                type="email"
                placeholder="person@example.com"
                bind:value={shareEmail}
              />
            </div>

            <div class="form-group">
              <label for="shareRole">Access Level</label>
              <select id="shareRole" bind:value={shareRole}>
                <option value="Viewer">Viewer (View only)</option>
                <option value="Commenter">Commenter (View & comment)</option>
                <option value="Editor">Editor (View & edit)</option>
              </select>
            </div>

            <button class="btn btn-primary" on:click={shareDocument} style="width: 100%;">
              <Plus size={18} />
              <span>Send Share Invite</span>
            </button>
          </div>

          <!-- Current Shares -->
          {#if selectedDocForShare.sharedWith && selectedDocForShare.sharedWith.length > 0}
            <div class="shares-list">
              <h3>Currently Shared With</h3>
              {#each selectedDocForShare.sharedWith as share (share.email)}
                <div class="share-item">
                  <div class="share-info">
                    <div class="share-email">{share.email}</div>
                    <div class="share-role">{share.role} • Shared {formatDate(share.sharedDate)}</div>
                  </div>
                  <button
                    class="remove-share-btn"
                    on:click={() => removeShare(selectedDocForShare.id, share.email)}
                    title="Remove access"
                  >
                    <X size={16} />
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <div class="empty-shares">
              <p>Not shared yet. Share with others using the form above.</p>
            </div>
          {/if}
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => (showShareModal = false)}>Close</button>
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  .page-shell {
    padding: 0;
  }

  .documents-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 2rem;
  }

  .documents-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 2rem;
  }

  .page-title {
    margin: 0;
    font-size: 2rem;
    font-weight: 800;
    color: #111827;
  }

  .page-subtitle {
    margin: 0.5rem 0 0;
    color: #6b7280;
    font-size: 0.95rem;
  }

  .header-actions {
    display: flex;
    gap: 1rem;
  }

  .btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.7rem 1.2rem;
    border-radius: 10px;
    border: none;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 0.95rem;
  }

  .btn-primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 15px rgba(102, 126, 234, 0.3);
  }

  .btn-secondary {
    background: #f3f4f6;
    color: #111827;
    border: 1px solid #e5e7eb;
  }

  .btn-secondary:hover {
    background: #e5e7eb;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .search-filter-bar {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    background: white;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    color: #6b7280;
  }

  .search-box input {
    flex: 1;
    border: none;
    background: none;
    outline: none;
    font-size: 0.95rem;
    color: #111827;
  }

  .search-box input::placeholder {
    color: #9ca3af;
  }

  .category-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .category-btn {
    padding: 0.5rem 1rem;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    color: #6b7280;
    transition: all 0.2s ease;
  }

  .category-btn:hover {
    border-color: #667eea;
    color: #667eea;
  }

  .category-btn.active {
    background: #667eea;
    color: white;
    border-color: #667eea;
  }

  /* Folder Navigation Styles */
  .folder-nav {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    padding: 1.5rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .breadcrumb-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    color: #6b7280;
    transition: all 0.2s ease;
  }

  .breadcrumb-item:hover,
  .breadcrumb-item.active {
    background: #667eea;
    color: white;
    border-color: #667eea;
  }

  .breadcrumb-current {
    font-weight: 600;
    color: #111827;
    padding: 0 0.5rem;
  }

  .folder-list h3 {
    margin: 0 0 1rem 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: #111827;
  }

  .folders-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }

  .folder-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .folder-item:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
  }

  .folder-item.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-color: #667eea;
    color: white;
  }

  .folder-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: rgba(102, 126, 234, 0.1);
    border-radius: 8px;
    color: #667eea;
    flex-shrink: 0;
  }

  .folder-item.active .folder-icon {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }

  .folder-info {
    flex: 1;
  }

  .folder-name {
    font-weight: 600;
    color: #111827;
    margin: 0;
    font-size: 0.95rem;
  }

  .folder-item.active .folder-name {
    color: white;
  }

  .folder-count {
    font-size: 0.85rem;
    color: #6b7280;
    margin: 0.25rem 0 0 0;
  }

  .folder-item.active .folder-count {
    color: rgba(255, 255, 255, 0.85);
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .stat-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 12px;
    color: white;
  }

  .stat-card > :nth-child(1) {
    flex-shrink: 0;
  }

  .stat-value {
    font-size: 1.75rem;
    font-weight: 800;
  }

  .stat-label {
    font-size: 0.9rem;
    opacity: 0.9;
  }

  .documents-section {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .section-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: #111827;
  }

  .doc-count {
    color: #6b7280;
    font-size: 0.9rem;
  }

  .documents-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.25rem;
  }

  .document-card {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    transition: all 0.3s ease;
  }

  .document-card:hover {
    border-color: #667eea;
    box-shadow: 0 8px 20px rgba(102, 126, 234, 0.1);
    transform: translateY(-2px);
  }

  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .doc-icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 10px;
    color: white;
  }

  .menu-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #6b7280;
    padding: 0;
    transition: color 0.2s ease;
  }

  .menu-btn:hover {
    color: #111827;
  }

  .menu-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #6b7280;
    padding: 0;
    transition: color 0.2s ease;
    display: none;
  }

  .menu-btn:hover {
    color: #111827;
  }

  .doc-access-badge {
    display: inline-block;
    padding: 0.25rem 0.65rem;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .share-btn {
    color: #667eea;
  }

  .share-btn:hover {
    background: #f0f4ff;
    color: #764ba2;
  }

  .shared-with-preview {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid #f3f4f6;
    font-size: 0.85rem;
    color: #6b7280;
  }

  .shared-label {
    font-weight: 500;
  }

  .shared-avatars {
    display: flex;
    gap: -0.5rem;
  }

  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 50%;
    font-size: 0.75rem;
    font-weight: 600;
    border: 2px solid white;
    margin-left: -0.5rem;
  }

  .avatar:first-child {
    margin-left: 0;
  }

  .avatar.more {
    background: #f3f4f6;
    color: #6b7280;
  }

  /* Share Functionality Styles */
  .share-link-box {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .share-link-box input {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    font-size: 0.9rem;
    outline: none;
    background: #f9fafb;
  }

  .copy-btn {
    padding: 0.75rem 1rem;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    cursor: pointer;
    color: #667eea;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .copy-btn:hover {
    background: #e5e7eb;
    color: #764ba2;
  }

  .share-form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.5rem 0;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 1.5rem;
    margin-top: 1.5rem;
    background: #f9fafb;
  }

  .share-form .form-group {
    margin-bottom: 0;
  }

  .form-group select {
    padding: 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    font-size: 0.95rem;
    outline: none;
    transition: border-color 0.2s ease;
  }

  .form-group select:focus {
    border-color: #667eea;
  }

  .shares-list {
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid #e5e7eb;
  }

  .shares-list h3 {
    margin: 0 0 1rem 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: #111827;
  }

  .share-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    margin-bottom: 0.75rem;
  }

  .share-info {
    flex: 1;
  }

  .share-email {
    font-weight: 500;
    color: #111827;
    font-size: 0.95rem;
  }

  .share-role {
    font-size: 0.85rem;
    color: #6b7280;
    margin-top: 0.25rem;
  }

  .remove-share-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: #ef4444;
    padding: 0.5rem;
    transition: color 0.2s ease;
  }

  .remove-share-btn:hover {
    color: #991b1b;
  }

  .empty-shares {
    padding: 1.5rem;
    text-align: center;
    color: #6b7280;
    font-size: 0.9rem;
    background: white;
    border: 1px dashed #e5e7eb;
    border-radius: 8px;
  }

  .doc-content {
    flex: 1;
  }

  .doc-name {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 600;
    color: #111827;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .doc-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }

  .category-badge {
    display: inline-block;
    padding: 0.25rem 0.65rem;
    background: #f0f4ff;
    color: #667eea;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .doc-size,
  .doc-date {
    font-size: 0.85rem;
    color: #6b7280;
  }

  .doc-actions {
    display: flex;
    gap: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid #f3f4f6;
  }

  .action-btn {
    flex: 1;
    padding: 0.65rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    color: #667eea;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .action-btn:hover {
    background: #f3f4f6;
    color: #764ba2;
  }

  .action-btn.delete-btn {
    color: #ef4444;
  }

  .action-btn.delete-btn:hover {
    background: #fee2e2;
    color: #991b1b;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 2rem;
    text-align: center;
    color: #6b7280;
  }

  .empty-state > :nth-child(1) {
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .empty-state h3 {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
    font-weight: 600;
    color: #111827;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.95rem;
  }

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 25px rgba(0, 0, 0, 0.15);
    max-width: 500px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: #111827;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 2rem;
    cursor: pointer;
    color: #6b7280;
    padding: 0;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    color: #111827;
  }

  .modal-body {
    padding: 2rem 1.5rem;
  }

  .upload-area {
    border: 2px dashed #e5e7eb;
    border-radius: 12px;
    padding: 2rem;
    text-align: center;
    transition: all 0.3s ease;
  }

  .upload-area:hover {
    border-color: #667eea;
    background: #f0f4ff;
  }

  .upload-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    color: #667eea;
  }

  .upload-label p {
    margin: 0;
    font-weight: 600;
    color: #111827;
  }

  .upload-label span {
    font-size: 0.9rem;
    color: #6b7280;
  }

  .file-hint {
    font-size: 0.8rem;
    color: #9ca3af;
    margin-top: 0.5rem !important;
  }

  .form-group {
    margin-bottom: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group label {
    font-weight: 600;
    color: #111827;
    font-size: 0.95rem;
  }

  .form-group input {
    padding: 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    font-size: 0.95rem;
    outline: none;
    transition: border-color 0.2s ease;
  }

  .form-group input:focus {
    border-color: #667eea;
  }

  .modal-footer {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    padding: 1.5rem;
    border-top: 1px solid #e5e7eb;
  }

  @media (max-width: 768px) {
    .documents-container {
      padding: 1rem;
    }

    .documents-header {
      flex-direction: column;
    }

    .header-actions {
      width: 100%;
      flex-direction: column;
    }

    .header-actions .btn {
      width: 100%;
      justify-content: center;
    }

    .category-filter {
      overflow-x: auto;
      flex-wrap: nowrap;
      padding-bottom: 0.5rem;
    }

    .documents-grid {
      grid-template-columns: 1fr;
    }

    .modal {
      width: 95%;
    }
  }
</style>
