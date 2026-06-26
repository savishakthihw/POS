
window.cloudSync = {
    isSyncing: false,
    collections: [
        'item_master', 'inventory', 'stock_in', 'sales', 'quotations', 'expenses', 
        'purchases', 'settings', 'item_batches', 'users', 'held_bills',
        'sales_archive', 'stock_in_archive', 'purchases_archive', 'expenses_archive', 'closing_balances', 'audit_logs'
    ],


    // Helper to get consistent document ID for Firebase
    getFirebaseDocId: (table, doc) => {
        if (table === 'item_master' || table === 'inventory') return String(doc.itemId);
        if (table === 'settings') return String(doc.key);
        if (table === 'users') return String(doc.username);
        if (table === 'item_batches') return `${doc.itemId}_${doc.batchId}`;
        return String(doc.id || utils.generateId('SYNC'));
    },

    // Helper to sanitize document for Firestore size limits (1MB)
    sanitizeDoc: (doc, table, docId) => {
        const sanitized = { ...doc };
        let wasModified = false;
        const LIMIT = 1048400; // Slightly less than 1MB (1,048,576 bytes) to be safe

        for (const key in sanitized) {
            if (typeof sanitized[key] === 'string' && sanitized[key].length > LIMIT) {
                console.warn(`Field "${key}" in ${table}/${docId} is too large (${sanitized[key].length} bytes). Truncating for cloud sync.`);
                sanitized[key] = `[DATA TOO LARGE FOR CLOUD SYNC: ${Math.round(sanitized[key].length / 1024)} KB]`;
                wasModified = true;
            }
        }
        return { sanitized, wasModified };
    },

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
        
        // SECURITY FIX: Only Admin should be able to push data to cloud.
        // View-Only users (Mobile) should NOT overwrite Cloud data.
        if (typeof app !== 'undefined' && !app.isAdmin) {
            console.warn('Sync Blocked: Non-admin users cannot upload data to cloud.');
            return false;
        }

        if (cloudSync.isSyncing) return;
        cloudSync.isSyncing = true;
        
        const cloudIndicator = document.getElementById('cloud-sync-indicator');
        const updateStatus = (msg, color = 'blue', isComplete = false) => {
            if (cloudIndicator) {
                cloudIndicator.querySelector('span').innerText = msg;
                const dot = cloudIndicator.querySelector('.w-2');
                
                if (isComplete) {
                    dot.className = `w-2 h-2 rounded-full bg-emerald-400`;
                    cloudIndicator.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 cursor-pointer hover:bg-emerald-100 transition-all group';
                } else {
                    dot.className = `w-2 h-2 rounded-full bg-${color}-400 animate-ping`;
                    cloudIndicator.className = `flex items-center gap-2 px-3 py-1.5 rounded-full bg-${color}-50 border border-${color}-100 cursor-pointer hover:bg-${color}-100 transition-all group`;
                }
            }
        };

        try {
            if (!isSilent) utils.showNotification('Synchronizing with Cloud...', 'info');
            updateStatus('Synchronizing...', 'blue');
            
            for (const table of cloudSync.collections) {
                const lastSyncTimeKey = `last_sync_time_${table}`;
                const lastSyncTime = localStorage.getItem(lastSyncTimeKey) || "1970-01-01T00:00:00.000Z";
                
                let data = [];
                // Tables that should ALWAYS be fully synced (Small Master Data)
                const fullSyncTables = ['settings', 'users'];
                
                if (fullSyncTables.includes(table)) {
                    data = await db[table].toArray();
                } else {
                    // Incremental: New records OR updated records
                    // We check for updatedAt > lastSyncTime OR id > lastId (for legacy support)
                    const lastSyncIdKey = `last_sync_id_${table}`;
                    const lastId = parseInt(localStorage.getItem(lastSyncIdKey)) || 0;

                    // Fetch records modified since last sync
                    const updatedRecords = await db[table].where('updatedAt').above(lastSyncTime).toArray();
                    
                    // Also fetch new records based on ID (for those without updatedAt yet)
                    let newRecords = [];
                    if (db[table].schema.primKey.name === 'id') {
                        newRecords = await db[table].where('id').above(lastId).toArray();
                    }
                    
                    // Merge and de-duplicate
                    const combined = [...updatedRecords, ...newRecords];
                    const seen = new Set();
                    data = combined.filter(doc => {
                        const uniqueKey = cloudSync.getFirebaseDocId(table, doc);
                        if (seen.has(uniqueKey)) return false;
                        seen.add(uniqueKey);
                        return true;
                    });
                }

                if (data.length === 0) continue;

                if (!isSilent) utils.showNotification(`Syncing ${table} (${data.length} records)...`, 'info');
                
                let maxIdInThisSync = parseInt(localStorage.getItem(`last_sync_id_${table}`)) || 0;
                let maxTimeInThisSync = lastSyncTime;

                for (let i = 0; i < data.length; i += 500) {
                    const chunk = data.slice(i, i + 500);
                    const batch = cloudDB.batch();
                    
                    chunk.forEach(doc => {
                        if (table === 'settings' && doc.key === 'custom_font') return;

                        const docId = cloudSync.getFirebaseDocId(table, doc);
                        
                        // Update trackable metrics
                        if (doc.id && !isNaN(doc.id) && doc.id > maxIdInThisSync) maxIdInThisSync = doc.id;
                        if (doc.updatedAt && doc.updatedAt > maxTimeInThisSync) maxTimeInThisSync = doc.updatedAt;

                        const { sanitized, wasModified } = cloudSync.sanitizeDoc(doc, table, docId);
                        const docRef = cloudDB.collection(table).doc(docId);
                        batch.set(docRef, sanitized, { merge: true }); 
                    });

                    await batch.commit();
                }
                
                // Update markers
                localStorage.setItem(lastSyncTimeKey, maxTimeInThisSync);
                if (maxIdInThisSync > 0) {
                    localStorage.setItem(`last_sync_id_${table}`, maxIdInThisSync.toString());
                }
                console.log(`✅ Synced ${table}: ${data.length} records`);
            }


            const now = new Date();
            const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric' });
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const fullSyncStr = `${dateStr}, ${timeStr}`;
            localStorage.setItem('savi_last_cloud_sync_time', fullSyncStr);

            
            if (cloudIndicator) {
                updateStatus('Sync Complete', 'emerald', true);
                setTimeout(() => {
                    if (cloudIndicator) cloudIndicator.querySelector('span').innerText = `Synced ${fullSyncStr}`;
                }, 3000);
            }

            if (!isSilent) utils.showNotification('✅ Incremental Sync Successful!', 'success');
            return true;
        } catch (err) {
            console.error('Cloud Sync Failed:', err);
            updateStatus('Sync Failed', 'red');
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
                    // Reset sync markers since we wiped the cloud
                    localStorage.setItem(`last_sync_id_${table}`, '0');
                    localStorage.setItem(`last_sync_time_${table}`, '1970-01-01T00:00:00.000Z');
                }

                utils.showNotification('📥 Importing JSON data to Cloud...', 'info');

                // Upload from JSON
                const dataRoot = jsonData.data || jsonData; 
                let totalUploaded = 0;
                
                for (const table of cloudSync.collections) {
                    const data = dataRoot[table];
                    if (!data || !Array.isArray(data) || data.length === 0) continue;

                    utils.showNotification(`Importing ${table} (${data.length} records)...`, 'info');
                    for (let i = 0; i < data.length; i += 500) {
                        const chunk = data.slice(i, i + 500);
                        const batch = cloudDB.batch();
                        chunk.forEach(doc => {
                            // Skip custom_font from cloud sync
                            if (table === 'settings' && doc.key === 'custom_font') return;

                            const docId = cloudSync.getFirebaseDocId(table, doc);
                            const { sanitized } = cloudSync.sanitizeDoc(doc, table, docId);
                            batch.set(cloudDB.collection(table).doc(docId), sanitized);
                            totalUploaded++;
                        });
                        await batch.commit();
                    }
                }

                utils.showNotification(`✅ Cloud Upload Completed! ${totalUploaded} records synced.`, 'success');
            } catch (err) {
                console.error('JSON Cloud Import Failed:', err);
                utils.showNotification('❌ Cloud Upload Unsuccessful! Error: ' + err.message, 'error');
            } finally {
                cloudSync.isSyncing = false;
                // Clear input
                const input = document.getElementById('cloud-json-input');
                if (input) input.value = '';
            }
        };
        reader.onerror = () => {
            utils.showNotification('❌ Cloud Upload Unsuccessful! Could not read file.', 'error');
            cloudSync.isSyncing = false;
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
                    
                    // Special handling for settings to preserve local-only font
                    if (table === 'settings') {
                        const localFont = await db.settings.get('custom_font');
                        await db[table].clear();
                        await db[table].bulkAdd(cloudData);
                        if (localFont) await db.settings.put(localFont);
                    } else {
                        await db[table].clear();
                        await db[table].bulkAdd(cloudData);
                    }
                }
                // Reset sync markers after full download to ensure next incremental sync starts fresh
                localStorage.setItem(`last_sync_id_${table}`, '0');
                localStorage.setItem(`last_sync_time_${table}`, '1970-01-01T00:00:00.000Z');
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
                // Reset local sync markers for this table since cloud is now empty
                localStorage.setItem(`last_sync_id_${table}`, '0');
                localStorage.setItem(`last_sync_time_${table}`, '1970-01-01T00:00:00.000Z');
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
