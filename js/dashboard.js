/**
 * SIAP-P3KPW - Dashboard
 * Dashboard functionality and charts
 */

const dashboard = {
    initialized: false,
    attendanceData: [],

    async init() {
        if (this.initialized) {
            this.loadData().then(() => {
                this.updateWelcomeCard();
                this.updateStats();
                this.updateSessionInfo();
                this.updateWeeklyChart();
                this.renderActivityTimeline();
                this.updateTeamPresence();
            });
            return;
        }

        try {
            const currentUser = auth.getCurrentUser();
            if (currentUser && currentUser.id) {
                // Update online status
                api.updateOnlineStatus(currentUser.id, true);
            }

            await this.loadData();
            this.updateWelcomeCard();
            this.updateStats();
            this.updateSessionInfo();
            this.updateProgressBar();
            this.updateWeeklyChart();
            this.renderActivityTimeline();
            this.updateTeamPresence();
            this.initialized = true;
        } catch (error) {
            console.error('Dashboard init error:', error);
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    async loadData() {
        try {
            await auth.refreshProfile();
            const currentUser = auth.getCurrentUser();
            if (currentUser && currentUser.id) {
                const [attResult, settingsRes, shiftRes, journalRes, leaveRes, izinRes, empRes] = await Promise.all([
                    api.getAttendance(currentUser.id).catch(e => ({ success: false })),
                    api.getSettings().catch(e => ({ success: false })),
                    api.getShifts().catch(e => ({ success: false })),
                    api.getJournals(currentUser.id).catch(e => ({ success: false })),
                    api.getLeaves(currentUser.id).catch(e => ({ success: false })),
                    api.getIzin(currentUser.id).catch(e => ({ success: false })),
                    api.getEmployees().catch(e => ({ success: false }))
                ]);

                this.attendanceData = (attResult && attResult.success) ? attResult.data : [];
                this.journalData = (journalRes && journalRes.success) ? journalRes.data : [];
                this.leaveData = (leaveRes && leaveRes.success) ? leaveRes.data : [];
                this.izinData = (izinRes && izinRes.success) ? izinRes.data : [];
                this.employeeData = (empRes && empRes.success) ? empRes.data : [];

                if (shiftRes && shiftRes.success) storage.set('shifts', shiftRes.data);
                
                // Sync settings and schedules
                if (settingsRes && settingsRes.success && settingsRes.data) {
                    const globalSettings = settingsRes.data;
                    const loadedSchedules = {};
                    Object.keys(globalSettings).forEach(k => {
                        if (k.startsWith('shift_schedule_')) {
                            const monthKey = k.replace('shift_schedule_', '');
                            try { loadedSchedules[monthKey] = JSON.parse(globalSettings[k]); } catch (e) { }
                        }
                    });
                    if (Object.keys(loadedSchedules).length > 0) storage.set('shift_schedule', loadedSchedules);
                }
            }
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    },

    updateWeeklyChart() {
        const attendance = this.attendanceData;
        const days = ['min', 'sen', 'sel', 'rab', 'kam', 'jum', 'sab'];
        const dayIds = ['min', 'sen', 'sel', 'rab', 'kam', 'jum', 'sab'];
        
        // Get start of current week (Monday)
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 is Sun, 1 is Mon
        const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const monday = new Date(now.setDate(diff));
        
        for (let i = 0; i < 7; i++) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            const dateStr = dateTime.formatLocalDate(date);
            const record = attendance.find(a => a.date === dateStr);
            
            const dayId = dayIds[date.getDay()];
            const bar = document.getElementById(`bar-${dayId}`);
            if (bar) {
                let height = '0%';
                let statusClass = '';
                
                if (record) {
                    if (record.status === 'ontime') height = '100%';
                    else if (record.status === 'Terlambat' || record.status === 'late') height = '80%';
                    else if (record.clockIn) height = '100%'; // Assume present but status unknown
                } else if (date < new Date() && date.getDay() !== 0 && date.getDay() !== 6) {
                    // Past weekday with no record = absent
                    height = '0%';
                }
                
                bar.style.height = height;
                // Add tooltip or label if needed
            }
        }
    },

    renderActivityTimeline() {
        const container = document.getElementById('dashboard-activity-list');
        if (!container) return;

        const activities = [];

        // 1. Add Attendance activities
        this.attendanceData.forEach(row => {
            if (row.clockIn) {
                activities.push({
                    type: 'clock-in',
                    title: 'Clock In',
                    time: row.clockIn,
                    date: row.date,
                    timestamp: new Date(`${row.date}T${row.clockIn.replace('.', ':')}`).getTime()
                });
            }
            if (row.clockOut) {
                activities.push({
                    type: 'clock-out',
                    title: 'Clock Out',
                    time: row.clockOut,
                    date: row.date,
                    timestamp: new Date(`${row.date}T${row.clockOut.replace('.', ':')}`).getTime()
                });
            }
        });

        // 2. Add Journal activities
        (this.journalData || []).forEach(row => {
            activities.push({
                type: 'journal',
                title: 'Mengisi Laporan Kinerja',
                time: row.time || '17:00',
                date: row.date,
                timestamp: new Date(`${row.date}T${(row.time || '17:00').replace('.', ':')}`).getTime()
            });
        });

        // 3. Add Leave/Izin activities
        (this.leaveData || []).forEach(row => {
            activities.push({
                type: 'leave',
                title: `Cuti: ${row.type}`,
                time: '08:00',
                date: row.appliedAt ? row.appliedAt.split('T')[0] : row.startDate,
                timestamp: new Date(row.appliedAt || row.startDate).getTime()
            });
        });

        // Sort by timestamp desc
        activities.sort((a, b) => b.timestamp - a.timestamp);

        // Take top 3
        const recent = activities.slice(0, 3);

        if (recent.length === 0) {
            container.innerHTML = '<div class="notification-empty">Belum ada aktivitas.</div>';
            return;
        }

        container.innerHTML = recent.map(act => {
            let iconClass = 'fa-sign-in-alt';
            let colorClass = 'clock-in';
            
            if (act.type === 'clock-out') { iconClass = 'fa-sign-out-alt'; colorClass = 'clock-out'; }
            if (act.type === 'journal') { iconClass = 'fa-book'; colorClass = 'journal'; }
            if (act.type === 'leave') { iconClass = 'fa-calendar-alt'; colorClass = 'leave'; }

            const displayDate = act.date === dateTime.getLocalDate() ? 'Hari ini' : 
                               act.date === dateTime.getLocalDate(-1) ? 'Kemarin' : 
                               act.date;

            return `
                <div class="activity-item">
                    <div class="activity-icon ${colorClass}"><i class="fas ${iconClass}"></i></div>
                    <div class="activity-content">
                        <p class="activity-title">${act.title}</p>
                        <p class="activity-time">${displayDate}, ${act.time}</p>
                    </div>
                </div>
            `;
        }).join('');
    },

    updateTeamPresence() {
        const countEl = document.getElementById('dashboard-team-count');
        const onlineEl = document.getElementById('dashboard-online-count');
        const offlineEl = document.getElementById('dashboard-offline-count');
        const avatarContainer = document.getElementById('dashboard-team-avatars');

        const employees = this.employeeData || [];
        if (countEl) countEl.textContent = `${employees.length} orang`;

        const online = employees.filter(e => e.isOnline === true || e.isOnline === 'true');
        const offlineCount = Math.max(0, employees.length - online.length);

        if (onlineEl) onlineEl.textContent = online.length;
        if (offlineEl) offlineEl.textContent = offlineCount;

        if (avatarContainer) {
            let avatarHtml = '<div class="avatar-stack">';
            const displayEmployees = employees.slice(0, 5);
            displayEmployees.forEach(emp => {
                const avatarUrl = emp.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name)}&background=random&color=fff`;
                avatarHtml += `<img src="${avatarUrl}" alt="${emp.name}" title="${emp.name} (${emp.isOnline ? 'Online' : 'Offline'})">`;
            });

            if (employees.length > 5) {
                avatarHtml += `<div class="avatar-more">+${employees.length - 5}</div>`;
            }
            avatarHtml += '</div>';
            avatarContainer.innerHTML = avatarHtml;
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
            const userId = String(auth.getCurrentUser()?.id);
            const schedules = storage.get('shift_schedule', {});
            const todayObj = new Date();
            const currentYear = todayObj.getFullYear();
            const currentMonth = todayObj.getMonth();
            const currentDay = todayObj.getDate();
            const key = `${currentYear}-${currentMonth}`;

            console.log('Dashboard Shift Sync - Key:', key, 'UserId:', userId, 'Day:', currentDay);

            if (schedules[key] && schedules[key][userId]) {
                const assignedShift = schedules[key][userId][currentDay];
                if (assignedShift && assignedShift !== '') {
                    currentShiftName = assignedShift;
                }
            }
        } catch (e) { }

        // MAPPING: Get real times from the shifts sheet data we just fetched
        const activeShift = shifts.find(s => String(s.name) === String(currentShiftName)) 
                         || (shifts.length > 0 ? shifts[0] : { name: currentShiftName, startTime: '08:00', endTime: '17:00' });

        if (shiftEl) {
            if (currentShiftName === 'Libur') {
                shiftEl.textContent = `Shift: Libur (Tidak ada jadwal)`;
            } else {
                shiftEl.textContent = `Shift: ${activeShift?.name || currentShiftName} (${activeShift?.startTime || '08:00'} - ${activeShift?.endTime || '17:00'})`;
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
