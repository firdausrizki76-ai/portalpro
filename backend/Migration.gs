/**
 * Surgical migration to fix Attendance sheet column misalignment
 * 
 * Problem: Headers have 17 columns (with locationName at index 9),
 * but OLD data rows only have 16 values. This causes all data from
 * column J (status) onwards to be shifted LEFT by one position.
 * 
 * Detection: If a row's "verificationInPhoto" column (col L, index 11)
 * contains status-like text (e.g. "terlambat", "masuk tepat waktu"),
 * the data is misaligned and needs to be shifted RIGHT by 1.
 */
function migrateAttendanceSchema() {
  const ss = SpreadsheetApp.openById('1_-gvj8S-xkJX1CzJT9HtAGognqjctyBLBl47o4KnwVM');
  const sheet = ss.getSheetByName('Attendance');
  if (!sheet) return { success: false, error: 'Sheet Attendance not found' };

  const lastRow = sheet.getLastRow();
  
  // 1. Target Schema (14 columns)
  const expectedHeaders = ['id', 'userId', 'date', 'shift', 'clockIn', 'clockOut', 'locationName', 'status', 'verificationInPhoto', 'verificationInLocation', 'verificationInTimestamp', 'verificationOutPhoto', 'verificationOutLocation', 'verificationOutTimestamp'];
  const numCols = expectedHeaders.length; // 14
  
  // Force headers
  sheet.getRange(1, 1, 1, numCols).setValues([expectedHeaders]).setFontWeight('bold');
  
  // If spreadsheet has more columns, clear them to avoid confusion
  if (sheet.getMaxColumns() > numCols) {
    const extraCols = sheet.getMaxColumns() - numCols;
    sheet.deleteColumns(numCols + 1, extraCols);
  }

  if (lastRow <= 1) return { success: true, message: 'No data rows to migrate.' };

  // 2. Read CURRENT data (read extra columns if they exist to catch shifted data)
  // We read the full possible width of what might have been there (17+ columns)
  const sourceRange = sheet.getRange(2, 1, lastRow - 1, Math.max(numCols, sheet.getLastColumn()));
  const sourceValues = sourceRange.getValues();
  const alignedData = [];
  
  let fixCount = 0;
  
  for (let i = 0; i < sourceValues.length; i++) {
    const row = sourceValues[i];
    if (!row[0] && !row[1]) continue; // Skip empty
    
    // Aligned row starts with basic info
    const newRow = row.slice(0, 6); // [id, userId, date, shift, clockIn, clockOut] (indices 0-5)
    
    // We need to find where 'status', 'photo', and 'location' are.
    // In the old 17-col schema (with breaks):
    // 9: locationName, 10: status, 11: photo
    
    // In the BROKEN 17-col schema (where it shifted left because breaks were empty):
    // 6: locationName (which often contained status text), 7: status (often photo data)
    
    const isStatusText = (text) => {
      const t = String(text).toLowerCase().trim();
      if (!t) return false;
      return t.includes('terlambat') || t.includes('tepat waktu') || 
             t.includes('tanpa absen') || t.includes('ontime') || t.includes('pulang');
    };
    
    const isPhotoData = (text) => {
      const t = String(text).trim();
      return t.startsWith('data:image/') || (t.length > 200 && t.includes('/9j/'));
    };

    let foundStatus = "";
    let foundPhoto = "";
    let foundLocation = "";
    let foundTimestamp = "";
    let foundLocationName = "";

    // Scan the row (from column 6 onwards) to find the data markers
    for (let j = 6; j < row.length; j++) {
      val = String(row[j]).trim();
      if (!val) continue;

      if (!foundStatus && isStatusText(val)) {
        foundStatus = val;
      } else if (!foundPhoto && isPhotoData(val)) {
        foundPhoto = val;
      } else if (!foundLocation && val.startsWith('{') && val.includes('latitude')) {
        foundLocation = val;
      } else if (!foundTimestamp && val.includes(':') && val.includes('-')) {
        // Simple heuristic for ISO timestamp
        foundTimestamp = val;
      }
    }

    // Assign to new schema positions
    // 6: locationName, 7: status, 8: verificationInPhoto, 9: verificationInLocation, 10: verificationInTimestamp...
    newRow[6] = foundLocationName;
    newRow[7] = foundStatus;
    newRow[8] = foundPhoto;
    newRow[9] = foundLocation;
    newRow[10] = foundTimestamp;
    
    // Fill remaining (Out verification) - we'll just take them sequentially if available or look for them
    // For simplicity, let's look for second photo/location if it exists
    let photoCount = 0;
    for (let j = 6; j < row.length; j++) {
       if (isPhotoData(row[j])) {
         photoCount++;
         if (photoCount == 2) newRow[11] = row[j]; // verificationOutPhoto
       }
    }

    // Pad row to 14 columns
    while (newRow.length < numCols) newRow.push("");
    
    // Sanitize values for Google Sheets limits (50k characters per cell)
    const sanitizedRow = newRow.map(val => {
      const s = String(val);
      if (s.length > 49000) {
        return s.substring(0, 49000) + "...[TRUNCATED]";
      }
      return val;
    });
    
    alignedData.push(sanitizedRow);
    fixCount++;
  }

  // Clear and Re-write
  sheet.getRange(2, 1, sourceValues.length, sourceRange.getLastColumn()).clearContent();
  if (alignedData.length > 0) {
    sheet.getRange(2, 1, alignedData.length, numCols).setValues(alignedData);
  }

  return { success: true, message: 'Cleaned and Realigned 14-column schema. Processed ' + fixCount + ' rows.' };
}


