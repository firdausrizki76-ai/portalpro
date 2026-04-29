/**
 * Portal Karyawan - Leave (Cuti)
 * Leave request endpoints
 */

function getLeaves(userId) {
  if (!userId) {
    return { success: false, error: 'userId is required' };
  }
  
  const rows = findRows('Leaves', 'userId', userId);
  rows.sort((a, b) => String(b.appliedAt).localeCompare(String(a.appliedAt)));
  
  return { success: true, data: rows };
}

function submitLeaveData(data) {
  if (!data.userId || !data.type || !data.startDate || !data.endDate) {
    return { success: false, error: 'Required fields missing' };
  }
  
  data.id = getNextId('Leaves');
  data.status = 'pending';
  data.appliedAt = new Date().toISOString();
  
  addRow('Leaves', data);
  return { success: true, data: data };
}

function approveLeaveData(id) {
  if (!id) {
    return { success: false, error: 'id is required' };
  }
  
  const leave = findRow('Leaves', 'id', id);
  if (!leave) return { success: false, error: 'Leave not found' };
  if (leave.status === 'approved') return { success: true, data: leave, message: 'Already approved' };

  // Update leave status
  const updated = updateRow('Leaves', id, { status: 'approved' });
  
  if (updated) {
    // Deduct quota from employee
    const userId = updated.userId;
    const type = updated.type;
    const duration = Number(updated.duration || 0);
    
    const typeToCol = {
      'annual': 'leave_annual_used',
      'sick': 'leave_sick_used',
      'maternity': 'leave_maternity_used',
      'large': 'leave_large_used',
      'important': 'leave_important_used'
    };
    
    const colName = typeToCol[type];
    if (colName) {
      const employee = findRow('Employees', 'id', userId);
      if (employee) {
        const currentUsed = Number(employee[colName] || 0);
        const newData = {};
        newData[colName] = currentUsed + duration;
        updateRow('Employees', userId, newData);
      }
    }
    
    return { success: true, data: updated };
  }
  return { success: false, error: 'Failed to update leave status' };
}

function rejectLeaveData(id) {
  if (!id) {
    return { success: false, error: 'id is required' };
  }
  
  const updated = updateRow('Leaves', id, { status: 'rejected' });
  if (updated) {
    return { success: true, data: updated };
  }
  return { success: false, error: 'Leave not found' };
}

function getAllLeavesData(month) {
  const allRows = getAllRows('Leaves');
  let rows = allRows;
  
  if (month) {
    rows = allRows.filter(r => {
      const start = String(r.startDate || '');
      const end = String(r.endDate || '');
      if ((start && !start.includes('-')) || (end && !end.includes('-'))) return true;
      return start.startsWith(month) || end.startsWith(month);
    });
  }
  
  rows.sort((a, b) => String(b.appliedAt).localeCompare(String(a.appliedAt)));
  return { success: true, data: rows };
}

/**
 * Generate PDF Summary for Monthly Leaves/Izin (All Employees)
 */
