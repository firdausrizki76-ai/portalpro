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
            if (startDate && startDate.value && endDate && endDate.value) {
                const start = new Date(startDate.value);
                const end = new Date(endDate.value);
                
                // Clear time component for accurate day calculation
                start.setHours(0, 0, 0, 0);
                end.setHours(0, 0, 0, 0);
                
                const diffTime = end.getTime() - start.getTime();
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;

                if (diffDays > 0) {
                    if (duration) duration.value = `${diffDays} hari`;
                } else {
                    if (duration) duration.value = '0 hari';
                    if (start > end && endDate.value) {
                        toast.warning('Tanggal selesai harus setelah tanggal mulai!');
                    }
                }
            } else {
                if (duration) duration.value = '0 hari';
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

        if (!type || !type.value || !startDate || !startDate.value || !endDate || !endDate.value || !reason || !reason.value) {
            toast.error('Semua field harus diisi!');
            return;
        }

        const start = new Date(startDate.value);
        const end = new Date(endDate.value);
        const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

        if (diffDays <= 0) {
            toast.error('Tanggal selesai harus setelah tanggal mulai!');
            return;
        }

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

        e.target.reset();
        const durationEl = document.getElementById('leave-duration');
        if (durationEl) durationEl.value = '';

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

        const sortedLeaves = filteredLeaves.sort((a, b) =>
            new Date(b.appliedAt || 0) - new Date(a.appliedAt || 0)
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

    async exportToWord(cutiId) {
        const item = this.leaves.find(c => String(c.id) === String(cutiId));
        if (!item) return;

        if (typeof loader !== 'undefined') loader.show('Menyiapkan dokumen...');

        try {
            const settingsResult = await api.getSettings();
            const config = settingsResult.data || {};

            const template = this.generateWordTemplate(item, config);
            
            const blob = new Blob([template], {
                type: 'application/msword'
            });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Form_Cuti_${item.employeeName || 'Pegawai'}.doc`;
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

    generateWordTemplate(item, config) {
        const today = new Date();
        const todayStr = dateTime.formatDate(today, 'long');
        const startDate = new Date(item.startDate);
        const startStr = dateTime.formatDate(startDate, 'long');
        const endDate = new Date(item.endDate);
        const endStr = dateTime.formatDate(endDate, 'long');

        const check = (val, target) => (val === target ? '&#10003;' : '');

        return `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset="utf-8">
            <!--[if gte mso 9]>
            <xml>
                <w:WordDocument>
                    <w:View>Print</w:View>
                    <w:Zoom>100</w:Zoom>
                    <w:DoNotOptimizeForBrowser/>
                </w:WordDocument>
            </xml>
            <![endif]-->
            <style>
                @page Section1 {
                    size: 8.5in 13.0in;
                    margin: 1.0in 0.75in 1.0in 0.75in;
                    mso-header-margin: .5in;
                    mso-footer-margin: .5in;
                    mso-paper-source: 0;
                }
                div.Section1 { page: Section1; }
                body { font-family: 'Times New Roman', serif; font-size: 10.5pt; color: black; background: white; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 5px; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
                td { border: 1px solid black; padding: 4px; vertical-align: top; mso-border-alt: solid windowtext .5pt; }
                .no-border { border: none !important; }
                .no-border td { border: none !important; padding: 1px; mso-border-alt: none; }
                .center { text-align: center; }
                .header-table { border: none; margin-bottom: 10px; }
                .header-table td { border: none; }
                .title { font-weight: bold; text-decoration: underline; text-align: center; font-size: 12pt; margin-bottom: 10px; }
                .section-title { font-weight: bold; background-color: #f2f2f2; font-size: 10pt; }
                p.MsoNormal { margin: 0; padding: 0; line-height: normal; }
            </style>
        </head>
        <body>
            <div class="Section1">
            <table class="header-table">
                <tr>
                    <td width="55%"></td>
                    <td>
                        <p class="MsoNormal">Depok, ${todayStr}</p>
                        <p class="MsoNormal">Kepada</p>
                        <p class="MsoNormal">Yth. Kasubag UPEP & Kepegawaian</p>
                        <p class="MsoNormal">Di</p>
                        <p class="MsoNormal">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Depok</p>
                    </td>
                </tr>
            </table>

            <p class="title">FORMULIR PERMINTAAN DAN PEMBERIAN CUTI</p>

            <table>
                <tr><td colspan="4" class="section-title"><p class="MsoNormal">I. DATA PEGAWAI</p></td></tr>
                <tr>
                    <td width="15%"><p class="MsoNormal">Nama</p></td><td width="35%"><p class="MsoNormal">${item.employeeName || '-'}</p></td>
                    <td width="15%"><p class="MsoNormal">NIP</p></td><td><p class="MsoNormal">${item.nip || '-'}</p></td>
                </tr>
                <tr>
                    <td><p class="MsoNormal">Jabatan</p></td><td><p class="MsoNormal">${item.jabatan || '-'}</p></td>
                    <td><p class="MsoNormal">Masa Kerja</p></td><td><p class="MsoNormal">${item.masaKerja || '-'}</p></td>
                </tr>
                <tr>
                    <td><p class="MsoNormal">Unit Kerja</p></td><td colspan="3"><p class="MsoNormal">UPEP</p></td>
                </tr>
            </table>

            <table>
                <tr><td colspan="4" class="section-title"><p class="MsoNormal">II. JENIS CUTI YANG DIAMBIL **</p></td></tr>
                <tr>
                    <td width="40%"><p class="MsoNormal">1. Cuti Tahunan</p></td><td width="10%" class="center"><p class="MsoNormal">${check(item.type, 'annual')}</p></td>
                    <td width="40%"><p class="MsoNormal">2. Cuti Besar</p></td><td width="10%" class="center"><p class="MsoNormal">${check(item.type, 'large')}</p></td>
                </tr>
                <tr>
                    <td><p class="MsoNormal">3. Cuti Sakit</p></td><td class="center"><p class="MsoNormal">${check(item.type, 'sick')}</p></td>
                    <td><p class="MsoNormal">4. Cuti Melahirkan</p></td><td class="center"><p class="MsoNormal">${check(item.type, 'maternity')}</p></td>
                </tr>
                <tr>
                    <td><p class="MsoNormal">5. Cuti Karena Alasan Penting</p></td><td class="center"><p class="MsoNormal">${check(item.type, 'important')}</p></td>
                    <td><p class="MsoNormal">6. Cuti di Luar Tanggungan Negara</p></td><td class="center"><p class="MsoNormal">${check(item.type, 'other')}</p></td>
                </tr>
            </table>

            <table>
                <tr><td class="section-title"><p class="MsoNormal">III. ALASAN CUTI</p></td></tr>
                <tr><td style="height: 40px;"><p class="MsoNormal">${item.reason || ''}</p></td></tr>
            </table>

            <table>
                <tr><td colspan="6" class="section-title"><p class="MsoNormal">IV. LAMANYA CUTI</p></td></tr>
                <tr>
                    <td width="10%"><p class="MsoNormal">Selama</p></td><td width="15%" class="center"><p class="MsoNormal">${item.duration} hari</p></td>
                    <td width="15%"><p class="MsoNormal">Mulai tgl</p></td><td width="20%" class="center"><p class="MsoNormal">${startStr}</p></td>
                    <td width="5%"><p class="MsoNormal">s/d</p></td><td width="35%" class="center"><p class="MsoNormal">${endStr}</p></td>
                </tr>
            </table>

            <table>
                <tr><td colspan="5" class="section-title"><p class="MsoNormal">V. ALAMAT SELAMA MENJALANKAN CUTI</p></td></tr>
                <tr>
                    <td width="60%" style="height: 60px;"><p class="MsoNormal">${item.address || ''}</p></td>
                    <td width="40%">
                        <p class="MsoNormal">TELP: ${item.phone || ''}</p>
                        <p class="MsoNormal">Hormat saya,</p>
                        <p class="MsoNormal"><br><br></p>
                        <p class="MsoNormal"><b>${item.employeeName || ''}</b></p>
                    </td>
                </tr>
            </table>

            <table>
                <tr><td class="section-title"><p class="MsoNormal">VI. PERTIMBANGAN ATASAN LANGSUNG**</p></td></tr>
                <tr>
                    <td>
                        <p class="MsoNormal">&nbsp;</p>
                        <div style="text-align: right; padding-right: 20px;">
                            <p class="MsoNormal">Kasubag UPEP & Kepegawaian</p>
                            <p class="MsoNormal"><br><br></p>
                            <p class="MsoNormal"><b><u>${config.signature_kasubag_name || '...'}</u></b></p>
                            <p class="MsoNormal">NIP. ${config.signature_kasubag_nip || '...'}</p>
                        </div>
                    </td>
                </tr>
            </table>

            <table>
                <tr><td class="section-title"><p class="MsoNormal">VII. KEPUTUSAN PEJABAT YANG BERWENANG**</p></td></tr>
                <tr>
                    <td>
                        <p class="MsoNormal">&nbsp;</p>
                        <div style="text-align: right; padding-right: 20px;">
                            <p class="MsoNormal"><b>CAMAT CINERE</b></p>
                            <p class="MsoNormal"><br><br></p>
                            <p class="MsoNormal"><b><u>${config.signature_camat_name || '...'}</u></b></p>
                            <p class="MsoNormal">NIP. ${config.signature_camat_nip || '...'}</p>
                        </div>
                    </td>
                </tr>
            </table>

            <p class="MsoNormal" style="font-size: 8.5pt; margin-top: 10px;">
                Catatan:<br>
                * Coret yang tidak perlu | ** Beri tanda centang (v)<br>
                *** Diisi pejabat kepegawaian | **** Diberi tanda centang dan alasannya.
            </p>
            </div>
        </body>
        </html>\`;
    }
};

window.initCuti = () => {
    cuti.init();
};

window.cuti = cuti;
