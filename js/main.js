/**
 * SIAP-P3KPW - Main JavaScript
 * Utility functions and shared functionality
 */

// Global Page Loader
var loader = {
    element: null,

    init() {
        this.element = document.getElementById('global-loader');
    },

    show(message = 'Sedang memuat data, mohon tunggu...') {
        if (!this.element) this.init();
        if (this.element) {
            const textEl = this.element.querySelector('.loader-text');
            if (textEl) textEl.textContent = message;
            this.element.classList.remove('hidden');
            
            // Failsafe: hide loader anyway after 20 seconds to prevent total lock
            clearTimeout(this.failsafe);
            this.failsafe = setTimeout(() => {
                if (!this.element.classList.contains('hidden')) {
                    console.warn('Loader failsafe triggered (20s timeout)');
                    this.hide();
                }
            }, 20000);
        }
    },

    hide() {
        if (!this.element) this.init();
        if (this.element) {
            // Small delay for smooth transition
            setTimeout(() => {
                this.element.classList.add('hidden');
            }, 300);
        }
    }
};

/**
 * Global Smart Sync Logic
 * Resets all module's 'initialized' flags and reloads current data.
 */
window.syncData = async function() {
    if (typeof loader !== 'undefined') {
        loader.show('Sinkronisasi database terbaru...');
    }

    try {
        // Step 1: Trigger backend repair/alignment
        if (typeof api !== 'undefined' && api.repairDatabase) {
            console.log('Sync: Triggering backend repairDatabase...');
            const repairResult = await api.repairDatabase();
            if (repairResult && repairResult.success) {
                console.log('Sync: Backend repair successful');
            }
        }

        // List of all page modules that have an 'initialized' flag
        const modules = [
            'dashboard', 'absensi', 'faceRecognition', 'izin', 'jurnal', 'cuti',
            'adminDashboard', 'adminEmployees', 'adminReports', 'shiftSchedule', 'settings'
        ];

        // Reset all modules to non-initialized state
        modules.forEach(m => {
            if (window[m]) {
                window[m].initialized = false;
            }
        });

        // Re-trigger the current page's initialization
        if (typeof router !== 'undefined' && router.currentPage) {
            router.showPage(router.currentPage, false);
        }

        if (typeof toast !== 'undefined') {
            toast.success('Inkronisasi database berhasil.');
        }

    } catch (error) {
        console.error('Sync Error:', error);
        if (typeof toast !== 'undefined') {
            toast.error('Gagal sinkronisasi: ' + error.message);
        }
    } finally {
        if (typeof loader !== 'undefined') {
            loader.hide();
        }
    }
};

// Storage Manager
var storage = {
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            return false;
        }
    },

    remove(key) {
        localStorage.removeItem(key);
    },

    clear() {
        localStorage.clear();
    }
};

