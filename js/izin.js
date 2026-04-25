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
        const locationLabel = document.getElementById('izin-location-label');
        if (!typeSelect || !container) return;

        // Create hidden input to store coordinates if it doesn't exist
        let coordsInput = document.getElementById('izin-coords');
        if (!coordsInput) {
            coordsInput = document.createElement('input');
            coordsInput.type = 'hidden';
            coordsInput.id = 'izin-coords';
            document.getElementById('izin-form').appendChild(coordsInput);
        }

        typeSelect.addEventListener('change', () => {
            const val = typeSelect.value;
            const addressInput = document.getElementById('izin-address');
            
            // Show for WFA and Dinas, and WFH
            if (val === 'wfa' || val === 'dinas' || val === 'wfh') {
                container.style.display = 'block';
                if(locationLabel) {
                    if (val === 'wfa') {
                        locationLabel.textContent = 'Lokasi Work From Anywhere';
                        if (btnOpen) btnOpen.style.display = 'none'; // Hide map button for WFA
                        if (addressInput) addressInput.value = 'Work From Anywhere';
                    } else {
                        if (btnOpen) btnOpen.style.display = 'flex';
                        if (val === 'wfh') locationLabel.textContent = 'Lokasi Work From Home';
                        if (val === 'dinas') locationLabel.textContent = 'Lokasi Perjalanan Dinas';
                        if (addressInput && addressInput.value === 'Work From Anywhere') addressInput.value = '';
                    }
                }
            } else {
                container.style.display = 'none';
            }
        });

        // Modal Elements
        const modal = document.getElementById('map-picker-modal');
        const btnOpen = document.getElementById('btn-open-map-picker');
        const btnClose = document.getElementById('btn-close-map-picker');
        const btnConfirm = document.getElementById('btn-confirm-location');
        const btnCurrentLoc = document.getElementById('btn-current-location');
        const searchInput = document.getElementById('map-search-input');
        
        let mapInitialized = false;
        
        const openMap = () => {
            modal.style.display = 'block';
            if (!mapInitialized) {
                this.initGoogleMap();
                mapInitialized = true;
            } else {
                this.refreshMap();
            }
        };
        
        const closeMap = () => {
            modal.style.display = 'none';
        };

        if (btnOpen) btnOpen.addEventListener('click', openMap);
        if (btnClose) btnClose.addEventListener('click', closeMap);
        
        if (btnConfirm) {
            btnConfirm.addEventListener('click', () => {
                const selectedAddrText = document.getElementById('map-selected-address')?.textContent;
                const addressInput = document.getElementById('izin-address');
                if (addressInput && selectedAddrText && selectedAddrText !== 'Geser pin untuk memilih lokasi...' && selectedAddrText !== 'Mencari alamat...') {
                    addressInput.value = selectedAddrText;
                }
                closeMap();
            });
        }
        
        if (btnCurrentLoc) {
            btnCurrentLoc.addEventListener('click', () => {
                if (this.map && this.marker) {
                    btnCurrentLoc.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            const pos = {
                                lat: position.coords.latitude,
                                lng: position.coords.longitude,
                            };
                            this.map.setCenter(pos);
                            this.map.setZoom(17);
                            this.marker.setPosition(pos);
                            if(coordsInput) coordsInput.value = JSON.stringify(pos);
                            this.updateAddressFromCoords(pos.lat, pos.lng);
                            btnCurrentLoc.innerHTML = '<i class="fas fa-crosshairs"></i>';
                        },
                        () => {
                            toast.error("Gagal mendapatkan lokasi saat ini.");
                            btnCurrentLoc.innerHTML = '<i class="fas fa-crosshairs"></i>';
                        }
                    );
                }
            });
        }

        // Manual Search & Autocomplete Trigger
        const btnTriggerSearch = document.getElementById('btn-trigger-search');
        if (btnTriggerSearch) {
            btnTriggerSearch.addEventListener('click', () => {
                const query = document.getElementById('map-search-input')?.value;
                if (query) {
                    this.performManualSearch(query);
                }
            });
        }

        if (searchInput) {
            let debounceTimer;
            searchInput.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                const query = searchInput.value;
                if (query.length < 3) {
                    this.hideSuggestions();
                    return;
                }
                debounceTimer = setTimeout(() => this.showSuggestions(query), 500);
            });

            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.performManualSearch(searchInput.value);
                    this.hideSuggestions();
                }
            });
        }
    },

    async showSuggestions(query) {
        if (!window.google || !google.maps || !google.maps.places) return;
        
        const service = new google.maps.places.AutocompleteService();
        service.getPlacePredictions({ input: query, componentRestrictions: { country: 'id' } }, (predictions, status) => {
            if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
                this.hideSuggestions();
                return;
            }

            const listEl = document.getElementById('map-suggestions-list');
            if (!listEl) return;
            
            listEl.style.display = 'block';
            listEl.innerHTML = predictions.map(p => `
                <div class="suggestion-item" onclick="izin.selectByPlaceId('${p.place_id}', '${p.description.replace(/'/g, "\\'")}')">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${p.description}</span>
                </div>
            `).join('');
        });
    },

    hideSuggestions() {
        const listEl = document.getElementById('map-suggestions-list');
        if (listEl) {
            listEl.style.display = 'none';
            listEl.innerHTML = '';
        }
    },

    selectByPlaceId(placeId, description) {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ placeId: placeId }, (results, status) => {
            if (status === 'OK' && results[0]) {
                const loc = results[0].geometry.location;
                this.selectLocation(loc.lat(), loc.lng(), description);
            }
        });
    },

    selectLocation(lat, lon, address) {
        if (this.map && this.marker) {
            const pos = { lat: parseFloat(lat), lng: parseFloat(lon) };
            this.map.setCenter(pos);
            this.map.setZoom(17);
            this.marker.setPosition(pos);
            
            const coordsInput = document.getElementById('izin-coords');
            if(coordsInput) coordsInput.value = JSON.stringify(pos);
            
            const selectedAddrEl = document.getElementById('map-selected-address');
            if (selectedAddrEl) selectedAddrEl.textContent = address;
            
            const searchInput = document.getElementById('map-search-input');
            if (searchInput) searchInput.value = address;
        }
        this.hideSuggestions();
    },

    async performManualSearch(query) {
        if (!query || !window.google) return;
        
        const btnTriggerSearch = document.getElementById('btn-trigger-search');
        if (btnTriggerSearch) btnTriggerSearch.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: query }, (results, status) => {
            if (btnTriggerSearch) btnTriggerSearch.textContent = 'Cari';
            
            if (status === 'OK' && results[0]) {
                const loc = results[0].geometry.location;
                this.selectLocation(loc.lat(), loc.lng(), results[0].formatted_address);
            } else {
                toast.error("Lokasi tidak ditemukan.");
            }
        });
    },

    initGoogleMap() {
        const defaultPos = { lat: -6.3400, lng: 106.7700 };
        const coordsInput = document.getElementById('izin-coords');

        try {
            if (!this.map && document.getElementById('izin-map-picker')) {
                this.map = new google.maps.Map(document.getElementById('izin-map-picker'), {
                    center: defaultPos,
                    zoom: 15,
                    disableDefaultUI: true,
                    gestureHandling: 'greedy'
                });

                this.marker = new google.maps.Marker({
                    position: defaultPos,
                    map: this.map,
                    draggable: true,
                    animation: google.maps.Animation.DROP
                });

                if(coordsInput) coordsInput.value = JSON.stringify(defaultPos);

                this.marker.addListener('dragend', () => {
                    const pos = this.marker.getPosition();
                    const coords = { lat: pos.lat(), lng: pos.lng() };
                    if(coordsInput) coordsInput.value = JSON.stringify(coords);
                    this.updateAddressFromCoords(coords.lat, coords.lng);
                });

                this.map.addListener('click', (e) => {
                    this.marker.setPosition(e.latLng);
                    const coords = { lat: e.latLng.lat(), lng: e.latLng.lng() };
                    if(coordsInput) coordsInput.value = JSON.stringify(coords);
                    this.updateAddressFromCoords(coords.lat, coords.lng);
                });
                
                // Initial reverse geocode
                this.updateAddressFromCoords(defaultPos.lat, defaultPos.lng);
            }
        } catch (e) {
            console.error('Error initializing Google Map:', e);
        }
    },

    refreshMap() {
        if (this.map) {
            google.maps.event.trigger(this.map, 'resize');
            if (this.marker) {
                this.map.setCenter(this.marker.getPosition());
            }
        }
    },

    async updateAddressFromCoords(lat, lng) {
        const selectedAddrEl = document.getElementById('map-selected-address');
        if (selectedAddrEl && window.google) {
            selectedAddrEl.textContent = 'Mencari alamat...';
            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    selectedAddrEl.textContent = results[0].formatted_address;
                } else {
                    selectedAddrEl.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                }
            });
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
        const coordsStr = document.getElementById('izin-coords')?.value || '';

        if (!type || !startDate || !endDate || !reason) {
            toast.error('Harap isi semua field yang wajib diisi!');
            return;
        }

        // Validate address for WFA/Dinas/WFH
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
            verificationLocation: coordsStr,
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
