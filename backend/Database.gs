/**
 * Portal Karyawan - Database Helper
 * Generic CRUD operations for Google Sheets
 * 
 * PENTING: Ganti SPREADSHEET_ID dengan ID spreadsheet kamu
 */

// ========== KONFIGURASI ==========
const SPREADSHEET_ID = '1_-gvj8S-xkJX1CzJT9HtAGognqjctyBLBl47o4KnwVM';

// Cache spreadsheet reference
let _spreadsheet = null;

function getSpreadsheet() {
  if (!_spreadsheet) {
    _spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return _spreadsheet;
}

function getSheet(sheetName) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

// ========== INIT DATABASE ==========
function initDatabase() {
  const sheets = {
    'Users': ['id', 'name', 'email', 'password', 'role', 'avatar', 'createdAt'],
    'Employees': ['id', 'name', 'email', 'nip', 'department', 'position', 'shift', 'lokasiKerja', 'status', 'joinDate', 'avatar', 'password', 'isOnline', 'faceData', 'facePhotoId', 'leave_annual_used', 'leave_sick_used', 'leave_maternity_used', 'leave_large_used', 'leave_important_used'],
    'Attendance': ['id', 'userId', 'date', 'shift', 'clockIn', 'clockOut', 'locationName', 'status', 'verificationInPhoto', 'verificationInLocation', 'verificationInTimestamp', 'verificationOutPhoto', 'verificationOutLocation', 'verificationOutTimestamp'],
    'Journals': ['id', 'userId', 'date', 'tasks', 'achievements', 'obstacles', 'plan', 'photo', 'updatedAt', 'status'],
    'Leaves': ['id', 'userId', 'employeeName', 'nip', 'jabatan', 'masaKerja', 'type', 'typeLabel', 'startDate', 'endDate', 'duration', 'alamatCuti', 'telpCuti', 'reason', 'status', 'appliedAt'],
    'Izin': ['id', 'userId', 'employeeName', 'nip', 'jabatan', 'masaKerja', 'type', 'typeLabel', 'startDate', 'endDate', 'duration', 'alamatIzin', 'telpIzin', 'reason', 'status', 'hasAttachment', 'verificationPhoto', 'verificationLocation', 'verificationTimestamp', 'appliedAt'],
    'Settings': ['key', 'value'],
    'Shifts': ['id', 'name', 'startTime', 'endTime'],
    'Notifications': ['id', 'recipientId', 'type', 'user', 'action', 'time', 'isRead']
  };

  const ss = getSpreadsheet();
  
  Object.entries(sheets).forEach(([sheetName, headers]) => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else {
      // Check if headers exist
      const firstRow = sheet.getRange(1, 1, 1, sheet.getMaxColumns()).getValues()[0];
      const hasHeaders = firstRow.some(cell => cell !== '');
      if (!hasHeaders) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
        sheet.setFrozenRows(1);
      }
    }
  });

  // Seed default data
  seedDefaultData();
  
  // Automasi: Pasang trigger weker shift jam 00:00 untuk sinkronisasi harian otomatis
  try {
    setupDailyTrigger();
  } catch (e) {
    console.error("Gagal menginisialisasi trigger harian:", e);
  }
  
  return { success: true, message: 'Database initialized successfully' };
}

