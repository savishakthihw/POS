
const db = new Dexie("SaviSakthiDB");
db.version(21).stores({
    item_master: "itemId, itemName, category, supplierId, unit, costPrice, listPrice, reorderLevel, remarks, useBatch, batchId",
    inventory: "itemId, itemName, stockIn, sold, currentStock, reorderLevel, stockValue, supplierId, batchId, avgCost",
});

async function checkData() {
    try {
        await db.open();
        const items = await db.item_master.toArray();
        console.log("Total items in master:", items.length);
        
        const suppliers = [...new Set(items.map(i => i.supplierId).filter(Boolean))];
        console.log("Unique suppliers:", suppliers);
        
        for (const s of suppliers) {
            const count = items.filter(i => i.supplierId === s).length;
            const startsWithCount = items.filter(i => String(i.itemId).startsWith(s)).length;
            console.log(`Supplier ${s}: ${count} items have supplierId set, ${startsWithCount} items have ID starting with it.`);
        }
    } catch (e) {
        console.error(e);
    }
}

checkData();
