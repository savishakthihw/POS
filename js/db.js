const db = new Dexie("SaviSakthiDB");

db.version(5).stores({
    // Pradhana badu liyapadinchiya
    item_master: "itemId, itemName, category, supplierId, unit, costPrice, listPrice, reorderLevel",

    // Thoga wisthara (Calculated table)
    inventory: "itemId, itemName, stockIn, sold, currentStock, reorderLevel, stockValue",

    // Badu athulath kireeme ithihasaya (Editable)
    stock_in: "++id, date, supplierId, itemId, itemName, qty, costPrice, total, remarks",

    // Wikunuma ithihasaya (Editable)
    sales: "++id, date, billNo, itemId, itemName, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, method, paymentStatus, settledDate",

    // Athihituwu bilpath (Held Bills)
    held_bills: "++id, timestamp, customerName, itemCount, total, cartData"
});

// Upgrade for Performance (Adding supplierId index to inventory)
db.version(6).stores({
    item_master: "itemId, itemName, category, supplierId, unit, costPrice, listPrice, reorderLevel",
    inventory: "itemId, itemName, stockIn, sold, currentStock, reorderLevel, stockValue, supplierId", // Added supplierId
    stock_in: "++id, date, supplierId, itemId, itemName, qty, costPrice, total, remarks",
    sales: "++id, date, billNo, itemId, itemName, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, method, paymentStatus, settledDate",
    held_bills: "++id, timestamp, customerName, itemCount, total, cartData",
    expenses: "++id, date, category, description, amount, user"
});

db.version(7).stores({
    purchases: "++id, date, supplierName, invoiceNo, totalBill, paidAmount, balance, method, chequeDate, chequeNo, settleDate"
});

// Consolidated Schema Version for Data Integrity
db.version(10).stores({
    item_master: "itemId, itemName, category, supplierId, unit, costPrice, listPrice, reorderLevel, remarks",
    inventory: "itemId, itemName, stockIn, sold, currentStock, reorderLevel, stockValue, supplierId",
    stock_in: "++id, date, supplierId, itemId, itemName, qty, costPrice, total, remarks",
    sales: "++id, date, billNo, itemId, itemName, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, method, paymentStatus, settledDate",
    held_bills: "++id, timestamp, customerName, itemCount, total, cartData",
    expenses: "++id, date, category, description, amount, user",
    purchases: "++id, date, supplierName, invoiceNo, totalBill, paidAmount, balance, method, chequeDate, chequeNo, settleDate",
    settings: "key, value"
});

// Added Batch ID support
db.version(11).stores({
    item_batches: "++id, itemId, batchId, costPrice, listPrice, currentStock",
    stock_in: "++id, date, supplierId, itemId, itemName, batchId, qty, costPrice, total, remarks",
    sales: "++id, date, billNo, itemId, itemName, batchId, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, method, paymentStatus, settledDate"
});

db.version(13).stores({
    item_master: "itemId, itemName, category, supplierId, unit, costPrice, listPrice, reorderLevel, remarks, useBatch",
    item_batches: "++id, itemId, batchId, [itemId+batchId]",
    stock_in: "++id, date, supplierId, itemId, itemName, batchId, qty, costPrice, total, remarks, mrp",
    sales: "++id, date, billNo, itemId, itemName, batchId, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, method, paymentStatus, settledDate"
});

db.version(14).stores({
    item_batches: "++id, itemId, batchId, [itemId+batchId], isDiscontinued"
});

db.version(15).stores({
    item_master: "itemId, itemName, category, supplierId, unit, costPrice, listPrice, reorderLevel, remarks, useBatch, batchId",
    inventory: "itemId, itemName, stockIn, sold, currentStock, reorderLevel, stockValue, supplierId, batchId",
    stock_in: "++id, date, supplierId, itemId, itemName, batchId, qty, costPrice, total, remarks, mrp",
    sales: "++id, date, billNo, itemId, itemName, batchId, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, method, paymentStatus, settledDate",
    item_batches: "++id, itemId, batchId, [itemId+batchId], isDiscontinued",
    held_bills: "++id, timestamp, customerName, itemCount, total, cartData",
    expenses: "++id, date, category, description, amount, user",
    purchases: "++id, date, supplierName, invoiceNo, totalBill, paidAmount, balance, method, chequeDate, chequeNo, settleDate",
    settings: "key, value"
});

