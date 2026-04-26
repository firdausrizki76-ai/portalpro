/**
 * Portal Karyawan - Attendance
 * Attendance/Clock In-Out endpoints
 */

function _parseDateToYMD(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Jakarta', 'yyyy-MM-dd');
  }
  if (typeof val === 'string' && val.length >= 10) {
    return val.substring(0, 10);
  }
  return String(val);
}

function getAttendance(userId) {
  if (!userId) {
    return { success: false, error: 'userId is required' };
  }
  
  const rows = findRows('Attendance', 'userId', userId);
  rows.forEach(r => {
    r.date = _parseDateToYMD(r.date);
    // Reconstruct verification object for frontend UI
    r.verification = {
      photo: r.verificationPhoto || null,
      location: r.verificationLocation ? JSON.parse(r.verificationLocation) : null,
      timestamp: r.verificationTimestamp || null
    };
  });
  
  // Sort by date descending
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  
  return { success: true, data: rows };
}

function getTodayAttendance(userId) {
  if (!userId) {
    return { success: false, error: 'userId is required' };
  }
  
  const today = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
  const allRows = getAllRows('Attendance');
  
  const todayRecord = allRows.find(row => 
    String(row.userId) === String(userId) && _parseDateToYMD(row.date) === today
  );
  
  if (todayRecord) {
    todayRecord.date = _parseDateToYMD(todayRecord.date);
    // Reconstruct verification object for frontend UI
    todayRecord.verification = {
      photo: todayRecord.verificationPhoto || null,
      location: todayRecord.verificationLocation ? JSON.parse(todayRecord.verificationLocation) : null,
      timestamp: todayRecord.verificationTimestamp || null
    };
    return { success: true, data: todayRecord };
  }
  
  // Check if Alfa (more than 1 hour after shift start)
  let status = 'waiting';
  
  // Get user's shift
  let shiftName = 'Pagi'; // default
  const employee = findRow('Employees', 'id', userId) || findRow('Employees', 'email', userId);
  if (employee && employee.shift) {
    shiftName = employee.shift;
  }
  
  const shifts = getAllRows('Shifts');
  const userShift = shifts.find(s => String(s.name) === shiftName);
  
  const now = new Date();
  const nowStr = Utilities.formatDate(now, 'Asia/Jakarta', 'HH:mm');
  const [currentHour, currentMin] = nowStr.split(':').map(Number);
  const currentTimeTotal = currentHour * 60 + currentMin;

  let shiftStartTimeStr = "08:00"; 
  if (userShift && userShift.startTime) {
    if (userShift.startTime instanceof Date) {
      shiftStartTimeStr = Utilities.formatDate(userShift.startTime, 'Asia/Jakarta', 'HH:mm');
    } else {
      shiftStartTimeStr = String(userShift.startTime).substring(0, 5).replace('.', ':');
    }
  }

  const [sH, sM] = shiftStartTimeStr.split(':').map(Number);
  const shiftStartTimeTotal = sH * 60 + sM;
  
  let shiftEndTimeStr = "17:00";
  if (userShift && userShift.endTime) {
    if (userShift.endTime instanceof Date) {
      shiftEndTimeStr = Utilities.formatDate(userShift.endTime, 'Asia/Jakarta', 'HH:mm');
    } else {
      shiftEndTimeStr = String(userShift.endTime).substring(0, 5).replace('.', ':');
    }
  }
  const [eH, eM] = shiftEndTimeStr.split(':').map(Number);
  const shiftEndTimeTotal = eH * 60 + eM;
  
  const isCrossMidnight = shiftStartTimeTotal > shiftEndTimeTotal;
  
  if (isCrossMidnight) {
    if (currentTimeTotal > shiftEndTimeTotal && currentTimeTotal < 720) {
      status = 'Alfa';
    }
  } else {
    if (currentTimeTotal > shiftEndTimeTotal) {
      status = 'Alfa';
    }
  }

  // Return empty template
  return { 
    success: true, 
    data: {
      id: null,
      userId: userId,
      date: today,
      shift: shiftName,
      clockIn: '',
      clockOut: '',
      locationName: '',
      status: status,
      verificationInPhoto: '',
      verificationInLocation: '',
      verificationInTimestamp: '',
      verificationOutPhoto: '',
      verificationOutLocation: '',
      verificationOutTimestamp: ''
    }
  };
}

