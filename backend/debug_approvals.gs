
/**
 * Script untuk memverifikasi fungsionalitas persetujuan di backend
 */
function testLeaveApproval() {
  try {
    const idToTest = "1776763261440"; // Ganti dengan ID real jika ada di spreadsheet
    console.log("Mengetes persetujuan untuk ID:", idToTest);
    
    // 1. Cek isi data awal
    const leave = findRow('Leaves', 'id', idToTest);
    if (!leave) {
      console.warn("Data tidak ditemukan untuk ID tersebut. Mengetes dengan data pertama yang 'pending'...");
      const all = getAllRows('Leaves');
      const pending = all.find(l => l.status === 'pending' || l.status === 'MENUNGGU');
      if (!pending) return "FAIL: Tidak ada data pending di sheet Leaves";
      
      console.log("Ditemukan data pending:", pending.id, pending.employeeName);
      const res = approveLeaveData(pending.id);
      console.log("Hasil approveLeaveData:", JSON.stringify(res));
      return res;
    }
    
    const res = approveLeaveData(idToTest);
    console.log("Hasil approveLeaveData (Direct ID):", JSON.stringify(res));
    return res;
  } catch (e) {
    console.error("Test Error:", e.toString());
    return { success: false, error: e.toString() };
  }
}
