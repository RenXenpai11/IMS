// ProjectsSubmissions.js — handles folder-based project submissions
// Sheets: proj_folders, submission_intern

var PROJ_FOLDERS_SHEET_   = 'proj_folders';
var PROJ_FOLDERS_HEADERS_ = [
  'folder_id', 'proj_id', 'folder_name', 'gdrive_link',
  'created_at', 'created_by', 'updated_by'
];

var SUBMISSION_INTERN_SHEET_   = 'submission_intern';
var SUBMISSION_INTERN_HEADERS_ = [
  'submission_id', 'proj_id', 'folder_id', 'gdrive', 'kind',
  'file_name', 'file_type', 'file_size',
  'link_label', 'link_url',
  'uploaded_at', 'uploaded_by'
];

var IMS_PROJECTS_FOLDER_NAME_ = 'IMS Project Submissions';

//Sheet accessors 

function projFoldersSheet_() {
  return getOrCreateSheetWithHeaders_(PROJ_FOLDERS_SHEET_, PROJ_FOLDERS_HEADERS_);
}

function submissionInternSheet_() {
  return getOrCreateSheetWithHeaders_(SUBMISSION_INTERN_SHEET_, SUBMISSION_INTERN_HEADERS_);
}

// ── ID generators ──────────────────────────────────────────────────────────

function projFolderNextId_() {
  var sheet  = projFoldersSheet_();
  var data   = sheet.getDataRange().getValues();
  var lastId = 0;
  for (var i = 1; i < data.length; i++) {
    var val = String(data[i][0] || '');
    if (/^FOLDER_\d+$/.test(val)) {
      var n = parseInt(val.replace('FOLDER_', ''), 10);
      if (!isNaN(n) && n > lastId) lastId = n;
    }
  }
  return 'FOLDER_' + String(lastId + 1).padStart(4, '0');
}

function submissionNextId_() {
  var sheet  = submissionInternSheet_();
  var data   = sheet.getDataRange().getValues();
  var lastId = 0;
  for (var i = 1; i < data.length; i++) {
    var val = String(data[i][0] || '');
    if (/^SUB_\d+$/.test(val)) {
      var n = parseInt(val.replace('SUB_', ''), 10);
      if (!isNaN(n) && n > lastId) lastId = n;
    }
  }
  return 'SUB_' + String(lastId + 1).padStart(4, '0');
}

// ── Row mappers ────────────────────────────────────────────────────────────

function folderRowToObj_(row) {
  return {
    folder_id:   String(row[0] || ''),
    proj_id:     String(row[1] || ''),
    folder_name: String(row[2] || ''),
    gdrive_link: String(row[3] || ''),
    created_at:  String(row[4] || ''),
    created_by:  String(row[5] || ''),
    updated_by:  String(row[6] || '')
  };
}

function submissionRowToObj_(row) {
  return {
    submission_id: String(row[0]  || ''),
    proj_id:       String(row[1]  || ''),
    folder_id:     String(row[2]  || ''),
    gdrive:        String(row[3]  || ''),
    kind:          String(row[4]  || ''),
    file_name:     String(row[5]  || ''),
    file_type:     String(row[6]  || ''),
    file_size:     String(row[7]  || ''),
    link_label:    String(row[8]  || ''),
    link_url:      String(row[9]  || ''),
    uploaded_at:   String(row[10]  || ''),
    uploaded_by:   String(row[11] || '')
  };
}

// ── Drive helpers ──────────────────────────────────────────────────────────

function getOrCreateImsProjectsFolder_() {
  var folders = DriveApp.getFoldersByName(IMS_PROJECTS_FOLDER_NAME_);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(IMS_PROJECTS_FOLDER_NAME_);
}

function extractDriveFolderId_(url) {
  if (!url) return '';
  var match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : '';
}

// ── List folders + submissions for a project ───────────────────────────────