function saveAttendanceData(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    if (!data.userId || !data.date) {
      return { success: false, error: 'userId and date are required' };
    }

    const nowJakarta = new Date();
    const nowAccurate = Utilities.formatDate(nowJakarta, 'Asia/Jakarta', 'HH:mm');
    const [nowH, nowM] = nowAccurate.split(':').map(Number);
    const nowTotalMin = nowH * 60 + nowM;

    const settingsRows = getAllRows('Settings');
    const workingDaysSetting = settingsRows.find(s => String(s.key) === 'working_days');
    if (workingDaysSetting) {
        try {
            const workingDays = JSON.parse(workingDaysSetting.value);
            const dayNameEng = Utilities.formatDate(nowJakarta, 'Asia/Jakarta', 'EEEE').toLowerCase();
            const dayMap = { 'monday': 'senin', 'tuesday': 'selasa', 'wednesday': 'rabu', 'thursday': 'kamis', 'friday': 'jumat', 'saturday': 'sabtu', 'sunday': 'minggu' };
            if (workingDays[dayMap[dayNameEng]] === false) {
                return { success: false, error: 'anda tidak dapat absen karena hari ini adalah hari libur' };
            }
        } catch (e) {}
    }

    if (String(data.shift) === 'Libur') {
        return { success: false, error: 'anda tidak bisa absen karena hari ini anda dijadwalkan libur' };
    }

    const shifts = getAllRows('Shifts');
    const userShift = shifts.find(s => String(s.name) === String(data.shift));
    let shiftStartMin = 480, shiftEndMin = 1020;
    if (userShift) {
        if (userShift.startTime) {
            const [h, m] = formatTimeValue(userShift.startTime).split(':').map(Number);
            shiftStartMin = (h || 0) * 60 + (m || 0);
        }
        if (userShift.endTime) {
            const [h, m] = formatTimeValue(userShift.endTime).split(':').map(Number);
            shiftEndMin = (h || 0) * 60 + (m || 0);
        }
    }

    if (data.clockIn && !data.clockOut) {
        const isCrossMidnight = shiftStartMin > shiftEndMin;
        if (isCrossMidnight) {
            if (nowTotalMin < shiftStartMin - 60 && nowTotalMin > shiftEndMin) {
                return { success: false, error: 'anda sudah berada di luar range jam absen masuk' };
            }
        } else {
            if (nowTotalMin < shiftStartMin - 60 || nowTotalMin > shiftEndMin) {
                return { success: false, error: 'anda sudah berada di luar range jam absen masuk' };
            }
        }
    }

    if (data.clockOut) {
        if (nowTotalMin > shiftEndMin + 60) {
            return { success: false, error: 'anda sudah berada di luar range jam kerja' };
        }
    }

    const allRows = getAllRows('Attendance');
    const existing = allRows.find(row => String(row.userId) === String(data.userId) && _parseDateToYMD(row.date) === String(data.date));

    let tolerance = 15;
    const toleranceSetting = settingsRows.find(s => String(s.key) === 'late_tolerance');
    if (toleranceSetting) tolerance = parseInt(toleranceSetting.value, 10) || 15;

    const finalClockIn = data.clockIn || (existing ? existing.clockIn : null);
    const finalClockOut = data.clockOut || (existing ? existing.clockOut : null);
    data.status = calculateDetailedAttendanceStatus(finalClockIn, finalClockOut, shiftStartMin, shiftEndMin, tolerance);

    if (data.verification) {
      if (data.clockIn && !data.clockOut) {
        if (data.verification.photo) data.verificationInPhoto = data.verification.photo;
        if (data.verification.location) data.verificationInLocation = JSON.stringify(data.verification.location);
        if (data.verification.timestamp) data.verificationInTimestamp = data.verification.timestamp;
      } else if (data.clockOut) {
        if (data.verification.photo) data.verificationOutPhoto = data.verification.photo;
        if (data.verification.location) data.verificationOutLocation = JSON.stringify(data.verification.location);
        if (data.verification.timestamp) data.verificationOutTimestamp = data.verification.timestamp;
      }
      delete data.verification;
    }

    if (existing && existing.id) {
      if (!data.locationName && existing.locationName) data.locationName = existing.locationName;
      const updated = updateRow('Attendance', existing.id, data);
      return { success: true, data: updated };
    } else {
      data.id = getNextId('Attendance');
      addRow('Attendance', data);
      return { success: true, data: data };
    }
  } catch (error) {
    console.error('Critical saveAttendanceData Error:', error.toString());
    return { success: false, error: 'Database Error: ' + error.toString() };
  } finally {
    lock.releaseLock();
  }
}

