/**
 * SIAP-P3KPW - Admin Employees
 * Employee management for admin
 */

const adminEmployees = {
    employees: [],
    currentPage: 1,
    perPage: 10,
    filters: {
        search: '',
        department: '',
        position: '',
        status: ''
    },
    editingId: null,
    isSubmitting: false,
    initialized: false,

    async init() {
        if (typeof loader !== 'undefined') loader.show('Memuat data pegawai...');
        
        try {
            if (!auth.isAdmin()) {
                toast.error('Anda tidak memiliki akses!');
                router.navigate('dashboard');
                return;
            }

            await this.loadEmployees();
            this.updateDynamicFilters();
            this.bindEvents();
            this.renderTable();
            this.renderMobileCards();
            this.updatePaginationInfo();
            this.initialized = true;
        } catch (error) {
            console.error('Admin Employees init error:', error);
        } finally {
            if (typeof loader !== 'undefined') loader.hide();
        }
    },

    async loadEmployees(forceRefresh = false) {
        const cacheKey = 'admin_employees_cache';
        
        if (!forceRefresh) {
            const cached = storage.get(cacheKey);
            if (cached) {
                this.employees = cached;
                // Fetch in background to keep data fresh
                this._backgroundRefresh();
                return;
            }
        }

        try {
            const result = await api.getEmployees();
            this.employees = result.data || [];
            storage.set(cacheKey, this.employees);
        } catch (error) {
            console.error('Error loading employees:', error);
            this.employees = storage.get(cacheKey, []);
        }
    },

    async _backgroundRefresh() {
        try {
            const result = await api.getEmployees();
            if (result.success) {
                this.employees = result.data || [];
                storage.set('admin_employees_cache', this.employees);
                this.renderTable();
                this.renderMobileCards();
            }
        } catch (e) {
            console.warn('Background employee refresh failed', e);
        }
    },

    bindEvents() {
        // Search filter
        const searchInput = document.getElementById('employee-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filters.search = e.target.value.toLowerCase();
                this.currentPage = 1;
                this.renderTable();
                this.renderMobileCards();
                this.updatePaginationInfo();
            });
        }

        // Department filter
        const deptFilter = document.getElementById('dept-filter');
        if (deptFilter) {
            deptFilter.addEventListener('change', (e) => {
                this.filters.department = e.target.value;
                this.currentPage = 1;
                this.renderTable();
                this.renderMobileCards();
                this.updatePaginationInfo();
            });
        }

        // Position filter
        const posFilter = document.getElementById('position-filter');
        if (posFilter) {
            posFilter.addEventListener('change', (e) => {
                this.filters.position = e.target.value;
                this.currentPage = 1;
                this.renderTable();
                this.renderMobileCards();
                this.updatePaginationInfo();
            });
        }

        // Status filter
        const statusFilter = document.getElementById('status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.filters.status = e.target.value;
                this.currentPage = 1;
                this.renderTable();
                this.renderMobileCards();
                this.updatePaginationInfo();
            });
        }

        // Add employee button
        const addBtn = document.getElementById('btn-add-employee');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showAddModal());
        }

        // Close modal
        const closeBtn = document.getElementById('btn-close-modal');
        const cancelBtn = document.getElementById('btn-cancel-add');
        const modal = document.getElementById('modal-add-employee');

        if (closeBtn) closeBtn.addEventListener('click', () => this.hideAddModal());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.hideAddModal());

        // Close modal when clicking overlay
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.hideAddModal();
            });
        }

        // Form submit
        const form = document.getElementById('form-add-employee');
        if (form) {
            form.addEventListener('submit', (e) => this.handleAddEmployee(e));
        }

        // Set default date
        const joinDateInput = document.getElementById('emp-join-date');
        if (joinDateInput) {
            joinDateInput.valueAsDate = new Date();
        }
    },

    getFilteredEmployees() {
        return this.employees.filter(emp => {
            const matchesSearch = !this.filters.search ||
                emp.name.toLowerCase().includes(this.filters.search) ||
                emp.email.toLowerCase().includes(this.filters.search) ||
                (emp.position && emp.position.toLowerCase().includes(this.filters.search));

            const matchesDept = !this.filters.department || emp.department === this.filters.department;
            const matchesPos = !this.filters.position || emp.position === this.filters.position;
            const matchesStatus = !this.filters.status || emp.status === this.filters.status;

            return matchesSearch && matchesDept && matchesPos && matchesStatus;
        });
    },

    updateDynamicFilters() {
        const depts = [...new Set(this.employees.map(e => e.department).filter(Boolean))].sort();
        const positions = [...new Set(this.employees.map(e => e.position).filter(Boolean))].sort();

        const deptFilter = document.getElementById('dept-filter');
        if (deptFilter) {
            const currentVal = deptFilter.value;
            deptFilter.innerHTML = '<option value="">Semua Departemen</option>' + 
                depts.map(d => `<option value="${d}" ${d === currentVal ? 'selected' : ''}>${d}</option>`).join('');
        }

        const posFilter = document.getElementById('position-filter');
        if (posFilter) {
            const currentVal = posFilter.value;
            posFilter.innerHTML = '<option value="">Semua Jabatan</option>' + 
                positions.map(p => `<option value="${p}" ${p === currentVal ? 'selected' : ''}>${p}</option>`).join('');
        }

        // Update datalists for the Add/Edit Employee modal
        const deptList = document.getElementById('dept-list');
        if (deptList) {
            deptList.innerHTML = depts.map(d => `<option value="${d}">`).join('');
        }

        const posList = document.getElementById('pos-list');
        if (posList) {
            posList.innerHTML = positions.map(p => `<option value="${p}">`).join('');
        }
    },

    renderTable() {
        const tbody = document.getElementById('employees-table-body');
        if (!tbody) return;

        const filtered = this.getFilteredEmployees();
        const start = (this.currentPage - 1) * this.perPage;
        const paginated = filtered.slice(start, start + this.perPage);

        if (paginated.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: var(--spacing-xl);">
                        Tidak ada data pegawai
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = paginated.map(emp => `
            <tr>
                <td>
                    <div class="employee-info">
                        <div class="employee-avatar">
                            <img src="${getAvatarUrl(emp)}" alt="${emp.name}">
                        </div>
                        <div class="employee-details">
                            <span class="employee-name">${emp.name}</span>
                            <span class="employee-email">${emp.email}</span>
                        </div>
                    </div>
                </td>
                <td>EMP${String(emp.id).padStart(3, '0')}</td>
                <td>${emp.department}</td>
                <td>${emp.position}</td>
                <td>${emp.shift}</td>
                <td>
                    <span class="status-badge ${emp.status}">
                        ${this.getStatusLabel(emp.status)}
                    </span>
                </td>
                <td>
                    <button type="button" class="btn-action view" onclick="console.log('View clicked', '${emp.id}'); adminEmployees.viewEmployee('${emp.id}')" title="Lihat">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn-action edit" onclick="console.log('Edit clicked', '${emp.id}'); adminEmployees.editEmployee('${emp.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="btn-action delete" onclick="adminEmployees.deleteEmployee('${emp.id}')" title="Hapus">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        this.updatePagination(filtered.length);
    },

    renderMobileCards() {
        const container = document.getElementById('employees-mobile-cards');
        if (!container) return;

        const filtered = this.getFilteredEmployees();
        const start = (this.currentPage - 1) * this.perPage;
        const paginated = filtered.slice(start, start + this.perPage);

        container.innerHTML = paginated.map(emp => `
            <div class="mobile-card">
                <div class="mobile-card-header">
                    <div class="employee-info">
                        <div class="employee-avatar">
                            <img src="${getAvatarUrl(emp)}" alt="${emp.name}">
                        </div>
                        <div class="employee-details">
                            <span class="employee-name">${emp.name}</span>
                            <span class="employee-email">${emp.email}</span>
                        </div>
                    </div>
                    <span class="status-badge ${emp.status}">${this.getStatusLabel(emp.status)}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">ID</span>
                    <span class="mobile-card-value">EMP${String(emp.id).padStart(3, '0')}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Departemen</span>
                    <span class="mobile-card-value">${emp.department}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Jabatan</span>
                    <span class="mobile-card-value">${emp.position}</span>
                </div>
                <div class="mobile-card-row">
                    <span class="mobile-card-label">Shift</span>
                    <span class="mobile-card-value">${emp.shift}</span>
                </div>
                <div style="margin-top: var(--spacing); display: flex; gap: var(--spacing-xs);">
                    <button class="btn-action view" onclick="adminEmployees.viewEmployee(${emp.id})" style="flex: 1;">
                        <i class="fas fa-eye"></i> Lihat
                    </button>
                    <button class="btn-action edit" onclick="adminEmployees.editEmployee(${emp.id})" style="flex: 1;">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </div>
            </div>
        `).join('');
    },

    updatePagination(totalItems) {
        const totalPages = Math.ceil(totalItems / this.perPage);
        const paginationButtons = document.querySelector('.pagination-buttons');

        if (paginationButtons) {
            let buttonsHtml = `
                <button class="btn-page" ${this.currentPage === 1 ? 'disabled' : ''} onclick="adminEmployees.goToPage(${this.currentPage - 1})">
                    <i class="fas fa-chevron-left"></i>
                </button>
            `;

            for (let i = 1; i <= totalPages; i++) {
                buttonsHtml += `
                    <button class="btn-page ${i === this.currentPage ? 'active' : ''}" onclick="adminEmployees.goToPage(${i})">${i}</button>
                `;
            }

            buttonsHtml += `
                <button class="btn-page" ${this.currentPage === totalPages ? 'disabled' : ''} onclick="adminEmployees.goToPage(${this.currentPage + 1})">
                    <i class="fas fa-chevron-right"></i>
                </button>
            `;

            paginationButtons.innerHTML = buttonsHtml;
        }

        this.updatePaginationInfo();
    },

    updatePaginationInfo() {
        const filtered = this.getFilteredEmployees();
        const start = (this.currentPage - 1) * this.perPage + 1;
        const end = Math.min(start + this.perPage - 1, filtered.length);
        const info = document.querySelector('.pagination-info');

        if (info) {
            info.textContent = `Menampilkan ${filtered.length > 0 ? start : 0}-${end} dari ${filtered.length} pegawai`;
        }
    },

    goToPage(page) {
        const filtered = this.getFilteredEmployees();
        const totalPages = Math.ceil(filtered.length / this.perPage);

        if (page >= 1 && page <= totalPages) {
            this.currentPage = page;
            this.renderTable();
            this.renderMobileCards();
        }
    },

    getStatusLabel(status) {
        const labels = {
            'active': 'Aktif',
            'on-leave': 'Cuti',
            'inactive': 'Non-Aktif'
        };
        return labels[status] || status;
    },

    showAddModal(isEdit = false) {
        const modal = document.getElementById('modal-add-employee');
        const title = modal ? modal.querySelector('h3') : null;
        const submitBtn = modal ? modal.querySelector('button[type="submit"]') : null;

        if (modal) {
            if (title) title.textContent = isEdit ? 'Edit Data Pegawai' : 'Tambah Pegawai Baru';
            if (submitBtn) submitBtn.textContent = isEdit ? 'Simpan Perubahan' : 'Simpan Pegawai';
            
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    },

    hideAddModal() {
        const modal = document.getElementById('modal-add-employee');
        const form = document.getElementById('form-add-employee');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
        if (form) {
            form.reset();
            this.editingId = null;
            // Reset date to today
            const joinDateInput = document.getElementById('emp-join-date');
            if (joinDateInput) joinDateInput.valueAsDate = new Date();
        }
    },

    async handleAddEmployee(e) {
        e.preventDefault();

        // Prevent double/triple submit
        if (this.isSubmitting) return;
        this.isSubmitting = true;

        // Disable submit button and show loading
        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn._originalText = submitBtn.textContent;
            submitBtn.textContent = 'Menyimpan...';
        }

        const name = document.getElementById('emp-name').value;
        const email = document.getElementById('emp-email').value;
        const department = document.getElementById('emp-department').value;
        const position = document.getElementById('emp-position').value;
        const shift = document.getElementById('emp-shift').value;
        const status = document.getElementById('emp-status').value;
        const joinDate = document.getElementById('emp-join-date').value;

        const employeeData = {
            name,
            email,
            department,
            position,
            shift,
            status,
            joinDate
        };

        try {
            if (this.editingId) {
                // Update existing employee
                const result = await api.updateEmployee(this.editingId, employeeData);
                if (result.success) {
                    const index = this.employees.findIndex(emp => emp.id === this.editingId);
                    if (index !== -1) {
                        this.employees[index] = { ...this.employees[index], ...result.data };
                    }
                    toast.success(`Data ${name} berhasil diperbarui!`);
                } else {
                    toast.error(result.error || 'Gagal memperbarui data');
                    return; // Don't close modal on error
                }
            } else {
                // Add new employee
                employeeData.avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${this.getRandomColor()}&color=fff`;
                const result = await api.addEmployee(employeeData);
                if (result.success) {
                    this.employees.unshift(result.data);
                    toast.success(`Pegawai ${name} berhasil ditambahkan!`);
                } else {
                    toast.error(result.error || 'Gagal menambahkan pegawai');
                    return; // Don't close modal on error
                }
            }

            // Common cleanup after success
            this.updateDynamicFilters();
            this.hideAddModal();
            this.renderTable();
            this.renderMobileCards();
            this.updatePaginationInfo();
        } catch (error) {
            console.error('Error saving employee:', error);
            toast.error('Terjadi kesalahan saat menyimpan data');
        } finally {
            // Always re-enable the button
            this.isSubmitting = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = submitBtn._originalText || 'Simpan';
            }
        }
    },

    updateDeptFilterOptions(newDept) {
        // Update filter dropdown
        const deptFilter = document.getElementById('dept-filter');
        if (deptFilter) {
            const existingOptions = Array.from(deptFilter.options).map(opt => opt.value);
            if (!existingOptions.includes(newDept)) {
                const option = document.createElement('option');
                option.value = newDept;
                option.textContent = newDept;
                deptFilter.appendChild(option);
            }
        }

        // Update datalist in modal
        const deptList = document.getElementById('dept-list');
        if (deptList) {
            const existingOptions = Array.from(deptList.options).map(opt => opt.value);
            if (!existingOptions.includes(newDept)) {
                const option = document.createElement('option');
                option.value = newDept;
                deptList.appendChild(option);
            }
        }
    },

    getRandomColor() {
        const colors = ['3B82F6', '10B981', '1E3A8A', 'EF4444', '8B5CF6', 'EC4899', '06B6D4'];
        return colors[Math.floor(Math.random() * colors.length)];
    },

    viewEmployee(id) {
        console.log('adminEmployees.viewEmployee called with id:', id);
        const emp = this.employees.find(e => String(e.id) === String(id));
        if (!emp) {
            console.error('Employee not found for view id:', id);
            toast.error('Data pegawai tidak ditemukan');
            return;
        }

        const content = `
            <div class="profile-view-content">
                <div class="profile-header">
                    <img src="${getAvatarUrl(emp)}" alt="${emp.name}" class="profile-avatar-large">
                    <div class="profile-main-info">
                        <h4>${emp.name}</h4>
                        <p class="profile-id">ID: EMP${String(emp.id).padStart(3, '0')}</p>
                        <span class="status-badge ${emp.status}">${this.getStatusLabel(emp.status)}</span>
                    </div>
                </div>
                <div class="profile-details-grid">
                    <div class="detail-item">
                        <label>Email</label>
                        <p>${emp.email || '-'}</p>
                    </div>
                    <div class="detail-item">
                        <label>Departemen</label>
                        <p>${emp.department || '-'}</p>
                    </div>
                    <div class="detail-item">
                        <label>Jabatan</label>
                        <p>${emp.position || '-'}</p>
                    </div>
                    <div class="detail-item">
                        <label>Shift Kerja</label>
                        <p>${emp.shift || '-'}</p>
                    </div>
                    <div class="detail-item">
                        <label>Tanggal Bergabung</label>
                        <p>${emp.joinDate ? dateTime.formatDate(emp.joinDate) : '-'}</p>
                    </div>
                </div>
            </div>
        `;

        modal.show('Detail Data Pegawai', content, [
            { label: 'Tutup', class: 'btn-secondary', onClick: () => modal.close() },
            { label: 'Edit Data', class: 'btn-primary', onClick: () => { modal.close(); this.editEmployee(id); } }
        ]);
    },

    editEmployee(id) {
        console.log('adminEmployees.editEmployee called with id:', id);
        const emp = this.employees.find(e => String(e.id) === String(id));
        if (!emp) {
            console.error('Employee not found for edit id:', id);
            toast.error('Data pegawai tidak ditemukan');
            return;
        }

        this.editingId = id;

        // Fill form
        document.getElementById('emp-name').value = emp.name;
        document.getElementById('emp-email').value = emp.email;
        document.getElementById('emp-department').value = emp.department;
        document.getElementById('emp-position').value = emp.position;
        document.getElementById('emp-shift').value = emp.shift;
        document.getElementById('emp-status').value = emp.status;
        
        const joinDateInput = document.getElementById('emp-join-date');
        if (joinDateInput) {
            joinDateInput.value = emp.joinDate;
        }

        this.showAddModal(true);
    },

    async deleteEmployee(id) {
        if (confirm('Apakah Anda yakin ingin menghapus pegawai ini?')) {
            try {
                await api.deleteEmployee(id);
                this.employees = this.employees.filter(e => e.id !== id);
                this.renderTable();
                this.renderMobileCards();
                this.updatePaginationInfo();
                toast.success('Pegawai berhasil dihapus');
            } catch (error) {
                console.error('Error deleting employee:', error);
                toast.error('Gagal menghapus pegawai');
            }
        }
    }
};

// Global init function
window.initEmployees = () => {
    adminEmployees.init();
};

// Expose
window.adminEmployees = adminEmployees;
