/**
 * Portal Karyawan - Employee Management
 * Employee CRUD endpoints for admin
 */

function getEmployeesData() {
  const rows = getAllRows('Employees');
  return { success: true, data: rows };
}

function addEmployeeData(data) {
  if (!data.name || !data.email) {
    return { success: false, error: 'Name and email are required' };
  }
  
  // Check duplicate email
  const existing = findRow('Employees', 'email', data.email);
  if (existing) {
    return { success: false, error: 'Email sudah terdaftar' };
  }
  
  data.id = getNextId('Employees');
  
  if (!data.avatar) {
    data.avatar = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(data.name) + '&background=F59E0B&color=fff';
  }
  
  addRow('Employees', data);
  return { success: true, data: data };
}

function updateEmployeeData(id, data) {
  if (!id) {
    return { success: false, error: 'id is required' };
  }
  
  const updated = updateRow('Employees', id, data);
  if (updated) {
    return { success: true, data: updated };
  }
  return { success: false, error: 'Employee not found' };
}

function deleteEmployeeData(id) {
  if (!id) {
    return { success: false, error: 'id is required' };
  }
  
  const deleted = deleteRow('Employees', id);
  if (deleted) {
    return { success: true, data: { id: id } };
  }
  return { success: false, error: 'Employee not found' };
}