function getAllAttendanceData(month) {
  const allRows = getAllRows('Attendance');
  let rows = allRows;
  
  if (month) {
    rows = allRows.filter(r => {
      const d = _parseDateToYMD(r.date);
      return d && d.startsWith(month);
    });
  }
  
  rows.forEach(r => r.date = _parseDateToYMD(r.date));
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { success: true, data: rows };
}

function generateAttendanceSummaryPDF(month) {
  try {
    const employees = getAllRows('Employees');
    const attendanceRes = getAllAttendanceData(month);
    const leaveRes = getAllLeavesData(month);
    const izinRes = getAllIzinData(month);
    
    const attendances = attendanceRes.data || [];
    const leaves = (leaveRes.data || []).filter(l => l.status === 'approved');
    const izins = (izinRes.data || []).filter(i => i.status === 'approved');
    
    const monthName = typeof getIndonesianMonthName === 'function' ? getIndonesianMonthName(month) : month;
    
    let html = `
    <html>
    <head>
      <style>
        @page { size: A4 landscape; margin: 0.5in; }
        body { font-family: 'Arial', sans-serif; font-size: 10pt; line-height: 1.4; color: #333; }
        .header { text-align: center; margin-bottom: 20px; }
        .header h1 { margin: 0; font-size: 16pt; text-transform: uppercase; color: #1a56db; }
        .header p { margin: 5px 0 0 0; font-size: 11pt; color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        th { background-color: #f3f4f6; font-weight: bold; text-align: center; font-size: 9pt; }
        .center { text-align: center; }
        .bg-gray { background-color: #f9fafb; }
        .count-cell { font-weight: bold; width: 60px; text-align: center; }
        .footer { margin-top: 30px; }
        .footer table { border: none; }
        .footer td { border: none; width: 33%; text-align: center; vertical-align: top; }
        .signature-space { height: 60px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Rekapitulasi Kehadiran Pegawai</h1>
        <p>Periode: ${monthName}</p>
      </div>
      
      <table>
        <thead>
          <tr>
            <th rowspan="2" style="width: 30px;">No</th>
            <th rowspan="2">Nama Pegawai</th>
            <th rowspan="2">Bidang</th>
            <th colspan="5">Ringkasan Kehadiran</th>
            <th rowspan="2" style="width: 60px;">Total</th>
          </tr>
          <tr>
            <th class="count-cell">Hadir</th>
            <th class="count-cell">Telat</th>
            <th class="count-cell">T.A.M</th>
            <th class="count-cell">T.A.P</th>
            <th class="count-cell">Cuti/Izin</th>
          </tr>
        </thead>
        <tbody>`;
        
    if (!employees || employees.length === 0) {
      html += `<tr><td colspan="9" class="center" style="padding: 40px;">Tidak ada data pegawai</td></tr>`;
    } else {
      employees.forEach((emp, index) => {
        const empAtt = attendances.filter(a => String(a.userId) === String(emp.id));
        let present = 0, late = 0, noClockOut = 0, noClockIn = 0;
        
        empAtt.forEach(a => {
          const cIn = a.clockIn;
          const cOut = a.clockOut;
          const status = (a.status || '').toLowerCase();
          
          if (cIn && cOut) {
            present++;
            if (status.includes('telat') || status.includes('terlambat')) late++;
          } else if (cIn && !cOut) {
            noClockOut++;
          } else if (!cIn && cOut) {
            noClockIn++;
          }
        });
        
        const empLeaves = leaves.filter(l => String(l.userId) === String(emp.id));
        const empIzin = izins.filter(i => String(i.userId) === String(emp.id));
        let absentCount = 0;
        empLeaves.forEach(l => absentCount += parseInt(l.duration) || 1);
        empIzin.forEach(i => absentCount += parseInt(i.duration) || 1);
        
        const rowTotal = present + late + noClockOut + noClockIn + absentCount;
        const rowClass = index % 2 === 1 ? 'bg-gray' : '';
        
        html += `
        <tr class="${rowClass}">
            <td class="center">${index + 1}</td>
            <td>${emp.name}</td>
            <td class="center">${emp.department || '-'}</td>
            <td class="center">${present}</td>
            <td class="center">${late}</td>
            <td class="center">${noClockIn}</td>
            <td class="center">${noClockOut}</td>
            <td class="center">${absentCount}</td>
            <td class="center"><strong>${rowTotal}</strong></td>
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
              Mengetahui,<br>Atasan Langsung<br>
              <div class="signature-space"></div>
              <strong>( .................................... )</strong>
            </td>
            <td></td>
            <td>
              Depok, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<br>
              Admin Kepegawaian<br>
              <div class="signature-space"></div>
              <strong>( .................................... )</strong>
            </td>
          </tr>
        </table>
      </div>
      <p style="font-size: 8pt; color: #999; margin-top: 10px;">
        * T.A.M: Tanpa Absen Masuk | T.A.P: Tanpa Absen Pulang
      </p>
    </body>
    </html>`;
    
    const blob = HtmlService.createHtmlOutput(html).getAs('application/pdf');
    const base64 = Utilities.base64Encode(blob.getBytes());
    
    return { success: true, data: base64, filename: `Rekap_Absensi_${month}.pdf` };
    
  } catch (e) {
    console.error('generateAttendanceSummaryPDF error:', e);
    return { success: false, error: e.toString() };
  }
}

/**
 * Helper to calculate combined In and Out status
 */
function calculateDetailedAttendanceStatus(clockIn, clockOut, shiftStartMin, shiftEndMin, tolerance) {
  let inStatus = "";
  if (clockIn) {
    const safeIn = String(clockIn).replace('.', ':');
    const [inH, inM] = safeIn.split(':').map(Number);
    const inMins = (inH || 0) * 60 + (inM || 0);
    if (inMins > shiftStartMin + tolerance) {
      inStatus = "terlambat " + (inMins - shiftStartMin) + " menit";
    } else {
      inStatus = "masuk tepat waktu";
    }
  } else {
    inStatus = "tanpa absen masuk";
  }

  let outStatus = "";
  if (clockOut) {
    const safeOut = String(clockOut).replace('.', ':');
    const [outH, outM] = safeOut.split(':').map(Number);
    const outMins = (outH || 0) * 60 + (outM || 0);
    if (outMins < shiftEndMin) {
      outStatus = "pulang awal " + (shiftEndMin - outMins) + " menit";
    } else {
      outStatus = "pulang tepat waktu";
    }
  } else {
    outStatus = "tanpa absen pulang";
  }

  return inStatus + " dan " + outStatus;
}