function generateLeaveSummaryPDF(month, dept, location) {
  try {
    const leaveRes = getAllLeavesData(month);
    const izinRes = getAllIzinData(month);
    
    let approvedLeaves = (leaveRes.data || []).filter(l => l.status === 'approved');
    let approvedIzins = (izinRes.data || []).filter(i => i.status === 'approved');
    
    const monthName = typeof getIndonesianMonthName === 'function' ? getIndonesianMonthName(month) : month;
    const employees = getAllRows('Employees');

    // Filter employees and data by dept/location
    let filteredEmployees = employees;
    if (dept) filteredEmployees = filteredEmployees.filter(e => e.department === dept);
    if (location) filteredEmployees = filteredEmployees.filter(e => (e.lokasiKerja || e.lokasikerja) === location);
    
    const filteredEmpIds = filteredEmployees.map(e => String(e.id));
    approvedLeaves = approvedLeaves.filter(l => filteredEmpIds.includes(String(l.userId)));
    approvedIzins = approvedIzins.filter(i => filteredEmpIds.includes(String(i.userId)));
    
    // ---- Load Signature Data from Settings ----
    const settingsRes = getSettingsData();
    const allSettings = settingsRes.data || {};
    
    // Determine location-based prefix (Kecamatan)
    let targetLocation = location || (filteredEmployees.length > 0 ? (filteredEmployees[0].lokasiKerja || filteredEmployees[0].lokasikerja) : '');
    let sigPrefix = 'signature_';
    
    if (targetLocation && targetLocation !== '-') {
      const cleanLoc = targetLocation.toLowerCase().replace(/kecamatan/g, '').trim().replace(/\s+/g, '_');
      if (cleanLoc) {
        sigPrefix = 'sig_kecamatan_' + cleanLoc + '_';
      }
    }
    
    const kasubagName = allSettings[sigPrefix + 'kasubag_name'] || allSettings['signature_kasubag_name'] || '';
    const kasubagNip = allSettings[sigPrefix + 'kasubag_nip'] || allSettings['signature_kasubag_nip'] || '';
    const camatName = allSettings[sigPrefix + 'camat_name'] || allSettings['signature_camat_name'] || '';
    const camatNip = allSettings[sigPrefix + 'camat_nip'] || allSettings['signature_camat_nip'] || '';
    
    const kasubagDisplay = kasubagName ? `<strong><u>${kasubagName}</u></strong>` + (kasubagNip ? `<br>NIP. ${kasubagNip}` : '') : '<strong>( .................................... )</strong>';
    const camatDisplay = camatName ? `<strong><u>${camatName}</u></strong>` + (camatNip ? `<br>NIP. ${camatNip}` : '') : '<strong>( .................................... )</strong>';
    
    let html = `
    <html>
    <head>
      <style>
        @page { size: A4 landscape; margin: 0.5in; }
        body { font-family: 'Arial', sans-serif; font-size: 10pt; line-height: 1.4; color: #333; }
        .header { text-align: center; margin-bottom: 20px; }
        .header h1 { margin: 0; font-size: 16pt; text-transform: uppercase; color: #e11d48; }
        .header p { margin: 5px 0 0 0; font-size: 11pt; color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ccc; padding: 10px 8px; text-align: left; }
        th { background-color: #f3f4f6; font-weight: bold; text-align: center; font-size: 10pt; }
        .center { text-align: center; }
        .bg-gray { background-color: #f9fafb; }
        .footer { margin-top: 40px; }
        .footer table { border: none; }
        .footer td { border: none; width: 33%; text-align: center; vertical-align: top; }
        .signature-space { height: 70px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Rekapitulasi Cuti dan Izin Pegawai</h1>
        <p>Periode: ${monthName}</p>
      </div>
      
      <table>
        <thead>
          <tr>
            <th style="width: 30px;">No</th>
            <th>Nama Pegawai</th>
            <th>Jenis Pengajuan</th>
            <th>Tanggal</th>
            <th style="width: 80px;">Durasi</th>
            <th>Alasan/Keterangan</th>
          </tr>
        </thead>
        <tbody>`;
    
    const combined = [];
    approvedLeaves.forEach(l => {
      const emp = employees.find(e => String(e.id) === String(l.userId)) || { name: 'Unknown' };
      combined.push({
        name: emp.name,
        type: l.type || 'Cuti',
        dates: `${l.startDate} s/d ${l.endDate}`,
        duration: `${l.duration || 1} Hari`,
        reason: l.reason || '-',
        timestamp: l.appliedAt
      });
    });
    
    approvedIzins.forEach(i => {
      const emp = employees.find(e => String(e.id) === String(i.userId)) || { name: 'Unknown' };
      combined.push({
        name: emp.name,
        type: i.type || 'Izin',
        dates: i.date,
        duration: `${i.duration || 1} Hari`,
        reason: i.reason || '-',
        timestamp: i.appliedAt
      });
    });
    
    // Sort by name or timestamp
    combined.sort((a, b) => a.name.localeCompare(b.name));
    
    if (combined.length === 0) {
      html += `<tr><td colspan="6" class="center" style="padding: 40px;">Tidak ada pengajuan cuti/izin yang disetujui pada periode ini</td></tr>`;
    } else {
      combined.forEach((item, index) => {
        const rowClass = index % 2 === 1 ? 'bg-gray' : '';
        html += `
          <tr class="${rowClass}">
            <td class="center">${index + 1}</td>
            <td>${item.name}</td>
            <td class="center">${item.type}</td>
            <td class="center">${item.dates}</td>
            <td class="center">${item.duration}</td>
            <td>${item.reason}</td>
          </tr>`;
      });
    }
    
    html += `
        </tbody>
      </table>
      
      <div class="footer">
        <table>
          <tr>
            <td>
              Mengetahui,<br>Kepala Bidang<br>
              <div class="signature-space"></div>
              ${kasubagDisplay}
            </td>
            <td></td>
            <td>
              Depok, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<br>
              Admin Kepegawaian<br>
              <div class="signature-space"></div>
              ${camatDisplay}
            </td>
          </tr>
        </table>
      </div>
    </body>
    </html>`;
    
    const blob = HtmlService.createHtmlOutput(html).getAs('application/pdf');
    const base64 = Utilities.base64Encode(blob.getBytes());
    
    return { success: true, data: base64, filename: `Rekap_Cuti_Izin_${month}.pdf` };
    
  } catch (e) {
    console.error('generateLeaveSummaryPDF error:', e);
    return { success: false, error: e.toString() };
  }
}

/**
 * Generate Word (.doc) for single Leave Request
 */
