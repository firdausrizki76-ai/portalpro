/**
 * Portal Karyawan - Notifications Module
 * Handles backend storage and retrieval of user-specific notifications
 */

/**
 * Add a new notification
 */
function addNotification(recipientId, type, user, action) {
  try {
    const sheet = getSheet('Notifications');
    const id = Date.now().toString();
    const time = new Date().toISOString();
    const isRead = 'false';
    
    sheet.appendRow([id, recipientId, type, user, action, time, isRead]);
    return { success: true };
  } catch (e) {
    console.error('addNotification error:', e);
    return { success: false, error: e.toString() };
  }
}

/**
 * Get notifications for a recipient
 */
function getNotifications(recipientId) {
  try {
    const sheet = getSheet('Notifications');
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };
    
    const headers = data[0];
    const recipientCol = headers.indexOf('recipientId');
    const timeCol = headers.indexOf('time');
    
    // Filter by recipientId (either specific userId or 'admin')
    const filtered = [];
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][recipientCol]) === String(recipientId)) {
            const notif = {};
            headers.forEach((h, idx) => {
                notif[h] = data[i][idx];
            });
            filtered.push(notif);
        }
    }
    
    // Sort by time descending (newest first)
    filtered.sort((a, b) => {
      const timeA = a.time ? new Date(a.time).getTime() : 0;
      const timeB = b.time ? new Date(b.time).getTime() : 0;
      return timeB - timeA;
    });
    
    // Return last 20
    return { success: true, data: filtered.slice(0, 20) };
  } catch (e) {
    console.error('getNotifications error:', e);
    return { success: false, error: e.toString() };
  }
}

/**
 * Clear/Mark all as read
 */
function clearNotifications(recipientId) {
  try {
    const sheet = getSheet('Notifications');
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true };
    
    const headers = data[0];
    const recipientCol = headers.indexOf('recipientId');
    
    // Reverse loop to safely delete rows
    for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][recipientCol]) === String(recipientId)) {
            sheet.deleteRow(i + 1);
        }
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}
