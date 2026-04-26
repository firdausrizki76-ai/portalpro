/**
 * Portal Karyawan - Face Recognition (AI Powered)
 * Face matching using face-api.js
 * Version: v3 (Aggressive Cache Busting)
 */

const faceRecognition = {
    video: null,
    canvas: null,
    stream: null,
    currentAction: null,
    photoCaptured: false,
    locationVerified: false,
    position: null,
    modelsLoaded: false,
    isRegistering: false,
    labeledDescriptors: null,
    matchThreshold: 0.5, // 50% accuracy
    capturedPhotoBase64: null, // Store captured photo string

    async init(action) {
        console.log('Face Recognition UI initialized with action:', action);
        this.currentAction = action;
        this.photoCaptured = false;
        this.capturedPhotoBase64 = null; 
        this.locationVerified = false;
        this.position = null;
        this.isRegistering = (action === 'register-face');

        // CRITICAL: Reset the camera preview area to restore video/canvas elements
        const preview = document.getElementById('camera-preview');
        if (preview) {
            preview.innerHTML = `
                <video id="camera-video" autoplay playsinline muted></video>
                <canvas id="camera-canvas" style="display: none;"></canvas>
                <div class="face-overlay" id="face-overlay"><div class="face-frame"></div></div>
            `;
        }

        // Reset UI buttons state
        const captureBtn = document.getElementById('btn-capture');
        const retakeBtn = document.getElementById('btn-retake');
        const confirmBtn = document.getElementById('btn-confirm-attendance');
        const registerContainer = document.getElementById('registration-save-container');

        if (captureBtn) captureBtn.style.display = 'flex';
        if (retakeBtn) retakeBtn.style.display = 'none';
        if (confirmBtn) confirmBtn.style.display = 'none';
        if (registerContainer) registerContainer.remove();

        // Update UI Titles
        this.updateActionTitle(action);
        
        // Load AI Models
        await this.loadModels();

        // Initialize camera
        await this.initCamera();

        // Initialize location
        this.initLocation();

        // Bind buttons
        this.bindButtons();

        // Start Detection Loop
        this.startDetection();
    },

    async loadModels() {
        if (this.modelsLoaded) return;
        
        console.log('Loading AI models from CDN...');
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
        
        try {
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
            ]);
            this.modelsLoaded = true;
            console.log('AI models loaded successfully');
        } catch (err) {
            console.error('Failed to load models:', err);
            toast.error('Gagal memuat sistem AI. Cek koneksi internet.');
        }
    },

    updateActionTitle(action) {
        const titles = {
            'clock-in': { title: 'Clock In - Verifikasi Wajah', subtitle: 'Verifikasi wajah Anda untuk Clock In' },
            'clock-out': { title: 'Clock Out - Verifikasi Wajah', subtitle: 'Verifikasi wajah Anda untuk Clock Out' },
            'overtime': { title: 'Lembur - Verifikasi Wajah', subtitle: 'Verifikasi wajah Anda untuk mulai lembur' },
            'register-face': { title: 'Pendaftaran Wajah', subtitle: 'Ambil foto selfie jelas untuk mendaftarkan wajah Anda' },
            'izin': { title: 'Pengajuan Izin - Verifikasi Wajah', subtitle: 'Verifikasi wajah untuk pengajuan izin' }
        };

        const titleEl = document.getElementById('face-rec-title');
        const subtitleEl = document.getElementById('face-rec-subtitle');

        if (titles[action]) {
            if (titleEl) titleEl.textContent = titles[action].title;
            if (subtitleEl) subtitleEl.textContent = titles[action].subtitle;
        }

        // Specific UI for registration
        const registerBtn = document.getElementById('btn-register-face');
        const captureBtn = document.getElementById('btn-capture');
        const locationSec = document.querySelector('.location-section');
        const confirmBtn = document.getElementById('btn-confirm-attendance');

        if (this.isRegistering) {
            if (registerBtn) registerBtn.style.display = 'flex';
            if (captureBtn) captureBtn.style.display = 'none';
            if (locationSec) locationSec.style.display = 'block'; // Always show location for 'real' feel
            if (confirmBtn) {
                confirmBtn.innerHTML = '<i class="fas fa-user-check"></i> Konfirmasi Pendaftaran';
                confirmBtn.style.display = 'none'; // Will show after capture
            }
        } else {
            if (registerBtn) registerBtn.style.display = 'none';
            if (captureBtn) captureBtn.style.display = 'flex';
            if (locationSec) locationSec.style.display = 'block';
            if (confirmBtn) {
                confirmBtn.innerHTML = '<i class="fas fa-check-circle"></i> Konfirmasi Absensi';
                confirmBtn.style.display = 'none'; // Will show after capture
            }
        }
    },

    async initCamera() {
        this.video = document.getElementById('camera-video');
        this.canvas = document.getElementById('camera-canvas');

        if (!this.video) return;

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false
            });
            this.video.srcObject = this.stream;
            
            // Explicitly call play for mobile browsers
            await this.video.play().catch(e => console.warn('Video play blocked:', e));
        } catch (error) {
            console.error('Camera error:', error);
            toast.error('Gagal mengakses kamera.');
        }
    },

    async startDetection() {
        if (!this.video || !this.modelsLoaded) return;

        const loop = async () => {
            if (!this.stream) return;
            
            const detections = await faceapi.detectSingleFace(this.video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 }));
            
            const overlay = document.getElementById('face-overlay');
            if (detections) {
                if (overlay) overlay.style.borderColor = 'var(--color-success)';
                const captureBtn = document.getElementById('btn-capture');
                const registerBtn = document.getElementById('btn-register-face');
                if (captureBtn) captureBtn.disabled = false;
                if (registerBtn) registerBtn.disabled = false;
            } else {
                if (overlay) overlay.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }

            if (this.stream) requestAnimationFrame(loop);
        };
        loop();
    },

    stopCamera() {
        if (this.stream) {
            console.log('Stopping camera stream...');
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    },

    async capturePhoto() {
        if (this.photoCaptured) return;
        
        // 1. Get current descriptor
        // 1. Get current descriptor - using higher input size for better accuracy
        const detections = await faceapi.detectSingleFace(this.video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 }))
                                       .withFaceLandmarks()
                                       .withFaceDescriptor();

        if (!detections) {
            toast.error('Wajah tidak terdeteksi. Posisikan wajah di dalam bingkai.');
            return;
        }

        const descriptor = detections.descriptor;
        
        // 2. Perform Matching if not registering
        let isMatch = false;
        if (!this.isRegistering) {
            const user = auth.getCurrentUser();
            
            // SECURITY CHECK: Ensure faceData is valid and not empty
            if (!user.faceData || user.faceData === 'null' || user.faceData === '' || user.faceData === 'undefined') {
                console.warn('Blocking verification attempt: No face data found in session.');
                toast.error('Wajah Anda belum terdaftar. Silakan daftar terlebih dahulu.');
                setTimeout(() => {
                    modal.show(
                        'Pendaftaran Diperlukan',
                        '<div style="text-align:center; padding: 20px;">' +
                        '<i class="fas fa-user-lock" style="font-size: 48px; color: var(--color-warning); margin-bottom: 20px;"></i>' +
                        '<p>Wajah Anda belum terdaftar di database.</p>' +
                        '<p style="font-size: 14px; color: #666; margin-top: 10px;">Silakan lakukan pendaftaran selfie terlebih dahulu untuk melanjutkan.</p>' +
                        '</div>',
                        [{ label: 'Daftar Sekarang', class: 'btn-primary', onClick: () => {
                            modal.close();
                            this.init('register-face');
                        }}]
                    );
                }, 500);
                return;
            }

            try {
                // Fetch dynamic thresholds from settings
                const settingsRes = await api.getSettings();
                const allSettings = settingsRes.data || {};
                
                // --- 1. Face Match Verification ---
                const requireFace = allSettings.require_face_recognition !== 'false';
                if (requireFace) {
                    // Face Match Threshold (Score = 1 - Distance)
                    const faceMatchThreshold = parseFloat(allSettings.face_match_threshold || 80) / 100;
                    
                    // Handle various formats of stored faceData (JSON Object or Array)
                    const parsedData = JSON.parse(user.faceData);
                    const values = Array.isArray(parsedData) ? parsedData : Object.values(parsedData);
                    const referenceDescriptor = new Float32Array(values.map(v => parseFloat(v)));
                    
                    if (referenceDescriptor.length !== 128) {
                        throw new Error('Invalid descriptor length');
                    }

                    const distance = faceapi.euclideanDistance(descriptor, referenceDescriptor);
                    const score = 1 - distance; 
                    
                    console.log('Face Match Distance:', distance, 'Score:', score, 'Required:', faceMatchThreshold);
                    
                    if (score >= faceMatchThreshold) { 
                        isMatch = true;
                    } else {
                        toast.error(`Wajah tidak cocok! Akurasi: ${(score * 100).toFixed(1)}% (Minimal ${allSettings.face_match_threshold}%)`);
                        return;
                    }
                } else {
                    console.log('Face Match verification skipped (disabled in settings)');
                    isMatch = true;
                }

                // --- 2. Geolocation Distance Check ---
                const requireLoc = allSettings.require_location_tracking !== 'false';
                if (requireLoc) {
                    const maxDistance = parseFloat(allSettings.max_attendance_distance || 100);
                    
                    // Get selected point from absensi controller
                    const selectedPoint = window.absensi ? window.absensi.getSelectedLocation() : null;
                    if (!selectedPoint) {
                        toast.error('Pilih lokasi absen terlebih dahulu.');
                        return;
                    }

                    // Skip geolocation check for WFH, WFA, and Perjalanan Dinas
                    const remoteLocations = ['wfh', 'wfa', 'dinas'];
                    const pointId = selectedPoint.id;
                    
                    if (!remoteLocations.includes(pointId)) {
                        // Fixed location - verify GPS distance
                        const latKey = pointId === '1' ? 'office_lat' : `office_lat_${pointId}`;
                        const lngKey = pointId === '1' ? 'office_lng' : `office_lng_${pointId}`;

                        const targetLat = parseFloat(allSettings[latKey]);
                        const targetLng = parseFloat(allSettings[lngKey]);

                        // Check if admin has set the coordinates
                        if (isNaN(targetLat) || isNaN(targetLng) || targetLat === 0) {
                            modal.show(
                                'Lokasi Belum Diset',
                                `<div style="text-align:center; padding: 20px;">
                                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: var(--color-warning); margin-bottom: 20px;"></i>
                                    <p style="font-weight:600; font-size:18px; color:#333;">Tolong kontak admin untuk set lokasi absen</p>
                                    <p style="font-size: 14px; color: #666; margin-top: 10px;">
                                        Titik koordinat untuk <b>${selectedPoint.name}</b> belum dikonfigurasi.
                                    </p>
                                </div>`,
                                [{ label: 'Mengerti', class: 'btn-primary', onClick: () => modal.close() }]
                            );
                            return;
                        }

                        const points = [
                            { name: selectedPoint.name, lat: targetLat, lng: targetLng }
                        ];

                        if (points.length > 0) {
                            if (!this.position) {
                                toast.error('Gagal mendapatkan lokasi GPS. Pastikan GPS aktif.');
                                return;
                            }

                            const userLat = this.position.coords.latitude;
                            const userLng = this.position.coords.longitude;
                            
                            let withinRange = false;
                            let minDistance = Infinity;
                            let closestPoint = null;

                            points.forEach(p => {
                                const d = this.calculateDistance(userLat, userLng, p.lat, p.lng);
                                console.log(`Distance to ${p.name}: ${d.toFixed(1)}m`);
                                if (d <= maxDistance) {
                                    withinRange = true;
                                }
                                if (d < minDistance) {
                                    minDistance = d;
                                    closestPoint = p;
                                }
                            });

                            if (!withinRange) {
                                modal.show(
                                    'Di Luar Jangkauan Kantor',
                                    `<div style="text-align:center; padding: 20px;">
                                        <i class="fas fa-map-marker-alt" style="font-size: 48px; color: var(--color-warning); margin-bottom: 20px;"></i>
                                        <p>Anda berada di luar radius kantor <b>${closestPoint.name}</b>.</p>
                                        <p style="font-size: 14px; color: #666; margin-top: 10px;">
                                            Radius maksimal: <b>${maxDistance}m</b><br>
                                            Jarak Anda: <b>${minDistance.toFixed(0)}m</b>
                                        </p>
                                        <p style="font-size: 12px; color: #999; margin-top: 15px;">
                                            Jika Anda sedang WFH/Dinas, pastikan Anda memilih opsi <b>✅ WFH</b> atau <b>✅ Perjalanan Dinas</b> di menu lokasi.
                                        </p>
                                    </div>`,
                                    [{ label: 'Tutup', class: 'btn-secondary', onClick: () => modal.close() }]
                                );
                                return;
                            }
                        } else {
                            console.warn('Location tracking enabled but no office coordinates set.');
                        }
                    } else if (selectedPoint.id === 'wfh' || selectedPoint.id === 'dinas') {
                        // Special handling for WFH and DINAS (200m radius from registered coords)
                        console.log(`Checking location for remote mode: ${selectedPoint.name}`);
                        
                        try {
                            const res = await api.getActiveWfhPermit(auth.getCurrentUser().id);
                            if (res.success && res.data && res.data.permits) {
                                // Find the permit matching the selected type that is active today
                                const typeMap = {'wfh': 'wfh', 'dinas': 'dinas'};
                                const permitType = typeMap[selectedPoint.id];
                                
                                const activePermit = res.data.permits.find(p => p.type.toLowerCase() === permitType);
                                
                                if (activePermit && activePermit.verificationLocation) {
                                    try {
                                        const coords = JSON.parse(activePermit.verificationLocation);
                                        const targetLat = parseFloat(coords.lat);
                                        const targetLng = parseFloat(coords.lng);
                                        
                                        if (!isNaN(targetLat) && !isNaN(targetLng)) {
                                            if (!this.position) {
                                                toast.error('Gagal mendapatkan lokasi GPS. Pastikan GPS aktif.');
                                                return;
                                            }

                                            const userLat = this.position.coords.latitude;
                                            const userLng = this.position.coords.longitude;
                                            const remoteRadius = 200; // Fixed 200m for WFH/Dinas
                                            
                                            const d = this.calculateDistance(userLat, userLng, targetLat, targetLng);
                                            console.log(`Distance to registered ${selectedPoint.name} location: ${d.toFixed(1)}m`);
                                            
                                            if (d > remoteRadius) {
                                                modal.show(
                                                    'Di Luar Lokasi Izin',
                                                    `<div style="text-align:center; padding: 20px;">
                                                        <i class="fas fa-map-marker-alt" style="font-size: 48px; color: var(--color-warning); margin-bottom: 20px;"></i>
                                                        <p>Anda berada di luar radius lokasi izin ${selectedPoint.name}.</p>
                                                        <p style="font-size: 14px; color: #666; margin-top: 10px;">
                                                            Radius maksimal: <b>${remoteRadius}m</b><br>
                                                            Jarak Anda: <b>${d.toFixed(0)}m</b>
                                                        </p>
                                                    </div>`,
                                                    [{ label: 'Tutup', class: 'btn-secondary', onClick: () => modal.close() }]
                                                );
                                                return;
                                            }
                                        } else {
                                            toast.error('Data koordinat izin tidak valid. Silakan hubungi Admin.');
                                            return;
                                        }
                                    } catch (err) {
                                        console.warn('Could not parse permit coordinates:', err);
                                        toast.error('Gagal memverifikasi lokasi izin Anda.');
                                        return;
                                    }
                                } else {
                                    console.warn('No active permit or missing coordinates for verificationLocation');
                                    toast.error('Anda berada diluar titik lokasi yg di izinkan untuk absen');
                                    return;
                                }
                            } else {
                                toast.error('Anda berada diluar titik lokasi yg di izinkan untuk absen');
                                return;
                            }
                        } catch (e) {
                            console.error('Failed to verify WFH permit location', e);
                            toast.error('Gagal memverifikasi izin Anda dengan server.');
                            return;
                        }
                    } else {
                        // WFA
                        console.log(`Location tracking completely skipped for WFA mode.`);
                    }
                } else {
                    console.log('Location tracking skipped (disabled in settings)');
                }
            } catch (e) {
                console.error('Matching/Distance Error:', e);
                toast.error('Terjadi kesalahan saat verifikasi data. Silakan coba lagi.');
                return;
            }
        } else {
            isMatch = true; // Skip matching on registration
        }

        // 3. SUCCESS: Save Captured frame with FORCED DOWN-SAMPLING to 640px
        const ctx = this.canvas.getContext('2d');
        const MAX_WIDTH = 640;
        
        // SAFETY: Fallback for videoWidth if not yet available or 0
        const vWidth = this.video.videoWidth || 640;
        const vHeight = this.video.videoHeight || 480;
        const scale = Math.min(1, MAX_WIDTH / vWidth);
        
        this.canvas.width = vWidth * scale;
        this.canvas.height = vHeight * scale;
        
        console.log(`Resizing capture: ${vWidth}x${vHeight} -> ${this.canvas.width}x${this.canvas.height}`);
        ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        
        // IMMEDIATELY Convert to Base64 and store it to prevent 'data:,' error
        this.capturedPhotoBase64 = this.canvas.toDataURL('image/jpeg', 0.8);
        console.log('Photo captured successfully! Data length:', this.capturedPhotoBase64.length);

        this.currentDescriptor = descriptor;
        this.photoCaptured = true;
        this.stopCamera();

        // Update UI Preview
        const preview = document.getElementById('camera-preview');
        if (preview && this.capturedPhotoBase64) {
            preview.innerHTML = `
                <img src="${this.capturedPhotoBase64}" class="captured-photo" alt="Captured">
                <div class="verification-status show" id="verification-status">
                    <div class="status-icon"><i class="fas fa-check-circle"></i></div>
                    <p>${this.isRegistering ? 'Wajah Terdeteksi' : 'Wajah Terverifikasi'}</p>
                </div>
            `;
        }

        document.getElementById('btn-capture').style.display = 'none';
        document.getElementById('btn-register-face').style.display = 'none';
        
        if (this.isRegistering) {
            // Use existing static buttons in HTML - no dynamic creation needed
            let saveBtnContainer = document.getElementById('registration-save-container');
            
            if (!saveBtnContainer) {
                // Create container if not exists
                saveBtnContainer = document.createElement('div');
                saveBtnContainer.id = 'registration-save-container';
                saveBtnContainer.style.cssText = 'text-align:center; margin-top:20px; padding: 0 16px;';
                saveBtnContainer.innerHTML = [
                    '<button id="btn-save-reg" class="btn-primary" ',
                    'onclick="doSaveRegistration()" ',
                    'style="padding:14px 30px;font-size:16px;width:100%;border-radius:12px;',
                    'cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;',
                    'position:relative;z-index:999;">',
                    '<i class="fas fa-user-check"></i> Simpan Pendaftaran Wajah</button>',
                    '<button id="btn-retake-reg" class="btn-secondary" ',
                    'onclick="doRetakePhoto()" ',
                    'style="margin-top:10px;width:100%;border-radius:12px;cursor:pointer;',
                    'touch-action:manipulation;-webkit-tap-highlight-color:transparent;">',
                    '<i class="fas fa-redo"></i> Foto Ulang</button>'
                ].join('');
            
                // Find best insertion point
                const cameraSection = document.querySelector('.camera-section') || 
                                      document.querySelector('.face-camera-container') ||
                                      (preview && preview.parentNode);
                if (cameraSection) {
                    cameraSection.appendChild(saveBtnContainer);
                }
            } else {
                saveBtnContainer.style.display = 'block';
            }

            // Use querySelector on the container itself (100% reliable)
            const saveBtn = saveBtnContainer.querySelector('#btn-save-reg');
            const redoBtn = saveBtnContainer.querySelector('#btn-retake-reg');
            
            // Clone to remove any stale listeners
            if (saveBtn) {
                const freshSave = saveBtn.cloneNode(true);
                saveBtn.parentNode.replaceChild(freshSave, saveBtn);
                freshSave.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); faceRecognition.confirmRegistration(); }, true);
                freshSave.addEventListener('touchend', (e) => { e.stopPropagation(); e.preventDefault(); faceRecognition.confirmRegistration(); }, { passive: false, capture: true });
            }
            if (redoBtn) {
                const freshRedo = redoBtn.cloneNode(true);
                redoBtn.parentNode.replaceChild(freshRedo, redoBtn);
                freshRedo.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); faceRecognition.retakePhoto(); }, true);
                freshRedo.addEventListener('touchend', (e) => { e.stopPropagation(); e.preventDefault(); faceRecognition.retakePhoto(); }, { passive: false, capture: true });
            }
            
            console.log('Registration buttons attached. saveBtn found:', !!saveBtnContainer.querySelector('#btn-save-reg'));
        } else {
            document.getElementById('btn-retake').style.display = 'flex';
            // CRITICAL: Show the confirmation button for attendance
            const confirmBtn = document.getElementById('btn-confirm-attendance');
            if (confirmBtn) {
                confirmBtn.style.display = 'flex';
                confirmBtn.disabled = false;
            }
        }
        
        this.checkCanSubmit();
    },

    async confirmAttendance() {
        if (this.isRegistering) {
            await this.confirmRegistration();
            return;
        }

        const selectedPoint = window.absensi ? window.absensi.getSelectedLocation() : null;

        const attendanceData = {
            action: this.currentAction,
            timestamp: new Date().toISOString(),
            locationName: selectedPoint ? selectedPoint.name : '',
            location: this.position ? {
                latitude: this.position.coords.latitude,
                longitude: this.position.coords.longitude
            } : null,
            photo: this.capturedPhotoBase64 || 'data:,'
        };

        storage.set('temp_attendance', attendanceData);
        toast.success('Verifikasi wajah berhasil!');

        // Stop camera before navigating
        this.stopCamera();

        if (this.currentAction === 'izin') {
            await window.izin.submitWithVerification(attendanceData);
            router.navigate('izin');
        } else {
            await window.absensi.processWithVerification(this.currentAction, attendanceData);
            // Navigate immediately back to absensi page
            router.navigate('absensi');
        }
    },

    async confirmRegistration() {
        const user = auth.getCurrentUser();
        if (!user) {
            alert('CRITICAL: User session not found. Please re-login.');
            return;
        }

        console.log('DEBUG: confirmRegistration started for', user.id);
        
        // Show status in page (visible on mobile without alert)
        const statusEl = document.getElementById('reg-status');
        const saveBtn = document.getElementById('btn-test-save');
        if (statusEl) statusEl.innerHTML = '⏳ Sedang menyimpan ke server...';
        if (saveBtn) saveBtn.disabled = true;
        
        if (typeof loader !== 'undefined') loader.show('Mendaftarkan wajah...');
        
        try {
            // Use captured photo from our stored variable
            const photo = this.capturedPhotoBase64 || 'data:,';
            const descriptorArray = Array.isArray(this.currentDescriptor) 
                ? this.currentDescriptor 
                : Array.from(this.currentDescriptor);
            
            console.log('DEBUG: photo length =', photo.length, '| descriptor length =', descriptorArray.length);
            console.log('DEBUG: Sending to backend...');
            const result = await api.registerFace(user.id, descriptorArray, photo);
            console.log('DEBUG: Backend responded:', result);
            
            if (result.success) {
                if (statusEl) statusEl.innerHTML = '✅ Berhasil! Pendaftaran wajah tersimpan.';
                
                // Update local session
                user.faceData = JSON.stringify(descriptorArray);
                user.facePhotoId = result.data?.facePhotoId || '';
                auth.currentUser = user;
                storage.set('session', user);
                
                // Show success prominently on page
                const container = document.getElementById('registration-save-container');
                if (container) {
                    container.innerHTML = `
                        <div style="text-align:center; padding: 20px;">
                            <div style="font-size:64px; margin-bottom: 20px;">✅</div>
                            <h3 style="color:#10b981; margin:12px 0;">Pendaftaran Berhasil!</h3>
                            <p style="color:#64748b;">Wajah Anda telah disimpan. Aplikasi akan memulai ulang untuk mengaktifkan menu absen...</p>
                        </div>
                    `;
                }
                
                // Automatic restart as requested by user to ensure all states are fresh
                setTimeout(() => {
                    if (typeof loader !== 'undefined') loader.show('Memulai ulang...');
                    // Use location.reload but keep the hash to return to absensi if needed, 
                    // or just go to root and let user click. 
                    // User wants "menu absen sekarang bisa dilakukan", so navigating to #absensi is best.
                    window.location.href = window.location.origin + window.location.pathname + '#absensi';
                    window.location.reload();
                }, 2000);
            } else {
                const errorMsg = result.error || 'Server menolak data';
                console.error('Registration Rejection:', errorMsg);
                if (statusEl) statusEl.innerHTML = '❌ Gagal: ' + errorMsg;
                alert('PENDAFTARAN GAGAL: ' + errorMsg);
                if (saveBtn) { saveBtn.disabled = false; }
            }
        } catch (e) {
            console.error('Network/JS Exception:', e);
            if (statusEl) statusEl.innerHTML = '❌ Error: ' + e.toString();
            alert('EXCEPTION: ' + e.toString());
        } finally {
            modal.close();
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    retakePhoto() {
        this.photoCaptured = false;
        const preview = document.getElementById('camera-preview');
        
        // Cleanup registration specific container if exists
        const regContainer = document.getElementById('registration-save-container');
        if (regContainer) regContainer.remove();

        if (preview) {
            preview.innerHTML = `
                <video id="camera-video" autoplay playsinline></video>
                <canvas id="camera-canvas" style="display: none;"></canvas>
                <div class="face-overlay" id="face-overlay"><div class="face-frame"></div></div>
            `;
        }
        document.getElementById('btn-retake').style.display = 'none';
        this.updateActionTitle(this.currentAction);
        this.initCamera().then(() => this.startDetection());
    },

    initLocation() {
        const statusEl = document.getElementById('location-status');
        const mapPlaceholder = document.querySelector('#location-map .map-placeholder');
        const locationInfoEl = document.getElementById('location-info');
        const mapContainer = document.getElementById('location-map');
        
        if (statusEl) statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mencari sinyal GPS...';

        navigator.geolocation.getCurrentPosition(
            (pos) => { 
                this.position = pos; 
                this.locationVerified = true; 
                this.checkCanSubmit(); 
                
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;

                if (statusEl) {
                    statusEl.innerHTML = `<i class="fas fa-map-marker-alt" style="color:var(--color-success)"></i> Lokasi Terdeteksi`;
                }
                
                // Hide the placeholder
                if (mapPlaceholder) mapPlaceholder.style.display = 'none';
                
                // Initialize or Update Leaflet Map
                if (mapContainer) {
                    try {
                        if (!this.miniMap) {
                            // Create map
                            this.miniMap = L.map('location-map', {
                                zoomControl: false,
                                attributionControl: false
                            }).setView([lat, lng], 16);
                            
                            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.miniMap);
                            
                            this.miniMarker = L.marker([lat, lng]).addTo(this.miniMap);
                        } else {
                            // Update map
                            this.miniMap.setView([lat, lng], 16);
                            this.miniMarker.setLatLng([lat, lng]);
                            this.miniMap.invalidateSize();
                        }
                    } catch (e) {
                        console.error('Leaflet init error on face-rec:', e);
                        // Fallback: show static text or just ignore if already init
                    }
                }

                // Show coordinate info section
                if (locationInfoEl) {
                    locationInfoEl.style.display = 'block';
                    const coordsEl = document.getElementById('location-coords');
                    const timeEl = document.getElementById('location-time');
                    const accuracyEl = document.getElementById('location-accuracy');
                    if (coordsEl) coordsEl.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString('id-ID');
                    if (accuracyEl) accuracyEl.textContent = `±${Math.round(pos.coords.accuracy)}m`;
                    
                    // Fetch reverse geocode for address
                    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
                        .then(res => res.json())
                        .then(data => {
                            const addrEl = document.getElementById('location-address');
                            if (addrEl && data.display_name) addrEl.textContent = data.display_name;
                        })
                        .catch(err => console.warn('Reverse geocode error:', err));
                }
            },
            (err) => { 
                console.warn('Geolocation error:', err);
                this.locationVerified = true; // Still allow as per fallback logic
                this.checkCanSubmit(); 
                if (statusEl) {
                    statusEl.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--color-warning)"></i> GPS tidak ditemukan (Izin?)';
                }
                // Update placeholder to show error state
                if (mapPlaceholder) {
                    mapPlaceholder.style.display = 'flex';
                    mapPlaceholder.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--color-warning)"></i><p>Lokasi tidak tersedia</p>';
                }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    },

    bindButtons() {
        const captureBtn = document.getElementById('btn-capture');
        const registerBtn = document.getElementById('btn-register-face');
        const retakeBtn = document.getElementById('btn-retake');
        const confirmBtn = document.getElementById('btn-confirm-attendance');

        const buttons = [
            { el: captureBtn, handler: () => this.capturePhoto() },
            { el: registerBtn, handler: () => this.capturePhoto() },
            { el: retakeBtn, handler: () => this.retakePhoto() },
            { el: confirmBtn, handler: () => this.confirmAttendance() }
        ];

        buttons.forEach(btn => {
            if (btn.el) {
                // Remove old listeners by replacing the element or just setting onclick to null
                btn.el.onclick = null;
                
                // Add both click and touchend for mobile responsiveness
                ['click', 'touchstart'].forEach(eventType => {
                    btn.el.addEventListener(eventType, (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        btn.handler();
                    }, { passive: false });
                });
            }
        });
    },

    checkCanSubmit() {
        const confirmBtn = document.getElementById('btn-confirm-attendance');
        if (confirmBtn) confirmBtn.disabled = !this.photoCaptured;
    },

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Earth radius in meters
        const phi1 = lat1 * Math.PI / 180;
        const phi2 = lat2 * Math.PI / 180;
        const deltaPhi = (lat2 - lat1) * Math.PI / 180;
        const deltaLambda = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                  Math.cos(phi1) * Math.cos(phi2) *
                  Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // in meters
    },

    cleanup() {
        this.stopCamera();
    }
};

window.initFaceRecognition = (action) => faceRecognition.init(action);
window.faceRecognition = faceRecognition;

// Expose critical methods as top-level globals for onclick fallback on all mobile browsers
window.doSaveRegistration = function() {
    console.log('doSaveRegistration global called');
    faceRecognition.confirmRegistration();
};
window.doRetakePhoto = function() {
    console.log('doRetakePhoto global called');
    faceRecognition.retakePhoto();
};