// Toast Notification System
var toast = {
    container: null,

    init() {
        this.container = document.getElementById('toast-container');
    },

    show(message, type = 'info', title = '', duration = 3000) {
        if (!this.container) this.init();

        const icons = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        const titles = {
            success: 'Berhasil',
            error: 'Error',
            warning: 'Peringatan',
            info: 'Info'
        };

        const toastEl = document.createElement('div');
        toastEl.className = `toast ${type}`;
        toastEl.innerHTML = `
            <div class="toast-icon">
                <i class="fas ${icons[type]}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-title">${title || titles[type]}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        this.container.appendChild(toastEl);

        // Auto remove
        setTimeout(() => {
            toastEl.style.opacity = '0';
            toastEl.style.transform = 'translateX(100%)';
            setTimeout(() => toastEl.remove(), 300);
        }, duration);
    },

    success(message, title) {
        this.show(message, 'success', title);
    },

    error(message, title) {
        this.show(message, 'error', title);
    },

    warning(message, title) {
        this.show(message, 'warning', title);
    },

    info(message, title) {
        this.show(message, 'info', title);
    }
};

// Notification Manager
var notifications = {
    list: [],
    badge: null,
    dropdown: null,

    async init() {
        this.badge = document.getElementById('notification-badge');
        this.dropdown = document.getElementById('notification-dropdown');
        
        const currentUser = auth.getCurrentUser();
        if (!currentUser) return;

        const recipientId = auth.isAdmin() ? 'admin' : currentUser.id;
        
        try {
            const result = await api.getNotifications(recipientId);
            this.list = result.success ? result.data : [];
        } catch (e) {
            console.error('Error fetching notifications:', e);
            this.list = storage.get('notifications_' + recipientId, []);
        }

        this.render();
        this.setupEventListeners();
    },

    setList(newList) {
        this.list = newList.slice(0, 20);
        this.render();
    },

    setupEventListeners() {
        const btnToggle = document.getElementById('btn-notifications');
        const btnClear = document.getElementById('btn-clear-notifications');
        const btnClose = document.getElementById('btn-close-notifications');

        if (btnToggle) {
            btnToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle();
            });
        }

        if (btnClear) {
            btnClear.addEventListener('click', () => this.clearAll());
        }

        if (btnClose) {
            btnClose.addEventListener('click', () => this.toggle(false));
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.dropdown && !this.dropdown.classList.contains('hidden')) {
                if (!this.dropdown.contains(e.target)) {
                    this.toggle(false);
                }
            }
        });
    },

    toggle(force) {
        if (!this.dropdown) return;
        
        const isHidden = this.dropdown.classList.contains('hidden');
        const shouldHide = force !== undefined ? !force : !isHidden;
        
        if (shouldHide) {
            this.dropdown.classList.add('hidden');
        } else {
            this.dropdown.classList.remove('hidden');
        }
    },

    async add(recipientId, user, action, type = 'info') {
        const currentUser = auth.getCurrentUser();
        const initiator = user || (currentUser ? currentUser.name : 'Sistem');
        
        const newNotif = {
            id: Date.now(),
            recipientId: recipientId,
            user: initiator,
            action: action,
            time: new Date().toISOString(),
            avatar: getAvatarUrl({name: initiator}),
            type: type
        };

        // UI Update (Optimistic)
        const myRecipientId = auth.isAdmin() ? 'admin' : (currentUser ? currentUser.id : '');
        if (String(recipientId) === String(myRecipientId)) {
            this.list.unshift(newNotif);
            if (this.list.length > 20) this.list.pop();
            this.render();
            toast.info(`${initiator} ${action}`, 'Notifikasi Baru');
        }

        // Backend Save
        try {
            await api.addNotification(recipientId, type, initiator, action);
        } catch (e) {
            console.error('Error adding backend notification:', e);
        }
    },

    async clearAll() {
        if (confirm('Hapus semua notifikasi?')) {
            const currentUser = auth.getCurrentUser();
            const recipientId = auth.isAdmin() ? 'admin' : currentUser?.id;
            
            this.list = [];
            this.render();
            
            try {
                await api.clearNotifications(recipientId);
                toast.success('Notifikasi dihapus');
            } catch (e) {
                console.error('Error clearing notifications:', e);
            }
        }
    },

    render() {
        const container = document.getElementById('notification-list');
        const badge = document.getElementById('notification-badge');

        if (!container) return;

        if (this.list.length === 0) {
            container.innerHTML = '<div class="notification-empty">Tidak ada notifikasi baru</div>';
            if (badge) badge.textContent = '0';
        } else {
            container.innerHTML = this.list.map(notif => {
                const avatarUrl = notif.avatar || getAvatarUrl({name: notif.user});
                const timeStr = typeof notif.time === 'string' && notif.time.includes('T') 
                    ? dateTime.formatTime(notif.time) 
                    : (notif.time || 'Baru saja');
                
                return `
                    <div class="notification-item">
                        <img src="${avatarUrl}" alt="${notif.user}" class="notif-avatar">
                        <div class="notif-content">
                            <div class="notif-text"><strong>${notif.user}</strong> ${notif.action}</div>
                            <div class="notif-time">${timeStr}</div>
                        </div>
                    </div>
                `;
            }).join('');
            if (badge) badge.textContent = this.list.length;
        }
    }
};

// Date & Time Utilities
var dateTime = {
    formatDate(date, format = 'full') {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '-';

        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

        const monthName = months[d.getMonth()] || '';
        const dayName = days[d.getDay()] || '';
        const day = d.getDate();
        const year = d.getFullYear();

        if (format === 'full') {
            return `${dayName}, ${day} ${monthName} ${year}`;
        } else if (format === 'short') {
            const shortMonth = monthName.substring(0, 3);
            return `${day} ${shortMonth} ${year}`;
        } else if (format === 'day') {
            return dayName;
        }
        return `${day}/${d.getMonth() + 1}/${year}`;
    },

    formatTime(date) {
        const d = new Date(date);
        return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    },

    formatDateTime(date) {
        return `${this.formatDate(date)} ${this.formatTime(date)}`;
    },

    getCurrentTime() {
        return new Date().toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    },

    getCurrentDate() {
        return this.formatDate(new Date());
    },

    getLocalDate(offset = 0) {
        const today = new Date();
        if (offset !== 0) today.setDate(today.getDate() + offset);
        return new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    },

    formatLocalDate(date) {
        if (!date) return '';
        const d = new Date(date);
        return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    },

    getGreeting: function() {
        var hour = new Date().getHours();
        if (hour < 11) return 'Selamat Pagi';
        if (hour < 15) return 'Selamat Siang';
        if (hour < 18) return 'Selamat Sore';
        return 'Selamat Malam';
    },

    isValidDate: function(dateString) {
        if (!dateString) return false;
        var d = new Date(dateString);
        return !isNaN(d.getTime());
    },

    calculateDuration: function(start, end) {
        if (!start || !end) return '-';
        var startTime = new Date('2000-01-01 ' + start);
        var endTime = new Date('2000-01-01 ' + end);
        var diff = endTime - startTime;

        if (isNaN(diff) || diff < 0) return '-';

        var hours = Math.floor(diff / 3600000);
        var minutes = Math.floor((diff % 3600000) / 60000);

        return hours + 'j ' + minutes + 'm';
    }
};

// Form Utilities
var formUtils = {
    serialize(form) {
        const formData = new FormData(form);
        const data = {};
        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }
        return data;
    },

    validate(form) {
        const inputs = form.querySelectorAll('input[required], textarea[required], select[required]');
        let isValid = true;

        inputs.forEach(input => {
            if (!input.value.trim()) {
                isValid = false;
                input.classList.add('error');
                input.addEventListener('input', () => input.classList.remove('error'), { once: true });
            }
        });

        return isValid;
    },

    clear(form) {
        form.reset();
        form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
    }
};

// Modal Manager
var modal = {
    el: null,
    title: null,
    content: null,
    footer: null,

    init() {
        this.el = document.getElementById('global-modal');
        this.title = document.getElementById('modal-title');
        this.content = document.getElementById('modal-content');
        this.footer = document.getElementById('modal-footer');
    },

    show(title, content, buttons = []) {
        console.log('modal.show called', { title, buttonsCount: buttons.length });
        if (!this.el) this.init();

        if (!this.el) {
            console.error('Modal element #global-modal not found!');
            return;
        }

        this.title.textContent = title;
        this.content.innerHTML = content;
        
        // Render buttons
        this.footer.innerHTML = '';
        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.className = `btn ${btn.class || 'btn-secondary'}`;
            button.textContent = btn.label;
            button.onclick = btn.onClick || this.close;
            this.footer.appendChild(button);
        });

        this.el.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    close() {
        const modalEl = document.getElementById('global-modal');
        if (modalEl) {
            modalEl.style.display = 'none';
            document.body.style.overflow = '';
        }
    }
};

// Animation Utilities
var animations = {
    fadeIn(element, duration = 300) {
        element.style.opacity = '0';
        element.style.display = 'block';
        element.style.transition = `opacity ${duration}ms ease`;

        requestAnimationFrame(() => {
            element.style.opacity = '1';
        });
    },

    fadeOut(element, duration = 300) {
        element.style.transition = `opacity ${duration}ms ease`;
        element.style.opacity = '0';

        setTimeout(() => {
            element.style.display = 'none';
        }, duration);
    },

    slideDown(element, duration = 300) {
        element.style.maxHeight = '0';
        element.style.overflow = 'hidden';
        element.style.transition = `max-height ${duration}ms ease`;

        requestAnimationFrame(() => {
            element.style.maxHeight = element.scrollHeight + 'px';
        });
    }
};

// Initialize default data
function initializeData() {
    // Company settings
    if (!storage.get('company')) {
        storage.set('company', {
            name: 'SIAP-P3KPW',
            logo: ''
        });
    }

    // Shifts
    if (!storage.get('shifts')) {
        storage.set('shifts', [
            { id: 1, name: 'Pagi', startTime: '08:00', endTime: '17:00' },
            { id: 2, name: 'Siang', startTime: '14:00', endTime: '23:00' },
            { id: 3, name: 'Malam', startTime: '23:00', endTime: '08:00' }
        ]);
    }

    // Dummy attendance data
    if (!storage.get('attendance')) {
        storage.set('attendance', []);
    }

    // Dummy jurnal data
    if (!storage.get('jurnals')) {
        storage.set('jurnals', []);
    }

    // Dummy leave data
    if (!storage.get('leaves')) {
        storage.set('leaves', [
            {
                id: 1,
                type: 'annual',
                typeLabel: 'Cuti Tahunan',
                startDate: '2026-03-15',
                endDate: '2026-03-17',
                duration: 3,
                reason: 'Liburan keluarga',
                status: 'pending',
                appliedAt: '2026-03-01'
            },
            {
                id: 2,
                type: 'sick',
                typeLabel: 'Cuti Sakit',
                startDate: '2026-02-20',
                endDate: '2026-02-20',
                duration: 1,
                reason: 'Demam dan flu',
                status: 'approved',
                appliedAt: '2026-02-19'
            },
            {
                id: 3,
                type: 'important',
                typeLabel: 'Cuti Penting',
                startDate: '2026-02-10',
                endDate: '2026-02-10',
                duration: 1,
                reason: 'Urusan keluarga',
                status: 'rejected',
                appliedAt: '2026-02-08'
            }
        ]);
    }

    // Dummy izin data
    if (!storage.get('izin')) {
        storage.set('izin', []);
    }

    // Dummy admin employees data
    if (!storage.get('admin_employees')) {
        storage.set('admin_employees', [
            { id: 1, name: 'Ahmad Rizky', email: 'ahmad@company.com', department: 'IT', position: 'Developer', shift: 'Pagi', status: 'active', joinDate: '2024-01-15', avatar: 'https://ui-avatars.com/api/?name=Ahmad&background=3B82F6&color=fff' },
            { id: 2, name: 'Budi Santoso', email: 'budi@company.com', department: 'HR', position: 'HR Manager', shift: 'Pagi', status: 'active', joinDate: '2023-06-01', avatar: 'https://ui-avatars.com/api/?name=Budi&background=10B981&color=fff' },
            { id: 3, name: 'Citra Dewi', email: 'citra@company.com', department: 'Finance', position: 'Accountant', shift: 'Pagi', status: 'on-leave', joinDate: '2024-03-10', avatar: 'https://ui-avatars.com/api/?name=Citra&background=003399&color=fff' },
            { id: 4, name: 'Dedi Pratama', email: 'dedi@company.com', department: 'Marketing', position: 'Marketing Staff', shift: 'Siang', status: 'active', joinDate: '2024-02-20', avatar: 'https://ui-avatars.com/api/?name=Dedi&background=EF4444&color=fff' },
            { id: 5, name: 'Eka Putri', email: 'eka@company.com', department: 'IT', position: 'UI/UX Designer', shift: 'Pagi', status: 'active', joinDate: '2024-01-05', avatar: 'https://ui-avatars.com/api/?name=Eka&background=8B5CF6&color=fff' },
            { id: 6, name: 'Fajar Nugraha', email: 'fajar@company.com', department: 'Operations', position: 'Supervisor', shift: 'Malam', status: 'inactive', joinDate: '2023-09-12', avatar: 'https://ui-avatars.com/api/?name=Fajar&background=6B7280&color=fff' }
        ]);
    }
}

// Update company name in UI
function updateCompanyUI() {
    const company = storage.get('company', { name: 'SIAP-P3KPW' });

    const elements = {
        'login-company-name': company.name,
        'footer-company': company.name
    };

    Object.entries(elements).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    });

    document.title = company.name;
}

// DOM Ready
function onDOMReady(callback) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback);
    } else {
        callback();
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Temporary one-time cleanup for old branding
    if (!storage.get('branding_version_v1')) {
        storage.clear();
        storage.set('branding_version_v1', true);
        window.location.reload();
        return;
    }
    
    initializeData();
    updateCompanyUI();
    notifications.init();

    // Update time display
    const timeEl = document.getElementById('current-time');
    if (timeEl) {
        setInterval(() => {
            const now = new Date();
            const time = timeEl.querySelector('.time');
            const date = timeEl.querySelector('.date');
            if (time) time.textContent = dateTime.formatTime(now);
            if (date) date.textContent = dateTime.formatDate(now);
        }, 1000);
    }
});

// Export for other modules
window.storage = storage;
window.toast = toast;
window.modal = modal;
window.dateTime = dateTime;
window.formUtils = formUtils;
window.animations = animations;
window.notifications = notifications;
window.updateCompanyUI = updateCompanyUI;
window.onDOMReady = onDOMReady;
