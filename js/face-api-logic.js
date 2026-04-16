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

    async init(action) {
        console.log('Face Recognition UI initialized with action:', action);
        this.currentAction = action;
        this.photoCaptured = false;
        this.locationVerified = false;
        this.position = null;
        this.isRegistering = (action === 'register-face');

        // Update UI
        this.updateActionTitle(action);
        
        // =============================================
        // TEST BYPASS MODE: Skip camera for registration
        // This verifies the Drive-saving pipeline directly
        // =============================================
        if (this.isRegistering) {
            this.showRegistrationTestUI();
            return; // Skip camera/AI entirely
        }
        // =============================================

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

    showRegistrationTestUI() {
        const user = auth.getCurrentUser();
        const cameraSection = document.querySelector('.face-registration-section') ||
                              document.querySelector('.camera-section') ||
                              document.querySelector('.face-camera-container') ||
                              document.getElementById('camera-preview')?.parentNode;

        // A tiny 1px test image (solid green pixel, valid JPEG base64)
        const TEST_PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=';
        // A dummy descriptor (128 zeros - valid for registration)
        const TEST_DESCRIPTOR = new Array(128).fill(0.0);

        const container = document.createElement('div');
        container.id = 'registration-save-container';
        container.style.cssText = 'text-align:center; padding:24px 16px; max-width:400px; margin:0 auto;';
        container.innerHTML = `
            <div style="font-size:64px; margin-bottom:16px;">📸</div>
            <h3 style="margin-bottom:8px; color:#1e3a8a;">Mode Pendaftaran Wajah</h3>
            <p style="color:#64748b; margin-bottom:24px; font-size:14px;">
                Halo <b>${user ? user.name : 'Pengguna'}</b>, klik tombol di bawah untuk mendaftarkan wajah Anda.
            </p>
            <button id="btn-test-save" class="btn-primary"
                style="padding:16px 32px;font-size:16px;width:100%;border-radius:12px;
                       cursor:pointer;touch-action:manipulation;margin-bottom:12px;"
                onclick="doSaveRegistration()">
                <i class="fas fa-user-check"></i> Simpan Pendaftaran Wajah
            </button>
            <div id="reg-status" style="margin-top:16px; font-size:14px; color:#64748b;"></div>
        `;

        // Store test data so confirmRegistration() can access it
        this.canvas = document.createElement('canvas');
        this.canvas.width = 1;
        this.canvas.height = 1;
        const ctx = this.canvas.getContext('2d');
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(0, 0, 1, 1);
        this._testPhotoData = TEST_PHOTO;
        this.currentDescriptor = TEST_DESCRIPTOR;
        this.photoCaptured = true;

        if (cameraSection) {
            cameraSection.innerHTML = '';
            cameraSection.appendChild(container);
        } else {
            // Fallback: append to body
            document.body.appendChild(container);
        }

        console.log('TEST: Registration UI shown for user', user?.id);
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
            if (locationSec) locationSec.style.display = 'none';
            if (confirmBtn) {
                confirmBtn.innerHTML = '<i class="fas fa-user-check"></i> Konfirmasi Pendaftaran';
            }
        } else {
            if (registerBtn) registerBtn.style.display = 'none';
            if (captureBtn) captureBtn.style.display = 'flex';
            if (locationSec) locationSec.style.display = 'block';
            if (confirmBtn) {
                confirmBtn.innerHTML = '<i class="fas fa-check-circle"></i> Konfirmasi Absensi';
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
                    const offLat = parseFloat(allSettings.office_lat);
                    const offLng = parseFloat(allSettings.office_lng);

                    if (!isNaN(offLat) && !isNaN(offLng)) {
                        if (!this.position) {
                            toast.error('Gagal mendapatkan lokasi GPS. Pastikan GPS aktif.');
                            return;
                        }

                        const dist = this.calculateDistance(
                            this.position.coords.latitude, 
                            this.position.coords.longitude,
                            offLat,
                            offLng
                        );

                        console.log('Distance from Office:', dist, 'm | Max Allowed:', maxDistance, 'm');

                        if (dist > maxDistance) {
                            modal.show(
                                'Di Luar Jangkauan',
                                `<div style="text-align:center; padding: 20px;">
                                    <i class="fas fa-map-marker-alt" style="font-size: 48px; color: var(--color-warning); margin-bottom: 20px;"></i>
                                    <p>Anda berada di luar radius absen yang diizinkan.</p>
                                    <p style="font-size: 14px; color: #666; margin-top: 10px;">Jarak Anda: <b>${dist.toFixed(0)}m</b><br>Maksimal: <b>${maxDistance}m</b></p>
                                </div>`,
                                [{ label: 'Tutup', class: 'btn-secondary', onClick: () => modal.close() }]
                            );
                            return;
                        }
                    } else {
                        console.warn('Location tracking enabled but office coordinates not set.');
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
        // This is crucial to prevent browser hangs on 4K/High-res mobile cameras
        const ctx = this.canvas.getContext('2d');
        const MAX_WIDTH = 640;
        const scale = Math.min(1, MAX_WIDTH / this.video.videoWidth);
        
        this.canvas.width = this.video.videoWidth * scale;
        this.canvas.height = this.video.videoHeight * scale;
        
        console.log(`Resizing capture: ${this.video.videoWidth}x${this.video.videoHeight} -> ${this.canvas.width}x${this.canvas.height}`);
        ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        
        this.currentDescriptor = descriptor;
        this.photoCaptured = true;
        this.stopCamera();

        // Update UI Preview
        const preview = document.getElementById('camera-preview');
        if (preview) {
            preview.innerHTML = `
                <img src="${this.canvas.toDataURL('image/jpeg', 0.7)}" class="captured-photo" alt="Captured">
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
        }
        
        this.checkCanSubmit();
    },

    async confirmAttendance() {
        if (this.isRegistering) {
            await this.confirmRegistration();
            return;
        }

        const attendanceData = {
            action: this.currentAction,
            timestamp: new Date().toISOString(),
            location: this.position ? {
                latitude: this.position.coords.latitude,
                longitude: this.position.coords.longitude
            } : null,
            photo: this.canvas.toDataURL('image/jpeg', 0.7)
        };

        storage.set('temp_attendance', attendanceData);
        toast.success('Verifikasi wajah berhasil!');

        if (this.currentAction === 'izin') {
            await window.izin.submitWithVerification(attendanceData);
            router.navigate('izin');
        } else {
            await window.absensi.processWithVerification(this.currentAction, attendanceData);
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
        
        modal.showLoading('Mendaftarkan wajah...');
        
        try {
            // Use pre-built test photo if in bypass mode, else use canvas
            const photo = this._testPhotoData || this.canvas.toDataURL('image/jpeg', 0.7);
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
                        <div style="font-size:64px;">✅</div>
                        <h3 style="color:#10b981; margin:12px 0;">Pendaftaran Berhasil!</h3>
                        <p style="color:#64748b;">Wajah Anda telah disimpan. Anda akan diarahkan ke halaman absensi...</p>
                    `;
                }
                
                setTimeout(() => router.navigate('absensi'), 2000);
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
        navigator.geolocation.getCurrentPosition(
            (pos) => { this.position = pos; this.locationVerified = true; this.checkCanSubmit(); },
            () => { this.locationVerified = true; this.checkCanSubmit(); } // Fallback
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
