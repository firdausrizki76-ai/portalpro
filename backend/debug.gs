function dumpAttendanceSchema() {
  const ss = SpreadsheetApp.openById('1_-gvj8S-xkJX1CzJT9HtAGognqjctyBLBl47o4KnwVM');
  const sheet = ss.getSheetByName('Attendance');
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const firstDataRow = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
  
  const result = {
    headers: headers,
    row2: firstDataRow
  };
  
  return JSON.stringify(result, null, 2);
}

function inspectEmployeesSheet() {
  const ss = SpreadsheetApp.openById('1_-gvj8S-xkJX1CzJT9HtAGognqjctyBLBl47o4KnwVM');
  const sheet = ss.getSheetByName('Employees');
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const range = sheet.getRange(1, 1, Math.min(10, lastRow), lastCol).getDisplayValues();
  
  return {
    colCount: lastCol,
    rowCount: lastRow,
    data: range
  };
}
