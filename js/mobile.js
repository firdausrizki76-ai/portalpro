/**
 * Portal Karyawan - Mobile Responsive
 * Mobile-specific functionality
 */

const mobile = {
    isMobile: false,
    sidebarOpen: false,
    
    init() {
        this.checkMobile();
        this.initSidebar();
        this.initBottomNav();
        this.handleResize();
        
        // Listen for resize events with debounce
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => this.handleResize(), 250);
        });
    },
    
    checkMobile() {
        this.isMobile = window.innerWidth <= 768;
        return this.isMobile;
    },
    
    handleResize() {
        const wasMobile = this.isMobile;
        this.checkMobile();
        
        // Toggle mobile menu button visibility
        const menuToggle = document.getElementById('mobile-menu-toggle');
        if (menuToggle) {
            menuToggle.style.display = this.isMobile ? 'flex' : 'none';
        }
        
        // Toggle sidebar behavior
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            if (this.isMobile) {
                sidebar.classList.remove('open');
                this.sidebarOpen = false;
            } else {
                sidebar.style.transform = '';
            }
        }
        
        // Toggle bottom nav
        this.initBottomNav();
        this.updateTableViews();
    },
    
    initSidebar() {
        const menuToggle = document.getElementById('mobile-menu-toggle');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const sidebarToggle = document.getElementById('sidebar-toggle');
        
        console.log('[Mobile] Setting up sidebar listeners');

        // Mobile menu toggle (Top Left)
        if (menuToggle) {
            menuToggle.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleSidebar();
            };
        }
        
        // Sidebar toggle button
        if (sidebarToggle) {
            sidebarToggle.onclick = (e) => {
                if (this.isMobile) {
                    this.closeSidebar();
                } else {
                    sidebar?.classList.toggle('collapsed');
                }
            };
        }
        
        if (overlay) {
            overlay.onclick = () => this.closeSidebar();
        }
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.onclick = () => {
                if (this.isMobile) {
                    this.closeSidebar();
                }
            };
        });
    },
    
    initBottomNav() {
        const bottomNav = document.getElementById('bottom-nav');
        if (!bottomNav) return;
        
        const userRole = (window.auth && window.auth.currentUser && window.auth.currentUser.role === 'admin') ? 'admin' : 'employee';
        console.log('[Mobile] Initializing bottom nav for role:', userRole);

        const navItems = bottomNav.querySelectorAll('.bottom-nav-item');
        
        navItems.forEach(item => {
            const itemRole = item.dataset.role || 'employee';
            if (itemRole !== userRole) {
                item.style.setProperty('display', 'none', 'important');
            } else {
                item.style.setProperty('display', 'flex', 'important');
            }

            const page = item.dataset.page;
            if (page) {
                item.onclick = (e) => {
                    e.preventDefault();
                    navItems.forEach(n => {
                        if (n.dataset.page) n.classList.remove('active');
                    });
                    item.classList.add('active');
                    if (window.router) window.router.navigate(page);
                };
            }
        });
    },
    
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        this.sidebarOpen = !this.sidebarOpen;
        if (this.sidebarOpen) {
            sidebar?.classList.add('open');
            overlay?.classList.add('show');
            document.body.style.overflow = 'hidden';
        } else {
            this.closeSidebar();
        }
    },
    
    closeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        this.sidebarOpen = false;
        sidebar?.classList.remove('open');
        overlay?.classList.remove('show');
        document.body.style.overflow = '';
    },
    
    updateTableViews() {
        const tableContainers = document.querySelectorAll('.table-responsive');
        tableContainers.forEach(container => {
            const table = container.querySelector('table');
            const mobileCards = container.nextElementSibling;
            if (table && mobileCards && mobileCards.classList.contains('mobile-cards')) {
                if (this.isMobile) {
                    container.style.display = 'none';
                    mobileCards.style.display = 'block';
                } else {
                    container.style.display = 'block';
                    mobileCards.style.display = 'none';
                }
            }
        });
    },
    
    updateBottomNav(page) {
        const bottomNav = document.getElementById('bottom-nav');
        if (!bottomNav) return;
        const navItems = bottomNav.querySelectorAll('.bottom-nav-item');
        navItems.forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === page) {
                item.classList.add('active');
            }
        });
    }
};

if (typeof onDOMReady === 'function') {
    onDOMReady(() => mobile.init());
} else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mobile.init());
} else {
    mobile.init();
}

window.mobile = mobile;
