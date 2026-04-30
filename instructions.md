# Savi Shakthi Hardware - Full POS System Development Instructions

Meya Savi Shakthi Hardware ayathanaye Excel inventory eka modern web-based POS system ekakata pariwaarthanaya kireema sandahaa hadapu sampurna upades maalaawa we.

---

## 1. Project Scope & Business Requirements (ව්‍යාපාරික අවශ්‍යතා)

### A. Item Master Management (අයිතම පාලනය)
* **Central Database:** Hamama badu wala details athulath karana pradhana section eka.
* **CRUD Operations:** Aluth badu athulath kireema (Create), thiyena ewa wenas kireema (Edit), saha iwath kireema (Delete) facility eka thibiya yuthuya.
* **Cascading Updates:** Item Master eke `Item ID` ho `Item Name` wenas kala wita `Inventory` table eketh ewa auto-update wiya yuthuya. Item ekak master eken delete kala wita inventory ekenuth iwath wiya yuthuya.
* **Fields:** Item ID, Item Name, Category, Supplier ID, Unit (Pcs, Mtr, Kg, etc.), Cost Price, List Price (MRP), Reorder Level.

### B. Inventory Management (තොග පාලනය)
* **Auto-Update Logic:** Stock-In saha Sales records anuwa meya pamanak auto-calculate wiya yuthuya.
* **Fields:** Item ID, Item Name, Stock In (Total), Sold (Total), Current Stock, Reorder Level, Stock Value (Current Stock * Cost Price).
* **Alerts:** Current Stock eka Reorder Level ekata wada adu nam highlight wiya yuthuya.

### C. Stock-In Section (ගබඩාවට බඩු එකතු කිරීම)
* **Function:** Lori walin ena badu athulath kireema. Meka edit/delete kireeme hakiyaawa thibiya yuthuya.
* **Fields:** Date, Supplier ID, Item ID, Item Name, Qty, Cost Price, Total, Remarks.

### D. Sales & Billing - POS (අලෙවි අංශය)
* **Search & Auto-fill:** Item ID ho Name gahaddi baduwa select wiya yuthuya. Item master eke thiyena **Unit (Pcs/Mtr/Kg)** eka bill line ekata auto-fill wiya yuthuya.
* **Fields:** Date, Bill No, Item ID, Qty, Unit (Auto-filled), Cost Price (Hidden), MRP, Discount, Selling Price, Total, Profit.
* **Printing (Invoice):** Thermal ho normal printer ekakata galapena receipt eka. 
    * **Rule:** Invoice eke කිසිම විටක **Cost Price** ho **Profit** penwiya yuthu natha.

---

## 2. Technical Requirements (තාක්ෂණික අවශ්‍යතා)

* **Frontend:** HTML5, Tailwind CSS (Visuals).
* **Database:** **Dexie.js** (Browser-based IndexedDB wrapper).
* **CSV Parsing:** **PapaParse** (Initial Excel data migration sandaha).
* **Logic:** Vanilla JavaScript (ES6+).

---

## 3. Database Schema (Dexie.js Tables)

```javascript
const db = new Dexie("SaviShakthiDB");

db.version(1).stores({
    // Pradhana badu liyapadinchiya
    item_master: "itemId, itemName, category, supplierId, unit, costPrice, listPrice, reorderLevel",
    
    // Thoga wisthara (Calculated table)
    inventory: "itemId, itemName, stockIn, sold, currentStock, reorderLevel, stockValue",
    
    // Badu athulath kireeme ithihasaya (Editable)
    stock_in: "++id, date, supplierId, itemId, itemName, qty, costPrice, total, remarks",
    
    // Wikunuma ithihasaya (Editable)
    sales: "++id, date, billNo, itemId, qty, costPrice, mrp, discount, sellingPrice, total, profit"
});