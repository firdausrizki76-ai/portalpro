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
            const dateObj = new Date(izin.date);
            const isValid = !isNaN(dateObj.getTime());
            const dateFormatted = isValid ? dateTime.formatDate(dateObj, 'short') : '-';

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
            
            // Standard Blob without BOM for better Word compatibility
            const blob = new Blob([template], {
                type: 'application/msword'
            });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Form_Izin_${item.employeeName || 'Pegawai'}.doc`;
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
        const itemDate = new Date(item.date);
        const startStr = dateTime.formatDate(itemDate, 'long');
        const endDate = new Date(itemDate);
        endDate.setDate(endDate.getDate() + (parseInt(item.duration) || 1) - 1);
        const endStr = dateTime.formatDate(endDate, 'long');

        const check = (val, target) => (val === target ? '&#10003;' : '');
        
        const mappedType = {
            'sick': 'sick',
            'permission': 'important',
            'emergency': 'important'
        }[item.type] || 'important';

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
                .no-border td { border: none; padding: 1px; mso-border-alt: none; }
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

            <p class="title">FORMULIR PERMINTAAN DAN PEMBERIAN IZIN/CUTI</p>

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
                <tr><td colspan="4" class="section-title"><p class="MsoNormal">II. JENIS IZIN/CUTI YANG DIAMBIL **</p></td></tr>
                <tr>
                    <td width="40%"><p class="MsoNormal">1. Cuti Tahunan</p></td><td width="10%" class="center"><p class="MsoNormal">${check(mappedType, 'annual')}</p></td>
                    <td width="40%"><p class="MsoNormal">2. Cuti Besar</p></td><td width="10%" class="center"><p class="MsoNormal">${check(mappedType, 'large')}</p></td>
                </tr>
                <tr>
                    <td><p class="MsoNormal">3. Cuti Sakit</p></td><td class="center"><p class="MsoNormal">${check(mappedType, 'sick')}</p></td>
                    <td><p class="MsoNormal">4. Cuti Melahirkan</p></td><td class="center"><p class="MsoNormal">${check(mappedType, 'maternity')}</p></td>
                </tr>
                <tr>
                    <td><p class="MsoNormal">5. Cuti Karena Alasan Penting</p></td><td class="center"><p class="MsoNormal">${check(mappedType, 'important')}</p></td>
                    <td><p class="MsoNormal">6. Cuti di Luar Tanggungan Negara</p></td><td class="center"><p class="MsoNormal">${check(mappedType, 'other')}</p></td>
                </tr>
            </table>

            <table>
                <tr><td class="section-title"><p class="MsoNormal">III. ALASAN IZIN/CUTI</p></td></tr>
                <tr><td style="height: 40px;"><p class="MsoNormal">${item.reason || ''}</p></td></tr>
            </table>

            <table>
                <tr><td colspan="6" class="section-title"><p class="MsoNormal">IV. LAMANYA IZIN/CUTI</p></td></tr>
                <tr>
                    <td width="10%"><p class="MsoNormal">Selama</p></td><td width="15%" class="center"><p class="MsoNormal">${item.duration} hari</p></td>
                    <td width="15%"><p class="MsoNormal">Mulai tgl</p></td><td width="20%" class="center"><p class="MsoNormal">${startStr}</p></td>
                    <td width="5%"><p class="MsoNormal">s/d</p></td><td width="35%" class="center"><p class="MsoNormal">${endStr}</p></td>
                </tr>
            </table>

            <table>
                <tr><td colspan="5" class="section-title"><p class="MsoNormal">V. ALAMAT SELAMA MENJALANKAN IZIN/CUTI</p></td></tr>
                <tr>
                    <td width="60%" style="height: 60px;"><p class="MsoNormal">${item.alamatIzin || ''}</p></td>
                    <td width="40%">
                        <p class="MsoNormal">TELP: ${item.telpIzin || ''}</p>
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
        </html>`;
    }
};

window.initIzin = () => {
    izin.init();
};

window.izin = izin;
