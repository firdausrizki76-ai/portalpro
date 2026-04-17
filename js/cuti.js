/**
 * Portal Karyawan - Cuti/Leave
 * Leave request functionality
 */

const cuti = {
    leaves: [],
    leaveBalance: 12,
    filterStatus: '',

    async init() {
        if (typeof loader !== 'undefined') loader.show('Memuat data cuti...');
        try {
            await this.loadLeaves();
            this.initForm();
            this.initFilters();
            this.renderLeaveList();
            this.updateStats();
        } catch (error) {
            console.error('Cuti init error:', error);
            toast.error('Gagal memuat data cuti');
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    async loadLeaves(forceRefresh = false) {
        const currentUser = auth.getCurrentUser();
        const userId = currentUser?.id || 'demo-user';
        const cacheKey = `leaves_cache_${userId}`;

        if (!forceRefresh) {
            const cached = storage.get(cacheKey);
            if (cached) {
                this.leaves = cached;
                this._backgroundRefresh(userId, cacheKey);
                return;
            }
        }

        try {
            const result = auth.isAdmin() ? await api.getAllLeaves() : await api.getLeaves(userId);
            this.leaves = result.data || [];
            storage.set(cacheKey, this.leaves);
        } catch (error) {
            console.error('Error loading leaves:', error);
            this.leaves = storage.get(cacheKey, []);
        }

        // Load balance from storage or use default
        const savedBalance = storage.get('leaveBalance');
        if (savedBalance !== null) {
            this.leaveBalance = savedBalance;
        }
    },

    async _backgroundRefresh(userId, cacheKey) {
        try {
            const result = auth.isAdmin() ? await api.getAllLeaves() : await api.getLeaves(userId);
            if (result.success) {
                this.leaves = result.data || [];
                storage.set(cacheKey, this.leaves);
                this.renderLeaveList();
                this.updateStats();
            }
        } catch (e) {
            console.warn('Cuti background refresh failed', e);
        }
    },

    initForm() {
        const form = document.getElementById('cuti-form');
        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmit(e));
        }

        // Auto-calculate duration when dates change
        const startDate = document.getElementById('leave-start');
        const endDate = document.getElementById('leave-end');
        const duration = document.getElementById('leave-duration');

        const calculateDuration = () => {
            if (startDate.value && endDate.value) {
                const start = new Date(startDate.value);
                const end = new Date(endDate.value);
                
                // Clear time component for accurate day calculation
                start.setHours(0, 0, 0, 0);
                end.setHours(0, 0, 0, 0);
                
                const diffTime = end.getTime() - start.getTime();
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;

                if (diffDays > 0) {
                    duration.value = `${diffDays} hari`;
                } else {
                    duration.value = '0 hari';
                    if (start > end && endDate.value) {
                        toast.warning('Tanggal selesai harus setelah tanggal mulai!');
                    }
                }
            } else {
                duration.value = '0 hari';
            }
        };

        if (startDate) startDate.addEventListener('change', calculateDuration);
        if (endDate) endDate.addEventListener('change', calculateDuration);

        // Auto-fill employee info
        this.fillEmployeeInfo();
    },

    async fillEmployeeInfo() {
        const currentUser = auth.getCurrentUser();
        if (!currentUser) return;

        const nipEl = document.getElementById('leave-nip');
        const jabatanEl = document.getElementById('leave-jabatan');
        const masaKerjaEl = document.getElementById('leave-masa-kerja');

        if (nipEl) nipEl.value = currentUser.nip || '';
        if (jabatanEl) jabatanEl.value = currentUser.position || '';
        
        if (masaKerjaEl && currentUser.joinDate) {
            // Calculate masa kerja (years/months/days since join date)
            const join = new Date(currentUser.joinDate);
            const now = new Date();
            let years = now.getFullYear() - join.getFullYear();
            let months = now.getMonth() - join.getMonth();
            if (months < 0) {
                years--;
                months += 12;
            }
            masaKerjaEl.value = `${years} thn ${months} bln`;
        }
    },

    async handleSubmit(e) {
        e.preventDefault();

        const type = document.getElementById('leave-type');
        const startDate = document.getElementById('leave-start');
        const endDate = document.getElementById('leave-end');
        const reason = document.getElementById('leave-reason');

        if (!type.value || !startDate.value || !endDate.value || !reason.value) {
            toast.error('Semua field harus diisi!');
            return;
        }

        // Calculate duration
        const start = new Date(startDate.value);
        const end = new Date(endDate.value);
        const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

        if (diffDays <= 0) {
            toast.error('Tanggal selesai harus setelah tanggal mulai!');
            return;
        }

        // Check balance for annual leave
        if (type.value === 'annual' && diffDays > this.leaveBalance) {
            toast.error('Sisa cuti tidak mencukupi!');
            return;
        }

        const typeLabels = {
            annual: 'Cuti Tahunan',
            sick: 'Cuti Sakit',
            important: 'Cuti Penting',
            maternity: 'Cuti Melahirkan',
            other: 'Lainnya'
        };

        const currentUser = auth.getCurrentUser();

        const leaveData = {
            userId: currentUser?.id || 'demo-user',
            employeeName: currentUser?.name || 'User',
            nip: document.getElementById('leave-nip')?.value || '',
            jabatan: document.getElementById('leave-jabatan')?.value || '',
            masaKerja: document.getElementById('leave-masa-kerja')?.value || '',
            type: type.value,
            typeLabel: typeLabels[type.value],
            startDate: startDate.value,
            endDate: endDate.value,
            duration: diffDays,
            alamatCuti: document.getElementById('leave-alamat')?.value || '',
            telpCuti: document.getElementById('leave-telp')?.value || '',
            reason: reason.value
        };

        try {
            const result = await api.submitLeave(leaveData);
            if (result.success) {
                this.leaves.unshift(result.data);

                // Deduct balance for annual leave
                if (type.value === 'annual') {
                    this.leaveBalance -= diffDays;
                    storage.set('leaveBalance', this.leaveBalance);
                    this.updateBalanceDisplay();
                }

                toast.success('Pengajuan cuti berhasil dikirim!');
            } else {
                toast.error(result.error || 'Gagal mengajukan cuti');
            }
        } catch (error) {
            console.error('Error submitting leave:', error);
            toast.error('Terjadi kesalahan');
        }

        // Reset form
        e.target.reset();
        document.getElementById('leave-duration').value = '';

        this.renderLeaveList();
        this.updateStats();
    },

    initFilters() {
        const statusFilter = document.querySelector('.cuti-history-card .select-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.filterStatus = e.target.value === 'Semua Status' ? '' : e.target.value.toLowerCase();
                this.renderLeaveList();
            });
        }
    },

    updateBalanceDisplay() {
        const balanceEl = document.querySelector('.balance-value');
        if (balanceEl) {
            balanceEl.textContent = this.leaveBalance;
        }
    },

    updateStats() {
        const pending = this.leaves.filter(l => l.status === 'pending').length;
        const approved = this.leaves.filter(l => l.status === 'approved').length;
        const rejected = this.leaves.filter(l => l.status === 'rejected').length;

        const statValues = document.querySelectorAll('.leave-stats .stat-value');
        if (statValues.length >= 3) {
            statValues[0].textContent = pending;
            statValues[1].textContent = approved;
            statValues[2].textContent = rejected;
        }
    },

    renderLeaveList() {
        const list = document.getElementById('leave-list');
        if (!list) return;

        // Filter leaves
        let filteredLeaves = this.leaves.filter(l => {
            if (!this.filterStatus) return true;
            if (this.filterStatus === 'menunggu') return l.status === 'pending';
            if (this.filterStatus === 'disetujui') return l.status === 'approved';
            if (this.filterStatus === 'ditolak') return l.status === 'rejected';
            return true;
        });

        if (filteredLeaves.length === 0) {
            list.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: var(--spacing-xl); color: var(--text-muted);">
                    <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: var(--spacing);"></i>
                    <p>${this.filterStatus ? 'Tidak ada pengajuan yang sesuai' : 'Belum ada pengajuan cuti'}</p>
                </div>
            `;
            return;
        }

        // Sort by applied date descending
        const sortedLeaves = filteredLeaves.sort((a, b) =>
            new Date(b.appliedAt) - new Date(a.appliedAt)
        );

        list.innerHTML = sortedLeaves.map(leave => {
            const start = new Date(leave.startDate);
            const end = new Date(leave.endDate);
            const startFormatted = dateTime.formatDate(start, 'short');
            const endFormatted = dateTime.formatDate(end, 'short');

            let dateDisplay = startFormatted;
            if (leave.startDate !== leave.endDate) {
                dateDisplay = `${startFormatted} - ${endFormatted}`;
            }

            const icons = {
                annual: 'fa-umbrella-beach',
                sick: 'fa-heartbeat',
                important: 'fa-home',
                maternity: 'fa-baby',
                other: 'fa-question-circle'
            };

            return `
                <div class="leave-item">
                    <div class="leave-icon">
                        <i class="fas ${icons[leave.type] || 'fa-calendar'}"></i>
                    </div>
                    <div class="leave-content">
                        <div class="leave-header">
                            <h4 class="leave-type">${leave.typeLabel}</h4>
                            <div class="leave-actions-row">
                                <span class="leave-status ${leave.status}">${this.getStatusLabel(leave.status)}</span>
                            </div>
                        </div>
                        <div class="leave-details">
                            <span class="leave-date">
                                <i class="fas fa-calendar"></i>
                                ${dateDisplay} (${leave.duration} hari)
                            </span>
                        </div>
                        <p class="leave-reason">${leave.reason}</p>
                        <button class="btn-export-word-large" onclick="cuti.exportToWord(${leave.id})">
                            <i class="fas fa-file-word"></i>
                            <span>Unduh Dokumen Word</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    getStatusLabel(status) {
        const labels = {
            pending: 'Menunggu',
            approved: 'Disetujui',
            rejected: 'Ditolak'
        };
        return labels[status] || status;
    },

    // Admin functions
    async approveLeave(id) {
        if (!auth.isAdmin()) {
            toast.error('Anda tidak memiliki akses!');
            return;
        }

        try {
            await api.approveLeave(id);
            const leave = this.leaves.find(l => l.id === id);
            if (leave) { leave.status = 'approved'; }
            this.renderLeaveList();
            this.updateStats();
            toast.success('Pengajuan cuti disetujui!');
        } catch (error) {
            console.error('Error approving leave:', error);
        }
    },

    async rejectLeave(id) {
        if (!auth.isAdmin()) {
            toast.error('Anda tidak memiliki akses!');
            return;
        }

        try {
            await api.rejectLeave(id);
            const leave = this.leaves.find(l => l.id === id);
            if (leave) {
                leave.status = 'rejected';

                // Return balance for annual leave
                if (leave.type === 'annual') {
                    this.leaveBalance += leave.duration;
                    storage.set('leaveBalance', this.leaveBalance);
                    this.updateBalanceDisplay();
                }
            }
            this.renderLeaveList();
            this.updateStats();
            toast.info('Pengajuan cuti ditolak!');
        } catch (error) {
            console.error('Error rejecting leave:', error);
        }
    },

    // WORD EXPORT (Matching cuti.jpg)
    async exportToWord(leaveId) {
        const leave = this.leaves.find(l => String(l.id) === String(leaveId));
        if (!leave) return;

        if (typeof loader !== 'undefined') loader.show('Menyiapkan dokumen...');

        try {
            const settingsResult = await api.getSettings();
            const config = settingsResult.data || {};

            const template = this.generateWordTemplate(leave, config);
            
            // Standard Word XML trick to trigger download
            const blob = new Blob(['\ufeff', template], {
                type: 'application/msword'
            });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Form_Cuti_${leave.employeeName || 'Pegawai'}_${leave.id}.doc`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            toast.success('Dokumen berhasil diunduh!');
        } catch (error) {
            console.error('Export error:', error);
            toast.error('Gagal membuat dokumen');
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    generateWordTemplate(leave, config) {
        const today = new Date();
        const todayStr = dateTime.formatDate(today, 'long');
        const startStr = dateTime.formatDate(new Date(leave.startDate), 'long');
        const endStr = dateTime.formatDate(new Date(leave.endDate), 'long');

        // Helper for checked state in tables
        const check = (val, target) => (val === target ? '&#10003;' : '');

        return `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset="utf-8">
            <style>
                @page { size: 215.9mm 330.2mm; margin: 10mm; }
                body { font-family: 'Times New Roman', serif; font-size: 9.5pt; line-height: 0.95; margin: 0; padding: 0; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 3px; }
                th, td { border: 1px solid black; padding: 2px 4px; text-align: left; vertical-align: top; }
                .no-border { border: none !important; }
                .no-border td { border: none !important; padding: 1px; }
                .center { text-align: center; }
                .header-table { border: none; margin-bottom: 5px; }
                .header-table td { border: none; padding: 0; }
                .title { font-weight: bold; text-decoration: underline; margin-bottom: 5px; text-align: center; display: block; font-size: 10pt; }
                .section-title { font-weight: bold; background-color: #f2f2f2; font-size: 9pt; height: 15px; }
                .signature-box { width: 100%; border: none; margin-top: 5px; }
                .signature-box td { border: none; text-align: center; }
                .checkbox-group { display: flex; justify-content: space-between; gap: 10px; }
            </style>
        </head>
        <body>
            <table class="header-table">
                <tr>
                    <td width="55%"></td>
                    <td>
                        Depok, ${todayStr}<br>
                        Kepada<br>
                        Yth. Kasubag UPEP & Kepegawaian<br>
                        Di<br>
                        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Depok
                    </td>
                </tr>
            </table>

            <div class="title">FORMULIR PERMINTAAN DAN PEMBERIAN CUTI</div>

            <table>
                <tr><td colspan="4" class="section-title">I. DATA PEGAWAI</td></tr>
                <tr>
                    <td width="15%">Nama</td><td width="35%">${leave.employeeName || '-'}</td>
                    <td width="15%">NIP</td><td>${leave.nip || '-'}</td>
                </tr>
                <tr>
                    <td>Jabatan</td><td>${leave.jabatan || '-'}</td>
                    <td>Masa Kerja</td><td>${leave.masaKerja || '-'}</td>
                </tr>
                <tr>
                    <td>Unit Kerja</td><td colspan="3">UPEP</td>
                </tr>
            </table>

            <table>
                <tr><td colspan="4" class="section-title">II. JENIS CUTI YANG DIAMBIL **</td></tr>
                <tr>
                    <td width="40%">1. Cuti Tahunan</td><td width="10%" class="center">${check(leave.type, 'annual')}</td>
                    <td width="40%">2. Cuti Besar</td><td width="10%" class="center">${check(leave.type, 'large')}</td>
                </tr>
                <tr>
                    <td>3. Cuti Sakit</td><td class="center">${check(leave.type, 'sick')}</td>
                    <td>4. Cuti Melahirkan</td><td class="center">${check(leave.type, 'maternity')}</td>
                </tr>
                <tr>
                    <td>5. Cuti Karena Alasan Penting</td><td class="center">${check(leave.type, 'important')}</td>
                    <td>6. Cuti di Luar Tanggungan Negara</td><td class="center">${check(leave.type, 'other')}</td>
                </tr>
            </table>

            <table>
                <tr><td class="section-title">III. ALASAN CUTI</td></tr>
                <tr><td style="height: 40px;">${leave.reason || ''}</td></tr>
            </table>

            <table>
                <tr><td colspan="6" class="section-title">IV. LAMANYA CUTI</td></tr>
                <tr>
                    <td width="10%">Selama</td><td width="15%" class="center">${leave.duration} hari</td>
                    <td width="15%">Mulai tanggal</td><td width="20%" class="center">${startStr}</td>
                    <td width="10%">s/d</td><td width="30%" class="center">${endStr}</td>
                </tr>
            </table>

            <table>
                <tr><td colspan="5" class="section-title">V. CATATAN CUTI ***</td></tr>
                <tr>
                    <td width="40%" colspan="3">1. CUTI TAHUNAN</td>
                    <td colspan="2">2. CUTI BESAR</td>
                </tr>
                <tr>
                    <td width="10%">Tahun</td><td width="10%">Sisa</td><td width="20%">Keterangan</td>
                    <td colspan="2" rowspan="4"></td>
                </tr>
                <tr><td>N-2</td><td>-</td><td></td></tr>
                <tr><td>N-1</td><td>-</td><td></td></tr>
                <tr><td>N</td><td>-</td><td></td></tr>
            </table>

            <table>
                <tr><td colspan="2" class="section-title">VI. ALAMAT SELAMA MENJALANKAN CUTI</td></tr>
                <tr>
                    <td width="60%" style="height: 60px;">
                        ${leave.alamatCuti || ''}
                    </td>
                    <td width="40%">
                        TELP: ${leave.telpCuti || ''}<br><br>
                        Hormat saya,<br><br><br>
                        <b>${leave.employeeName || ''}</b>
                    </td>
                </tr>
            </table>

            <table>
                <tr><td class="section-title">VII. PERTIMBANGAN ATASAN LANGSUNG**</td></tr>
                <tr>
                    <td>
                        <table class="no-border" style="width: 100%;">
                            <tr>
                                <td width="25%">[ &nbsp; ] DISETUJUI</td>
                                <td width="25%">[ &nbsp; ] PERUBAHAN****</td>
                                <td width="25%">[ &nbsp; ] DITANGGUHKAN****</td>
                                <td width="25%">[ &nbsp; ] TIDAK DISETUJUI****</td>
                            </tr>
                        </table>
                        <div style="text-align: right; padding-right: 20px; margin-top: 30px;">
                            Kasubag UPEP & Kepegawaian<br><br><br>
                            <b><u>${config.signature_kasubag_name || '...'}</u></b><br>
                            NIP. ${config.signature_kasubag_nip || '...'}
                        </div>
                    </td>
                </tr>
            </table>

            <table>
                <tr><td class="section-title">VIII. KEPUTUSAN PEJABAT YANG BERWENANG MEMBERIKAN CUTI**</td></tr>
                <tr>
                    <td>
                        <table class="no-border" style="width: 100%;">
                            <tr>
                                <td width="25%">[ &nbsp; ] DISETUJUI</td>
                                <td width="25%">[ &nbsp; ] PERUBAHAN****</td>
                                <td width="25%">[ &nbsp; ] DITANGGUHKAN****</td>
                                <td width="25%">[ &nbsp; ] TIDAK DISETUJUI****</td>
                            </tr>
                        </table>
                        <div style="text-align: right; padding-right: 20px; margin-top: 30px;">
                            <b>CAMAT CINERE</b><br><br><br>
                            <b><u>${config.signature_camat_name || '...'}</u></b><br>
                            NIP. ${config.signature_camat_nip || '...'}
                        </div>
                    </td>
                </tr>
            </table>

            <div style="font-size: 8pt; margin-top: 5px;">
                Catatan:<br>
                * Coret yang tidak perlu<br>
                ** Pilih salah satu dengan memberi tanda centang (v)<br>
                *** diisi oleh pejabat yang menangani bidang kepegawaian sebelum PNS mengajukan cuti<br>
                **** diberi tanda centang dan alasannya.
            </div>
        </body>
        </html>`;
    }
};

// Global init function
window.initCuti = () => {
    cuti.init();
};

// Expose cuti object
window.cuti = cuti;
