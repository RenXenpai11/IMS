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

  let documents = [];
  let isLoading = true;
  let userId = null;

  let searchQuery = '';
  let selectedCategory = 'All';
  let currentFolder = '/';
  let showUploadModal = false;
  let showLinkModal = false;
  let showShareModal = false;
  let showCreateFolderModal = false;
  let selectedDocForShare = null;
  let newLinkName = '';
  let newLinkUrl = '';
  let shareEmail = '';
  let shareRole = 'Viewer';
  let copiedId = null;
  let uploadToFolder = '/';
  let newFolderName = '';
  let showRenameFolderModal = false;
  let folderToRename = null;
  let renameFolderInputValue = '';
  let folderToDelete = null;
  let showDeleteFolderConfirm = false;
  let showUploadPreview = false;
  let pendingFile = null;
  let pendingFilePreview = null;

  const categories = ['All', 'Legal', 'Reference', 'Meetings', 'Work', 'Other'];

  $: filteredDocuments = documents.filter((doc) => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || doc.category === selectedCategory;
    const matchesFolder = currentFolder === '/' || doc.folder === currentFolder;
    return matchesSearch && matchesCategory && matchesFolder;
  });

  $: folderDocuments = documents.filter(doc => doc.folder === currentFolder);
  $: documentsInFolder = folderDocuments.length;

  // API Call helper
  function callBackend_(action, payload) {
    return new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler((response) => {
          resolve(response);
        })
        .withFailureHandler((error) => {
          reject(error);
        })
        .apiAction(action, payload);
    });
  }

  // Load documents from backend
  async function loadDocuments_() {
    try {
      isLoading = true;
      const response = await callBackend_('get_all_documents', { user_id: userId });
      if (response.ok) {
        documents = response.documents || [];
      } else {
        console.error('Failed to load documents:', response.error);
      }
    } catch (err) {
      console.error('Error loading documents:', err);
    } finally {
      isLoading = false;
    }
  }

  async function handleFileUpload(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      // Create preview without saving to database yet
      pendingFile = {
        name: file.name,
        category: 'Other',
        type: file.type.includes('pdf') ? 'pdf' : 'file',
        size: (file.size / 1024 / 1024).toFixed(1) + ' MB',
        folder: uploadToFolder,
      };
      
      pendingFilePreview = {
        ...pendingFile,
        uploadedDate: new Date().toISOString().slice(0, 10),
      };
      
      showUploadPreview = true;
    }
  }

  async function confirmUpload() {
    if (!pendingFile) return;
    
    try {
      const response = await callBackend_('upload_document', {
        user_id: userId,
        name: pendingFile.name,
        category: pendingFile.category,
        type: pendingFile.type,
        size: pendingFile.size,
        folder: pendingFile.folder,
        uploaded_date: new Date().toISOString().slice(0, 10),
        url: '#',
        is_link: false
      });

      if (response.ok) {
        documents = [response.document, ...documents];
        showUploadModal = false;
        showUploadPreview = false;
        uploadToFolder = '/';
        pendingFile = null;
        pendingFilePreview = null;
      } else {
        alert('Error uploading document: ' + response.error);
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Error uploading document');
    }
  }

  function cancelUpload() {
    showUploadPreview = false;
    pendingFile = null;
    pendingFilePreview = null;
  }

  async function addLink() {
    if (newLinkName.trim() && newLinkUrl.trim()) {
      try {
        const response = await callBackend_('upload_document', {
          user_id: userId,
          name: newLinkName,
          category: 'Meetings',
          type: 'link',
          url: newLinkUrl,
          folder: uploadToFolder,
          uploaded_date: new Date().toISOString().slice(0, 10),
          is_link: true
        });

        if (response.ok) {
          documents = [response.document, ...documents];
          newLinkName = '';
          newLinkUrl = '';
          showLinkModal = false;
          uploadToFolder = '/';
        } else {
          alert('Error adding link: ' + response.error);
        }
      } catch (err) {
        console.error('Link error:', err);
        alert('Error adding link');
      }
    }
  }

  function openShareModal(doc) {
    selectedDocForShare = doc;
    showShareModal = true;
    shareEmail = '';
  }

  async function shareDocument() {
    if (!selectedDocForShare || !shareEmail.trim()) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(shareEmail)) {
      alert('Please enter a valid email address');
      return;
    }

    try {
      const response = await callBackend_('share_document', {
        user_id: userId,
        doc_id: selectedDocForShare.id,
        email: shareEmail,
        role: shareRole
      });

      if (response.ok) {
        // Update local document
        const docIndex = documents.findIndex(d => d.id === selectedDocForShare.id);
        if (docIndex !== -1) {
          documents[docIndex].sharedWith.push({
            email: shareEmail,
            role: shareRole,
            sharedDate: new Date().toISOString().slice(0, 10),
          });
          documents[docIndex].access_level = 'shared';
          documents = documents;
          selectedDocForShare = documents[docIndex];
        }
        shareEmail = '';
        shareRole = 'Viewer';
      } else {
        alert('Error sharing document: ' + response.error);
      }
    } catch (err) {
      console.error('Share error:', err);
      alert('Error sharing document');
    }
  }

  async function removeShare(docId, email) {
    try {
      const response = await callBackend_('remove_share', {
        user_id: userId,
        doc_id: docId,
        email: email
      });

      if (response.ok) {
        const docIndex = documents.findIndex(d => d.id === docId);
        if (docIndex !== -1) {
          documents[docIndex].sharedWith = documents[docIndex].sharedWith.filter(s => s.email !== email);
          if (documents[docIndex].sharedWith.length === 0) {
            documents[docIndex].access_level = 'private';
          }
          documents = documents;
          if (selectedDocForShare && selectedDocForShare.id === docId) {
            selectedDocForShare = documents[docIndex];
          }
        }
      } else {
        alert('Error removing share: ' + response.error);
      }
    } catch (err) {
      console.error('Remove share error:', err);
      alert('Error removing share');
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

  async function deleteDocument(id) {
    try {
      const response = await callBackend_('delete_document', {
        user_id: userId,
        doc_id: id
      });

      if (response.ok) {
        documents = documents.filter((doc) => doc.id !== id);
      } else {
        alert('Error deleting document: ' + response.error);
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Error deleting document');
    }
  }

  function openRenameFolderModal(folderName) {
    folderToRename = folderName;
    renameFolderInputValue = folderName;
    showRenameFolderModal = true;
  }

  function renameFolder() {
    if (!renameFolderInputValue.trim() || renameFolderInputValue === folderToRename) {
      showRenameFolderModal = false;
      return;
    }

    // Update folder name in folderStructure
    const folderIndex = folderStructure.root.subfolders.indexOf(folderToRename);
    if (folderIndex !== -1) {
      folderStructure.root.subfolders[folderIndex] = renameFolderInputValue;
      
      // Update all documents that have the old folder path
      const oldPath = '/' + folderToRename;
      const newPath = '/' + renameFolderInputValue;
      documents = documents.map(doc => 
        doc.folder === oldPath ? { ...doc, folder: newPath } : doc
      );
      
      // If the renamed folder was selected, update currentFolder
      if (currentFolder === oldPath) {
        currentFolder = newPath;
      }

      folderStructure.root.subfolders = [...folderStructure.root.subfolders];
    }

    showRenameFolderModal = false;
    folderToRename = null;
    renameFolderInputValue = '';
  }

  function deleteFolder(folderName) {
    const folderPath = '/' + folderName;
    
    // Move all documents from this folder to root
    documents = documents.map(doc =>
      doc.folder === folderPath ? { ...doc, folder: '/' } : doc
    );

    // Remove folder from structure
    folderStructure.root.subfolders = folderStructure.root.subfolders.filter(
      f => f !== folderName
    );

    // Reset currentFolder if it was the deleted folder
    if (currentFolder === folderPath) {
      currentFolder = '/';
    }

    showDeleteFolderConfirm = false;
    folderToDelete = null;
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

  onMount(async () => {
    // Get user ID from local storage or window object
    try {
      userId = localStorage.getItem('current_user_id') || window.__ims_user_id || 'user-' + Date.now();
      if (!localStorage.getItem('current_user_id')) {
        localStorage.setItem('current_user_id', userId);
      }
      // Load documents from backend
      await loadDocuments_();
    } catch (err) {
      console.error('Error initializing documents:', err);
    }
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
        <button class="btn btn-secondary" on:click={() => (showCreateFolderModal = true)}>
          <Folder size={18} />
          <span>Create Folder</span>
        </button>
      </div>
    </div>

    <!-- Folder Navigation -->
    <div class="folder-nav">
      <h3>Folders</h3>
      <div class="folders-grid">
        {#each folderStructure.root.subfolders as folder (folder)}
          {@const folderPath = '/' + folder}
          {@const docCount = documents.filter(d => d.folder === folderPath).length}
          <div class="folder-item-wrapper">
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
            <div class="folder-actions">
              <button 
                class="folder-action-btn rename-btn"
                title="Rename folder"
                on:click={() => openRenameFolderModal(folder)}
              >
                ✎
              </button>
              <button 
                class="folder-action-btn delete-btn"
                title="Delete folder"
                on:click={() => {
                  folderToDelete = folder;
                  showDeleteFolderConfirm = true;
                }}
              >
                🗑
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Search and Filter -->
    <div class="search-filter-container">
      <div class="search-box">
        <Search size={18} />
        <input
          type="text"
          placeholder="Search documents..."
          bind:value={searchQuery}
        />
      </div>

      <div class="category-tabs">
        {#each categories as category (category)}
          <button
            class="category-tab"
            class:active={selectedCategory === category}
            on:click={() => (selectedCategory = category)}
          >
            {category}
          </button>
        {/each}
      </div>
    </div>

    <!-- Documents Table -->
    <div class="documents-table-container">
      <div class="table-header">
        <h2>Your Documents</h2>
        <span class="doc-count">{filteredDocuments.length} items</span>
      </div>

      {#if filteredDocuments.length > 0}
        <div class="table-wrapper">
          <table class="documents-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Category</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredDocuments as doc (doc.id)}
                <tr class="table-row">
                  <td class="col-name">
                    <div class="file-info">
                      <div class="file-icon">
                        {#if doc.isLink}
                          <Link2 size={18} />
                        {:else}
                          <Folder size={18} />
                        {/if}
                      </div>
                      <span class="file-name">{doc.name}</span>
                    </div>
                  </td>
                  <td class="col-type">
                    <span class="type-badge">{doc.isLink ? 'Link' : 'File'}</span>
                  </td>
                  <td class="col-category">
                    <span class="category-badge">{doc.category}</span>
                  </td>
                  <td class="col-size">
                    {#if doc.size}
                      {doc.size}
                    {:else}
                      —
                    {/if}
                  </td>
                  <td class="col-date">{formatDate(doc.uploadedDate)}</td>
                  <td class="col-status">
                    <span 
                      class="status-badge" 
                      style={`background-color: ${getAccessBadgeColor(doc.accessLevel)}20; color: ${getAccessBadgeColor(doc.accessLevel)}`}
                    >
                      {doc.accessLevel === 'private' ? '🔒 Private' : doc.accessLevel === 'shared' ? '👥 Shared' : '⚠️ Restricted'}
                    </span>
                  </td>
                  <td class="col-actions">
                    <div class="action-buttons">
                      <button
                        class="icon-btn"
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
                        class="icon-btn share-btn"
                        title="Share"
                        on:click={() => openShareModal(doc)}
                      >
                        <Share2 size={16} />
                      </button>
                      <button
                        class="icon-btn delete-btn"
                        title="Delete"
                        on:click={() => deleteDocument(doc.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
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
          <!-- Folder Selection Tabs -->
          <div class="form-group">
            <label>Select Folder</label>
            <div class="folder-tabs">
              <button
                class="folder-tab"
                class:active={uploadToFolder === '/'}
                on:click={() => (uploadToFolder = '/')}
              >
                <Home size={16} />
                <span>All Documents</span>
              </button>
              {#each folderStructure.root.subfolders as folder (folder)}
                {@const folderPath = '/' + folder}
                <button
                  class="folder-tab"
                  class:active={uploadToFolder === folderPath}
                  on:click={() => (uploadToFolder = folderPath)}
                >
                  <Folder size={16} />
                  <span>{folder}</span>
                </button>
              {/each}
            </div>
          </div>

          <!-- Upload Area -->
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

  <!-- Upload Preview Modal -->
  {#if showUploadPreview && pendingFilePreview}
    <div class="modal-overlay" on:click={() => cancelUpload()}>
      <div class="modal" on:click={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Review Document</h2>
          <button class="close-btn" on:click={() => cancelUpload()}>×</button>
        </div>

        <div class="modal-body">
          <div class="preview-content">
            <div class="preview-icon">
              {#if pendingFilePreview.type === 'pdf' || pendingFilePreview.type.includes('pdf')}
                <div class="icon-pdf">📄</div>
              {:else}
                <div class="icon-file">📋</div>
              {/if}
            </div>

            <div class="preview-details">
              <div class="preview-section">
                <label for="preview-name">File Name</label>
                <p class="preview-value" id="preview-name">{pendingFilePreview.name}</p>
              </div>

              <div class="preview-section">
                <label for="preview-size">File Size</label>
                <p class="preview-value" id="preview-size">{pendingFilePreview.size}</p>
              </div>

              <div class="preview-section">
                <label for="preview-folder">Upload Folder</label>
                <p class="preview-value" id="preview-folder">
                  {#if pendingFilePreview.folder === '/'}
                    All Documents
                  {:else}
                    {pendingFilePreview.folder.substring(1)}
                  {/if}
                </p>
              </div>

              <div class="preview-section">
                <label for="preview-category">Category</label>
                <select id="preview-category" bind:value={pendingFile.category} style="width: 100%; padding: 0.5rem; border-radius: 8px; border: 1px solid #e5e7eb;">
                  <option value="Other">Other</option>
                  <option value="Legal">Legal</option>
                  <option value="Reference">Reference</option>
                  <option value="Meetings">Meetings</option>
                  <option value="Work">Work</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => cancelUpload()}>Delete</button>
          <button class="btn btn-primary" on:click={() => confirmUpload()}>
            <Check size={18} />
            <span>Save Document</span>
          </button>
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
          <!-- Folder Selection Tabs -->
          <div class="form-group">
            <label>Select Folder</label>
            <div class="folder-tabs">
              <button
                class="folder-tab"
                class:active={uploadToFolder === '/'}
                on:click={() => (uploadToFolder = '/')}
              >
                <Home size={16} />
                <span>All Documents</span>
              </button>
              {#each folderStructure.root.subfolders as folder (folder)}
                {@const folderPath = '/' + folder}
                <button
                  class="folder-tab"
                  class:active={uploadToFolder === folderPath}
                  on:click={() => (uploadToFolder = folderPath)}
                >
                  <Folder size={16} />
                  <span>{folder}</span>
                </button>
              {/each}
            </div>
          </div>

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

  <!-- Create Folder Modal -->
  {#if showCreateFolderModal}
    <div class="modal-overlay" on:click={() => (showCreateFolderModal = false)}>
      <div class="modal" on:click={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Create Folder</h2>
          <button class="close-btn" on:click={() => (showCreateFolderModal = false)}>×</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label for="folderName">Folder Name</label>
            <input
              id="folderName"
              type="text"
              placeholder="e.g., Important Documents"
              bind:value={newFolderName}
            />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => (showCreateFolderModal = false)}>Cancel</button>
          <button class="btn btn-primary" on:click={() => {
            if (newFolderName.trim()) {
              folderStructure.root.subfolders = [...folderStructure.root.subfolders, newFolderName];
              newFolderName = '';
              showCreateFolderModal = false;
            }
          }} disabled={!newFolderName.trim()}>
            <Folder size={18} />
            <span>Create Folder</span>
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Rename Folder Modal -->
  {#if showRenameFolderModal && folderToRename}
    <div class="modal-overlay" on:click={() => (showRenameFolderModal = false)}>
      <div class="modal" on:click={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Rename Folder</h2>
          <button class="close-btn" on:click={() => (showRenameFolderModal = false)}>×</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label for="renameFolderInput">New Name</label>
            <input
              id="renameFolderInput"
              type="text"
              bind:value={renameFolderInputValue}
              on:keydown={(e) => {
                if (e.key === 'Enter') renameFolder();
              }}
            />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => (showRenameFolderModal = false)}>Cancel</button>
          <button class="btn btn-primary" on:click={renameFolder} disabled={!renameFolderInputValue.trim()}>
            <span>Rename Folder</span>
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Delete Folder Confirmation Modal -->
  {#if showDeleteFolderConfirm && folderToDelete}
    <div class="modal-overlay" on:click={() => (showDeleteFolderConfirm = false)}>
      <div class="modal" on:click={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Delete Folder</h2>
          <button class="close-btn" on:click={() => (showDeleteFolderConfirm = false)}>×</button>
        </div>

        <div class="modal-body">
          <div class="confirmation-content">
            <p>Are you sure you want to delete the folder <strong>"{folderToDelete}"</strong>?</p>
            <p class="warning-text">All documents in this folder will be moved to the root "All Documents" location. This action cannot be undone.</p>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => (showDeleteFolderConfirm = false)}>Cancel</button>
          <button class="btn btn-danger" on:click={() => deleteFolder(folderToDelete)}>
            <span>Delete Folder</span>
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

  .btn-danger {
    background: #ef4444;
    color: white;
    border: none;
  }

  .btn-danger:hover {
    background: #dc2626;
    transform: translateY(-2px);
    box-shadow: 0 8px 15px rgba(239, 68, 68, 0.3);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .search-filter-container {
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

  .category-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .category-tab {
    padding: 0.5rem 1rem;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 20px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    color: #6b7280;
    transition: all 0.2s ease;
  }

  .category-tab:hover {
    border-color: #667eea;
    color: #667eea;
    background: #f0f4ff;
  }

  .category-tab.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-color: transparent;
  }

  /* Folder Tabs in Upload Modal */
  .folder-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .folder-tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
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

  .folder-tab:hover {
    border-color: #667eea;
    color: #667eea;
    background: #f0f4ff;
  }

  .folder-tab.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-color: transparent;
  }

  /* Table Styles */
  .documents-table-container {
    background: white;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    overflow: hidden;
  }

  .table-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .table-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: #111827;
  }

  .doc-count {
    color: #6b7280;
    font-size: 0.9rem;
  }

  .table-wrapper {
    overflow-x: auto;
  }

  .documents-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.95rem;
  }

  .documents-table thead {
    background: #f9fafb;
    border-bottom: 2px solid #e5e7eb;
  }

  .documents-table thead th {
    padding: 1rem;
    text-align: left;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    font-size: 0.85rem;
    letter-spacing: 0.5px;
  }

  .documents-table tbody tr {
    border-bottom: 1px solid #f3f4f6;
    transition: background 0.2s ease;
  }

  .documents-table tbody tr:hover {
    background: #f9fafb;
  }

  .documents-table td {
    padding: 1rem;
    color: #111827;
    vertical-align: middle;
  }

  .table-row {
    height: 60px;
  }

  .col-name {
    font-weight: 500;
    max-width: 250px;
  }

  .file-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .file-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 8px;
    color: white;
    flex-shrink: 0;
  }

  .file-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  .col-type {
    width: 100px;
  }

  .type-badge {
    display: inline-block;
    padding: 0.35rem 0.65rem;
    background: #dbeafe;
    color: #1e40af;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .col-category {
    width: 120px;
  }

  .category-badge {
    display: inline-block;
    padding: 0.35rem 0.65rem;
    background: #f0f4ff;
    color: #667eea;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .col-size {
    width: 100px;
    color: #6b7280;
    font-size: 0.9rem;
  }

  .col-date {
    width: 120px;
    color: #6b7280;
    font-size: 0.9rem;
  }

  .col-status {
    width: 140px;
  }

  .status-badge {
    display: inline-block;
    padding: 0.35rem 0.65rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .col-actions {
    width: 140px;
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    color: #667eea;
    transition: all 0.2s ease;
  }

  .icon-btn:hover {
    background: #e5e7eb;
    color: #764ba2;
    border-color: #667eea;
  }

  .icon-btn.share-btn {
    color: #667eea;
  }

  .icon-btn.delete-btn {
    color: #ef4444;
  }

  .icon-btn.delete-btn:hover {
    background: #fee2e2;
    color: #991b1b;
    border-color: #ef4444;
  }

  /* Folder Navigation Styles */
  .folder-nav {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
  }

  .folder-nav > h3 {
    margin: 0 0 0.5rem 0;
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

  .folder-item-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
  }

  .folder-item-wrapper .folder-item {
    flex: 1;
  }

  .folder-actions {
    display: flex;
    gap: 0.4rem;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .folder-item-wrapper:hover .folder-actions {
    opacity: 1;
  }

  .folder-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.2s ease;
    padding: 0;
    flex-shrink: 0;
  }

  .folder-action-btn:hover {
    background: #e5e7eb;
    border-color: #d1d5db;
  }

  .folder-action-btn.rename-btn {
    color: #667eea;
  }

  .folder-action-btn.rename-btn:hover {
    color: #764ba2;
    background: #f0f4ff;
  }

  .folder-action-btn.delete-btn {
    color: #ef4444;
  }

  .folder-action-btn.delete-btn:hover {
    background: #fee2e2;
    color: #991b1b;
    border-color: #ef4444;
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

  .confirmation-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .confirmation-content p {
    margin: 0;
    color: #111827;
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .warning-text {
    color: #ef4444 !important;
    font-weight: 500;
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

    .modal {
      width: 95%;
    }
  }
</style>
