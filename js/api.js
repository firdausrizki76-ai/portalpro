/**
 * SIAP-P3KPW - API Layer
 * Abstraction layer for backend communication
 * 
 * Mode:
 * - Jika API_BASE_URL kosong → fallback ke localStorage (untuk testing lokal)
 * - Jika API_BASE_URL diisi → semua request dikirim ke Google Apps Script
 */

const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbwWfN84WXxHN2OL-35JQ2t0IqVJF9fUVvdqoRWJ-JkVqrw44VWb4LnYzEQsWyIppiOD/exec'; // v41 DB-first registration (stable URL)

const api = {

    // ========== CORE REQUEST ==========

    async request(action, data = {}) {
        if (!API_BASE_URL) {
            return this._localFallback(action, data);
        }

        const isFaceRegAction = action === 'registerFace';
        const timeoutMs = isFaceRegAction ? 90000 : 20000;

        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT_' + action)), timeoutMs)
            );

            const payload = JSON.stringify({ action, ...data });
            console.log(`API Request: ${action} (${payload.length} bytes, timeout: ${timeoutMs}ms)`);

            // GAS requires very specific fetch config to handle CORS redirects
            const fetchPromise = fetch(API_BASE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: payload
            }).then(async res => {
                const text = await res.text();
                console.log(`API Response (${action}):`, text.substring(0, 100));
                try {
                    return JSON.parse(text);
                } catch (e) {
                    console.error('Parse error:', text.substring(0, 300));
                    return { success: false, error: 'Server returned invalid JSON: ' + text.substring(0, 100) };
                }
            });

            return await Promise.race([fetchPromise, timeoutPromise]);

        } catch (error) {
            console.error(`API Error (${action}):`, error.message);
            if (error.message && error.message.startsWith('TIMEOUT_')) {
                return { success: false, error: 'Server tidak merespons setelah menunggu. Cek koneksi internet Anda.' };
            }
            return this._localFallback(action, data);
        }
    },

    // ========== AUTH ==========

    async login(email, password) {
        if (!API_BASE_URL) {
            return this._localLogin(email, password);
        }
        return this.request('login', { email, password });
    },

    async changePassword(userId, oldPassword, newPassword) {
        if (!API_BASE_URL) {
            return { success: true, data: { message: 'Password changed (local)' } };
        }
        return this.request('changePassword', { userId, oldPassword, newPassword });
    },

    async getEmployeeProfile(userId) {
        if (!API_BASE_URL) {
            return { success: true, data: {} };
        }
        return this.request('getEmployeeProfile', { userId });
    },

    async updateOnlineStatus(userId, isOnline) {
        if (!API_BASE_URL) {
            let all = storage.get('admin_employees', []);
            let idx = all.findIndex(e => String(e.id) === String(userId) || String(e.email) === String(userId));
            if (idx >= 0) {
                all[idx].isOnline = isOnline;
                storage.set('admin_employees', all);
            }
            return { success: true };
        }
        return this.request('updateOnlineStatus', { userId, isOnline });
    },

    // ========== ATTENDANCE ==========

    async getAttendance(userId) {
        if (!API_BASE_URL) {
            const all = storage.get('attendance', []);
            return { success: true, data: all };
        }
        return this.request('getAttendance', { userId });
    },

    async getTodayAttendance(userId) {
        if (!API_BASE_URL) {
            const today = dateTime.getLocalDate();
            const all = storage.get('attendance', []);
            const todayRecord = all.find(a => a.date === today);
            return {
                success: true,
                data: todayRecord || {
                    date: today, shift: 'Pagi', clockIn: null, clockOut: null,
                    breakStart: null, breakEnd: null, overtimeStart: null, status: 'waiting'
                }
            };
        }
        return this.request('getTodayAttendance', { userId });
    },

    async saveAttendance(data) {
        if (!API_BASE_URL) {
            // Check Alfa status for Local Fallback
            if (!data.clockOut && !data.overtimeStart) {
                const now = new Date();
                const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();

                // Get shift start time
                let shiftStartTimeStr = "08:00"; // fallback
                const shifts = storage.get('shifts', []);
                const userShift = shifts.find(s => String(s.name) === String(data.shift));
                if (userShift && userShift.startTime) {
                    shiftStartTimeStr = userShift.startTime.replace('.', ':');
                }
                const [sH, sM] = shiftStartTimeStr.split(':').map(Number);
                const shiftStartInMinutes = (sH || 0) * 60 + (sM || 0);

                if (currentTimeInMinutes > (shiftStartInMinutes + 60) && !data.clockIn) {
                    return { 
                        success: false, 
                        error: 'Batas waktu absen (Alfa) telah berakhir.' 
                    };
                }
            }

            const all = storage.get('attendance', []);
            const idx = all.findIndex(a => a.date === data.date);
            if (idx >= 0) { all[idx] = data; } else { all.unshift(data); }
            storage.set('attendance', all);
            return { success: true, data: data };
        }
        return this.request('saveAttendance', data);
    },

    async getAllAttendance(month) {
        if (!API_BASE_URL) {
            let all = storage.get('attendance', []);
            if (month) all = all.filter(a => a.date && a.date.startsWith(month));
            return { success: true, data: all };
        }
        return this.request('getAllAttendance', { month });
    },

    // ========== JOURNALS ==========

    async getJournals(userId) {
        if (!API_BASE_URL) {
            return { success: true, data: storage.get('jurnals', []) };
        }
        return this.request('getJournals', { userId });
    },

    async saveJournal(data) {
        if (!API_BASE_URL) {
            const all = storage.get('jurnals', []);
            const idx = all.findIndex(j => j.date === data.date);
            if (idx >= 0) { all[idx] = data; } else { all.unshift(data); }
            storage.set('jurnals', all);
            return { success: true, data: data };
        }
        return this.request('saveJournal', data);
    },

    async getAllJournals(month) {
        if (!API_BASE_URL) {
            let all = storage.get('jurnals', []);
            if (month) all = all.filter(j => j.date && j.date.startsWith(month));
            return { success: true, data: all };
        }
        return this.request('getAllJournals', { month });
    },

    // ========== LEAVES (CUTI) ==========

    async getLeaves(userId) {
        if (!API_BASE_URL) {
            return { success: true, data: storage.get('leaves', []) };
        }
        return this.request('getLeaves', { userId });
    },

    async submitLeave(data) {
        if (!API_BASE_URL) {
            const all = storage.get('leaves', []);
            data.id = Date.now();
            data.status = 'pending';
            data.appliedAt = new Date().toISOString();
            all.unshift(data);
            storage.set('leaves', all);
            return { success: true, data: data };
        }
        return this.request('submitLeave', data);
    },

    async approveLeave(id) {
        if (!API_BASE_URL) {
            const all = storage.get('leaves', []);
            const leave = all.find(l => l.id === id);
            if (leave) { leave.status = 'approved'; storage.set('leaves', all); }
            return { success: true, data: leave };
        }
        return this.request('approveLeave', { id });
    },

    async rejectLeave(id) {
        if (!API_BASE_URL) {
            const all = storage.get('leaves', []);
            const leave = all.find(l => l.id === id);
            if (leave) { leave.status = 'rejected'; storage.set('leaves', all); }
            return { success: true, data: leave };
        }
        return this.request('rejectLeave', { id });
    },

    async getAllLeaves(month) {
        if (!API_BASE_URL) {
            let all = storage.get('leaves', []);
            if (month) all = all.filter(l => (l.startDate && l.startDate.startsWith(month)) || (l.endDate && l.endDate.startsWith(month)));
            return { success: true, data: all };
        }
        return this.request('getAllLeaves', { month });
    },

    // ========== IZIN / PERMISSION ==========

    async getIzin(userId) {
        if (!API_BASE_URL) {
            return { success: true, data: storage.get('izin', []) };
        }
        return this.request('getIzin', { userId });
    },

    async submitIzin(data) {
        if (!API_BASE_URL) {
            const all = storage.get('izin', []);
            data.id = Date.now();
            data.status = 'pending';
            data.appliedAt = new Date().toISOString();
            all.unshift(data);
            storage.set('izin', all);
            return { success: true, data: data };
        }
        return this.request('submitIzin', data);
    },

    async approveIzin(id) {
        if (!API_BASE_URL) {
            const all = storage.get('izin', []);
            const item = all.find(i => i.id === id);
            if (item) { item.status = 'approved'; storage.set('izin', all); }
            return { success: true, data: item };
        }
        return this.request('approveIzin', { id });
    },

    async rejectIzin(id) {
        if (!API_BASE_URL) {
            const all = storage.get('izin', []);
            const item = all.find(i => i.id === id);
            if (item) { item.status = 'rejected'; storage.set('izin', all); }
            return { success: true, data: item };
        }
        return this.request('rejectIzin', { id });
    },

    async getAllIzin(month) {
        if (!API_BASE_URL) {
            let all = storage.get('izin', []);
            if (month) all = all.filter(i => i.date && i.date.startsWith(month));
            return { success: true, data: all };
        }
        return this.request('getAllIzin', { month });
    },

    // ========== EMPLOYEES ==========

    async getEmployees() {
        if (!API_BASE_URL) {
            return { success: true, data: storage.get('admin_employees', []) };
        }
        return this.request('getEmployees');
    },

    async addEmployee(data) {
        if (!API_BASE_URL) {
            const all = storage.get('admin_employees', []);
            if (all.some(e => e.email === data.email)) {
                return { success: false, error: 'Email sudah terdaftar' };
            }
            data.id = Date.now();
            if (!data.avatar) {
                data.avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=F59E0B&color=fff`;
            }
            all.unshift(data);
            storage.set('admin_employees', all);
            return { success: true, data: data };
        }
        return this.request('addEmployee', data);
    },

    async updateEmployee(id, data) {
        if (!API_BASE_URL) {
            const all = storage.get('admin_employees', []);
            const idx = all.findIndex(e => e.id === id);
            if (idx >= 0) { Object.assign(all[idx], data); storage.set('admin_employees', all); }
            return { success: true, data: all[idx] };
        }
        return this.request('updateEmployee', { id, ...data });
    },

    async deleteEmployee(id) {
        if (!API_BASE_URL) {
            let all = storage.get('admin_employees', []);
            all = all.filter(e => e.id !== id);
            storage.set('admin_employees', all);
            return { success: true, data: { id } };
        }
        return this.request('deleteEmployee', { id });
    },

    // ========== SETTINGS ==========

    async getSettings() {
        if (!API_BASE_URL) {
            const company = storage.get('company', { name: 'SIAP-P3KPW', logo: '' });
            return {
                success: true,
                data: { company_name: company.name, company_logo: company.logo }
            };
        }
        return this.request('getSettings');
    },

    async setupDailyTrigger() {
        if (!API_BASE_URL) return { success: true };
        return this.request('setupDailyTrigger');
    },

    async repairDatabase() {
        if (!API_BASE_URL) return { success: true };
        return this.request('repairDatabase');
    },

    async saveSetting(key, value) {
        if (!API_BASE_URL) {
            if (key === 'company_name' || key === 'company_logo') {
                const company = storage.get('company', { name: '', logo: '' });
                if (key === 'company_name') company.name = value;
                if (key === 'company_logo') company.logo = value;
                storage.set('company', company);
            }
            return { success: true, data: { key, value } };
        }
        return this.request('saveSetting', { key, value });
    },

    // ========== SHIFTS ==========

    async getShifts() {
        if (!API_BASE_URL) {
            return { success: true, data: storage.get('shifts', []) };
        }
        return this.request('getShifts');
    },

    async addShift(data) {
        if (!API_BASE_URL) {
            const all = storage.get('shifts', []);
            data.id = Date.now();
            all.push(data);
            storage.set('shifts', all);
            return { success: true, data: data };
        }
        return this.request('addShift', data);
    },

    async updateShift(id, data) {
        if (!API_BASE_URL) {
            const all = storage.get('shifts', []);
            const idx = all.findIndex(s => s.id === id || s.id === Number(id));
            if (idx >= 0) { Object.assign(all[idx], data); storage.set('shifts', all); }
            return { success: true, data: all[idx] };
        }
        return this.request('updateShift', { id, ...data });
    },

    async deleteShift(id) {
        if (!API_BASE_URL) {
            let all = storage.get('shifts', []);
            all = all.filter(s => s.id !== id && s.id !== Number(id));
            storage.set('shifts', all);
            return { success: true, data: { id } };
        }
        return this.request('deleteShift', { id });
    },

    // ========== SCHEDULE ==========

    async getSchedule(month, year) {
        if (!API_BASE_URL) {
            const key = `schedule_${year}_${month}`;
            return { success: true, data: storage.get(key, {}) };
        }
        return this.request('getSchedule', { month, year });
    },

    async saveSchedule(data) {
        if (!API_BASE_URL) {
            const key = `schedule_${data.year}_${data.month}`;
            storage.set(key, data.schedule || {});
            return { success: true };
        }
        return this.request('saveSchedule', data);
    },

    // ========== AI FACE RECOGNITION ==========

    async registerFace(userId, descriptor, photo) {
        if (!API_BASE_URL) {
            // Local fallback
            const employees = storage.get('admin_employees', []);
            const idx = employees.findIndex(e => String(e.id) === String(userId));
            if (idx >= 0) {
                employees[idx].faceData = JSON.stringify(descriptor);
                storage.set('admin_employees', employees);
            }
            return { success: true, data: { faceData: descriptor } };
        }
        return this.request('registerFace', { userId, descriptor, photo });
    },

    // ========== LOCAL AUTH FALLBACK ==========

    _localLogin(email, password) {
        // In local mode, accept any login with role selection
        // This matches the original frontend behavior
        return { success: true, data: null }; // null means use frontend logic
    },

    _localFallback(action, data) {
        console.warn(`API Fallback: ${action} - using localStorage`);
        // This shouldn't be called normally since each method has its own fallback
        return { success: false, error: 'No fallback for action: ' + action };
    }
};

// Expose to global
window.api = api;

// Helper: always return a valid avatar URL
window.getAvatarUrl = function (emp) {
    if (emp && emp.avatar && emp.avatar.startsWith('http')) {
        return emp.avatar;
    }
    const name = (emp && emp.name) ? emp.name : 'User';
    const colors = ['3B82F6', '10B981', '1E3A8A', 'EF4444', '8B5CF6', 'EC4899', '14B8A6', '6B7280'];
    const colorIdx = name.charCodeAt(0) % colors.length;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${colors[colorIdx]}&color=fff`;
};