db.version(28).stores({
    item_master: "itemId, itemName, category, supplierId, unit, costPrice, listPrice, reorderLevel, remarks, useBatch, batchId, updatedAt",
    inventory: "itemId, itemName, stockIn, sold, currentStock, reorderLevel, stockValue, supplierId, batchId, avgCost, updatedAt",
    stock_in: "++id, date, supplierId, itemId, itemName, batchId, qty, costPrice, total, remarks, mrp, updatedAt",
    sales: "++id, date, billNo, itemId, itemName, batchId, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, method, paymentStatus, settledDate, paidAmount, billDiscount, itemDiscount, cashAmount, cardAmount, bankAmount, qrAmount, updatedAt",
    item_batches: "++id, itemId, batchId, [itemId+batchId], isDiscontinued, costPrice, listPrice, initialStock, currentStock, updatedAt",
    held_bills: "++id, timestamp, customerName, itemCount, total, cartData, updatedAt",
    expenses: "++id, date, category, description, amount, user, updatedAt",
    purchases: "++id, date, supplierName, invoiceNo, totalBill, paidAmount, balance, method, chequeDate, chequeNo, settleDate, updatedAt",
    settings: "key, value, updatedAt",
    audit_logs: "++id, timestamp, user, action, details, updatedAt",
    users: "++id, &username, role, passwordHash, createdAt, updatedAt",
    ghost_backups: "++id, timestamp",
    sales_archive: "++id, date, billNo, itemId, itemName, batchId, archiveYear, updatedAt",
    stock_in_archive: "++id, date, supplierId, itemId, itemName, batchId, archiveYear, updatedAt",
    purchases_archive: "++id, date, supplierName, invoiceNo, archiveYear, updatedAt",
    closing_balances: "++id, year, itemId, itemName, qty, costPrice, value, updatedAt"
});

db.version(29).stores({
    item_master: "itemId, itemName, category, supplierId, unit, costPrice, listPrice, reorderLevel, remarks, useBatch, batchId, updatedAt",
    inventory: "itemId, itemName, stockIn, sold, currentStock, reorderLevel, stockValue, supplierId, batchId, avgCost, updatedAt",
    stock_in: "++id, date, supplierId, itemId, itemName, batchId, qty, costPrice, total, remarks, mrp, updatedAt",
    sales: "++id, date, billNo, itemId, itemName, batchId, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, method, paymentStatus, settledDate, paidAmount, billDiscount, itemDiscount, cashAmount, cardAmount, bankAmount, qrAmount, updatedAt",
    quotations: "++id, date, billNo, itemId, itemName, batchId, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, method, paymentStatus, settledDate, paidAmount, billDiscount, itemDiscount, cashAmount, cardAmount, bankAmount, qrAmount, updatedAt",
    item_batches: "++id, itemId, batchId, [itemId+batchId], isDiscontinued, costPrice, listPrice, initialStock, currentStock, updatedAt",
    held_bills: "++id, timestamp, customerName, itemCount, total, cartData, updatedAt",
    expenses: "++id, date, category, description, amount, user, updatedAt",
    purchases: "++id, date, supplierName, invoiceNo, totalBill, paidAmount, balance, method, chequeDate, chequeNo, settleDate, updatedAt",
    settings: "key, value, updatedAt",
    audit_logs: "++id, timestamp, user, action, details, updatedAt",
    users: "++id, &username, role, passwordHash, createdAt, updatedAt",
    ghost_backups: "++id, timestamp",
    sales_archive: "++id, date, billNo, itemId, itemName, batchId, archiveYear, updatedAt",
    stock_in_archive: "++id, date, supplierId, itemId, itemName, batchId, archiveYear, updatedAt",
    purchases_archive: "++id, date, supplierName, invoiceNo, archiveYear, updatedAt",
    closing_balances: "++id, year, itemId, itemName, qty, costPrice, value, updatedAt"
});

