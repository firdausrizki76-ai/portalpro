/**
 * Portal Karyawan - Journal
 * Daily work journal endpoints
 */

function getJournals(userId) {
  if (!userId) {
    return { success: false, error: 'userId is required' };
  }
  
  const rows = findRows('Journals', 'userId', userId);
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  
  return { success: true, data: rows };
}

function saveJournalData(data) {
  if (!data.userId || !data.date) {
    return { success: false, error: 'userId and date are required' };
  }
  
  // Handle Photo Storage in Drive
  if (data.photo && data.photo.length > 500) { // Check if it's base64, not a URL
    try {
      const photoId = saveJournalPhotoToDrive(data.userId, data.date, data.photo);
      data.photo = 'https://drive.google.com/thumbnail?id=' + photoId + '&sz=w800';
    } catch (e) {
      console.warn('Gagal menyimpan foto jurnal ke Drive: ' + e.toString());
      // Non-fatal, just log it
    }
  }
  
  // Check if journal exists for this user+date (upsert)
  const allRows = getAllRows('Journals');
  const existing = allRows.find(row => 
    String(row.userId) === String(data.userId) && String(row.date) === String(data.date)
  );
  
  data.updatedAt = new Date().toISOString();
  
  if (existing && existing.id) {
    const updated = updateRow('Journals', existing.id, data);
    return { success: true, data: updated };
  } else {
    data.id = getNextId('Journals');
    if (!data.status) data.status = 'pending';
    addRow('Journals', data);
    return { success: true, data: data };
  }
}

/**
 * Save Journal Photo to Drive Subfolder
 */
function saveJournalPhotoToDrive(userId, date, photoBase64) {
  const rootFolderName = 'SIAP_Face_Registration';
  const subFolderName = 'foto foto jurnal';
  
  // Find or create root folder
  let rootFolder;
  const roots = DriveApp.getFoldersByName(rootFolderName);
  if (roots.hasNext()) {
    rootFolder = roots.next();
  } else {
    rootFolder = DriveApp.createFolder(rootFolderName);
  }
  
  // Find or create subfolder
  let subFolder;
  const subs = rootFolder.getFoldersByName(subFolderName);
  if (subs.hasNext()) {
    subFolder = subs.next();
  } else {
    subFolder = rootFolder.createFolder(subFolderName);
  }
  
  // Clean up old photo for this same day if exists
  const existingFiles = subFolder.getFilesByName('JURNAL_' + userId + '_' + date + '.png');
  while (existingFiles.hasNext()) {
    existingFiles.next().setTrashed(true);
  }

  // Save new file
  const contentType = photoBase64.substring(5, photoBase64.indexOf(';'));
  const bytes = Utilities.base64Decode(photoBase64.split(',')[1]);
  const blob = Utilities.newBlob(bytes, contentType, 'JURNAL_' + userId + '_' + date + '.png');
  const file = subFolder.createFile(blob);
  
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return file.getId();
}

function getAllJournalsData(month) {
  const sheet = getSheet('Journals');
  // Check if headers are valid
  if (sheet.getLastRow() > 0) {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headers.indexOf('date') === -1) {
      console.warn('Journal Date header missing. Repairing...');
      repairDatabase();
    }
  }

  const allRows = getAllRows('Journals');
  let rows = allRows;
  
  if (month) {
    rows = allRows.filter(r => {
      const d = String(r.date || '');
      if (d && !d.includes('-')) return true; // Let dirty/invalid data pass through
      return d && d.startsWith(month);
    });
  }
  
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { success: true, data: rows };
}

/**
 * Generate PDF Recap for Journal
 */
