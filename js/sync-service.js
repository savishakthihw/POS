/**
 * SyncService - Handles synchronization between Dexie (Local) and Firestore (Cloud)
 */
const SyncService = {
    collections: [
        'item_master',
        'inventory',
        'stock_in',
        'sales',
        'expenses',
        'purchases',
        'settings',
        'users',
        'item_batches'
    ],

    isSyncing: false,

    init() {
        console.log("SyncService Initializing...");
        this.setupHooks();
        this.checkOnlineStatus();
    },

    setupHooks() {
        // Hook into each table to watch for changes
        this.collections.forEach(table => {
            if (db[table]) {
                db[table].hook('creating', (primKey, obj, transaction) => {
                    this.pushToFirestore(table, primKey || obj.id || obj.itemId, obj, 'create');
                });

                db[table].hook('updating', (modifications, primKey, obj, transaction) => {
                    const updatedObj = { ...obj, ...modifications };
                    this.pushToFirestore(table, primKey, updatedObj, 'update');
                });

                db[table].hook('deleting', (primKey, obj, transaction) => {
                    this.deleteFromFirestore(table, primKey);
                });
            }
        });
    },

    async pushToFirestore(table, id, data, action) {
        if (!firestore) return;
        
        try {
            // Clean data for Firestore
            const cleanData = JSON.parse(JSON.stringify(data));
            
            // Check size (Firestore limit is 1MB per document)
            const size = new TextEncoder().encode(JSON.stringify(cleanData)).length;
            if (size > 1048487) { // 1MB limit
                console.warn(`Skipping sync for ${table}/${id}: Document size (${size} bytes) exceeds Firestore 1MB limit.`);
                return;
            }

            const docId = id.toString();
            await firestore.collection(table).doc(docId).set(cleanData, { merge: true });
            console.log(`Synced ${action} to Firestore: ${table}/${docId}`);
            this.updateSyncUI(true);
        } catch (error) {
            console.error(`Sync error (${table}):`, error);
            this.updateSyncUI(false);
        }
    },

    async deleteFromFirestore(table, id) {
        if (!firestore) return;

        try {
            const docId = id.toString();
            await firestore.collection(table).doc(docId).delete();
            console.log(`Synced delete to Firestore: ${table}/${docId}`);
        } catch (error) {
            console.error(`Sync delete error (${table}):`, error);
        }
    },

    /**
     * Full Sync from Firestore to Local Dexie
     * Use this when opening the POS on a new device (like mobile)
     */
    async pullAll() {
        if (this.isSyncing) return;
        this.isSyncing = true;
        console.log("Starting Full Cloud Pull...");

        try {
            for (const table of this.collections) {
                const snapshot = await firestore.collection(table).get();
                const data = [];
                snapshot.forEach(doc => {
                    data.push(doc.data());
                });

                if (data.length > 0) {
                    await db[table].clear();
                    await db[table].bulkAdd(data);
                    console.log(`Pulled ${data.length} records for ${table}`);
                }
            }
            alert("Cloud Sync Complete! Data is now up to date.");
        } catch (error) {
            console.error("Full Pull Error:", error);
            alert("Sync Failed. Please check your internet connection.");
        } finally {
            this.isSyncing = false;
        }
    },

    /**
     * Full Push from Local Dexie to Firestore
     * Use this for the first time to upload all local PC data
     */
    async pushAll() {
        if (this.isSyncing) return;
        if (!confirm("This will upload ALL your current local data to the cloud. Proceed?")) return;

        this.isSyncing = true;
        console.log("Starting Full Cloud Push...");

        try {
            for (const table of this.collections) {
                const data = await db[table].toArray();
                console.log(`Pushing ${data.length} records for ${table}...`);
                
                // Push in batches of 500 (Firestore limit)
                const batchSize = 500;
                for (let i = 0; i < data.length; i += batchSize) {
                    const batch = firestore.batch();
                    const chunk = data.slice(i, i + batchSize);
                    
                    chunk.forEach(item => {
                        const cleanItem = JSON.parse(JSON.stringify(item));
                        const size = new TextEncoder().encode(JSON.stringify(cleanItem)).length;
                        
                        if (size <= 1048487) {
                            const id = (item.id || item.itemId || item.key || i).toString();
                            const docRef = firestore.collection(table).doc(id);
                            batch.set(docRef, cleanItem, { merge: true });
                        } else {
                            console.warn(`Skipping ${table} item during batch: Size ${size} bytes exceeds limit.`);
                        }
                    });
                    
                    await batch.commit();
                }
            }
            alert("Local Data Uploaded Successfully!");
        } catch (error) {
            console.error("Full Push Error:", error);
            alert("Upload Failed: " + error.message);
        } finally {
            this.isSyncing = false;
        }
    },

    checkOnlineStatus() {
        window.addEventListener('online', () => this.updateSyncUI(true));
        window.addEventListener('offline', () => this.updateSyncUI(false));
        this.updateSyncUI(navigator.onLine);
    },

    updateSyncUI(isOnline) {
        const statusEl = document.getElementById('system-online-status');
        if (statusEl) {
            if (isOnline) {
                statusEl.textContent = "Cloud Active";
                statusEl.classList.remove('text-red-400');
                statusEl.classList.add('text-green-400');
            } else {
                statusEl.textContent = "Offline Mode";
                statusEl.classList.remove('text-green-400');
                statusEl.classList.add('text-red-400');
            }
        }
    }
};

// Start the service
SyncService.init();
