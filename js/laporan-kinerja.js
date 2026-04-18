/**
 * Portal Karyawan - Laporan Kinerja
 * Daily work performance report functionality
 */

const jurnal = {
    currentDate: new Date(),
    jurnals: [],
    filter: '',
    sort: 'newest',
    currentPhoto: null,

    async init() {
        try {
            await this.loadJurnals();
            this.initDateSelector();
            this.initForm();
            this.initFilters();
            this.initPhotoUpload();
            this.renderJurnalList();
            this.updateUI();
            
            // Initial summary recalculation
            setTimeout(() => this.updateSummary(), 1000);
        } catch (error) {
            console.error('Jurnal init error:', error);
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    async loadJurnals() {
        const currentUser = auth.getCurrentUser();
        const userId = currentUser?.id || 'demo-user';
        try {
            const result = await api.getJournals(userId);
            this.jurnals = result.data || [];
        } catch (error) {
            console.error('Error loading journals:', error);
            this.jurnals = storage.get('jurnals', []);
        }
    },

    initDateSelector() {
        const prevBtn = document.getElementById('prev-date');
        const nextBtn = document.getElementById('next-date');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.changeDate(-1));
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.changeDate(1));
        }
    },

    changeDate(direction) {
        this.currentDate.setDate(this.currentDate.getDate() + direction);
        this.updateUI();
    },

    initForm() {
        const form = document.getElementById('jurnal-form');
        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmit(e));
        }
    },

    initFilters() {
        // Search filter
        const searchInput = document.querySelector('.jurnal-history-card .search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filter = e.target.value.toLowerCase();
                this.renderJurnalList();
            });
        }

        // Sort filter
        const sortSelect = document.querySelector('.jurnal-history-card .select-filter');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.sort = e.target.value === 'Terbaru' ? 'newest' : 'oldest';
                this.renderJurnalList();
            });
        }
    },

    initPhotoUpload() {
        const fileInput = document.getElementById('jurnal-photo');
        const uploadArea = document.getElementById('jurnal-upload-area');
        const filePreview = document.getElementById('jurnal-file-preview');
        const imagePreview = document.getElementById('jurnal-image-preview');
        const removeBtn = document.getElementById('jurnal-btn-remove-file');

        if (!fileInput || !uploadArea) return;

        // Click to upload
        uploadArea.addEventListener('click', () => fileInput.click());

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                this.handlePhoto(e.dataTransfer.files[0]);
            }
        });

        // File selected
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                this.handlePhoto(e.target.files[0]);
            }
        });

        // Remove photo
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removePhoto();
            });
        }
    },

    handlePhoto(file) {
        const maxSize = 5 * 1024 * 1024; // 5MB
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];

        if (file.size > maxSize) {
            toast.error('Foto terlalu besar. Maksimum 5MB');
            return;
        }

        if (!allowedTypes.includes(file.type)) {
            toast.error('Format file tidak didukung. Gunakan JPG atau PNG');
            return;
        }

        // Convert to base64
        const reader = new FileReader();
        reader.onload = (e) => {
            this.currentPhoto = e.target.result;
            this.showPhotoPreview();
        };
        reader.readAsDataURL(file);
    },

    showPhotoPreview() {
        const uploadArea = document.getElementById('jurnal-upload-area');
        const filePreview = document.getElementById('jurnal-file-preview');
        const imagePreview = document.getElementById('jurnal-image-preview');

        if (uploadArea) uploadArea.style.display = 'none';
        if (filePreview) filePreview.style.display = 'block';
        if (imagePreview) imagePreview.src = this.currentPhoto;
    },

    removePhoto() {
        this.currentPhoto = null;
        const fileInput = document.getElementById('jurnal-photo');
        const uploadArea = document.getElementById('jurnal-upload-area');
        const filePreview = document.getElementById('jurnal-file-preview');

        if (fileInput) fileInput.value = '';
        if (uploadArea) uploadArea.style.display = 'block';
        if (filePreview) filePreview.style.display = 'none';
    },

    async handleSubmit(e) {
        e.preventDefault();

        const dateStr = this.currentDate.toISOString().split('T')[0];
        const tasks = document.getElementById('jurnal-tasks').value;
        const achievements = document.getElementById('jurnal-achievements').value;

        const currentUser = auth.getCurrentUser();

        const jurnalData = {
            date: dateStr,
            userId: currentUser?.id || 'demo-user',
            tasks,
            achievements,
            photo: this.currentPhoto,
            updatedAt: new Date().toISOString()
        };

        try {
            await api.saveJournal(jurnalData);

            // Update local data
            const existingIndex = this.jurnals.findIndex(j => j.date === dateStr);
            if (existingIndex >= 0) {
                this.jurnals[existingIndex] = jurnalData;
            } else {
                this.jurnals.unshift(jurnalData);
            }

            toast.success('Jurnal berhasil disimpan!');
        } catch (error) {
            console.error('Error saving journal:', error);
            toast.error('Gagal menyimpan jurnal');
        }

        // Reset photo after save
        this.currentPhoto = null;
        this.removePhoto();

        await this.loadJurnals(); // Reload data
        this.renderJurnalList();
        this.updateSummary();
        this.updateStatusBadge('filled');
    },

    updateUI() {
        const dateDisplay = document.getElementById('jurnal-current-date');
        const today = new Date().toISOString().split('T')[0];
        const dateStr = this.currentDate.toISOString().split('T')[0];

        if (dateDisplay) {
            dateDisplay.textContent = dateTime.formatDate(this.currentDate, 'short');
        }

        // Load jurnal for current date if exists
        const jurnal = this.jurnals.find(j => j.date === dateStr);

        const tasksEl = document.getElementById('jurnal-tasks');
        const achievementsEl = document.getElementById('jurnal-achievements');

        if (jurnal) {
            if (tasksEl) tasksEl.value = jurnal.tasks || '';
            if (achievementsEl) achievementsEl.value = jurnal.achievements || '';

            // Load existing photo
            if (jurnal.photo) {
                this.currentPhoto = jurnal.photo;
                this.showPhotoPreview();
            } else {
                this.currentPhoto = null;
                this.removePhoto();
            }

            this.updateStatusBadge('filled');
        } else {
            // Reset fields
            if (tasksEl) tasksEl.value = '';
            if (achievementsEl) achievementsEl.value = '';
            
            // Reset photo
            this.currentPhoto = null;
            this.removePhoto();

            if (dateStr === today) {
                this.updateStatusBadge('empty');
            } else if (dateStr > today) {
                this.updateStatusBadge('pending');
            } else {
                this.updateStatusBadge('empty');
            }
        }

        // Disable form for future dates
        const form = document.getElementById('jurnal-form');
        if (form) {
            const isFuture = dateStr > today;
            const submitBtn = form.querySelector('button[type="submit"]');

            Array.from(form.querySelectorAll('textarea')).forEach(textarea => {
                textarea.disabled = isFuture;
            });

            if (submitBtn) {
                submitBtn.disabled = isFuture;
                submitBtn.style.opacity = isFuture ? '0.5' : '1';
            }
        }
    },

    updateStatusBadge(status) {
        const badge = document.getElementById('jurnal-status');
        if (!badge) return;

        badge.className = 'entry-status';

        switch (status) {
            case 'filled':
                badge.classList.add('filled');
                badge.textContent = 'Tersimpan';
                break;
            case 'empty':
                badge.classList.add('empty');
                badge.textContent = 'Belum Diisi';
                break;
            case 'pending':
                badge.classList.add('pending');
                badge.textContent = 'Menunggu';
                break;
        }
    },

    renderJurnalList() {
        const list = document.getElementById('jurnal-list');
        if (!list) return;

        // Filter jurnals
        let filteredJurnals = this.jurnals.filter(j => {
            if (!this.filter) return true;
            return j.tasks?.toLowerCase().includes(this.filter) ||
                j.achievements?.toLowerCase().includes(this.filter);
        });

        // Sort jurnals
        filteredJurnals.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            return this.sort === 'newest' ? dateB - dateA : dateA - dateB;
        });

        // Take first 10
        const recentJurnals = filteredJurnals.slice(0, 10);

        if (recentJurnals.length === 0) {
            list.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: var(--spacing-xl); color: var(--text-muted);">
                    <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: var(--spacing);"></i>
                    <p>${this.filter ? 'Tidak ada jurnal yang sesuai' : 'Belum ada jurnal'}</p>
                </div>
            `;
            return;
        }

        list.innerHTML = recentJurnals.map(jurnal => {
            const date = this.parseDate(jurnal.date);
            const isValidDate = date && !isNaN(date.getTime());
            
            const dayName = isValidDate ? dateTime.formatDate(date, 'day') : '-';
            const day = isValidDate ? date.getDate() : '-';
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
            const month = isValidDate ? monthNames[date.getMonth()] : '-';
            const preview = jurnal.tasks ? (jurnal.tasks.substring(0, 60) + (jurnal.tasks.length > 60 ? '...' : '')) : 'Tidak ada deskripsi';
            // Thumbnail logic: Show photo if exists, otherwise show date circle
            const thumbnailHtml = jurnal.photo ? `
                <div class="jurnal-photo-thumb" onclick="jurnal.viewPhoto('${jurnal.photo}')" style="width: 45px; height: 45px; border-radius: 8px; overflow: hidden; margin-right: 12px; cursor: pointer;">
                    <img src="${jurnal.photo}" alt="Foto Jurnal" style="width: 100%; height: 100%; object-fit: cover;">
                </div>
            ` : `
                <div class="jurnal-date">
                    <span class="date-day">${day}</span>
                    <span class="date-month">${month}</span>
                </div>
            `;

            return `
                <div class="jurnal-item">
                    <div class="jurnal-item-header">
                        ${thumbnailHtml}
                        <div class="jurnal-meta">
                            <span class="jurnal-day">${dayName}</span>
                            <span class="jurnal-time">${dateTime.formatTime(jurnal.updatedAt)}</span>
                        </div>
                    </div>
                    <div class="jurnal-content">
                        <p class="jurnal-preview">${preview}</p>
                    </div>
                    <div class="jurnal-actions">
                        <button class="btn-icon-sm" title="Lihat Detail" onclick="jurnal.viewDetail('${jurnal.date}')">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn-icon-sm" title="Edit" onclick="jurnal.editJurnal('${jurnal.date}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon-sm btn-delete" title="Hapus" onclick="jurnal.deleteJurnal('${jurnal.date}')" style="color: #EF4444;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    async deleteJurnal(date) {
        if (typeof modal === 'undefined') {
            if (!confirm('Yakin ingin hapus jurnal tanggal ' + date + '?')) return;
            this._executeDelete(date);
            return;
        }

        modal.show('Konfirmasi Hapus', `<p>Apakah Anda yakin ingin menghapus jurnal untuk tanggal <strong>${date}</strong>?</p>`, [
            { label: 'Batal', class: 'btn-secondary', onClick: () => modal.close() },
            { label: 'Ya, Hapus', class: 'btn-danger', onClick: () => {
                modal.close();
                this._executeDelete(date);
            }}
        ]);
    },

    async _executeDelete(date) {
        if (typeof loader !== 'undefined') loader.show('Menghapus jurnal...');
        try {
            const currentUser = auth.getCurrentUser();
            const res = await api.request('deleteJournal', { 
                userId: currentUser?.id,
                date: date 
            });
            if (res.success) {
                toast.success('Jurnal berhasil dihapus');
                await this.init(); // Reload
            } else {
                toast.error(res.error || 'Gagal menghapus jurnal');
            }
        } catch (e) {
            console.error('Delete jurnal error:', e);
            toast.error('Terjadi kesalahan saat menghapus');
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    viewPhoto(url) {
        if (typeof modal !== 'undefined') {
            modal.show('Foto Dokumentasi', `<img src="${url}" style="width:100%; border-radius:8px;">`);
        }
    },

    updateSummary() {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        if (!this.jurnals || this.jurnals.length === 0) {
            console.log('UpdateSummary: No jurnals found');
            return;
        }

        // Count jurnals for current month with robust date parsing
        const monthJurnals = this.jurnals.filter(j => {
            const date = this.parseDate(j.date);
            if (!date || isNaN(date.getTime())) return false;
            return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        });

        console.log(`UpdateSummary: Found ${monthJurnals.length} journals for month ${currentMonth+1}`);

        // Update UI
        const filledEl = document.getElementById('jurnal-filled-days');
        const missedEl = document.getElementById('jurnal-missed-days');
        
        if (filledEl) filledEl.textContent = monthJurnals.length;
        
        const todayCount = now.getDate();
        let workingDaysPassed = 0;
        for (let i = 1; i <= todayCount; i++) {
            const d = new Date(currentYear, currentMonth, i);
            if (d.getDay() !== 0 && d.getDay() !== 6) workingDaysPassed++;
        }
        
        const missed = Math.max(0, workingDaysPassed - monthJurnals.length);
        if (missedEl) missedEl.textContent = missed;

        let streak = 0;
        let d = new Date();
        const journalDates = this.jurnals
            .map(j => {
                const pd = this.parseDate(j.date);
                return pd ? pd.toISOString().split('T')[0] : null;
            })
            .filter(d => d !== null);
        
        while (true) {
            const iso = d.toISOString().split('T')[0];
            if (journalDates.includes(iso)) {
                streak++;
                d.setDate(d.getDate() - 1);
            } else {
                if (d.getDay() === 0 || d.getDay() === 6) {
                    d.setDate(d.getDate() - 1);
                    continue;
                }
                break;
            }
        }
        const streakEl = document.getElementById('jurnal-streak-days');
        if (streakEl) streakEl.textContent = streak;
    },

    parseDate(dateStr) {
        if (!dateStr) return null;
        if (dateStr instanceof Date) return dateStr;
        
        // Try ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...)
        let d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d;
        
        // Try DD/MM/YYYY
        if (typeof dateStr === 'string' && dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                // Check if YYYY is first or last
                if (parts[2].length === 4) { // D/M/Y
                    d = new Date(parts[2], parts[1] - 1, parts[0]);
                } else if (parts[0].length === 4) { // Y/M/D
                    d = new Date(parts[0], parts[1] - 1, parts[2]);
                }
                if (!isNaN(d.getTime())) return d;
            }
        }
        
        return null;
    },


    viewDetail(date) {
        const jurnal = this.jurnals.find(j => j.date === date);
        if (!jurnal) return;

        // Create modal content
        const photoHtml = jurnal.photo ? `
            <div class="detail-photo">
                <label>Foto Lampiran:</label>
                <img src="${jurnal.photo}" alt="Foto jurnal" onclick="window.open('${jurnal.photo}', '_blank')">
            </div>
        ` : '';

        const modalContent = `
            <div class="jurnal-detail-modal">
                <h3>Detail Jurnal - ${dateTime.formatDate(new Date(date), 'long')}</h3>
                <div class="detail-section">
                    <label>Uraian Laporan Pekerjaan:</label>
                    <p>${jurnal.tasks?.replace(/\n/g, '<br>') || '-'}</p>
                </div>
                <div class="detail-section">
                    <label>Hasil Pekerjaan:</label>
                    <p>${jurnal.achievements?.replace(/\n/g, '<br>') || '-'}</p>
                </div>
                ${photoHtml}
            </div>
        `;

        modal.show('Detail Jurnal', modalContent, [
            { label: 'Tutup', class: 'btn-secondary', onClick: () => modal.close() },
            { label: 'Edit', class: 'btn-primary', onClick: () => { modal.close(); this.editJurnal(date); } }
        ]);
    },

    editJurnal(date) {
        const jurnalData = this.jurnals.find(j => j.date === date);
        if (!jurnalData) return;

        const modalHtml = `
            <div class="edit-jurnal-modal">
                <div class="form-group">
                    <label>Uraian Laporan Pekerjaan:</label>
                    <textarea id="edit-jurnal-tasks" class="form-control" rows="4">${jurnalData.tasks || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>Hasil Pekerjaan:</label>
                    <textarea id="edit-jurnal-achievements" class="form-control" rows="4">${jurnalData.achievements || ''}</textarea>
                </div>
                <p class="edit-notice">Catatan: Untuk mengedit foto, gunakan formulir utama di halaman Jurnal.</p>
            </div>
        `;

        modal.show('Edit Jurnal - ' + date, modalHtml, [
            { label: 'Batal', class: 'btn-secondary', onClick: () => modal.close() },
            { label: 'Simpan Perubahan', class: 'btn-primary', onClick: async () => {
                const tasks = document.getElementById('edit-jurnal-tasks').value;
                const achievements = document.getElementById('edit-jurnal-achievements').value;
                
                modal.close();
                if (typeof loader !== 'undefined') loader.show('Menyimpan perubahan...');
                
                try {
                    const currentUser = auth.getCurrentUser();
                    await api.saveJournal({
                        ...jurnalData,
                        tasks,
                        achievements,
                        userId: currentUser?.id,
                        updatedAt: new Date().toISOString()
                    });
                    toast.success('Jurnal diperbarui!');
                    await this.init();
                } catch (e) {
                    toast.error('Gagal memperbarui jurnal');
                } finally {
                    if (typeof loader !== 'undefined') loader.hide();
                }
            }}
        ]);
    }
};

// Global init function
window.initJurnal = () => {
    jurnal.init();
};

// Expose jurnal object for onclick handlers
window.jurnal = jurnal;
