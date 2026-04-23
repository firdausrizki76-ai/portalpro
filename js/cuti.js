/**
 * Portal Karyawan - Cuti/Leave
 * Leave request functionality
 */

const cuti = {
    leaves: [],
    leaveBalance: 12,
    filterStatus: '',

    initialized: false,

    async init() {
        if (this.initialized) {
            this.loadLeaves().then(() => {
                this.updateBalanceDisplay();
                this.updateStats();
                this.renderLeaveList();
            });
            return;
        }

        try {
            // Priority 1: Init UI immediately so page is responsive
            this.initForm();
            this.initFilters();
            
            // Initial render with cached/default values
            this.updateBalanceDisplay();
            this.updateStats();
            this.renderLeaveList();

            // Priority 2: Load fresh data in background
            await this.loadLeaves();
            
            // Re-render when data arrives
            this.updateBalanceDisplay();
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

        // Check balance for annual leave
        if (type.value === 'annual' && diffDays > this.leaveBalance) {
            toast.error('Sisa cuti tidak mencukupi!');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Ajukan Cuti';
            }
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
            type: type.value,
            typeLabel: typeLabels[type.value],
            startDate: startDate.value,
            endDate: endDate.value,
            duration: diffDays,
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
                
                // Reset form
                e.target.reset();
                document.getElementById('leave-duration').value = '';
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
    }
};

// Global init function
window.initCuti = () => {
    cuti.init();
};

// Expose cuti object
window.cuti = cuti;
