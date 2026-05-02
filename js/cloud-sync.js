
window.cloudSync = {
    isSyncing: false,
    collections: ['item_master', 'inventory', 'stock_in', 'sales', 'expenses', 'purchases', 'settings', 'item_batches', 'users'],

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
                        const docId = doc.id ? String(doc.id) : utils.generateId('SYNC');
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
    }
};
