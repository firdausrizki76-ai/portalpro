/**
 * SIAP-P3KPW - Admin Dashboard
 * Admin dashboard with employee statistics
 */

const adminDashboard = {
    employees: [],
    attendance: [],
    leaves: [],
    izin: [],

    initialized: false,

    async init() {
        if (typeof loader !== 'undefined') loader.show('Memuat dashboard...');

        try {
            if (!auth.isAdmin()) {
                toast.error('Anda tidak memiliki akses!');
                router.navigate('dashboard');
                return;
            }

            await this.loadData();
            // syncNotifications was removed in favor of backend notifications
            this.updateStats();
            this.renderRecentActivity();
            this.renderOnlineUsers();
            this.initCharts();
            
            // Listeners for filters
            const attFilter = document.getElementById('admin-attendance-filter');
            if (attFilter) attFilter.addEventListener('change', () => this.renderAttendanceChart());
            
            const deptFilter = document.getElementById('admin-dept-filter');
            if (deptFilter) deptFilter.addEventListener('change', () => this.renderDeptChart());
            
            this.initialized = true;
        } catch (error) {
            console.error('Admin Dashboard init error:', error);
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    async loadData(forceRefresh = false) {
        const cacheKey = 'admin_dashboard_cache';
        
        if (!forceRefresh) {
            const cached = storage.get(cacheKey);
            if (cached) {
                this.employees = cached.employees || [];
                this.attendance = cached.attendance || [];
                this.leaves = cached.leaves || [];
                this.izin = cached.izin || [];
                // Background refresh
                this._backgroundRefresh(cacheKey);
                return;
            }
        }

        try {
            const [empResult, attResult, leaveResult, izinResult] = await Promise.all([
                api.getEmployees(),
                api.getAllAttendance(),
                api.getAllLeaves(),
                api.getAllIzin()
            ]);
            this.employees = empResult.data || [];
            this.attendance = attResult.data || [];
            this.leaves = leaveResult.data || [];
            this.izin = izinResult.data || [];
            
            storage.set(cacheKey, {
                employees: this.employees,
                attendance: this.attendance,
                leaves: this.leaves,
                izin: this.izin
            });
        } catch (error) {
            console.error('Error loading admin data:', error);
            this.employees = storage.get('admin_employees', []);
            this.attendance = storage.get('attendance', []);
            this.leaves = storage.get('leaves', []);
            this.izin = storage.get('izin', []);
        }
    },

    async _backgroundRefresh(cacheKey) {
        try {
            const [empResult, attResult, leaveResult, izinResult] = await Promise.all([
                api.getEmployees(),
                api.getAllAttendance(),
                api.getAllLeaves(),
                api.getAllIzin()
            ]);
            this.employees = empResult.data || [];
            this.attendance = attResult.data || [];
            this.leaves = leaveResult.data || [];
            this.izin = izinResult.data || [];
            
            storage.set(cacheKey, {
                employees: this.employees,
                attendance: this.attendance,
                leaves: this.leaves,
                izin: this.izin
            });
            
            // Update UI silently
            this.syncNotifications();
            this.updateStats();
            this.renderRecentActivity();
            this.renderOnlineUsers();
            this.initCharts();
        } catch (e) {
            console.warn('Dashboard background refresh failed', e);
        }
    },

    getEmployeeName(record) {
        if (record.name && record.name.trim() !== '') return record.name;
        if (record.employeeName && record.employeeName.trim() !== '') return record.employeeName;
        
        if (record.userId || record.email) {
            const uid = String(record.userId || record.email);
            const emp = this.employees.find(e => String(e.id) === uid || String(e.email) === uid);
            if (emp) return emp.name;
            return uid.split('@')[0];
        }
        return 'Pegawai';
    },

    syncNotifications() {
        // Collect events from attendance and leaves to show in notifications & recent activity
        let events = [];
        
        // Loop attendance
        this.attendance.forEach(att => {
            if (!att.date) return;
            const name = this.getEmployeeName(att);
            
            // Robust timestamp: Try both YYYY-MM-DD and Locale formatted strings
            const parseDateTime = (d, t) => {
                if (!t) return new Date(d).getTime();
                // Replace dot with colon for 14.31 -> 14:31
                const cleanTime = t.replace('.', ':');
                const combined = new Date(`${d} ${cleanTime}`);
                return isNaN(combined.getTime()) ? new Date(d).getTime() : combined.getTime();
            };

            if (att.clockIn) {
                const ts = parseDateTime(att.date, att.clockIn);
                events.push({
                    id: `in_${att.date}_${name}`,
                    user: name,
                    action: 'Clock In',
                    timestamp: ts,
                    time: dateTime.formatDate(att.date, 'short') + ' ' + att.clockIn,
                    avatar: getAvatarUrl({name})
                });
            }
            if (att.clockOut) {
                const ts = parseDateTime(att.date, att.clockOut);
                events.push({
                    id: `out_${att.date}_${name}`,
                    user: name,
                    action: 'Clock Out',
                    timestamp: ts,
                    time: dateTime.formatDate(att.date, 'short') + ' ' + att.clockOut,
                    avatar: getAvatarUrl({name})
                });
            }
        });

        // Loop leaves
        this.leaves.forEach(l => {
             const name = this.getEmployeeName(l);
             const leaveDate = l.startDate || l.date;
             if (!leaveDate) return; // Skip if no date
             
             // For leaves, if there's no specific apply time, we use the start of the day
             const ts = l.appliedAt ? new Date(l.appliedAt).getTime() : new Date(leaveDate).getTime();
             
             events.push({
                  id: `leave_${l.id || Math.random()}`,
                  user: name,
                  action: `Mengajukan Cuti`,
                  timestamp: isNaN(ts) ? Date.now() : ts,
                  time: dateTime.formatDate(leaveDate, 'short'),
                  avatar: getAvatarUrl({name})
             });
        });
        
        // Sort descending (newest first)
        events.sort((a, b) => b.timestamp - a.timestamp);
        
        // Pass to global notifications
        if (window.notifications && typeof window.notifications.setList === 'function') {
            window.notifications.setList(events);
        }
    },

    updateStats() {
        const totalEmployees = this.employees.length;
        const todayStr = dateTime.getLocalDate(); // yyyy-MM-dd

        // Filter attendance to ONLY today's records
        const todayAttendance = this.attendance.filter(a => a.date === todayStr);

        // Compute from real Today records
        let presentToday = 0;
        let lateToday = 0;

        todayAttendance.forEach(att => {
            if (att.clockIn) {
                presentToday++;
                // Check if late
                if (att.status && (att.status.toLowerCase() === 'terlambat' || att.status.toLowerCase() === 'late')) {
                    lateToday++;
                }
            }
        });

        // Compute those on leave (cuti / izin) for today
        const onLeave = this.leaves.filter(l => l.status === 'approved' && l.startDate <= todayStr && l.endDate >= todayStr).length +
            this.izin.filter(i => i.status === 'approved' && i.date === todayStr).length;

        // Everyone not present and not on leave is absent (No Clock In)
        const absentToday = Math.max(0, totalEmployees - presentToday - onLeave);
        const noClockIn = absentToday;

        let noClockOut = 0;
        todayAttendance.forEach(att => {
            if (att.clockIn && !att.clockOut) {
                noClockOut++;
            }
        });

        // Count pending requests
        const pendingLeaves = this.leaves.filter(l => l.status === 'pending').length;
        const pendingIzin = this.izin.filter(i => i.status === 'pending').length;
        const totalPending = pendingLeaves + pendingIzin;

        // Update DOM
        const els = {
            'total-employees': totalEmployees,
            'present-today': presentToday,
            'absent-today': absentToday,
            'late-today': lateToday,
            'on-leave': onLeave,
            'pending-requests': totalPending,
            'no-clock-in': noClockIn,
            'no-clock-out': noClockOut
        };

        Object.entries(els).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) {
                // Animate number
                this.animateNumber(el, parseInt(el.textContent) || 0, value);
            }
        });
    },

    animateNumber(element, start, end) {
        if (start === end) {
            element.textContent = end;
            return;
        }
        
        const duration = 1000;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing function
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const current = Math.floor(start + (end - start) * easeOutQuart);

            element.textContent = current;

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    },

    renderRecentActivity() {
        const container = document.getElementById('admin-recent-activity');
        if (!container) return;

        // Fetch from the global notifications list which is now backend-driven
        const list = window.notifications ? window.notifications.list.slice(0, 5) : []; 

        if (list.length === 0) {
            container.innerHTML = '<div class="notification-empty">Tidak ada aktivitas baru</div>';
            return;
        }

        container.innerHTML = list.map(notif => {
            const timeStr = typeof notif.time === 'string' && notif.time.includes('T') 
                ? dateTime.formatTime(notif.time) 
                : (notif.time || 'Baru saja');
                
            return `
                <div class="activity-item">
                    <div class="activity-avatar">
                        <img src="${notif.avatar || getAvatarUrl({name: notif.user})}" alt="${notif.user}">
                    </div>
                    <div class="activity-content">
                        <p class="activity-text"><strong>${notif.user}</strong> ${notif.action}</p>
                        <span class="activity-time">${timeStr}</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderOnlineUsers() {
        const container = document.getElementById('admin-online-users');
        if (!container) return;

        // Ensure we fetch those who literally have an active session
        let onlineUsers = this.employees.filter(e => e.isOnline === true || String(e.isOnline).toLowerCase() === 'true');

        const countEl = document.getElementById('online-count');
        if (countEl) countEl.textContent = onlineUsers.length;
        
        if (onlineUsers.length === 0) {
             container.innerHTML = '<div class="notification-empty" style="text-align:center; color: var(--text-muted); padding: 20px;">Tidak ada pegawai yang sedang tersambung/online</div>';
             return;
        }

        container.innerHTML = onlineUsers.slice(0, 5).map(user => `
            <div class="online-user-item" style="display:flex; align-items:center; gap: 10px; margin-bottom: 12px;">
                <div class="user-status-dot online" style="width: 8px; height: 8px; border-radius: 50%; background: var(--color-success);"></div>
                <div class="activity-avatar" style="width: 35px; height: 35px;">
                    <img src="${getAvatarUrl(user)}" alt="${user.name}" style="border-radius: 50%; width: 100%; height: 100%;">
                </div>
                <div class="activity-content">
                    <p class="activity-text" style="margin: 0; font-size: 0.85rem;"><strong>${user.name}</strong></p>
                    <span class="activity-time" style="font-size: 0.75rem; color: var(--text-muted);">Sedang Aktif</span>
                </div>
            </div>
        `).join('');
    },

    // Charts initialization using Chart.js
    initCharts() {
        if (typeof Chart === 'undefined') {
            console.warn('Wait for Chart.js...');
            setTimeout(() => this.initCharts(), 500);
            return;
        }

        this.renderAttendanceChart();
        this.renderDeptChart();
    },

    renderAttendanceChart() {
        const ctx = document.getElementById('attendanceCanvas');
        if (!ctx) return;
        
        // Destroy existing chart if any
        if (this._attendanceChart) this._attendanceChart.destroy();
        
        const filterVal = document.getElementById('admin-attendance-filter')?.value || 'bulan';
        let daysToCover = 30;
        if (filterVal === 'hari') daysToCover = 1;
        if (filterVal === 'minggu') daysToCover = 7;

        // Group attendance by date for the period
        const datesIso = [];
        const labels = [];
        for (let i = daysToCover - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const iso = d.toISOString().split('T')[0];
            datesIso.push(iso);
            labels.push(dateTime.formatDate(iso, 'short'));
        }

        const presentData = new Array(daysToCover).fill(0);
        const lateData = new Array(daysToCover).fill(0);
        const noClockInData = new Array(daysToCover).fill(0);
        const noClockOutData = new Array(daysToCover).fill(0);

        const totalEmployees = this.employees.length;

        datesIso.forEach((isoDate, idx) => {
            const dayAttendance = this.attendance.filter(a => a.date === isoDate);
            let dayLate = 0;
            let dayPresent = 0;
            let dayNoClockOut = 0;

            dayAttendance.forEach(att => {
                if (att.clockIn) {
                    if (att.status && (att.status.toLowerCase() === 'terlambat' || att.status.toLowerCase() === 'late')) {
                        dayLate++;
                    } else {
                        dayPresent++;
                    }
                    
                    if (!att.clockOut) {
                        dayNoClockOut++;
                    }
                }
            });

            presentData[idx] = dayPresent;
            lateData[idx] = dayLate;
            noClockOutData[idx] = dayNoClockOut;

            // Calculate No Clock In (Absent)
            // Need to account for those on leave on this physical date
            const dayLeaves = this.leaves.filter(l => l.status === 'approved' && l.startDate <= isoDate && l.endDate >= isoDate).length;
            const dayIzin = this.izin.filter(i => i.status === 'approved' && i.date === isoDate).length;
            const totalOnLeave = dayLeaves + dayIzin;
            const totalPresent = dayLate + dayPresent;
            
            noClockInData[idx] = Math.max(0, totalEmployees - totalPresent - totalOnLeave);
        });

        this._attendanceChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Tepat Waktu',
                        data: presentData, 
                        backgroundColor: '#10B981',
                        stack: 'attendance'
                    },
                    {
                        label: 'Terlambat',
                        data: lateData,
                        backgroundColor: '#EF4444',
                        stack: 'attendance'
                    },
                    {
                        label: 'Tidak Absen Masuk',
                        data: noClockInData,
                        backgroundColor: '#F59E0B',
                        stack: 'attendance'
                    },
                    {
                        label: 'Tidak Absen Pulang',
                        data: noClockOutData,
                        backgroundColor: '#8B5CF6',
                        stack: 'secondary'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { stacked: true },
                    y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } }
                },
                plugins: {
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                }
            }
        });
    },

    renderDeptChart() {
        const ctx = document.getElementById('deptCanvas');
        if (!ctx) return;
        
        // Destroy existing chart if any
        if (this._deptChart) this._deptChart.destroy();

        const filterVal = document.getElementById('admin-dept-filter')?.value || 'bulan';
        let daysToCover = 30;
        if (filterVal === 'hari') daysToCover = 1;
        if (filterVal === 'minggu') daysToCover = 7;
        
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - daysToCover);
        const limitIso = limitDate.toISOString().split('T')[0];

        // Count employees per department based on presence in span
        const depts = {};
        const presentNames = this.attendance
             .filter(a => a.clockIn && a.date >= limitIso)
             .map(a => this.getEmployeeName(a));
             
        this.employees.forEach(e => {
             // Only count if present in the timeframe
             if (presentNames.includes(e.name)) {
                 const dept = e.department || 'Lainnya';
                 depts[dept] = (depts[dept] || 0) + 1;
             }
        });
        
        const hasData = Object.keys(depts).length > 0;

        this._deptChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: hasData ? Object.keys(depts) : ['Belum Ada Data'],
                datasets: [{
                    data: hasData ? Object.values(depts) : [1],
                    backgroundColor: hasData ? ['#003399', '#3B82F6', '#10B981', '#F59E0B', '#6366F1', '#EC4899'] : ['#E2E8F0']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }
};

// Global init function
window.initAdminDashboard = () => {
    adminDashboard.init();
};

// Expose
window.adminDashboard = adminDashboard;