function repairDatabase() {
  const ss = getSpreadsheet();
  const sheetsDef = {
    'Users': ['id', 'name', 'email', 'password', 'role', 'avatar', 'createdAt'],
    'Employees': ['id', 'name', 'email', 'nip', 'department', 'position', 'shift', 'lokasiKerja', 'status', 'joinDate', 'avatar', 'password', 'isOnline', 'faceData', 'facePhotoId', 'leave_annual_used', 'leave_sick_used', 'leave_maternity_used', 'leave_large_used', 'leave_important_used'],
    'Attendance': ['id', 'userId', 'date', 'shift', 'clockIn', 'clockOut', 'locationName', 'status', 'verificationInPhoto', 'verificationInLocation', 'verificationInTimestamp', 'verificationOutPhoto', 'verificationOutLocation', 'verificationOutTimestamp'],
    'Journals': ['id', 'userId', 'date', 'tasks', 'achievements', 'obstacles', 'plan', 'photo', 'updatedAt', 'status'],
    'Leaves': ['id', 'userId', 'employeeName', 'nip', 'jabatan', 'masaKerja', 'type', 'typeLabel', 'startDate', 'endDate', 'duration', 'alamatCuti', 'telpCuti', 'reason', 'status', 'appliedAt'],
    'Izin': ['id', 'userId', 'employeeName', 'nip', 'jabatan', 'masaKerja', 'type', 'typeLabel', 'startDate', 'endDate', 'duration', 'alamatIzin', 'telpIzin', 'reason', 'status', 'hasAttachment', 'verificationPhoto', 'verificationLocation', 'verificationTimestamp', 'appliedAt'],
    'Settings': ['key', 'value'],
    'Shifts': ['id', 'name', 'startTime', 'endTime'],
    'Notifications': ['id', 'recipientId', 'type', 'user', 'action', 'time', 'isRead']
  };

  Object.entries(sheetsDef).forEach(([sheetName, expectedHeaders]) => {
    const sheet = getSheet(sheetName);
    if (!sheet) return;
    
    // 1. Check for missing columns in the middle and insert them
    let currentHeaders = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
    let headersChanged = false;
    
    expectedHeaders.forEach((expected, index) => {
      // Find if this expected header exists anywhere in current headers
      const actualIndex = currentHeaders.indexOf(expected);
      
      if (actualIndex === -1) {
        // Missing! Insert it at the correct index (1-indexed)
        console.warn(`Repair [${sheetName}]: Missing column "${expected}" at position ${index + 1}. Inserting...`);
        sheet.insertColumnBefore(index + 1);
        sheet.getRange(1, index + 1).setValue(expected).setFontWeight('bold');
        // Refresh current headers after insertion
        currentHeaders = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
        headersChanged = true;
      }
    });

    // 2. Force the correct headers in the first row to ensure exact naming/casing
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]).setFontWeight('bold');
    

    sheet.setFrozenRows(1);
  });
  
  // Backfill dates for Journals
  backfillJournalDates();
  
  // Surgical Migration for Attendance (Insert missing columns and fix alignment)
  try {
    migrateAttendanceSchema();
    migrateAttendanceStatuses();
  } catch (e) {
    console.error("Migration Error:", e);
  }
  
  // Ensure essential settings exist
  const essentialSettings = {
    'face_match_threshold': '80',
    'max_attendance_distance': '100',
    'require_face_recognition': 'true',
    'require_location_tracking': 'true',
    'late_tolerance': '15',
    'office_lat_2': '0',
    'office_lng_2': '0',
    'office_lat_3': '0',
    'office_lng_3': '0',
    'office_lat_4': '0',
    'office_lng_4': '0',
    'office_lat_5': '0',
    'office_lng_5': '0'
  };
  
  const currentSettings = getSettingsData().data || {};
  Object.entries(essentialSettings).forEach(([key, defaultValue]) => {
    if (currentSettings[key] === undefined) {
      console.warn(`Repair: Adding missing setting "${key}" with default "${defaultValue}"`);
      saveSettingData(key, defaultValue);
    }
  });
  
  return { success: true, message: 'Database schema repaired and aligned. Essential settings verified.' };
}

function backfillJournalDates() {
  const sheet = getSheet('Journals');
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getDisplayValues();
  const headers = data[0];
  const dateIdx = headers.indexOf('date');
  const updatedAtIdx = headers.indexOf('updatedAt');

  if (dateIdx === -1) return;

  for (let i = 1; i < data.length; i++) {
    const currentDate = data[i][dateIdx];
    if (!currentDate || currentDate === '') {
      // Use updatedAt as fallback if available
      let fallbackDate = '';
      if (updatedAtIdx !== -1 && data[i][updatedAtIdx]) {
        try {
          fallbackDate = data[i][updatedAtIdx].split('T')[0];
        } catch (e) {
          fallbackDate = new Date().toISOString().split('T')[0];
        }
      } else {
        fallbackDate = new Date().toISOString().split('T')[0];
      }
      
      if (fallbackDate) {
        sheet.getRange(i + 1, dateIdx + 1).setValue(fallbackDate);
      }
    }
  }
}