function generateJournalPDF(userId, month) {
  try {
    const emp = findRow('Employees', 'id', userId);
    if (!emp) return { success: false, error: 'Pegawai tidak ditemukan' };
    
    const journalsResult = getAllJournalsData(month);
    const journals = (journalsResult.data || []).filter(j => String(j.userId) === String(userId));
    
    // Sort journals by date ascending for the report
    journals.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    
    const monthName = getIndonesianMonthName(month);
    
    let html = `
    <html>
    <head>
      <style>
        @page { size: 8.5in 13in; margin: 0.5in; }
        body { font-family: 'Times New Roman', serif; padding: 0.2in; font-size: 11pt; line-height: 1.3; color: #000; }
        .header { margin-bottom: 25px; }
        .header table { width: 100%; border: none; }
        .header td { padding: 2px 0; vertical-align: top; }
        .header .label { width: 120px; }
        .title { text-align: center; font-weight: bold; font-size: 12pt; margin-bottom: 25px; line-height: 1.4; }
        table.main { width: 100%; border-collapse: collapse; table-layout: fixed; }
        table.main th, table.main td { border: 1px solid black; padding: 8px; vertical-align: top; word-wrap: break-word; }
        th { background-color: #f8f8f8; text-align: center; font-weight: bold; font-size: 10pt; }
        .center { text-align: center; }
        .list-item { margin-bottom: 4px; display: table; width: 100%; }
        .bullet { display: table-cell; width: 15px; }
        .text { display: table-cell; }
        .diamond { color: #333; font-weight: bold; padding-right: 5px; }
        .arrow { color: #333; font-weight: bold; padding-right: 5px; }
        .libur-text { color: #cc0000; font-weight: bold; }
        .footer { margin-top: 40px; }
        .footer table { width: 100%; border: none; }
        .footer td { text-align: center; width: 50%; vertical-align: top; }
        .img-container { text-align: center; }
        .jurnal-img { max-width: 80px; max-height: 60px; border: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="header">
        <table>
          <tr><td class="label">Nama</td><td>: ${emp.name}</td></tr>
          <tr><td class="label">Jenis Pekerjaan</td><td>: ${emp.position || '-'}</td></tr>
          <tr><td class="label">Unit Kerja</td><td>: ${emp.department || '-'}</td></tr>
          <tr><td class="label">Bulan</td><td>: ${monthName}</td></tr>
        </table>
      </div>
      
      <div class="title">FORMAT LAPORAN HARIAN BAGI PELAKSANA KEGIATAN TIDAK TETAP<br>DI LINGKUNGAN PEMERINTAH DAERAH KOTA DEPOK</div>
      
      <table class="main">
        <thead>
          <tr>
            <th style="width: 30px;">No</th>
            <th style="width: 100px;">Tanggal</th>
            <th>Uraian Laporan Pekerjaan</th>
            <th>Hasil Pekerjaan</th>
            <th style="width: 90px;">Foto Kegiatan</th>
          </tr>
        </thead>
        <tbody>`;
        
    if (journals.length === 0) {
      html += `<tr><td colspan="5" class="center" style="padding: 40px;">Tidak ada laporan untuk periode ini</td></tr>`;
    } else {
      journals.forEach((j, index) => {
        const d = new Date(j.date);
        const dayOfWeek = d.getDay();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        const isLibur = (j.tasks && j.tasks.toLowerCase().includes('libur'));
        const rowStyle = (isWeekend || isLibur) ? 'libur-text' : '';
        
        const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        
        const tasksHtml = (j.tasks || '-').split('\n').filter(t => t.trim()).map(t => 
          `<div class="list-item"><span class="bullet diamond">◆</span><span class="text ${rowStyle}">${t}</span></div>`
        ).join('');
        
        const achievementsHtml = (j.achievements || '-').split('\n').filter(t => t.trim()).map(t => 
          `<div class="list-item"><span class="bullet arrow">➢</span><span class="text ${rowStyle}">${t}</span></div>`
        ).join('');
        
        const photoHtml = j.photo ? `
          <div class="img-container">
            <img src="${j.photo}" class="jurnal-img">
          </div>
        ` : '-';
        
        html += `
          <tr class="${rowStyle}">
            <td class="center ${rowStyle}">${index + 1}</td>
            <td class="center ${rowStyle}">${dateStr}</td>
            <td>${tasksHtml}</td>
            <td>${achievementsHtml}</td>
            <td class="center">${photoHtml}</td>
          </tr>`;
      });
      
      const emptyCount = Math.max(0, 10 - journals.length);
      for (let i = 0; i < emptyCount; i++) {
        html += `<tr><td style="height: 30px;"></td><td></td><td></td><td></td><td></td></tr>`;
      }
    }
    
    html += `
        </tbody>
      </table>
      
      <div class="footer">
        <table>
          <tr>
            <td>
              Mengetahui,<br>Atasan Langsung<br><br><br><br><br>
              <strong>( .................................... )</strong>
            </td>
            <td>
              Depok, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<br>
              Pegawai,<br><br><br><br><br>
              <strong>( ${emp.name} )</strong>
            </td>
          </tr>
        </table>
      </div>
    </body>
    </html>`;
    
    const blob = HtmlService.createHtmlOutput(html).getAs('application/pdf');
    const base64 = Utilities.base64Encode(blob.getBytes());
    
    return { success: true, data: base64, filename: `Jurnal_${emp.name}_${month}.pdf` };
    
  } catch (e) {
    console.error('generateJournalPDF error:', e);
    return { success: false, error: e.toString() };
  }
}

