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
        
        // Listen for resize events
        window.addEventListener('resize', () => this.handleResize());
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
        
        console.log('[Mobile] Setting up sidebar listeners', { menuToggle, sidebarToggle });

        // Mobile menu toggle (Top Left)
        if (menuToggle) {
            // Remove old listener if any and add new one
            menuToggle.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Mobile] Menu toggle clicked');
                this.toggleSidebar();
            };
        }
        
        // Sidebar toggle button (collapse/expand on desktop, close on mobile)
        if (sidebarToggle) {
            sidebarToggle.onclick = (e) => {
                if (this.isMobile) {
                    this.closeSidebar();
                } else {
                    sidebar?.classList.toggle('collapsed');
                }
            };
        }
        
        // Close sidebar when clicking overlay
        if (overlay) {
            overlay.onclick = () => this.closeSidebar();
        }
        
        // Close sidebar when clicking nav items on mobile
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
        
        // Get role from auth or fallback to employee
        const userRole = (window.auth && window.auth.currentUser && window.auth.currentUser.role === 'admin') ? 'admin' : 'employee';
        console.log('[Mobile] Initializing bottom nav for role:', userRole);

        const navItems = bottomNav.querySelectorAll('.bottom-nav-item');
        
        navItems.forEach(item => {
            // Role-based filtering
            const itemRole = item.dataset.role || 'employee';
            if (itemRole !== userRole) {
                item.style.setProperty('display', 'none', 'important');
            } else {
                item.style.setProperty('display', 'flex', 'important');
            }

            // Click listener
            item.onclick = (e) => {
                const page = item.dataset.page;
                if (page) {
                    e.preventDefault();
                    // Update active state
                    navItems.forEach(n => n.classList.remove('active'));
                    item.classList.add('active');
                    
                    // Navigate
                    if (window.router) window.router.navigate(page);
                } else if (item.onclick && !item.dataset.page) {
                    // This handles logout which has inline onclick
                    return true; 
                }
            };
        });
    },
    
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        
        this.sidebarOpen = !this.sidebarOpen;
        console.log('[Mobile] Toggling sidebar. New state:', this.sidebarOpen);
        
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
        // Convert tables to cards on mobile if needed
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
    
    // Update bottom nav active state based on current page
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

// Touch swipe support for sidebar
document.addEventListener('touchstart', handleTouchStart, { passive: true });
document.addEventListener('touchmove', handleTouchMove, { passive: true });

let xDown = null;
let yDown = null;

function handleTouchStart(evt) {
    xDown = evt.touches[0].clientX;
    yDown = evt.touches[0].clientY;
}

function handleTouchMove(evt) {
    if (!xDown || !yDown) return;
    
    const xUp = evt.touches[0].clientX;
    const yUp = evt.touches[0].clientY;
    
    const xDiff = xDown - xUp;
    const yDiff = yDown - yUp;
    
    // Horizontal swipe
    if (Math.abs(xDiff) > Math.abs(yDiff)) {
        // Swipe right - open sidebar (from left edge)
        if (xDiff < -50 && xDown < 50 && mobile.isMobile) {
            mobile.toggleSidebar();
        }
        // Swipe left - close sidebar
        if (xDiff > 50 && mobile.sidebarOpen) {
            mobile.closeSidebar();
        }
    }
    
    xDown = null;
    yDown = null;
}

// Initialize on DOM ready
// Initialize using the helper if available, otherwise DOMContentLoaded
if (typeof onDOMReady === 'function') {
    onDOMReady(() => {
        console.log('[Mobile] Initializing via onDOMReady');
        mobile.init();
    });
} else {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[Mobile] Initializing via DOMContentLoaded');
        mobile.init();
    });
}

// Expose
window.mobile = mobile;
