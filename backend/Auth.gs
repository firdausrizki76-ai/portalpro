/**
 * Portal Karyawan - Authentication
 * Login validation against Users sheet + Employees sheet (fallback)
 */

function handleLogin(email, password) {
  if (!email || !password) {
    return { success: false, error: 'Email dan password harus diisi' };
  }
  
  // 1. Try Users sheet first (admin accounts)
  const user = findRow('Users', 'email', email);
  
  if (user) {
    if (String(user.password) !== String(password)) {
      return { success: false, error: 'Password salah' };
    }
    
    return {
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar
      }
    };
  }
  
  // 2. Fallback: Try Employees sheet (employee accounts)
  const employee = findRow('Employees', 'email', email);
  
  if (!employee) {
    return { success: false, error: 'Email tidak ditemukan' };
  }
  
  // Check password: use employee's password field if set, otherwise default "1234"
  var empPassword = employee.password ? String(employee.password) : '1234';
  if (String(password) !== empPassword) {
    return { success: false, error: 'Password salah' };
  }
  
  return {
    success: true,
    data: {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      nip: employee.nip || '',
      role: 'karyawan',
      department: employee.department || '',
      position: employee.position || '',
      shift: employee.shift || 'Pagi',
      lokasiKerja: employee.lokasiKerja || '',
      avatar: employee.avatar || '',
      faceData: employee.faceData || null,
      facePhotoId: employee.facePhotoId || null,
      leave_annual_used: employee.leave_annual_used || 0,
      leave_sick_used: employee.leave_sick_used || 0,
      leave_maternity_used: employee.leave_maternity_used || 0,
      leave_large_used: employee.leave_large_used || 0,
      leave_important_used: employee.leave_important_used || 0
    }
  };
}

/**
 * Change password for a user/employee
 */
function changePasswordData(userId, oldPassword, newPassword) {
  if (!userId || !oldPassword || !newPassword) {
    return { success: false, error: 'Semua field harus diisi' };
  }
  
  if (newPassword.length < 4) {
    return { success: false, error: 'Password minimal 4 karakter' };
  }
  
  var errors = [];
  var foundAny = false;
  
  // Try Users sheet first
  var user = findRow('Users', 'id', userId);
  if (user) {
    foundAny = true;
    var currentPwd = user.password ? String(user.password) : '';
    if (currentPwd === String(oldPassword)) {
      updateRow('Users', userId, { password: newPassword });
      return { success: true, data: { message: 'Password berhasil diubah' } };
    } else {
      errors.push('Users');
    }
  }
  
  // Try Employees sheet
  var employee = findRow('Employees', 'id', userId);
  if (employee) {
    foundAny = true;
    var empPwd = employee.password ? String(employee.password) : '1234';
    if (empPwd === String(oldPassword)) {
      updateRow('Employees', userId, { password: newPassword });
      return { success: true, data: { message: 'Password berhasil diubah' } };
    } else {
      errors.push('Employees');
    }
  }
  
  if (foundAny) {
    return { success: false, error: 'Password lama salah' };
  }
  
  return { success: false, error: 'User tidak ditemukan' };
}

/**
 * Get employee profile data
 */
function getEmployeeProfile(userId) {
  if (!userId) {
    return { success: false, error: 'userId is required' };
  }
  
  // Try Employees sheet
  var employee = findRow('Employees', 'id', userId);
  if (employee) {
    return {
      success: true,
      data: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        nip: employee.nip || '',
        department: employee.department || '',
        position: employee.position || '',
        shift: employee.shift || '',
        lokasiKerja: employee.lokasiKerja || '',
        status: employee.status || '',
        joinDate: employee.joinDate || '',
        avatar: employee.avatar || '',
        faceData: employee.faceData || null,
        facePhotoId: employee.facePhotoId || null,
        leave_annual_used: employee.leave_annual_used || 0,
        leave_sick_used: employee.leave_sick_used || 0,
        leave_maternity_used: employee.leave_maternity_used || 0,
        leave_large_used: employee.leave_large_used || 0,
        leave_important_used: employee.leave_important_used || 0
      }
    };
  }
  
  // Try Users sheet
  var user = findRow('Users', 'id', userId);
  if (user) {
    return {
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'admin',
        avatar: user.avatar || ''
      }
    };
  }
  
  return { success: false, error: 'User tidak ditemukan' };
}

/**
 * Update online status for a user/employee
 */
function updateOnlineStatus(userId, isOnline) {
  if (!userId) {
    return { success: false, error: 'userId is required' };
  }
  
  // Try Employees sheet
  const employee = findRow('Employees', 'id', userId) || findRow('Employees', 'email', userId);
  if (employee) {
    updateRow('Employees', employee.id, { isOnline: isOnline });
    return { success: true, data: { status: isOnline } };
  }
  
  // Try Users sheet (admin)
  const user = findRow('Users', 'id', userId) || findRow('Users', 'email', userId);
  if (user) {
    // Note: If admin also needs isOnline column, add it to Users sheet headers too.
    // For now we primarily track employees.
    updateRow('Users', user.id, { isOnline: isOnline });
    return { success: true, data: { status: isOnline } };
  }
  
  return { success: false, error: 'User tidak ditemukan' };
}