db.version(30).stores({
    item_master: "itemId, itemName, category, supplierId, unit, costPrice, listPrice, reorderLevel, remarks, useBatch, batchId, updatedAt",
    inventory: "itemId, itemName, stockIn, sold, currentStock, reorderLevel, stockValue, supplierId, batchId, avgCost, updatedAt",
    stock_in: "++id, date, supplierId, itemId, itemName, batchId, qty, costPrice, total, remarks, mrp, updatedAt",
    sales: "++id, date, billNo, itemId, itemName, batchId, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, bankFee, method, paymentStatus, settledDate, paidAmount, billDiscount, itemDiscount, cashAmount, cardAmount, bankAmount, qrAmount, updatedAt",
    quotations: "++id, date, billNo, itemId, itemName, batchId, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, bankFee, method, paymentStatus, settledDate, paidAmount, billDiscount, itemDiscount, cashAmount, cardAmount, bankAmount, qrAmount, updatedAt",
    item_batches: "++id, itemId, batchId, [itemId+batchId], isDiscontinued, costPrice, listPrice, initialStock, currentStock, updatedAt",
    held_bills: "++id, timestamp, customerName, itemCount, total, cartData, updatedAt",
    expenses: "++id, date, category, description, amount, user, updatedAt",
    purchases: "++id, date, supplierName, invoiceNo, totalBill, paidAmount, balance, method, chequeDate, chequeNo, settleDate, updatedAt",
    settings: "key, value, updatedAt",
    audit_logs: "++id, timestamp, user, action, details, updatedAt",
    users: "++id, &username, role, passwordHash, createdAt, updatedAt",
    ghost_backups: "++id, timestamp",
    sales_archive: "++id, date, billNo, itemId, itemName, batchId, bankFee, archiveYear, updatedAt",
    stock_in_archive: "++id, date, supplierId, itemId, itemName, batchId, archiveYear, updatedAt",
    purchases_archive: "++id, date, supplierName, invoiceNo, archiveYear, updatedAt",
    closing_balances: "++id, year, itemId, itemName, qty, costPrice, value, updatedAt"
});

db.version(31).stores({
    item_master: "itemId, itemName, category, supplierId, unit, costPrice, listPrice, reorderLevel, remarks, useBatch, batchId, updatedAt",
    inventory: "itemId, itemName, stockIn, sold, currentStock, reorderLevel, stockValue, supplierId, batchId, avgCost, updatedAt",
    stock_in: "++id, date, supplierId, itemId, itemName, batchId, qty, costPrice, total, remarks, mrp, updatedAt",
    sales: "++id, date, billNo, itemId, itemName, batchId, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, bankFee, method, paymentStatus, settledDate, paidAmount, billDiscount, itemDiscount, cashAmount, cardAmount, bankAmount, qrAmount, updatedAt",
    quotations: "++id, date, billNo, itemId, itemName, batchId, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, bankFee, method, paymentStatus, settledDate, paidAmount, billDiscount, itemDiscount, cashAmount, cardAmount, bankAmount, qrAmount, updatedAt",
    item_batches: "++id, itemId, batchId, [itemId+batchId], isDiscontinued, costPrice, listPrice, initialStock, currentStock, updatedAt",
    held_bills: "++id, timestamp, customerName, itemCount, total, cartData, updatedAt",
    expenses: "++id, date, category, description, amount, user, updatedAt",
    purchases: "++id, date, supplierName, invoiceNo, totalBill, paidAmount, balance, method, chequeDate, chequeNo, settleDate, updatedAt",
    settings: "key, value, updatedAt",
    audit_logs: "++id, timestamp, user, action, details, updatedAt",
    users: "++id, &username, role, passwordHash, createdAt, updatedAt",
    ghost_backups: "++id, timestamp",
    sales_archive: "++id, date, billNo, itemId, itemName, batchId, bankFee, archiveYear, updatedAt",
    stock_in_archive: "++id, date, supplierId, itemId, itemName, batchId, archiveYear, updatedAt",
    purchases_archive: "++id, date, supplierName, invoiceNo, archiveYear, updatedAt",
    expenses_archive: "++id, date, category, description, amount, user, archiveYear, updatedAt",
    closing_balances: "++id, year, itemId, itemName, qty, costPrice, value, updatedAt"
});

