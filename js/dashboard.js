/**
 * SIAP-P3KPW - Dashboard
 * Dashboard functionality and charts
 */

const dashboard = {
    initialized: false,
    attendanceData: [],

    async init() {
        if (this.initialized) {
            // Background refresh without showing loader
            this.loadData().then(() => {
                this.renderUI();
            });
            return;
        }

        // Priority 1: Render UI immediately with whatever we have in cache
        // and hide loader ASAP for perceived speed
        this.renderUI();
        if (typeof loader !== 'undefined') loader.hide();

        try {
            // Priority 2: Background load fresh data from API
            await this.loadData();
            
            // Priority 3: Re-render with fresh data silently
            this.renderUI();
            
            this.initialized = true;
        } catch (error) {
            console.error('Dashboard init error:', error);
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    // Centralized rendering method
    renderUI() {
        try {
            this.updateWelcomeCard();
            this.updateStats();
            this.updateSessionInfo();
            this.updateProgressBar();
            this.renderActivityList();
            this.renderTeamPresence();
            this.updateWeeklyAttendanceChart();
        } catch (e) {
            console.error('Error in renderUI:', e);
        }
    },

    async loadData() {
        try {
            const currentUser = auth.getCurrentUser();
            if (currentUser && currentUser.id) {
                // Run multiple requests in parallel
                const [attResult, settingsRes, teamRes, profileRes] = await Promise.allSettled([
                    api.getAttendance(currentUser.id),
                    api.getSettings(),
                    api.getEmployees(), // For team presence
                    auth.refreshProfile() // Ensure session is fresh
                ]);

                // Immediately update Welcome card if profile was refreshed 
                // (This ensures shift changes from DB are shown ASAP)
                if (profileRes.status === 'fulfilled') {
                    console.log('Profile refreshed, updating welcome card specifically.');
                    this.updateWelcomeCard();
                }

                // 1. Process Attendance
                if (attResult.status === 'fulfilled' && attResult.value.success) {
                    this.attendanceData = attResult.value.data || [];
                }

                // 2. Process Settings & Schedules
                if (settingsRes.status === 'fulfilled' && settingsRes.value.success) {
                    const globalSettings = settingsRes.value.data;
                    const loadedSchedules = {};
                    Object.keys(globalSettings).forEach(k => {
                        if (k.startsWith('shift_schedule_')) {
                            const monthKey = k.replace('shift_schedule_', '');
                            try {
                                const data = globalSettings[k];
                                // Some environments might return strings with escaped characters
                                loadedSchedules[monthKey] = typeof data === 'string' ? JSON.parse(data) : data;
                            } catch (e) {
                                console.warn('Failed to parse schedule for:', monthKey);
                            }
                        }
                    });
                    if (Object.keys(loadedSchedules).length > 0) {
                        storage.set('shift_schedule', loadedSchedules);
                    }
                }
                
                // 3. Process Team Data
                if (teamRes.status === 'fulfilled' && teamRes.value.success) {
                    storage.set('admin_employees', teamRes.value.data || []);
                }
            }
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    },

    updateWelcomeCard() {
        const welcomeCard = document.querySelector('.welcome-card');
        const greetingEl = document.querySelector('.welcome-content h2');
        const shiftEl = document.getElementById('welcome-shift');
        const iconEl = document.querySelector('.welcome-illustration i');

        if (!welcomeCard || !greetingEl) return;

        const hour = new Date().getHours();
        let greeting = 'Selamat Pagi';
        let icon = 'fa-sun';
        let className = 'morning';

        if (hour >= 11 && hour < 15) {
            greeting = 'Selamat Siang';
            icon = 'fa-sun';
            className = 'afternoon';
        } else if (hour >= 15 && hour < 18) {
            greeting = 'Selamat Sore';
            icon = 'fa-cloud-sun';
            className = 'evening';
        } else if (hour >= 18) {
            greeting = 'Selamat Malam';
            icon = 'fa-moon';
            className = 'evening';
        }

        const userName = auth.getCurrentUser()?.name?.split(' ')[0] || 'User';
        greetingEl.innerHTML = `${greeting}, <span id="welcome-name">${userName}</span>! 👋`;

        if (iconEl) {
            iconEl.className = `fas ${icon}`;
        }

        // Update card class for different gradient
        welcomeCard.className = `welcome-card ${className}`;

        // Update shift info
        const shifts = storage.get('shifts', []);
        let currentShiftName = auth.getCurrentUser()?.shift || 'Pagi';

            // Automated shift lookup from admin schedule
            try {
                const currentUser = auth.getCurrentUser();
                const userId = String(currentUser?.id);
                const schedules = storage.get('shift_schedule', {});
                const todayObj = new Date();
                const currentYear = todayObj.getFullYear();
                const currentMonth = todayObj.getMonth();
                const currentDay = todayObj.getDate();
                const key = `${currentYear}-${currentMonth}`;

                console.log('Dashboard Shift Sync - Key:', key, 'UserId:', userId, 'Day:', currentDay);

                if (schedules[key]) {
                    // Try by ID first, then by Email as fallback
                    const userSchedule = schedules[key][userId] || schedules[key][currentUser?.email];
                    if (userSchedule) {
                        const assignedShift = userSchedule[currentDay];
                        console.log('Dashboard Shift Sync - Found Shift:', assignedShift);
                        if (assignedShift && assignedShift.trim() !== '') {
                            currentShiftName = assignedShift;
                        }
                    }
                } else {
                    console.log('Dashboard Shift Sync - Missing Schedule key for this month.');
                }
            } catch (e) {
                console.error('Error reading shift schedule:', e);
            }

        const activeShift = shifts.find(s => s.name === currentShiftName) || shifts[0] || { name: 'Pagi', startTime: '08:00', endTime: '17:00' };

        if (shiftEl) {
            if (currentShiftName === 'Libur') {
                shiftEl.textContent = `Shift: Libur (Tidak ada jadwal)`;
            } else {
                shiftEl.textContent = `Shift: ${activeShift.name} (${activeShift.startTime} - ${activeShift.endTime})`;
            }
        }
    },

    updateStats() {
        const attendance = this.attendanceData;

        // Calculate stats
        const total = Math.max(26, attendance.length); // Assuming min 26 working days base
        const present = attendance.filter(a => a.status === 'ontime').length;
        const late = attendance.filter(a => a.status === 'late').length;
        const absent = attendance.filter(a => a.status === 'absent').length;

        // Update donut chart values
        const presentPercent = total > 0 ? Math.round((present / total) * 100) : 0;

        // Update center text
        const donutValue = document.querySelector('.donut-value');
        if (donutValue) {
            donutValue.textContent = `${presentPercent}%`;
        }

        // Update legend
        const legendValues = document.querySelectorAll('.legend-value');
        if (legendValues.length >= 3) {
            legendValues[0].textContent = `${present} hari`;
            legendValues[1].textContent = `${late} hari`;
            legendValues[2].textContent = `${absent} hari`;
        }
    },

    updateSessionInfo() {
        // Get today's attendance
        const today = dateTime.getLocalDate();
        const attendance = this.attendanceData;
        const todayAttendance = attendance.find(a => a.date === today);

        const clockInEl = document.getElementById('dashboard-clock-in');
        const clockOutEl = document.getElementById('dashboard-clock-out');
        const durationEl = document.getElementById('dashboard-duration');
        const latenessEl = document.getElementById('dashboard-lateness');

        if (clockInEl) clockInEl.textContent = '--:--';
        if (clockOutEl) clockOutEl.textContent = '--:--';
        if (durationEl) durationEl.textContent = '0j 0m';

        if (todayAttendance) {
            if (clockInEl) clockInEl.textContent = todayAttendance.clockIn || '--:--';
            if (clockOutEl) clockOutEl.textContent = todayAttendance.clockOut || '--:--';

            if (todayAttendance.clockIn && todayAttendance.clockOut && durationEl) {
                durationEl.textContent = dateTime.calculateDuration(
                    todayAttendance.clockIn,
                    todayAttendance.clockOut
                );
            }
        }

        // Calculate accumulated lateness for the current month
        if (latenessEl) {
            let totalLateMinutes = 0;
            const currentMonth = today.substring(0, 7); // "YYYY-MM"
            const monthAttendance = attendance.filter(a => a.date && a.date.startsWith(currentMonth));

            // Get shift data for lateness calculation
            const shifts = storage.get('shifts', []);
            const currentUser = auth.getCurrentUser();
            let defaultShiftName = currentUser?.shift || 'Pagi';

            monthAttendance.forEach(att => {
                if (!att.clockIn) return;

                // Determine the shift for this record
                const shiftName = att.shift || defaultShiftName;
                const shift = shifts.find(s => String(s.name) === String(shiftName));
                
                let shiftStartMin = 8 * 60; // default 08:00
                if (shift && shift.startTime) {
                    const [sH, sM] = String(shift.startTime).replace('.', ':').split(':').map(Number);
                    shiftStartMin = (sH || 0) * 60 + (sM || 0);
                }

                // Parse clock-in time
                const safeClockIn = String(att.clockIn).replace('.', ':');
                const [inH, inM] = safeClockIn.split(':').map(Number);
                const clockInMin = (inH || 0) * 60 + (inM || 0);

                // Calculate lateness (no tolerance - show raw lateness)
                const lateBy = clockInMin - shiftStartMin;
                if (lateBy > 0) {
                    totalLateMinutes += lateBy;
                }
            });

            if (totalLateMinutes > 0) {
                const lateHours = Math.floor(totalLateMinutes / 60);
                const lateRemainder = totalLateMinutes % 60;
                if (lateHours > 0) {
                    latenessEl.textContent = `${lateHours}j ${lateRemainder}m`;
                } else {
                    latenessEl.textContent = `${totalLateMinutes} menit`;
                }
                latenessEl.style.color = '#EF4444';
            } else {
                latenessEl.textContent = '0 menit';
                latenessEl.style.color = 'var(--color-success)';
            }
        }
    },

    updateProgressBar() {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTime = currentHour + (currentMinute / 60);

        // Assuming 8-hour work day from 8 AM to 5 PM
        const startHour = 8;
        const endHour = 17;
        const totalHours = endHour - startHour;

        let progress = ((currentTime - startHour) / totalHours) * 100;
        progress = Math.max(0, Math.min(100, progress));

        const progressFill = document.getElementById('work-progress');
        if (progressFill) {
            progressFill.style.width = `${progress}%`;
        }
    },

    renderActivityList() {
        const container = document.getElementById('dashboard-activity-list');
        if (!container) return;

        // Get latest attendance entries
        const attendance = [...this.attendanceData].slice(0, 5);

        if (attendance.length === 0) {
            container.innerHTML = '<div class="notification-empty">Tidak ada aktivitas terbaru</div>';
            return;
        }

        container.innerHTML = attendance.map(att => {
            const status = dateTime.calculateAttendanceStatus(att);
            return `
                <div class="activity-item">
                    <div class="activity-icon ${status.class}">
                        <i class="fas fa-clock"></i>
                    </div>
                    <div class="activity-content">
                        <p class="activity-text">Absensi ${dateTime.formatDate(att.date, 'short')} - <strong>${status.label}</strong></p>
                        <span class="activity-time">${att.clockIn ? att.clockIn : '--:--'} ${att.clockOut ? ' - ' + att.clockOut : ''}</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderTeamPresence() {
        const container = document.getElementById('dashboard-team-avatars');
        if (!container) return;

        const allEmployees = storage.get('admin_employees', []);
        const currentUser = auth.getCurrentUser();
        
        // Exclude current user and filter online
        const others = allEmployees.filter(e => String(e.id) !== String(currentUser?.id) && String(e.email) !== String(currentUser?.email));
        const onlineCount = others.filter(e => e.isOnline === true || String(e.isOnline).toLowerCase() === 'true').length;
        const offlineCount = others.length - onlineCount;

        // Update counts
        const countEl = document.getElementById('dashboard-team-count');
        const onlineEl = document.getElementById('dashboard-online-count');
        const offlineEl = document.getElementById('dashboard-offline-count');

        if (countEl) countEl.textContent = `${others.length} orang`;
        if (onlineEl) onlineEl.textContent = onlineCount;
        if (offlineEl) offlineEl.textContent = offlineCount;

        if (others.length === 0) {
            container.innerHTML = '<div class="notification-empty">Kehadiran tim belum tersedia</div>';
            return;
        }

        // Render up to 6 avatars
        container.innerHTML = others.slice(0, 6).map(emp => `
            <div class="team-avatar-wrapper" title="${emp.name} (${emp.isOnline ? 'Online' : 'Offline'})">
                <img src="${getAvatarUrl(emp)}" alt="${emp.name}" class="team-member-avatar ${emp.isOnline ? 'online' : ''}">
                <span class="status-indicator ${emp.isOnline ? 'online' : ''}"></span>
            </div>
        `).join('') + (others.length > 6 ? `<div class="avatar-more">+${others.length - 6}</div>` : '');
    },

    updateWeeklyAttendanceChart() {
        const attendance = this.attendanceData;
        const days = ['min', 'sen', 'sel', 'rab', 'kam', 'jum', 'sab'];
        const today = new Date();
        
        // Loop through last 7 days
        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const iso = date.toISOString().split('T')[0];
            const dayName = days[date.getDay()];
            
            const record = attendance.find(a => a.date === iso);
            const bar = document.getElementById(`bar-${dayName}`);
            
            if (bar) {
                if (record && record.clockIn) {
                    const status = dateTime.calculateAttendanceStatus(record);
                    let height = 80;
                    if (status.class === 'danger') height = 30;
                    if (status.class === 'warning') height = 50;
                    
                    bar.style.height = `${height}%`;
                    bar.classList.add('active');
                } else {
                    bar.style.height = '10%';
                    bar.classList.remove('active');
                }
                
                // Today indicator
                if (i === 0) {
                    bar.parentElement.style.borderBottom = '2px solid var(--color-primary)';
                }
            }
        }
    }
};

// Global init function called by router
window.initDashboard = async () => {
    await dashboard.init();
};

// Auto-update progress every minute
setInterval(() => {
    if (document.getElementById('page-dashboard')?.classList.contains('active')) {
        dashboard.updateProgressBar();
    }
}, 60000);