/**
 * Migrate all existing attendance statuses to the new combined format
 */
function migrateAttendanceStatuses() {
  const attDataRecords = getAllRows("Attendance");
  const shiftsAll = getAllRows("Shifts");

  let tolerance = 15;
  try {
    const settingsRows = getAllRows("Settings");
    const toleranceSetting = settingsRows.find(s => String(s.key) === "late_tolerance");
    if (toleranceSetting) tolerance = parseInt(toleranceSetting.value, 10) || 15;
  } catch (e) {}

  let updateCount = 0;

  for (let i = 0; i < attDataRecords.length; i++) {
    const record = attDataRecords[i];
    const shiftName = record.shift;
    const userShift = shiftsAll.find(s => String(s.name) === String(shiftName));

    let shiftStartMin = 480;
    let shiftEndMin = 1020;

    if (userShift) {
      if (userShift.startTime) {
        const [h, m] = formatTimeValue(userShift.startTime).split(":").map(Number);
        shiftStartMin = (h || 0) * 60 + (m || 0);
      }
      if (userShift.endTime) {
        const [h, m] = formatTimeValue(userShift.endTime).split(":").map(Number);
        shiftEndMin = (h || 0) * 60 + (m || 0);
      }
    }

    const newStatus = calculateDetailedAttendanceStatus(record.clockIn, record.clockOut, shiftStartMin, shiftEndMin, tolerance);

    if (String(record.status) !== String(newStatus)) {
      updateRow("Attendance", record.id, { status: newStatus });
      updateCount++;
    }
  }

  return { success: true, message: "Updated " + updateCount + " attendance statuses." };
}
/**
 * Migration to add 'nip' column to Employees sheet
 */
function migrateEmployeeSchema() {
  const ss = SpreadsheetApp.openById('1_-gvj8S-xkJX1CzJT9HtAGognqjctyBLBl47o4KnwVM');
  const sheet = ss.getSheetByName('Employees');
  if (!sheet) return { success: false, error: 'Sheet Employees not found' };

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  if (headers.indexOf('nip') === -1) {
    // Add nip at the end
    sheet.getRange(1, lastCol + 1).setValue('nip').setFontWeight('bold');
    return { success: true, message: 'Added nip column to Employees sheet.' };
  }
  
  return { success: true, message: 'nip column already exists.' };
}
/**
 * Migration to add leave quota columns to Employees sheet
 */
function migrateLeaveQuotas() {
  const ss = SpreadsheetApp.openById('1_-gvj8S-xkJX1CzJT9HtAGognqjctyBLBl47o4KnwVM');
  const sheet = ss.getSheetByName('Employees');
  if (!sheet) return { success: false, error: 'Sheet Employees not found' };

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  const newCols = [
    'leave_annual_used',
    'leave_sick_used',
    'leave_maternity_used',
    'leave_large_used',
    'leave_important_used'
  ];
  
  let added = 0;
  newCols.forEach((col, index) => {
    if (headers.indexOf(col) === -1) {
      sheet.getRange(1, lastCol + 1 + added).setValue(col).setFontWeight('bold');
      added++;
    }
  });
  
  return { success: true, message: `Added ${added} leave quota columns.` };
}

/**
 * Cleanup and Repair for Journals table
 * Ensures all rows have an ID and a status
 */
/**
 * Ensure all leave quota columns exist in Employees sheet
 */