function handleListProjSubmissions_(payload) {
  var projId = String(payload.proj_id || '').trim();
  if (!projId) return { ok: false, error: 'proj_id is required.' };

  // Load all folders belonging to this project
  var fSheet = projFoldersSheet_();
  var fData  = fSheet.getDataRange().getValues();
  var folders    = [];
  var folderMap  = {};

  for (var i = 1; i < fData.length; i++) {
    if (!String(fData[i][0] || '').trim()) continue;
    var obj = folderRowToObj_(fData[i]);
    if (obj.proj_id === projId) {
      obj.submissions = [];
      folders.push(obj);
      folderMap[obj.folder_id] = obj;
    }
  }

  // Attach submissions
  var sSheet = submissionInternSheet_();
  var sData  = sSheet.getDataRange().getValues();

  for (var j = 1; j < sData.length; j++) {
    if (!String(sData[j][0] || '').trim()) continue;
    var sub = submissionRowToObj_(sData[j]);
    if (sub.proj_id === projId && folderMap[sub.folder_id]) {
      folderMap[sub.folder_id].submissions.push(sub);
    }
  }

  return { ok: true, folders: folders };
}

// ── Create folder ──────────────────────────────────────────────────────────

function handleCreateProjFolder_(payload) {
  var projId     = String(payload.proj_id     || '').trim();
  var folderName = String(payload.folder_name || 'New Folder').trim() || 'New Folder';
  var userId     = String(payload.user_id     || '').trim();

  if (!projId) return { ok: false, error: 'proj_id is required.' };
  if (!userId) return { ok: false, error: 'user_id is required.' };

  var folderId  = projFolderNextId_();
  var now       = new Date();
  var driveLink = '';

  try {
    var root    = getOrCreateImsProjectsFolder_();
    var dFolder = root.createFolder(folderName + ' [' + folderId + ']');
    driveLink   = dFolder.getUrl();
  } catch (e) {
    // non-fatal — record saved without a Drive link
    driveLink = '';
  }

  var sheet = projFoldersSheet_();
  sheet.appendRow([
    folderId,
    projId,
    folderName,
    driveLink,
    formatTimestamp_(now),
    userId,
    userId
  ]);

  return {
    ok:          true,
    folder_id:   folderId,
    folder_name: folderName,
    gdrive_link: driveLink,
    created_at:  formatTimestamp_(now)
  };
}

// ── Rename folder ──────────────────────────────────────────────────────────

function handleUpdateProjFolder_(payload) {
  var folderId   = String(payload.folder_id   || '').trim();
  var folderName = String(payload.folder_name || '').trim();
  var userId     = String(payload.user_id     || '').trim();

  if (!folderId)   return { ok: false, error: 'folder_id is required.' };
  if (!folderName) return { ok: false, error: 'folder_name is required.' };

  var sheet = projFoldersSheet_();
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === folderId) {
      sheet.getRange(i + 1, 3).setValue(folderName);
      if (userId) sheet.getRange(i + 1, 7).setValue(userId);
      return { ok: true, folder_id: folderId };
    }
  }

  return { ok: false, error: 'Folder not found: ' + folderId };
}

// ── Delete folder (cascade-deletes its submissions) ───────────────────────

function handleDeleteProjFolder_(payload) {
  var folderId = String(payload.folder_id || '').trim();
  if (!folderId) return { ok: false, error: 'folder_id is required.' };

  var fSheet = projFoldersSheet_();
  var fData  = fSheet.getDataRange().getValues();
  var found  = false;

  for (var i = 1; i < fData.length; i++) {
    if (String(fData[i][0] || '').trim() === folderId) {
      fSheet.deleteRow(i + 1);
      found = true;
      break;
    }
  }

  if (!found) return { ok: false, error: 'Folder not found: ' + folderId };

  // Cascade delete submissions in this folder
  var sSheet = submissionInternSheet_();
  var sData  = sSheet.getDataRange().getValues();
  for (var j = sData.length - 1; j >= 1; j--) {
    if (String(sData[j][2] || '').trim() === folderId) {
      sSheet.deleteRow(j + 1);
    }
  }

  return { ok: true, folder_id: folderId };
}

// ── Create submission ──────────────────────────────────────────────────────