function seedDefaultData() {
  // Seed admin user if Users sheet is empty
  const usersSheet = getSheet('Users');
  if (usersSheet.getLastRow() <= 1) {
    const adminUser = [1, 'Admin User', 'admin@company.com', 'admin123', 'admin', 
                       'https://ui-avatars.com/api/?name=Admin&background=F59E0B&color=fff', 
                       new Date().toISOString()];
    const employeeUser = [2, 'Dewi Karyawan', 'karyawan@company.com', 'karyawan123', 'karyawan',
                          'https://ui-avatars.com/api/?name=Dewi&background=3B82F6&color=fff',
                          new Date().toISOString()];
    usersSheet.appendRow(adminUser);
    usersSheet.appendRow(employeeUser);
  }

  // Seed default shifts
  const shiftsSheet = getSheet('Shifts');
  if (shiftsSheet.getLastRow() <= 1) {
    shiftsSheet.appendRow([1, 'Pagi', '08:00', '17:00']);
    shiftsSheet.appendRow([2, 'Siang', '14:00', '23:00']);
    shiftsSheet.appendRow([3, 'Malam', '23:00', '08:00']);
  }

  // Seed default settings
  const settingsSheet = getSheet('Settings');
  if (settingsSheet.getLastRow() <= 1) {
    settingsSheet.appendRow(['company_name', 'SIAP-P3KPW']);
    settingsSheet.appendRow(['company_logo', '']);
    settingsSheet.appendRow(['face_match_threshold', '80']);
    settingsSheet.appendRow(['max_attendance_distance', '100']);
    settingsSheet.appendRow(['office_lat', '']);
    settingsSheet.appendRow(['office_lng', '']);
    settingsSheet.appendRow(['require_face_recognition', 'true']);
    settingsSheet.appendRow(['require_location_tracking', 'true']);
    settingsSheet.appendRow(['late_tolerance', '15']);
  }

  // Seed default employees
  const empSheet = getSheet('Employees');
  if (empSheet.getLastRow() <= 1) {
    const employees = [
      [1, 'Ahmad Rizky', 'ahmad@company.com', 'EMP001', 'IT', 'Developer', 'Pagi', 'active', '2024-01-15', 'https://ui-avatars.com/api/?name=Ahmad&background=3B82F6&color=fff', '1234', false, null, null, 0, 0, 0, 0, 0],
      [2, 'Budi Santoso', 'budi@company.com', 'EMP002', 'HR', 'HR Manager', 'Pagi', 'active', '2023-06-01', 'https://ui-avatars.com/api/?name=Budi&background=10B981&color=fff', '1234', false, null, null, 0, 0, 0, 0, 0],
      [3, 'Citra Dewi', 'citra@company.com', 'EMP003', 'Finance', 'Accountant', 'Pagi', 'on-leave', '2024-03-10', 'https://ui-avatars.com/api/?name=Citra&background=F59E0B&color=fff', '1234', false, null, null, 0, 0, 0, 0, 0],
      [4, 'Dedi Pratama', 'dedi@company.com', 'EMP004', 'Marketing', 'Marketing Staff', 'Siang', 'active', '2024-02-20', 'https://ui-avatars.com/api/?name=Dedi&background=EF4444&color=fff', '1234', false, null, null, 0, 0, 0, 0, 0],
      [5, 'Eka Putri', 'eka@company.com', 'EMP005', 'IT', 'UI/UX Designer', 'Pagi', 'active', '2024-01-05', 'https://ui-avatars.com/api/?name=Eka&background=8B5CF6&color=fff', '1234', false, null, null, 0, 0, 0, 0, 0],
      [6, 'Fajar Nugraha', 'fajar@company.com', 'EMP006', 'Operations', 'Supervisor', 'Malam', 'inactive', '2023-09-12', 'https://ui-avatars.com/api/?name=Fajar&background=6B7280&color=fff', '1234', false, null, null, 0, 0, 0, 0, 0]
    ];
    employees.forEach(emp => empSheet.appendRow(emp));
  }
}

/**
 * Restore NIPs for employees who don't have one
 */
