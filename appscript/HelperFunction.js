// Returns a sheet object by name and throws a clear error if not found.
function getHelperSheet_(sheetName) {
  if (!sheetName) {
    throw new Error('sheetName is required.');
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }

  return sheet;
}

// Gets a single cell value from a specific sheet, e.g. getHelperCellValue_('Config', 'B2').
function getHelperCellValue_(sheetName, cell) {
  if (!cell) {
    throw new Error('cell is required.');
  }

  var sheet = getHelperSheet_(sheetName);
  return sheet.getRange(cell).getValue();
}

// Gets all values from a range, e.g. getHelperRangeValues_('Students', 'A2:D20').
function getHelperRangeValues_(sheetName, rangeA1) {
  if (!rangeA1) {
    throw new Error('rangeA1 is required.');
  }

  var sheet = getHelperSheet_(sheetName);
  return sheet.getRange(rangeA1).getValues();
}

// Gets all values in a row from startColumn to the sheet's last column.
function getHelperRowValues_(sheetName, rowNumber, startColumn) {
  if (!rowNumber) {
    throw new Error('rowNumber is required.');
  }
  if (!startColumn) {
    throw new Error('startColumn is required.');
  }

  var sheet = getHelperSheet_(sheetName);
  var lastColumn = sheet.getLastColumn();
  if (startColumn > lastColumn) {
    return [];
  }

  var width = lastColumn - startColumn + 1;
  return sheet.getRange(rowNumber, startColumn, 1, width).getValues()[0];
}