function handleCreateProjSubmission_(payload) {
  var projId   = String(payload.proj_id   || '').trim();
  var folderId = String(payload.folder_id || '').trim();
  var userId   = String(payload.user_id   || '').trim();
  var kind     = String(payload.kind      || '').trim(); // 'file' or 'link'

  if (!projId)   return { ok: false, error: 'proj_id is required.' };
  if (!folderId) return { ok: false, error: 'folder_id is required.' };
  if (!userId)   return { ok: false, error: 'user_id is required.' };
  if (kind !== 'file' && kind !== 'link') return { ok: false, error: 'kind must be "file" or "link".' };

  var submissionId = submissionNextId_();
  var now          = formatTimestamp_(new Date());
  var row;

  if (kind === 'file') {
    var fileName  = String(payload.file_name  || '').trim();
    var fileType  = String(payload.file_type  || '').trim();
    var fileKind  = String(payload.file_kind  || 'Document').trim();
    var fileSizeMb = String(payload.file_size || '').trim();
    if (fileSizeMb && !/\s*MB$/i.test(fileSizeMb)) {
      fileSizeMb = fileSizeMb + ' MB';
    }
    var base64    = String(payload.base64_data || '').trim();
    var mimeType  = String(payload.mime_type  || 'application/octet-stream').trim();

    if (!fileName) return { ok: false, error: 'file_name is required for file submissions.' };

    var driveFileUrl = '';
    if (base64) {
      try {
        // Locate the Drive folder linked to this proj_folder record
        var fSheet = projFoldersSheet_();
        var fData  = fSheet.getDataRange().getValues();
        var driveLink = '';
        for (var i = 1; i < fData.length; i++) {
          if (String(fData[i][0] || '').trim() === folderId) {
            driveLink = String(fData[i][3] || '');
            break;
          }
        }

        var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, fileName);

        if (driveLink) {
          var driveFolderId = extractDriveFolderId_(driveLink);
          if (driveFolderId) {
            var driveFolder = DriveApp.getFolderById(driveFolderId);
            var driveFile   = driveFolder.createFile(blob);
            driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            driveFileUrl = driveFile.getUrl();
          }
        }

        if (!driveFileUrl) {
          // Fallback: upload to IMS root folder
          var root      = getOrCreateImsProjectsFolder_();
          var driveFile = root.createFile(blob);
          driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          driveFileUrl = driveFile.getUrl();
        }
      } catch (e) {
        // non-fatal — record saved without a Drive URL
        driveFileUrl = '';
      }
    }

    // Store: gdrive=folder link, kind=fileKind (category), link_url=driveFileUrl (Drive link for viewing)
    row = [
      submissionId, projId, folderId,
      driveLink,          // gdrive - the folder's gdrive link (where the file was uploaded)
      fileKind,           // kind column
      fileName, fileType, fileSizeMb,
      '',                 // link_label empty
      driveFileUrl,       // link_url used to store the Drive file link
      now, userId
    ];

  } else {
    // link submission
    var linkLabel = String(payload.link_label || '').trim();
    var linkUrl   = String(payload.link_url   || '').trim();
    if (!linkUrl) return { ok: false, error: 'link_url is required for link submissions.' };

    row = [
      submissionId, projId, folderId,
      '',               // gdrive empty for link submissions
      'link',           // kind
      '', '', '',       // file_name, file_type, file_size empty
      linkLabel, linkUrl,
      now, userId
    ];
  }

  var sSheet = submissionInternSheet_();
  sSheet.appendRow(row);

  return {
    ok:            true,
    submission_id: submissionId,
    kind:          kind,
    uploaded_at:   now,
    drive_url:     kind === 'file' ? row[9] : ''
  };
}

// ── Delete submission ──────────────────────────────────────────────────────

function handleDeleteProjSubmission_(payload) {
  var submissionId = String(payload.submission_id || '').trim();
  if (!submissionId) return { ok: false, error: 'submission_id is required.' };

  var sheet = submissionInternSheet_();
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === submissionId) {
      sheet.deleteRow(i + 1);
      return { ok: true, submission_id: submissionId };
    }
  }

  return { ok: false, error: 'Submission not found: ' + submissionId };
}
