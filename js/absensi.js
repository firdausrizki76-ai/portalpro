/**
 * Portal Karyawan - Absensi
 * Attendance/Clock In-Out functionality
 */

const absensi = {
    currentState: 'waiting', // waiting, clocked-in, on-break, completed
    attendanceData: {},
    liveClockInterval: null,
    systemSettings: {},

    initialized: false,

    async init() {
        if (this.initialized) {
            // Background refresh without showing loader
            this.loadTodayAttendance().then(() => this.updateUI());
            // Re-populate location dropdown to check for new permits
            this.populateLocationDropdown();
            return;
        }

        try {
            console.log('Initializing absensi page...');
            
            // PRIORITY 1: Initialize visual elements and render with cache immediately
            this.initLiveClock();
            this.initButtons();
            
            // Initial render with cached/default data
            this.updateUI(); 
            this.renderTimeline();

            // PRIORITY 2: Hide loader as soon as the first render is visible
            if (typeof loader !== 'undefined') loader.hide();

            // PRIORITY 3: Background load fresh data + populate location dropdown
            await Promise.allSettled([
                this.loadTodayAttendance(),
                this.loadAttendanceHistory(),
                this.populateLocationDropdown()
            ]);
            
            // Final render with fresh data
            this.updateUI();
            this.renderTimeline();
            
            this.initialized = true;
        } catch (error) {
            console.error('Absensi init error:', error);
            if (typeof loader !== 'undefined') loader.hide();
            this.updateUI();
        }
    },

    // All registered office locations (must match IDs used in Settings: office_lat, office_lat_2, etc.)
    locationMap: {
        '1': 'Kecamatan Cinere',
        '2': 'Kelurahan Cinere',
        '3': 'Kelurahan Pangkalan Jati',
        '4': 'Kelurahan Pangkalan Jati Baru',
        '5': 'Kelurahan Gandul'
    },

    // Cache for active WFH permits
    _activePermits: null,

    async populateLocationDropdown() {
        const selectEl = document.getElementById('absensi-select-location');
        if (!selectEl) return;

        const currentUser = auth.getCurrentUser();
        // Use lokasiKerja first, fallback to department
        const userLocation = (currentUser?.lokasiKerja || currentUser?.department || '').trim();

        // 1. Fetch active WFH/WFA/Dinas permits for this user FIRST
        let unlocked = { wfh: false, wfa: false, dinas: false };
        try {
            const res = await api.getActiveWfhPermit(currentUser.id);
            if (res.success && res.data && res.data.unlocked) {
                if (res.data.unlocked.wfh) unlocked.wfh = true;
                if (res.data.unlocked.wfa) unlocked.wfa = true;
                if (res.data.unlocked.dinas) unlocked.dinas = true;
            }
        } catch (e) { console.warn('Failed to check WFH permit:', e); }

        const hasRemotePermit = unlocked.wfh || unlocked.wfa || unlocked.dinas;
        const lockSuffix = hasRemotePermit ? ' (Terdaftar WFH/Dinas)' : '';

        // Start with empty default
        let html = '<option value="">-- Pilih Lokasi Absen --</option>';

        // 2. Build options logic
        let hasAssignedLocation = false;
        // OFFICE LOCATION: Only show if NO remote permit is active
        if (!hasRemotePermit) {
            Object.entries(this.locationMap).forEach(([id, name]) => {
                const isMatch = userLocation && (name.toLowerCase() === userLocation.toLowerCase() || 
                                 name.toLowerCase().includes(userLocation.toLowerCase()) ||
                                 userLocation.toLowerCase().includes(name.toLowerCase()));
                
                if (isMatch) {
                    html += `<option value="${id}">${name}</option>`;
                    hasAssignedLocation = true;
                }
            });
        }

        // REMOTE OPTIONS: ALWAYS SHOW (with lock if inactive)
        const remoteOptions = [
            { value: 'wfh', label: 'WFH (Work From Home)', key: 'wfh' },
            { value: 'wfa', label: 'WFA (Work From Anywhere)', key: 'wfa' },
            { value: 'dinas', label: 'Perjalanan Dinas', key: 'dinas' }
        ];

        remoteOptions.forEach(opt => {
            if (unlocked[opt.key]) {
                html += `<option value="${opt.value}">✅ ${opt.label}</option>`;
            } else {
                html += `<option value="${opt.value}" disabled style="color:#999;">🔒 ${opt.label} (Perlu izin)</option>`;
            }
        });

        selectEl.innerHTML = html;

        // 3. Auto-select logic
        const firstActiveValue = Array.from(selectEl.options).find(opt => opt.value && !opt.disabled)?.value;
        if (firstActiveValue) {
            selectEl.value = firstActiveValue;
            selectEl.dispatchEvent(new Event('change'));
        }

        console.log('Location dropdown populated | Location:', userLocation, '| Unlocked:', unlocked);
    },

    async loadTodayAttendance() {
        const currentUser = auth.getCurrentUser();
        const userId = currentUser?.id || 'demo-user';

        // Initialize with core profile data FIRST to avoid 'Pagi' fallback if possible
        const today = dateTime.getLocalDate();
        let currentShift = currentUser?.shift || 'Pagi';

        try {
            // Fetch everything in parallel including profile refresh
            const [result, settingsRes, shiftRes, refreshRes] = await Promise.allSettled([
                api.getTodayAttendance(userId),
                api.getSettings(),
                api.getShifts(),
                auth.refreshProfile() // Now runs in parallel
            ]);

            // Sync fresh shifts to local storage
            if (shiftRes.status === 'fulfilled' && shiftRes.value.success) {
                storage.set('shifts', shiftRes.value.data);
            }

            // Sync global schedule shift mapping
            if (settingsRes.status === 'fulfilled' && settingsRes.value.success) {
                this.systemSettings = settingsRes.value.data;
                const globalSettings = settingsRes.value.data;
                const loadedSchedules = {};
                Object.keys(globalSettings).forEach(k => {
                    if (k.startsWith('shift_schedule_')) {
                        const monthKey = k.replace('shift_schedule_', '');
                        try {
                            loadedSchedules[monthKey] = JSON.parse(globalSettings[k]);
                        } catch (e) { }
                    }
                });
                if (Object.keys(loadedSchedules).length > 0) {
                    storage.set('shift_schedule', loadedSchedules);
                }
            }

            // Use current profile shift as the base (refreshed by auth.refreshProfile in parallel)
            const freshUser = auth.getCurrentUser();
            currentShift = freshUser?.shift || 'Pagi';

            let todayAttendance = (result.status === 'fulfilled' && result.value.success) ? result.value.data : {};

            if (!todayAttendance.date || !todayAttendance.shift) {
                // Automated shift lookup from admin schedule as override if exists
                try {
                    const stringUserId = String(userId);
                    const schedules = storage.get('shift_schedule', {});
                    const todayObj = new Date();
                    const currentYear = todayObj.getFullYear();
                    const currentMonth = todayObj.getMonth();
                    const currentDay = todayObj.getDate();
                    const key = `${currentYear}-${currentMonth}`;

                    if (schedules[key] && schedules[key][stringUserId]) {
                        const assignedShift = schedules[key][stringUserId][currentDay];
                        if (assignedShift && assignedShift.trim() !== '') {
                            console.log('Absen Shift Sync - Found Calendar Override:', assignedShift);
                            currentShift = assignedShift;
                        }
                    }
                } catch (e) {
                    console.error('Error reading shift schedule override:', e);
                }

                todayAttendance = {
                    date: today,
                    shift: currentShift,
                    clockIn: null,
                    clockOut: null,
                    breakStart: null,
                    breakEnd: null,
                    overtimeStart: null,
                    status: 'waiting'
                };
            }

            // Ensure null values are explicitly set (not undefined)
            todayAttendance.clockIn = todayAttendance.clockIn || null;
            todayAttendance.clockOut = todayAttendance.clockOut || null;
            todayAttendance.breakStart = todayAttendance.breakStart || null;
            todayAttendance.breakEnd = todayAttendance.breakEnd || null;
            todayAttendance.overtimeStart = todayAttendance.overtimeStart || null;

            // Handle dual verification mapping
            const safeParse = (str) => {
                if (!str) return null;
                try {
                    return JSON.parse(str);
                } catch (e) {
                    console.warn('Failed to parse JSON field:', str.substring(0, 20) + '...');
                    return null;
                }
            };

            if (todayAttendance.verificationInPhoto) {
                todayAttendance.verificationIn = {
                    photo: todayAttendance.verificationInPhoto,
                    location: safeParse(todayAttendance.verificationInLocation),
                    timestamp: todayAttendance.verificationInTimestamp
                };
            }
            if (todayAttendance.verificationOutPhoto) {
                todayAttendance.verificationOut = {
                    photo: todayAttendance.verificationOutPhoto,
                    location: safeParse(todayAttendance.verificationOutLocation),
                    timestamp: todayAttendance.verificationOutTimestamp
                };
            }

            // Determine current state
            const isAlfaTime = this.checkAlfaStatus(todayAttendance.shift);
            
            if (todayAttendance.shift === 'Libur' && !todayAttendance.clockIn) {
                this.currentState = 'libur';
            } else if (todayAttendance.clockOut) {
                this.currentState = 'completed';
            } else if (!todayAttendance.clockIn && isAlfaTime) {
                this.currentState = 'alfa';
                todayAttendance.status = 'Alfa';
            } else if (todayAttendance.clockIn) {
                this.currentState = 'clocked-in';
            } else {
                this.currentState = 'waiting';
            }

            this.attendanceData = todayAttendance;
            console.log('Loaded attendance for today:', todayAttendance.date, this.attendanceData);
        } catch (error) {
            console.error('Error loading attendance:', error);
        }
    },

    async loadAttendanceHistory() {
        try {
            const result = await api.getAllAttendance();
            const allData = result.data || [];

            // Filter by current user
            const currentUser = auth.getCurrentUser();
            const userId = currentUser?.id || 'demo-user';
            const historyData = allData.filter(d => String(d.userId) === String(userId));

            this.renderHistory(historyData);
        } catch (error) {
            console.error('Error loading history:', error);
        }
    },

    renderHistory(historyData) {
        const tbody = document.getElementById('attendance-history');
        if (!tbody) return;

        if (historyData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Belum ada riwayat absensi.</td></tr>';
            return;
        }

        tbody.innerHTML = historyData.slice(0, 10).map(record => {
            // Calculate duration if clocked out
            let duration = '--';
            if (record.clockIn && record.clockOut) {
                const [inH, inM] = record.clockIn.split(':').map(Number);
                const [outH, outM] = record.clockOut.split(':').map(Number);
                let diffInMinutes = (outH * 60 + outM) - (inH * 60 + inM);

                if (diffInMinutes > 0) {
                    const h = Math.floor(diffInMinutes / 60);
                    const m = diffInMinutes % 60;
                    duration = `${h}j ${m}m`;
                }

                if (diffInMinutes > 0) {
                    const h = Math.floor(diffInMinutes / 60);
                    const m = diffInMinutes % 60;
                    duration = `${h}j ${m}m`;
                }
            }

            // Status Badge - Improved parser for verbose backend status
            let statusBadge = '<span class="badge-status">Waiting</span>';
            const s = (record.status || '').toLowerCase();
            
            if (s.includes('tepat waktu') && !s.includes('terlambat')) {
                statusBadge = '<span class="badge-status success">Tepat Waktu</span>';
            } else if (s.includes('terlambat')) {
                statusBadge = '<span class="badge-status warning">Terlambat</span>';
            } else if (s.includes('alfa') || s.includes('tanpa absen')) {
                statusBadge = '<span class="badge-status danger">Alfa/Izin</span>';
            } else if (s === 'waiting') {
                statusBadge = '<span class="badge-status">Menunggu</span>';
            }

            // Format date to local standard UI string
            const [y, m, d] = record.date.split('-');
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
            const dateStr = `${d} ${months[parseInt(m) - 1] || m} ${y}`;

            return `
                <tr>
                    <td>${dateStr}</td>
                    <td>${record.shift || '-'}</td>
                    <td>${record.clockIn || '--:--'}</td>
                    <td>${record.clockOut || '--:--'}</td>
                    <td>${duration}</td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }).join('');
    },

    initLiveClock() {
        // Clear existing interval
        if (this.liveClockInterval) {
            clearInterval(this.liveClockInterval);
        }

        const updateClock = () => {
            const clockEl = document.getElementById('live-clock');
            const dateEl = document.getElementById('live-date');
            const statusSubtext = document.getElementById('status-subtext');

            const time = dateTime.getCurrentTime();
            const date = dateTime.getCurrentDate();

            if (clockEl) clockEl.textContent = time;
            if (dateEl) dateEl.textContent = date;
            
            // Also update the status ring subtext if we're waiting to Clock In
            if (this.currentState === 'waiting' && statusSubtext) {
                statusSubtext.innerHTML = `<span style="font-size:24px;color:var(--text-main);font-weight:700;">${time}</span><br>${date}`;
            }
        };

        updateClock();
        this.liveClockInterval = setInterval(updateClock, 1000);
    },

    initButtons() {
        // Clock In - Add both click and touch events for mobile
        const btnClockIn = document.getElementById('btn-clock-in');
        const selectLocation = document.getElementById('absensi-select-location');
        const locationHint = document.getElementById('location-hint');

        if (selectLocation) {
            selectLocation.addEventListener('change', () => {
                const isLocationSelected = selectLocation.value !== '';
                const isClockedIn = !!this.attendanceData.clockIn;
                const isAlfa = this.currentState === 'alfa';
                const isLibur = this.currentState === 'libur';

                btnClockIn.disabled = !isLocationSelected || isClockedIn || isLibur || isAlfa;
                
                if (locationHint) {
                    locationHint.style.display = isLocationSelected ? 'none' : 'block';
                }
            });
        }

        if (btnClockIn) {
            btnClockIn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleClockIn();
            });
            btnClockIn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.handleClockIn();
            });
            console.log('Clock In button initialized, disabled:', btnClockIn.disabled);
        }



        // Overtime
        const btnOvertime = document.getElementById('btn-overtime');
        if (btnOvertime) {
            btnOvertime.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleOvertime();
            });
            btnOvertime.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.handleOvertime();
            });
        }

        // Clock Out
        const btnClockOut = document.getElementById('btn-clock-out');
        if (btnClockOut) {
            btnClockOut.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleClockOut();
            });
            btnClockOut.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.handleClockOut();
            });
        }
    },

    handleClockIn() {
        if (this.attendanceData.clockIn) return;

        // Double check Alfa status right before proceeding
        if (this.checkAlfaStatus(this.attendanceData.shift)) {
            modal.show(
                'Peringatan Absensi Terlambat',
                '<div style="text-align: center; padding: 20px;">' +
                '<i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #EF4444; margin-bottom: 20px;"></i>' +
                '<p style="font-size: 16px; line-height: 1.6; color: #333;">' +
                'Anda sudah tidak diizinkan untuk melakukan absen, silahkan hubungi admin secara langsung untuk meminta izin' +
                '</p>' +
                '</div>',
                [{ label: 'Mengerti', class: 'btn-primary', onClick: () => modal.close() }]
            );
            
            this.currentState = 'alfa';
            this.attendanceData.status = 'Alfa';
            this.updateUI();
            return;
        }

        // New: Check if face is registered
        const currentUser = auth.getCurrentUser();
        if (!currentUser.faceData) {
            modal.show(
                'Wajah Belum Terdaftar',
                '<div style="text-align: center; padding: 20px;">' +
                '<i class="fas fa-user-shield" style="font-size: 48px; color: var(--color-primary); margin-bottom: 20px;"></i>' +
                '<p style="font-size: 16px; line-height: 1.6; color: #333;">' +
                'Wajah Anda belum terdaftar di database. Silakan ambil foto selfie untuk mendaftarkan wajah Anda.' +
                '</p>' +
                '</div>',
                [
                    { label: 'Batal', class: 'btn-secondary', onClick: () => modal.close() },
                    { label: 'Daftarkan Wajah', class: 'btn-primary', onClick: () => {
                        modal.close();
                        router.navigate('face-recognition');
                        setTimeout(() => {
                            if (window.faceRecognition) {
                                window.faceRecognition.init('register-face');
                            }
                        }, 100);
                    }}
                ]
            );
            return;
        }

        // Navigate to face recognition first
        router.navigate('face-recognition');
        setTimeout(() => {
            if (window.faceRecognition) {
                window.faceRecognition.init('clock-in');
            }
        }, 100);
    },



    handleOvertime() {
        if (!this.attendanceData.clockIn) return;

        // Navigate to face recognition
        router.navigate('face-recognition');
        setTimeout(() => {
            if (window.faceRecognition) {
                window.faceRecognition.init('overtime');
            }
        }, 100);
    },

    handleClockOut() {
        if (!this.attendanceData.clockIn || this.attendanceData.clockOut) return;

        // Navigate to face recognition
        router.navigate('face-recognition');
        setTimeout(() => {
            if (window.faceRecognition) {
                window.faceRecognition.init('clock-out');
            }
        }, 100);
    },

    // Process attendance after face recognition verification
    async processWithVerification(action, verificationData) {
        const timeStr = dateTime.formatTime(new Date());

        // Pre-save Check: Always check Alfa before allowing process
        if (action === 'clock-in' && this.checkAlfaStatus(this.attendanceData.shift)) {
            modal.show(
                'Peringatan Absensi Terlambat',
                '<div style="text-align: center; padding: 20px;">' +
                '<i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #EF4444; margin-bottom: 20px;"></i>' +
                '<p style="font-size: 16px; line-height: 1.6; color: #333;">' +
                'Anda sudah tidak diizinkan untuk melakukan absen, silahkan hubungi admin secara langsung untuk meminta izin' +
                '</p>' +
                '</div>',
                [{ label: 'Mengerti', class: 'btn-primary', onClick: () => modal.close() }]
            );
            router.navigate('absensi');
            return;
        }

        switch (action) {
            case 'clock-in':
                this.attendanceData.clockIn = timeStr;
                break;
            case 'overtime':
                this.attendanceData.overtimeStart = timeStr;
                break;
            case 'clock-out':
                this.attendanceData.clockOut = timeStr;
                break;
        }

        // Save verification data locally to the correct action slot
        if (action === 'clock-in') {
            this.attendanceData.verificationIn = {
                timestamp: verificationData.timestamp,
                location: verificationData.location,
                photo: verificationData.photo
            };
            // For backend compatibility with saveAttendance generic 'verification' key
            this.attendanceData.verification = this.attendanceData.verificationIn;
        } else if (action === 'clock-out') {
            this.attendanceData.verificationOut = {
                timestamp: verificationData.timestamp,
                location: verificationData.location,
                photo: verificationData.photo
            };
            // For backend compatibility with saveAttendance generic 'verification' key
            this.attendanceData.verification = this.attendanceData.verificationOut;
        }

        const result = await this.saveAttendance();
        if (result && result.success) {
            // Only update UI and show success if save actually worked
            this.updateUI();
            this.renderTimeline();
            
            // CRITICAL: Refresh history immediately so the table at the bottom updates
            this.loadAttendanceHistory();

            // Notify Admin
            const recipientId = 'admin';
            const currentUser = auth.getCurrentUser();
            const actionLabel = action === 'clock-in' ? 'Clock In' : (action === 'clock-out' ? 'Clock Out' : 'Lembur');
            notifications.add(recipientId, currentUser.name, `melakukan ${actionLabel}`, 'info');
        } else {
            // Handle error (e.g. Alfa rejected by server)
            const errorMsg = (result && result.error) ? result.error : 'Gagal menyimpan absensi';
            toast.error(errorMsg, 'Error');
            
            // Re-load to ensure UI reflects server state
            await this.loadTodayAttendance();
            this.updateUI();
        }

        // Clean up temp data
        storage.remove('temp_attendance');
    },

    async saveAttendance() {
        const currentUser = auth.getCurrentUser();
        this.attendanceData.userId = currentUser?.id || 'demo-user';

        try {
            const result = await api.saveAttendance(this.attendanceData);
            if (result && result.success && result.data) {
                // Keep the frontend in sync with server-calculated data (especially 'status')
                this.attendanceData = result.data;
                return result;
            }
            return result || { success: false, error: 'Network problem' };
        } catch (error) {
            console.error('Error saving attendance:', error);
            return { success: false, error: error.message };
        }
    },

    checkTooEarlyStatus(shiftName) {
        if (!shiftName || shiftName === 'Libur') return false;
        
        const now = new Date();
        const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
        
        let shiftStartTimeStr = "08:00"; 
        let shiftEndTimeStr = "17:00";
        const shifts = storage.get('shifts', []);
        const userShift = shifts.find(s => String(s.name) === String(shiftName));
        
        if (userShift && userShift.startTime) {
            shiftStartTimeStr = userShift.startTime.replace('.', ':');
        }
        if (userShift && userShift.endTime) {
            shiftEndTimeStr = userShift.endTime.replace('.', ':');
        }
        
        const [sH, sM] = shiftStartTimeStr.split(':').map(Number);
        const shiftStartInMinutes = (sH || 0) * 60 + (sM || 0);

        const [eH, eM] = shiftEndTimeStr.split(':').map(Number);
        const shiftEndInMinutes = (eH || 0) * 60 + (eM || 0);
        
        const isCrossMidnight = shiftStartInMinutes > shiftEndInMinutes;
        
        if (isCrossMidnight) {
            return currentTimeInMinutes > shiftEndInMinutes && currentTimeInMinutes < (shiftStartInMinutes - 60);
        } else {
            return currentTimeInMinutes < (shiftStartInMinutes - 60);
        }
    },

    checkAlfaStatus(shiftName) {
        if (!shiftName || shiftName === 'Libur') return false;

        const now = new Date();
        const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();

        let shiftStartTimeStr = "08:00"; 
        let shiftEndTimeStr = "17:00"; 
        const shifts = storage.get('shifts', []);
        const userShift = shifts.find(s => String(s.name) === String(shiftName));
        
        if (userShift && userShift.startTime) {
            shiftStartTimeStr = userShift.startTime.replace('.', ':');
        }
        if (userShift && userShift.endTime) {
            shiftEndTimeStr = userShift.endTime.replace('.', ':');
        }
        
        const [sH, sM] = shiftStartTimeStr.split(':').map(Number);
        const shiftStartInMinutes = (sH || 0) * 60 + (sM || 0);

        const [eH, eM] = shiftEndTimeStr.split(':').map(Number);
        const shiftEndInMinutes = (eH || 0) * 60 + (eM || 0);

        const isCrossMidnight = shiftStartInMinutes > shiftEndInMinutes;
        const gracePeriod = 480; // 8 hours in minutes

        if (isCrossMidnight) {
            // For cross-midnight, shift end is on the next day.
            // If it's 03:00 (shift end), grace is until 11:00 AM.
            // If current time is past shiftEnd but before shiftStart-60
            if (currentTimeInMinutes > shiftEndInMinutes) {
                return currentTimeInMinutes > (shiftEndInMinutes + gracePeriod);
            }
            return false;
        } else {
            // Standard day shift (e.g. 08:00 - 17:00). Grace until 01:00 AM.
            // If shift ends at 17:00, 8 hours later is 01:00 AM (midnight crossing).
            const endWithGrace = shiftEndInMinutes + gracePeriod;
            if (endWithGrace > 1440) { // Crosses midnight
                const nextDayMinutes = endWithGrace - 1440;
                // If it's early morning (before nextDayMinutes), it's still okay.
                // If it's between nextDayMinutes and shiftStart-60, it's Alfa.
                return currentTimeInMinutes > nextDayMinutes && currentTimeInMinutes < (shiftStartInMinutes - 60);
            }
            return currentTimeInMinutes > endWithGrace;
        }
    },

    updateUI() {
        // Update status ring
        const statusRing = document.querySelector('.status-ring');
        const statusText = document.querySelector('.status-text');
        const statusSubtext = document.querySelector('.status-subtext');
        
        // Update Shift Info Card (Real-time from Spreadsheet)
        const shiftNameEl = document.getElementById('current-shift-name');
        const shiftTimeEl = document.getElementById('current-shift-time');
        
        const shifts = storage.get('shifts') || [];
        const activeShift = shifts.find(s => String(s.name) === String(this.attendanceData ? this.attendanceData.shift : '')) 
                         || (shifts.length > 0 ? shifts[0] : { name: this.attendanceData?.shift || 'Pagi', startTime: '08:00', endTime: '17:00' });

        if (shiftNameEl) shiftNameEl.textContent = activeShift?.name || 'Pagi';
        if (shiftTimeEl) shiftTimeEl.textContent = activeShift ? `${activeShift.startTime} - ${activeShift.endTime}` : '08:00 - 17:00';

        if (statusRing) {
            statusRing.className = 'status-ring';

            switch (this.currentState) {
                case 'libur':
                    statusRing.classList.add('waiting');
                    if (statusText) statusText.textContent = 'Hari Libur';
                    if (statusSubtext) statusSubtext.textContent = 'Anda tidak memiliki jadwal kerja hari ini.';
                    break;
                case 'waiting':
                    statusRing.classList.add('waiting');
                    if (statusText) statusText.textContent = 'Siap Clock In';
                    if (statusSubtext) {
                        statusSubtext.innerHTML = `<span style="font-size:24px;color:var(--text-main);font-weight:700;">${dateTime.getCurrentTime()}</span><br>${dateTime.getCurrentDate()}`;
                    }
                    break;
                case 'clocked-in':
                    statusRing.classList.add('active');
                    if (statusText) statusText.textContent = 'Sedang Bekerja';
                    if (statusSubtext) statusSubtext.textContent = 'Semangat bekerja!';
                    
                    // Show verification photo if available
                    if (this.attendanceData.verification && this.attendanceData.verification.photo) {
                        statusRing.classList.add('has-photo');
                        statusRing.innerHTML = `<img src="${this.attendanceData.verification.photo}" class="status-photo" alt="Me">`;
                        
                        if (statusSubtext && this.attendanceData.verification.location) {
                            const loc = this.attendanceData.verification.location;
                            statusSubtext.innerHTML = `Semangat bekerja!<br><span style="font-size:11px;color:var(--color-primary)">📍 Terverifikasi di (${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)})</span>`;
                        }
                    }
                    break;
                case 'completed':
                    statusRing.classList.add('completed');
                    if (statusText) statusText.textContent = 'Selesai Bekerja';
                    if (statusSubtext) statusSubtext.textContent = 'Terima kasih atas kerja kerasnya!';
                    break;
                case 'alfa':
                    statusRing.classList.add('waiting');
                    statusRing.style.borderColor = '#EF4444'; 
                    if (statusText) statusText.textContent = 'Terlewat (Alfa)';
                    if (statusSubtext) statusSubtext.textContent = 'Batas waktu absen telah berakhir.';
                    break;
            }
        }

        // Update buttons
        const btnClockIn = document.getElementById('btn-clock-in');
        const btnBreak = document.getElementById('btn-break');
        const btnAfterBreak = document.getElementById('btn-after-break');
        const btnOvertime = document.getElementById('btn-overtime');
        const btnClockOut = document.getElementById('btn-clock-out');

        // Clock In button
        if (btnClockIn) {
            const isClockedIn = this.attendanceData.clockIn !== null && this.attendanceData.clockIn !== undefined;
            const isAlfa = this.currentState === 'alfa';
            const isLibur = this.currentState === 'libur';
            const isTooEarly = this.checkTooEarlyStatus(this.attendanceData.shift);

            btnClockIn.disabled = isClockedIn || isLibur || isAlfa || isTooEarly;

            if (isClockedIn) {
                btnClockIn.classList.add('completed');
                const timeEl = document.getElementById('clock-in-time');
                if (timeEl) timeEl.textContent = this.attendanceData.clockIn;
            } else if (isLibur) {
                btnClockIn.classList.add('completed');
            } else if (isTooEarly) {
                btnClockIn.innerHTML = `
                    <div class="btn-icon"><i class="fas fa-clock"></i></div>
                    <div class="btn-text">
                        <span class="btn-label">Belum Waktunya</span>
                        <span class="btn-time">--:--</span>
                    </div>
                `;
            } else {
                btnClockIn.classList.remove('completed');
                btnClockIn.innerHTML = `
                    <div class="btn-icon"><i class="fas fa-sign-in-alt"></i></div>
                    <div class="btn-text">
                        <span class="btn-label">Clock In</span>
                        <span class="btn-time" id="clock-in-time">--:--</span>
                    </div>
                `;
            }
        }



        // Overtime button
        if (btnOvertime) {
            btnOvertime.disabled = !this.attendanceData.clockIn || this.attendanceData.clockOut !== null;
            if (this.attendanceData.overtimeStart) {
                btnOvertime.classList.add('completed');
                document.getElementById('overtime-time').textContent = this.attendanceData.overtimeStart;
            }
        }

        // Clock Out button
        if (btnClockOut) {
            btnClockOut.disabled = !this.attendanceData.clockIn || this.attendanceData.clockOut !== null;
            if (this.attendanceData.clockOut) {
                btnClockOut.classList.add('completed');
                document.getElementById('clock-out-time').textContent = this.attendanceData.clockOut;
            }
        }
    },

    renderTimeline() {
        const timeline = document.getElementById('attendance-timeline');
        if (!timeline) return;

        const items = timeline.querySelectorAll('.timeline-item');

        items.forEach(item => {
            const type = item.dataset.type;
            const timeEl = item.querySelector('.timeline-time');

            item.className = 'timeline-item pending';

            switch (type) {
                case 'clock-in':
                    if (this.attendanceData.clockIn) {
                        item.classList.remove('pending');
                        item.classList.add('completed');
                        if (timeEl) timeEl.textContent = this.attendanceData.clockIn;
                        
                        // Show Thumbnail & Location
                        const ver = this.attendanceData.verificationIn;
                        if (ver && ver.photo) {
                            let html = `<div class="timeline-verification">`;
                            html += `<img src="${ver.photo}" class="verification-thumbnail">`;
                            html += `<div class="verification-info">
                                <span class="verification-loc"><i class="fas fa-map-marker-alt"></i> ${ver.location ? (typeof ver.location.latitude === 'number' ? ver.location.latitude.toFixed(4) : ver.location.latitude) + ', ' + (typeof ver.location.longitude === 'number' ? ver.location.longitude.toFixed(4) : ver.location.longitude) : 'Lokasi tidak ada'}</span>
                                <span style="font-size:10px; color:#94a3b8">Verifikasi AI Berhasil</span>
                            </div></div>`;
                            
                            // Only add if not already present
                            if (!item.querySelector('.timeline-verification')) {
                                item.querySelector('.timeline-content').insertAdjacentHTML('afterend', html);
                            }
                        }
                    }
                    break;

                case 'clock-out':
                    if (this.attendanceData.clockOut) {
                        item.classList.remove('pending');
                        item.classList.add('completed');
                        if (timeEl) timeEl.textContent = this.attendanceData.clockOut;

                        // Show Thumbnail & Location for Clock Out
                        const ver = this.attendanceData.verificationOut;
                        if (ver && ver.photo) {
                            let html = `<div class="timeline-verification">`;
                            html += `<img src="${ver.photo}" class="verification-thumbnail">`;
                            html += `<div class="verification-info">
                                <span class="verification-loc"><i class="fas fa-map-marker-alt"></i> ${ver.location ? (typeof ver.location.latitude === 'number' ? ver.location.latitude.toFixed(4) : ver.location.latitude) + ', ' + (typeof ver.location.longitude === 'number' ? ver.location.longitude.toFixed(4) : ver.location.longitude) : 'Lokasi tidak ada'}</span>
                                <span style="font-size:10px; color:#94a3b8">Verifikasi AI Berhasil</span>
                            </div></div>`;
                            
                            // Only add if not already present
                            if (!item.querySelector('.timeline-verification')) {
                                item.querySelector('.timeline-content').insertAdjacentHTML('afterend', html);
                            }
                        }
                    }
                    break;
            }
        });

        // Set active state for current
        if (this.currentState === 'clocked-in' && !this.attendanceData.clockOut) {
            const activeItem = timeline.querySelector('.timeline-item.completed:last-child');
            if (activeItem && activeItem.nextElementSibling) {
                activeItem.nextElementSibling.classList.add('active');
            }

        }
    },
    
    getSelectedLocation: function() {
        const selectEl = document.getElementById('absensi-select-location');
        if (!selectEl) return null;
        
        const val = selectEl.value;
        if (!val) return null;
        
        const label = selectEl.options[selectEl.selectedIndex].text;
        return {
            id: val,
            name: label
        };
    }
};

// Global init function
window.initAbsensi = () => {
    absensi.init();
};

window.absensi = absensi;
