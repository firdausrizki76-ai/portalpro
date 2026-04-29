function debugData() {
  const employees = getAllRows('Employees');
  const settings = getSettingsData().data;
  const susi = employees.find(e => e.name.toLowerCase().includes('susi'));
  
  const results = {
    susi_lokasi: susi ? susi.lokasiKerja : 'not found',
    susi_position: susi ? susi.position : 'not found',
    settings_keys: Object.keys(settings).filter(k => k.startsWith('sig_') || k.startsWith('signature_'))
  };
  
  console.log(JSON.stringify(results, null, 2));
  return results;
}
