
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

    // 1. Upload Local Data to Firebase (Requires Password)
    uploadAll: async () => {
        if (!cloudSync.verifyAccess()) return;
        if (cloudSync.isSyncing) return;
        cloudSync.isSyncing = true;
        
        try {
            utils.showNotification('Verifying cloud write access...', 'info');
            // Test write to see if rules allow it
            await cloudDB.collection('connection_test').doc('test').set({ 
                last_test: new Date().toISOString(),
                status: 'ready'
            });
            
            utils.showNotification('Cloud access verified. Starting sync...', 'info');
            
            for (const table of cloudSync.collections) {
                // Show which table is syncing
                utils.showNotification(`Syncing ${table}...`, 'info');
                
                const data = await db[table].toArray();
                if (data.length === 0) continue;

                // Chunk data into batches of 500
                const totalChunks = Math.ceil(data.length / 500);
                for (let i = 0; i < data.length; i += 500) {
                    const chunkNumber = Math.floor(i / 500) + 1;
                    utils.showNotification(`Syncing ${table}: Part ${chunkNumber}/${totalChunks}...`, 'info');
                    
                    const chunk = data.slice(i, i + 500);
                    const batch = cloudDB.batch();
                    
                    chunk.forEach(doc => {
                        // Correctly identify the document ID based on the table schema
                        let docId;
                        if (table === 'item_master' || table === 'inventory') {
                            docId = String(doc.itemId);
                        } else if (table === 'settings') {
                            docId = String(doc.key);
                        } else {
                            docId = String(doc.id || utils.generateId('SYNC'));
                        }

                        const docRef = cloudDB.collection(table).doc(docId);
                        batch.set(docRef, doc);
                    });
                    
                    await batch.commit();
                }
                console.log(`✅ Uploaded ${table} (${data.length} records)`);
            }
            utils.showNotification('✅ Cloud Upload Successful!', 'success');
        } catch (err) {
            console.error('Cloud Upload Failed:', err);
            utils.showNotification(`❌ Cloud Upload Failed: ${err.message}`, 'error');
        } finally {
            cloudSync.isSyncing = false;
        }
    },

    // 2. Download Cloud Data (Requires Password)
    downloadAll: async () => {
        if (!cloudSync.verifyAccess()) return;
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
        
        try {
            await cloudDB.collection('settings').limit(1).get();
            if (cloudIndicator) {
                cloudIndicator.querySelector('span').innerText = 'Cloud Sync Active';
                cloudIndicator.querySelector('.w-2').classList.replace('bg-red-400', 'bg-emerald-400');
                cloudIndicator.querySelector('.w-2').classList.replace('bg-blue-400', 'bg-emerald-400');
                cloudIndicator.querySelector('i').classList.replace('text-blue-400', 'text-emerald-500');
                cloudIndicator.classList.replace('bg-blue-50', 'bg-emerald-50');
                cloudIndicator.classList.replace('border-blue-100', 'border-emerald-100');
            }
        } catch (err) {
            if (cloudIndicator) {
                cloudIndicator.querySelector('span').innerText = 'Sync Error';
                cloudIndicator.querySelector('.w-2').classList.replace('bg-blue-400', 'bg-red-400');
                cloudIndicator.querySelector('.w-2').classList.replace('bg-emerald-400', 'bg-red-400');
                cloudIndicator.querySelector('i').classList.replace('text-blue-400', 'text-red-400');
            }
        }
    }
};
