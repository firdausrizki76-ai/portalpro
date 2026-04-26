/**
 * Portal Karyawan - Face Service
 * Handling face registration and Google Drive storage
 */

function registerFaceData(userId, descriptor, photoBase64) {
  console.log('registerFaceData called for user: ' + userId);
  if (!userId) {
    return { success: false, error: 'User ID tidak ditemukan' };
  }
  
  if (!descriptor || (Array.isArray(descriptor) && descriptor.length === 0)) {
    return { success: false, error: 'Data biometrik wajah tidak terdeteksi oleh kamera.' };
  }

  try {
    // STEP 1: Save descriptor to database FIRST (fast operation)
    // This ensures we respond quickly without waiting for Drive upload
    const descriptorStr = JSON.stringify(descriptor);
    const updated = updateRow('Employees', userId, {
      faceData: descriptorStr,
      facePhotoId: 'pending'
    });

    if (!updated) {
      // Try to find if employee exists
      const emp = findRow('Employees', 'id', userId);
      if (!emp) {
        return { success: false, error: 'Karyawan dengan ID ' + userId + ' tidak ditemukan di database.' };
      }
      return { success: false, error: 'Gagal menyimpan data wajah ke spreadsheet.' };
    }
    
    // STEP 2: Now try Drive upload (slower, but we already have success)
    let photoId = 'no-photo';
    if (photoBase64 && photoBase64.length > 100) {
      try {
        photoId = saveFacePhotoToDrive(userId, photoBase64);
        // Update with real photo ID
        updateRow('Employees', userId, { facePhotoId: photoId });
        console.log('Photo saved to Drive: ' + photoId);
      } catch (driveErr) {
        console.warn('Drive upload failed but descriptor saved: ' + driveErr.toString());
        // Non-fatal: descriptor is already saved, face recognition will still work
      }
    }
    
    return { 
      success: true, 
      data: { 
        facePhotoId: photoId,
        faceData: descriptor 
      } 
    };

  } catch (e) {
    console.error('Error registerFaceData:', e);
    return { success: false, error: 'Server Error: ' + e.toString() };
  }
}

/**
 * Pancingan Izin Google Drive
 * Jalankan fungsi ini di Editor Apps Script untuk memicu jendela 'Authorization Required'
 */
function testDriveAccess() {
  const folderName = 'SIAP_Face_Registration_Test';
  const folder = DriveApp.createFolder(folderName);
  const file = folder.createFile('test.txt', 'Pendaftaran wajah berhasil terhubung ke Google Drive');
  console.log('Drive linked successfully! File ID: ' + file.getId());
  
  // Cleanup test folder
  Utilities.sleep(1000);
  folder.setTrashed(true);
  
  return 'Berhasil! Izin Google Drive sudah aktif. Sekarang silakan coba daftar wajah di HP Anda.';
}

/**
 * Save Base64 photo to Google Drive
 */
function saveFacePhotoToDrive(userId, photoBase64) {
  const folderName = 'SIAP_Face_Registration';
  let folder;
  const folders = DriveApp.getFoldersByName(folderName);
  
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(folderName);
  }

  // Remove old file if exists
  const existingFiles = folder.getFilesByName(userId + '_face.png');
  while (existingFiles.hasNext()) {
    existingFiles.next().setTrashed(true);
  }

  // Save new file
  const contentType = photoBase64.substring(5, photoBase64.indexOf(';'));
  const bytes = Utilities.base64Decode(photoBase64.split(',')[1]);
  const blob = Utilities.newBlob(bytes, contentType, userId + '_face.png');
  const file = folder.createFile(blob);
  
  // Make shared (viewable) for the app to display if needed
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return file.getId();
}
