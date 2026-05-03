
window.cloudSync = {
    isSyncing: false,
    collections: [
        'item_master', 'inventory', 'stock_in', 'sales', 'expenses', 
        'purchases', 'settings', 'item_batches', 'users', 'held_bills',
        'sales_archive', 'stock_in_archive', 'closing_balances', 'audit_logs'
    ],

    // Check Firebase Connection
    checkConnection: async () => {
        utils.showNotification('Checking Firebase connection...', 'info');
        try {
            // Try to fetch a small document to test connection
            await cloudDB.collection('settings').limit(1).get();
            utils.showNotification('Firebase Connection: STABLE ✅', 'success');
        } catch (err) {
            console.error('Firebase Connection Error:', err);
            utils.showNotification('Firebase Connection: FAILED ❌', 'error');
        }
    },

    // Password verification helper
    verifyAccess: () => {
        const pwd = prompt('☁️ CLOUD SYNC ACCESS\n\nPlease enter the Cloud Synchronization password to proceed:');
        if (pwd === "8542074") {
            return true;
        } else if (pwd !== null) {
            utils.showNotification('Incorrect password! Cloud Sync aborted.', 'error');
        }
        return false;
    },

    // 1. Upload Local Data to Firebase (Incremental)
    uploadAll: async (isSilent = false) => {
        if (!isSilent && !cloudSync.verifyAccess()) return;
        if (cloudSync.isSyncing) return;
        cloudSync.isSyncing = true;
        
        const cloudIndicator = document.getElementById('cloud-sync-indicator');
        const updateStatus = (msg, color = 'blue') => {
            if (cloudIndicator) {
                cloudIndicator.querySelector('span').innerText = msg;
                cloudIndicator.querySelector('.w-2').className = `w-2 h-2 rounded-full bg-${color}-400 animate-ping`;
            }
        };

        try {
            if (!isSilent) utils.showNotification('Starting Incremental Cloud Sync...', 'info');
            updateStatus('Syncing...', 'blue');
            
            for (const table of cloudSync.collections) {
                const lastSyncIdKey = `last_sync_id_${table}`;
                const lastId = parseInt(localStorage.getItem(lastSyncIdKey)) || 0;
                
                let data = [];
                // Tables that should ALWAYS be fully synced (Master Data)
                const fullSyncTables = ['item_master', 'inventory', 'settings', 'users', 'item_batches'];
                
                if (fullSyncTables.includes(table)) {
                    data = await db[table].toArray();
                } else {
                    // Incremental tables: only fetch records with ID > last synced ID
                    data = await db[table].where('id').above(lastId).toArray();
                }

                if (data.length === 0) continue;

                if (!isSilent) utils.showNotification(`Syncing ${table} (${data.length} new)...`, 'info');
                
                const totalChunks = Math.ceil(data.length / 500);
                let maxIdInThisSync = lastId;

                for (let i = 0; i < data.length; i += 500) {
                    const chunk = data.slice(i, i + 500);
                    const batch = cloudDB.batch();
                    
                    chunk.forEach(doc => {
                        let docId;
                        if (table === 'item_master' || table === 'inventory') {
                            docId = String(doc.itemId);
                        } else if (table === 'settings') {
                            docId = String(doc.key);
                        } else {
                            docId = String(doc.id);
                            if (doc.id > maxIdInThisSync) maxIdInThisSync = doc.id;
                        }

                        const docRef = cloudDB.collection(table).doc(docId);
                        batch.set(docRef, doc, { merge: true }); // Use merge to avoid accidental data loss
                    });
                    
                    await batch.commit();
                }
                
                // Update last sync ID for incremental tables
                if (!fullSyncTables.includes(table)) {
                    localStorage.setItem(lastSyncIdKey, maxIdInThisSync.toString());
                }
                console.log(`✅ Synced ${table}: ${data.length} records`);
            }

            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            localStorage.setItem('savi_last_cloud_sync_time', timeStr);
            
            if (cloudIndicator) {
                cloudIndicator.querySelector('span').innerText = `Synced ${timeStr}`;
                cloudIndicator.querySelector('.w-2').classList.replace('bg-blue-400', 'bg-emerald-400');
                cloudIndicator.querySelector('.w-2').classList.remove('animate-ping');
            }

            if (!isSilent) utils.showNotification('✅ Incremental Sync Successful!', 'success');
            return true;
        } catch (err) {
            console.error('Cloud Sync Failed:', err);
            if (!isSilent) utils.showNotification(`❌ Cloud Sync Failed: ${err.message}`, 'error');
            return false;
        } finally {
            cloudSync.isSyncing = false;
        }
    },

    // 1.5 Upload from JSON File (Wipes Cloud First)
    uploadFromJSON: async (file) => {
        if (!cloudSync.verifyAccess()) return;
        if (!confirm('⚠️ DANGER: This will delete ALL cloud data and replace it with the content of this JSON file. Proceed?')) return;
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const jsonData = JSON.parse(e.target.result);
                if (cloudSync.isSyncing) return;
                cloudSync.isSyncing = true;

                utils.showNotification('🔥 Wiping cloud data for fresh import...', 'warning');
                
                // Wipe Cloud First
                for (const table of cloudSync.collections) {
                    const snapshot = await cloudDB.collection(table).get();
                    if (!snapshot.empty) {
                        for (let i = 0; i < snapshot.docs.length; i += 500) {
                            const batch = cloudDB.batch();
                            snapshot.docs.slice(i, i + 500).forEach(doc => batch.delete(doc.ref));
                            await batch.commit();
                        }
                    }
                }

                utils.showNotification('📥 Importing JSON data to Cloud...', 'info');

                // Upload from JSON
                for (const table of cloudSync.collections) {
                    const data = jsonData[table];
                    if (!data || !Array.isArray(data) || data.length === 0) continue;

                    utils.showNotification(`Importing ${table}...`, 'info');
                    for (let i = 0; i < data.length; i += 500) {
                        const chunk = data.slice(i, i + 500);
                        const batch = cloudDB.batch();
                        chunk.forEach(doc => {
                            let docId;
                            if (table === 'item_master' || table === 'inventory') docId = String(doc.itemId);
                            else if (table === 'settings') docId = String(doc.key);
                            else docId = String(doc.id || utils.generateId('JSON'));
                            
                            batch.set(cloudDB.collection(table).doc(docId), doc);
                        });
                        await batch.commit();
                    }
                    // Reset last sync IDs to 0 since we wiped the cloud
                    localStorage.setItem(`last_sync_id_${table}`, '0');
                }

                utils.showNotification('✅ JSON Cloud Import Successful!', 'success');
            } catch (err) {
                console.error('JSON Cloud Import Failed:', err);
                utils.showNotification('❌ Import failed: ' + err.message, 'error');
            } finally {
                cloudSync.isSyncing = false;
            }
        };
        reader.readAsText(file);
    },

    // 2. Download Cloud Data (Requires Password)
    downloadAll: async () => {
        if (!cloudSync.verifyAccess()) return;
        
        // --- NEW: Safety First - Auto Local Backup before Overwriting ---
        if (confirm('⚠️ SAFETY BACKUP\n\nThe system will now download a local backup of your PC data before overwriting it with Cloud data.\n\nPlease save the backup file first, then click OK to proceed with the download.')) {
            utils.showNotification('Triggering safety backup...', 'info');
            await views.backupData();
        } else {
            utils.showNotification('Download aborted to protect local data.', 'warning');
            return;
        }

        if (cloudSync.isSyncing) return;
        cloudSync.isSyncing = true;
        utils.showNotification('📥 Initializing Cloud Download...', 'info');

        try {
            for (const table of cloudSync.collections) {
                utils.showNotification(`📥 Downloading ${table}...`, 'info');
                const snapshot = await cloudDB.collection(table).get();
                if (!snapshot.empty) {
                    const cloudData = snapshot.docs.map(doc => doc.data());
                    await db[table].clear();
                    await db[table].bulkAdd(cloudData);
                }
                // Reset sync IDs after full download
                localStorage.setItem(`last_sync_id_${table}`, '0');
            }
            utils.showNotification('✅ Cloud Download Successful!', 'success');
            
            // Reload page to reflect changes
            setTimeout(() => {
                window.location.reload();
            }, 1500);

        } catch (err) {
            console.error('Cloud Download Failed:', err);
            utils.showNotification(`❌ Cloud Download Failed: ${err.message}`, 'error');
        } finally {
            cloudSync.isSyncing = false;
        }
    },

    // 3. Clear All Cloud Data (Requires Password)
    clearCloudData: async () => {
        if (!cloudSync.verifyAccess()) return;
        const confirmClear = confirm('⚠️ CRITICAL WARNING!\n\nThis will permanently delete ALL data from the Cloud (Firebase). This action cannot be undone.\n\nAre you absolutely sure?');
        if (!confirmClear) return;

        if (cloudSync.isSyncing) return;
        cloudSync.isSyncing = true;
        utils.showNotification('🔥 Initializing Cloud Wipe...', 'info');

        try {
            for (const table of cloudSync.collections) {
                utils.showNotification(`🔥 Wiping ${table} from cloud...`, 'info');
                const snapshot = await cloudDB.collection(table).get();
                
                if (!snapshot.empty) {
                    // Chunk deletes in batches of 500
                    for (let i = 0; i < snapshot.docs.length; i += 500) {
                        const batch = cloudDB.batch();
                        const chunk = snapshot.docs.slice(i, i + 500);
                        chunk.forEach(doc => batch.delete(doc.ref));
                        await batch.commit();
                    }
                    console.log(`🔥 Wiped ${table}`);
                }
            }
            utils.showNotification('✅ Cloud Data Successfully Wiped!', 'success');
        } catch (err) {
            console.error('Cloud Wipe Failed:', err);
            utils.showNotification(`❌ Cloud Wipe Failed: ${err.message}`, 'error');
        } finally {
            cloudSync.isSyncing = false;
        }
    },

    // Silent check for indicator
    checkStatus: async () => {
        const cloudIndicator = document.getElementById('cloud-sync-indicator');
        if (!navigator.onLine) return;
        
        const lastSync = localStorage.getItem('savi_last_cloud_sync_time');
        
        try {
            await cloudDB.collection('settings').limit(1).get();
            if (cloudIndicator) {
                cloudIndicator.querySelector('span').innerText = lastSync ? `Synced ${lastSync}` : 'Cloud Ready';
                cloudIndicator.querySelector('.w-2').className = 'w-2 h-2 rounded-full bg-emerald-400';
                cloudIndicator.querySelector('i').className = 'fa-solid fa-cloud-check text-emerald-500';
                cloudIndicator.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 cursor-pointer hover:bg-emerald-100 transition-all group';
            }
        } catch (err) {
            if (cloudIndicator) {
                cloudIndicator.querySelector('span').innerText = 'Cloud Error';
                cloudIndicator.querySelector('.w-2').className = 'w-2 h-2 rounded-full bg-red-400';
                cloudIndicator.querySelector('i').className = 'fa-solid fa-cloud-exclamation text-red-400';
                cloudIndicator.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 border border-red-100 cursor-pointer hover:bg-red-100 transition-all group';
            }
        }
    }
};
