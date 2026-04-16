/**
 * Portal Karyawan - Settings
 * Admin settings functionality
 */

const settings = {
    shifts: [],

    async init() {
        if (typeof loader !== 'undefined') loader.show('Memuat pengaturan...');
        try {
            // Check if admin
            if (!auth.isAdmin()) {
                toast.error('Anda tidak memiliki akses ke halaman ini!');
                router.navigate('dashboard');
                return;
            }

            await this.loadSettings();
            this.initForms();
            this.renderShifts();
        } catch (error) {
            console.error('Settings init error:', error);
            toast.error('Gagal memuat pengaturan');
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    async loadSettings() {
        try {
            const [settingsResult, shiftsResult] = await Promise.all([
                api.getSettings(),
                api.getShifts()
            ]);

            // Fix shift times - Google Sheets converts "08:00" to Date objects
            this.shifts = (shiftsResult.data || []).map(shift => ({
                ...shift,
                startTime: this.normalizeTime(shift.startTime),
                endTime: this.normalizeTime(shift.endTime)
            }));

            const allSettings = settingsResult.data || {};

            // Company info
            const companyName = document.getElementById('company-name');
            const companyLogo = document.getElementById('company-logo');
            if (companyName) companyName.value = allSettings.company_name || '';
            if (companyLogo) companyLogo.value = allSettings.company_logo || '';

            // Working days
            const workdays = allSettings.working_days ? JSON.parse(allSettings.working_days) : null;
            if (workdays) {
                const days = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];
                days.forEach(day => {
                    const el = document.getElementById(`day-${day}`);
                    if (el) el.checked = workdays[day] !== false;
                });
            }

            // System settings
            const faceMatch = document.getElementById('setting-face-match');
            const maxDist = document.getElementById('setting-max-distance');
            const offLat = document.getElementById('setting-office-lat');
            const offLng = document.getElementById('setting-office-lng');
            const lateTolerance = document.getElementById('setting-late-tolerance');
            const faceToggle = document.getElementById('setting-face-recognition');
            const locToggle = document.getElementById('setting-location-tracking');

            if (lateTolerance && allSettings.late_tolerance !== undefined) {
                lateTolerance.value = allSettings.late_tolerance;
            }
            if (faceMatch) {
                faceMatch.value = allSettings.face_match_threshold || '80';
            }
            if (maxDist) {
                maxDist.value = allSettings.max_attendance_distance || '100';
            }
            if (offLat) {
                offLat.value = allSettings.office_lat || '';
            }
            if (offLng) {
                offLng.value = allSettings.office_lng || '';
            }
            if (faceToggle) {
                faceToggle.checked = allSettings.require_face_recognition !== 'false';
            }
            if (locToggle) {
                locToggle.checked = allSettings.require_location_tracking !== 'false';
            }

            // Signatures
            const kasubagName = document.getElementById('setting-kasubag-name');
            const kasubagNip = document.getElementById('setting-kasubag-nip');
            const camatName = document.getElementById('setting-camat-name');
            const camatNip = document.getElementById('setting-camat-nip');

            if (kasubagName) kasubagName.value = allSettings.signature_kasubag_name || '';
            if (kasubagNip) kasubagNip.value = allSettings.signature_kasubag_nip || '';
            if (camatName) camatName.value = allSettings.signature_camat_name || '';
            if (camatNip) camatNip.value = allSettings.signature_camat_nip || '';
        } catch (error) {
            console.error('Error loading settings:', error);
            this.shifts = storage.get('shifts', []);
            const company = storage.get('company', { name: '', logo: '' });
            const companyName = document.getElementById('company-name');
            const companyLogo = document.getElementById('company-logo');
            if (companyName) companyName.value = company.name;
            if (companyLogo) companyLogo.value = company.logo;
        }
    },

    /**
     * Normalize time values from Google Sheets.
     * Sheets converts "08:00" to a Date (e.g. "1899-12-30T01:00:00.000Z").
     * This extracts HH:mm from whatever format we get.
     */
    normalizeTime(val) {
        if (!val) return '09:00';
        const str = String(val);
        // Already HH:mm format
        if (/^\d{2}:\d{2}$/.test(str)) return str;
        // ISO date string from Sheets - extract time portion based on timezone offset
        if (str.includes('T') || str.includes('1899')) {
            try {
                const d = new Date(str);
                // Google Sheets stores time as a date in 1899 with UTC offset
                // We need to get the time in the original timezone (Asia/Jakarta UTC+7)
                const hours = String(d.getUTCHours() + 7).padStart(2, '0');
                const mins = String(d.getUTCMinutes()).padStart(2, '0');
                const h = parseInt(hours) % 24;
                return String(h).padStart(2, '0') + ':' + mins;
            } catch (e) {
                return '09:00';
            }
        }
        return str;
    },

    initForms() {
        // Company form
        const companyForm = document.getElementById('company-form');
        if (companyForm) {
            companyForm.addEventListener('submit', (e) => this.saveCompany(e));
        }

        // Add shift button
        const addShiftBtn = document.getElementById('btn-add-shift');
        if (addShiftBtn) {
            addShiftBtn.addEventListener('click', () => this.addShift());
        }

        // Save working days
        const saveWorkdaysBtn = document.getElementById('btn-save-workdays');
        if (saveWorkdaysBtn) {
            saveWorkdaysBtn.addEventListener('click', () => this.saveWorkdays());
        }

        // Save system settings
        const saveSystemBtn = document.getElementById('btn-save-system');
        if (saveSystemBtn) {
            saveSystemBtn.addEventListener('click', () => this.saveSystemSettings());
        }

        // Save signature settings
        const saveSignaturesBtn = document.getElementById('btn-save-signatures');
        if (saveSignaturesBtn) {
            saveSignaturesBtn.addEventListener('click', () => this.saveSignatureSettings());
        }

        // Get current location button
        const getLocBtn = document.getElementById('btn-get-current-loc');
        if (getLocBtn) {
            getLocBtn.addEventListener('click', () => this.getCurrentLocation());
        }
    },

    async getCurrentLocation() {
        if (!navigator.geolocation) {
            toast.error('Geolocation tidak didukung oleh browser Anda');
            return;
        }

        const btn = document.getElementById('btn-get-current-loc');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mencari...';

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude.toFixed(8);
                const lng = position.coords.longitude.toFixed(8);
                
                document.getElementById('setting-office-lat').value = lat;
                document.getElementById('setting-office-lng').value = lng;
                
                btn.disabled = false;
                btn.innerHTML = originalText;
                toast.success('Lokasi berhasil didapatkan!');
            },
            (error) => {
                console.error('Geolocation error:', error);
                btn.disabled = false;
                btn.innerHTML = originalText;
                toast.error('Gagal mendapatkan lokasi. Pastikan izin lokasi diberikan.');
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    },

    async saveCompany(e) {
        e.preventDefault();

        const name = document.getElementById('company-name').value;
        const logo = document.getElementById('company-logo').value;

        try {
            await Promise.all([
                api.saveSetting('company_name', name),
                api.saveSetting('company_logo', logo)
            ]);
            // Also update localStorage for immediate UI update
            storage.set('company', { name, logo });
            updateCompanyUI();
            toast.success('Informasi perusahaan berhasil disimpan!');
        } catch (error) {
            console.error('Error saving company:', error);
            toast.error('Gagal menyimpan');
        }
    },

    async saveWorkdays() {
        const days = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];
        const workdays = {};
        days.forEach(day => {
            const el = document.getElementById(`day-${day}`);
            workdays[day] = el ? el.checked : false;
        });

        try {
            await api.saveSetting('working_days', JSON.stringify(workdays));
            toast.success('Hari kerja berhasil disimpan!');
        } catch (error) {
            console.error('Error saving workdays:', error);
            toast.error('Gagal menyimpan hari kerja');
        }
    },

    async saveSystemSettings() {
        const lateTolerance = document.getElementById('setting-late-tolerance');
        const faceMatch = document.getElementById('setting-face-match');
        const maxDist = document.getElementById('setting-max-distance');
        const offLat = document.getElementById('setting-office-lat');
        const offLng = document.getElementById('setting-office-lng');
        const faceToggle = document.getElementById('setting-face-recognition');
        const locToggle = document.getElementById('setting-location-tracking');

        try {
            await Promise.all([
                api.saveSetting('late_tolerance', lateTolerance ? lateTolerance.value : '15'),
                api.saveSetting('face_match_threshold', faceMatch ? faceMatch.value : '80'),
                api.saveSetting('max_attendance_distance', maxDist ? maxDist.value : '100'),
                api.saveSetting('office_lat', offLat ? offLat.value : ''),
                api.saveSetting('office_lng', offLng ? offLng.value : ''),
                api.saveSetting('require_face_recognition', faceToggle ? String(faceToggle.checked) : 'true'),
                api.saveSetting('require_location_tracking', locToggle ? String(locToggle.checked) : 'true')
            ]);
            toast.success('Pengaturan sistem berhasil disimpan!');
        } catch (error) {
            console.error('Error saving system settings:', error);
            toast.error('Gagal menyimpan pengaturan sistem');
        }
    },

    async saveSignatureSettings() {
        const kasubagName = document.getElementById('setting-kasubag-name');
        const kasubagNip = document.getElementById('setting-kasubag-nip');
        const camatName = document.getElementById('setting-camat-name');
        const camatNip = document.getElementById('setting-camat-nip');

        try {
            await Promise.all([
                api.saveSetting('signature_kasubag_name', kasubagName ? kasubagName.value : ''),
                api.saveSetting('signature_kasubag_nip', kasubagNip ? kasubagNip.value : ''),
                api.saveSetting('signature_camat_name', camatName ? camatName.value : ''),
                api.saveSetting('signature_camat_nip', camatNip ? camatNip.value : '')
            ]);
            toast.success('Informasi tanda tangan berhasil disimpan!');
        } catch (error) {
            console.error('Error saving signature settings:', error);
            toast.error('Gagal menyimpan informasi tanda tangan');
        }
    },

    renderShifts() {
        const container = document.getElementById('shifts-list');
        if (!container) return;

        if (this.shifts.length === 0) {
            container.innerHTML = '<p class="empty-state">Belum ada shift</p>';
            return;
        }

        container.innerHTML = this.shifts.map((shift, index) => `
            <div class="shift-item" data-index="${index}">
                <div class="shift-input-group">
                    <label>Nama Shift</label>
                    <input type="text" value="${shift.name}" placeholder="Nama Shift" 
                           onchange="settings.updateShift(${index}, 'name', this.value)">
                </div>
                <div class="shift-input-group">
                    <label>Jam Masuk</label>
                    <input type="time" value="${shift.startTime}" 
                           onchange="settings.updateShift(${index}, 'startTime', this.value)">
                </div>
                <div class="shift-input-group">
                    <label>Jam Pulang</label>
                    <input type="time" value="${shift.endTime}" 
                           onchange="settings.updateShift(${index}, 'endTime', this.value)">
                </div>
                <button type="button" class="btn-delete-shift" onclick="settings.deleteShift(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    },

    async addShift() {
        const newShift = {
            name: 'Shift Baru',
            startTime: '09:00',
            endTime: '18:00'
        };

        try {
            const result = await api.addShift(newShift);
            if (result.success) {
                this.shifts.push(result.data);
                this.renderShifts();
                toast.success('Shift baru ditambahkan!');
            }
        } catch (error) {
            console.error('Error adding shift:', error);
        }
    },

    async updateShift(index, field, value) {
        if (this.shifts[index]) {
            this.shifts[index][field] = value;
            try {
                await api.updateShift(this.shifts[index].id, { [field]: value });
                toast.success('Shift berhasil diperbarui!');
            } catch (error) {
                console.error('Error updating shift:', error);
            }
        }
    },

    async deleteShift(index) {
        if (confirm('Apakah Anda yakin ingin menghapus shift ini?')) {
            try {
                const shiftId = this.shifts[index].id;
                await api.deleteShift(shiftId);
                this.shifts.splice(index, 1);
                this.renderShifts();
                toast.info('Shift dihapus');
            } catch (error) {
                console.error('Error deleting shift:', error);
            }
        }
    },

    getShiftOptions() {
        return this.shifts.map(shift => ({
            value: shift.name,
            label: `${shift.name} (${shift.startTime} - ${shift.endTime})`
        }));
    }
};

// Global init function
window.initSettings = () => {
    settings.init();
};

// Expose settings object
window.settings = settings;
