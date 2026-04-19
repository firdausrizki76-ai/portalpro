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
            // Background sync
            this.loadTodayAttendance().then(() => this.updateUI());
            return;
        }

        try {
            console.log('Initializing absensi page...');
            
            // PRIORITY 1: Initialize local/visual elements first so page is responsive immediately
            this.initLiveClock();
            this.initButtons();
            this.renderTimeline();
            this.updateUI(); // Initial render with cached/default data

            // PRIORITY 2: Background load of heavy data
            await this.loadTodayAttendance();
            await this.loadAttendanceHistory();
            
            this.updateUI(); // Final render with fresh data
            this.initialized = true;
        } catch (error) {
            console.error('Absensi init error:', error);
            // Fallback UI update in case of failure
            this.updateUI();
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    async loadTodayAttendance() {
        try {
            // SYNC: Refresh the profile to get latest shift/data from backend first
            await auth.refreshProfile();
        } catch (e) {
            console.warn('Profile refresh failed, using cached data');
        }

        const currentUser = auth.getCurrentUser();
        const userId = currentUser?.id || 'demo-user';

        // Initialize with core profile data FIRST to avoid 'Pagi' fallback if possible
        const today = dateTime.getLocalDate();
        let currentShift = currentUser?.shift || 'Pagi';

        try {
            const [result, settingsRes, shiftRes] = await Promise.allSettled([
                api.getTodayAttendance(userId),
                api.getSettings(),
                api.getShifts()
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

            let todayAttendance = (result.status === 'fulfilled' && result.value.success) ? result.value.data : {};

            if (!todayAttendance.date) {
                // Automated shift lookup from admin schedule
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
                        if (assignedShift && assignedShift !== '') {
                            console.log('Absen Shift Sync - Overriding with Schedule:', assignedShift);
                            currentShift = assignedShift;
                        }
                    }
                } catch (e) {
                    console.error('Error reading shift schedule:', e);
                }

                todayAttendance = {
                    date: today,
                    shift: currentShift,
                    clockIn: null,
                    clockOut: null,
                    breakStart: null,
                    breakEnd: null,
                    status: 'waiting'
                };
            }

            // Ensure null values are explicitly set (not undefined)
            todayAttendance.clockIn = todayAttendance.clockIn || null;
            todayAttendance.clockOut = todayAttendance.clockOut || null;
            todayAttendance.breakStart = todayAttendance.breakStart || null;
            todayAttendance.breakEnd = todayAttendance.breakEnd || null;

            // Handle dual verification mapping
            if (todayAttendance.verificationInPhoto) {
                todayAttendance.verificationIn = {
                    photo: todayAttendance.verificationInPhoto,
                    location: todayAttendance.verificationInLocation ? JSON.parse(todayAttendance.verificationInLocation) : null,
                    timestamp: todayAttendance.verificationInTimestamp
                };
            }
            if (todayAttendance.verificationOutPhoto) {
                todayAttendance.verificationOut = {
                    photo: todayAttendance.verificationOutPhoto,
                    location: todayAttendance.verificationOutLocation ? JSON.parse(todayAttendance.verificationOutLocation) : null,
                    timestamp: todayAttendance.verificationOutTimestamp
                };
            }

            // Determine current state
            // Determine current state based on shift range
            const shifts = storage.get('shifts') || [];
            const activeShift = shifts.find(s => String(s.name) === String(todayAttendance.shift));
            let isTooLate = false;
            if (activeShift && activeShift.startTime) {
                const [h, m] = activeShift.startTime.replace('.', ':').split(':').map(Number);
                const startMin = (h || 0) * 60 + (m || 0);
                const now = new Date();
                const nowMin = now.getHours() * 60 + now.getMinutes();
                isTooLate = nowMin > startMin + 60;
            }
            const isAlfaTime = isTooLate;

            
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

            // Status Badge logic using shared utility
            const statusInfo = dateTime.calculateAttendanceStatus(record);
            let statusBadge = `<span class="badge-status ${statusInfo.class}">${statusInfo.label}</span>`;

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

        // Double check shift range status right before proceeding
        if (!this.checkShiftRangeStatus('clock-in')) {
            modal.show(
                'Akses Terbatas',
                '<div style="text-align: center; padding: 20px;">' +
                '<i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #EF4444; margin-bottom: 20px;"></i>' +
                '<p style="font-size: 16px; line-height: 1.6; color: #333;">' +
                'anda sudah berada di luar range jam kerja' +
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

    handleClockOut() {
        if (!this.attendanceData.clockIn || this.attendanceData.clockOut) return;

        // Restriction Check: Check if within allowed shift time range (+/- 1 hour)
        if (!this.checkShiftRangeStatus('clock-out')) {
            modal.show(
                'Akses Terbatas',
                '<div style="text-align: center; padding: 20px;">' +
                '<i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #EF4444; margin-bottom: 20px;"></i>' +
                '<p style="font-size: 16px; line-height: 1.6; color: #333;">' +
                'anda sudah berada di luar range jam kerja' +
                '</p>' +
                '</div>',
                [{ label: 'Mengerti', class: 'btn-primary', onClick: () => modal.close() }]
            );
            return;
        }

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

        // Restriction Check: Check if within allowed shift time range (+/- 1 hour)
        if (!this.checkShiftRangeStatus(action)) {
            modal.show(
                'Akses Terbatas',
                '<div style="text-align: center; padding: 20px;">' +
                '<i class="fas fa-clock" style="font-size: 48px; color: #EF4444; margin-bottom: 20px;"></i>' +
                '<p style="font-size: 18px; font-weight: 600; color: #333; margin-bottom: 8px;">' +
                'anda sudah berada di luar range jam kerja' +
                '</p>' +
                '<p style="font-size: 14px; color: #64748b;">' +
                'Silahkan hubungi admin jika terdapat kendala.' +
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
            // overtime case removed
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

            // Notify Admin
            const recipientId = 'admin';
            const actionLabel = action === 'clock-in' ? 'Clock In' : 'Clock Out';
            notifications.add(recipientId, currentUser.name, `melakukan ${actionLabel}`, 'info');
            
            // Success navigation
            setTimeout(() => {
                router.navigate('absensi');
            }, 1000);
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

        // Auto navigate back to attendance page
        setTimeout(() => {
            if (window.location.hash === '#face-recognition') {
                router.navigate('absensi');
            }
        }, 3000);
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

    checkShiftRangeStatus(action) {
        const shiftName = this.attendanceData.shift;
        if (!shiftName || shiftName === 'Libur') return true;

        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();

        // Get shift details
        const shifts = storage.get('shifts') || [];
        const userShift = shifts.find(s => String(s.name) === String(shiftName));
        
        // Default fallbacks
        let startMin = 480; // 08:00
        let endMin = 1020;  // 17:00

        if (userShift) {
            if (userShift.startTime) {
                const [h, m] = userShift.startTime.replace('.', ':').split(':').map(Number);
                startMin = (h || 0) * 60 + (m || 0);
            }
            if (userShift.endTime) {
                const [h, m] = userShift.endTime.replace('.', ':').split(':').map(Number);
                endMin = (h || 0) * 60 + (m || 0);
            }
        }

        if (action === 'clock-in') {
            // Rule: ShiftStart +/- 60 min
            return (nowMin >= startMin - 60 && nowMin <= startMin + 60);
        } else if (action === 'clock-out') {
            // Rule: Not more than 1 hour after ShiftEnd
            return (nowMin <= endMin + 60);
        }

        return true;
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

            btnClockIn.disabled = isClockedIn || isLibur;

            if (isClockedIn) {
                btnClockIn.classList.add('completed');
                const timeEl = document.getElementById('clock-in-time');
                if (timeEl) timeEl.textContent = this.attendanceData.clockIn;
            } else if (isLibur) {
                btnClockIn.classList.add('completed');
            } else {
                btnClockIn.classList.remove('completed');
            }
        }



        // Overtime UI update removed

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
