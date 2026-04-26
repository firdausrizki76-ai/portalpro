
function debugCheckLeaves() {
  try {
    const sheet = SpreadsheetApp.openById('1_-gvj8S-xkJX1CzJT9HtAGognqjctyBLBl47o4KnwVM').getSheetByName('Leaves');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = [];
    for (let i = 1; i < data.length; i++) {
      const obj = {};
      headers.forEach((h, j) => obj[h] = data[i][j]);
      rows.push(obj);
    }
    return JSON.stringify(rows, null, 2);
  } catch (e) {
    return e.toString();
  }
}
