
window.app = {
    currentState: 'dashboard',

    isAdmin: false,
    isViewOnly: false,
    currentUser: null,
    pendingView: null,
    itemCache: [], // Cache for performance
    currentReportYear: new Date().getFullYear(),
    currentReportMonth: new Date().toISOString().slice(0, 7),
    transactionCount: 0, // Counter for auto-backup
    autoBackupInterval: 10, // Default interval
    lastGhostTime: 0,
    autoCloudSync: false, // Default cloud sync off


    init: async () => {
        console.log('App Initializing...');

        // Verify Database Connection
        if (!db.isOpen()) {
            try {
                await db.open();
                console.log('Database connected on init');
            } catch (err) {
                console.error('Database connection failed:', err);
                utils.showNotification('Database connection failed! Please refresh the page.', 'error');
                return;
            }
        }

        // Register Service Worker for Offline Support
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js')
                    .then(reg => console.log('Service Worker registered'))
                    .catch(err => console.log('Service Worker registration failed', err));
            });
        }

        // Monitor Online/Offline Status
        window.addEventListener('online', app.updateOnlineStatus);
        window.addEventListener('offline', app.updateOnlineStatus);
        app.updateOnlineStatus(); // Initial check

        // Initial cloud check
        if (window.cloudSync) cloudSync.checkStatus();

        // Run Data Migration (if any)
        await app.migrateLegacyData();
        await app.migrateBatchData();
        await app.migrateIdToString(); // New Migration
        await app.migrateStockInBatches(); // Fix missing Batch IDs in Stock In
        await app.initializeUpdatedAt(); // Initialize timestamps for sync


        // Check for Ghost Recovery
        await app.checkGhostRecovery();

        // Setup Login
        await app.ensureDefaultUsers();
        app.setupInitialLogin();

        // Setup global event listeners
        window.addEventListener('resize', app.handleResize);

        // Auth Listener Default (for internal locks)
        app.setupDefaultLoginHandler();

        // Chart default config
        Chart.defaults.font.family = "'Outfit', 'Noto Sans Sinhala', sans-serif";
        Chart.defaults.color = '#6B7280';

        // Global Search with debounce
        const searchHandler = utils.debounce((q) => {
            app.handleGlobalSearch(q);
        }, 250);

        document.getElementById('global-search').addEventListener('input', (e) => {
            searchHandler(e.target.value);
        });

        // Start Sidebar Clock
        app.startClock();

        // Request Persistent Storage
        await app.requestPersistence();

        // Load Saved Settings
        await app.loadSavedSettings();

        // Standard Maintenance: Clear Audit Logs older than 6 months
        await app.cleanupAuditLogs();
        await app.optimizeGhostBackups();

        // New: Automated Silent Sync (Once a month)
        await app.checkAutoSync();
    },

    requestPersistence: async () => {
        if (navigator.storage && navigator.storage.persist) {
            const isPersisted = await navigator.storage.persist();
            console.log(`System Storage Persistence: ${isPersisted ? 'ENABLED' : 'NOT ENABLED'}`);
            if (!isPersisted && !localStorage.getItem('persistence_warned')) {
                console.warn('Browser storage is not persistent. Data may be cleared by the OS if disk space is low.');
                localStorage.setItem('persistence_warned', 'true');
            }
        }
    },

    loadSavedSettings: async () => {
        try {
            const backupInterval = await db.settings.get('autoBackupInterval');
            if (backupInterval) {
                app.autoBackupInterval = parseInt(backupInterval.value);
            }
            const bankFee = await db.settings.get('bankFeePercentage');
            if (bankFee) {
                app.bankFeePercentage = parseFloat(bankFee.value);
            } else {
                app.bankFeePercentage = 3;
            }

            const amexFee = await db.settings.get('amexFeePercentage');
            if (amexFee) {
                app.amexFeePercentage = parseFloat(amexFee.value);
            } else {
                app.amexFeePercentage = 3.75; // default Amex fee
            }

            const qrFee = await db.settings.get('qrFeePercentage');
            if (qrFee) {
                app.qrFeePercentage = parseFloat(qrFee.value);
            } else {
                app.qrFeePercentage = 1; // default to 1%
            }

            const qrThreshold = await db.settings.get('qrFeeThreshold');
            if (qrThreshold) {
                app.qrFeeThreshold = parseFloat(qrThreshold.value);
            } else {
                app.qrFeeThreshold = 5000; // default to 5000
            }

            const autoCloud = await db.settings.get('autoCloudSync');
            if (autoCloud) {
                app.autoCloudSync = autoCloud.value === 'true';
            }
        } catch (err) {
            console.error('Error loading settings:', err);
        }
    },

    cleanupAuditLogs: async () => {
        try {
            const cutoff = new Date();
            cutoff.setMonth(cutoff.getMonth() - 6);
            const count = await db.audit_logs
                .where('timestamp')
                .below(cutoff.toISOString())
                .delete();

            if (count > 0) {
                console.log(`🗑️ System Maintenance: Removed ${count} audit logs (older than 6 months).`);
            }
        } catch (err) {
            console.error('Audit Log Cleanup Failed:', err);
        }
    },

    ensureDefaultUsers: async () => {
        try {
            console.log('System Security: Verifying critical accounts...');
            const defaultHash = await app.hashPassword('savi');

            // Only create default accounts if they are missing. Do NOT overwrite existing ones
            // to allow users to set their own passwords.
            const admin = await db.users.where('username').equalsIgnoreCase('admin').first();
            if (!admin) {
                console.log('Initializing default Admin account...');
                await db.users.add({ username: 'admin', passwordHash: defaultHash, role: 'Admin', createdAt: new Date() });
            }

            const savi = await db.users.where('username').equalsIgnoreCase('savi').first();
            if (!savi) {
                console.log('Initializing default Staff account...');
                await db.users.add({ username: 'savi', passwordHash: defaultHash, role: 'User', createdAt: new Date() });
            }

            const allUsers = await db.users.toArray();
            console.log('Active System Users:', allUsers.map(u => u.username));
            console.log('Security check complete. Rescue credentials synced.');
        } catch (e) {
            console.error('Failed to ensure default users:', e);
        }
    },

    setupInitialLogin: () => {
        const form = document.getElementById('initial-login-form');
        const userInp = document.getElementById('init-user');

        // Focus user input
        setTimeout(() => userInp.focus(), 500);

        form.onsubmit = async (e) => {
            e.preventDefault();
            const u = document.getElementById('init-user').value.trim().toLowerCase();
            const p = document.getElementById('init-pass').value;
            const errEl = document.getElementById('init-login-error');

            const pHash = await app.hashPassword(p);
            const fHash = app.getFallbackHash(p);

            // Try index lookup first
            let user = await db.users.where('username').equalsIgnoreCase(u).first();

            // Manual fallback if index fails
            if (!user) {
                const users = await db.users.toArray();
                user = users.find(uObj => uObj.username.toLowerCase() === u);
            }

            console.log('SYSTEM DEBUG: Login intent for:', u);

            if (user) {
                // Check against SHA-256 hash or Fallback hash for maximum compatibility
                const isMatch = (user.passwordHash === pHash || user.passwordHash === fHash);
                
                if (isMatch) {
                    console.log('SYSTEM DEBUG: Authentication SUCCESS for:', user.username);
                    app.isAdmin = user.role === 'Admin';
                    app.isViewOnly = user.role === 'User';
                    app.currentUser = user.username;
                    app.unlockSystem(user.role);
                    utils.logAction('Login', `${user.role} ${user.username} logged in (Dual-Hash Verified)`);
                } else {
                    console.warn('SYSTEM DEBUG: Authentication FAILED for:', u);
                    errEl.classList.remove('hidden');
                    form.classList.add('animate-shake');
                    setTimeout(() => form.classList.remove('animate-shake'), 500);
                }
            } else {
                console.error('User NOT found in database.');
                errEl.classList.remove('hidden');
                form.classList.add('animate-shake');
                setTimeout(() => form.classList.remove('animate-shake'), 500);
            }
        };
    },

    getFallbackHash: (password) => {
        // Fallback: Simple XOR/Shift check for local testing if crypto is blocked
        // This allows the system to remain functional even if opened as a file
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            hash = ((hash << 5) - hash) + password.charCodeAt(i);
            hash |= 0;
        }
        // Convert to a pseudo-hex string for consistency with standard hashes
        const hex = Math.abs(hash).toString(16).padStart(8, '0');
        const fallbackHash = hex.repeat(8); // Make it 64 chars

        // If the password is 'savi', we'll return a consistent hardcoded hash to avoid any mismatch
        if (password === 'savi') return '701c68f6451a59074b8823126759c55986927cf6641b4398327a3c3104e4c9a3';

        return fallbackHash;
    },

    hashPassword: async (password) => {
        if (!window.crypto || !window.crypto.subtle) {
            console.warn('Crypto API not available. Using insecure fallback hash.');
            return app.getFallbackHash(password);
        }

        const msgBuffer = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    },

    unlockSystem: (modeName) => {
        const loginScreen = document.getElementById('initial-login-screen');
        const appLayout = document.getElementById('app-layout');

        // Fade out login
        loginScreen.classList.add('opacity-0', 'pointer-events-none');

        // Fade in app
        setTimeout(() => {
            loginScreen.style.display = 'none';
            appLayout.classList.remove('opacity-0', 'blur-sm', 'pointer-events-none');

            app.updateDashboard();
            app.cleanUpOldData(); // Run maintenance

            app.updateRoleDisplay(); // Update role in sidebar

            // Run an immediate sync check on unlock
            app.checkAutoSync();

            utils.showNotification(`Welcome back! (${modeName} Mode)`);
        }, 500);
    },

    cleanUpOldData: async () => {
        // Optional: Implement cleanup of old logs or temp data if needed
    },

    setupDefaultLoginHandler: () => {
        const form = document.getElementById('login-form');
        form.onsubmit = async (e) => {
            e.preventDefault();
            const u = document.getElementById('login-user').value.trim().toLowerCase();
            const p = document.getElementById('login-pass').value;

            const pHash = await app.hashPassword(p);
            const fHash = app.getFallbackHash(p);

            // Try index lookup
            let user = await db.users.where('username').equalsIgnoreCase(u).first();

            // Manual fallback search if index fails
            if (!user) {
                const users = await db.users.toArray();
                user = users.find(x => x.username.toLowerCase() === u);
            }

            if (user && (user.passwordHash === pHash || user.passwordHash === fHash)) {
                app.isAdmin = user.role === 'Admin';
                app.isViewOnly = user.role === 'User';
                app.currentUser = user.username;
                app.finishLogin();
                utils.logAction('Login', `${user.role} ${user.username} logged in`);
            } else {
                document.getElementById('login-error').classList.remove('hidden');
            }
        };

        const cancelBtn = form.querySelector('button[type="button"]');
        cancelBtn.onclick = () => {
            document.getElementById('login-modal').classList.add('hidden');
            document.getElementById('login-error').classList.add('hidden');
        };
    },

    finishLogin: () => {
        document.getElementById('login-modal').classList.add('hidden');
        document.getElementById('login-form').reset();
        document.getElementById('login-error').classList.add('hidden');

        if (app.pendingView) {
            app.navigate(app.pendingView);
            app.pendingView = null;
        }

        app.updateRoleDisplay(); // Update role in sidebar
        utils.showNotification(app.isViewOnly ? 'View-Only Access Enabled' : 'Admin Logged In');

        // Refresh view if needed
        if (app.currentState === 'items') views.loadItemsTable();
    },

    requestAuth: (callback) => {
        if (app.isAdmin) {
            callback();
            return;
        }

        document.getElementById('login-modal').classList.remove('hidden');
        document.getElementById('login-user').focus();
        document.getElementById('login-error').classList.add('hidden');

        const form = document.getElementById('login-form');

        form.onsubmit = async (e) => {
            e.preventDefault();
            const u = document.getElementById('login-user').value.trim().toLowerCase();
            const p = document.getElementById('login-pass').value;

            const pHash = await app.hashPassword(p);
            const fHash = app.getFallbackHash(p);

            // Try index lookup
            let user = await db.users.where('username').equalsIgnoreCase(u).first();

            // Manual fallback if index fails
            if (!user) {
                const users = await db.users.toArray();
                user = users.find(x => x.username.toLowerCase() === u);
            }

            if (user && (user.passwordHash === pHash || user.passwordHash === fHash) && user.role === 'Admin') {
                document.getElementById('login-modal').classList.add('hidden');
                document.getElementById('login-form').reset();
                app.isAdmin = true;
                app.isViewOnly = false;
                app.currentUser = user.username;
                app.setupDefaultLoginHandler();
                app.updateRoleDisplay();
                utils.logAction('Auth', `Admin ${user.username} authorized action`);
                callback();
            } else {
                document.getElementById('login-error').classList.remove('hidden');
            }
        };

        const cancelBtn = form.querySelector('button[type="button"]');
        cancelBtn.onclick = () => {
            document.getElementById('login-modal').classList.add('hidden');
            document.getElementById('login-form').reset();
            app.setupDefaultLoginHandler();
        };
    },

    logout: () => {
        location.reload(); // Simple reload to show login screen again
    },

    turnOff: async () => {
        let shouldBackup = false;

        if (app.isViewOnly) {
            // View-only users always backup, no questions asked
            shouldBackup = true;
        } else {
            // Admin gets a choice
            shouldBackup = confirm('⚠️ SYSTEM TURN OFF\n\nWould you like to download a System Backup before turning off? (Highly Recommended)');
        }

        // Show professional shutdown screen
        const modal = document.getElementById('shutdown-modal');
        const statusText = document.getElementById('shutdown-status');
        if (modal) modal.classList.remove('hidden');

        if (shouldBackup) {
            try {
                if (statusText) statusText.innerText = 'Securing database and exporting safety backup...';
                await views.backupData();
            } catch (err) {
                console.error('Backup failed during turn off:', err);
            }
        }

        // --- NEW: Daily CSV Reports ---
        const shouldDownloadCsvs = confirm('📊 DAILY REPORTS\n\nWould you like to download Today\'s CSV Reports (Sales, Stock-in, Inventory, Purchases, Expenses) before turning off?');
        if (shouldDownloadCsvs && window.views && views.downloadDailyCSVs) {
            await views.downloadDailyCSVs();
        }

        if (app.autoCloudSync && window.cloudSync) {
            if (statusText) statusText.innerText = 'Syncing data to cloud...';
            try {
                await cloudSync.uploadAll(true);
            } catch (err) {
                console.error('Auto cloud sync failed:', err);
            }
        }

        // Final shutdown transition
        setTimeout(() => {
            if (statusText) statusText.innerText = 'System Offline. Goodbye!';

            // Hide the loading bounces
            const loader = document.querySelector('#shutdown-modal .flex.items-center.gap-2');
            if (loader) loader.classList.add('hidden');

            // Show manual close buttons immediately as a proactive fallback
            const actions = document.getElementById('shutdown-complete-actions');
            if (actions) actions.classList.remove('hidden');

            // Attempt automatic close
            app.exitApp();
        }, shouldBackup ? 2500 : 800);
    },

    triggerBackup: async () => {
        if (window.views && views.backupData) {
            await views.backupData();
            utils.showNotification('Quick JSON Backup Completed!', 'success');
        }
    },

    exitApp: () => {
        console.log('App Exit Requested');

        // Stop any pending navigations/resource loading
        window.stop();

        // 1. Initial attempt: Standard close
        window.close();

        // 2. Secondary attempt: Scripted-bypass trick (Works in most modern browsers)
        // This trick effectively tells the browser this window was "opened" by a script, 
        // bypassing the "Scripts may close only the windows that were opened by them" restriction.
        try {
            window.open('', '_self', '');
            window.close();
        } catch (e) {
            console.warn('Aggressive close attempt failed:', e);
        }

        // 3. Last resort attempts with delay to catch browser activation
        setTimeout(() => {
            try {
                // Some browsers allow this if user activation is fresh or from a button click
                window.close();
                window.opener = self;
                window.close();
            } catch (e) { }
        }, 120);

        // 4. Final Fallback: If STILL open, display manual instructions
        setTimeout(() => {
            // Check if window is still open (some browsers might still return false here even if closed)
            if (window && !window.closed) {
                const statusText = document.getElementById('shutdown-status');
                if (statusText) {
                    statusText.innerHTML = 'Automatic close restricted.<br><span class="text-xs text-amber-300 font-bold">Please use <b>Alt + F4</b> or click the button again.</span>';
                }

                const actions = document.getElementById('shutdown-complete-actions');
                if (actions) {
                    actions.classList.remove('hidden');
                    // Add an extra indicator that the button was clicked but browser blocked it
                    console.warn('System Exit Blocked by Browser. User must manual close.');
                }
            }
        }, 850);
    },

    minimize: () => {
        // Standard browsers don't support window minimization via JavaScript for security reasons.
        // In App Mode, use the top-right window button or Alt+Tab.
        utils.showNotification('Use the top-right button to minimize or "Win + D" for desktop.', 'info');
        console.log('Minimize requested. Browser-based minimize is restricted in App mode.');
    },

    navigate: (viewId, ...initArgs) => {
        // Sections requiring login: Item Master, Stock In, Sales History, Settings, Reports
        // If ViewOnly, they can see but not edit potentially.
        // The original requirement was "admin login system to protect access".
        // But "savi" user is View Only.

        // Determine access rights
        if (!app.isAdmin && !app.isViewOnly) {
            // Should not happen if initial login is enforced, but safe check
            location.reload();
            return;
        }

        // AUTO HOLD BILL: If navigating away from POS with items in cart, auto-save as held bill
        if (app.currentState === 'pos' && viewId !== 'pos' && window.posCart && window.posCart.length > 0) {
            app.autoHoldBill().then(() => {
                app._doNavigate(viewId, ...initArgs);
            });
            return;
        }

        app._doNavigate(viewId, ...initArgs);
    },

    autoHoldBill: async () => {
        try {
            const subtotal = window.posCart.reduce((sum, i) => sum + i.total, 0);
            const discountInput = document.getElementById('bill-discount');
            const discount = discountInput ? (parseFloat(discountInput.value) || 0) : 0;
            const total = subtotal - discount;

            const billData = {
                timestamp: Date.now(),
                customerName: 'Auto-Hold',
                itemCount: window.posCart.reduce((acc, item) => acc + item.qty, 0),
                total: total,
                cartData: {
                    cart: window.posCart,
                    discount: discount
                }
            };

            await db.held_bills.add(billData);

            // Clear the cart after holding
            window.posCart = [];
            if (discountInput) discountInput.value = '';
            const paidInput = document.getElementById('bill-paid');
            if (paidInput) paidInput.value = '';
            const balanceEl = document.getElementById('bill-balance');
            if (balanceEl) balanceEl.innerText = 'Rs. 0.00';

            utils.showNotification('⏸️ Bill auto-saved as Hold Bill', 'success');
            console.log('Auto Hold Bill: Bill saved successfully');
        } catch (err) {
            console.error('Auto Hold Bill Error:', err);
            utils.showNotification('Warning: Could not auto-save bill', 'error');
        }
    },

    _doNavigate: (viewId, ...initArgs) => {
        app.currentState = viewId;
        document.getElementById('global-search').value = '';

        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const activeLink = document.querySelector(`.nav-item[onclick="app.navigate('${viewId}')"]`);
        if (activeLink) activeLink.classList.add('active');

        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));

        const targetView = document.getElementById(`view-${viewId}`) || document.getElementById(`view-${viewId.replace(/_/g, '-')}`);
        if (targetView) {
            targetView.classList.remove('hidden');

            // Hide Global Search for specific views 
            const globalSearch = document.getElementById('global-search');
            if (globalSearch) {
                const container = globalSearch.closest('.relative.group');
                if (container) {
                    container.style.display = viewId === 'stockin' ? 'none' : 'block';
                }
            }

            const titles = {
                dashboard: 'Dashboard',
                items: 'Item Master',
                stockin: 'Stock In',
                inventory: 'Inventory Management',
                pos: 'Point of Sale',
                sales: 'Sales History',
                archive: 'Archive',
                expenses: 'Expense Management',
                purchases: 'Purchase Management',
                credit_settlement: 'Credit Settlement',
                reload_bill: 'Reload / Bill',
                settings: 'System Settings',
                reports: 'Business Reports'
            };
            document.getElementById('page-title').innerText = titles[viewId] || 'Savi Shakthi POS';

            // Lazy load views
            if (viewId === 'dashboard') app.updateDashboard();
            if (viewId === 'items' && window.views) window.views.initItemMaster(...initArgs);
            if (viewId === 'stockin' && window.views) window.views.initStockIn(...initArgs);
            if (viewId === 'inventory' && window.views) window.views.initInventory(...initArgs);
            if (viewId === 'pos' && window.views) window.views.initPOS(...initArgs);
            if (viewId === 'sales' && window.views) window.views.initSales(...initArgs);
            if (viewId === 'archive' && window.views) window.views.initArchive(...initArgs);
            if (viewId === 'expenses' && window.views) window.views.initExpenses(...initArgs);
            if (viewId === 'purchases' && window.views) window.views.initPurchases(...initArgs);
            if (viewId === 'credit_settlement' && window.views) window.views.initCreditSettlements(...initArgs);
            if (viewId === 'reload_bill' && window.views) window.views.initReloadBills(...initArgs);
            if (viewId === 'settings' && window.views) window.views.initSettings(...initArgs);
            if (viewId === 'reports' && window.views) window.views.initReports(...initArgs);
        }
    },

    checkAutoBackup: async () => {
        app.transactionCount++;

        // Silent Ghost Backup every 10 transactions for emergency recovery (Optimized for performance)
        if (app.transactionCount % 10 === 0) {
            await app.saveGhostBackup();
            app.transactionCount = 0;
            
            if (app.autoBackupInterval > 0) {
                const confirmBackup = confirm(`📊 SUCCESS!\n\nYou've completed ${app.autoBackupInterval} transactions. Would you like to download a safety backup now?`);
                if (confirmBackup) {
                    if (window.views && views.backupData) {
                        await views.backupData();
                        utils.showNotification('Auto-backup completed!', 'success');
                    }
                }
            }
        }
    },

    saveGhostBackup: async () => {
        try {
            // PERFORMANCE FIX: Only backup structural and active data. Exclude huge historical tables.
            const tables = ['item_master', 'inventory', 'stock_in', 'sales', 'quotations', 'expenses', 'purchases', 'credit_settlements', 'settings', 'held_bills', 'item_batches', 'users'];
            const data = {};

            await Promise.all(tables.map(async (table) => {
                // For sales, only backup the last 1000 records in the ghost snapshot to keep it fast
                if (table === 'sales') {
                    data[table] = await db.sales.orderBy('id').reverse().limit(1000).toArray();
                } else {
                    data[table] = await db[table].toArray();
                }
            }));

            const ghostSnapshot = {
                timestamp: new Date().toISOString(),
                data: data
            };

            await db.ghost_backups.add(ghostSnapshot);

            // Maintain only 2 latest snapshots to prevent DB bloat
            const count = await db.ghost_backups.count();
            if (count > 2) {
                const oldest = await db.ghost_backups.orderBy('id').limit(count - 2).toArray();
                await db.ghost_backups.bulkDelete(oldest.map(o => o.id));
            }

            app.lastGhostTime = Date.now();
            console.log('✅ Performance-Optimized Ghost backup saved');
        } catch (e) {
            console.error('Ghost backup failed:', e);
        }
    },

    optimizeGhostBackups: async () => {
        try {
            // Maintenance: If ghost_backups table is too large, clear it on startup
            const count = await db.ghost_backups.count();
            if (count > 5) {
                await db.ghost_backups.clear();
                console.log('🧹 Purged excessive recovery snapshots.');
            }
        } catch (e) {}
    },

    checkGhostRecovery: async () => {
        try {
            const itemsCount = await db.item_master.count();
            const latestGhost = await db.ghost_backups.reverse().limit(1).toArray();

            // Only suggest recovery if DB is empty but we have a ghost
            if (itemsCount === 0 && latestGhost.length > 0) {
                const snapshot = latestGhost[0];
                const recover = confirm(`🆘 EMERGENCY RECOVERY!\n\nIt looks like your main database is empty, but I found a 'Full System Ghost Backup' from ${new Date(snapshot.timestamp).toLocaleString()}.\n\nWould you like to recover your ENTIRE system from this backup?`);

                if (recover) {
                    utils.showNotification('Restoring from ghost backup...', 'info');
                    const tables = Object.keys(snapshot.data);

                    await db.transaction('rw', db.item_master, db.inventory, db.stock_in, db.sales, db.expenses, db.purchases, db.credit_settlements, db.credit_settlements_archive, db.settings, db.held_bills, db.item_batches, db.audit_logs, db.users, db.sales_archive, db.stock_in_archive, async () => {
                        for (const table of tables) {
                            if (snapshot.data[table] && snapshot.data[table].length > 0) {
                                await db[table].bulkAdd(snapshot.data[table]);
                            }
                        }
                    });

                    utils.showNotification('Emergency recovery successful!', 'success');
                    
                    // Trigger Silent Sync to ensure everything is aligned after recovery
                    if (window.views && views.performInternalSync) {
                        await views.performInternalSync(true, true);
                    }

                    setTimeout(() => location.reload(), 1500);
                }
            } else {
                // Legacy clean up of localStorage if moved to new system
                localStorage.removeItem('savi_ghost_backup');
            }
        } catch (e) {
            console.error('Ghost check failed:', e);
        }
    },

    updateDashboard: async () => {
        try {
            // FIX: Removed blocking date fix to ensure dashboard loads immediately. 
            // Data cleaning should be done separately or lazily.

            // OPTIMIZED: Parallel Execution
            const [itemCount, inventoryItems, todaySales, allPurchases] = await Promise.all([
                db.item_master.count(),
                db.inventory.toArray(), // Needed for value calc
                db.sales.where('date').equals(new Date().toISOString().split('T')[0]).filter(s => s.paymentStatus !== 'Cancelled').toArray(), // Only today's active sales
                db.purchases.where('balance').above(0).toArray() // USE INDEX for performance
            ]);

            document.getElementById('dash-total-items').innerText = itemCount;

            // --- Payment Reminders Logic (Optimized) ---
            const remindersContainer = document.getElementById('dash-reminders-container');
            if (remindersContainer) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayTime = today.getTime();

                const upcomingPayments = allPurchases.filter(p => {
                    const balance = parseFloat(p.balance) || 0;
                    if (balance <= 0) return false;

                    let dateStr = p.method === 'Credit' ? p.settleDate : (p.method === 'Cheque' ? p.chequeDate : null);
                    if (!dateStr) return false;

                    const parts = dateStr.split('-');
                    if (parts.length !== 3) return false;
                    const pDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                    pDate.setHours(0, 0, 0, 0);
                    const pTime = pDate.getTime();

                    // Dynamic reminder days: Use p.reminderDays or default to 2
                    const rDays = p.reminderDays !== undefined ? p.reminderDays : 2;
                    const advanceTime = todayTime + (rDays * 24 * 60 * 60 * 1000);

                    return pTime <= advanceTime;
                });

                if (upcomingPayments.length > 0) {
                    upcomingPayments.sort((a, b) => {
                        const dateA = new Date(a.method === 'Credit' ? a.settleDate : a.chequeDate).getTime();
                        const dateB = new Date(b.method === 'Credit' ? b.settleDate : b.chequeDate).getTime();
                        return dateA - dateB;
                    });

                    remindersContainer.classList.remove('hidden');
                    remindersContainer.innerHTML = `
                        <div class="flex items-center justify-between mb-3 px-1">
                            <div class="flex items-center gap-2">
                                <div class="w-2 h-2 bg-amber-500 rounded-full animate-ping"></div>
                                <h4 class="text-xs font-black uppercase tracking-widest text-gray-500">Urgent Payment Reminders</h4>
                            </div>
                            <span class="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">${upcomingPayments.length} Pending</span>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            ${upcomingPayments.map(p => {
                        const targetDateStr = p.method === 'Credit' ? p.settleDate : p.chequeDate;
                        const parts = targetDateStr.split('-');
                        const pDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                        pDate.setHours(0, 0, 0, 0);
                        const pTime = pDate.getTime();

                        const isPastDue = pTime < todayTime;
                        const isToday = pTime === todayTime;
                        const daysDiff = Math.ceil((pTime - todayTime) / (1000 * 60 * 60 * 24));

                        return `
                                    <div onclick="app.navigate('purchases')" class="cursor-pointer bg-white border border-gray-100 p-4 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-200 transition-all flex flex-col gap-3 group relative overflow-hidden">
                                        ${isPastDue ? '<div class="absolute top-0 right-0 bg-red-500 text-white text-[8px] font-black px-2 py-1 rounded-bl-lg uppercase">Overdue</div>' : ''}
                                        <div class="flex items-center gap-3">
                                            <div class="w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${isPastDue ? 'bg-red-50 text-red-500' : isToday ? 'bg-amber-50 text-amber-500' : 'bg-indigo-50 text-indigo-500'}">
                                                <i class="fa-solid ${p.method === 'Credit' ? 'fa-hourglass-half' : 'fa-money-check'} text-lg"></i>
                                            </div>
                                            <div class="flex-1 min-w-0">
                                                <div class="flex items-center gap-1.5 mb-0.5">
                                                    <span class="text-[9px] font-black uppercase tracking-wider ${isPastDue ? 'text-red-400' : 'text-gray-400'}">${p.method}</span>
                                                    <span class="text-[9px] text-gray-300">•</span>
                                                    <span class="text-[9px] font-bold text-gray-400 truncate">#${p.invoiceNo}</span>
                                                </div>
                                                <h5 class="text-sm font-bold text-gray-800 truncate">${p.supplierName}</h5>
                                            </div>
                                        </div>
                                        <div class="flex items-end justify-between border-t border-gray-50 pt-3">
                                            <div>
                                                <p class="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Amount Due</p>
                                                <p class="text-sm font-black text-gray-900">${utils.formatCurrency(p.balance)}</p>
                                            </div>
                                            <div class="text-right">
                                                <p class="text-[10px] font-bold ${isPastDue ? 'text-red-500' : isToday ? 'text-amber-500' : 'text-indigo-500'} uppercase mb-0.5">
                                                    ${isPastDue ? 'Expired' : isToday ? 'Today' : 'in ' + daysDiff + ' days'}
                                                </p>
                                                <p class="text-xs font-bold text-gray-700">${utils.formatDate(targetDateStr)}</p>
                                            </div>
                                        </div>
                                    </div>
                                `;
                    }).join('')}
                        </div>
                    `;
                } else {
                    remindersContainer.classList.add('hidden');
                }
            }

            // Calc Inventory Value (Client side for now, can be optimized later if needed)
            const totalValue = inventoryItems.reduce((sum, item) => sum + (item.stockValue || 0), 0);
            document.getElementById('dash-inventory-value').innerText = utils.formatCurrency(totalValue);

            // Sales Stats
            const salesTotal = todaySales.reduce((sum, sale) => sum + (sale.total || 0), 0);
            const profitTotal = todaySales.reduce((sum, sale) => sum + (sale.profit || 0), 0);

            document.getElementById('dash-today-sales').innerHTML = `
                <div class="text-3xl font-black text-white">${utils.formatCurrency(salesTotal)}</div>
                <div class="mt-1 text-sm font-bold text-indigo-100 flex items-center gap-1.5 opacity-90">
                    <i class="fa-solid fa-chart-pie text-[10px]"></i> Profit: ${utils.formatCurrency(profitTotal)}
                </div>
            `;

            // Payment Breakdown (Optimized for Mixed & Partial Payments)
            const methodMap = { 'Cash': 0, 'Visa/Master': 0, 'Bank': 0, 'QR': 0, 'Credit': 0 };
            const billGroups = {};

            todaySales.forEach(s => {
                const bNo = s.billNo || 'STRAY';
                if (!billGroups[bNo]) {
                    billGroups[bNo] = {
                        total: 0,
                        paid: s.paidAmount || 0,
                        cash: s.cashAmount || 0,
                        card: s.cardAmount || 0,
                        bank: s.bankAmount || 0,
                        qr: s.qrAmount || 0,
                        method: s.method || 'Cash'
                    };
                }
                billGroups[bNo].total += (s.total || 0);
            });

            Object.values(billGroups).forEach(b => {
                const billOutstanding = Math.max(0, b.total - b.paid);
                methodMap['Credit'] += billOutstanding;

                const settledAmount = b.total - billOutstanding;

                if (b.method === 'Mixed') {
                    // For mixed payments, we aggregate the specific breakdown fields
                    methodMap['Cash'] += (b.cash || 0);
                    methodMap['Visa/Master'] += (b.card || 0);
                    methodMap['Bank'] += (b.bank || 0);
                    methodMap['QR'] += (b.qr || 0);
                } else {
                    // For single methods, we count the settled portion towards that method
                    const m = (b.method === 'Cheque') ? 'QR' : b.method;
                    if (methodMap[m] !== undefined) {
                      methodMap[m] += settledAmount;
                    } else if (b.method !== 'Credit') {
                      methodMap['Cash'] += settledAmount;
                    }
                }
            });

            if (document.getElementById('dash-cash-sales')) document.getElementById('dash-cash-sales').innerText = utils.formatCurrency(methodMap['Cash']);
            if (document.getElementById('dash-card-sales')) document.getElementById('dash-card-sales').innerText = utils.formatCurrency(methodMap['Visa/Master']);
            if (document.getElementById('dash-bank-sales')) document.getElementById('dash-bank-sales').innerText = utils.formatCurrency(methodMap['Bank']);
            if (document.getElementById('dash-qr-sales')) document.getElementById('dash-qr-sales').innerText = utils.formatCurrency(methodMap['QR']);
            if (document.getElementById('dash-credit-sales')) document.getElementById('dash-credit-sales').innerText = utils.formatCurrency(methodMap['Credit']);

            // Low Stock
            const lowStockItems = inventoryItems.filter(i => i.currentStock <= i.reorderLevel);
            document.getElementById('dash-low-stock').innerText = lowStockItems.length;

            // --- Fast Moving Low Stock Report ---
            try {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

                const recentSalesForTrend = await db.sales.where('date').aboveOrEqual(thirtyDaysAgoStr).filter(s => s.paymentStatus !== 'Cancelled').toArray();
                const movingMap = {};
                recentSalesForTrend.forEach(s => {
                    if (!movingMap[s.itemId]) movingMap[s.itemId] = 0;
                    movingMap[s.itemId] += (s.qty || 0);
                });

                const fastMovingLowStock = inventoryItems.filter(i => {
                    const soldQtySize = movingMap[i.itemId] || 0;
                    const isCustom = !i.itemId || String(i.itemId).startsWith('CUSTOM-');
                    const isDiscontinued = !!i.isDiscontinued;
                    return !isCustom && !isDiscontinued && i.currentStock <= i.reorderLevel && soldQtySize > 0;
                }).sort((a, b) => (movingMap[b.itemId] || 0) - (movingMap[a.itemId] || 0));

                const fastMovingBody = document.getElementById('fast-moving-body');
                if (fastMovingBody) {
                    if (fastMovingLowStock.length === 0) {
                        fastMovingBody.innerHTML = `
                            <tr>
                                <td colspan="6" class="px-4 py-16 text-center text-gray-400 font-medium bg-gray-50/30">
                                    <div class="flex flex-col items-center gap-2 opacity-60">
                                        <i class="fa-solid fa-check-circle text-2xl text-emerald-500"></i>
                                        <span>No fast-moving items are currently low on stock. Your high-demand inventory looks healthy!</span>
                                    </div>
                                </td>
                            </tr>
                        `;
                    } else {
                        fastMovingBody.innerHTML = fastMovingLowStock.map((i, idx) => {
                            const monthSalesQty = movingMap[i.itemId] || 0;
                            return `
                                <tr class="hover:bg-red-50/40 transition-colors group">
                                    <td class="px-2 py-2 text-gray-400 font-mono text-[10px] text-center">${idx + 1}</td>
                                    <td class="px-4 py-2 font-bold text-gray-500 font-mono text-[10px] uppercase tracking-tighter">${i.supplierId || '-'}</td>
                                    <td class="px-4 py-2 min-w-[150px]">
                                        <div class="text-sm font-black text-gray-800 group-hover:text-red-700 transition-colors">${i.itemName}</div>
                                        <div class="text-[9px] text-gray-400 font-mono uppercase tracking-widest">${i.itemId}</div>
                                    </td>
                                    <td class="px-4 py-2 text-center">
                                        <div class="inline-flex items-center justify-center w-8 h-8 bg-red-100 text-red-700 rounded-lg font-black text-xs border-2 border-red-200">
                                            ${utils.formatNumber(i.currentStock)}
                                        </div>
                                    </td>
                                    <td class="px-4 py-2 text-center">
                                        <div class="flex flex-col items-center">
                                            <span class="text-xs font-black text-indigo-600">${monthSalesQty} sold</span>
                                            <span class="text-[8px] text-gray-400 font-bold uppercase tracking-tighter">Fast Moving</span>
                                        </div>
                                    </td>
                                    <td class="px-4 py-2 text-right">
                                        <button onclick="app.navigate('stockin', '${i.itemId}')" 
                                            class="text-[9px] font-black py-1.5 px-3 rounded-lg bg-red-600 text-white shadow-lg shadow-red-500/20 hover:bg-red-700 active:scale-95 transition-all flex items-center gap-2 float-right uppercase tracking-widest">
                                            <i class="fa-solid fa-truck-ramp-box text-[10px]"></i>
                                            Restock
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('');
                    }
                }
            } catch (err) {
                console.error('Fast Moving Report Error:', err);
            }
        } catch (e) {
            console.error('Dashboard update failed:', e);
        }
    },

    updateReportSummaryTable: async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const filterEl = document.getElementById('report-summary-month-filter');
            if (filterEl && !filterEl.value) {
                filterEl.value = today.substring(0, 7);
            }
            const currentMonth = (filterEl && filterEl.value) ? filterEl.value : today.substring(0, 7);
            
            // Fetch all required data for the month
            const monthSales = await db.sales.where('date').between(currentMonth, currentMonth + '\uffff').filter(s => s.paymentStatus !== 'Cancelled').toArray();
            const settledSales = await db.sales.where('settledDate').between(currentMonth, currentMonth + '\uffff').toArray();
            
            const monthCreditSettlements = await db.credit_settlements.where('dateSettled').between(currentMonth, currentMonth + '\uffff').toArray();
            const monthExpenses = await db.expenses.where('date').between(currentMonth, currentMonth + '\uffff').toArray();
            const monthPurchases = await db.purchases.where('date').between(currentMonth, currentMonth + '\uffff').toArray();
            const monthReloads = await db.reload_bills.where('date').between(currentMonth, currentMonth + '\uffff').toArray();

            const summaryMap = {};
            const initDate = (date) => {
                if (!summaryMap[date]) summaryMap[date] = { 
                    sales: 0, profit: 0, fees: 0, margin: 0,
                    outstanding: 0, outstandingPaid: 0, creditBill: 0, expenses: 0, 
                    purchase: 0, supSettlement: 0, reloadBill: 0,
                    cash: 0, card: 0, bank: 0, qr: 0
                };
            };

            const billGroups = {};

            // Process Sales (Sales, Profit, Fees, Outstanding)
            monthSales.forEach(s => {
                initDate(s.date);
                summaryMap[s.date].profit += (s.profit || 0);
                summaryMap[s.date].fees += (s.bankFee || 0);

                const bNo = s.billNo || 'STRAY';
                if (!billGroups[bNo]) {
                    billGroups[bNo] = {
                        date: s.date,
                        total: 0,
                        paid: s.paidAmount || 0,
                        cash: s.cashAmount || 0,
                        card: s.cardAmount || 0,
                        bank: s.bankAmount || 0,
                        qr: s.qrAmount || 0,
                        method: s.method || 'Cash',
                        hasBreakdown: 'cashAmount' in s,
                        settledDate: s.settledDate
                    };
                }
                billGroups[bNo].total += (s.total || 0);
            });

            // Calculate Payment Breakdown (Cash, Card, Bank, QR) and Outstanding
            Object.values(billGroups).forEach(b => {
                const initialPaid = (b.cash || 0) + (b.card || 0) + (b.bank || 0) + (b.qr || 0);
                const isSettledLate = b.settledDate && b.date && b.settledDate.split('T')[0] !== b.date.split('T')[0];
                const safeInitialPaid = (!b.hasBreakdown && !isSettledLate) ? b.paid : initialPaid;
                const billOutstanding = Math.max(0, b.total - safeInitialPaid);
                const settledAmount = b.total - billOutstanding;

                summaryMap[b.date].sales += settledAmount;
                summaryMap[b.date].outstanding += billOutstanding;

                if (b.method === 'Mixed') {
                    summaryMap[b.date].cash += (b.cash || 0);
                    summaryMap[b.date].card += (b.card || 0);
                    summaryMap[b.date].bank += (b.bank || 0);
                    summaryMap[b.date].qr += (b.qr || 0);
                } else {
                    const m = (b.method === 'Cheque') ? 'QR' : b.method;
                    if (m === 'Visa/Master') {
                        summaryMap[b.date].card += settledAmount;
                    } else if (m === 'Bank') {
                        summaryMap[b.date].bank += settledAmount;
                    } else if (m === 'QR') {
                        summaryMap[b.date].qr += settledAmount;
                    } else if (m !== 'Credit') {
                        summaryMap[b.date].cash += settledAmount;
                    }
                }
            });

            // Add Late Settlements to Payment Breakdown based on settleMethod
            const settledByDateBillSummary = {};
            settledSales.forEach(s => {
                const dateKey = (s.settledDate || '').split('T')[0];
                if (!dateKey) return;
                const bNo = s.billNo || 'UNKNOWN';
                
                if (!settledByDateBillSummary[dateKey]) settledByDateBillSummary[dateKey] = {};
                if (!settledByDateBillSummary[dateKey][bNo]) {
                    const initialPaid = (s.cashAmount || 0) + (s.cardAmount || 0) + (s.bankAmount || 0) + (s.qrAmount || 0);
                    const isSettledLate = s.settledDate && s.date && s.settledDate.split('T')[0] !== s.date.split('T')[0];
                    const safeInitialPaid = (!('cashAmount' in s) && !isSettledLate) ? s.paidAmount : initialPaid;
                    settledByDateBillSummary[dateKey][bNo] = { total: 0, paid: (s.paidAmount || 0), initialPaid: safeInitialPaid, settleMethod: s.settleMethod || 'Cash', isSettledLate: isSettledLate };
                }
                settledByDateBillSummary[dateKey][bNo].total += (s.total || 0);
            });

            for (const dateKey in settledByDateBillSummary) {
                initDate(dateKey);
                for (const bNo in settledByDateBillSummary[dateKey]) {
                    const b = settledByDateBillSummary[dateKey][bNo];
                    if (!b.isSettledLate) continue; // Ignore same-day settlements
                    const finalPaid = Math.max(b.paid, b.total);
                    const lateSettledAmount = finalPaid - b.initialPaid;
                    if (lateSettledAmount > 0) {
                        summaryMap[dateKey].outstandingPaid += lateSettledAmount;
                        if (b.settleMethod === 'Visa/Master' || b.settleMethod === 'Card') {
                            summaryMap[dateKey].card += lateSettledAmount;
                        } else if (b.settleMethod === 'Bank') {
                            summaryMap[dateKey].bank += lateSettledAmount;
                        } else if (b.settleMethod === 'QR' || b.settleMethod === 'Cheque') {
                            summaryMap[dateKey].qr += lateSettledAmount;
                        } else {
                            summaryMap[dateKey].cash += lateSettledAmount;
                        }
                    }
                }
            }
            monthCreditSettlements.forEach(s => {
                initDate(s.dateSettled);
                summaryMap[s.dateSettled].supSettlement += (s.amount || 0);
            });

            // Process Expenses
            monthExpenses.forEach(e => {
                initDate(e.date);
                summaryMap[e.date].expenses += (e.amount || 0);
            });

            // Process Purchases
            monthPurchases.forEach(p => {
                let method = p.method || 'Cash';
                if (method === 'Visa/Master') method = 'Bank';
                if (method === 'Cash' || method === 'Bank' || method === 'DF') {
                    initDate(p.date);
                    summaryMap[p.date].purchase += (p.totalBill || 0);
                }
            });

            // Process Reload/Bills
            monthReloads.forEach(r => {
                initDate(r.date);
                summaryMap[r.date].reloadBill += (r.total || 0);
            });

            const sortedDays = Object.keys(summaryMap).sort().reverse();
            const summaryTable = document.getElementById('report-daily-summary-body');
            const summaryTableFoot = document.getElementById('report-daily-summary-foot');
            
            let gSales = 0, gProfit = 0, gFees = 0, gOut = 0, gOutPaid = 0, gCredit = 0;
            let gExp = 0, gPurch = 0, gSup = 0, gReload = 0;
            
            const paymentTableBody = document.getElementById('report-daily-payment-body');
            const paymentTableFoot = document.getElementById('report-daily-payment-foot');
            let gCash = 0, gCard = 0, gBank = 0, gQR = 0;

            if (summaryTable) {
                summaryTable.innerHTML = sortedDays.map(date => {
                    const row = summaryMap[date];
                    const sales = row.sales;
                    const profit = row.profit;
                    const fees = row.fees;
                    
                    gSales += sales;
                    gProfit += profit;
                    gFees += fees;
                    gOut += row.outstanding;
                    gOutPaid += row.outstandingPaid;
                    gCredit += row.creditBill;
                    gExp += row.expenses;
                    gPurch += row.purchase;
                    gSup += row.supSettlement;
                    gReload += row.reloadBill;
                    
                    return `
                        <tr class="border-b hover:bg-gray-50 transition-colors">
                            <td class="px-2 py-1.5 font-bold text-gray-700 font-mono text-xs">${date.split('-')[2]}/${date.split('-')[1]}</td>
                            <td class="px-2 py-1.5 font-bold text-indigo-700 text-right text-xs">${utils.formatCurrency(sales)}</td>
                            <td class="px-2 py-1.5 font-mono text-gray-600 text-right text-xs">${utils.formatCurrency(row.outstanding)}</td>
                            <td class="px-2 py-1.5 font-mono text-blue-600 text-right text-xs">${utils.formatCurrency(row.outstandingPaid)}</td>
                            <td class="px-2 py-1.5 font-bold text-emerald-600 text-right text-xs">${utils.formatCurrency(profit)}</td>
                            <td class="px-2 py-1.5 font-bold text-rose-600 text-right text-xs">${fees > 0 ? '-' + utils.formatCurrency(fees) : '-'}</td>
                            <td class="px-2 py-1.5 font-mono text-red-500 text-right text-xs">${utils.formatCurrency(row.expenses)}</td>
                            <td class="px-2 py-1.5 font-mono text-blue-600 text-right text-xs">${utils.formatCurrency(row.purchase)}</td>
                            <td class="px-2 py-1.5 font-mono text-orange-500 text-right text-xs">${utils.formatCurrency(row.supSettlement)}</td>
                            <td class="px-2 py-1.5 font-mono text-fuchsia-600 text-right text-xs">${utils.formatCurrency(row.reloadBill)}</td>
                        </tr>
                    `;
                }).join('') || '<tr><td colspan="10" class="px-4 py-8 text-center text-gray-400">No data found for the selected period</td></tr>';
            }

            if (paymentTableBody) {
                paymentTableBody.innerHTML = sortedDays.map(date => {
                    const row = summaryMap[date];
                    gCash += row.cash;
                    gCard += row.card;
                    gBank += row.bank;
                    gQR += row.qr;
                    gCredit += row.outstanding;
                    
                    const totalDayPayment = row.cash + row.card + row.bank + row.qr + row.outstanding;

                    return `
                        <tr class="border-b hover:bg-gray-50 transition-colors">
                            <td class="px-2 py-1.5 font-bold text-gray-700 font-mono text-xs">${date.split('-')[2]}/${date.split('-')[1]}</td>
                            <td class="px-2 py-1.5 font-bold text-emerald-600 text-right text-xs">${utils.formatCurrency(row.cash)}</td>
                            <td class="px-2 py-1.5 font-bold text-indigo-600 text-right text-xs">${utils.formatCurrency(row.card)}</td>
                            <td class="px-2 py-1.5 font-bold text-blue-600 text-right text-xs">${utils.formatCurrency(row.bank)}</td>
                            <td class="px-2 py-1.5 font-bold text-orange-500 text-right text-xs">${utils.formatCurrency(row.qr)}</td>
                            <td class="px-2 py-1.5 font-bold text-red-500 text-right text-xs">${utils.formatCurrency(row.outstanding)}</td>
                            <td class="px-2 py-1.5 font-bold text-gray-800 text-right text-xs bg-gray-50">${utils.formatCurrency(totalDayPayment)}</td>
                        </tr>
                    `;
                }).join('') || '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-400">No data found for the selected period</td></tr>';
            }

            if (paymentTableFoot && sortedDays.length > 0) {
                const gTotalPayment = gCash + gCard + gBank + gQR + gCredit;
                paymentTableFoot.innerHTML = `
                    <tr>
                        <td class="px-2 py-3 text-right uppercase tracking-wider text-gray-800 bg-gray-100 border-t-2 border-gray-300 font-bold text-xs">Total</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300 font-bold text-emerald-700 text-xs">${utils.formatCurrency(gCash)}</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300 font-bold text-indigo-700 text-xs">${utils.formatCurrency(gCard)}</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300 font-bold text-blue-700 text-xs">${utils.formatCurrency(gBank)}</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300 font-bold text-orange-600 text-xs">${utils.formatCurrency(gQR)}</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300 font-bold text-red-600 text-xs">${utils.formatCurrency(gCredit)}</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300 font-black text-gray-900 text-xs bg-gray-100">${utils.formatCurrency(gTotalPayment)}</td>
                    </tr>
                `;
            }

            if (summaryTableFoot && sortedDays.length > 0) {
                summaryTableFoot.innerHTML = `
                    <tr>
                        <td class="px-2 py-3 text-right uppercase tracking-wider text-gray-800 bg-gray-100 border-t-2 border-gray-300 font-bold text-xs">Total</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300 font-bold text-indigo-800 text-xs">${utils.formatCurrency(gSales)}</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300 font-bold text-gray-800 text-xs">${utils.formatCurrency(gOut)}</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300 font-bold text-blue-800 text-xs">${utils.formatCurrency(gOutPaid)}</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300 font-bold text-emerald-700 text-xs">${utils.formatCurrency(gProfit)}</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300 font-bold text-rose-700 text-xs">${gFees > 0 ? '-' + utils.formatCurrency(gFees) : '-'}</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300 font-bold text-red-600 text-xs">${utils.formatCurrency(gExp)}</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300 font-bold text-blue-700 text-xs">${utils.formatCurrency(gPurch)}</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300 font-bold text-orange-600 text-xs">${utils.formatCurrency(gSup)}</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300 font-bold text-fuchsia-700 text-xs">${utils.formatCurrency(gReload)}</td>
                    </tr>
                `;
            } else if (summaryTableFoot) {
                summaryTableFoot.innerHTML = '';
            }
        } catch (e) {
            console.error('Report summary update failed:', e);
        }
    },

    updateCashInOutSummaryTable: async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const filterEl = document.getElementById('report-cash-summary-month');
            if (filterEl && !filterEl.value) {
                filterEl.value = today.substring(0, 7);
            }
            const currentMonth = (filterEl && filterEl.value) ? filterEl.value : today.substring(0, 7);
            
            // Fetch all required data for the month
            const monthSales = await db.sales.where('date').between(currentMonth, currentMonth + '\uffff').filter(s => s.paymentStatus !== 'Cancelled').toArray();
            const settledSales = await db.sales.where('settledDate').between(currentMonth, currentMonth + '\uffff').toArray();
            const monthCreditSettlements = await db.credit_settlements.where('dateSettled').between(currentMonth, currentMonth + '\uffff').toArray();
            const monthExpenses = await db.expenses.where('date').between(currentMonth, currentMonth + '\uffff').toArray();
            const monthPurchases = await db.purchases.where('date').between(currentMonth, currentMonth + '\uffff').toArray();
            const monthReloads = await db.reload_bills.where('date').between(currentMonth, currentMonth + '\uffff').toArray();

            const cashMap = {};
            const initDate = (date) => {
                if (!cashMap[date]) cashMap[date] = { 
                    cashSale: 0, outstandingPaid: 0, reloadTotal: 0, 
                    cashPurchase: 0, cashExpenses: 0, cashSettlement: 0 
                };
            };

            // Cash Sales (Grouped by bill to handle partial/mixed correctly)
            const billGroups = {};
            monthSales.forEach(s => {
                const bNo = s.billNo || 'STRAY';
                if (!billGroups[bNo]) {
                    billGroups[bNo] = {
                        date: s.date,
                        total: 0,
                        paid: s.paidAmount || 0,
                        cash: s.cashAmount || 0,
                        card: s.cardAmount || 0,
                        bank: s.bankAmount || 0,
                        qr: s.qrAmount || 0,
                        method: s.method || 'Cash',
                        hasBreakdown: 'cashAmount' in s,
                        settledDate: s.settledDate
                    };
                }
                billGroups[bNo].total += (s.total || 0);
            });

            Object.values(billGroups).forEach(b => {
                initDate(b.date);
                const initialPaid = (b.cash || 0) + (b.card || 0) + (b.bank || 0) + (b.qr || 0);
                const isSettledLate = b.settledDate && b.date && b.settledDate.split('T')[0] !== b.date.split('T')[0];
                const safeInitialPaid = (!b.hasBreakdown && !isSettledLate) ? b.paid : initialPaid;
                const billOutstanding = Math.max(0, b.total - safeInitialPaid);
                const settledAmount = b.total - billOutstanding;

                if (b.method === 'Mixed') {
                    cashMap[b.date].cashSale += (b.cash || 0);
                } else {
                    const m = (b.method === 'Cheque') ? 'QR' : b.method;
                    if (m !== 'Visa/Master' && m !== 'Bank' && m !== 'QR' && m !== 'Credit') {
                        cashMap[b.date].cashSale += settledAmount;
                    }
                }
            });

            // Outstanding Paid
            const settledByDateBill = {};
            settledSales.forEach(s => {
                const dateKey = (s.settledDate || '').split('T')[0];
                if (!dateKey) return;
                const bNo = s.billNo || 'UNKNOWN';
                
                if (!settledByDateBill[dateKey]) settledByDateBill[dateKey] = {};
                if (!settledByDateBill[dateKey][bNo]) {
                    const initialPaid = (s.cashAmount || 0) + (s.cardAmount || 0) + (s.bankAmount || 0) + (s.qrAmount || 0);
                    const isSettledLate = s.settledDate && s.date && s.settledDate.split('T')[0] !== s.date.split('T')[0];
                    const safeInitialPaid = (!('cashAmount' in s) && !isSettledLate) ? s.paidAmount : initialPaid;
                    settledByDateBill[dateKey][bNo] = { total: 0, paid: (s.paidAmount || 0), initialPaid: safeInitialPaid, settleMethod: s.settleMethod || 'Cash', isSettledLate: isSettledLate };
                }
                settledByDateBill[dateKey][bNo].total += (s.total || 0);
            });

            for (const dateKey in settledByDateBill) {
                initDate(dateKey);
                for (const bNo in settledByDateBill[dateKey]) {
                    const b = settledByDateBill[dateKey][bNo];
                    if (!b.isSettledLate) continue; // Ignore same-day settlements
                    const finalPaid = Math.max(b.paid, b.total);
                    const lateSettledAmount = finalPaid - b.initialPaid;
                    if (lateSettledAmount > 0) {
                        if (b.settleMethod === 'Cash' || !b.settleMethod) {
                            cashMap[dateKey].outstandingPaid += lateSettledAmount;
                        }
                    }
                }
            }

            // Daily Reload/Bill Total
            monthReloads.forEach(r => {
                initDate(r.date);
                cashMap[r.date].reloadTotal += (r.total || 0);
            });

            // Cash Expenses
            monthExpenses.forEach(e => {
                const method = e.paymentType || 'Cash';
                if (method === 'Cash') {
                    initDate(e.date);
                    cashMap[e.date].cashExpenses += (e.amount || 0);
                }
            });

            // Cash Purchase
            monthPurchases.forEach(p => {
                initDate(p.date);
                if (p.method === 'Cash') {
                    cashMap[p.date].cashPurchase += (p.paidAmount || p.totalBill || 0);
                }
            });

            // Cash Credit Settlement
            monthCreditSettlements.forEach(s => {
                initDate(s.dateSettled);
                if (!s.paymentMethod || s.paymentMethod === 'Cash') {
                    cashMap[s.dateSettled].cashSettlement += (s.amount || 0);
                }
            });

            const sortedDays = Object.keys(cashMap).sort().reverse();
            const tbody = document.getElementById('report-cash-summary-body');
            const tfoot = document.getElementById('report-cash-summary-foot');
            
            let grandCashSale = 0, grandOutPaid = 0, grandReload = 0, grandCashIn = 0;
            let grandPurchase = 0, grandExpenses = 0, grandSettlement = 0, grandCashOut = 0;
            let grandInHand = 0;

            if (tbody) {
                tbody.innerHTML = sortedDays.map(date => {
                    const row = cashMap[date];
                    
                    const cashIn = row.cashSale + row.outstandingPaid + row.reloadTotal;
                    const cashOut = row.cashPurchase + row.cashExpenses + row.cashSettlement;
                    const cashInHand = cashIn - cashOut;

                    grandCashSale += row.cashSale;
                    grandOutPaid += row.outstandingPaid;
                    grandReload += row.reloadTotal;
                    grandCashIn += cashIn;
                    
                    grandPurchase += row.cashPurchase;
                    grandExpenses += row.cashExpenses;
                    grandSettlement += row.cashSettlement;
                    grandCashOut += cashOut;
                    
                    grandInHand += cashInHand;

                    return `
                        <tr class="border-b hover:bg-gray-50 transition-colors">
                            <td class="px-2 py-2 font-bold text-gray-700 font-mono text-xs sticky left-0 bg-white/95 backdrop-blur shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] z-0">${date.split('-')[2]}/${date.split('-')[1]}</td>
                            <td class="px-2 py-2 font-mono text-right text-xs text-gray-600">${utils.formatCurrency(row.cashSale)}</td>
                            <td class="px-2 py-2 font-mono text-right text-xs text-blue-600">${utils.formatCurrency(row.outstandingPaid)}</td>
                            <td class="px-2 py-2 font-mono text-right text-xs text-fuchsia-600">${utils.formatCurrency(row.reloadTotal)}</td>
                            <td class="px-2 py-2 font-mono text-right text-xs font-bold text-emerald-600 bg-emerald-50/30">${utils.formatCurrency(cashIn)}</td>
                            <td class="px-2 py-2 font-mono text-right text-xs text-amber-600">${utils.formatCurrency(row.cashPurchase)}</td>
                            <td class="px-2 py-2 font-mono text-right text-xs text-orange-600">${utils.formatCurrency(row.cashExpenses)}</td>
                            <td class="px-2 py-2 font-mono text-right text-xs text-rose-500">${utils.formatCurrency(row.cashSettlement)}</td>
                            <td class="px-2 py-2 font-mono text-right text-xs font-bold text-red-600 bg-red-50/30">${utils.formatCurrency(cashOut)}</td>
                            <td class="px-2 py-2 font-mono text-right text-xs font-black text-indigo-700 bg-indigo-50/30 border-l border-indigo-100">${utils.formatCurrency(cashInHand)}</td>
                        </tr>
                    `;
                }).join('') || '<tr><td colspan="10" class="px-4 py-8 text-center text-gray-400">No cash flow data for the selected period</td></tr>';
            }

            if (tfoot && sortedDays.length > 0) {
                tfoot.innerHTML = `
                    <tr>
                        <td class="px-2 py-3 text-right uppercase tracking-wider text-gray-800 sticky left-0 bg-gray-100 z-10 border-t-2 border-gray-300">Total</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300">${utils.formatCurrency(grandCashSale)}</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300">${utils.formatCurrency(grandOutPaid)}</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300">${utils.formatCurrency(grandReload)}</td>
                        <td class="px-2 py-3 text-right text-emerald-700 font-black bg-emerald-50/80 border-t-2 border-emerald-300">${utils.formatCurrency(grandCashIn)}</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300">${utils.formatCurrency(grandPurchase)}</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300">${utils.formatCurrency(grandExpenses)}</td>
                        <td class="px-2 py-3 text-right border-t-2 border-gray-300">${utils.formatCurrency(grandSettlement)}</td>
                        <td class="px-2 py-3 text-right text-red-700 font-black bg-red-50/80 border-t-2 border-red-300">${utils.formatCurrency(grandCashOut)}</td>
                        <td class="px-2 py-3 text-right text-indigo-800 font-black bg-indigo-100/80 border-t-2 border-indigo-300 text-sm">${utils.formatCurrency(grandInHand)}</td>
                    </tr>
                `;
            } else if (tfoot) {
                tfoot.innerHTML = '';
            }
        } catch (e) {
            console.error('Cash in/out summary update failed:', e);
        }
    },

    initReportCharts: async () => {
        try {
            // --- 1. Business Performance Chart (Last 12 Months) ---
            const ctx12 = document.getElementById('reportPerformance12MonthsChart');
            if (ctx12) {
                const monthsTofetch = 12;
                const startDate = new Date();
                startDate.setDate(1); // Ensure we don't roll over (e.g., from Mar 30th to Feb 30th which doesn't exist)
                startDate.setMonth(startDate.getMonth() - monthsTofetch + 1);
                const sy = startDate.getFullYear();
                const sm = String(startDate.getMonth() + 1).padStart(2, '0');
                const startDateStr = `${sy}-${sm}-01`;

                const [allExpenses, allSales] = await Promise.all([
                    db.expenses.where('date').aboveOrEqual(startDateStr).toArray(),
                    db.sales.where('date').aboveOrEqual(startDateStr).filter(s => s.paymentStatus !== 'Cancelled').toArray()
                ]);

                const chartDataMap = {};
                const chartLabels = [];

                for (let i = monthsTofetch - 1; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(1); // Safe guard for month subtraction
                    d.setMonth(d.getMonth() - i);
                    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
                    const mName = d.toLocaleString('en-US', { month: 'short' });
                    chartDataMap[k] = { label: mName, sales: 0, profit: 0, expenses: 0 };
                    chartLabels.push(k);
                }

                allSales.forEach(s => {
                    const m = s.date.substring(0, 7);
                    if (chartDataMap[m]) {
                        chartDataMap[m].sales += (s.total || 0);
                        chartDataMap[m].profit += (s.profit || 0);
                    }
                });

                allExpenses.forEach(e => {
                    const m = e.date.substring(0, 7);
                    if (chartDataMap[m]) {
                        chartDataMap[m].expenses += (e.amount || 0);
                    }
                });

                if (window.report12MChart) window.report12MChart.destroy();
                window.report12MChart = new Chart(ctx12, {
                    type: 'line',
                    data: {
                        labels: chartLabels.map(k => chartDataMap[k].label),
                        datasets: [
                            {
                                label: 'Sales',
                                data: chartLabels.map(k => chartDataMap[k].sales),
                                borderColor: '#4F46E5',
                                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                                tension: 0.4,
                                fill: true,
                                borderWidth: 3
                            },
                            {
                                label: 'Profit',
                                data: chartLabels.map(k => chartDataMap[k].profit),
                                borderColor: '#10B981',
                                tension: 0.4,
                                borderWidth: 3
                            },
                            {
                                label: 'Expenses',
                                data: chartLabels.map(k => chartDataMap[k].expenses),
                                borderColor: '#EF4444',
                                tension: 0.4,
                                borderWidth: 3
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }
                    }
                });
            }

            // --- 2. Business Performance Chart (Last 30 Days / Monthly) ---
            const ctx30 = document.getElementById('reportPerformance30DaysChart');
            if (ctx30) {
                const monthFilterEl = document.getElementById('report30DaysHistoryMonth');
                const selectedMonth = monthFilterEl ? monthFilterEl.value : null;
                const today = new Date().toISOString().split('T')[0];
                const currentMonth = today.substring(0, 7);

                let labels = [];
                let salesData = [];

                if (selectedMonth && selectedMonth !== currentMonth) {
                    // Specific Full Month View
                    const [year, month] = selectedMonth.split('-');
                    const daysInMonth = new Date(year, month, 0).getDate();

                    for (let d = 1; d <= daysInMonth; d++) {
                        const dateStr = `${year}-${month}-${String(d).padStart(2, '0')}`;
                        labels.push(dateStr);
                    }
                } else {
                    // Default: Last 30 Days
                    const daysToFetch = 30;
                    for (let i = daysToFetch - 1; i >= 0; i--) {
                        const d = new Date();
                        d.setDate(d.getDate() - i);
                        const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                        labels.push(k);
                    }
                }

                const startDateStr = labels[0];
                const endDateStr = labels[labels.length - 1];

                const recentSales = await db.sales.where('date').between(startDateStr, endDateStr + '\uffff').filter(s => s.paymentStatus !== 'Cancelled').toArray();

                const dailyData = {};
                labels.forEach(l => {
                    dailyData[l] = { sales: 0, profit: 0 };
                });

                recentSales.forEach(s => {
                    if (dailyData[s.date]) {
                        dailyData[s.date].sales += (s.total || 0);
                        dailyData[s.date].profit += (s.profit || 0);
                    }
                });

                if (window.report30DChart) window.report30DChart.destroy();
                window.report30DChart = new Chart(ctx30, {
                    type: 'line',
                    data: {
                        labels: labels.map(l => {
                            const [y, m, d] = l.split('-');
                            const dateObj = new Date(y, m - 1, d);
                            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                            return `${m}/${d} (${dayName})`;
                        }),
                        datasets: [
                            {
                                label: 'Daily Sales',
                                data: labels.map(l => dailyData[l].sales),
                                borderColor: '#4F46E5',
                                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                                fill: true,
                                tension: 0.4,
                                borderWidth: 3
                            },
                            {
                                label: 'Daily Profit',
                                data: labels.map(l => dailyData[l].profit),
                                borderColor: '#10B981',
                                tension: 0.4,
                                borderWidth: 3
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }
                    }
                });
            }
        } catch (err) {
            console.error('Report Charts Initialization Error:', err);
        }
    },

    fixDateFormats: async () => {
        // Only run once per session/reload to avoid overhead, or check a flag
        if (app.datesFixed) return;

        const normalize = (dateStr) => {
            if (!dateStr) return null;
            // Check if already YYYY-MM-DD
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

            // Attempt to parse
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return null; // Invalid

            // Format to YYYY-MM-DD
            return d.toISOString().split('T')[0];
        };

        const fixTable = async (table) => {
            const updates = [];
            // We iterate all. For very large DBs this might be slow, but it's a necessary one-time fix.
            // Optimization: Cursor
            await table.each(item => {
                if (item.date) {
                    const newDate = normalize(item.date);
                    if (newDate && newDate !== item.date) {
                        updates.push(table.update(item.id, { date: newDate }));
                    }
                }
            });
            if (updates.length > 0) await Promise.all(updates);
        };

        await Promise.all([
            fixTable(db.sales),
            fixTable(db.stock_in),
            fixTable(db.expenses),
            fixTable(db.purchases)
        ]);

        app.datesFixed = true;
    },

    handleGlobalSearch: (query) => {
        if (!window.views) return;
        const q = query.toLowerCase().trim();
        switch (app.currentState) {
            case 'items': views.loadItemsTable(q); break;
            case 'inventory': views.initInventory(q); break;
            case 'sales': views.loadSalesTable(q); break;
            case 'expenses': views.loadExpensesTable('', q); break; // Assuming loadExpensesTable can take search
            case 'purchases': views.loadPurchasesTable('', q); break; // Assuming loadPurchasesTable can take search
            case 'credit_settlement': views.loadCreditSettlementsTable('', q); break;
        }
    },

    migrateLegacyData: async () => {
        // Check if migration already done
        const migrationDone = localStorage.getItem('savi_pos_migrated');
        if (migrationDone) return;

        console.log('Checking for legacy localStorage data...');
        const tables = ['item_master', 'inventory', 'stock_in', 'sales', 'expenses', 'purchases', 'settings', 'held_bills'];
        let migratedCount = 0;

        for (const table of tables) {
            const data = localStorage.getItem(table);
            if (data) {
                try {
                    const parsedData = JSON.parse(data);
                    if (Array.isArray(parsedData) && parsedData.length > 0) {
                        const count = await db[table].count();
                        if (count === 0) {
                            await db[table].bulkAdd(parsedData);
                            console.log(`Migrated ${parsedData.length} records for table: ${table}`);
                            migratedCount += parsedData.length;
                        }
                    } else if (typeof parsedData === 'object' && parsedData !== null) {
                        // For single object settings
                        const count = await db[table].count();
                        if (count === 0) {
                            await db[table].add(parsedData);
                            migratedCount++;
                        }
                    }
                } catch (e) {
                    console.error(`Migration error for ${table}:`, e);
                }
            }
        }

        if (migratedCount > 0) {
            utils.showNotification(`Successfully migrated ${migratedCount} legacy records to IndexedDB!`, 'success');
        }

        // Mark as done even if nothing was found to avoid repeated checks
        localStorage.setItem('savi_pos_migrated', 'true');
    },

    migrateBatchData: async () => {
        // Check if batch migration already done
        const batchMigrationDone = localStorage.getItem('savi_batch_migrated_v1');
        if (batchMigrationDone) return;

        try {
            console.log('Starting Batch ID Migration (B001)...');

            // Perform everything in a single transaction for speed and atomicity
            await db.transaction('rw', [db.item_master, db.inventory, db.item_batches], async () => {
                const items = await db.item_master.toArray();
                const inventory = await db.inventory.toArray();

                // 1. Update all items in Item Master
                const masterUpdates = items.map(item => ({
                    ...item,
                    useBatch: true,
                    batchId: item.batchId || 'B001'
                }));
                if (masterUpdates.length > 0) await db.item_master.bulkPut(masterUpdates);

                // 2. Update all items in Inventory
                const invUpdates = inventory.map(inv => ({
                    ...inv,
                    batchId: inv.batchId || 'B001'
                }));
                if (invUpdates.length > 0) await db.inventory.bulkPut(invUpdates);

                // 3. Create initial B001 batches in item_batches
                const batchUpdates = [];
                // Query B001 batches to check for duplicates
                const existingB001s = await db.item_batches.where('batchId').equals('B001').toArray();
                const existingItemIds = new Set(existingB001s.map(b => String(b.itemId)));

                for (const item of items) {
                    const strId = String(item.itemId);
                    if (!existingItemIds.has(strId)) {
                        const inv = inventory.find(i => String(i.itemId) === strId);
                        batchUpdates.push({
                            itemId: item.itemId,
                            batchId: 'B001',
                            costPrice: parseFloat(item.costPrice) || 0,
                            listPrice: parseFloat(item.listPrice) || 0,
                            currentStock: inv ? (parseFloat(inv.currentStock) || 0) : 0,
                            initialStock: inv ? (parseFloat(inv.currentStock) || 0) : 0,
                            isDiscontinued: false
                        });
                    }
                }

                if (batchUpdates.length > 0) {
                    await db.item_batches.bulkAdd(batchUpdates);
                }
            });

            console.log('Batch migration completed.');
            localStorage.setItem('savi_batch_migrated_v1', 'true');
        } catch (err) {
            console.error('Batch migration failed:', err);
        }
    },

    migrateIdToString: async () => {
        const migrationFlag = 'savi_id_string_migrated_v3';
        if (localStorage.getItem(migrationFlag)) return;

        console.log('🔄 Starting ID Standardization Migration...');
        try {
            // Get all records from tables where we need to convert itemId to string
            const items = await db.item_master.toArray();
            const inventory = await db.inventory.toArray();
            const stockIn = await db.stock_in.toArray();
            const sales = await db.sales.toArray();
            const batches = await db.item_batches.toArray();
            const heldBills = await db.held_bills.toArray();

            await db.transaction('rw', [db.item_master, db.inventory, db.stock_in, db.sales, db.item_batches, db.held_bills], async () => {
                // 1. item_master
                for (let item of items) {
                    if (typeof item.itemId === 'number') {
                        await db.item_master.delete(item.itemId);
                        item.itemId = String(item.itemId);
                        await db.item_master.put(item);
                    }
                }

                // 2. inventory
                for (let inv of inventory) {
                    if (typeof inv.itemId === 'number') {
                        await db.inventory.delete(inv.itemId);
                        inv.itemId = String(inv.itemId);
                        await db.inventory.put(inv);
                    }
                }

                // 3. stock_in
                for (let record of stockIn) {
                    if (typeof record.itemId === 'number') {
                        await db.stock_in.update(record.id, { itemId: String(record.itemId) });
                    }
                }

                // 4. sales
                for (let record of sales) {
                    if (typeof record.itemId === 'number') {
                        await db.sales.update(record.id, { itemId: String(record.itemId) });
                    }
                }

                // 5. item_batches
                for (let record of batches) {
                    if (typeof record.itemId === 'number') {
                        await db.item_batches.update(record.id, { itemId: String(record.itemId) });
                    }
                }

                // 6. held_bills
                for (let bill of heldBills) {
                    if (bill.cartData && Array.isArray(bill.cartData)) {
                        let changed = false;
                        bill.cartData.forEach(item => {
                            if (typeof item.itemId === 'number') {
                                item.itemId = String(item.itemId);
                                changed = true;
                            }
                        });
                        if (changed) await db.held_bills.put(bill);
                    }
                }
            });

            console.log('✅ ID Standardization Migration Successful!');
            localStorage.setItem(migrationFlag, 'true');
        } catch (err) {
            console.error('❌ ID Standardization Migration Failed:', err);
        }
    },

    initializeUpdatedAt: async () => {
        const migrationFlag = 'savi_updated_at_initialized_v1';
        if (localStorage.getItem(migrationFlag)) return;

        console.log('🔄 Initializing updatedAt timestamps for existing records...');
        try {
            const syncTables = [
                'item_master', 'inventory', 'stock_in', 'sales', 'expenses', 
                'purchases', 'credit_settlements', 'credit_settlements_archive', 'settings', 'item_batches', 'users', 'held_bills',
                'sales_archive', 'stock_in_archive', 'purchases_archive', 'closing_balances', 'audit_logs'
            ];


            for (const table of syncTables) {
                if (!db[table]) continue;
                const records = await db[table].toArray();
                const now = new Date().toISOString();
                
                await db.transaction('rw', db[table], async () => {
                    for (const record of records) {
                        if (!record.updatedAt) {
                            const key = db[table].schema.primKey.name;
                            await db[table].update(record[key], { updatedAt: now });
                        }
                    }
                });
            }

            localStorage.setItem(migrationFlag, 'true');
            console.log('✅ UpdatedAt Initialization Complete.');
        } catch (err) {
            console.error('UpdatedAt Initialization Failed:', err);
        }
    },

    migrateStockInBatches: async () => {
        const migrationFlag = 'savi_stockin_batch_migrated_v1';
        if (localStorage.getItem(migrationFlag)) return;

        console.log('🔄 Starting Stock In Batch ID Migration...');
        try {
            const stockIn = await db.stock_in.toArray();
            const items = await db.item_master.toArray();

            // Create a map for quick lookup
            const itemBatchMap = {};
            items.forEach(i => {
                itemBatchMap[String(i.itemId)] = i.batchId || 'B001';
            });

            await db.transaction('rw', [db.stock_in], async () => {
                for (let record of stockIn) {
                    // Check if batchId is missing or falsy OR is literally "NO BATCH"
                    if (!record.batchId || record.batchId === '' || record.batchId === 'NO BATCH') {
                        const correctBatchId = itemBatchMap[String(record.itemId)] || 'B001';
                        await db.stock_in.update(record.id, { batchId: correctBatchId });
                    }
                }
            });

            console.log('✅ Stock In Batch ID Migration Successful!');
            localStorage.setItem(migrationFlag, 'true');
        } catch (err) {
            console.error('❌ Stock In Batch ID Migration Failed:', err);
        }
    },

    updateOnlineStatus: () => {
        const statusEl = document.getElementById('system-online-status');
        const dotEl = document.querySelector('#sidebar .group\\/status .w-2.h-2');
        const containerEl = document.querySelector('#sidebar .group\\/status');
        const cloudIndicator = document.getElementById('cloud-sync-indicator');

        if (navigator.onLine) {
            if (statusEl) statusEl.innerText = 'Online';
            if (dotEl) {
                dotEl.classList.remove('bg-red-400');
                dotEl.classList.add('bg-green-400', 'animate-pulse');
            }
            if (containerEl) {
                containerEl.classList.remove('from-red-600', 'to-orange-600');
                containerEl.classList.add('from-indigo-600', 'to-purple-600');
            }
            if (cloudIndicator) {
                cloudIndicator.classList.remove('hidden');
                // Use cloudSync to update the indicator properly instead of hardcoding text here
                if (window.cloudSync) {
                    cloudSync.checkStatus();
                } else {
                    cloudIndicator.querySelector('span').innerText = 'Cloud Connected';
                    cloudIndicator.querySelector('.w-2').classList.replace('bg-red-400', 'bg-blue-400');
                }
            }
        } else {
            if (statusEl) statusEl.innerText = 'Offline Mode';
            if (dotEl) {
                dotEl.classList.remove('bg-green-400', 'animate-pulse');
                dotEl.classList.add('bg-red-400');
            }
            if (containerEl) {
                containerEl.classList.remove('from-indigo-600', 'to-purple-600');
                containerEl.classList.add('from-red-600', 'to-orange-600');
            }
            if (cloudIndicator) {
                cloudIndicator.querySelector('span').innerText = 'Cloud Offline';
                cloudIndicator.querySelector('.w-2').classList.replace('bg-blue-400', 'bg-red-400');
                cloudIndicator.querySelector('.w-2').classList.remove('animate-ping');
            }
            utils.showNotification('You are currently offline. System working from IndexedDB.', 'warning');
        }
    },

    updateRoleDisplay: () => {
        const roleEl = document.getElementById('system-user-role');
        if (roleEl) {
            roleEl.innerText = app.isAdmin ? 'Admin' : (app.isViewOnly ? 'User' : '---');
            roleEl.classList.remove('text-indigo-200', 'text-amber-200');
            roleEl.classList.add(app.isAdmin ? 'text-indigo-200' : 'text-amber-200');
        }
    },

    startClock: () => {
        const timeEl = document.getElementById('sidebar-time');
        const dateEl = document.getElementById('sidebar-date');

        const update = () => {
            const now = new Date();

            // Format Time (3:49 PM)
            const timeStr = now.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });

            // Format Date (Feb 21, Sat)
            const dateStr = now.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            }) + ', ' + now.toLocaleDateString('en-US', { weekday: 'short' });

            if (timeEl) timeEl.innerText = timeStr;
            if (dateEl) dateEl.innerText = dateStr;
        };

        update();
        setInterval(update, 1000); // Update every second for accuracy
    },

    checkAutoSync: async () => {
        // Frequency check removed as per user request. 
        // Sync now happens manually or at shutdown.
    }
};

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
