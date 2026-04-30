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

db.version(25).stores({
    item_master: "itemId, itemName, category, supplierId, unit, costPrice, listPrice, reorderLevel, remarks, useBatch, batchId",
    inventory: "itemId, itemName, stockIn, sold, currentStock, reorderLevel, stockValue, supplierId, batchId, avgCost",
    stock_in: "++id, date, supplierId, itemId, itemName, batchId, qty, costPrice, total, remarks, mrp",
    sales: "++id, date, billNo, itemId, itemName, batchId, supplierId, customer, qty, costPrice, mrp, discount, sellingPrice, total, profit, method, paymentStatus, settledDate, paidAmount, billDiscount, cashAmount, cardAmount, bankAmount, qrAmount",
    item_batches: "++id, itemId, batchId, [itemId+batchId], isDiscontinued, costPrice, listPrice, initialStock, currentStock",
    held_bills: "++id, timestamp, customerName, itemCount, total, cartData",
    expenses: "++id, date, category, description, amount, user",
    purchases: "++id, date, supplierName, invoiceNo, totalBill, paidAmount, balance, method, chequeDate, chequeNo, settleDate",
    settings: "key, value",
    audit_logs: "++id, timestamp, user, action, details",
    users: "++id, &username, role, passwordHash, createdAt",
    ghost_backups: "++id, timestamp",
    sales_archive: "++id, date, billNo, itemId, itemName, batchId, archiveYear",
    stock_in_archive: "++id, date, supplierId, itemId, itemName, batchId, archiveYear",
    closing_balances: "++id, year, itemId, itemName, qty, costPrice, value"
});

// Helper to check DB connection
db.open().then(() => {
    console.log("Database Opened Successfully");
}).catch(err => {
    console.error("Failed to open db: " + (err.stack || err));
});
