
async function checkData() {
    const items = await db.item_master.toArray();
    console.log("Total Items:", items.length);
    const suppliers = {};
    items.forEach(i => {
        const sid = i.supplierId || 'EMPTY';
        suppliers[sid] = (suppliers[sid] || 0) + 1;
    });
    console.log("Suppliers and counts:", suppliers);

    const inventory = await db.inventory.toArray();
    console.log("Total Inventory Records:", inventory.length);

    const missingInInventory = items.filter(i => !inventory.find(iv => String(iv.itemId) === String(i.itemId)));
    console.log("Items in Master but missing in Inventory:", missingInInventory.length);
    if (missingInInventory.length > 0) {
        console.log("Samples missing:", missingInInventory.slice(0, 5).map(i => i.itemId));
    }
}
checkData().catch(console.error);
