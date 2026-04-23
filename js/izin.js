/**
 * Portal Karyawan - Izin WFH/WFA/Dinas
 * Remote work permission request with token-based approval
 */

const izin = {
    izinData: [],
    filterStatus: '',

    initialized: false,
    
    async init() {
        if (this.initialized) {
            await this.loadIzinData();
            this.renderIzinList();
            this.updateStats();
            return;
        }
        
        try {
            // Priority 1: Initialize form and UI elements immediately
            this.initForm();
            this.initFilters();

            // Set default dates
            const startDate = document.getElementById('izin-start-date');
            const endDate = document.getElementById('izin-end-date');
            if (startDate) startDate.valueAsDate = new Date();
            if (endDate) endDate.valueAsDate = new Date();
            this.calculateDuration();

            // Render with cached data if available
            this.renderIzinList();
            this.updateStats();

            // Priority 2: Background load of fresh data
            await this.loadIzinData();
            
            // Final render with fresh data
            this.renderIzinList();
            this.updateStats();
            this.loadActivePermits();
            this.initialized = true;
        } catch (error) {
            console.error('Izin init error:', error);
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
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitIzin();
            });
        }

        // Auto-calculate duration when dates change
        const startDate = document.getElementById('izin-start-date');
        const endDate = document.getElementById('izin-end-date');
        
        if (startDate) {
            startDate.addEventListener('change', () => {
                // Ensure end date is >= start date
                if (endDate && startDate.value && (!endDate.value || endDate.value < startDate.value)) {
                    endDate.value = startDate.value;
                }
                this.calculateDuration();
            });
        }
        if (endDate) {
            endDate.addEventListener('change', () => {
                // Ensure end date is >= start date
                if (startDate && endDate.value && startDate.value && endDate.value < startDate.value) {
                    endDate.value = startDate.value;
                }
                this.calculateDuration();
            });
        }

        this.initMapPicker();
        this.initFilters();
    },

    map: null,
    marker: null,

    initMapPicker() {
        const typeSelect = document.getElementById('izin-type');
        const container = document.getElementById('izin-location-container');
        if (!typeSelect || !container) return;

        typeSelect.addEventListener('change', () => {
            const val = typeSelect.value;
            // Show for WFA and Dinas, and optionally WFH if needed
            if (val === 'wfa' || val === 'dinas' || val === 'wfh') {
                container.style.display = 'block';
                this.refreshMap();
            } else {
                container.style.display = 'none';
            }
        });

        // Default location (Depok area as requested previously)
        const defaultLat = -6.3400;
        const defaultLng = 106.7700;

        try {
            if (!this.map && document.getElementById('izin-map-picker')) {
                this.map = L.map('izin-map-picker').setView([defaultLat, defaultLng], 15);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; OpenStreetMap contributors'
                }).addTo(this.map);

                this.marker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(this.map);

                this.marker.on('dragend', () => {
                    const pos = this.marker.getLatLng();
                    this.updateAddressFromCoords(pos.lat, pos.lng);
                });

                this.map.on('click', (e) => {
                    this.marker.setLatLng(e.latlng);
                    this.updateAddressFromCoords(e.latlng.lat, e.latlng.lng);
                });

                // Add search capability for manual input
                const addressInput = document.getElementById('izin-address');
                if (addressInput) {
                    addressInput.addEventListener('change', () => {
                        const query = addressInput.value;
                        if (query && query.length > 3) {
                            this.searchAddress(query);
                        }
                    });
                }
            }
        } catch (e) {
            console.error('Error initializing map:', e);
        }
    },

    async searchAddress(query) {
        try {
            // Use Nominatim forward geocoding
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
            const data = await response.json();
            
            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                
                if (this.map && this.marker) {
                    this.map.setView([lat, lon], 15);
                    this.marker.setLatLng([lat, lon]);
                    // Don't call updateAddressFromCoords here to avoid overwriting user input with formatted OSM address
                }
            }
        } catch (error) {
            console.warn('Geocoding search failed:', error);
        }
    },

    refreshMap() {
        if (this.map) {
            setTimeout(() => {
                this.map.invalidateSize();
            }, 100);
        }
    },

    async updateAddressFromCoords(lat, lng) {
        const addressInput = document.getElementById('izin-address');
        if (addressInput) {
            addressInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)} (Mencari alamat...)`;
            try {
                // Use nominatim for reverse geocoding
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
                const data = await response.json();
                if (data.display_name) {
                    addressInput.value = data.display_name;
                }
            } catch (e) {
                addressInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            }
        }
    },

    calculateDuration() {
        const startDate = document.getElementById('izin-start-date')?.value;
        const endDate = document.getElementById('izin-end-date')?.value;
        const durationDisplay = document.getElementById('izin-duration-display');
        const durationHidden = document.getElementById('izin-duration');

        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            const diffTime = end.getTime() - start.getTime();
            const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
            
            if (durationDisplay) durationDisplay.value = `${diffDays} hari`;
            if (durationHidden) durationHidden.value = diffDays;
        } else {
            if (durationDisplay) durationDisplay.value = '-- hari';
            if (durationHidden) durationHidden.value = '1';
        }
    },

    initFilters() {
        const statusFilter = document.querySelector('.izin-history-card .select-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.filterStatus = e.target.value === 'Semua Status' ? '' : e.target.value.toLowerCase();
                this.renderIzinList();
            });
        }
    },

    async submitIzin() {
        const type = document.getElementById('izin-type')?.value;
        const startDate = document.getElementById('izin-start-date')?.value;
        const endDate = document.getElementById('izin-end-date')?.value;
        const duration = document.getElementById('izin-duration')?.value;
        const reason = document.getElementById('izin-reason')?.value;
        const address = document.getElementById('izin-address')?.value || '';

        if (!type || !startDate || !endDate || !reason) {
            toast.error('Harap isi semua field yang wajib diisi!');
            return;
        }

        // Validate address for WFA/Dinas
        if ((type === 'wfa' || type === 'dinas' || type === 'wfh') && !address) {
            toast.error('Harap tentukan lokasi/alamat pelaksanaan!');
            return;
        }

        const typeLabels = {
            'wfh': 'WFH (Work From Home)',
            'wfa': 'WFA (Work From Anywhere)',
            'dinas': 'Perjalanan Dinas'
        };

        const currentUser = auth.getCurrentUser();

        const izinEntry = {
            userId: currentUser?.id || 'demo-user',
            employeeName: currentUser?.name || '',
            nip: currentUser?.nip || '',
            jabatan: currentUser?.position || '',
            type: type,
            typeLabel: typeLabels[type] || type,
            startDate: startDate,
            endDate: endDate,
            duration: parseInt(duration),
            reason: reason,
            alamatIzin: address,
            status: 'pending'
        };

        // Disable submit button
        const submitBtn = document.querySelector('#izin-form button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Mengirim...</span>';
        }

        try {
            const result = await api.submitIzin(izinEntry);
            if (result.success) {
                this.izinData.unshift(result.data);
                toast.success('Pengajuan berhasil dikirim! Menunggu persetujuan admin.');

                // Notify admin
                const recipientId = 'admin';
                notifications.add(recipientId, currentUser.name, `mengajukan izin ${typeLabels[type]}`, 'info');

                // Reset form
                const form = document.getElementById('izin-form');
                if (form) form.reset();
                const startEl = document.getElementById('izin-start-date');
                const endEl = document.getElementById('izin-end-date');
                if (startEl) startEl.valueAsDate = new Date();
                if (endEl) endEl.valueAsDate = new Date();
                this.calculateDuration();

                this.renderIzinList();
                this.updateStats();
            } else {
                toast.error(result.error || 'Gagal mengirim pengajuan');
            }
        } catch (error) {
            console.error('Error submitting izin:', error);
            toast.error('Terjadi kesalahan saat mengirim pengajuan');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> <span>Ajukan Izin</span>';
            }
        }
    },

    // This is still needed for face-recognition flow compatibility (izin action)
    async submitWithVerification(verificationData) {
        // For WFH/WFA, we don't use face verification for the request itself
        // Just submit the form data directly
        await this.submitIzin();
    },

    async loadActivePermits() {
        const currentUser = auth.getCurrentUser();
        if (!currentUser || auth.isAdmin()) return;

        try {
            const result = await api.getActiveWfhPermit(currentUser.id);
            if (result.success && result.data) {
                const { unlocked, permits } = result.data;
                const statusEl = document.getElementById('active-permit-status');
                const listEl = document.getElementById('active-permit-list');

                const activeTypes = [];
                if (unlocked.wfh) activeTypes.push('WFH');
                if (unlocked.wfa) activeTypes.push('WFA');
                if (unlocked.dinas) activeTypes.push('Perjalanan Dinas');

                if (activeTypes.length > 0 && statusEl && listEl) {
                    statusEl.style.display = 'block';
                    listEl.innerHTML = activeTypes.map(t => 
                        `<div style="padding:4px 0;"><i class="fas fa-check-circle" style="margin-right:6px;"></i>${t}</div>`
                    ).join('');
                } else if (statusEl) {
                    statusEl.style.display = 'none';
                }
            }
        } catch (e) {
            console.warn('Failed to load active permits:', e);
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
                    <p>${this.filterStatus ? 'Tidak ada pengajuan yang sesuai' : 'Belum ada pengajuan izin WFH/WFA'}</p>
                </div>
            `;
            return;
        }

        const sortedData = filteredData.sort((a, b) =>
            new Date(b.appliedAt) - new Date(a.appliedAt)
        );

        list.innerHTML = sortedData.map(item => {
            const startDate = item.startDate || item.date || '';
            const endDate = item.endDate || startDate;
            const startFormatted = startDate ? dateTime.formatDate(new Date(startDate), 'short') : '-';
            const endFormatted = endDate ? dateTime.formatDate(new Date(endDate), 'short') : '-';

            const icons = {
                'wfh': 'fa-home',
                'wfa': 'fa-globe',
                'dinas': 'fa-briefcase',
                'sick': 'fa-heartbeat',
                'permission': 'fa-hand-paper',
                'emergency': 'fa-exclamation-triangle'
            };

            const typeLabel = item.typeLabel || item.type || '-';
            const addressHtml = item.alamatIzin ? `
                <div class="izin-location-info" style="font-size: 11px; color: #64748b; margin-top: 4px; display: flex; align-items: flex-start; gap: 4px;">
                    <i class="fas fa-map-marker-alt" style="margin-top: 2px;"></i>
                    <span>${item.alamatIzin}</span>
                </div>
            ` : '';

            return `
                <div class="izin-item">
                    <div class="izin-icon ${item.type}">
                        <i class="fas ${icons[item.type] || 'fa-file'}"></i>
                    </div>
                    <div class="izin-content">
                        <div class="izin-header-row">
                            <h4 class="izin-type">${typeLabel}</h4>
                            <span class="izin-status ${item.status}">${this.getStatusLabel(item.status)}</span>
                        </div>
                        <div class="izin-details">
                            <span class="izin-date">
                                <i class="fas fa-calendar"></i>
                                ${startFormatted} - ${endFormatted} (${item.duration || 1} hari)
                            </span>
                        </div>
                        ${addressHtml}
                        <p class="izin-reason" style="margin-top: 6px;">${item.reason || '-'}</p>
                    </div>
                </div>
            `;
        }).join('');
    },

    getStatusLabel(status) {
        const labels = {
            'pending': 'Menunggu',
            'approved': 'Disetujui',
            'rejected': 'Ditolak',
            'batal': 'Dibatalkan'
        };
        return labels[status] || status;
    },

    // Admin functions
    async approveIzin(id) {
        if (!auth.isAdmin()) return;

        try {
            await api.approveIzin(id);
            const item = this.izinData.find(i => String(i.id) === String(id));
            if (item) { item.status = 'approved'; }
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
            const item = this.izinData.find(i => String(i.id) === String(id));
            if (item) { item.status = 'rejected'; }
            this.renderIzinList();
            this.updateStats();
            toast.info('Pengajuan izin ditolak');
        } catch (error) {
            console.error('Error rejecting izin:', error);
        }
    }
};

// Global init function
window.initIzin = () => {
    izin.init();
};

// Expose
window.izin = izin;
