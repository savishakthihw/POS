
async function diag() {
    const itemId = "WIN001";
    const item = await db.item_master.get(itemId);
    console.log("ITEM MASTER:", item);

    const batches = await db.item_batches.where('itemId').equals(itemId).toArray();
    console.log("BATCHES:", batches);

    const stockln = await db.stock_in.where('itemId').equals(itemId).toArray();
    console.log("STOCK IN:", stockln);

    const inventory = await db.inventory.get(itemId);
    console.log("INVENTORY:", inventory);
}
diag().catch(console.error);