function syncLeaveQuotas() {
  const sheet = getSheet('Employees');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const requiredCols = [
    'leave_annual_used',
    'leave_sick_used',
    'leave_maternity_used',
    'leave_large_used',
    'leave_important_used'
  ];
  
  let added = false;
  requiredCols.forEach(col => {
    if (headers.indexOf(col) === -1) {
      const lastCol = sheet.getLastColumn();
      sheet.getRange(1, lastCol + 1).setValue(col);
      headers.push(col); // Update local headers array
      added = true;
    }
  });
  
  return { success: true, message: added ? 'Added missing quota columns.' : 'All quota columns already exist.' };
}

/**
 * Merge data from any duplicate NIP columns into the official 'nip' column
 */
function rescueNIPData() {
  const sheet = getSheet('Employees');
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1) return { success: true, message: 'No data to rescue.' };
  
  const range = sheet.getRange(1, 1, lastRow, lastCol);
  const data = range.getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  
  const officialNipIdx = headers.indexOf('nip');
  if (officialNipIdx === -1) return { success: false, error: 'Official nip column not found.' };
  
  // Find ALL columns that look like NIP (nip, NIP, N.I.P, etc.)
  const allNipIndices = [];
  headers.forEach((h, i) => {
    if (h === 'nip' || h === 'nik' || h.replace(/\./g, '') === 'nip') {
      allNipIndices.push(i);
    }
  });
  
  if (allNipIndices.length <= 1) return { success: true, message: 'No duplicate NIP columns found.' };
  
  let mergedCount = 0;
  for (let i = 1; i < data.length; i++) {
    let valueToUse = data[i][officialNipIdx];
    
    // Check other NIP columns if official is empty
    if (!valueToUse || valueToUse === '') {
      for (let j = 0; j < allNipIndices.length; j++) {
        const colIdx = allNipIndices[j];
        if (colIdx !== officialNipIdx && data[i][colIdx]) {
          valueToUse = data[i][colIdx];
          mergedCount++;
          break;
        }
      }
    }
    
    if (valueToUse !== data[i][officialNipIdx]) {
      sheet.getRange(i + 1, officialNipIdx + 1).setValue(valueToUse);
    }
  }
  
  return { success: true, message: `Successfully merged and rescued ${mergedCount} NIP values from duplicate columns.` };
}

function migrateJournalColumns() {
  const ss = SpreadsheetApp.openById('1_-gvj8S-xkJX1CzJT9HtAGognqjctyBLBl47o4KnwVM');
  const sheet = ss.getSheetByName('Journals');
  if (!sheet) return { success: false, error: 'Sheet Journals not found' };

  // 1. Ensure headers via repairDatabase
  repairDatabase();

  // 2. Load data
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: true, message: 'No journals to migrate.' };

  const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  const headers = data[0];
  const idIdx = headers.indexOf('id');
  const statusIdx = headers.indexOf('status');
  const userIdx = headers.indexOf('userId');

  let idCount = 0;
  let statusCount = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    // Fill missing ID
    if (idIdx !== -1 && (!row[idIdx] || row[idIdx] === '')) {
      const newId = 'jur_' + Math.random().toString(36).substring(2, 9);
      sheet.getRange(i + 1, idIdx + 1).setValue(newId);
      idCount++;
    }

    // Fill missing Status
    if (statusIdx !== -1 && (!row[statusIdx] || row[statusIdx] === '')) {
      sheet.getRange(i + 1, statusIdx + 1).setValue('pending');
      statusCount++;
    }
  }

  return { 
    success: true, 
    message: `Migrated journals: Fixed ${idCount} missing IDs and ${statusCount} missing statuses.` 
  };
}

/**
 * Update all existing journal photos to use thumbnail format
 */
function repairJournalPhotoLinks() {
  const sheet = getSheet('Journals');
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: true, message: 'No journals to repair.' };

  const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  const headers = data[0];
  const photoIdx = headers.indexOf('photo');
  const idIdx = headers.indexOf('id');

  if (photoIdx === -1) return { success: false, error: 'Photo column not found.' };

  let count = 0;
  // Regex to extract drive ID from various formats
  const driveRegex = /(?:id=)([a-zA-Z0-9_-]{25,})/;

  for (let i = 1; i < data.length; i++) {
    const photoUrl = String(data[i][photoIdx]);
    if (photoUrl.includes('drive.google.com') && !photoUrl.includes('thumbnail')) {
      const match = photoUrl.match(driveRegex);
      if (match && match[1]) {
        const newUrl = 'https://drive.google.com/thumbnail?id=' + match[1] + '&sz=w800';
        sheet.getRange(i + 1, photoIdx + 1).setValue(newUrl);
        count++;
      }
    }
  }

  return { success: true, message: `Repaired ${count} journal photo links.` };
}