db.version(32).stores({
    item_master: "itemId, itemName, category, supplierId, unit, costPrice, listPrice, reorderLevel, remarks, useBatch, batchId, updatedAt",
    inventory: "itemId, itemName, stockIn, sold, currentStock, reorderLevel, stockValue, supplierId, batchId, avgCost, updatedAt",
    stock_in: "++id, date, supplierId, itemId, itemName, batchId, qty, costPrice, total, remarks, mrp, updatedAt",
    sales: "++id, date, billNo, itemId, itemName, batchId, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, bankFee, method, paymentStatus, settledDate, paidAmount, billDiscount, itemDiscount, cashAmount, cardAmount, bankAmount, qrAmount, updatedAt",
    quotations: "++id, date, billNo, itemId, itemName, batchId, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, bankFee, method, paymentStatus, settledDate, paidAmount, billDiscount, itemDiscount, cashAmount, cardAmount, bankAmount, qrAmount, updatedAt",
    item_batches: "++id, itemId, batchId, [itemId+batchId], isDiscontinued, costPrice, listPrice, initialStock, currentStock, updatedAt",
    held_bills: "++id, timestamp, customerName, itemCount, total, cartData, updatedAt",
    expenses: "++id, date, category, description, amount, user, updatedAt",
    purchases: "++id, date, supplierName, invoiceNo, totalBill, paidAmount, balance, method, chequeDate, chequeNo, settleDate, updatedAt",
    settings: "key, value, updatedAt",
    audit_logs: "++id, timestamp, user, action, details, updatedAt",
    users: "++id, &username, role, passwordHash, createdAt, updatedAt",
    ghost_backups: "++id, timestamp",
    sales_archive: "++id, date, billNo, itemId, itemName, batchId, bankFee, archiveYear, updatedAt",
    stock_in_archive: "++id, date, supplierId, itemId, itemName, batchId, archiveYear, updatedAt",
    purchases_archive: "++id, date, supplierName, invoiceNo, archiveYear, updatedAt",
    expenses_archive: "++id, date, category, description, amount, user, archiveYear, updatedAt",
    closing_balances: "++id, year, itemId, itemName, qty, costPrice, value, updatedAt",
    credit_settlements: "++id, dateSettled, supplierName, amount, note, updatedAt",
    credit_settlements_archive: "++id, dateSettled, supplierName, amount, note, archiveYear, updatedAt"
});

db.version(33).stores({
    item_master: "itemId, itemName, category, supplierId, unit, costPrice, listPrice, reorderLevel, remarks, useBatch, batchId, updatedAt",
    inventory: "itemId, itemName, stockIn, sold, currentStock, reorderLevel, stockValue, supplierId, batchId, avgCost, updatedAt",
    stock_in: "++id, date, supplierId, itemId, itemName, batchId, qty, costPrice, total, remarks, mrp, updatedAt",
    sales: "++id, date, billNo, itemId, itemName, batchId, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, bankFee, method, paymentStatus, settledDate, paidAmount, billDiscount, itemDiscount, cashAmount, cardAmount, bankAmount, qrAmount, updatedAt",
    quotations: "++id, date, billNo, itemId, itemName, batchId, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, bankFee, method, paymentStatus, settledDate, paidAmount, billDiscount, itemDiscount, cashAmount, cardAmount, bankAmount, qrAmount, updatedAt",
    item_batches: "++id, itemId, batchId, [itemId+batchId], isDiscontinued, costPrice, listPrice, initialStock, currentStock, updatedAt",
    held_bills: "++id, timestamp, customerName, itemCount, total, cartData, updatedAt",
    credit_pending_bills: "++id, timestamp, customerName, itemCount, total, cartData, updatedAt",
    expenses: "++id, date, category, description, amount, user, updatedAt",
    purchases: "++id, date, supplierName, invoiceNo, totalBill, paidAmount, balance, method, chequeDate, chequeNo, settleDate, updatedAt",
    settings: "key, value, updatedAt",
    audit_logs: "++id, timestamp, user, action, details, updatedAt",
    users: "++id, &username, role, passwordHash, createdAt, updatedAt",
    ghost_backups: "++id, timestamp",
    sales_archive: "++id, date, billNo, itemId, itemName, batchId, bankFee, archiveYear, updatedAt",
    stock_in_archive: "++id, date, supplierId, itemId, itemName, batchId, archiveYear, updatedAt",
    purchases_archive: "++id, date, supplierName, invoiceNo, archiveYear, updatedAt",
    expenses_archive: "++id, date, category, description, amount, user, archiveYear, updatedAt",
    closing_balances: "++id, year, itemId, itemName, qty, costPrice, value, updatedAt",
    credit_settlements: "++id, dateSettled, supplierName, amount, note, updatedAt",
    credit_settlements_archive: "++id, dateSettled, supplierName, amount, note, archiveYear, updatedAt"
});

