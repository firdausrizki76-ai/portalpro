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
                
                // 1. Face Match Threshold (Score = 1 - Distance)
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

                // 2. Geolocation Distance Check
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
        const scale = Math.min(1, MAX_WIDTH / this.video.videoWidth);
        
        this.canvas.width = this.video.videoWidth * scale;
        this.canvas.height = this.video.videoHeight * scale;
        
        console.log(`Resizing backup capture: ${this.video.videoWidth}x${this.video.videoHeight} -> ${this.canvas.width}x${this.canvas.height}`);
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
            // Specifically for registration: Add a centered BIG button under the preview
            const preview = document.getElementById('camera-preview');
            const saveBtnContainer = document.createElement('div');
            saveBtnContainer.id = 'registration-save-container';
            saveBtnContainer.style.textAlign = 'center';
            saveBtnContainer.style.marginTop = '20px';
            saveBtnContainer.innerHTML = `
                <button id="btn-save-registration" class="btn-primary" style="padding: 12px 30px; font-size: 16px; width: 100%; border-radius: 12px;">
                    <i class="fas fa-user-check"></i> Simpan Pendaftaran Wajah
                </button>
                <button id="btn-retake-registration" class="btn-secondary" style="margin-top: 10px; width: 100%; border-radius: 12px;">
                    <i class="fas fa-redo"></i> Foto Ulang
                </button>
            `;
            preview.parentNode.appendChild(saveBtnContainer);

            // ATTACH LISTENERS DIRECTLY
            const saveBtn = document.getElementById('btn-save-registration');
            const redoBtn = document.getElementById('btn-retake-registration');
            
            if (saveBtn) {
                ['click', 'touchstart'].forEach(type => {
                    saveBtn.addEventListener(type, (e) => {
                        e.preventDefault();
                        this.confirmRegistration();
                    }, { passive: false });
                });
            }
            if (redoBtn) {
                ['click', 'touchstart'].forEach(type => {
                    redoBtn.addEventListener(type, (e) => {
                        e.preventDefault();
                        this.retakePhoto();
                    }, { passive: false });
                });
            }
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
            toast.error('Sesi berakhir. Silakan login kembali.');
            return;
        }

        console.log('Starting backup face registration for user:', user.id);
        if (typeof loader !== 'undefined') loader.show('Mendaftarkan wajah, mohon tunggu...');
        
        try {
            const photo = this.canvas.toDataURL('image/jpeg', 0.7);
            
            // Normalize descriptor
            const descriptorArray = Array.from(this.currentDescriptor);
            console.log('Backup Payload ready, sending to API...');

            const result = await api.registerFace(user.id, descriptorArray, photo);
            console.log('Backup API Result:', result);
            
            if (result.success) {
                toast.success('Pendaftaran wajah berhasil!');
                
                // Update local session
                user.faceData = JSON.stringify(descriptorArray);
                user.facePhotoId = result.data.facePhotoId;
                auth.currentUser = user;
                storage.set('session', user);
                
                setTimeout(() => router.navigate('absensi'), 1500);
            } else {
                const errorMsg = result.error || 'Gagal mendaftar wajah';
                console.error('Backup Registration failed:', errorMsg);
                alert('Pendaftaran Gagal: ' + errorMsg);
                this.retakePhoto();
            }
        } catch (e) {
            console.error('Backup Registration error:', e);
            alert('Gangguan Koneksi: ' + e.toString());
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
                btn.el.onclick = null;
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
