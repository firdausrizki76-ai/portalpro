/**
 * SIAP-P3KPW - Admin Reports Controller
 * Optimized for performance with data caching and parallel fetching.
 * Clean version - NO DUPLICATES.
 */

const adminReports = {
    filters: {
        attendance: { month: new Date().toISOString().substring(0, 7), dept: '', status: '', location: '' },
        jurnal: { month: new Date().toISOString().substring(0, 7), employee: '', status: '' },
        leave: { month: new Date().toISOString().substring(0, 7), type: '', status: '' }
    },

    rawEmployees: [],
    attendanceData: [],
    jurnalData: [],
    leaveData: [],
    
    // Caching state
    loadedMonths: { attendance: null, jurnal: null, leave: null, izin: null, employees: false },

    /**
     * Helper: Safely bind event to element
     */
    _bind(id, event, fn) {
        const el = document.getElementById(id);
        if (el) {
            // Remove existing to prevent multiple registrations (spam)
            const new_el = el.cloneNode(true);
            el.parentNode.replaceChild(new_el, el);
            new_el.addEventListener(event, fn);
        }
    },

    /**
     * Initialization for each report tab
     */
    async initAttendanceReports() {
        try {
            // Priority 1: Initialize local elements immediately
            const monthInput = document.getElementById('attendance-month');
            if (monthInput) monthInput.value = this.filters.attendance.month;

            this.updateDynamicDeptFilter();
            this.bindAttendanceEvents();
            
            // Initial render with cache if exists
            this.renderAttendanceReports();

            // Priority 2: Background load fresh data
            await this.loadData(this.filters.attendance.month);
            
            // Final render with fresh data
            this.updateDynamicDeptFilter();
            this.renderAttendanceReports();
        } catch (error) {
            console.error('Init attendance error:', error);
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    async initJurnalReports() {
        try {
            // Priority 1: Initialize local elements immediately
            const monthInput = document.getElementById('jurnal-month');
            if (monthInput) monthInput.value = this.filters.jurnal.month;

            this.populateEmployeeFilter();
            this.bindJurnalEvents();
            
            // Initial render with cache
            this.renderJurnalReports();

            // Priority 2: Background load fresh data
            await this.loadData(this.filters.jurnal.month);
            
            // Final render with fresh data
            this.populateEmployeeFilter();
            this.renderJurnalReports();
        } catch (error) {
            console.error('Init jurnal error:', error);
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    async initLeaveReports() {
        try {
            // Priority 1: Initialize local elements immediately
            const monthInput = document.getElementById('leave-month');
            if (monthInput) monthInput.value = this.filters.leave.month;

            this.bindLeaveEvents();
            
            // Initial render with cache
            this.renderLeaveReports();

            // Priority 2: Background load fresh data
            await this.loadData(this.filters.leave.month);
            
            // Final render with fresh data
            this.renderLeaveReports();
        } catch (error) {
            console.error('Init leave error:', error);
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    /**
     * Core Data Loading Logic with Caching and Parallel Fetching
     */
    async loadData(targetMonth = new Date().toISOString().substring(0, 7), forceRefresh = false) {
        const cacheKey = `reports_cache_${targetMonth}`;
        
        // 1. Try to load from localStorage first (SWR pattern)
        if (!forceRefresh) {
            const cached = storage.get(cacheKey);
            if (cached) {
                console.log('Loading reports from cache:', targetMonth);
                this.rawEmployees = cached.employees || [];
                this.attendanceData = cached.attendanceData || [];
                this.jurnalData = cached.jurnalData || [];
                this.leaveData = cached.leaveData || [];
                this.loadedMonths = { 
                    attendance: targetMonth, jurnal: targetMonth, 
                    leave: targetMonth, izin: targetMonth, employees: true 
                };
                
                // If we have cached data, we can return early to satisfy 'instant load'
                // However, we still fetch in background to refresh the cache
                this._backgroundFetch(targetMonth, cacheKey);
                return;
            }
        }

        // 2. Fetch all data
        if (typeof loader !== 'undefined') loader.show('Mengambil data terbaru dari database...');

        try {
            const empRes = await api.getEmployees();
            this.rawEmployees = empRes.data || [];
            
            let attendances = [], jurnals = [], leaves = [], izinList = [];
            const [attRes, jurRes, leaRes, iznRes] = await Promise.all([
                api.getAllAttendance(targetMonth),
                api.getAllJournals(targetMonth),
                api.getAllLeaves(targetMonth),
                api.getAllIzin(targetMonth)
            ]);

            attendances = attRes.data || [];
            jurnals = jurRes.data || [];
            leaves = leaRes.data || [];
            izinList = iznRes.data || [];

            this.processAllData(targetMonth, attendances, jurnals, leaves, izinList, cacheKey);

        } catch (e) {
            console.error('Error loading report data:', e);
            toast.error('Gagal memuat data laporan terbaru');
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    /**
     * Helper for background refresh without blocking UI
     */
    async _backgroundFetch(targetMonth, cacheKey) {
        try {
            const [empRes, attRes, jurRes, leaRes, iznRes] = await Promise.all([
                api.getEmployees(),
                api.getAllAttendance(targetMonth),
                api.getAllJournals(targetMonth),
                api.getAllLeaves(targetMonth),
                api.getAllIzin(targetMonth)
            ]);

            this.rawEmployees = empRes.data || [];
            this.processAllData(
                targetMonth, 
                attRes.data || [], jurRes.data || [], 
                leaRes.data || [], iznRes.data || [], 
                cacheKey
            );
            
            // Re-render the active tab silently
            const currentHash = window.location.hash;
            if (currentHash.includes('attendance')) this.renderAttendanceReports();
            if (currentHash.includes('jurnal')) this.renderJurnalReports();
            if (currentHash.includes('leave')) this.renderLeaveReports();
            
        } catch (e) {
            console.warn('Background refresh failed:', e);
        }
    },

    /**
     * Process raw API data into formatted report models
     */
    processAllData(targetMonth, attendances, jurnals, leaves, izinList, cacheKey) {
        this.loadedMonths = { 
            attendance: targetMonth, jurnal: targetMonth, 
            leave: targetMonth, izin: targetMonth, employees: true 
        };

        // 1. Process Attendance Summary
        this.attendanceData = this.rawEmployees.map(emp => {
            const empAtt = attendances.filter(a => String(a.userId) === String(emp.id));
            let present = 0, late = 0, noClockOut = 0, noClockIn = 0;
            
            // PRIORITY: Use assigned location from spreadsheet Column H (emp.lokasiKerja)
            let assignedLocation = emp.lokasiKerja || emp.lokasikerja || '-';
            let lastRecordedLocation = '';

            empAtt.forEach(a => {
                const cIn = a.clockIn;
                const cOut = a.clockOut;
                
                // Use a different key if status was accidentally moved to locationName
                let statusVal = (a.status || '').toLowerCase();
                let locVal = a.locationName || '';
                
                // HEURISTIC: If locationName looks like a status, Swap them
                if (locVal.toLowerCase() === 'terlambat' || locVal.toLowerCase() === 'ontime') {
                    statusVal = locVal.toLowerCase();
                    locVal = '';
                }

                if (locVal) lastRecordedLocation = locVal;

                if (cIn && cOut) {
                    present++;
                    if (statusVal.includes('telat') || statusVal.includes('terlambat')) late++;
                } else if (cIn && !cOut) {
                    noClockOut++;
                } else if (!cIn && cOut) {
                    noClockIn++;
                }
            });

            // Final location display logic: prefer assigned location, fallback to last recorded if assigned is '-'
            const displayLocation = (assignedLocation !== '-') ? assignedLocation : (lastRecordedLocation || '-');

            const empLeaves = leaves.filter(l => String(l.userId) === String(emp.id) && l.status === 'approved');
            const empIzin = izinList.filter(i => String(i.userId) === String(emp.id) && i.status === 'approved');

            let absentCount = 0;
            empLeaves.forEach(l => absentCount += parseInt(l.duration) || 1);
            empIzin.forEach(i => absentCount += parseInt(i.duration) || 1);

            return {
                id: emp.id, name: emp.name, department: emp.department || '-',
                avatar: emp.avatar, present, late, noClockOut, noClockIn, absent: absentCount,
                location: displayLocation,
                total: present + late + noClockOut + noClockIn + absentCount
            };
        });

        // 2. Process Jurnal Data
        this.jurnalData = (jurnals || []).map(j => {
            try {
                const emp = this.getEmployeeInfo(j.userId);
                let rawDate = (j.date || j.Date || j.tanggal || j.Tanggal || '').toString().trim();
                let rawTasks = (j.tasks || j.Aktivitas || j.aktivitas || '').toString().trim();
                let updatedAt = (j.updatedAt || '').toString().split('T')[0];

                // Inline date validation to avoid dependency issues
                var isDateValid = function(d) {
                    if (!d) return false;
                    var dateObj = new Date(d);
                    return !isNaN(dateObj.getTime());
                };

                if (!isDateValid(rawDate) || (rawDate.length > 10 && !rawDate.includes('-'))) {
                    // If the 'date' field contains text instead of a date, swap it
                    if (!rawTasks || rawTasks === '-') {
                        rawTasks = rawDate;
                    }
                    rawDate = updatedAt || (window.dateTime && typeof window.dateTime.getLocalDate === 'function' ? window.dateTime.getLocalDate() : new Date().toISOString().split('T')[0]);
                }

                return {
                    ...j, date: rawDate,
                    employeeName: emp.name, department: emp.department,
                    tasks: rawTasks || '-',
                    status: j.status || 'pending'
                };
            } catch (e) {
                console.warn('Error processing individual jurnal entry:', e, j);
                return null;
            }
        }).filter(item => item !== null);

        // 3. Process Leave/Izin Data
        this.leaveData = [
            ...leaves.map(l => {
                const emp = this.getEmployeeInfo(l.userId);
                const startDateStr = window.dateTime ? window.dateTime.formatDate(l.startDate, 'short') : l.startDate;
                const endDateStr = window.dateTime ? window.dateTime.formatDate(l.endDate, 'short') : l.endDate;
                return {
                    ...l, _source: 'leave', name: emp.name, department: emp.department,
                    type: l.type === 'annual' ? 'Cuti Tahunan' : (l.typeLabel || l.type || 'Cuti'),
                    dates: l.startDate === l.endDate ? startDateStr : `${startDateStr} - ${endDateStr}`,
                    duration: l.duration, status: (l.status || 'pending').toLowerCase(), reason: l.reason
                };
            }),
            ...izinList.map(i => {
                const emp = this.getEmployeeInfo(i.userId);
                // Fallback to i.date for old data, but prefer startDate and endDate
                const sDate = i.startDate || i.date;
                const eDate = i.endDate || i.date;
                const startDateStr = window.dateTime && sDate ? window.dateTime.formatDate(sDate, 'short') : sDate;
                const endDateStr = window.dateTime && eDate ? window.dateTime.formatDate(eDate, 'short') : eDate;
                const dateStr = sDate === eDate ? startDateStr : `${startDateStr} - ${endDateStr}`;
                return {
                    ...i, _source: 'izin', name: emp.name, department: emp.department,
                    type: i.type || 'Izin WFH/WFA', dates: dateStr, duration: i.duration, 
                    status: (i.status || 'pending').toLowerCase(), reason: i.reason
                };
            })
        ];

        // 4. Save to localStorage
        storage.set(cacheKey, {
            employees: this.rawEmployees,
            attendanceData: this.attendanceData,
            jurnalData: this.jurnalData,
            leaveData: this.leaveData,
            timestamp: Date.now()
        });
    },

    /**
     * Filter Utilities
     */
    getFilteredAttendance() {
        if (!this.attendanceData) return [];
        const { dept, status, location } = this.filters.attendance;
        return this.attendanceData.filter(row => {
            const matchesDept = !dept || row.department === dept;
            const matchesLocation = !location || row.location === location;
            const matchesStatus = !status || 
                (status === 'present' && row.present > 0) ||
                (status === 'absent' && row.absent > 0) ||
                (status === 'late' && row.late > 0);
            return matchesDept && matchesStatus && matchesLocation;
        });
    },

    getFilteredJurnal() {
        if (!this.jurnalData) return [];
        const { employee, status } = this.filters.jurnal;
        return this.jurnalData.filter(j => {
            const matchesEmp = !employee || j.employeeName === employee;
            const matchesStatus = !status || j.status === status;
            return matchesEmp && matchesStatus;
        });
    },

    getFilteredLeave() {
        if (!this.leaveData) return [];
        const { type, status } = this.filters.leave;
        return this.leaveData.filter(l => {
            const matchesType = !type || l.type.toLowerCase().includes(type.toLowerCase());
            const matchesStatus = !status || l.status === status;
            return matchesType && matchesStatus;
        });
    },

    /**
     * Render Functions
     */
    renderAttendanceReports() {
        const tbody = document.getElementById('attendance-reports-body');
        const mobileContainer = document.getElementById('attendance-mobile-cards');
        if (!tbody) return;

        const data = this.getFilteredAttendance();
        tbody.innerHTML = '';
        if (mobileContainer) mobileContainer.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">Tidak ada data ditemukan</td></tr>';
            if (mobileContainer) mobileContainer.innerHTML = '<div class="no-data">Tidak ada data ditemukan</div>';
            return;
        }

        data.forEach((row, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="user-info-cell" style="display:flex; align-items:center; gap:10px;">
                        <img src="${getAvatarUrl(row)}" style="width:32px; height:32px; border-radius:50%;">
                        <div>
                            <div style="font-weight:600; color:var(--text-dark)">${row.name}</div>
                            <div style="font-size:11px; color:var(--text-muted)">ID: ${row.id}</div>
                        </div>
                    </div>
                </td>
                <td style="font-weight:500">${row.department}</td>
                <td class="text-center" style="font-size:12px; font-weight:600; color:var(--primary-color)">${row.location}</td>
                <td class="text-center success" style="color:#10B981; font-weight:700">${row.present}</td>
                <td class="text-center warning" style="color:#F59E0B; font-weight:700">${row.late}</td>
                <td class="text-center danger" style="color:#EF4444; font-weight:700">${row.absent}</td>
                <td class="text-center"><strong>${row.total}</strong></td>
                <td><button class="btn-action view" onclick="adminReports.viewAttendanceDetail('${row.id}')"><i class="fas fa-eye"></i></button></td>
            `;
            tbody.appendChild(tr);

            if (mobileContainer) {
                const card = document.createElement('div');
                card.className = 'report-card';
                card.innerHTML = `
                    <div class="card-user" style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                        <img src="${getAvatarUrl(row)}" style="width:40px; height:40px; border-radius:50%;">
                        <div>
                            <div style="font-weight:600">${row.name}</div>
                            <div style="font-size:12px; color:var(--text-muted)">${row.department}</div>
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin-bottom:8px;">
                        <div style="text-align:center"><div style="font-size:10px; color:var(--text-muted)">Hadir</div><div style="color:#10B981; font-weight:700">${row.present}</div></div>
                        <div style="text-align:center"><div style="font-size:10px; color:var(--text-muted)">Telat</div><div style="color:#F59E0B; font-weight:700">${row.late}</div></div>
                        <div style="text-align:center"><div style="font-size:10px; color:var(--text-muted)">Cuti</div><div style="color:#EF4444; font-weight:700">${row.absent}</div></div>
                        <div style="text-align:center"><div style="font-size:10px; color:var(--text-muted)">Total</div><div style="font-weight:700">${row.total}</div></div>
                    </div>
                    <div style="font-size:11px; color:var(--text-muted); margin-bottom:12px; text-align:center;">
                        📍 Lokasi Terakhir: <b>${row.location}</b>
                    </div>
                    <button class="btn-full btn-sm" onclick="adminReports.viewAttendanceDetail('${row.id}')">Lihat Detail</button>
                `;
                mobileContainer.appendChild(card);
            }
        });
    },

    renderJurnalReports() {
        const tbody = document.getElementById('jurnal-reports-body');
        const mobileContainer = document.getElementById('jurnal-mobile-cards');
        if (!tbody) return;

        const data = this.getFilteredJurnal();
        tbody.innerHTML = '';
        if (mobileContainer) mobileContainer.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">Tidak ada jurnal ditemukan</td></tr>';
            if (mobileContainer) mobileContainer.innerHTML = '<div class="no-data">Tidak ada jurnal ditemukan</div>';
            return;
        }

        data.forEach(row => {
            const statusLabels = { 'pending': 'Menunggu', 'approved': 'Disetujui', 'rejected': 'Ditolak', 'filled': 'Sudah Diisi' };
            const lowerStatus = (row.status || '').toLowerCase();
            const approvalButtons = (lowerStatus === 'pending' || lowerStatus === 'filled') ? `
                <button type="button" class="btn-action" style="background:#10B981; border:none; color:#fff; cursor:pointer;" onclick="adminReports.approveJurnalItem('${row.id}')"><i class="fas fa-check"></i></button>
                <button type="button" class="btn-action" style="background:#EF4444; border:none; color:#fff; cursor:pointer;" onclick="adminReports.rejectJurnalItem('${row.id}')"><i class="fas fa-times"></i></button>
            ` : '';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.date || '-'}</td>
                <td>${row.employeeName}</td>
                <td>${row.department}</td>
                <td><div class="line-clamp-2">${row.tasks}</div></td>
                <td>${row.photo ? `<img src="${normalizeImageUrl(row.photo)}" style="width:40px; height:40px; border-radius:4px; object-fit:cover; cursor:pointer;" onclick="adminReports.viewPhoto('${row.photo}')">` : '-'}</td>
                <td><span class="status-badge ${row.status}">${statusLabels[row.status] || row.status.toUpperCase()}</span></td>
                <td>
                    <div style="display:flex; gap:4px;">
                        <button class="btn-action view" onclick="adminReports.viewJurnalDetail('${row.userId}', '${row.date}')"><i class="fas fa-eye"></i></button>
                        ${approvalButtons}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);

            if (mobileContainer) {
                const card = document.createElement('div');
                card.className = 'report-card';
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span style="font-size:12px; font-weight:600">${row.date}</span>
                        <span class="status-badge ${row.status}" style="font-size:10px;">${statusLabels[row.status] || row.status.toUpperCase()}</span>
                    </div>
                    <div style="font-weight:600; margin-bottom:4px;">${row.employeeName}</div>
                    <div style="font-size:13px; color:var(--text-muted); margin-bottom:12px;">${row.tasks}</div>
                    <div class="card-actions" style="display:grid; grid-template-columns: ${approvalButtons ? '1fr 1fr 1fr' : '1fr'}; gap:8px;">
                        <button class="btn-full btn-sm" onclick="adminReports.viewJurnalDetail('${row.userId}', '${row.date}')"><i class="fas fa-eye"></i> Detail</button>
                        ${approvalButtons ? `
                            <button type="button" class="btn-full btn-sm" style="background:#10B981; color:#fff;" onclick="adminReports.approveJurnalItem('${row.id}')"><i class="fas fa-check"></i> Approve</button>
                            <button type="button" class="btn-full btn-sm" style="background:#EF4444; color:#fff;" onclick="adminReports.rejectJurnalItem('${row.id}')"><i class="fas fa-times"></i> Reject</button>
                        ` : ''}
                    </div>
                `;
                mobileContainer.appendChild(card);
            }
        });
    },

    renderLeaveReports() {
        const tbody = document.getElementById('leave-reports-body');
        const mobileContainer = document.getElementById('leave-mobile-cards');
        if (!tbody) return;

        const data = this.getFilteredLeave();
        tbody.innerHTML = '';
        if (mobileContainer) mobileContainer.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">Tidak ada data ditemukan</td></tr>';
            if (mobileContainer) mobileContainer.innerHTML = '<div class="no-data">Tidak ada pengajuan ditemukan</div>';
            return;
        }

        data.forEach(row => {
            const statusLabels = { 'pending': 'Menunggu', 'approved': 'Disetujui', 'rejected': 'Ditolak' };
            const approvalButtons = row.status === 'pending' ? `
                <button type="button" class="btn-action" style="background:#10B981; border:none; color:#fff; cursor:pointer;" onclick="adminReports.approveLeaveItem('${row.id}', '${row._source}')"><i class="fas fa-check"></i></button>
                <button type="button" class="btn-action" style="background:#EF4444; border:none; color:#fff; cursor:pointer;" onclick="adminReports.rejectLeaveItem('${row.id}', '${row._source}')"><i class="fas fa-times"></i></button>
            ` : '';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.name}</td>
                <td>${row.department}</td>
                <td>${row.type}</td>
                <td>${row.dates}</td>
                <td>${row.duration} hari</td>
                <td>${row.reason || '-'}</td>
                <td><span class="status-badge ${row.status}">${statusLabels[row.status] || row.status}</span></td>
                <td>
                    <div style="display:flex; gap:4px;">
                        <button class="btn-action view" onclick="adminReports.viewLeaveDetail('${row.userId}', '${row.dates}')"><i class="fas fa-eye"></i></button>
                        ${approvalButtons}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);

            if (mobileContainer) {
                const card = document.createElement('div');
                card.className = 'report-card';
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                        <span class="status-badge ${row.status}">${statusLabels[row.status] || row.status}</span>
                        <span style="font-weight:600">${row.type}</span>
                    </div>
                    <div style="font-weight:600">${row.name}</div>
                    <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">${row.dates} (${row.duration} hari)</div>
                    <div style="font-size:13px; margin-bottom:12px;">${row.reason || '-'}</div>
                    <div class="card-actions" style="display:grid; grid-template-columns: ${row.status === 'pending' ? '1fr 1fr 1fr' : '1fr'}; gap:8px;">
                        <button class="btn-full btn-sm" onclick="adminReports.viewLeaveDetail('${row.userId}', '${row.dates}')"><i class="fas fa-eye"></i> Detail</button>
                        ${row.status === 'pending' ? `
                            <button type="button" class="btn-full btn-sm" style="background:#10B981; color:#fff;" onclick="adminReports.approveLeaveItem('${row.id}', '${row._source}')"><i class="fas fa-check"></i> Setujui</button>
                            <button type="button" class="btn-full btn-sm" style="background:#EF4444; color:#fff;" onclick="adminReports.rejectLeaveItem('${row.id}', '${row._source}')"><i class="fas fa-times"></i> Tolak</button>
                        ` : ''}
                    </div>
                `;
                mobileContainer.appendChild(card);
            }
        });
    },

    /**
     * Event Binding
     */
    bindAttendanceEvents() {
        this._bind('attendance-month', 'change', async (e) => {
            this.filters.attendance.month = e.target.value;
            await this.loadData(this.filters.attendance.month);
            this.renderAttendanceReports();
        });
        this._bind('report-dept-filter', 'change', (e) => {
            this.filters.attendance.dept = e.target.value;
            this.renderAttendanceReports();
        });
        this._bind('report-status-filter', 'change', (e) => {
            this.filters.attendance.status = e.target.value;
            this.renderAttendanceReports();
        });
        this._bind('report-location-filter', 'change', (e) => {
            this.filters.attendance.location = e.target.value;
            this.renderAttendanceReports();
        });
        this._bind('btn-export-attendance', 'click', () => this.exportToExcel('attendance'));
        this._bind('btn-print-attendance', 'click', () => this.downloadAttendancePDF());
    },

    bindJurnalEvents() {
        this._bind('jurnal-month', 'change', async (e) => {
            this.filters.jurnal.month = e.target.value;
            await this.loadData(this.filters.jurnal.month);
            this.renderJurnalReports();
        });
        this._bind('jurnal-employee-filter', 'change', (e) => {
            this.filters.jurnal.employee = e.target.value;
            this.renderJurnalReports();
        });
        this._bind('jurnal-status-filter', 'change', (e) => {
            this.filters.jurnal.status = e.target.value;
            this.renderJurnalReports();
        });
        this._bind('btn-export-jurnal', 'click', () => this.exportToExcel('jurnal'));
        this._bind('btn-print-jurnal', 'click', () => this.downloadJournalPDF());
    },

    bindLeaveEvents() {
        this._bind('leave-month', 'change', async (e) => {
            this.filters.leave.month = e.target.value;
            await this.loadData(this.filters.leave.month);
            this.renderLeaveReports();
        });
        this._bind('leave-type-filter', 'change', (e) => {
            this.filters.leave.type = e.target.value;
            this.renderLeaveReports();
        });
        this._bind('leave-status-filter', 'change', (e) => {
            this.filters.leave.status = e.target.value;
            this.renderLeaveReports();
        });
        this._bind('btn-export-leave', 'click', () => this.exportToExcel('leave'));
        this._bind('btn-print-leave', 'click', () => this.downloadLeavePDF());
    },

    /**
     * Detail Views
     */
    async viewAttendanceDetail(userId) {
        const emp = this.getEmployeeInfo(userId);
        if (typeof loader !== 'undefined') loader.show('Memuat rincian...');
        try {
            const result = await api.getAttendance(userId);
            const data = result.data || [];
            const month = this.filters.attendance.month;
            const filtered = data.filter(a => a.date && a.date.startsWith(month));

            const rows = filtered.map(a => {
                const statusInfo = dateTime.calculateAttendanceStatus(a);
                const statusText = statusInfo.label;
                const statusBadge = statusInfo.class;
                
                const cIn = a.clockIn || '';
                const cOut = a.clockOut || '';
                
                // Attach calculated fields for export
                a._exportStatus = statusText;
                
                return `
                <tr>
                    <td>${a.date}</td>
                    <td>${a.shift || '-'}</td>
                    <td>${cIn || '-'}</td>
                    <td>${cOut || '-'}</td>
                    <td><span class="status-badge ${statusBadge}">${statusText}</span></td>
                </tr>
                `;
            }).join('') || '<tr><td colspan="5" class="text-center">Tidak ada data untuk bulan ini</td></tr>';

            // Base64 encode data for custom export
            const exportData = btoa(encodeURIComponent(JSON.stringify(filtered.map(a => ({
                Tanggal: a.date,
                Shift: a.shift || '-',
                'Absen Masuk': a.clockIn || '-',
                'Absen Pulang': a.clockOut || '-',
                Status: a._exportStatus || a.status
            })))));

            modal.show('Rincian Absensi: ' + emp.name, `
                <div class="attendance-detail-view">
                    <div style="display:flex; justify-content:flex-end; gap:8px; margin-bottom:16px;">
                        <button type="button" class="btn-secondary btn-sm" onclick="adminReports.printDetail()"><i class="fas fa-print"></i> Cetak</button>
                        <button type="button" class="btn-primary btn-sm" onclick="adminReports.exportDetail('${emp.name}', '${exportData}')"><i class="fas fa-file-excel"></i> Export Rincian</button>
                    </div>
                    <div class="table-responsive">
                        <table class="report-table">
                            <thead><tr><th>Tanggal</th><th>Shift</th><th>Masuk</th><th>Pulang</th><th>Status</th></tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>
            `);
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    viewJurnalDetail(userId, date) {
        const item = this.jurnalData.find(j => String(j.userId) === String(userId) && j.date === date);
        if (!item) return;

        const photoUrl = item.photo || item.Photo || item.foto || item.Foto;

        modal.show('Detail Laporan Kinerja: ' + item.employeeName, `
            <div class="jurnal-detail-view">
                <p style="margin-bottom:8px;"><strong>Tanggal:</strong> ${item.date}</p>
                <div class="detail-section" style="margin-top:16px;">
                    <label style="font-weight:600; color:var(--text-muted); display:block; margin-bottom:8px;">Aktivitas:</label>
                    <div style="background:#f3f4f6; padding:12px; border-radius:8px; line-height:1.5; color:var(--text-primary);">${item.tasks}</div>
                </div>
                ${photoUrl ? `
                <div class="detail-section" style="margin-top:20px;">
                    <label style="font-weight:600; color:var(--text-muted); display:block; margin-bottom:10px;">Foto Dokumentasi:</label>
                    <div style="cursor:pointer; position:relative;" onclick="adminReports.viewPhoto('${photoUrl}')" title="Klik untuk memperbesar">
                        <img src="${normalizeImageUrl(photoUrl)}" style="width:100%; border-radius:12px; box-shadow:var(--shadow); display:block;">
                        <span style="position:absolute; bottom:12px; right:12px; background:rgba(0,0,0,0.6); color:white; padding:4px 10px; border-radius:30px; font-size:11px;">
                            <i class="fas fa-search-plus"></i> Perbesar
                        </span>
                    </div>
                </div>` : `
                <div class="detail-section" style="margin-top:20px; text-align:center; padding:20px; background:#f9fafb; border-radius:12px; border:2px dashed #e5e7eb;">
                    <i class="fas fa-image" style="font-size:24px; color:#d1d5db; margin-bottom:8px; display:block;"></i>
                    <p style="font-size:13px; color:var(--text-muted);">Tidak ada lampiran foto</p>
                </div>`}
            </div>
        `);
    },

    viewLeaveDetail(userId, dateRange) {
        const item = this.leaveData.find(l => String(l.userId) === String(userId) && l.dates === dateRange);
        if (!item) return;

        modal.show('Detail Pengajuan: ' + item.name, `
            <div class="leave-detail-view">
                <p><strong>NIP:</strong> ${item.nip || '-'}</p>
                <p><strong>Tipe:</strong> ${item.type}</p>
                <p><strong>Periode:</strong> ${item.dates} (${item.duration} hari)</p>
                <p><strong>Alasan:</strong> ${item.reason || '-'}</p>
                ${item._source === 'izin' ? `
                    <p><strong>Alamat Izin:</strong> ${item.alamatIzin || '-'}</p>
                    <p><strong>Telepon:</strong> ${item.telpIzin || '-'}</p>
                ` : `
                    <p><strong>Alamat Cuti:</strong> ${item.alamatCuti || '-'}</p>
                    <p><strong>Telepon:</strong> ${item.telpCuti || '-'}</p>
                `}
                <p><strong>Status:</strong> ${item.status.toUpperCase()}</p>
            </div>
        `);
    },

    async approveLeaveItem(id, source) {
        if (!confirm('Setujui pengajuan ini?')) return;
        try {
            const item = this.leaveData.find(l => String(l.id) === String(id));
            const action = source === 'leave' ? 'approveLeave' : 'approveIzin';
            const res = await api.request(action, { id });
            if (res.success) {
                toast.success('Pengajuan disetujui');
                
                // Notify Employee
                if (item && item.userId) {
                    const typeLabel = item.type || (source === 'leave' ? 'Cuti' : 'Izin');
                    notifications.add(item.userId, 'Admin', `telah MENYETUJUI pengajuan ${typeLabel} Anda`, 'success');
                }

                await this.loadData(this.filters.leave.month, true);
                this.renderLeaveReports();
            } else { toast.error(res.error || 'Gagal menyetujui'); }
        } catch (e) { toast.error('Kesalahan sistem'); }
    },

    async rejectLeaveItem(id, source) {
        const reason = prompt('Masukkan alasan penolakan:');
        if (reason === null) return;
        try {
            const item = this.leaveData.find(l => String(l.id) === String(id));
            const action = source === 'leave' ? 'rejectLeave' : 'rejectIzin';
            const res = await api.request(action, { id, reason });
            if (res.success) {
                toast.success('Pengajuan ditolak');

                // Notify Employee
                if (item && item.userId) {
                    const typeLabel = item.type || (source === 'leave' ? 'Cuti' : 'Izin');
                    notifications.add(item.userId, 'Admin', `telah MENOLAK pengajuan ${typeLabel} Anda. Alasan: ${reason}`, 'error');
                }

                await this.loadData(this.filters.leave.month, true);
                this.renderLeaveReports();
            } else { toast.error(res.error || 'Gagal menolak'); }
        } catch (e) { toast.error('Kesalahan sistem'); }
    },

    async approveJurnalItem(id) {
        if (!confirm('Setujui jurnal ini?')) return;
        try {
            const res = await api.request('approveJournal', { id });
            if (res.success) {
                toast.success('Jurnal disetujui');
                await this.loadData(this.filters.jurnal.month, true);
                this.renderJurnalReports();
            } else { toast.error(res.error || 'Gagal menyetujui'); }
        } catch (e) { toast.error('Kesalahan sistem'); }
    },

    async rejectJurnalItem(id) {
        if (!confirm('Tolak jurnal ini?')) return;
        try {
            const res = await api.request('rejectJournal', { id });
            if (res.success) {
                toast.success('Jurnal ditolak');
                await this.loadData(this.filters.jurnal.month, true);
                this.renderJurnalReports();
            } else { toast.error(res.error || 'Gagal menolak'); }
        } catch (e) { toast.error('Kesalahan sistem'); }
    },

    /**
     * Common Utilities
     */
    getEmployeeInfo(userId) {
        return this.rawEmployees.find(e => String(e.id) === String(userId)) || { name: 'Pegawai', department: '-' };
    },

    _normalizeDate(d) {
        if (!d) return '';
        if (typeof d === 'string' && d.includes('T')) return d.split('T')[0];
        return d;
    },

    updateDynamicDeptFilter() {
        if (!this.rawEmployees || this.rawEmployees.length === 0) return;
        const depts = [...new Set(this.rawEmployees.map(e => e.department).filter(d => d))].sort();
        const select = document.getElementById('report-dept-filter');
        if (select) {
            const currentVal = select.value;
            select.innerHTML = '<option value="">Semua Bidang</option>' +
                depts.map(d => `<option value="${d}">${d}</option>`).join('');
            select.value = currentVal;
        }
    },

    populateEmployeeFilter() {
        const select = document.getElementById('jurnal-employee-filter');
        if (select) {
            const currentVal = select.value;
            select.innerHTML = '<option value="">Semua Pegawai</option>' +
                this.rawEmployees.map(emp => `<option value="${emp.name}">${emp.name}</option>`).join('');
            select.value = currentVal;
        }
    },

    exportToExcel(type) {
        let data = [];
        let filename = `Rekap_${type}_${this.filters[type].month}.xls`;
        
        if (type === 'attendance') {
            const raw = this.getFilteredAttendance();
            data = raw.map(r => ({
                'Nama Karyawan': r.name,
                'Bidang': r.department,
                'Hadir (On-Time)': r.present,
                'Terlambat': r.late,
                'Tanpa Absen Masuk (TAM)': r.noClockIn,
                'Tanpa Absen Pulang (TAP)': r.noClockOut,
                'Cuti/Izin/Sakit': r.absent,
                'Total Hari Kerja': r.total
            }));
        }
        else if (type === 'jurnal') {
            const raw = this.getFilteredJurnal();
            data = raw.map(r => ({
                'Tanggal': r.date,
                'Nama Pegawai': r.employeeName,
                'Bidang': r.department,
                'Laporan Pekerjaan (Tugas)': r.tasks,
                'Status': r.status.toUpperCase()
            }));
        }
        else if (type === 'leave') {
            const raw = this.getFilteredLeave();
            data = raw.map(r => ({
                'Nama Pegawai': r.name,
                'Bidang': r.department,
                'Jenis': r.type,
                'Tanggal': r.dates,
                'Durasi (Hari)': r.duration,
                'Alasan': r.reason,
                'Status': r.status.toUpperCase()
            }));
        }

        if (data.length === 0) {
            toast.warning('Tidak ada data untuk diexport');
            return;
        }

        // Use HTML table format to force Excel to show tidy cells/columns
        const headers = Object.keys(data[0]);
        let tableHtml = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${type}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
            <body>
                <table border="1">
                    <thead>
                        <tr style="background-color: #f3f4f6;">
                            ${headers.map(h => `<th style="font-weight: bold; padding: 5px; border: 1px solid #ccc;">${h}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(r => `
                            <tr>
                                ${Object.values(r).map(v => `<td style="padding: 5px; border: 1px solid #ccc;">${v}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </body>
            </html>
        `;

        const blob = new Blob(['\ufeff', tableHtml], { type: 'application/vnd.ms-excel' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('href', url);
        a.setAttribute('download', filename);
        a.style.visibility = 'hidden';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        toast.success(`Data ${type} berhasil diekspor ke Excel (Tidy Cells)`);
    },

    getFilteredAttendance() {
        const dept = this.filters.attendance.dept.toLowerCase();
        const status = this.filters.attendance.status.toLowerCase();
        
        return this.attendanceData.filter(d => {
            const matchDept = !dept || (d.department || '').toLowerCase() === dept;
            const matchStatus = !status || 
                (status === 'hadir' && d.present > 0) ||
                (status === 'telat' && d.late > 0) ||
                (status === 'tidak hadir' && d.absent > 0);
            return matchDept && matchStatus;
        });
    },

    getFilteredJurnal() {
        const emp = this.filters.jurnal.employee.toLowerCase();
        const status = this.filters.jurnal.status.toLowerCase();
        
        return this.jurnalData.filter(d => {
            const matchEmp = !emp || (d.employeeName || '').toLowerCase() === emp;
            const matchStatus = !status || (d.status || '').toLowerCase() === status;
            return matchEmp && matchStatus;
        });
    },

    getFilteredLeave() {
        const typeFilter = this.filters.leave.type.toLowerCase();
        const status = this.filters.leave.status.toLowerCase();
        
        return this.leaveData.filter(d => {
            const matchType = !typeFilter || (d.type || '').toLowerCase() === typeFilter;
            const matchStatus = !status || (d.status || '').toLowerCase() === status;
            return matchType && matchStatus;
        });
    },

    async downloadAttendancePDF() {
        const month = this.filters.attendance.month;
        if (typeof loader !== 'undefined') loader.show('Menyiapkan Rekap Absensi PDF...');

        try {
            const res = await api.request('downloadAttendancePDF', {
                month: month
            });

            if (res.success && res.data) {
                this._downloadBase64PDF(res.data, res.filename || `Rekap_Absensi_${month}.pdf`);
                toast.success('Rekap Absensi Berhasil Diunduh!');
            } else {
                toast.error(res.error || 'Gagal mengunduh PDF Recap');
            }
        } catch (e) {
            console.error('Error downloading Attendance PDF:', e);
            toast.error('Terjadi kesalahan sistem');
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    async downloadLeavePDF() {
        const month = this.filters.leave.month;
        if (typeof loader !== 'undefined') loader.show('Menyiapkan Rekap Cuti/Izin PDF...');

        try {
            const res = await api.request('downloadLeavePDF', {
                month: month
            });

            if (res.success && res.data) {
                this._downloadBase64PDF(res.data, res.filename || `Rekap_Cuti_Izin_${month}.pdf`);
                toast.success('Rekap Cuti & Izin Berhasil Diunduh!');
            } else {
                toast.error(res.error || 'Gagal mengunduh PDF');
            }
        } catch (e) {
            console.error('Error downloading Leave PDF:', e);
            toast.error('Terjadi kesalahan sistem');
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    _downloadBase64PDF(base64Data, filename) {
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    },

    viewPhoto(url) {
        if (typeof modal !== 'undefined') {
            modal.show('Foto Lampiran', `<div class="photo-detail-view"><img src="${normalizeImageUrl(url)}" style="width:100%; border-radius:8px;"></div>`);
        }
    },

    async downloadJournalPDF() {
        const employeeName = this.filters.jurnal.employee;
        const month = this.filters.jurnal.month;

        if (!employeeName) {
            toast.error('Harap pilih salah satu pegawai terlebih dahulu!');
            return;
        }

        const employee = this.rawEmployees.find(e => e.name === employeeName);
        if (!employee) {
            toast.error('Data pegawai tidak ditemukan');
            return;
        }

        if (typeof loader !== 'undefined') loader.show('Menyiapkan dokumen PDF...');

        try {
            const res = await api.request('downloadJournalPDF', {
                userId: employee.id,
                month: month
            });

            if (res.success && res.data) {
                const byteCharacters = atob(res.data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/pdf' });
                
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = res.filename || `Jurnal_${employee.name}_${month}.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                
                toast.success('Pencetakan PDF Jurnal Berhasil!');
            } else {
                toast.error(res.error || 'Gagal mengunduh PDF');
            }
        } catch (e) {
            console.error('Error downloading PDF:', e);
            toast.error('Terjadi kesalahan saat mengunduh PDF');
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    /**
     * Modal-Specific Actions
     */
    printDetail() {
        window.print();
    },

    exportDetail(employeeName, base64Data) {
        try {
            const decodedData = JSON.parse(decodeURIComponent(atob(base64Data)));
            if (decodedData.length === 0) {
                toast.warning('Tidak ada data rincian untuk diexport');
                return;
            }
            
            const headers = Object.keys(decodedData[0]).join(',');
            const rows = decodedData.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
            const csv = headers + '\n' + rows;
            
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Rincian_Absensi_${employeeName.replace(/\\s+/g, '_')}_${this.filters.attendance.month}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
            toast.success('Rincian berhasil diekspor');
        } catch(e) {
            console.error("Export detail failed:", e);
            toast.error("Gagal mengekspor rincian");
        }
    }
};

window.adminReports = adminReports;

// Router compatibility exports
window.initAttendanceReports = () => adminReports.initAttendanceReports();
window.initJurnalReports = () => adminReports.initJurnalReports();
window.initLeaveReports = () => adminReports.initLeaveReports();
