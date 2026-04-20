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
                const [attResult, settingsRes, teamRes, profileRes, shiftsRes] = await Promise.allSettled([
                    api.getAttendance(currentUser.id),
                    api.getSettings(),
                    api.getEmployees(), // For team presence
                    auth.refreshProfile(), // Ensure session is fresh
                    api.getShifts() // Fetch master shifts for time info
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

                // 4. Process Master Shifts
                if (shiftsRes.status === 'fulfilled' && shiftsRes.value.success) {
                    storage.set('shifts', shiftsRes.value.data || []);
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
        const attendance = this.attendanceData || [];
        
        // Get current date info
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth(); 
        const monthStr = (month + 1).toString().padStart(2, '0');
        const yearMonthPrefix = `${year}-${monthStr}`;

        // Filter attendance for current month only
        const thisMonthAttendance = attendance.filter(a => a.date && a.date.startsWith(yearMonthPrefix));

        // Use fixed 20 working days as denominator per user request
        const totalDaysInMonth = 20;

        // Calculate stats
        // PRESENT: Any record that has a clock-in time and is for this month
        const presentRecords = thisMonthAttendance.filter(a => a.clockIn && a.clockIn !== '--:--');
        const presentCount = presentRecords.length;
        
        // Split statuses for the detailed legend
        const ontimeCount = presentRecords.filter(a => !String(a.status || '').toLowerCase().includes('terlambat')).length;
        const lateCount = presentRecords.filter(a => String(a.status || '').toLowerCase().includes('terlambat')).length;
        
        // ABSENT: Remaining days in the month (approximate based on days passed minus present)
        // But for statistics display, let's keep it simple
        const absentCount = 0; // Will be calculated dynamically if needed

        // Update donut chart based on (Total Attendance / Days in Month)
        const progressPercent = totalDaysInMonth > 0 ? (presentCount / totalDaysInMonth) : 0;
        const totalCircumference = 251; // Length of the circle border

        // Update center text display (e.g., 1/30)
        const donutValue = document.querySelector('.donut-value');
        if (donutValue) {
            donutValue.textContent = `${presentCount}/${totalDaysInMonth}`;
        }
        
        // Update SVG paths dynamically
        const presentPath = document.querySelector('.donut-fill.present'); // Hijau (Ontime)
        const latePath = document.querySelector('.donut-fill.late');       // Biru (Late)
        const absentPath = document.querySelector('.donut-fill.absent');

        if (presentPath && latePath) {
            // 1. Calculate Dash for Ontime (Green)
            const ontimePercent = totalDaysInMonth > 0 ? (ontimeCount / totalDaysInMonth) : 0;
            const ontimeDash = ontimePercent * totalCircumference;
            presentPath.style.strokeDasharray = `${ontimeDash} ${totalCircumference}`;
            presentPath.style.display = ontimeCount > 0 ? 'block' : 'none';

            // 2. Calculate Dash for Late (Blue)
            const latePercent = totalDaysInMonth > 0 ? (lateCount / totalDaysInMonth) : 0;
            const lateDash = latePercent * totalCircumference;
            latePath.style.strokeDasharray = `${lateDash} ${totalCircumference}`;
            
            // Start the blue line exactly where the green line ends
            latePath.style.strokeDashoffset = -ontimeDash;
            latePath.style.display = lateCount > 0 ? 'block' : 'none';
            
            // Hide absent segment as we move to a 1/20 progressive scale
            if (absentPath) absentPath.style.display = 'none';
        }

        // Update legend
        const legendValues = document.querySelectorAll('.legend-value');
        if (legendValues.length >= 3) {
            legendValues[0].textContent = `${ontimeCount} hari`;
            legendValues[1].textContent = `${lateCount} hari`;
            legendValues[2].textContent = `-`; // Absent count logic can be added later
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

        if (clockInEl) clockInEl.textContent = '--:--';
        if (clockOutEl) clockOutEl.textContent = '--:--';
        if (durationEl) durationEl.textContent = '0j 0m';

        if (todayAttendance) {
            if (clockInEl) clockInEl.textContent = todayAttendance.clockIn || '--:--';
            if (clockOutEl) clockOutEl.textContent = todayAttendance.clockOut || '--:--';

            if (todayAttendance.clockIn && todayAttendance.clockOut && durationEl) {
                const duration = dateTime.calculateDuration(
                    todayAttendance.clockIn,
                    todayAttendance.clockOut
                );
                console.log('Dashboard Duration Debug:', {
                    in: todayAttendance.clockIn,
                    out: todayAttendance.clockOut,
                    result: duration
                });
                durationEl.textContent = duration;
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
        const days = ['sen', 'sel', 'rab', 'kam', 'jum'];
        const today = new Date();
        
        // Loop through last 5 working days
        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const iso = date.toISOString().split('T')[0];
            const dayIndex = date.getDay();
            
            // Skip weekend in processing
            if (dayIndex === 0 || dayIndex === 6) continue;
            
            const dayName = ['min', 'sen', 'sel', 'rab', 'kam', 'jum', 'sab'][dayIndex];
            
            const record = attendance.find(a => a.date === iso);
            const bar = document.getElementById(`bar-${dayName}`);
            
            if (bar) {
                if (record && record.clockIn) {
                    // Make sure the bar is visible even with low or no data
                    let height = 0;
                    if (record) {
                        // If present but 0 min (too fast), show minimal bar
                        height = Math.max(15, (record.totalMinutes / 1440) * 100);
                    } else {
                        height = 10; // Base visible height for empty days
                    }

                    bar.style.height = `${height}%`;
                    bar.classList.add('active');
                } else {
                    bar.style.height = '10%';
                    bar.classList.remove('active');
                }
                
                // Today indicator - more robust check
                const isToday = iso === new Date().toISOString().split('T')[0];
                if (isToday) {
                    bar.parentElement.style.borderBottom = '3px solid var(--color-primary)';
                } else {
                    bar.parentElement.style.borderBottom = 'none';
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