function restoreMissingNIPs() {
  const sheet = getSheet('Employees');
  const data = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = data[0];
  const nipIdx = headers.indexOf('nip');
  const idIdx = headers.indexOf('id');
  
  if (nipIdx === -1) return { success: false, error: 'NIP column not found' };
  
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    const nipValue = data[i][nipIdx];
    if (!nipValue || String(nipValue).trim() === '') {
      const empId = data[i][idIdx] || i;
      const newNip = 'EMP' + String(empId).padStart(3, '0');
      sheet.getRange(i + 1, nipIdx + 1).setValue(newNip);
      count++;
    }
  }
  
  return { success: true, message: `Restored ${count} missing NIPs.` };
}

// ========== GENERIC CRUD ==========

/**
 * Get all rows from a sheet as array of objects
 */
function getAllRows(sheetName) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) return []; // Only headers or empty
  
  const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getDisplayValues();
  const headers = data[0].map(h => String(h).trim());
  const rows = [];
  
  for (let i = 1; i < data.length; i++) {
    const obj = {};
    headers.forEach((header, j) => {
      if (header) {
        // Map to lowercase key for consistency in app
        obj[header.toLowerCase()] = data[i][j];
        // Also keep original for safety
        obj[header] = data[i][j];
      }
    });
    rows.push(obj);
  }
  
  return rows;
}

/**
 * Find rows matching a condition
 */
function findRows(sheetName, column, value) {
  const allRows = getAllRows(sheetName);
  return allRows.filter(row => String(row[column]) === String(value));
}

/**
 * Find a single row by column value
 */
function findRow(sheetName, column, value) {
  const rows = findRows(sheetName, column, value);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Add a new row to a sheet
 */
function addRow(sheetName, data) {
  const sheet = getSheet(sheetName);
  let headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  
  // Robustness check: if id header is missing, trigger repair
  if (headers.indexOf('id') === -1) {
    console.error(`Missing id header in ${sheetName}. Triggering auto-repair...`);
    repairDatabase();
    // Refresh headers after repair
    headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  }
  
  const row = headers.map(header => {
    return data[header] !== undefined ? data[header] : '';
  });
  
  sheet.appendRow(row);
  return data;
}

/**
 * Update a row by ID
 */
function updateRow(sheetName, id, data) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;
  
  const allData = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getDisplayValues();
  const headers = allData[0];
  const idColIndex = headers.indexOf('id');
  
  if (idColIndex === -1) return null;
  
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][idColIndex]) === String(id)) {
      // Update the row
      headers.forEach((header, j) => {
        if (data[header] !== undefined && header !== 'id') {
          sheet.getRange(i + 1, j + 1).setValue(data[header]);
        }
      });
      return { ...rowToObject(headers, allData[i]), ...data };
    }
  }
  
  return null;
}

/**
 * Delete a row by ID
 */
function deleteRow(sheetName, id) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;
  
  const allData = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getDisplayValues();
  const headers = allData[0];
  const idColIndex = headers.indexOf('id');
  
  if (idColIndex === -1) return false;
  
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][idColIndex]) === String(id)) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  
  return false;
}

/**
 * Update a row by matching column value (not just ID)
 */
function updateRowByColumn(sheetName, column, value, data) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;
  
  const allData = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getDisplayValues();
  const headers = allData[0];
  const colIndex = headers.indexOf(column);
  
  if (colIndex === -1) return null;
  
  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][colIndex]) === String(value)) {
      headers.forEach((header, j) => {
        if (data[header] !== undefined) {
          sheet.getRange(i + 1, j + 1).setValue(data[header]);
        }
      });
      return { ...rowToObject(headers, allData[i]), ...data };
    }
  }
  
  return null;
}

/**
 * Get next auto-increment ID for a sheet
 */
function getNextId(sheetName) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 1;
  
  const allData = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  const headers = allData[0];
  const idColIndex = headers.indexOf('id');
  
  if (idColIndex === -1) return Date.now();
  
  let maxId = 0;
  for (let i = 1; i < allData.length; i++) {
    const id = Number(allData[i][idColIndex]);
    if (id > maxId) maxId = id;
  }
  
  return maxId + 1;
}

/**
 * Convert row array to object using headers
 */
function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((header, i) => {
    obj[header] = row[i];
  });
  return obj;
}
