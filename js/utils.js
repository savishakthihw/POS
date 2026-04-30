const utils = {
    formatCurrency: (amount) => {
        return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
    },

    formatCurrencyNoCents: (amount) => {
        const hasDecimals = amount % 1 !== 0;
        return new Intl.NumberFormat('en-LK', {
            style: 'currency',
            currency: 'LKR',
            minimumFractionDigits: hasDecimals ? 2 : 0,
            maximumFractionDigits: 2
        }).format(amount);
    },

    formatNumber: (amount) => {
        const hasDecimals = amount % 1 !== 0;
        return new Intl.NumberFormat('en-LK', {
            minimumFractionDigits: hasDecimals ? 2 : 0,
            maximumFractionDigits: 2
        }).format(amount);
    },


    formatDate: (dateString) => {
        if (!dateString) return '';
        // If it's a standard YYYY-MM-DD string, parse manually to avoid timezone shifts
        if (typeof dateString === 'string' && dateString.includes('-') && dateString.split('-').length === 3) {
            const [y, m, d] = dateString.split('-');
            return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
        }
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString; // Return as is if invalid
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    },

    // Show a toast notification
    showNotification: (message, type = 'success') => {
        const div = document.createElement('div');
        div.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg text-white transform transition-all duration-300 translate-y-[-20px] opacity-0 flex items-center gap-2 ${type === 'success' ? 'bg-green-500' :
            type === 'error' ? 'bg-red-500' : 'bg-blue-500'
            }`;

        const icon = type === 'success' ? '<i class="fa-solid fa-check-circle"></i>' :
            type === 'error' ? '<i class="fa-solid fa-circle-exclamation"></i>' :
                '<i class="fa-solid fa-circle-info"></i>';

        div.innerHTML = `${icon} <span>${message}</span>`;
        document.body.appendChild(div);

        // Animate in
        requestAnimationFrame(() => {
            div.classList.remove('translate-y-[-20px]', 'opacity-0');
        });

        // Remove after 3 seconds
        setTimeout(() => {
            div.classList.add('translate-y-[-20px]', 'opacity-0');
            setTimeout(() => div.remove(), 300);
        }, 3000);
    },

    // Generate a simple unique ID with prefix (e.g., ITM-123456)
    generateId: (prefix = 'ID') => {
        return `${prefix}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 100)}`;
    },

    // Clean item name by removing leading digits and batch suffixes
    cleanItemName: (name) => {
        if (!name) return '';
        return String(name)
            .replace(/^\d+\s*/, '')      // Remove leading digits (older format)
            .split(' [Batch:')[0]         // Remove batch suffix
            .trim();
    },

    // Performance helper: debounce
    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Audit Logging
    logAction: async (action, details) => {
        try {
            await db.audit_logs.add({
                timestamp: new Date().toISOString(),
                user: app.currentUser || 'Unknown',
                action: action,
                details: details
            });
        } catch (e) {
            console.error('Audit Log failed:', e);
        }
    },

    // Verify Delete Password
    verifyDeletePassword: () => {
        const pwd = prompt('📛 CRITICAL ACTION\n\nPlease enter the DELETE CONFIRMATION password to proceed:');
        if (pwd === "8542074") {
            return true;
        } else if (pwd !== null) {
            utils.showNotification('Incorrect password! Delete action aborted.', 'error');
        }
        return false;
    }
};