/**
 * Delete a journal entry
 */
/**
 * Delete a journal entry
 */
function approveJournalData(id) {
  try {
    const updated = updateRow('Journals', id, { status: 'approved' });
    if (updated) return { success: true, message: 'Jurnal berhasil disetujui' };
    return { success: false, error: 'Gagal menyetujui jurnal' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function rejectJournalData(id) {
  try {
     const updated = updateRow('Journals', id, { status: 'rejected' });
     if (updated) return { success: true, message: 'Jurnal ditolak' };
     return { success: false, error: 'Gagal menolak jurnal' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function deleteJournalData(userId, date, id) {
  try {
    // 1. Try ID-based deletion (robust)
    if (id) {
       const deleted = deleteRow('Journals', id);
       if (deleted) return { success: true, message: 'Jurnal berhasil dihapus (by ID)' };
    }

    const sheet = getSheet('Journals');
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: false, error: 'Tidak ada data jurnal' };
    
    const headers = data[0];
    const userCol = headers.indexOf('userId');
    const dateCol = headers.indexOf('date');
    
    if (userCol === -1 || dateCol === -1) {
      return { success: false, error: 'Struktur database tidak valid' };
    }
    
    // Use a robust date comparison helper
    const tz = getSpreadsheet().getSpreadsheetTimeZone();
    const normalizeDate = (d) => {
      if (!d) return "";
      try {
        const dateObj = (d instanceof Date) ? d : new Date(d);
        if (isNaN(dateObj.getTime())) return String(d).split('T')[0].split(' ')[0];
        // Using Spreadsheet timezone (e.g., GMT+7) ensures consistency with what's stored
        return Utilities.formatDate(dateObj, tz, "yyyy-MM-dd");
      } catch (e) {
        return String(d).split('T')[0].split(' ')[0];
      }
    };

    const targetDate = normalizeDate(date);
    
    // Search from bottom to top to handle multiple deletions if necessary (though we only delete one)
    for (let i = data.length - 1; i >= 1; i--) {
        const rowUser = String(data[i][userCol]).trim();
        const rowDateValue = data[i][dateCol];
        const rowDate = normalizeDate(rowDateValue);
        
        if (rowUser === String(userId).trim() && rowDate === targetDate) {
            sheet.deleteRow(i + 1);
            return { success: true, message: 'Jurnal berhasil dihapus (fallback matching)' };
        }
    }
    return { success: false, error: 'Jurnal tidak ditemukan untuk tanggal tersebut (Internal Date: ' + targetDate + ')' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function getIndonesianMonthName(monthStr) {
  if (!monthStr || !monthStr.includes('-')) return monthStr;
  const [year, month] = monthStr.split('-');
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${months[parseInt(month) - 1]} ${year}`;
}

/**
 * Debug function to inspect raw journal data types
 */
function debugGetJournals(userId) {
  const sheet = getSheet('Journals');
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const headers = data[0];
  const userCol = headers.indexOf('userId');
  
  const results = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][userCol]) === String(userId)) {
      const row = data[i];
      const entryDetail = [];
      headers.forEach((h, idx) => {
        const val = row[idx];
        entryDetail.push({
          header: h,
          value: val,
          type: typeof val,
          isDate: val instanceof Date,
          asString: String(val)
        });
      });
      results.push(entryDetail);
    }
  }
  return results;
}
