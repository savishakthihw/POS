
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
        utils.showNotification('Syncing to Cloud...', 'info');

        try {
            for (const table of cloudSync.collections) {
                const data = await db[table].toArray();
                const batch = cloudDB.batch();
                data.forEach(doc => {
                    const docId = doc.id ? String(doc.id) : utils.generateId('SYNC');
                    const docRef = cloudDB.collection(table).doc(docId);
                    batch.set(docRef, doc);
                });
                await batch.commit();
                console.log(`✅ Uploaded ${table}`);
            }
            utils.showNotification('Cloud Backup Successful!', 'success');
        } catch (err) {
            console.error('Cloud Upload Failed:', err);
            utils.showNotification('Cloud Sync Failed!', 'error');
        } finally {
            cloudSync.isSyncing = false;
        }
    },

    // 2. Download Cloud Data (Requires Password)
    downloadAll: async () => {
        if (!cloudSync.verifyAccess()) return;
        if (cloudSync.isSyncing) return;
        cloudSync.isSyncing = true;
        utils.showNotification('Downloading Cloud Data...', 'info');

        try {
            for (const table of cloudSync.collections) {
                const snapshot = await cloudDB.collection(table).get();
                if (!snapshot.empty) {
                    const cloudData = snapshot.docs.map(doc => doc.data());
                    await db[table].clear();
                    await db[table].bulkAdd(cloudData);
                }
            }
            utils.showNotification('Cloud Sync Download Successful!', 'success');
            if (app.currentState) app.navigate(app.currentState);
        } catch (err) {
            console.error('Cloud Download Failed:', err);
            utils.showNotification('Sync Download Failed!', 'error');
        } finally {
            cloudSync.isSyncing = false;
        }
    }
};
