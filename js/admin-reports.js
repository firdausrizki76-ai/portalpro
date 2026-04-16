/**
 * SIAP-P3KPW - Admin Reports Controller
 * Optimized for performance with data caching and parallel fetching.
 * Clean version - NO DUPLICATES.
 */

const adminReports = {
    filters: {
        attendance: { month: new Date().toISOString().substring(0, 7), dept: '', status: '' },
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
        if (el) el.addEventListener(event, fn);
    },

    /**
     * Initialization for each report tab
     */
    async initAttendanceReports() {
        if (typeof loader !== 'undefined') loader.show('Memuat rekap absensi...');
        try {
            const monthInput = document.getElementById('attendance-month');
            if (monthInput) monthInput.value = this.filters.attendance.month;

            await this.loadData(this.filters.attendance.month);
            this.updateDynamicDeptFilter();
            this.bindAttendanceEvents();
            this.renderAttendanceReports();
        } catch (error) {
            console.error('Init attendance error:', error);
            toast.error('Gagal memuat rekap absensi');
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    async initJurnalReports() {
        if (typeof loader !== 'undefined') loader.show('Memuat rekap jurnal...');
        try {
            const monthInput = document.getElementById('jurnal-month');
            if (monthInput) monthInput.value = this.filters.jurnal.month;

            await this.loadData(this.filters.jurnal.month);
            this.populateEmployeeFilter();
            this.bindJurnalEvents();
            this.renderJurnalReports();
        } catch (error) {
            console.error('Init jurnal error:', error);
            toast.error('Gagal memuat rekap jurnal');
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    async initLeaveReports() {
        if (typeof loader !== 'undefined') loader.show('Memuat rekap cuti/izin...');
        try {
            const monthInput = document.getElementById('leave-month');
            if (monthInput) monthInput.value = this.filters.leave.month;

            await this.loadData(this.filters.leave.month);
            this.bindLeaveEvents();
            this.renderLeaveReports();
        } catch (error) {
            console.error('Init leave error:', error);
            toast.error('Gagal memuat rekap cuti/izin');
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
            let present = 0, late = 0;

            empAtt.forEach(a => {
                if (a.clockIn) {
                    present++;
                    const status = (a.status || '').toLowerCase();
                    if (status.includes('telat') || status.includes('terlambat')) late++;
                }
            });

            const empLeaves = leaves.filter(l => String(l.userId) === String(emp.id) && l.status === 'approved');
            const empIzin = izinList.filter(i => String(i.userId) === String(emp.id) && i.status === 'approved');

            let absent = 0;
            empLeaves.forEach(l => absent += parseInt(l.duration) || 1);
            empIzin.forEach(i => absent += parseInt(i.duration) || 1);

            return {
                id: emp.id, name: emp.name, department: emp.department || '-',
                avatar: emp.avatar, present, late, absent,
                total: present + absent
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
                return {
                    ...l, _source: 'leave', name: emp.name, department: emp.department,
                    type: l.type === 'annual' ? 'Cuti' : (l.typeLabel || l.type),
                    dates: l.startDate === l.endDate ? l.startDate : `${l.startDate} - ${l.endDate}`,
                    duration: l.duration, status: l.status, reason: l.reason
                };
            }),
            ...izinList.map(i => {
                const emp = this.getEmployeeInfo(i.userId);
                return {
                    ...i, _source: 'izin', name: emp.name, department: emp.department,
                    type: 'Izin', dates: i.date, duration: i.duration, status: i.status, reason: i.reason
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
        const { dept, status } = this.filters.attendance;
        return this.attendanceData.filter(row => {
            const matchesDept = !dept || row.department === dept;
            const matchesStatus = !status || 
                (status === 'present' && row.present > 0) ||
                (status === 'absent' && row.absent > 0) ||
                (status === 'late' && row.late > 0);
            return matchesDept && matchesStatus;
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
                            <div style="font-size:11px; color:var(--text-muted)">${row.department}</div>
                        </div>
                    </div>
                </td>
                <td class="text-center" style="font-weight:600">${row.department}</td>
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
                    <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin-bottom:12px;">
                        <div style="text-align:center"><div style="font-size:10px; color:var(--text-muted)">Hadir</div><div style="color:#10B981; font-weight:700">${row.present}</div></div>
                        <div style="text-align:center"><div style="font-size:10px; color:var(--text-muted)">Telat</div><div style="color:#F59E0B; font-weight:700">${row.late}</div></div>
                        <div style="text-align:center"><div style="font-size:10px; color:var(--text-muted)">Cuti</div><div style="color:#EF4444; font-weight:700">${row.absent}</div></div>
                        <div style="text-align:center"><div style="font-size:10px; color:var(--text-muted)">Total</div><div style="font-weight:700">${row.total}</div></div>
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
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.date || '-'}</td>
                <td>${row.employeeName}</td>
                <td>${row.department}</td>
                <td><div class="line-clamp-2">${row.tasks}</div></td>
                <td>${row.photo ? `<img src="${row.photo}" style="width:40px; height:40px; border-radius:4px; object-fit:cover; cursor:pointer;" onclick="adminReports.viewPhoto('${row.photo}')">` : '-'}</td>
                <td><span class="status-badge ${row.status === 'filled' ? 'success' : 'warning'}">${row.status.toUpperCase()}</span></td>
                <td><button class="btn-action view" onclick="adminReports.viewJurnalDetail('${row.userId}', '${row.date}')"><i class="fas fa-eye"></i></button></td>
            `;
            tbody.appendChild(tr);

            if (mobileContainer) {
                const card = document.createElement('div');
                card.className = 'report-card';
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span style="font-size:12px; font-weight:600">${row.date}</span>
                        <span class="status-badge ${row.status === 'filled' ? 'success' : 'warning'}" style="font-size:10px;">${row.status.toUpperCase()}</span>
                    </div>
                    <div style="font-weight:600; margin-bottom:4px;">${row.employeeName}</div>
                    <div style="font-size:13px; color:var(--text-muted); margin-bottom:12px;">${row.tasks}</div>
                    <button class="btn-full btn-sm" onclick="adminReports.viewJurnalDetail('${row.userId}', '${row.date}')">Lihat Detail</button>
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
                    <button class="btn-full btn-sm" onclick="adminReports.viewLeaveDetail('${row.userId}', '${row.dates}')">Lihat Detail</button>
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
        this._bind('btn-export-attendance', 'click', () => this.exportToExcel('attendance'));
        this._bind('btn-print-attendance', 'click', () => window.print());
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
        this._bind('btn-print-jurnal', 'click', () => window.print());
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
        this._bind('btn-print-leave', 'click', () => window.print());
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

            const rows = filtered.map(a => `
                <tr>
                    <td>${a.date}</td>
                    <td>${a.shift || '-'}</td>
                    <td>${a.clockIn || '-'}</td>
                    <td>${a.clockOut || '-'}</td>
                    <td><span class="status-badge ${a.status.toLowerCase().includes('telat') ? 'warning' : 'success'}">${a.status}</span></td>
                </tr>
            `).join('') || '<tr><td colspan="5" class="text-center">Tidak ada data untuk bulan ini</td></tr>';

            modal.show('Rincian Absensi: ' + emp.name, `
                <div class="table-responsive">
                    <table class="report-table">
                        <thead><tr><th>Tanggal</th><th>Shift</th><th>Masuk</th><th>Pulang</th><th>Status</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `);
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    viewJurnalDetail(userId, date) {
        const item = this.jurnalData.find(j => String(j.userId) === String(userId) && j.date === date);
        if (!item) return;

        modal.show('Detail Jurnal: ' + item.employeeName, `
            <div class="jurnal-detail-view">
                <p><strong>Tanggal:</strong> ${item.date}</p>
                <div class="detail-section" style="margin-top:12px;">
                    <label style="font-weight:600; color:var(--text-muted)">Aktivitas:</label>
                    <div style="background:#f3f4f6; padding:12px; border-radius:8px; margin-top:8px;">${item.tasks}</div>
                </div>
                ${item.photo ? `<div style="margin-top:12px;"><img src="${item.photo}" style="width:100%; border-radius:8px;"></div>` : ''}
            </div>
        `);
    },

    viewLeaveDetail(userId, dateRange) {
        const item = this.leaveData.find(l => String(l.userId) === String(userId) && l.dates === dateRange);
        if (!item) return;

        modal.show('Detail Pengajuan: ' + item.name, `
            <div class="leave-detail-view">
                <p><strong>Tipe:</strong> ${item.type}</p>
                <p><strong>Periode:</strong> ${item.dates} (${item.duration} hari)</p>
                <p><strong>Alasan:</strong> ${item.reason || '-'}</p>
                <p><strong>Status:</strong> ${item.status.toUpperCase()}</p>
            </div>
        `);
    },

    async approveLeaveItem(id, source) {
        if (!confirm('Setujui pengajuan ini?')) return;
        try {
            const action = source === 'leave' ? 'approveLeave' : 'approvePermission';
            const res = await api.request(action, { id });
            if (res.success) {
                toast.success('Pengajuan disetujui');
                await this.loadData(this.filters.leave.month, true);
                this.renderLeaveReports();
            } else { toast.error(res.error || 'Gagal menyetujui'); }
        } catch (e) { toast.error('Kesalahan sistem'); }
    },

    async rejectLeaveItem(id, source) {
        const reason = prompt('Masukkan alasan penolakan:');
        if (reason === null) return;
        try {
            const action = source === 'leave' ? 'rejectLeave' : 'rejectPermission';
            const res = await api.request(action, { id, reason });
            if (res.success) {
                toast.success('Pengajuan ditolak');
                await this.loadData(this.filters.leave.month, true);
                this.renderLeaveReports();
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
            select.innerHTML = '<option value="">Semua Departemen</option>' +
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
        let filename = `Rekap_${type}_${this.filters[type].month}.csv`;
        if (type === 'attendance') data = this.getFilteredAttendance();
        else if (type === 'jurnal') data = this.getFilteredJurnal();
        else if (type === 'leave') data = this.getFilteredLeave();

        const headers = data.length > 0 ? Object.keys(data[0]).join(',') : '';
        const rows = data.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const csv = headers + '\n' + rows;

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success('Data berhasil diekspor');
    },

    viewPhoto(url) {
        if (typeof modal !== 'undefined') {
            modal.show('Foto Lampiran', `<img src="${url}" style="width:100%; border-radius:8px;">`);
        }
    }
};

window.adminReports = adminReports;

// Router compatibility exports
window.initAttendanceReports = () => adminReports.initAttendanceReports();
window.initJurnalReports = () => adminReports.initJurnalReports();
window.initLeaveReports = () => adminReports.initLeaveReports();
