/**
 * Portal Karyawan - Cuti/Leave
 * Leave request functionality
 * 
 * Balances are calculated from the employee profile data stored in the
 * backend (leave_*_used columns on Employees sheet).  The quotas are
 * defined once here and the "remaining" balance is: quota - used.
 */

const cuti = {
    leaves: [],
    filterStatus: '',
    initialized: false,
    sliderIndex: 0,

    // Default quotas per leave type (days)
    quotas: {
        annual: 12,
        large: 3,
        sick: 12,
        maternity: 90,
        important: 60
    },

    // Actual "used" counts – loaded from employee profile
    used: {
        annual: 0,
        large: 0,
        sick: 0,
        maternity: 0,
        important: 0
    },

    async init() {
        if (this.initialized) {
            this.loadLeaves().then(() => {
                this.updateAllBalances();
                this.updateStats();
                this.renderLeaveList();
            });
            return;
        }

        try {
            // Priority 1: Init UI immediately so page is responsive
            this.initForm();
            this.initFilters();
            this.initSlider();

            // Initial render with cached/default values
            this.updateAllBalances();
            this.updateStats();
            this.renderLeaveList();

            // Priority 2: Load fresh data in background
            await this.loadLeaves();

            // Re-render when data arrives
            this.updateAllBalances();
            this.updateStats();
            this.renderLeaveList();
            this.initialized = true;
        } catch (error) {
            console.error('Cuti init error:', error);
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
                // Still load profile for latest quotas
                await this._loadProfile(userId);
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

        // Load actual used quotas from employee profile
        await this._loadProfile(userId);
    },

    /**
     * Load employee profile to get actual leave_*_used values from the database
     */
    async _loadProfile(userId) {
        try {
            const profileRes = await api.getEmployeeProfile(userId);
            if (profileRes.success && profileRes.data) {
                const d = profileRes.data;
                this.used.annual = Number(d.leave_annual_used) || 0;
                this.used.sick = Number(d.leave_sick_used) || 0;
                this.used.maternity = Number(d.leave_maternity_used) || 0;
                this.used.large = Number(d.leave_large_used) || 0;
                this.used.important = Number(d.leave_important_used) || 0;
            }
        } catch (e) {
            console.warn('Failed to load profile for leave quotas:', e);
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

    /**
     * Get remaining balance for a given leave type
     */
    getBalance(type) {
        const quota = this.quotas[type] || 0;
        const used = this.used[type] || 0;
        return Math.max(0, quota - used);
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
                const diffTime = end - start;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

                if (diffDays > 0) {
                    duration.value = `${diffDays} hari`;
                } else {
                    duration.value = '0 hari';
                }
            }
        };

        if (startDate) startDate.addEventListener('change', calculateDuration);
        if (endDate) endDate.addEventListener('change', calculateDuration);

        // Auto-fill profile data if available
        const currentUser = auth.getCurrentUser();
        if (currentUser) {
            if (document.getElementById('leave-nip')) document.getElementById('leave-nip').value = currentUser.nip || '';
            if (document.getElementById('leave-jabatan')) document.getElementById('leave-jabatan').value = currentUser.position || '';
            if (document.getElementById('leave-masa-kerja')) {
                // Calculate masa kerja (years between joinDate and today)
                if (currentUser.joinDate) {
                    const join = new Date(currentUser.joinDate);
                    const today = new Date();
                    const diff = today.getFullYear() - join.getFullYear();
                    document.getElementById('leave-masa-kerja').value = `${diff} Tahun`;
                } else {
                    document.getElementById('leave-masa-kerja').value = '-';
                }
            }
        }
    },

    async handleSubmit(e) {
        e.preventDefault();

        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Mengirim...</span>';
        }

        const type = document.getElementById('leave-type');
        const startDate = document.getElementById('leave-start');
        const endDate = document.getElementById('leave-end');
        const reason = document.getElementById('leave-reason');

        if (!type.value || !startDate.value || !endDate.value || !reason.value) {
            toast.error('Semua field harus diisi!');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Ajukan Cuti';
            }
            return;
        }

        // Calculate duration
        const start = new Date(startDate.value);
        const end = new Date(endDate.value);
        const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

        if (diffDays <= 0) {
            toast.error('Tanggal selesai harus setelah tanggal mulai!');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Ajukan Cuti';
            }
            return;
        }

        // Check balance for the selected type (except 'other' which is outside quota)
        const leaveType = type.value;
        if (leaveType !== 'other') {
            const remaining = this.getBalance(leaveType);
            if (diffDays > remaining) {
                const typeLabels = {
                    annual: 'Cuti Tahunan', sick: 'Cuti Sakit', important: 'Cuti Penting',
                    maternity: 'Cuti Melahirkan', large: 'Cuti Besar'
                };
                toast.error(`Sisa ${typeLabels[leaveType] || 'cuti'} tidak mencukupi! (Sisa: ${remaining} hari)`);
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = 'Ajukan Cuti';
                }
                return;
            }
        }

        const typeLabels = {
            annual: 'Cuti Tahunan',
            sick: 'Cuti Sakit',
            important: 'Cuti Karena Alasan Penting',
            maternity: 'Cuti Melahirkan',
            large: 'Cuti Besar',
            other: 'Cuti di Luar Tanggungan Negara'
        };

        const currentUser = auth.getCurrentUser();

        const leaveData = {
            userId: currentUser?.id || 'demo-user',
            employeeName: currentUser?.name || 'Pegawai',
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
                toast.success('Pengajuan cuti berhasil dikirim!');

                // Reset form
                e.target.reset();
                document.getElementById('leave-duration').value = '';

                // Reload profile to get updated balances from backend
                const userId = currentUser?.id || 'demo-user';
                await this._loadProfile(userId);
                this.updateAllBalances();
            } else {
                toast.error(result.error || 'Gagal mengajukan cuti');
            }
        } catch (error) {
            console.error('Error submitting leave:', error);
            toast.error('Terjadi kesalahan');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Ajukan Cuti';
            }
        }

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

    // ==================== SLIDER ====================
    initSlider() {
        const track = document.getElementById('balance-slider-track');
        const navLeft = document.getElementById('balance-nav-left');
        const navRight = document.getElementById('balance-nav-right');
        const dotsContainer = document.getElementById('balance-dots');

        if (!track) return;

        const cards = track.querySelectorAll('.balance-card');
        const totalCards = cards.length;

        // Create dots
        if (dotsContainer) {
            dotsContainer.innerHTML = '';
            for (let i = 0; i < totalCards; i++) {
                const dot = document.createElement('span');
                dot.className = 'balance-dot' + (i === 0 ? ' active' : '');
                dot.addEventListener('click', () => this.slideToIndex(i));
                dotsContainer.appendChild(dot);
            }
        }

        // Nav buttons
        if (navLeft) {
            navLeft.addEventListener('click', () => {
                this.slideToIndex(this.sliderIndex - 1);
            });
        }
        if (navRight) {
            navRight.addEventListener('click', () => {
                this.slideToIndex(this.sliderIndex + 1);
            });
        }

        // Touch / swipe support
        let startX = 0;
        let isDragging = false;
        track.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isDragging = true;
        }, { passive: true });

        track.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            isDragging = false;
            const diff = startX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 40) {
                if (diff > 0) {
                    this.slideToIndex(this.sliderIndex + 1);
                } else {
                    this.slideToIndex(this.sliderIndex - 1);
                }
            }
        }, { passive: true });
    },

    slideToIndex(index) {
        const track = document.getElementById('balance-slider-track');
        if (!track) return;

        const cards = track.querySelectorAll('.balance-card');
        const totalCards = cards.length;
        if (totalCards === 0) return;

        // Wrap around
        if (index < 0) index = totalCards - 1;
        if (index >= totalCards) index = 0;

        this.sliderIndex = index;

        // Scroll the track
        const cardWidth = cards[0].offsetWidth;
        track.scrollTo({ left: cardWidth * index, behavior: 'smooth' });

        // Update dots
        const dots = document.querySelectorAll('.balance-dot');
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === index);
        });
    },

    // ==================== BALANCE DISPLAY ====================
    updateAllBalances() {
        const types = ['annual', 'large', 'sick', 'maternity', 'important'];
        types.forEach(type => {
            const el = document.getElementById(`balance-${type}`);
            if (el) {
                el.textContent = this.getBalance(type);
            }
        });
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
                large: 'fa-calendar-alt',
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
                            <span class="leave-status ${leave.status}">${this.getStatusLabel(leave.status)}</span>
                        </div>
                        <div class="leave-details">
                            <span class="leave-date">
                                <i class="fas fa-calendar"></i>
                                ${dateDisplay} (${leave.duration} hari)
                            </span>
                        </div>
                        <p class="leave-reason">${leave.reason}</p>
                    </div>
                    <div class="leave-actions">
                        <button class="btn-export-word-large" onclick="cuti.downloadCutiWord('${leave.id}')">
                            <i class="fas fa-file-word"></i> <span>Download Word</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    async downloadCutiWord(id) {
        if (typeof loader !== 'undefined') loader.show('Menyiapkan dokumen Word...');
        try {
            const res = await api.request('downloadLeaveWord', { id });
            if (res.success && res.data) {
                const byteCharacters = atob(res.data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/msword' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = res.filename || `Permohonan_Cuti_${id}.doc`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                toast.success('Dokumen Word berhasil diunduh');
            } else {
                toast.error(res.error || 'Gagal mengunduh dokumen');
            }
        } catch (e) {
            console.error('Download Word error:', e);
            toast.error('Terjadi kesalahan saat mengunduh');
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
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
            }
            this.renderLeaveList();
            this.updateStats();
            toast.info('Pengajuan cuti ditolak!');
        } catch (error) {
            console.error('Error rejecting leave:', error);
        }
    }
};

// Global init function
window.initCuti = () => {
    cuti.init();
};

// Expose cuti object
window.cuti = cuti;