function generateLeaveDoc(id) {
  try {
    const leave = findRow('Leaves', 'id', id);
    if (!leave) return { success: false, error: 'Data cuti tidak ditemukan' };
    
    const emp = findRow('Employees', 'id', leave.userId) || {};
    
    // Determine location-based signature prefix (Kecamatan)
    let targetLocation = emp.lokasiKerja || emp.lokasikerja || '';
    let sigPrefix = 'signature_';
    
    if (targetLocation && targetLocation !== '-') {
      const cleanLoc = targetLocation.toLowerCase().replace(/kecamatan/g, '').trim().replace(/\s+/g, '_');
      if (cleanLoc) {
        sigPrefix = 'sig_kecamatan_' + cleanLoc + '_';
      }
    }
    
    const settingsRes = getSettingsData();
    const allSettings = settingsRes.data || {};
    
    const kasubagName = allSettings[sigPrefix + 'kasubag_name'] || allSettings['signature_kasubag_name'] || '';
    const kasubagNip = allSettings[sigPrefix + 'kasubag_nip'] || allSettings['signature_kasubag_nip'] || '';
    
    // HTML Template for MS Word (.doc)
    const html = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>Formulir Cuti</title>
      <style>
        body { font-family: 'Times New Roman', serif; font-size: 11pt; line-height: 1.2; }
        .header { text-align: center; font-weight: bold; text-decoration: underline; margin-bottom: 20px; }
        .table-form { width: 100%; border-collapse: collapse; }
        .table-form td { padding: 8px; vertical-align: top; border: 1px solid black; }
        .title-row { background-color: #f2f2f2; font-weight: bold; }
        .signature-table { width: 100%; margin-top: 30px; border: none; }
        .signature-table td { border: none; width: 50%; text-align: center; }
        .space { height: 60px; }
      </style>
    </head>
    <body>
      <div class="header">FORMULIR PERMINTAAN DAN PEMBERIAN CUTI</div>
      
      <table class="table-form">
        <tr class="title-row"><td colspan="4">I. DATA PEGAWAI</td></tr>
        <tr>
          <td width="15%">Nama</td><td width="35%">${leave.employeeName || emp.name || '-'}</td>
          <td width="15%">NIP</td><td width="35%">${leave.nip || emp.nip || '-'}</td>
        </tr>
        <tr>
          <td>Jabatan</td><td>${leave.jabatan || emp.position || '-'}</td>
          <td>Masa Kerja</td><td>${leave.masaKerja || '-'}</td>
        </tr>
        <tr>
          <td>Unit Kerja</td><td colspan="3">${emp.department || '-'}</td>
        </tr>
        
        <tr class="title-row"><td colspan="4">II. JENIS CUTI YANG DIAMBIL</td></tr>
        <tr>
          <td colspan="2">1. Cuti Tahunan</td><td colspan="2">${leave.type === 'annual' ? '[ V ]' : '[   ]'}</td>
        </tr>
        <tr>
          <td colspan="2">2. Cuti Besar</td><td colspan="2">${leave.type === 'large' ? '[ V ]' : '[   ]'}</td>
        </tr>
        <tr>
          <td colspan="2">3. Cuti Sakit</td><td colspan="2">${leave.type === 'sick' ? '[ V ]' : '[   ]'}</td>
        </tr>
        <tr>
          <td colspan="2">4. Cuti Melahirkan</td><td colspan="2">${leave.type === 'maternity' ? '[ V ]' : '[   ]'}</td>
        </tr>
        <tr>
          <td colspan="2">5. Cuti Karena Alasan Penting</td><td colspan="2">${leave.type === 'important' ? '[ V ]' : '[   ]'}</td>
        </tr>
        <tr>
          <td colspan="2">6. Cuti di Luar Tanggungan Negara</td><td colspan="2">${leave.type === 'other' ? '[ V ]' : '[   ]'}</td>
        </tr>
        
        <tr class="title-row"><td colspan="4">III. ALASAN CUTI</td></tr>
        <tr><td colspan="4">${leave.reason || '-'}</td></tr>
        
        <tr class="title-row"><td colspan="4">IV. LAMANYA CUTI</td></tr>
        <tr>
          <td>Selama</td><td>${leave.duration || 1} Hari</td>
          <td>Tanggal</td><td>${leave.startDate} s/d ${leave.endDate}</td>
        </tr>
        
        <tr class="title-row"><td colspan="4">V. ALAMAT SELAMA MENJALANKAN CUTI</td></tr>
        <tr>
          <td colspan="2">${leave.alamatCuti || '-'}</td>
          <td>Telepon</td><td>${leave.telpCuti || '-'}</td>
        </tr>
      </table>
      
      <table class="signature-table">
        <tr>
          <td></td>
          <td>
            Hormat Saya,<br><br>
            <div class="space"></div>
            <strong><u>${leave.employeeName || emp.name || ''}</u></strong><br>
            NIP. ${leave.nip || emp.nip || ''}
          </td>
        </tr>
        <tr>
          <td>
            Menyetujui,<br>
            Kepala Sub Bagian Umum dan Kepegawaian<br><br>
            <div class="space"></div>
            <strong><u>${kasubagName || '( ............................ )'}</u></strong><br>
            NIP. ${kasubagNip || ''}
          </td>
          <td></td>
        </tr>
      </table>
    </body>
    </html>`;
    
    const base64 = Utilities.base64Encode(Utilities.newBlob(html, 'application/msword').getBytes());
    return { success: true, data: base64, filename: `Permohonan_Cuti_${leave.employeeName || 'Pegawai'}.doc` };
    
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

