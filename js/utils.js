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
    showNotification: (message, type = 'success', duration = null) => {
        const div = document.createElement('div');
        // If type is error, default duration is 0 (persistent)
        const finalDuration = duration !== null ? duration : (type === 'error' ? 0 : 3000);

        div.className = `fixed top-4 right-4 z-[9999] px-6 py-3 rounded-xl shadow-2xl text-white transform transition-all duration-300 translate-y-[-20px] opacity-0 flex items-center gap-3 min-w-[300px] max-w-md ${type === 'success' ? 'bg-emerald-600' :
            type === 'error' ? 'bg-rose-600' : 'bg-indigo-600'
            }`;

        const icon = type === 'success' ? '<i class="fa-solid fa-circle-check"></i>' :
            type === 'error' ? '<i class="fa-solid fa-triangle-exclamation"></i>' :
                '<i class="fa-solid fa-circle-info"></i>';

        div.innerHTML = `
            <div class="text-xl">${icon}</div>
            <div class="flex-1 text-sm font-bold">${message}</div>
            <button class="ml-2 hover:bg-white/20 p-1 rounded-lg transition-colors leading-none" onclick="this.parentElement.remove()">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        document.body.appendChild(div);

        // Animate in
        requestAnimationFrame(() => {
            div.classList.remove('translate-y-[-20px]', 'opacity-0');
        });

        // Remove after duration if not persistent
        if (finalDuration > 0) {
            setTimeout(() => {
                if (div.parentNode) {
                    div.classList.add('translate-y-[-20px]', 'opacity-0');
                    setTimeout(() => div.remove(), 300);
                }
            }, finalDuration);
        }
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