db.version(34).stores({
    item_master: "itemId, itemName, category, supplierId, unit, costPrice, listPrice, reorderLevel, remarks, useBatch, batchId, updatedAt",
    inventory: "itemId, itemName, stockIn, sold, currentStock, reorderLevel, stockValue, supplierId, batchId, avgCost, updatedAt",
    stock_in: "++id, date, supplierId, itemId, itemName, batchId, qty, costPrice, total, remarks, mrp, updatedAt",
    sales: "++id, date, billNo, itemId, itemName, batchId, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, bankFee, method, paymentStatus, settledDate, paidAmount, billDiscount, itemDiscount, cashAmount, cardAmount, bankAmount, qrAmount, updatedAt",
    quotations: "++id, date, billNo, itemId, itemName, batchId, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, bankFee, method, paymentStatus, settledDate, paidAmount, billDiscount, itemDiscount, cashAmount, cardAmount, bankAmount, qrAmount, updatedAt",
    item_batches: "++id, itemId, batchId, [itemId+batchId], isDiscontinued, costPrice, listPrice, initialStock, currentStock, updatedAt",
    held_bills: "++id, timestamp, customerName, itemCount, total, cartData, updatedAt",
    credit_pending_bills: "++id, timestamp, customerName, itemCount, total, cartData, updatedAt",
    expenses: "++id, date, category, description, amount, user, updatedAt",
    purchases: "++id, date, supplierName, invoiceNo, totalBill, paidAmount, balance, method, chequeDate, chequeNo, settleDate, updatedAt",
    settings: "key, value, updatedAt",
    audit_logs: "++id, timestamp, user, action, details, updatedAt",
    users: "++id, &username, role, passwordHash, createdAt, updatedAt",
    ghost_backups: "++id, timestamp",
    sales_archive: "++id, date, billNo, itemId, itemName, batchId, bankFee, archiveYear, updatedAt",
    stock_in_archive: "++id, date, supplierId, itemId, itemName, batchId, archiveYear, updatedAt",
    purchases_archive: "++id, date, supplierName, invoiceNo, archiveYear, updatedAt",
    expenses_archive: "++id, date, category, description, amount, user, archiveYear, updatedAt",
    closing_balances: "++id, year, itemId, itemName, qty, costPrice, value, updatedAt",
    credit_settlements: "++id, dateSettled, supplierName, amount, note, updatedAt",
    credit_settlements_archive: "++id, dateSettled, supplierName, amount, note, archiveYear, updatedAt",
    reload_bills: "++id, date, type, amount, commission, total, updatedAt",
    reload_bills_archive: "++id, date, type, amount, commission, total, archiveYear, updatedAt"
});

// Helper to check DB connection
db.open().then(async () => {
    console.log("Database Opened Successfully");

    // Migration to mark all old expenses and credit settlements as 'Cash'
    try {
        const expenses = await db.expenses.toArray();
        const expensesToUpdate = expenses.filter(e => !e.paymentType).map(e => {
            e.paymentType = 'Cash';
            return e;
        });
        if (expensesToUpdate.length > 0) {
            await db.expenses.bulkPut(expensesToUpdate);
            console.log(`Updated ${expensesToUpdate.length} old expenses to Cash.`);
        }

        const settlements = await db.credit_settlements.toArray();
        const settlementsToUpdate = settlements.filter(s => !s.paymentMethod).map(s => {
            s.paymentMethod = 'Cash';
            return s;
        });
        if (settlementsToUpdate.length > 0) {
            await db.credit_settlements.bulkPut(settlementsToUpdate);
            console.log(`Updated ${settlementsToUpdate.length} old credit settlements to Cash.`);
        }
    } catch (e) {
        console.error("Migration error:", e);
    }
}).catch(err => {
    console.error("Failed to open db: " + (err.stack || err));
});

// --- CLOUD SYNC TRACKING HOOKS ---
const syncTables = [
    'item_master', 'inventory', 'stock_in', 'sales', 'quotations', 'expenses', 
    'purchases', 'settings', 'item_batches', 'users', 'held_bills', 'credit_pending_bills',
    'sales_archive', 'stock_in_archive', 'purchases_archive', 'expenses_archive', 'closing_balances', 'audit_logs',
    'credit_settlements', 'credit_settlements_archive', 'reload_bills', 'reload_bills_archive'
];


syncTables.forEach(tableName => {
    if (db[tableName]) {
        // Auto-add updatedAt on creation
        db[tableName].hook('creating', (primKey, obj) => {
            obj.updatedAt = new Date().toISOString();
        });
        // Auto-update updatedAt on modification
        db[tableName].hook('updating', (modifications) => {
            return { ...modifications, updatedAt: new Date().toISOString() };
        });
    }
});

