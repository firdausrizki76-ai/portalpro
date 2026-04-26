/**
 * Portal Karyawan - Main Entry Point
 * Handles doGet/doPost routing and CORS
 */

// ========== WEB APP ENTRY POINTS ==========

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    const params = e.parameter || {};
    
    // Parse POST body if exists
    let postData = {};
    if (e.postData) {
      try {
        postData = JSON.parse(e.postData.contents);
      } catch (err) {
        postData = {};
      }
    }
    
    // Merge params and postData - postData takes priority
    const data = { ...params, ...postData };
    
    // Get action from merged data (could be in URL params or POST body)
    const action = data.action || '';
    
    let result;
    
    switch (action) {
      // ---- Database Init ----
      case 'initDatabase':
        result = initDatabase();
        break;
      case 'repairDatabase':
        result = repairDatabase();
        break;
      case 'runFinalMigration':
        result = migrateAttendanceSchema();
        break;
      case 'migrateEmployee':
        result = migrateEmployeeSchema();
        break;
      case 'migrateLeaveQuotas':
        result = migrateLeaveQuotas();
        break;
      case 'migrateJournal':
        result = migrateJournalColumns();
        break;
      case 'repairJournalPhotos':
        result = repairJournalPhotoLinks();
        break;
      case 'syncLeaveQuotas':
        result = syncLeaveQuotas();
        break;
      case 'restoreMissingNIPs':
        result = restoreMissingNIPs();
        break;
      case 'inspectEmployeesSheet':
        result = inspectEmployeesSheet();
        break;
      case 'rescueNIPData':
        result = rescueNIPData();
        break;

      // ---- Auth ----
      case 'login':
        result = handleLogin(data.email, data.password);
        break;
      case 'changePassword':
        result = changePasswordData(data.userId, data.oldPassword, data.newPassword);
        break;
      case 'getEmployeeProfile':
        result = getEmployeeProfile(data.userId);
        break;
      case 'updateOnlineStatus':
        result = updateOnlineStatus(data.userId, data.isOnline);
        break;

      // ---- Attendance ----
      case 'getAttendance':
        result = getAttendance(data.userId);
        break;
      case 'getTodayAttendance':
        result = getTodayAttendance(data.userId);
        break;
      case 'saveAttendance':
        result = saveAttendanceData(data);
        break;
      case 'getAllAttendance':
        result = getAllAttendanceData(data.month);
        break;
      case 'downloadAttendancePDF':
        result = generateAttendanceSummaryPDF(data.month);
        break;

      // ---- Journals ----
      case 'getJournals':
        result = getJournals(data.userId);
        break;
      case 'saveJournal':
        result = saveJournalData(data);
        break;
      case 'getAllJournals':
        result = getAllJournalsData(data.month);
        break;
      case 'deleteJournal':
        result = deleteJournalData(data.userId || data.email, data.date, data.id);
        break;
      case 'approveJournal':
        result = approveJournalData(data.id);
        break;
      case 'rejectJournal':
        result = rejectJournalData(data.id);
        break;
      case 'downloadJournalPDF':
        result = generateJournalPDF(data.userId, data.month);
        break;

      // ---- Leaves ----
      case 'getLeaves':
        result = getLeaves(data.userId);
        break;
      case 'submitLeave':
        result = submitLeaveData(data);
        break;
      case 'approveLeave':
        result = approveLeaveData(data.id);
        break;
      case 'rejectLeave':
        result = rejectLeaveData(data.id);
        break;
      case 'getAllLeaves':
        result = getAllLeavesData(data.month);
        break;
      case 'downloadLeavePDF':
        result = generateLeaveSummaryPDF(data.month);
        break;

      // ---- Izin / Permission (WFH/WFA/Dinas) ----
      case 'getIzin':
        result = getIzinData(data.userId);
        break;
      case 'submitIzin':
        result = submitIzinData(data);
        break;
      case 'approveIzin':
        result = approveIzinData(data.id);
        break;
      case 'rejectIzin':
        result = rejectIzinData(data.id);
        break;
      case 'getAllIzin':
        result = getAllIzinData(data.month);
        break;
      case 'getActiveWfhPermit':
        result = getActiveWfhPermit(data.userId);
        break;

      // ---- Employees ----
      case 'getEmployees':
        result = getEmployeesData();
        break;
      case 'addEmployee':
        result = addEmployeeData(data);
        break;
      case 'updateEmployee':
        result = updateEmployeeData(data.id, data);
        break;
      case 'deleteEmployee':
        result = deleteEmployeeData(data.id);
        break;

      // ---- Notifications ----
      case 'getNotifications':
        result = getNotifications(data.userId);
        break;
      case 'addNotification':
        result = addNotification(data.recipientId, data.type, data.user, data.action);
        break;
      case 'clearNotifications':
        result = clearNotifications(data.userId);
        break;

      // ---- Settings ----
      case 'getSettings':
        result = getSettingsData();
        break;
      case 'saveSetting':
        result = saveSettingData(data.key, data.value);
        break;
      case 'syncDailyShifts':
        result = autoUpdateDailyShifts();
        break;
      case 'setupDailyTrigger':
        result = setupDailyTrigger();
        break;
      case 'autoProcessRequests':
        result = autoProcessRequests();
        break;
      case 'debugSettings':
        if (typeof getAllRows !== 'undefined') {
          result = { success: true, data: getAllRows('Settings') };
        } else {
          result = { success: false, error: 'Database function getAllRows not found' };
        }
        break;

      // ---- Shifts ----
      case 'getShifts':
        result = getShiftsData();
        break;
      case 'addShift':
        result = addShiftData(data);
        break;
      case 'updateShift':
        result = updateShiftData(data.id, data);
        break;
      case 'deleteShift':
        result = deleteShiftData(data.id);
        break;

      // ---- Schedule ----
      case 'getSchedule':
        result = getScheduleData(data.month, data.year);
        break;
      case 'saveSchedule':
        result = saveScheduleData(data);
        break;

      // ---- AI Face Recognition ----
      case 'registerFace':
        result = registerFaceData(data.userId, data.descriptor, data.photo);
        break;

      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }
    
    return sendResponse(result);
    
  } catch (error) {
    return sendResponse({ 
      success: false, 
      error: error.message || 'Internal server error' 
    });
  }
}

// ========== RESPONSE HELPER ==========

function sendResponse(data) {
  const output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}
