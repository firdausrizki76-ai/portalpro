/**
 * Portal Karyawan - Izin/Sakit
 * Leave permission functionality with face recognition
 */

const izin = {
    izinData: [],
    currentFile: null,
    verifiedData: null,
    filterStatus: '',

    async init() {
        if (typeof loader !== 'undefined') loader.show('Memuat data izin...');
        try {
            await this.loadIzinData();
            this.initForm();
            this.initFilters();
            this.renderIzinList();
            this.updateStats();

            // Set default date to today
            const dateInput = document.getElementById('izin-date');
            if (dateInput) {
                dateInput.valueAsDate = new Date();
            }

            // Auto-fill employee info
            this.fillEmployeeInfo();
        } catch (error) {
            console.error('Izin init error:', error);
            toast.error('Gagal memuat data izin');
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    async loadIzinData(forceRefresh = false) {
        const currentUser = auth.getCurrentUser();
        const userId = currentUser?.id || 'demo-user';
        const cacheKey = `izin_cache_${userId}`;

        if (!forceRefresh) {
            const cached = storage.get(cacheKey);
            if (cached) {
                this.izinData = cached;
                this._backgroundRefresh(userId, cacheKey);
                return;
            }
        }

        try {
            const result = auth.isAdmin() ? await api.getAllIzin() : await api.getIzin(userId);
            this.izinData = result.data || [];
            storage.set(cacheKey, this.izinData);
        } catch (error) {
            console.error('Error loading izin:', error);
            this.izinData = storage.get(cacheKey, []);
        }
    },

    async _backgroundRefresh(userId, cacheKey) {
        try {
            const result = auth.isAdmin() ? await api.getAllIzin() : await api.getIzin(userId);
            if (result.success) {
                this.izinData = result.data || [];
                storage.set(cacheKey, this.izinData);
                this.renderIzinList();
                this.updateStats();
            }
        } catch (e) {
            console.warn('Izin background refresh failed', e);
        }
    },

    initForm() {
        const form = document.getElementById('izin-form');
        const fileInput = document.getElementById('izin-document');
        const fileUpload = document.getElementById('file-upload');

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitIzinDirectly();
            });
        }

        // File upload handling
        if (fileUpload && fileInput) {
            fileUpload.addEventListener('click', () => fileInput.click());

            fileUpload.addEventListener('dragover', (e) => {
                e.preventDefault();
                fileUpload.classList.add('dragover');
            });

            fileUpload.addEventListener('dragleave', () => {
                fileUpload.classList.remove('dragover');
            });

            fileUpload.addEventListener('drop', (e) => {
                e.preventDefault();
                fileUpload.classList.remove('dragover');
                if (e.dataTransfer.files.length) {
                    this.handleFile(e.dataTransfer.files[0]);
                }
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length) {
                    this.handleFile(e.target.files[0]);
                }
            });
        }

        // Remove file button
        const removeBtn = document.querySelector('.btn-remove-file');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeFile();
            });
        }

        this.initFilters();
    },

    async fillEmployeeInfo() {
        const currentUser = auth.getCurrentUser();
        if (!currentUser) return;

        const nipEl = document.getElementById('izin-nip');
        const jabatanEl = document.getElementById('izin-jabatan');
        const masaKerjaEl = document.getElementById('izin-masa-kerja');

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

    initFilters() {
        // Status filter for izin history
        const statusFilter = document.querySelector('.izin-history-card .select-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.filterStatus = e.target.value === 'Semua Status' ? '' : e.target.value.toLowerCase();
                this.renderIzinList();
            });
        }
    },

    handleFile(file) {
        const maxSize = 5 * 1024 * 1024; // 5MB
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

        if (file.size > maxSize) {
            toast.error('File terlalu besar. Maksimum 5MB');
            return;
        }

        if (!allowedTypes.includes(file.type)) {
            toast.error('Format file tidak didukung. Gunakan PDF, JPG, atau PNG');
            return;
        }

        this.currentFile = file;

        // Update UI
        const uploadArea = document.querySelector('.upload-area');
        const filePreview = document.getElementById('file-preview');
        const filename = filePreview?.querySelector('.filename');

        if (uploadArea) uploadArea.style.display = 'none';
        if (filePreview) filePreview.style.display = 'flex';
        if (filename) filename.textContent = file.name;
    },

    removeFile() {
        this.currentFile = null;

        const uploadArea = document.querySelector('.upload-area');
        const filePreview = document.getElementById('file-preview');
        const fileInput = document.getElementById('izin-document');

        if (uploadArea) uploadArea.style.display = 'block';
        if (filePreview) filePreview.style.display = 'none';
        if (fileInput) fileInput.value = '';
    },

    async submitIzinDirectly() {
        const type = document.getElementById('izin-type')?.value;
        const date = document.getElementById('izin-date')?.value;
        const duration = document.getElementById('izin-duration')?.value;
        const reason = document.getElementById('izin-reason')?.value;

        if (!type || !date || !duration || !reason) {
            toast.error('Harap isi semua field yang wajib diisi!');
            return;
        }

        if (typeof loader !== 'undefined') loader.show('Mengirim pengajuan izin...');

        const typeLabels = {
            'sick': 'Sakit',
            'permission': 'Izin Penting',
            'emergency': 'Keadaan Darurat'
        };

        const currentUser = auth.getCurrentUser();

        const izinEntry = {
            userId: currentUser?.id || 'demo-user',
            employeeName: currentUser?.name || 'User',
            type,
            typeLabel: typeLabels[type] || type,
            date,
            duration: parseInt(duration),
            reason,
            nip: document.getElementById('izin-nip')?.value || '',
            jabatan: document.getElementById('izin-jabatan')?.value || '',
            masaKerja: document.getElementById('izin-masa-kerja')?.value || '',
            alamatIzin: document.getElementById('izin-alamat')?.value || '',
            telpIzin: document.getElementById('izin-telp')?.value || '',
            hasAttachment: !!this.currentFile,
            verificationPhoto: '',
            verificationLocation: '',
            verificationTimestamp: new Date().toISOString()
        };

        try {
            const result = await api.submitIzin(izinEntry);
            if (result.success) {
                this.izinData.unshift(result.data);
                toast.success('Pengajuan izin berhasil dikirim!');
                
                // Reset form
                const form = document.getElementById('izin-form');
                if (form) form.reset();
                this.removeFile();

                this.renderIzinList();
                this.updateStats();
            }
        } catch (error) {
            console.error('Error submitting izin:', error);
            toast.error('Gagal mengirim pengajuan');
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    updateStats() {
        const pending = this.izinData.filter(i => i.status === 'pending').length;
        const approved = this.izinData.filter(i => i.status === 'approved').length;
        const rejected = this.izinData.filter(i => i.status === 'rejected').length;

        const pendingEl = document.getElementById('izin-pending-count');
        const approvedEl = document.getElementById('izin-approved-count');
        const rejectedEl = document.getElementById('izin-rejected-count');

        if (pendingEl) pendingEl.textContent = pending;
        if (approvedEl) approvedEl.textContent = approved;
        if (rejectedEl) rejectedEl.textContent = rejected;
    },

    renderIzinList() {
        const list = document.getElementById('izin-list');
        if (!list) return;

        // Filter izin data
        let filteredData = this.izinData.filter(i => {
            if (!this.filterStatus) return true;
            if (this.filterStatus === 'menunggu') return i.status === 'pending';
            if (this.filterStatus === 'disetujui') return i.status === 'approved';
            if (this.filterStatus === 'ditolak') return i.status === 'rejected';
            return true;
        });

        if (filteredData.length === 0) {
            list.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: var(--spacing-xl); color: var(--text-muted);">
                    <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: var(--spacing);"></i>
                    <p>${this.filterStatus ? 'Tidak ada pengajuan yang sesuai' : 'Belum ada pengajuan izin'}</p>
                </div>
            `;
            return;
        }

        // Sort by date descending
        const sortedData = filteredData.sort((a, b) =>
            new Date(b.appliedAt || 0) - new Date(a.appliedAt || 0)
        );

        list.innerHTML = sortedData.map(izin => {
            const date = new Date(izin.date);
            const dateFormatted = dateTime.formatDate(date, 'short');

            const icons = {
                'sick': 'fa-heartbeat',
                'permission': 'fa-hand-paper',
                'emergency': 'fa-exclamation-triangle'
            };

            return `
                <div class="izin-item">
                    <div class="izin-icon ${izin.type}">
                        <i class="fas ${icons[izin.type] || 'fa-file'}"></i>
                    </div>
                    <div class="izin-content">
                        <div class="izin-header-row">
                            <h4 class="izin-type">${izin.typeLabel}</h4>
                            <div class="izin-actions-row">
                                <span class="izin-status ${izin.status}">${this.getStatusLabel(izin.status)}</span>
                            </div>
                        </div>
                        <div class="izin-details">
                            <span class="izin-date">
                                <i class="fas fa-calendar"></i>
                                ${dateFormatted} (${izin.duration} hari)
                            </span>
                        </div>
                        <p class="izin-reason">${izin.reason}</p>
                        <div class="izin-footer-actions">
                            <button class="btn-export-word-large" onclick="izin.exportToWord(${izin.id})">
                                <i class="fas fa-file-word"></i>
                                <span>Unduh Dokumen Word</span>
                            </button>
                            ${izin.hasAttachment ? `
                                <span class="izin-attachment">
                                    <i class="fas fa-paperclip"></i>
                                    Lampiran tersedia
                                </span>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    getStatusLabel(status) {
        const labels = {
            'pending': 'Menunggu',
            'approved': 'Disetujui',
            'rejected': 'Ditolak'
        };
        return labels[status] || status;
    },

    // Admin functions
    async approveIzin(id) {
        if (!auth.isAdmin()) return;

        try {
            await api.approveIzin(id);
            const izin = this.izinData.find(i => i.id === id);
            if (izin) { izin.status = 'approved'; }
            this.renderIzinList();
            this.updateStats();
            toast.success('Pengajuan izin disetujui');
        } catch (error) {
            console.error('Error approving izin:', error);
        }
    },

    async rejectIzin(id) {
        if (!auth.isAdmin()) return;

        try {
            await api.rejectIzin(id);
            const izin = this.izinData.find(i => i.id === id);
            if (izin) { izin.status = 'rejected'; }
            this.renderIzinList();
            this.updateStats();
            toast.info('Pengajuan izin ditolak');
        } catch (error) {
            console.error('Error rejecting izin:', error);
            toast.error('Kesalahan sistem');
        }
    },

    // WORD EXPORT (Matching official form)
    async exportToWord(izinId) {
        const item = this.izinData.find(i => String(i.id) === String(izinId));
        if (!item) return;

        if (typeof loader !== 'undefined') loader.show('Menyiapkan dokumen...');

        try {
            const settingsResult = await api.getSettings();
            const config = settingsResult.data || {};

            const template = this.generateWordTemplate(item, config);
            
            const blob = new Blob(['\ufeff', template], {
                type: 'application/msword'
            });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Form_Izin_${item.employeeName || 'Pegawai'}_${item.id}.doc`;
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
        
        // Ensure date is a valid Date object
        const itemDate = new Date(item.date);
        const startStr = dateTime.formatDate(itemDate, 'long');
        
        // Calculate end date based on duration
        const endDate = new Date(itemDate);
        endDate.setDate(endDate.getDate() + (parseInt(item.duration) || 1) - 1);
        const endStr = dateTime.formatDate(endDate, 'long');

        const check = (val, target) => (val === target ? '&#10003;' : '');
        
        // Map Izin types to Cuti categories for the official form
        // Izin type in app: sick, permission, emergency
        // Official Form: 1. Tahunan, 2. Besar, 3. Sakit, 4. Melahirkan, 5. Alasan Penting, 6. Luar Tanggungan
        const mappedType = {
            'sick': 'sick',
            'permission': 'important',
            'emergency': 'important' // Emergency mapped to Important
        }[item.type] || 'important';

        return `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset="utf-8">
            <style>
                @page { size: 8.5in 13in; margin: 15mm; }
                body { font-family: 'Times New Roman', serif; font-size: 10pt; line-height: 1.1; margin: 0; padding: 0; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 3px; }
                th, td { border: 1px solid black; padding: 2px 4px; text-align: left; vertical-align: top; }
                .no-border { border: none !important; }
                .no-border td { border: none !important; padding: 1px; }
                .center { text-align: center; }
                .header-table { border: none; margin-bottom: 5px; }
                .header-table td { border: none; padding: 0; }
                .title { font-weight: bold; text-decoration: underline; margin-bottom: 5px; text-align: center; display: block; font-size: 11pt; }
                .section-title { font-weight: bold; background-color: #f2f2f2; font-size: 9pt; }
                .signature-box { width: 100%; border: none; margin-top: 5px; }
                .signature-box td { border: none; text-align: center; }
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

            <div class="title">FORMULIR PERMINTAAN DAN PEMBERIAN IZIN/CUTI</div>

            <table>
                <tr><td colspan="4" class="section-title">I. DATA PEGAWAI</td></tr>
                <tr>
                    <td width="15%">Nama</td><td width="35%">${item.employeeName || '-'}</td>
                    <td width="15%">NIP</td><td>${item.nip || '-'}</td>
                </tr>
                <tr>
                    <td>Jabatan</td><td>${item.jabatan || '-'}</td>
                    <td>Masa Kerja</td><td>${item.masaKerja || '-'}</td>
                </tr>
                <tr>
                    <td>Unit Kerja</td><td colspan="3">UPEP</td>
                </tr>
            </table>

            <table>
                <tr><td colspan="4" class="section-title">II. JENIS IZIN/CUTI YANG DIAMBIL **</td></tr>
                <tr>
                    <td width="40%">1. Cuti Tahunan</td><td width="10%" class="center">${check(mappedType, 'annual')}</td>
                    <td width="40%">2. Cuti Besar</td><td width="10%" class="center">${check(mappedType, 'large')}</td>
                </tr>
                <tr>
                    <td>3. Cuti Sakit</td><td class="center">${check(mappedType, 'sick')}</td>
                    <td>4. Cuti Melahirkan</td><td class="center">${check(mappedType, 'maternity')}</td>
                </tr>
                <tr>
                    <td>5. Cuti Karena Alasan Penting</td><td class="center">${check(mappedType, 'important')}</td>
                    <td>6. Cuti di Luar Tanggungan Negara</td><td class="center">${check(mappedType, 'other')}</td>
                </tr>
            </table>

            <table>
                <tr><td class="section-title">III. ALASAN IZIN/CUTI</td></tr>
                <tr><td style="height: 40px;">${item.reason || ''}</td></tr>
            </table>

            <table>
                <tr><td colspan="6" class="section-title">IV. LAMANYA IZIN/CUTI</td></tr>
                <tr>
                    <td width="10%">Selama</td><td width="15%" class="center">${item.duration} hari</td>
                    <td width="15%">Mulai tanggal</td><td width="20%" class="center">${startStr}</td>
                    <td width="10%">s/d</td><td width="30%" class="center">${endStr}</td>
                </tr>
            </table>

            <table>
                <tr><td colspan="5" class="section-title">V. ALAMAT SELAMA MENJALANKAN IZIN/CUTI</td></tr>
                <tr>
                    <td width="60%" style="height: 60px;">
                        ${item.alamatIzin || ''}
                    </td>
                    <td width="40%">
                        TELP: ${item.telpIzin || ''}<br><br>
                        Hormat saya,<br><br><br>
                        <b>${item.employeeName || ''}</b>
                    </td>
                </tr>
            </table>

            <table>
                <tr><td class="section-title">VI. PERTIMBANGAN ATASAN LANGSUNG**</td></tr>
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
                <tr><td class="section-title">VII. KEPUTUSAN PEJABAT YANG BERWENANG MEMBERIKAN IZIN/CUTI**</td></tr>
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
                *** diisi oleh pejabat yang menangani bidang kepegawaian sebelum PNS mengajukan izin/cuti<br>
                **** diberi tanda centang dan alasannya.
            </div>
        </body>
        </html>`;
    }
};

// Global init function
window.initIzin = () => {
    izin.init();
};

// Expose
window.izin = izin;
