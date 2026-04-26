/**
 * Portal Karyawan - Permission (Izin WFH/WFA/Dinas)
 * Permission request endpoints with token-based approval
 */

function getIzinData(userId) {
  if (!userId) {
    return { success: false, error: 'userId is required' };
  }
  
  const rows = findRows('Izin', 'userId', userId);
  rows.sort((a, b) => String(b.appliedAt).localeCompare(String(a.appliedAt)));
  
  return { success: true, data: rows };
}

function submitIzinData(data) {
  if (!data.userId || !data.type || !data.startDate) {
    return { success: false, error: 'Required fields missing' };
  }
  
  // Validate: no overlapping approved permits for same type
  const existing = findRows('Izin', 'userId', data.userId);
  const overlap = existing.find(e => {
    if (e.status !== 'approved' && e.status !== 'pending') return false;
    if (e.type !== data.type) return false;
    // Check date overlap
    const eStart = String(e.startDate || e.date || '');
    const eEnd = String(e.endDate || eStart);
    const nStart = String(data.startDate);
    const nEnd = String(data.endDate || nStart);
    return nStart <= eEnd && nEnd >= eStart;
  });
  
  if (overlap) {
    return { success: false, error: 'Sudah ada pengajuan yang berlaku untuk periode dan jenis yang sama' };
  }
  
  data.id = getNextId('Izin');
  data.status = 'pending';
  data.appliedAt = new Date().toISOString();
  
  // Ensure endDate exists
  if (!data.endDate) data.endDate = data.startDate;
  
  addRow('Izin', data);
  return { success: true, data: data };
}

function approveIzinData(id) {
  if (!id) {
    return { success: false, error: 'id is required' };
  }
  
  const updated = updateRow('Izin', id, { status: 'approved' });
  if (updated) {
    return { success: true, data: updated };
  }
  return { success: false, error: 'Izin not found' };
}

function rejectIzinData(id) {
  if (!id) {
    return { success: false, error: 'id is required' };
  }
  
  const updated = updateRow('Izin', id, { status: 'rejected' });
  if (updated) {
    return { success: true, data: updated };
  }
  return { success: false, error: 'Izin not found' };
}

function getAllIzinData(month) {
  const allRows = getAllRows('Izin');
  let rows = allRows;
  
  if (month) {
    rows = allRows.filter(r => {
      const d = String(r.startDate || r.date || '');
      if (d && !d.includes('-')) return true;
      return d.startsWith(month);
    });
  }
  
  rows.sort((a, b) => String(b.appliedAt).localeCompare(String(a.appliedAt)));
  return { success: true, data: rows };
}

/**
 * Get active (approved) WFH/WFA/Dinas permits for a user that cover today's date.
 * Returns which remote attendance modes are currently unlocked.
 */
function getActiveWfhPermit(userId) {
  if (!userId) {
    return { success: false, error: 'userId is required' };
  }
  
  const today = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
  const allIzin = findRows('Izin', 'userId', userId);
  
  // Find approved permits where today falls within startDate..endDate
  const activePermits = allIzin.filter(izin => {
    if (String(izin.status) !== 'approved') return false;
    
    const type = String(izin.type || '').toLowerCase();
    if (!['wfh', 'wfa', 'dinas'].includes(type)) return false;
    
    const start = String(izin.startDate || izin.date || '');
    const end = String(izin.endDate || start);
    
    return today >= start && today <= end;
  });
  
  // Build a map of which modes are unlocked
  const unlocked = {
    wfh: false,
    wfa: false,
    dinas: false
  };
  
  activePermits.forEach(p => {
    const type = String(p.type).toLowerCase();
    if (unlocked.hasOwnProperty(type)) {
      unlocked[type] = true;
    }
  });
  
  return { 
    success: true, 
    data: {
      unlocked: unlocked,
      permits: activePermits.map(p => ({
        id: p.id,
        type: p.type,
        typeLabel: p.typeLabel,
        startDate: p.startDate || p.date,
        endDate: p.endDate || p.startDate || p.date,
        status: p.status
      }))
    }
  };
}
