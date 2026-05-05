/**
 * SIAP-P3KPW - API Layer
 * Abstraction layer for backend communication
 */

const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbxFgKWLI2C3_wnIE9dotC3sdFsfTizWL2DeN_WnzA_leUhyb_AnSrqm-cpavOwlaM6n/exec';

const api = {

    // ========== CORE REQUEST ==========

    async request(action, data = {}) {
        console.log(`[API] Request: ${action}`, data);
        if (!API_BASE_URL) {
            return this._localFallback(action, data);
        }

        try {
            const response = await fetch(API_BASE_URL, {
                method: 'POST',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action, ...data })
            });

            const text = await response.text();
            console.log(`[API] Response Text (${action}):`, text.substring(0, 100));
            try {
                const json = JSON.parse(text);
                console.log(`[API] Response JSON (${action}):`, json);
                return json;
            } catch (e) {
                console.error('Failed to parse response:', text.substring(0, 200));
                return { success: false, error: 'Invalid response from server' };
            }
        } catch (error) {
            console.error('API Error:', error);
            return this._localFallback(action, data);
        }
    },

    // ========== AUTH ==========

    async login(email, password) {
        return this.request('login', { email, password });
    },

    async changePassword(userId, oldPassword, newPassword) {
        return this.request('changePassword', { userId, oldPassword, newPassword });
    },

    async getEmployeeProfile(userId) {
        return this.request('getEmployeeProfile', { userId });
    },

    async updateOnlineStatus(userId, isOnline) {
        return this.request('updateOnlineStatus', { userId, isOnline });
    },

    // ========== ATTENDANCE ==========

    async getAttendance(userId) {
        return this.request('getAttendance', { userId });
    },

    async getTodayAttendance(userId) {
        return this.request('getTodayAttendance', { userId });
    },

    async saveAttendance(data) {
        return this.request('saveAttendance', data);
    },

    async getAllAttendance(month) {
        return this.request('getAllAttendance', { month });
    },

    // ========== JOURNALS ==========

    async getJournals(userId) {
        return this.request('getJournals', { userId });
    },

    async saveJournal(data) {
        return this.request('saveJournal', data);
    },

    async getAllJournals(month) {
        return this.request('getAllJournals', { month });
    },

    // ========== LEAVES (CUTI) ==========

    async getLeaves(userId) {
        return this.request('getLeaves', { userId });
    },

    async submitLeave(data) {
        return this.request('submitLeave', data);
    },

    async approveLeave(id) {
        return this.request('approveLeave', { id });
    },

    async rejectLeave(id) {
        return this.request('rejectLeave', { id });
    },

    async getAllLeaves(month) {
        return this.request('getAllLeaves', { month });
    },

    // ========== IZIN / PERMISSION ==========

    async getIzin(userId) {
        return this.request('getIzin', { userId });
    },

    async submitIzin(data) {
        return this.request('submitIzin', data);
    },

    async approveIzin(id) {
        return this.request('approveIzin', { id });
    },

    async rejectIzin(id) {
        return this.request('rejectIzin', { id });
    },

    async getAllIzin(month) {
        return this.request('getAllIzin', { month });
    },

    async getActiveWfhPermit(userId) {
        return this.request('getActiveWfhPermit', { userId });
    },

    // ========== EMPLOYEES ==========

    async getEmployees() {
        return this.request('getEmployees');
    },

    async addEmployee(data) {
        return this.request('addEmployee', data);
    },

    async updateEmployee(id, data) {
        return this.request('updateEmployee', { id, ...data });
    },

    async deleteEmployee(id) {
        return this.request('deleteEmployee', { id });
    },

    // ========== SETTINGS ==========

    async getSettings() {
        return this.request('getSettings');
    },

    async saveSetting(key, value) {
        return this.request('saveSetting', { key, value });
    },

    // ========== SHIFTS ==========

    async getShifts() {
        return this.request('getShifts');
    },

    async addShift(data) {
        return this.request('addShift', data);
    },

    async updateShift(id, data) {
        return this.request('updateShift', { id, ...data });
    },

    async deleteShift(id) {
        return this.request('deleteShift', { id });
    },

    // ========== SCHEDULE ==========

    async getSchedule(month, year) {
        return this.request('getSchedule', { month, year });
    },

    async saveSchedule(data) {
        return this.request('saveSchedule', data);
    },

    // ========== AI FACE RECOGNITION ==========

    async registerFace(userId, descriptor, photo) {
        return this.request('registerFace', { userId, descriptor, photo });
    },

    _localFallback(action, data) {
        console.warn(`API Fallback: ${action} - using localStorage`);
        const localData = storage.get(action.replace('get', '').toLowerCase(), []);
        return { success: true, data: localData };
    }
};

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

// Helper: normalize image URLs
window.normalizeImageUrl = function (url) {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('data:image')) return url;
    const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[a-zA-Z0-9=&]*&)?id=)|docs\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[a-zA-Z0-9=&]*&)?id=))([a-zA-Z0-9_-]+)/;
    const match = url.match(driveRegex);
    if (match && match[1]) {
        return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
    return url;
};
