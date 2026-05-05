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
    
    sortState: {
        attendance: { key: 'name', direction: 'asc' },
        jurnal: { key: 'date', direction: 'desc' },
        leave: { key: 'dates', direction: 'desc' }
    },
    
    // Caching state
    loadedMonths: { attendance: null, jurnal: null, leave: null, izin: null, employees: false },
    initialized: false,

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
            this.initialized = true;
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
            this.initialized = true;
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
            this.initialized = true;
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
            if (cached && cached.employees && cached.employees.length > 0) {
                console.log('Loading reports from cache:', targetMonth);
                this.rawEmployees = cached.employees || [];
                this.attendanceData = cached.attendanceData || [];
                this.jurnalData = cached.jurnalData || [];
                this.leaveData = cached.leaveData || [];
                
                this.loadedMonths = { 
                    attendance: targetMonth, jurnal: targetMonth, 
                    leave: targetMonth, izin: targetMonth, employees: true 
                };
                
                if (typeof loader !== 'undefined') loader.hide();
                
                // Background fetch to refresh stale data
                this._backgroundFetch(targetMonth, cacheKey);
                return;
            }
        }

        // 2. Fetch all data
        if (typeof loader !== 'undefined') loader.show('Mengambil data terbaru dari database...');

        try {
            const empRes = await api.getEmployees();
            this.rawEmployees = (empRes && empRes.data) ? empRes.data : [];
            
            let attendances = [], jurnals = [], leaves = [], izinList = [];
            const [attRes, jurRes, leaRes, iznRes] = await Promise.all([
                api.getAllAttendance(targetMonth),
                api.getAllJournals(targetMonth),
                api.getAllLeaves(targetMonth),
                api.getAllIzin(targetMonth)
            ]);

            attendances = (attRes && attRes.data) ? attRes.data : [];
            jurnals = (jurRes && jurRes.data) ? jurRes.data : [];
            leaves = (leaRes && leaRes.data) ? leaRes.data : [];
            izinList = (iznRes && iznRes.data) ? iznRes.data : [];

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
        console.log(`[_backgroundFetch] Starting for ${targetMonth}`);
        try {
            const [empRes, attRes, jurRes, leaRes, iznRes] = await Promise.all([
                api.getEmployees(),
                api.getAllAttendance(targetMonth),
                api.getAllJournals(targetMonth),
                api.getAllLeaves(targetMonth),
                api.getAllIzin(targetMonth)
            ]);

            console.log(`[_backgroundFetch] Data fetched:`, { empRes, attRes, jurRes, leaRes, iznRes });

            this.rawEmployees = (empRes && empRes.data) ? empRes.data : [];
            this.processAllData(
                targetMonth, 
                (attRes && attRes.data) ? attRes.data : [], 
                (jurRes && jurRes.data) ? jurRes.data : [], 
                (leaRes && leaRes.data) ? leaRes.data : [], 
                (iznRes && iznRes.data) ? iznRes.data : [], 
                cacheKey
            );
            
            // Re-populate filters and dropdowns with fresh data
            this.updateDynamicDeptFilter();
            this.populateEmployeeFilter();

            // Re-render the active tab silently
            const currentHash = window.location.hash;
            if (currentHash.includes('attendance')) this.renderAttendanceReports();
            if (currentHash.includes('jurnal')) this.renderJurnalReports();
            if (currentHash.includes('leave')) this.renderLeaveReports();
            
            console.log(`[_backgroundFetch] Done.`);
        } catch (e) {
            console.warn('Background refresh failed:', e);
        }
    },

    /**
     * Process raw API data into formatted report models
     */
    processAllData(targetMonth, attendances, jurnals, leaves, izinList, cacheKey) {
        console.log(`Processing all data for ${targetMonth}:`, { 
            empCount: this.rawEmployees.length, 
            attCount: attendances.length, 
            jurCount: jurnals.length, 
            leaCount: leaves.length, 
            iznCount: izinList.length 
        });

        this.loadedMonths = { 
            attendance: targetMonth, jurnal: targetMonth, 
            leave: targetMonth, izin: targetMonth, employees: true 
        };

        // 1. Process Attendance Summary
        this.attendanceData = (this.rawEmployees || []).map(emp => {
            const empAtt = (attendances || []).filter(a => String(a.userId) === String(emp.id));
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

            const empLeaves = (leaves || []).filter(l => String(l.userId) === String(emp.id) && l.status === 'approved');
            const empIzin = (izinList || []).filter(i => String(i.userId) === String(emp.id) && i.status === 'approved');

            let absentCount = 0;
            empLeaves.forEach(l => absentCount += parseInt(l.duration) || 1);
            empIzin.forEach(i => absentCount += parseInt(i.duration) || 1);

            return {
                id: emp.id, nip: emp.nip || emp.NIP || '-', 
                name: emp.name, department: emp.department || '-',
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
            ...(leaves || []).map(l => {
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
            ...(izinList || []).map(i => {
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
            const lType = l.type ? String(l.type) : '';
            const matchesType = !type || lType.toLowerCase().includes(type.toLowerCase());
            const matchesStatus = !status || l.status === status;
            return matchesType && matchesStatus;
        });
    },

    sortAttendance(key) {
        if (this.sortState.attendance.key === key) {
            this.sortState.attendance.direction = this.sortState.attendance.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortState.attendance.key = key;
            this.sortState.attendance.direction = 'asc';
        }
        this.renderAttendanceReports();
    },

    sortJurnal(key) {
        if (this.sortState.jurnal.key === key) {
            this.sortState.jurnal.direction = this.sortState.jurnal.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortState.jurnal.key = key;
            this.sortState.jurnal.direction = 'asc';
        }
        this.renderJurnalReports();
    },

    sortLeave(key) {
        if (this.sortState.leave.key === key) {
            this.sortState.leave.direction = this.sortState.leave.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortState.leave.key = key;
            this.sortState.leave.direction = 'asc';
        }
        this.renderLeaveReports();
    },

    /**
     * Render Functions
     */
    renderAttendanceReports() {
        const tbody = document.getElementById('attendance-reports-body');
        const mobileContainer = document.getElementById('attendance-mobile-cards');
        if (!tbody) return;

        let data = this.getFilteredAttendance();

        // Apply Sorting
        const { key, direction } = this.sortState.attendance;
        data.sort((a, b) => {
            let valA = a[key] || '';
            let valB = b[key] || '';
            
            const numericKeys = ['present', 'late', 'absent', 'total'];
            if (numericKeys.includes(key)) {
                valA = parseFloat(valA) || 0;
                valB = parseFloat(valB) || 0;
            } else {
                valA = valA.toString().toLowerCase();
                valB = valB.toString().toLowerCase();
            }
            
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });

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
                            <div style="font-size:11px; color:var(--text-muted)">NIP: ${row.nip}</div>
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

        let data = this.getFilteredJurnal();

        // Apply Sorting
        const { key, direction } = this.sortState.jurnal;
        data.sort((a, b) => {
            let valA = a[key] || '';
            let valB = b[key] || '';
            
            valA = valA.toString().toLowerCase();
            valB = valB.toString().toLowerCase();
            
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });

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

        let data = this.getFilteredLeave();
        
        // Apply Sorting
        const { key, direction } = this.sortState.leave;
        data.sort((a, b) => {
            let valA = a[key] || '';
            let valB = b[key] || '';
            
            // Handle numeric duration
            if (key === 'duration') {
                valA = parseInt(valA) || 0;
                valB = parseInt(valB) || 0;
            } else {
                valA = valA.toString().toLowerCase();
                valB = valB.toString().toLowerCase();
            }
            
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });

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
            const data = (result && result.data) ? result.data : [];
            const month = this.filters.attendance.month;
            const filtered = data.filter(a => a.date && a.date.startsWith(month));

            const rows = filtered.map(a => {
                const statusInfo = dateTime.calculateAttendanceStatus(a);
                const statusText = statusInfo.label;
                const statusBadge = statusInfo.class;
                
                const cIn = a.clockIn || '';
                const cOut = a.clockOut || '';
                
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

            modal.show('Rincian Absensi: ' + emp.name, `
                <div class="attendance-detail-view">
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
                    <div style="background:#f9fafb; padding:12px; border-radius:8px; border:1px solid #e5e7eb; white-space:pre-wrap;">${item.tasks}</div>
                </div>
                ${photoUrl ? `
                <div class="detail-section" style="margin-top:16px;">
                    <label style="font-weight:600; color:var(--text-muted); display:block; margin-bottom:8px;">Lampiran Foto:</label>
                    <img src="${normalizeImageUrl(photoUrl)}" style="width:100%; border-radius:8px; cursor:pointer;" onclick="adminReports.viewPhoto('${photoUrl}')">
                </div>
                ` : ''}
            </div>
        `);
    },

    viewLeaveDetail(userId, dateRange) {
        const item = this.leaveData.find(l => String(l.userId) === String(userId) && l.dates === dateRange);
        if (!item) return;

        modal.show('Detail Pengajuan: ' + item.name, `
            <div class="leave-detail-view">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:16px;">
                    <div><label style="font-size:12px; color:var(--text-muted);">Jenis</label><div><strong>${item.type}</strong></div></div>
                    <div><label style="font-size:12px; color:var(--text-muted);">Status</label><div><span class="status-badge ${item.status}">${item.status.toUpperCase()}</span></div></div>
                </div>
                <div style="margin-bottom:16px;"><label style="font-size:12px; color:var(--text-muted);">Periode</label><div><strong>${item.dates}</strong> (${item.duration} hari)</div></div>
                <div style="margin-bottom:16px;"><label style="font-size:12px; color:var(--text-muted);">Alasan/Keterangan</label><div style="background:#f9fafb; padding:12px; border-radius:8px; border:1px solid #e5e7eb;">${item.reason || '-'}</div></div>
                ${item.attachment ? `
                    <div style="margin-top:16px;">
                        <label style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:8px;">Lampiran:</label>
                        <img src="${normalizeImageUrl(item.attachment)}" style="width:100%; border-radius:8px; cursor:pointer;" onclick="adminReports.viewPhoto('${item.attachment}')">
                    </div>
                ` : ''}
            </div>
        `);
    },

    viewPhoto(url) {
        if (!url) return;
        modal.show('Lihat Foto', `
            <div style="text-align:center;">
                <img src="${normalizeImageUrl(url)}" style="max-width:100%; border-radius:8px;">
            </div>
        `, 'large');
    },

    /**
     * Data Management
     */
    getEmployeeInfo(userId) {
        const emp = (this.rawEmployees || []).find(e => String(e.id) === String(userId));
        return emp || { name: 'Pegawai', department: '-' };
    },

    updateDynamicDeptFilter() {
        if (!this.rawEmployees || this.rawEmployees.length === 0) return;
        const depts = [...new Set(this.rawEmployees.map(e => e.department).filter(d => d))].sort();
        const select = document.getElementById('report-dept-filter');
        if (!select) return;
        
        const current = select.value;
        select.innerHTML = '<option value="">Semua Bidang</option>';
        depts.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            if (d === current) opt.selected = true;
            select.appendChild(opt);
        });
    },

    populateEmployeeFilter() {
        const selects = ['jurnal-employee-filter'];
        selects.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;
            const current = select.value;
            select.innerHTML = '<option value="">Semua Pegawai</option>';
            (this.rawEmployees || []).sort((a,b) => a.name.localeCompare(b.name)).forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.name;
                opt.textContent = e.name;
                if (e.name === current) opt.selected = true;
                select.appendChild(opt);
            });
        });
    },

    /**
     * Actions
     */
    async approveJurnalItem(id) {
        if (!confirm('Setujui laporan kinerja ini?')) return;
        try {
            if (typeof loader !== 'undefined') loader.show('Memproses...');
            const res = await api.request('approveJurnal', { id });
            if (res.success) {
                toast.success('Laporan disetujui');
                await this.loadData(this.filters.jurnal.month, true);
                this.renderJurnalReports();
            } else {
                toast.error(res.error || 'Gagal menyetujui');
            }
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    async rejectJurnalItem(id) {
        const reason = prompt('Alasan penolakan:');
        if (reason === null) return;
        try {
            if (typeof loader !== 'undefined') loader.show('Memproses...');
            const res = await api.request('rejectJurnal', { id, reason });
            if (res.success) {
                toast.success('Laporan ditolak');
                await this.loadData(this.filters.jurnal.month, true);
                this.renderJurnalReports();
            } else {
                toast.error(res.error || 'Gagal menolak');
            }
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    async approveLeaveItem(id, source) {
        if (!confirm('Setujui pengajuan ini?')) return;
        try {
            if (typeof loader !== 'undefined') loader.show('Memproses...');
            const action = source === 'leave' ? 'approveLeave' : 'approveIzin';
            const res = await api.request(action, { id });
            if (res.success) {
                toast.success('Pengajuan disetujui');
                await this.loadData(this.filters.leave.month, true);
                this.renderLeaveReports();
            } else {
                toast.error(res.error || 'Gagal menyetujui');
            }
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    async rejectLeaveItem(id, source) {
        const reason = prompt('Alasan penolakan:');
        if (reason === null) return;
        try {
            if (typeof loader !== 'undefined') loader.show('Memproses...');
            const action = source === 'leave' ? 'rejectLeave' : 'rejectIzin';
            const res = await api.request(action, { id, reason });
            if (res.success) {
                toast.success('Pengajuan ditolak');
                await this.loadData(this.filters.leave.month, true);
                this.renderLeaveReports();
            } else {
                toast.error(res.error || 'Gagal menolak');
            }
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    exportToExcel(type) {
        toast.info('Sedang menyiapkan file Excel...');
        // Logic will be handled by a global utility or hidden iframe
        const month = this.filters[type].month;
        window.open(`${API_BASE_URL}?action=exportReports&type=${type}&month=${month}`, '_blank');
    },

    async downloadAttendancePDF() {
        const month = this.filters.attendance.month;
        const url = `${API_BASE_URL}?action=downloadAttendancePDF&month=${month}`;
        window.open(url, '_blank');
    },

    async downloadJournalPDF() {
        const month = this.filters.jurnal.month;
        const url = `${API_BASE_URL}?action=downloadJournalPDF&month=${month}`;
        window.open(url, '_blank');
    },

    async downloadLeavePDF() {
        const month = this.filters.leave.month;
        const url = `${API_BASE_URL}?action=downloadLeavePDF&month=${month}`;
        window.open(url, '_blank');
    }
};

// Expose to window
window.adminReports = adminReports;
window.initAttendanceReports = () => adminReports.initAttendanceReports();
window.initJurnalReports = () => adminReports.initJurnalReports();
window.initLeaveReports = () => adminReports.initLeaveReports();
