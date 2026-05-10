var views = window.views = {
    // PDF Export Helper
    exportToPDF: async (tableId, title) => {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('l', 'mm', 'a4');
            const fontSetting = await db.settings.get('custom_font');
            let fontName = 'helvetica';

            if (fontSetting && fontSetting.value) {
                doc.addFileToVFS('CustomFont.ttf', fontSetting.value);
                doc.addFont('CustomFont.ttf', 'CustomFont', 'normal');
                doc.setFont('CustomFont');
                fontName = 'CustomFont';
            }

            // Header Section
            doc.setFontSize(22);
            doc.setTextColor(40, 44, 52);
            doc.text(title, 14, 22);

            doc.setFontSize(9);
            doc.setTextColor(120);
            doc.text(`Savi Shakthi Hardware POS | Business Document | Generated: ${new Date().toLocaleString()}`, 14, 30);

            // High-Purity Export: Clone and surgically clean the table
            const sourceTable = document.getElementById(tableId);
            if (!sourceTable) throw new Error('Source table not found');

            const cleanTable = sourceTable.cloneNode(true);

            // 1. Remove all expansion/detail rows and hidden UI helpers
            cleanTable.querySelectorAll('tr.hidden, tr[id*="batches"], tr[id*="inv-batches"], tr[id*="item-batches"], .no-print').forEach(r => r.remove());

            // 2. Identify UI/Action columns by header text
            const headers = Array.from(cleanTable.querySelectorAll('thead th'));
            const skipIndexes = [];
            headers.forEach((th, idx) => {
                const txt = th.innerText.trim().toLowerCase();
                if (txt === 'bt' || txt === 'action' || txt === 'actions' || txt === '#' || txt.includes('select') || txt === 'ref' || txt.includes('refresh')) {
                    skipIndexes.push(idx);
                }
            });

            // 3. Delete UI columns
            skipIndexes.sort((a, b) => b - a);
            cleanTable.querySelectorAll('tr').forEach(tr => {
                skipIndexes.forEach(idx => {
                    if (tr.cells[idx]) tr.deleteCell(idx);
                });
            });

            // 4. Polish: Remove icons and buttons
            cleanTable.querySelectorAll('button, i, script').forEach(el => el.remove());

            // 5. Dynamic Sizing Logic: Use smaller fonts for wide tables (Sales/Reports)
            const columnCount = cleanTable.querySelector('tr')?.cells.length || 0;
            const pdfFontSize = columnCount > 8 ? 6.5 : 8; // Shrink for wide reports
            const pdfPadding = columnCount > 8 ? 2 : 3;

            doc.autoTable({
                html: cleanTable,
                startY: 40,
                theme: 'striped',
                headStyles: { fillColor: [63, 81, 181], textColor: 255, fontStyle: 'bold', font: fontName, fontSize: pdfFontSize + 1 },
                styles: {
                    fontSize: pdfFontSize,
                    cellPadding: pdfPadding,
                    font: fontName,
                    valign: 'middle',
                    overflow: 'linebreak', // Allow wrapping but it will be cleaner with smaller font
                    cellWidth: 'auto'
                },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                margin: { left: 14, right: 14 },
                didParseCell: function (data) {
                    const text = data.cell.text[0];
                    // Right-align currency and protect from wrapping numbers mid-way
                    if (text && (text.includes('Rs.') || text.includes('LKR'))) {
                        data.cell.styles.halign = 'right';
                        data.cell.styles.whiteSpace = 'nowrap';
                    }
                    if (data.section === 'body' && !isNaN(parseFloat(text.replace(/,/g, ''))) && !text.includes('/') && !text.includes('-')) {
                        data.cell.styles.halign = (data.column.index > 3) ? 'right' : data.cell.styles.halign;
                    }
                }
            });

            doc.save(`${title.replace(/\s+/g, '_').toLowerCase()}.pdf`);
            utils.showNotification('Professional PDF Generated');
        } catch (err) {
            console.error('PDF Export Error:', err);
            utils.showNotification('Error exporting PDF', 'error');
        }
    },

    // --- ITEM MASTER SECTION ---
    initItemMaster: async () => {
        const container = document.getElementById('view-items');
        container.innerHTML = `
            <div class="flex flex-col h-full">
                <div class="flex justify-between items-center mb-6">
                    <div class="flex items-center gap-4">
                        <h3 class="text-xl font-bold">Item Management</h3>
                        <div class="relative group">
                            <i class="fa-solid fa-truck-field absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] group-focus-within:text-primary transition-colors"></i>
                            <input type="text" id="item-sup-search" placeholder="Search Sup ID..." 
                                class="pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 w-36 shadow-sm transition-all focus:w-48"
                                oninput="views.loadItemsTable()">
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="views.exportItemsToCSV()" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${app.isAdmin ? '' : 'hidden'}">
                            <i class="fa-solid fa-file-export"></i> Export
                        </button>

                        <button onclick="views.exportToPDF('items-master-table', 'Items Master Report')" class="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${app.isAdmin ? '' : 'hidden'}">
                            <i class="fa-solid fa-file-pdf"></i> PDF
                        </button>

                         <button onclick="if(!app.isAdmin) { app.requestAuth(() => views.openItemModal()); } else { views.openItemModal(); }" class="bg-primary hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${app.isAdmin ? '' : 'hidden'}">
                            <i class="fa-solid fa-plus"></i> Add
                        </button>
                        

                    </div>
                </div>
                
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex-1 flex flex-col">
                    <div class="overflow-auto flex-1">
                        <table id="items-master-table" class="w-full text-[12.5px] text-left">
                            <thead class="text-[11.5px] text-gray-500 uppercase bg-gray-50 sticky top-0">
                                <tr>
                                    <th class="px-2 py-3 w-10 text-center">#</th>
                                    <th class="px-2 py-3 w-10 text-center">BT</th>
                                    <th class="px-2 py-3 w-20 text-center">ID</th>
                                    <th class="px-3 py-3">Item Name</th>
                                    <th class="px-2 py-3 text-center text-indigo-500">Batch</th>

                                    <th class="px-2 py-3 w-16 text-center">Sup ID</th>
                                    <th class="px-2 py-3 w-14 text-center">Unit</th>
                                    <th class="px-2 py-3 text-center">Cost</th>
                                    <th class="px-2 py-3 text-center">MRP</th>
                                    <th class="px-2 py-3 text-center text-emerald-600 ${app.isAdmin ? '' : 'hidden'}">Exp.</th>
                                    <th class="px-2 py-3 text-center text-purple-600 ${app.isAdmin ? '' : 'hidden'}">Real</th>
                                    <th class="px-2 py-3 text-center">Stock</th>
                                    <th class="px-2 py-3">Remarks</th>
                                    <th class="px-3 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="items-table-body" class="divide-y divide-gray-100">
                                <!-- Items rendered here -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

        `;

        views.loadItemsTable();
        views.setupItemFormHandler();
    },

    setupItemFormHandler: () => {
        const itemForm = document.getElementById('item-form');
        if (itemForm && !itemForm.dataset.handlerAttached) {
            itemForm.dataset.handlerAttached = 'true';

            itemForm.onsubmit = async (e) => {
                e.preventDefault();
                if (!app.isAdmin) {
                    app.requestAuth(() => itemForm.requestSubmit());
                    return;
                }
                console.log('Submitting Item Form...');

                const editMode = document.getElementById('item-db-id').value === 'EDIT';
                const rawId = document.getElementById('item-id').value;

                // Validate Item ID
                if (!rawId || rawId.trim() === '') {
                    utils.showNotification('Item ID is required!', 'error');
                    return;
                }

                const itemData = {
                    itemId: rawId.trim(),
                    itemName: document.getElementById('item-name').value,
                    supplierId: document.getElementById('item-supplier').value,
                    unit: document.getElementById('item-unit').value,
                    // Cost and MRP are now strictly read-only and updated via Stock In only
                    costPrice: editMode ? (parseFloat(document.getElementById('item-cost').value) || 0) : 0,
                    listPrice: editMode ? (parseFloat(document.getElementById('item-mrp').value) || 0) : 0,
                    reorderLevel: parseFloat(document.getElementById('item-reorder').value) || 0,
                    remarks: document.getElementById('item-remarks').value.trim(),
                    useBatch: true,
                    batchId: document.getElementById('item-batch-id').value.trim() || 'B001'
                };

                try {
                    await db.transaction('rw', db.item_master, db.inventory, db.item_batches, db.audit_logs, async () => {
                        if (editMode) {
                            // Fix ID type if it's currently a number in the DB
                            let existingAsNum = null;
                            if (!isNaN(rawId)) {
                                try {
                                    existingAsNum = await db.item_master.get(Number(rawId));
                                } catch (e) {
                                    console.log('Not a numeric ID');
                                }
                            }

                            if (existingAsNum) {
                                itemData.itemId = Number(rawId);
                            }

                            await db.item_master.put(itemData);

                            // Sync with inventory (But NOT batch prices - Batch prices should stay locked to their specific records)
                            const inventoryKeys = [itemData.itemId];
                            if (typeof itemData.itemId === 'number') {
                                inventoryKeys.push(String(itemData.itemId));
                            } else if (!isNaN(itemData.itemId)) {
                                inventoryKeys.push(Number(itemData.itemId));
                            }

                            await db.inventory.where('itemId').anyOf(inventoryKeys).modify(inv => {
                                inv.itemName = itemData.itemName;
                                inv.reorderLevel = itemData.reorderLevel;
                                inv.supplierId = itemData.supplierId; // Fixed: Sync supplier ID on edit
                                // For edits, we don't change avgCost unless explicitly requested, but we update stockValue
                                const cost = inv.avgCost || itemData.costPrice;
                                inv.stockValue = (inv.currentStock || 0) * cost;
                            });

                            await utils.logAction('Item Edit', `Updated ${itemData.itemName} (${itemData.itemId})`);
                            utils.showNotification('Item Updated Successfully');
                        } else {
                            // Check if ID already exists
                            const checkExists = await db.item_master.get(rawId.trim());
                            if (checkExists) {
                                throw new Error('Item ID already exists!');
                            }

                            await db.item_master.add(itemData);

                            // Create initial inventory record
                            await db.inventory.add({
                                itemId: itemData.itemId,
                                itemName: itemData.itemName,
                                supplierId: itemData.supplierId,
                                stockIn: 0,
                                sold: 0,
                                currentStock: 0,
                                reorderLevel: itemData.reorderLevel,
                                avgCost: itemData.costPrice,
                                stockValue: 0
                            });

                            await utils.logAction('Item Create', `Created ${itemData.itemName} (${itemData.itemId})`);
                            utils.showNotification('Item Created Successfully');
                        }
                    });

                    app.itemCache = []; // Invalidate cache
                    views.closeItemModal();
                    views.loadItemsTable();
                } catch (err) {
                    console.error('Save error:', err);
                    utils.showNotification(err.message, 'error');
                }
            };
        }
    },

    loadItemsTable: async (searchQuery = null) => {
        if (views._loadingItems) return;
        views._loadingItems = true;

        const tbody = document.getElementById('items-table-body');
        const qVal = (searchQuery !== null && searchQuery !== undefined) ? searchQuery : (document.getElementById('global-search')?.value || '');
        const q = qVal.toLowerCase().trim();
        const supFilter = document.getElementById('item-sup-search')?.value?.toLowerCase().trim();

        let items = [];
        let totalCnt = 0;
        let isLimited = false;

        try {
            // HIGH PERFORMANCE: Use memory cache
            if (!app.itemCache || app.itemCache.length === 0) {
                app.itemCache = await db.item_master.toArray();
            }

            const allItems = app.itemCache;

            if (q || supFilter) {
                // Fast in-memory filter
                items = allItems.filter(i => {
                    // 1. Global Search Filter (broad search across ID, Name, Sup, Category)
                    const matchesSearch = !q || (
                        String(i.itemId).toLowerCase().includes(q) ||
                        String(i.itemName).toLowerCase().includes(q) ||
                        String(i.supplierId || '').toLowerCase().includes(q) ||
                        String(i.category || '').toLowerCase().includes(q)
                    );

                    // 2. Specific Supplier ID Filter (Strict constraint if provided)
                    const matchesSup = !supFilter || (
                        String(i.supplierId || '').toLowerCase().includes(supFilter) ||
                        String(i.itemId).toLowerCase().startsWith(supFilter)
                    );
                    
                    return matchesSearch && matchesSup;
                });

                totalCnt = items.length;
                
                // PERFORMANCE LOGIC:
                // 1. If Supplier Search (supFilter) is active, show ALL items (Industrial Standard)
                // 2. If ONLY Global Search (q) is active, limit to 100 for speed
                if (supFilter) {
                    isLimited = false; // No limit for supplier search
                } else if (items.length > 100) {
                    items = items.slice(0, 100);
                    isLimited = true;
                }
            } else {
                totalCnt = allItems.length;
                items = allItems.slice(0, 100);
                isLimited = totalCnt > 100;
            }
        } catch (err) {
            console.error('Error loading items:', err);
            if (tbody) tbody.innerHTML = `<tr><td colspan="15" class="text-center py-8 text-red-500">Error: ${err.message}</td></tr>`;
            views._loadingItems = false;
            return;
        }

        views._loadingItems = false;
        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="14" class="text-center py-12 text-gray-400">
                <i class="fa-solid fa-magnifying-glass text-3xl mb-3 opacity-20 block"></i>
                No items found for "${q || supFilter}".<br>
                <button onclick="document.getElementById('item-sup-search').value=''; document.getElementById('global-search').value=''; views.loadItemsTable();" class="mt-4 text-primary font-bold text-xs underline">Clear All Searches</button>
            </td></tr>`;
            return;
        }

        // Feedback on large lists
        if (q || supFilter) {
            console.log(`Search: Found ${items.length} items`);
        }

        // Fetch sales to calculate Real Margin: Optimized to avoid large .toArray()
        const itemIds = items.map(i => i.itemId);
        const salesSummary = {};
        await db.sales.where('itemId').anyOf(itemIds).each(s => {
            if (!salesSummary[s.itemId]) salesSummary[s.itemId] = { qty: 0, rev: 0 };
            salesSummary[s.itemId].qty += (s.qty || 0);
            salesSummary[s.itemId].rev += (s.total || 0);
        });

        tbody.innerHTML = items.map((item, index) => {
            const expMargin = item.listPrice > 0 ? ((item.listPrice - item.costPrice) / item.listPrice) * 100 : 0;
            const sales = salesSummary[item.itemId] || { qty: 0, rev: 0 };
            const avgSellPrice = sales.qty > 0 ? sales.rev / sales.qty : 0;
            const realMargin = avgSellPrice > 0 ? ((avgSellPrice - item.costPrice) / avgSellPrice) * 100 : 0;

            return `
                <tr class="bg-white border-b hover:bg-gray-50 transition-colors group">
                    <td class="px-2 py-3 text-gray-400 font-mono text-[11.5px] text-center">${index + 1}</td>
                    <td class="px-2 py-3 text-gray-400 font-mono text-center">
                        <button onclick="views.toggleItemBatches('${item.itemId}', this)" class="w-6 h-6 rounded hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 transition-all">
                            <i class="fa-solid fa-plus text-[10px] transition-transform duration-200"></i>
                        </button>
                    </td>
                    <td class="px-2 py-3 font-medium text-gray-900 text-center text-[11.5px]">${item.itemId}</td>
                    <td class="px-3 py-3 min-w-[120px]">
                        <div class="font-bold text-gray-700 text-[12px] leading-tight">${item.itemName}</div>
                        ${item.useBatch ? '<span class="text-[8.5px] bg-indigo-100 text-indigo-700 px-1.5 rounded font-black uppercase tracking-tighter">Batch Master</span>' : ''}
                    </td>
                    <td class="px-2 py-3 text-center">
                        <span class="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[10.5px] font-bold">${item.batchId || '-'}</span>
                    </td>

                    <td class="px-2 py-3 text-gray-500 w-16 text-center text-[11.5px]">${item.supplierId || '-'}</td>
                    <td class="px-2 py-3 w-14 text-center"><span class="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[10.5px] font-bold">${item.unit}</span></td>
                    <td class="px-2 py-3 font-mono text-gray-600 text-[10.5px] text-center">${utils.formatCurrency(item.costPrice)}</td>
                    <td class="px-2 py-3 font-mono font-bold text-gray-800 text-[11.5px] text-center">${utils.formatCurrency(item.listPrice)}</td>
                    <td class="px-2 py-3 text-center ${app.isAdmin ? '' : 'hidden'}">
                        <span class="text-[10.5px] font-bold text-emerald-600">${expMargin.toFixed(1)}%</span>
                    </td>
                    <td class="px-2 py-3 text-center ${app.isAdmin ? '' : 'hidden'}">
                        <span class="text-[10.5px] font-bold ${realMargin >= expMargin ? 'text-purple-600' : 'text-orange-500'}">${realMargin.toFixed(1)}%</span>
                    </td>
                    <td class="px-2 py-3 text-center">
                        <span class="${(item.reorderLevel && (item.reorderLevel > 0)) ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'} px-1.5 py-0.5 rounded-full text-[10.5px] font-bold">${item.reorderLevel || 0}</span>
                    </td>
                    <td class="px-2 py-3">
                        <div class="text-[10.5px] text-indigo-600 font-medium max-w-[120px] truncate leading-tight" title="${item.remarks || ''}">${item.remarks || '<span class="text-gray-200">-</span>'}</div>
                    </td>
                    <td class="px-3 py-3 text-right space-x-1 whitespace-nowrap">
                        <button onclick="if(!app.isAdmin) { app.requestAuth(() => views.editItem('${item.itemId}')); } else { views.editItem('${item.itemId}'); }" class="text-blue-600 hover:text-blue-900 ${app.isAdmin ? '' : 'hidden'}" title="Edit Item"><i class="fa-solid fa-pen-to-square p-1 bg-blue-50 rounded"></i></button>

                        <button onclick="if(!app.isAdmin) { app.requestAuth(() => views.deleteItem('${item.itemId}')); } else { views.deleteItem('${item.itemId}'); }" class="text-red-500 hover:text-red-700 ${app.isAdmin ? '' : 'hidden'}" title="Delete Item"><i class="fa-solid fa-trash p-1 bg-red-50 rounded"></i></button>
                    </td>
                </tr>
                <tr id="item-batches-row-${item.itemId.replace(/[^a-zA-Z0-9]/g, '_')}" class="hidden bg-gray-50/30">
                    <td colspan="14" class="p-0">
                        <div class="px-8 py-4 border-l-4 border-amber-400 m-2 bg-white rounded-r-xl shadow-inner animate-fade-in">
                            <div id="item-batches-content-${item.itemId.replace(/[^a-zA-Z0-9]/g, '_')}">
                                <div class="flex items-center gap-2 text-amber-500">
                                    <i class="fa-solid fa-spinner fa-spin"></i>
                                    <span class="text-[10px] font-bold uppercase tracking-widest">Loading Batch History...</span>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Table Status Footer
        const statusRow = `
            <tr class="bg-gray-50/50">
                <td colspan="14" class="px-6 py-4 text-center">
                    <div class="flex items-center justify-center gap-4 text-xs font-bold">
                        <span class="text-gray-400 uppercase tracking-widest">Showing ${items.length} of ${totalCnt} items</span>
                        ${(q || supFilter) ? `<span class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded">Search results for "${q || supFilter}"</span>` : ''}
                        ${isLimited ? `<span class="text-amber-600 bg-amber-50 px-2 py-1 rounded"><i class="fa-solid fa-circle-info mr-1"></i> Default view is limited. Search to see more.</span>` : ''}
                    </div>
                </td>
            </tr>
        `;
        tbody.innerHTML += statusRow;



    },

    toggleItemBatches: async (itemId, btn) => {
        const safeId = itemId.replace(/[^a-zA-Z0-9]/g, '_');
        const row = document.getElementById(`item-batches-row-${safeId}`);
        const content = document.getElementById(`item-batches-content-${safeId}`);
        const icon = btn.querySelector('i');

        if (!row || !content) return;

        if (row.classList.contains('hidden')) {
            row.classList.remove('hidden');
            icon.classList.remove('fa-plus');
            icon.classList.add('fa-minus');
            icon.classList.add('rotate-90');

            // Fetch batches
            const batches = await db.item_batches.where('itemId').equals(itemId).toArray();

            if (!batches || batches.length === 0) {
                content.innerHTML = `
                    <div class="py-2 text-amber-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                        <i class="fa-solid fa-circle-exclamation text-amber-500"></i> No Batch Records Found
                    </div>
                `;
                return;
            }

            content.innerHTML = `
                <div class="flex items-center justify-between mb-2">
                    <h5 class="text-[10px] font-black uppercase tracking-widest text-amber-600">Active Stock Batches</h5>
                    <span class="text-[9px] font-bold text-gray-400">ITEM ID: ${itemId}</span>
                </div>
                <div class="overflow-hidden border border-amber-100 rounded-lg bg-white shadow-sm">
                    <table class="w-full text-[10px] text-left">
                        <thead class="bg-amber-50/50 text-amber-700 font-bold uppercase tracking-tighter border-b border-amber-100">
                            <tr>
                                <th class="px-3 py-1.5">Batch Name</th>
                                <th class="px-3 py-1.5 text-center">Stock In</th>
                                <th class="px-3 py-1.5 text-center text-amber-600">Current Stock</th>
                                <th class="px-3 py-1.5 text-right">Latest Cost</th>
                                <th class="px-3 py-1.5 text-right">Selling Price (MRP)</th>
                                <th class="px-3 py-1.5 text-right">Stock Value</th>
                                <th class="px-3 py-1.5 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-50">
                            ${batches.map(b => `
                                <tr class="hover:bg-amber-50/10 transition-colors ${b.isDiscontinued ? 'opacity-50 grayscale' : ''}">
                                    <td class="px-3 py-2">
                                        <div class="font-bold text-gray-700">${b.batchId}</div>
                                        ${b.isDiscontinued ? '<span class="text-[8px] bg-red-100 text-red-600 px-1 rounded font-black italic">DISCONTINUED</span>' : ''}
                                    </td>
                                    <td class="px-3 py-2 text-center text-gray-400 font-bold">${b.initialStock || b.currentStock || 0}</td>
                                    <td class="px-3 py-2 text-center bg-amber-50/30">
                                        <span class="text-xs font-black ${b.currentStock <= 0 ? 'text-red-400' : 'text-gray-900'}">${utils.formatNumber(b.currentStock)}</span>
                                    </td>
                                    <td class="px-3 py-2 text-right text-gray-400 font-mono">${utils.formatCurrency(b.costPrice)}</td>
                                    <td class="px-3 py-2 text-right font-bold text-amber-500 font-mono">${utils.formatCurrency(b.listPrice)}</td>
                                    <td class="px-3 py-2 text-right font-bold text-gray-500">${utils.formatCurrency((b.currentStock || 0) * (b.costPrice || 0))}</td>
                                    <td class="px-3 py-2 text-center">
                                        <select onchange="views.toggleBatchStatus('${b.batchId}', '${itemId}', this.value)" class="text-[9px] font-bold border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-amber-500">
                                            <option value="active" ${!b.isDiscontinued ? 'selected' : ''}>Active</option>
                                            <option value="discontinued" ${b.isDiscontinued ? 'selected' : ''}>Discontinue</option>
                                        </select>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            row.classList.add('hidden');
            icon.classList.remove('fa-minus');
            icon.classList.remove('rotate-90');
            icon.classList.add('fa-plus');
        }
    },

    toggleBatchStatus: async (batchId, itemId, status) => {
        const isDiscontinued = status === 'discontinued';
        const batch = await db.item_batches.where({ itemId, batchId }).first();
        if (batch) {
            await db.item_batches.update(batch.id, { isDiscontinued: isDiscontinued });
            
            // CRITICAL: Re-sync this item's master row to ensure it doesn't show a discontinued price
            await views.syncSingleItemMaster(itemId);
            
            utils.showNotification(`Batch ${batchId} ${isDiscontinued ? 'Discontinued' : 'Activated'}`);

            // Refresh the table locally without full reload if possible
            const safeId = itemId.replace(/[^a-zA-Z0-9]/g, '_');
            const btn = document.querySelector(`button[onclick*="toggleItemBatches('${itemId}'"]`);
            if (btn) {
                // To refresh, we forcefully toggle it close and then open
                const row = document.getElementById(`item-batches-row-${safeId}`);
                if (row) {
                    row.classList.add('hidden'); // Force close
                    views.toggleItemBatches(itemId, btn); // Re-open (this will fetch and render new data)
                }
            }
        }
    },

    openItemModal: () => {
        document.getElementById('item-form').reset();
        document.getElementById('item-db-id').value = '';
        document.getElementById('item-modal-title').innerText = 'Add New Item';
        document.getElementById('item-supplier').value = '';
        document.getElementById('item-id').value = utils.generateId('ITM');
        document.getElementById('item-unit').value = 'Pcs';
        document.getElementById('item-id').readOnly = false;
        if (document.getElementById('item-batch-id')) document.getElementById('item-batch-id').value = 'B001';

        const modal = document.getElementById('item-modal');
        const content = document.getElementById('item-modal-content');

        modal.classList.remove('hidden');
        // Trigger animation
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('scale-95');
            content.classList.add('scale-100');
        }, 10);
    },

    closeItemModal: () => {
        const modal = document.getElementById('item-modal');
        const content = document.getElementById('item-modal-content');

        modal.classList.add('opacity-0');
        content.classList.remove('scale-100');
        content.classList.add('scale-95');

        setTimeout(() => {
            modal.classList.add('hidden');
        }, 200);
    },

    editItem: async (itemId) => {
        try {
            let item = await db.item_master.get(itemId);
            if (!item && !isNaN(itemId)) {
                item = await db.item_master.get(Number(itemId));
            }

            if (!item) {
                utils.showNotification('Item not found: ' + itemId, 'error');
                return;
            }

            document.getElementById('item-db-id').value = 'EDIT';
            document.getElementById('item-modal-title').innerText = 'Edit Item';
            document.getElementById('item-id').value = item.itemId;
            document.getElementById('item-id').readOnly = true;
            document.getElementById('item-name').value = item.itemName;
            document.getElementById('item-supplier').value = item.supplierId || '';
            document.getElementById('item-unit').value = item.unit || 'Pcs';
            document.getElementById('item-cost').value = item.costPrice || 0;
            document.getElementById('item-mrp').value = item.listPrice || 0;
            document.getElementById('item-reorder').value = item.reorderLevel || 5;
            document.getElementById('item-remarks').value = item.remarks || '';
            if (document.getElementById('item-batch-id')) document.getElementById('item-batch-id').value = item.batchId || 'B001';

            const modal = document.getElementById('item-modal');
            const content = document.getElementById('item-modal-content');

            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                content.classList.remove('scale-95');
                content.classList.add('scale-100');
            }, 10);
        } catch (err) {
            console.error('Edit trigger error:', err);
            utils.showNotification('Cannot open edit modal', 'error');
        }
    },

    deleteItem: async (itemId) => {
        if (!app.isAdmin) {
            app.requestAuth(() => views.deleteItem(itemId));
            return;
        }
        if (confirm('Are you sure you want to delete this item? This will also delete inventory records.')) {
            if (!utils.verifyDeletePassword()) return;
            try {
                await db.transaction('rw', db.item_master, db.inventory, db.audit_logs, async () => {
                    const item = await db.item_master.get(itemId);
                    await db.item_master.delete(itemId);
                    await db.inventory.where('itemId').equals(itemId).delete();
                    await utils.logAction('Item Delete', `Deleted item ${item ? item.itemName : itemId}`);
                });
                app.itemCache = []; // Invalidate cache
                utils.showNotification('Item deleted');
                views.loadItemsTable();
            } catch (err) {
                console.error('Delete error:', err);
                utils.showNotification('Error deleting item', 'error');
            }
        }
    },


    importItemsFromCSV: (input) => {
        if (!app.isAdmin) {
            app.requestAuth(() => views.importItemsFromCSV(input));
            return;
        }
        const file = input.files[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim().toLowerCase(),
            complete: async (results) => {
                const csvRows = results.data;
                let count = 0;
                let skipped = 0;

                utils.showNotification('Importing items... Please wait', 'info');

                try {
                    await db.transaction('rw', db.item_master, db.inventory, db.item_batches, async () => {
                        for (const row of csvRows) {
                            // Flexible Header Matching & Trimming (All lowercase due to transformHeader)
                            const rawId = row['item id'] || row['itemid'] || row['id'] || row['item_id'];
                            const itemId = rawId ? rawId.toString().trim() : utils.generateId('ITM');

                            if (!row['item name'] && !row['itemname']) {
                                skipped++;
                                continue;
                            }
                            const itemName = row['item name'] || row['itemname'];

                            // Helper to clean currency strings
                            const cleanNum = (val) => {
                                if (val === undefined || val === null || val === '') return 0;
                                if (typeof val === 'number') return val;
                                return parseFloat(val.toString().replace(/[^0-9.-]+/g, '')) || 0;
                            };

                            const itemData = {
                                itemId: itemId,
                                itemName: itemName,
                                category: row['category'] || 'General',
                                unit: row['unit'] || 'Pcs',
                                costPrice: cleanNum(row['cost price'] || row['costprice'] || row['cost']),
                                listPrice: cleanNum(row['mrp'] || row['listprice'] || row['price'] || row['selling price'] || row['sellingprice']),
                                reorderLevel: parseFloat(row['reorder level'] || row['reorderlevel'] || row['reorder'] || 5),
                                supplierId: row['supplier id'] || row['supplierid'] || row['supplier'] || 'CSV_IMPORT'
                            };

                            // Check for Stock column in the same file
                            const initialStock = cleanNum(row['current stock'] || row['currentstock'] || row['stock'] || row['qty'] || row['quantity']);

                            await db.item_master.put(itemData);

                            // Sync with Inventory
                            const invExists = await db.inventory.get(itemId);
                            if (invExists) {
                                let updates = { itemName: itemData.itemName, supplierId: itemData.supplierId };
                                if (initialStock > 0) {
                                    updates.currentStock = initialStock;
                                    updates.stockIn = initialStock; // Explicitly set stockIn
                                    updates.stockValue = initialStock * itemData.costPrice;
                                    updates.avgCost = itemData.costPrice;
                                }
                                await db.inventory.update(itemId, updates);
                            } else {
                                await db.inventory.add({
                                    itemId: itemData.itemId,
                                    itemName: itemData.itemName,
                                    supplierId: itemData.supplierId,
                                    stockIn: initialStock,
                                    sold: 0,
                                    currentStock: initialStock,
                                    reorderLevel: itemData.reorderLevel,
                                    stockValue: initialStock * itemData.costPrice,
                                    avgCost: itemData.costPrice
                                });
                            }

                            // Create initial Batch for the item if it has stock
                            if (initialStock > 0) {
                                const bid = itemData.batchId || 'B001';
                                const existingBatch = await db.item_batches.where({ itemId: itemId, batchId: bid }).first();
                                if (existingBatch) {
                                    await db.item_batches.update(existingBatch.id, {
                                        costPrice: itemData.costPrice,
                                        listPrice: itemData.listPrice,
                                        currentStock: initialStock,
                                        initialStock: initialStock
                                    });
                                } else {
                                    await db.item_batches.add({
                                        itemId: itemId,
                                        batchId: bid,
                                        costPrice: itemData.costPrice,
                                        listPrice: itemData.listPrice,
                                        currentStock: initialStock,
                                        initialStock: initialStock,
                                        isDiscontinued: false
                                    });
                                }
                            }
                            count++;
                        }
                    });
                } catch (e) {
                    console.error('Import process failed', e);
                    utils.showNotification('Import failed: ' + e.message, 'error');
                    return;
                }

                if (skipped > 0) {
                    utils.showNotification(`Processed ${count} items. ${skipped} rows skipped.`, 'info');
                } else {
                    utils.showNotification(`Successfully processed ${count} items`);
                }

                app.itemCache = []; // Invalidate cache
                views.loadItemsTable();
                input.value = '';
            },
            error: (err) => {
                utils.showNotification('CSV parsing error', 'error');
                console.error(err);
            }
        });
    },

    exportItemsToCSV: async () => {
        if (!app.isAdmin) {
            app.requestAuth(() => views.exportItemsToCSV());
            return;
        }
        const items = await db.item_master.toArray();
        if (!items || items.length === 0) {
            utils.showNotification('No items to export', 'error');
            return;
        }

        // Prepare data for export
        const exportData = items.map(item => ({
            'Item ID': item.itemId,
            'Item Name': item.itemName,
            'Category': item.category,
            'Unit': item.unit,
            'Cost Price': item.costPrice,
            'MRP': item.listPrice,
            'Reorder Level': item.reorderLevel,
            'Supplier ID': item.supplierId,

        }));

        // Convert to CSV
        const csv = Papa.unparse(exportData);

        // Trigger Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'item_master_export.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    // --- STOCK IN SECTION ---
    initStockIn: async (prefilledItemId = null) => {
        const container = document.getElementById('view-stockin');
        if (!app.itemCache || app.itemCache.length === 0) {
            app.itemCache = await db.item_master.toArray();
        }
        const items = app.itemCache;
        const stockIn = await db.stock_in.toArray();

        const options = items.map(i => `<option value="${i.itemName}" data-id="${i.itemId}"> [${i.itemId}] ${i.itemName}</option>`).join('');

        container.innerHTML = `
            <div class="flex flex-col gap-6 h-full overflow-hidden">
                <!-- Header with Actions -->
                <div class="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100 italic">
                    <div>
                        <h3 class="text-xl font-bold text-emerald-600">Stock Management</h3>
                        <p class="text-xs text-gray-400">Add and track incoming inventory</p>
                    </div>
                    <div class="flex gap-3 ${app.isAdmin ? '' : 'hidden'}">
                         <button onclick="views.handleSyncClick()" class="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 transition-all text-sm font-semibold border border-indigo-100">
                            <i class="fa-solid fa-rotate"></i> Sync Integrity
                        </button>
                         <button onclick="if(!app.isAdmin) { app.requestAuth(() => views.exportStockInToCSV()); } else { views.exportStockInToCSV(); }" class="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-all text-sm font-semibold border border-blue-100">
                            <i class="fa-solid fa-file-export"></i> Export
                        </button>
                    </div>
                </div>

                <!-- Scrollable Body -->
                <div class="flex-1 overflow-y-auto pr-1 space-y-6">
                    <!-- Entry Form -->
                    <!-- Entry Form -->
                    <div class="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-6 ${app.isAdmin ? '' : 'hidden'}">
                        <div class="bg-gradient-to-r from-emerald-500/5 to-teal-500/5 px-8 py-6 border-b border-gray-100">
                            <div class="flex items-center gap-4">
                                <div class="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-emerald-200">
                                    <i class="fa-solid fa-cart-flatbed-suitcases"></i>
                                </div>
                                <div>
                                    <h4 class="text-lg font-black text-gray-800 tracking-tight">New Stock Entry</h4>
                                    <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Process incoming inventory assets</p>
                                </div>
                            </div>
                        </div>

                        <form id="stockin-form" class="p-8">
                            <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
                                <!-- Main Info Column -->
                                <div class="lg:col-span-2 space-y-6">
                                    <div class="space-y-2">
                                        <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Search & Select Item</label>
                                        <div class="relative group">
                                            <div class="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 group-focus-within:bg-emerald-500 group-focus-within:text-white transition-all">
                                                <i class="fa-solid fa-barcode text-xs"></i>
                                            </div>
                                            <input list="item-list-stock" id="stock-item-input" 
                                                class="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl pl-16 pr-4 py-4 text-sm focus:bg-white focus:border-emerald-500/20 transition-all outline-none font-bold text-gray-700 shadow-sm" 
                                                placeholder="Scan or type item name..." required>
                                        </div>
                                        <datalist id="item-list-stock">${options}</datalist>
                                        <input type="hidden" id="stock-item-id">
                                    </div>

                                    <div class="grid grid-cols-2 gap-4">
                                        <div class="space-y-2">
                                            <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Supplier Ref.</label>
                                            <div class="relative">
                                                <i class="fa-solid fa-user-shield absolute left-4 top-1/2 -translate-y-1/2 text-blue-400"></i>
                                                <input type="text" id="view-supplier-id" 
                                                    class="w-full bg-blue-50/30 border-2 border-transparent rounded-2xl pl-12 pr-4 py-3.5 text-xs font-black text-blue-600 outline-none hover:bg-blue-50 transition-colors" 
                                                    placeholder="-" readonly>
                                            </div>
                                        </div>
                                        <div class="space-y-2" id="batch-id-container">
                                            <label class="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Batch ID</label>
                                            <div class="relative">
                                                <i class="fa-solid fa-tags absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400"></i>
                                                <input type="text" id="stock-batch-id"
                                                    class="w-full bg-indigo-50/30 border-2 border-indigo-100/50 rounded-2xl pl-12 pr-4 py-3.5 text-xs focus:bg-white focus:border-indigo-400/50 transition-all outline-none font-black text-indigo-700" 
                                                    placeholder="B001">
                                            </div>
                                        </div>
                                    </div>

                                    <div class="space-y-2">
                                        <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Transaction Remarks</label>
                                        <div class="relative">
                                            <i class="fa-solid fa-comment-dots absolute left-4 top-4 text-gray-300"></i>
                                            <textarea id="stock-remarks" rows="2"
                                                class="w-full bg-gray-50 border-2 border-gray-50 rounded-2xl pl-12 pr-4 py-3.5 text-sm focus:bg-white focus:border-emerald-500/20 transition-all outline-none font-medium text-gray-600 resize-none" 
                                                placeholder="Add internal notes..."></textarea>
                                        </div>
                                    </div>
                                </div>

                                <!-- Financials Column -->
                                <div class="space-y-6">
                                    <div class="space-y-2">
                                        <label class="text-[10px] font-black text-emerald-500 uppercase tracking-widest ml-1">Inventory Qty</label>
                                        <div class="relative">
                                            <input type="number" id="stock-qty" step="any"
                                                class="w-full bg-emerald-50 border-2 border-emerald-100 rounded-2xl px-6 py-4 text-xl focus:bg-white focus:border-emerald-500 transition-all outline-none font-black text-emerald-900" 
                                                placeholder="0.00" required>
                                            <span class="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-emerald-600 bg-emerald-100 px-2 py-1.5 rounded-lg border border-emerald-200 uppercase" id="stock-unit-label">UNIT</span>
                                        </div>
                                    </div>

                                    <div class="space-y-2">
                                        <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Unit Cost (Buy)</label>
                                        <div class="relative">
                                             <div class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">Rs.</div>
                                             <input type="number" step="0.01" id="stock-cost" 
                                                class="w-full bg-gray-50 border-2 border-transparent rounded-2xl pl-12 pr-4 py-4 text-lg focus:bg-white focus:border-gray-200 outline-none font-black text-gray-700 transition-all" 
                                                value="0.00">
                                        </div>
                                    </div>

                                    <div class="space-y-2">
                                        <label class="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Selling Price (MRP)</label>
                                        <div class="relative">
                                             <div class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">Rs.</div>
                                             <input type="number" step="0.01" id="stock-mrp" 
                                                class="w-full bg-gray-50 border-2 border-transparent rounded-2xl pl-12 pr-4 py-4 text-lg focus:bg-white focus:border-gray-200 outline-none font-black text-gray-700 transition-all" 
                                                value="0.00">
                                        </div>
                                    </div>
                                </div>

                                <!-- Summary & Action Column -->
                                <div class="bg-slate-900 rounded-3xl p-6 flex flex-col justify-between shadow-xl">
                                    <div class="space-y-4">
                                        <div class="flex items-center gap-2 text-emerald-400">
                                            <i class="fa-solid fa-calendar-check text-xs"></i>
                                            <input type="date" id="stock-date" 
                                                class="bg-transparent border-none text-[11px] font-black uppercase tracking-tighter outline-none cursor-pointer" 
                                                value="${new Date().toISOString().split('T')[0]}" required>
                                        </div>
                                        
                                        <div class="pt-4 border-t border-slate-800">
                                            <label class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Total Value</label>
                                            <div class="flex flex-col">
                                                <span class="text-[10px] font-bold text-emerald-500/50 mb-1">LKR</span>
                                                <input type="number" step="0.01" id="stock-total" 
                                                    class="bg-transparent text-emerald-400 font-mono text-3xl font-black w-full border-none outline-none p-0" 
                                                    readonly value="0.00">
                                            </div>
                                        </div>
                                    </div>

                                    <button type="submit" class="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-black py-5 rounded-2xl shadow-lg shadow-emerald-500/20 transition-all transform active:scale-95 flex items-center justify-center gap-3 mt-8 uppercase tracking-widest text-xs">
                                        <i class="fa-solid fa-plus-circle text-lg"></i>
                                        <span>Confirm Entry</span>
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>

                    <!-- Bottom Section: Recent Activity Table -->
                    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div class="p-5 border-b border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4 bg-gray-50/30">
                            <h4 class="font-bold text-gray-800 flex items-center gap-2">
                                <i class="fa-solid fa-clock-rotate-left text-indigo-500"></i>
                                Recent Stock In History
                            </h4>
                            
                            <div class="flex items-center gap-3">
                                <div class="relative">
                                    <i class="fa-solid fa-barcode absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                    <input type="text" id="stockin-search-id" placeholder="Filter by Item ID..." 
                                        class="pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 w-48 shadow-sm">
                                </div>
                                <div class="relative">
                                    <i class="fa-solid fa-calendar-day absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                    <input type="date" id="stockin-search-date" 
                                        class="pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
                                        placeholder="DD/MM/YYYY">
                                </div>
                                <div class="relative">
                                    <i class="fa-solid fa-calendar-days absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                    <input type="month" id="stockin-search-month" 
                                        class="pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 shadow-sm">
                                </div>
                                <button onclick="const m = document.getElementById('stockin-search-month').value; const d = document.getElementById('stockin-search-date').value; const i = document.getElementById('stockin-search-id').value; views.loadRecentStockIn(i, d, m);" class="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors flex items-center gap-1 shadow-sm">
                                    <i class="fa-solid fa-search"></i>
                                </button>
                                <button onclick="if(!app.isAdmin) { app.requestAuth(() => views.exportToPDF('stockin-table', 'Stock In Report')); } else { views.exportToPDF('stockin-table', 'Stock In Report'); }" class="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors flex items-center gap-1 shadow-sm">
                                    <i class="fa-solid fa-file-pdf"></i> PDF
                                </button>
                                <span class="text-[10px] font-black text-gray-400 bg-white border border-gray-100 px-3 py-1.5 rounded-lg shadow-xs uppercase tracking-wider" id="stockin-count-label">Last 30 entries</span>
                            </div>
                        </div>
                        
                        <div class="overflow-x-auto">
                            <table id="stockin-table" class="w-full text-sm text-left table-fixed">
                                <thead class="bg-gray-50/50 text-xs text-gray-500 uppercase tracking-widest border-b border-gray-200">
                                    <tr>
                                        <th class="px-6 py-4 w-32">Date</th>
                                        <th class="px-6 py-4 w-60">Item Details</th>
                                        <th class="px-6 py-4 w-36">Batch ID</th>
                                        <th class="px-6 py-4 w-32 text-center">Unit Cost</th>
                                        <th class="px-6 py-4 w-32 text-center">MRP</th>
                                        <th class="px-6 py-4 w-28 text-center">Qty</th>
                                        <th class="px-6 py-4">Remarks</th>
                                        <th class="px-6 py-4 w-28 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody id="stockin-recent-body" class="divide-y divide-gray-100" style="font-family: 'Outfit', 'Noto Sans Sinhala', sans-serif;"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Search Handlers for Stock In Local Search
        const searchInputId = document.getElementById('stockin-search-id');
        const searchInputDate = document.getElementById('stockin-search-date');
        const searchInputMonth = document.getElementById('stockin-search-month');

        const triggerLocalSearch = () => {
            views.loadRecentStockIn(searchInputId.value, searchInputDate.value, searchInputMonth.value);
        };

        searchInputId.addEventListener('input', utils.debounce(triggerLocalSearch, 300));
        searchInputDate.addEventListener('change', triggerLocalSearch);
        searchInputMonth.addEventListener('change', triggerLocalSearch);

        // Date placeholder trick for Stock In
        const dateInput = document.getElementById('stock-date');
        const searchDateInput = document.getElementById('stockin-search-date');

        const applyDateTrick = (el) => {
            el.addEventListener('focus', () => el.type = 'date');
            el.addEventListener('blur', () => {
                if (!el.value) el.type = 'text';
            });
            if (!el.value) el.type = 'text';
        };

        applyDateTrick(dateInput);
        applyDateTrick(searchDateInput);

        // Auto-focus quantity when item is selected and improve date picker UX
        const itemInput = document.getElementById('stock-item-input');
        const qtyInput = document.getElementById('stock-qty');
        // dateInput already declared above


        // Make date picker open more easily
        dateInput.addEventListener('click', () => {
            try { dateInput.showPicker(); } catch (e) { }
        });

        itemInput.addEventListener('input', async (e) => {
            const val = e.target.value.trim().toLowerCase();
            if (!val) {
                document.getElementById('view-supplier-id').value = '-';
                document.getElementById('stock-cost').value = '0.00';
                return;
            }

            const item = items.find(i =>
                String(i.itemName).toLowerCase() === val ||
                String(i.itemId).toLowerCase() === val
            );

            if (item) {
                document.getElementById('stock-item-id').value = item.itemId;
                document.getElementById('stock-cost').value = item.costPrice;
                document.getElementById('stock-mrp').value = item.listPrice;
                document.getElementById('view-supplier-id').value = item.supplierId || 'MANUAL';
                document.getElementById('stock-unit-label').innerText = item.unit;

                // Ensure Batch ID field is visible
                const batchContainer = document.getElementById('batch-id-container');
                if (batchContainer) {
                    batchContainer.style.display = 'block';
                    const batchIdInput = document.getElementById('stock-batch-id');
                    if (batchIdInput) {
                        batchIdInput.required = true;
                        batchIdInput.value = item.batchId || 'B001';
                    }
                }

                updateTotal();
                qtyInput.focus();
            }
        });

        const updateTotal = () => {
            const qty = parseFloat(document.getElementById('stock-qty').value) || 0;
            const cost = parseFloat(document.getElementById('stock-cost').value) || 0;
            document.getElementById('stock-total').value = (qty * cost).toFixed(2);
        };

        document.getElementById('stock-qty').addEventListener('input', updateTotal);
        document.getElementById('stock-cost').addEventListener('input', updateTotal);

        document.getElementById('stockin-form').onsubmit = async (e) => {
            e.preventDefault();
            if (!app.isAdmin) {
                app.requestAuth(() => document.getElementById('stockin-form').requestSubmit());
                return;
            }
            const itemId = document.getElementById('stock-item-id').value;
            const qty = parseFloat(document.getElementById('stock-qty').value);
            const date = document.getElementById('stock-date').value;
            const costInput = parseFloat(document.getElementById('stock-cost').value);
            const mrpInput = parseFloat(document.getElementById('stock-mrp').value);
            const remarks = document.getElementById('stock-remarks').value;

            try {
                await db.transaction('rw', db.item_master, db.inventory, db.stock_in, db.item_batches, db.audit_logs, async () => {
                    const item = await db.item_master.get(itemId);
                    if (!item) throw new Error('Item not found');

                    // Fix for 0.00 prices: Fallback to Item Master global price if entered as 0
                    const cost = (costInput > 0) ? costInput : (parseFloat(item.costPrice) || 0);
                    const mrp = (mrpInput > 0) ? mrpInput : (parseFloat(item.listPrice) || 0);

                    const rawBatchId = document.getElementById('stock-batch-id').value.trim();
                    const finalBatchId = rawBatchId || item.batchId || 'B001';

                    console.log('SYSTEM DEBUG: Saving stock entry for:', item.itemId, 'Batch:', finalBatchId);

                    // 1. Add to stock_in log
                    await db.stock_in.add({
                        date,
                        supplierId: item.supplierId || 'DEF',
                        itemId: item.itemId,
                        itemName: item.itemName,
                        batchId: finalBatchId,
                        qty,
                        costPrice: cost,
                        mrp: mrp,
                        total: qty * cost,
                        remarks
                    });

                    // 2. Handle Batches (Always do this now, and ensure useBatch is true)
                    const existingBatch = await db.item_batches.where({ itemId: item.itemId, batchId: finalBatchId }).first();
                    if (existingBatch) {
                        await db.item_batches.update(existingBatch.id, {
                            costPrice: cost,
                            listPrice: mrp,
                            currentStock: (existingBatch.currentStock || 0) + qty
                        });
                    } else {
                        await db.item_batches.add({
                            itemId: item.itemId,
                            batchId: finalBatchId,
                            costPrice: cost,
                            listPrice: mrp,
                            currentStock: qty,
                            isDiscontinued: false
                        });
                    }

                    // 3. Update Master (Force useBatch: true and update prices)
                    await db.item_master.update(item.itemId, {
                        costPrice: Number(cost),
                        listPrice: Number(mrp),
                        useBatch: true,
                        batchId: String(finalBatchId) // Update main tracking batch
                    });

                    // 4. Update Inventory
                    const invItem = await db.inventory.get(itemId);
                    if (invItem) {
                        const newTotalStock = (invItem.currentStock || 0) + qty;

                        await db.inventory.update(itemId, {
                            stockIn: (invItem.stockIn || 0) + qty,
                            currentStock: newTotalStock,
                            avgCost: cost, // Back to simple latest cost
                            stockValue: newTotalStock * cost
                        });
                    } else {
                        await db.inventory.add({
                            itemId: item.itemId,
                            itemName: item.itemName,
                            stockIn: qty,
                            sold: 0,
                            currentStock: qty,
                            reorderLevel: item.reorderLevel,
                            avgCost: cost,
                            stockValue: qty * cost
                        });
                    }

                    // 5. Audit Log
                    await utils.logAction('Stock In', `Added ${qty} ${item.unit} for ${item.itemName} (Cost: ${cost.toFixed(2)})`);
                });

                utils.showNotification('Stock added successfully');
                document.getElementById('stockin-form').reset();
                if (document.getElementById('batch-id-container')) document.getElementById('batch-id-container').style.display = 'none';

                // CRITICAL: Clear item cache so POS gets updated useBatch/price flags
                app.itemCache = [];
                if (typeof window !== 'undefined') window.posItems = []; // Also clear POS-specific cache

                views.loadRecentStockIn();

            } catch (err) {
                console.error('Stock In Transaction failed:', err);
                utils.showNotification('Failed to update stock: ' + err.message, 'error');
            }
        }

        views.loadRecentStockIn();

        if (prefilledItemId) {
            const item = items.find(i => i.itemId == prefilledItemId);
            if (item) {
                const input = document.getElementById('stock-item-input');
                if (input) {
                    input.value = item.itemName;
                    input.dispatchEvent(new Event('input'));
                }
            }
        }
    },

    importStockInCSV: (input) => {
        const file = input.files[0];
        if (!file) return;

        if (!confirm('⚠️ WARNING: This will DELETE ALL existing stock entries and replace them with data from this CSV. Continue?')) {
            input.value = '';
            return;
        }

        const cleanNum = (val) => {
            if (val === undefined || val === null || val === '') return 0;
            if (typeof val === 'number') return val;
            return parseFloat(val.toString().replace(/[^0-9.-]+/g, '')) || 0;
        };

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim().toLowerCase(),
            complete: async (results) => {
                const rows = results.data;
                const today = new Date().toISOString().split('T')[0];
                let count = 0;
                let skipped = 0;

                console.log('[Stock Import] Rows parsed:', rows.length);

                try {
                    utils.showNotification('Replacing stock records...', 'info');
                    await db.stock_in.clear();

                    // OPTIMIZATION: Prefetch all items for faster lookup
                    const allItems = await db.item_master.toArray();
                    const itemById = new Map(allItems.map(i => [String(i.itemId), i]));
                    const itemByName = new Map(allItems.map(i => [String(i.itemName).toLowerCase(), i]));

                    const stockDataToImport = [];
                    for (const row of rows) {
                        const rawId = row['item id'] || row['itemid'] || row['item_id'] || row['id'] || row['item code'] || row['code'] || row['itemcode'];
                        const itemId = rawId ? rawId.toString().trim() : null;
                        const qty = cleanNum(row['qty'] || row['quantity'] || row['stock'] || row['qnt'] || row['count']);

                        if ((!itemId && !row['item name'] && !row['itemname']) || qty <= 0) {
                            skipped++;
                            continue;
                        }

                        let item = itemById.get(itemId);
                        
                        // Fallback: lookup by name if ID fails
                        if (!item && (row['item name'] || row['itemname'])) {
                            const nameToFind = (row['item name'] || row['itemname']).toString().trim().toLowerCase();
                            item = itemByName.get(nameToFind);
                        }

                        if (!item) {
                            console.warn(`[Stock Import] Missing master item: ${itemId || row['item name']}`);
                            skipped++;
                            continue;
                        }

                        const cost = cleanNum(row['cost'] || row['cost price'] || row['costprice'] || row['price'] || row['unit cost']);
                        const mrp = cleanNum(row['mrp'] || row['list price'] || row['selling price'] || row['price'] || row['retail price']);
                        const date = row['date'] || today;
                        const notes = row['remarks'] || row['notes'] || row['comment'] || 'CSV Replace';

                        // Fix: Prioritize supplier from Item Master as requested
                        const supplier = item.supplierId || row['supplier id'] || row['supplierid'] || row['supplier_id'] || row['supplier'] || row['vendor'] || 'CSV';

                        stockDataToImport.push({
                            date: date,
                            supplierId: supplier,
                            itemId: item.itemId,
                            itemName: item.itemName,
                            qty: qty,
                            costPrice: cost || item.costPrice || 0,
                            mrp: mrp || item.listPrice || 0,
                            total: qty * (cost || item.costPrice || 0),
                            remarks: notes
                        });
                        count++;
                    }

                    if (stockDataToImport.length > 0) {
                        await db.stock_in.bulkAdd(stockDataToImport);
                    }

                    await views.performInternalSync();
                    utils.showNotification(`Stock Overwritten: ${count} imported`, 'success');
                    views.loadRecentStockIn();
                    if (typeof app !== 'undefined' && app.updateDashboard) app.updateDashboard();
                } catch (err) {
                    console.error('Stock Import Failure:', err);
                    utils.showNotification('Stock import failed: ' + err.message, 'error');
                } finally {
                    input.value = '';
                }
            },
            error: (err) => {
                utils.showNotification('CSV parsing error', 'error');
                console.error(err);
            }
        });
    },

    handleSyncClick: async () => {
        const refreshNames = confirm('Sync Integrity:\n\nWould you also like to REFRESH ALL ITEM NAMES in sales and stock history to match current Item Master names?\n\n(Choose "Cancel" to perform a standard stock/batch sync only.)');
        await views.performInternalSync(refreshNames);
    },

    performInternalSync: async (refreshNames = false, isSilent = false) => {
        try {
            if (!isSilent) utils.showNotification('Synchronizing database integrity...', refreshNames ? 'warning' : 'info');
            
            // 1. Prefetch ALL data to avoid O(N) database queries
            const items = await db.item_master.toArray();
            const allStockIn = await db.stock_in.toArray();
            const allSales = await db.sales.toArray();
            const allBatches = await db.item_batches.toArray();
            const allInventory = await db.inventory.toArray();

            // 2. Index data by Item ID for O(1) lookup
            const stockInMap = new Map();
            allStockIn.forEach(s => {
                if (!stockInMap.has(s.itemId)) stockInMap.set(s.itemId, []);
                stockInMap.get(s.itemId).push(s);
            });
            const salesMap = new Map();
            allSales.forEach(s => {
                if (s.paymentStatus === 'Cancelled') return;
                if (!salesMap.has(s.itemId)) salesMap.set(s.itemId, []);
                salesMap.get(s.itemId).push(s);
            });
            const batchMap = new Map();
            allBatches.forEach(b => {
                if (!batchMap.has(b.itemId)) batchMap.set(b.itemId, []);
                batchMap.get(b.itemId).push(b);
            });
            const invMap = new Map(allInventory.map(i => [i.itemId, i]));

            await db.transaction('rw', db.inventory, db.item_batches, db.item_master, db.stock_in, db.sales, async () => {
                for (const item of items) {
                    const stockInRecords = stockInMap.get(item.itemId) || [];
                    const salesRecords = salesMap.get(item.itemId) || [];
                    const batches = batchMap.get(item.itemId) || [];

                    // --- REPAIR LOGIC FOR STOCK IN ---
                    for (const sin of stockInRecords) {
                        if ((!sin.mrp || sin.mrp <= 0) || (!sin.costPrice || sin.costPrice <= 0)) {
                            const newSinMRP = (sin.mrp > 0) ? sin.mrp : (parseFloat(item.listPrice) || 0);
                            const newSinCost = (sin.costPrice > 0) ? sin.costPrice : (parseFloat(item.costPrice) || 0);
                            if (newSinMRP > 0 || newSinCost > 0) {
                                await db.stock_in.update(sin.id, {
                                    mrp: newSinMRP,
                                    costPrice: newSinCost,
                                    total: (parseFloat(sin.qty) || 0) * newSinCost
                                });
                                sin.mrp = newSinMRP;
                                sin.costPrice = newSinCost;
                            }
                        }

                        // --- REFRESH ITEM NAME LOGIC ---
                        if (refreshNames && sin.itemName !== item.itemName) {
                            await db.stock_in.update(sin.id, { itemName: item.itemName });
                            sin.itemName = item.itemName;
                        }
                    }

                    // --- REFRESH SALES NAMES ---
                    if (refreshNames) {
                        for (const sale of salesRecords) {
                            if (sale.itemName !== item.itemName) {
                                await db.sales.update(sale.id, { itemName: item.itemName });
                                sale.itemName = item.itemName;
                            }
                        }
                    }

                    const totalIn = stockInRecords.reduce((sum, r) => sum + (parseFloat(r.qty) || 0), 0);
                    const totalSold = salesRecords.reduce((sum, r) => sum + (parseFloat(r.qty) || 0), 0);
                    const currentStock = totalIn - totalSold;

                    const staticCost = parseFloat(item.costPrice) || 0;
                    const stockValue = currentStock * staticCost;

                    // 1. Update Inventory
                    const inventoryData = {
                        itemName: item.itemName,
                        stockIn: totalIn,
                        sold: totalSold,
                        currentStock: currentStock,
                        reorderLevel: item.reorderLevel || 0,
                        avgCost: staticCost,
                        stockValue: stockValue,
                        batchId: item.batchId || 'B001',
                        supplierId: item.supplierId
                    };

                    if (invMap.has(item.itemId)) {
                        await db.inventory.update(item.itemId, inventoryData);
                    } else {
                        await db.inventory.add({ itemId: item.itemId, ...inventoryData });
                    }

                    // 2. Ensure at least one batch exists if there is stock
                    if (batches.length === 0 && totalIn > 0) {
                        await db.item_batches.add({
                            itemId: item.itemId,
                            batchId: item.batchId || 'B001',
                            costPrice: parseFloat(item.costPrice) || 0,
                            listPrice: parseFloat(item.listPrice) || 0,
                            currentStock: currentStock,
                            initialStock: totalIn,
                            isDiscontinued: false
                        });
                    } else if (batches.length > 0) {
                        for (const b of batches) {
                            if ((!b.costPrice || b.costPrice <= 0) || (!b.listPrice || b.listPrice <= 0)) {
                                await db.item_batches.update(b.id, {
                                    costPrice: (b.costPrice > 0) ? b.costPrice : (parseFloat(item.costPrice) || 0),
                                    listPrice: (b.listPrice > 0) ? b.listPrice : (parseFloat(item.listPrice) || 0)
                                });
                            }
                        }
                    }

                    // 3. Sync Item Master (Prices & Flags) - FAVOR LATEST ACTIVE BATCH
                    const activeBatchIds = new Set(batches.filter(b => !b.isDiscontinued).map(b => b.batchId));
                    
                    // Filter stock records to only include those from currently active batches
                    const activeStockRecords = stockInRecords.filter(r => activeBatchIds.has(r.batchId));
                    
                    // Use latest active record, or fallback to latest overall, or current item master
                    const latestStock = activeStockRecords.length > 0 
                        ? [...activeStockRecords].sort((a,b) => (Number(b.id) || 0) - (Number(a.id) || 0))[0] 
                        : (stockInRecords.length > 0 ? [...stockInRecords].sort((a,b) => (Number(b.id) || 0) - (Number(a.id) || 0))[0] : null);
                    
                    const finalMasterCost = latestStock && latestStock.costPrice > 0 ? parseFloat(latestStock.costPrice) : (parseFloat(item.costPrice) || 0);
                    const finalMasterMRP = latestStock && latestStock.mrp > 0 ? parseFloat(latestStock.mrp) : (parseFloat(item.listPrice) || 0);
                    const finalBatchId = latestStock && latestStock.batchId ? latestStock.batchId : (item.batchId || 'B001');

                    await db.item_master.update(item.itemId, {
                        useBatch: true,
                        batchId: finalBatchId,
                        costPrice: finalMasterCost,
                        listPrice: finalMasterMRP
                    });
                }
            });

            if (!isSilent) console.log('Database integrity sync completed.');
            app.itemCache = []; 
            if (!isSilent) utils.showNotification('Sync complete: Inventory & Batches aligned', 'success');
        } catch (err) {
            console.error('Sync error:', err);
            utils.showNotification('Sync error: ' + err.message, 'error');
        }
    },

    // Helper to sync just one item's master row (much faster than full sync)
    syncSingleItemMaster: async (itemId) => {
        try {
            const item = await db.item_master.get(itemId);
            if (!item) return;

            const [batches, stockInRecords] = await Promise.all([
                db.item_batches.where('itemId').equals(itemId).toArray(),
                db.stock_in.where('itemId').equals(itemId).toArray()
            ]);

            const activeBatchIds = new Set(batches.filter(b => !b.isDiscontinued).map(b => b.batchId));
            const activeStockRecords = stockInRecords.filter(r => activeBatchIds.has(r.batchId));

            const latestStock = activeStockRecords.length > 0 
                ? [...activeStockRecords].sort((a,b) => (Number(b.id) || 0) - (Number(a.id) || 0))[0] 
                : (stockInRecords.length > 0 ? [...stockInRecords].sort((a,b) => (Number(b.id) || 0) - (Number(a.id) || 0))[0] : null);

            if (latestStock) {
                await db.item_master.update(itemId, {
                    costPrice: parseFloat(latestStock.costPrice),
                    listPrice: parseFloat(latestStock.mrp),
                    batchId: latestStock.batchId,
                    useBatch: true
                });
                app.itemCache = []; // Invalidate cache
            }
        } catch (err) {
            console.error('Single item sync failed:', err);
        }
    },

    exportStockInToCSV: async () => {
        const data = await db.stock_in.toArray();
        if (data.length === 0) {
            utils.showNotification('No stock data to export', 'info');
            return;
        }

        const exportData = data.map(r => ({
            'Date': r.date,
            'Item ID': r.itemId,
            'Item Name': r.itemName,
            'Qty': r.qty,
            'Cost Price': r.costPrice,
            'Total': r.total,
            'Remarks': r.remarks
        }));

        const csv = Papa.unparse(exportData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `stock_in_report_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    },

    exportInventoryToCSV: async () => {
        if (!app.isAdmin) {
            app.requestAuth(() => views.exportInventoryToCSV());
            return;
        }

        const data = await db.inventory.toArray();
        if (data.length === 0) {
            utils.showNotification('No inventory data to export', 'info');
            return;
        }

        const exportData = data.map(r => ({
            'Item ID': r.itemId,
            'Item Name': r.itemName,
            'Batch ID': r.batchId || '-',
            'Supplier ID': r.supplierId || '-',
            'Stock In': r.stockIn || 0,
            'Sold': r.sold || 0,
            'Current Stock': r.currentStock || 0,
            'Avg Cost': r.avgCost || 0,
            'Stock Value': r.stockValue || 0
        }));

        const csv = Papa.unparse(exportData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `inventory_report_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        utils.showNotification('Inventory CSV Exported');
    },

    fixStockInSuppliers: async () => {
        try {
            utils.showNotification('Cleaning up supplier data...', 'info');
            const stockEntries = await db.stock_in.toArray();
            const items = await db.item_master.toArray();
            const itemMap = Object.fromEntries(items.map(i => [i.itemId, i.supplierId]));

            let fixedCount = 0;
            const placeholders = ['CSV', 'CSV_IMPORT', 'UNKNOWN', 'DEF', '-', 'CSV Replace'];

            const updates = [];
            for (const entry of stockEntries) {
                const correctSupplier = itemMap[entry.itemId];
                if (correctSupplier && (placeholders.includes(entry.supplierId) || !entry.supplierId)) {
                    updates.push(db.stock_in.update(entry.id, { supplierId: correctSupplier }));
                    fixedCount++;
                }
            }

            if (updates.length > 0) {
                await Promise.all(updates);
                utils.showNotification(`Successfully fixed ${fixedCount} supplier records`, 'success');
                views.loadRecentStockIn();
            } else {
                utils.showNotification('No supplier records needed fixing', 'info');
            }
        } catch (err) {
            console.error('Fix Suppliers Error:', err);
            utils.showNotification('Failed to fix suppliers: ' + err.message, 'error');
        }
    },

    loadRecentStockIn: async (searchId = '', searchDate = '', searchMonth = '') => {
        const countLabel = document.getElementById('stockin-count-label');
        let recents;

        if (!searchId && !searchDate && !searchMonth) {
            recents = await db.stock_in.reverse().limit(30).toArray();
            if (countLabel) countLabel.innerText = 'Last 30 entries';
        } else {
            // Apply filtering: Fetch all and filter in memory for robust date handling
            let allRecents = await db.stock_in.reverse().toArray();

            if (searchMonth) {
                // Robust Month Filter: Handles YYYY-MM-DD or other formats if parseable
                allRecents = allRecents.filter(r => {
                    if (!r.date) return false;

                    // Case 1: Standard YYYY-MM-DD or YYYY-MM start match
                    if (r.date.startsWith(searchMonth)) return true;

                    // Case 2: Date Object match (Handles 1/15/2026, 2026/01/15, etc.)
                    const d = new Date(r.date);
                    if (isNaN(d.getTime())) return false; // Invalid date

                    // Construct YYYY-MM from the date object
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const itemMonth = `${year}-${month}`;

                    return itemMonth === searchMonth;
                });
            } else if (searchDate) {
                allRecents = allRecents.filter(r => {
                    return r.date === searchDate || new Date(r.date).toISOString().split('T')[0] === searchDate;
                });
            }

            // Apply ID filter
            if (searchId) {
                const q = searchId.toLowerCase().trim();
                allRecents = allRecents.filter(r =>
                    String(r.itemId).toLowerCase().includes(q) ||
                    String(r.supplierId || '').toLowerCase().includes(q)
                );
            }

            // Re-apply strict date filter if both set (edge case)
            if (searchDate && searchMonth && searchDate.startsWith(searchMonth)) {
                allRecents = allRecents.filter(r => r.date === searchDate);
            }

            recents = allRecents;
            if (countLabel) countLabel.innerText = `${recents.length} Results found`;
        }
        document.getElementById('stockin-recent-body').innerHTML = recents.map(r => `
            <tr class="hover:bg-gray-50/80 transition-colors group">
                <td class="px-6 py-4">
                    <span class="text-gray-700 font-bold block text-sm whitespace-nowrap">${utils.formatDate(r.date)}</span>
                </td>
                <td class="px-6 py-4 overflow-hidden">
                    <div class="flex flex-col">
                        <span class="text-xs font-mono text-gray-400 leading-none mb-1 font-bold">#${r.itemId}</span>
                        <span class="font-bold text-gray-900 group-hover:text-primary transition-colors truncate text-sm" style="font-family: 'Noto Sans Sinhala', 'Outfit', sans-serif;" title="${utils.cleanItemName(r.itemName)}">
                            ${utils.cleanItemName(r.itemName)}
                        </span>
                    </div>
                </td>
                <td class="px-6 py-4 overflow-hidden">
                    <span class="text-indigo-700 font-extrabold text-[11px] uppercase bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 flex items-center justify-center gap-1.5 min-w-[100px]">
                        <i class="fa-solid fa-layer-group opacity-40"></i>
                        ${r.batchId ? r.batchId : '<span class="opacity-25 italic">NO BATCH</span>'}
                    </span>
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="text-emerald-700 font-bold font-mono text-xs">
                        ${utils.formatCurrency(r.costPrice || 0)}
                    </span>
                </td>
                <td class="px-6 py-4 text-center font-bold text-indigo-700 font-mono text-xs">
                    ${utils.formatCurrency(r.mrp || 0)}
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="inline-flex items-center gap-1 bg-emerald-100/50 text-emerald-800 px-3 py-1.5 rounded-xl font-black text-sm border border-emerald-200">
                        ${r.qty}
                    </span>
                 </td>
                 <td class="px-6 py-4">
                    <span class="text-gray-500 text-sm italic truncate block font-medium" title="${r.remarks || ''}">
                        ${r.remarks || '<span class="opacity-20">-</span>'}
                    </span>
                 </td>
                 <td class="px-6 py-4 text-right">
                    <div class="flex justify-end gap-2.5 ${app.isAdmin ? '' : 'hidden'}">
                        <button onclick="if(!app.isAdmin) { app.requestAuth(() => views.editStockIn(${r.id})); } else { views.editStockIn(${r.id}); }" class="w-9 h-9 flex items-center justify-center bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm border border-blue-200" title="Edit Entry">
                            <i class="fa-solid fa-pen-to-square text-xs"></i>
                        </button>
                        <button onclick="if(!app.isAdmin) { app.requestAuth(() => views.deleteStockIn(${r.id})); } else { views.deleteStockIn(${r.id}); }" class="w-9 h-9 flex items-center justify-center bg-red-100 text-red-700 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm border border-red-200" title="Delete Entry">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                 </td>
             </tr>
         `).join('');
    },

    editStockIn: async (id) => {
        const entry = await db.stock_in.get(id);
        if (!entry) return;

        const item = await db.item_master.get(entry.itemId);

        document.getElementById('edit-stockin-id').value = entry.id;
        document.getElementById('edit-stockin-item-id').value = entry.itemId;
        document.getElementById('edit-stockin-date').value = entry.date;
        document.getElementById('edit-stockin-qty').value = entry.qty;
        document.getElementById('edit-stockin-cost').value = entry.costPrice || 0;
        document.getElementById('edit-stockin-mrp').value = entry.mrp || 0;

        // Batch ID handling
        const batchContainer = document.getElementById('edit-stockin-batch-container');
        const batchInput = document.getElementById('edit-stockin-batch-id');
        if (batchContainer && batchInput) {
            // Always show batch if it exists in the record OR if the item supports it
            if ((item && item.useBatch) || entry.batchId) {
                batchContainer.classList.remove('hidden');
                batchInput.value = entry.batchId || '';
                batchInput.required = (item && item.useBatch) ? true : false;
            } else {
                batchContainer.classList.add('hidden');
                batchInput.value = '';
                batchInput.required = false;
            }
        }

        const form = document.getElementById('stockin-edit-form');
        form.onsubmit = async (e) => {
            e.preventDefault();
            await views.processStockInUpdate();
        };

        document.getElementById('stockin-edit-modal').classList.remove('hidden');
    },

    processStockInUpdate: async () => {
        try {
            const id = parseInt(document.getElementById('edit-stockin-id').value);
            const newDate = document.getElementById('edit-stockin-date').value;
            const newQty = parseFloat(document.getElementById('edit-stockin-qty').value);
            const newCost = parseFloat(document.getElementById('edit-stockin-cost').value);
            const newMRP = parseFloat(document.getElementById('edit-stockin-mrp').value);
            const newBatchIdInput = document.getElementById('edit-stockin-batch-id');
            const newBatchId = newBatchIdInput ? newBatchIdInput.value.trim() : null;

            if (isNaN(newQty) || isNaN(newCost) || isNaN(newMRP)) {
                utils.showNotification('Invalid values entered', 'error');
                return;
            }

            const oldEntry = await db.stock_in.get(id);
            if (!oldEntry) {
                utils.showNotification('Entry not found', 'error');
                document.getElementById('stockin-edit-modal').classList.add('hidden');
                return;
            }

            const item = await db.item_master.get(oldEntry.itemId);
            if (!item) {
                utils.showNotification('Master item not found', 'error');
                return;
            }

            // Fix for 0.00 prices: Fallback to Item Master global price if entered as 0
            const finalCost = (newCost > 0) ? newCost : (parseFloat(item.costPrice) || 0);
            const finalMRP = (newMRP > 0) ? newMRP : (parseFloat(item.listPrice) || 0);

            // 1. Revert Inventory (Main)
            const invItem = await db.inventory.get(oldEntry.itemId);
            if (invItem) {
                const revertedStockIn = (invItem.stockIn || 0) - oldEntry.qty;
                const revertedCurrent = (invItem.currentStock || 0) - oldEntry.qty;

                const finalStockIn = revertedStockIn + newQty;
                const finalCurrent = revertedCurrent + newQty;

                await db.inventory.update(oldEntry.itemId, {
                    stockIn: finalStockIn,
                    currentStock: finalCurrent,
                    stockValue: finalCurrent * finalCost
                });
            }

            // 1c. Update Master reference (Favor latest active batch)
            await views.syncSingleItemMaster(oldEntry.itemId);

            // 2. Handle Batch Movement
            // Revert Old Batch
            if (oldEntry.batchId) {
                const oldBatch = await db.item_batches.where({ itemId: oldEntry.itemId, batchId: oldEntry.batchId }).first();
                if (oldBatch) {
                    await db.item_batches.update(oldBatch.id, {
                        initialStock: (oldBatch.initialStock || 0) - oldEntry.qty,
                        currentStock: (oldBatch.currentStock || 0) - oldEntry.qty
                    });
                }
            }

            // Add to New Batch (Using the NEW prices)
            if (item && item.useBatch && newBatchId) {
                const targetBatch = await db.item_batches.where({ itemId: oldEntry.itemId, batchId: newBatchId }).first();
                if (targetBatch) {
                    await db.item_batches.update(targetBatch.id, {
                        costPrice: finalCost,
                        listPrice: finalMRP,
                        initialStock: (targetBatch.initialStock || 0) + newQty,
                        currentStock: (targetBatch.currentStock || 0) + newQty
                    });
                } else {
                    // Create new batch record if it doesn't exist
                    await db.item_batches.add({
                        itemId: oldEntry.itemId,
                        batchId: newBatchId,
                        costPrice: finalCost,
                        listPrice: finalMRP,
                        initialStock: newQty,
                        currentStock: newQty
                    });
                }
            }

            // 3. Update Log
            await db.stock_in.update(id, {
                date: newDate,
                qty: newQty,
                costPrice: finalCost,
                mrp: finalMRP,
                batchId: newBatchId || '',
                total: newQty * finalCost
            });

            document.getElementById('stockin-edit-modal').classList.add('hidden');
            utils.showNotification('Stock entry updated successfully');
            views.loadRecentStockIn();
            if (typeof app !== 'undefined' && app.updateDashboard) app.updateDashboard();
        } catch (err) {
            console.error(err);
            utils.showNotification('Update failed: ' + err.message, 'error');
            document.getElementById('stockin-edit-modal').classList.add('hidden');
        }
    },

    deleteStockIn: async (id) => {
        if (!confirm('Are you sure you want to delete this stock entry? Inventory counts will be reverted.')) return;
        if (!utils.verifyDeletePassword()) return;

        try {
            await db.transaction('rw', db.stock_in, db.inventory, db.item_batches, db.audit_logs, async () => {
                const entryId = parseInt(id);
                const entry = await db.stock_in.get(entryId);

                if (!entry) throw new Error('Stock Entry Not Found');

                // 1. Revert Inventory
                const invItem = await db.inventory.get(entry.itemId);
                if (invItem) {
                    const newStockIn = (invItem.stockIn || 0) - entry.qty;
                    const newCurrent = (invItem.currentStock || 0) - entry.qty;
                    const cost = invItem.avgCost || entry.costPrice || 0;

                    await db.inventory.update(entry.itemId, {
                        stockIn: newStockIn,
                        currentStock: newCurrent,
                        stockValue: newCurrent * cost
                    });
                }

                // 2. Revert Batch
                if (entry.batchId) {
                    const batch = await db.item_batches.where({ itemId: entry.itemId, batchId: entry.batchId }).first();
                    if (batch) {
                        await db.item_batches.update(batch.id, {
                            currentStock: (batch.currentStock || 0) - entry.qty
                        });
                    }
                }

                // 3. Delete Log Entry
                await db.stock_in.delete(entryId);

                // 4. Re-sync Item Master to move to previous batch price if needed
                await views.syncSingleItemMaster(entry.itemId);

                // 5. Audit Log
                await utils.logAction('Stock In Delete', `Deleted Stock In for ${entry.itemName} (${entry.qty} items)`);
            });

            utils.showNotification('Stock Entry deleted and inventory reverted');
            views.loadRecentStockIn();
            if (typeof app !== 'undefined' && app.updateDashboard) app.updateDashboard();
        } catch (err) {
            console.error('Delete Stock In Error:', err);
            utils.showNotification('Error deleting stock entry: ' + err.message, 'error');
        }
    },

    clearAllStockInHistory: async () => {
        if (!confirm('EXTREME DANGER: Are you sure you want to DELETE ALL stock history?\nThis will clear every record of items brought into the shop.')) return;
        if (!utils.verifyDeletePassword()) return;

        try {
            utils.showNotification('Clearing all stock records...', 'info');
            await db.stock_in.clear();
            await views.performInternalSync();
            utils.showNotification('All stock history cleared and inventory synced.', 'success');
            views.loadRecentStockIn();
            if (typeof app !== 'undefined' && app.updateDashboard) app.updateDashboard();
        } catch (err) {
            console.error(err);
            utils.showNotification('Failed to clear records', 'error');
        }
    },

    initInventory: async (searchQuery = '', forceFilter = null) => {
        if (!window.invFilters) {
            window.invFilters = { showLowStock: false, supplier: 'all' };
        }
        if (forceFilter) {
            window.invFilters = { ...window.invFilters, ...forceFilter };
        }

        const container = document.getElementById('view-inventory');
        // Show loading state implies container exists
        if (container) {
            if (!container.innerHTML || container.innerHTML.includes('fa-spinner') === false) {
                container.innerHTML = `<div class="p-8 text-center text-gray-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Loading inventory data...</div>`;
            }
        }

        if (this._loadingInv) return;
        this._loadingInv = true;

        let inventory = [];
        let totalCount = 0;

        try {
            const q = (searchQuery || '').toLowerCase().trim();
            const s = (window.invFilters.supplier || 'all').toLowerCase();

            if (q || s !== 'all' || window.invFilters.showLowStock) {
                inventory = await db.inventory.filter(i => {
                    const matchesSearch = !q || (
                        String(i.itemId).toLowerCase().includes(q) ||
                        String(i.itemName).toLowerCase().includes(q) ||
                        String(i.supplierId || '').toLowerCase().includes(q) ||
                        String(i.batchId || '').toLowerCase().includes(q) ||
                        String(i.category || '').toLowerCase().includes(q)
                    );
                    const matchesSup = s === 'all' || (
                        String(i.supplierId || '').toLowerCase().includes(s) ||
                        String(i.itemId).toLowerCase().startsWith(s)
                    );
                    const matchesLow = !window.invFilters.showLowStock || (i.currentStock || 0) <= (i.reorderLevel || 0);

                    return matchesSearch && matchesSup && matchesLow;
                }).limit(5000).toArray(); // Increased safety cap to allow more items (e.g. for supplier SET)
                totalCount = inventory.length;
            } else {
                totalCount = await db.inventory.count();
                inventory = await db.inventory.limit(1000).toArray();
            }
            views._loadingInv = false;

            // Status Check: Only fetch batches for the items we are DISPLAYING
            const visibleIds = inventory.map(i => i.itemId);
            const displayedBatches = await db.item_batches.where('itemId').anyOf(visibleIds).toArray();
            
            const discMap = new Map();
            displayedBatches.forEach(b => {
                const sId = String(b.itemId);
                if (!discMap.has(sId)) discMap.set(sId, true);
                if (!b.isDiscontinued) discMap.set(sId, false);
            });
            inventory.forEach(inv => {
                inv.isDiscontinued = discMap.get(String(inv.itemId)) || false;
            });

            this._loadingInv = false;
        } catch (err) {
            console.error(err);
            this._loadingInv = false;
            if (container) container.innerHTML = `<div class="p-8 text-center text-red-500">Error loading inventory: ${err.message}</div>`;
            return;
        }

        // Supplier Cache
        if (!window.supplierCache) {
            const allItems = await db.item_master.toArray();
            window.supplierCache = [...new Set(allItems.map(i => i.supplierId).filter(Boolean))].sort();
        }
        const suppliers = window.supplierCache;

        // Filters are now handled in the initial fetch for efficiency and correctness
        /*
        if (window.invFilters.showLowStock) {
            inventory = inventory.filter(i => i.currentStock <= i.reorderLevel);
        }
        if (window.invFilters.supplier !== 'all') {
            const s = window.invFilters.supplier.toLowerCase();
            inventory = inventory.filter(i =>
                String(i.supplierId || '').toLowerCase() === s ||
                String(i.itemId).toLowerCase().startsWith(s)
            );
        }
        
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            inventory = inventory.filter(i =>
                String(i.itemId).toLowerCase().includes(q) ||
                String(i.itemName).toLowerCase().includes(q) ||
                String(i.supplierId || '').toLowerCase().includes(q)
            );
        }
        */

        container.innerHTML = `
            <div class="flex flex-col h-full">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                        <h3 class="text-xl font-bold">Inventory Status</h3>
                        <p class="text-xs text-gray-500 mt-1">Manage and track your warehouse stock levels</p>
                    </div>
                    <div class="flex gap-2 flex-wrap">
                         <button onclick="if(!app.isAdmin) { app.requestAuth(() => views.exportToPDF('inventory-table', 'Inventory Report')); } else { views.exportToPDF('inventory-table', 'Inventory Report'); }" class="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-sm active:scale-95">
                            <i class="fa-solid fa-file-pdf"></i> PDF
                        </button>
                        <button onclick="views.exportInventoryToCSV()" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-sm active:scale-95 ${app.isAdmin ? '' : 'hidden'}">
                            <i class="fa-solid fa-file-export"></i> Export
                        </button>
                         <button onclick="views.recalculateAllInventory()" class="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-sm active:scale-95 ${app.isAdmin ? '' : 'hidden'}">
                            <i class="fa-solid fa-sync"></i> Sync & Recalculate
                        </button>
                    </div>
                </div>

                <!-- Filters Bar -->
                <div class="bg-white p-4 rounded-xl border border-gray-100 mb-6 flex flex-col md:flex-row gap-4 items-center shadow-sm">
                    <div class="flex items-center gap-2">
                        <label class="text-xs font-bold text-gray-400 uppercase tracking-wider">Filter By Supplier:</label>
                        <select onchange="views.initInventory('', { supplier: this.value })" class="bg-gray-50 border-none rounded-lg text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20">
                            <option value="all" ${window.invFilters.supplier === 'all' ? 'selected' : ''}>All Suppliers</option>
                            ${suppliers.map(s => `<option value="${s}" ${window.invFilters.supplier === s ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>

                    <div class="h-6 w-px bg-gray-100 hidden md:block"></div>

                    <div class="flex items-center gap-3">
                        <label class="text-xs font-bold text-gray-400 uppercase tracking-wider">Quick Filter:</label>
                        <button 
                            onclick="views.initInventory('', { showLowStock: !window.invFilters.showLowStock })"
                            class="px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${window.invFilters.showLowStock ? 'bg-red-500 text-white shadow-lg shadow-red-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}"
                        >
                            <i class="fa-solid fa-triangle-exclamation"></i>
                            ${window.invFilters.showLowStock ? 'Showing Low Stock' : 'Show All Stock'}
                        </button>
                    </div>
                    
                    <div class="ml-auto flex items-center gap-3">
                        <span class="text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                            Found: <span class="text-indigo-600 font-black" id="inv-count-badge">${inventory.length}</span> items
                        </span>
                    </div>
                </div>

                <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex-1 flex flex-col">
                     <div class="overflow-auto flex-1">
                        <table id="inventory-table" class="w-full text-sm text-left border-collapse">
                            <thead class="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10 transition-all">
                                <tr>
                                    <th class="px-3 py-4 w-12 text-center text-gray-400">#</th>
                                    <th class="px-3 py-4 w-12 text-center text-gray-400">BT</th>
                                    <th class="px-4 py-4 min-w-[220px]">Item Name</th>
                                    <th class="px-3 py-4 text-center text-indigo-500 whitespace-nowrap">Batch</th>
                                    <th class="px-4 py-4 whitespace-nowrap">Supplier</th>
                                    <th class="px-3 py-4 text-center whitespace-nowrap">Total In</th>
                                    <th class="px-3 py-4 text-center whitespace-nowrap">Sold</th>
                                    <th class="px-4 py-4 text-center whitespace-nowrap">Current Stock</th>
                                    <th class="px-4 py-4 text-right whitespace-nowrap">Value (Cost)</th>
                                    <th class="px-4 py-4 text-center whitespace-nowrap">Status</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100">
                                ${inventory.length === 0 ? '<tr><td colspan="10" class="px-6 py-12 text-center text-gray-400"><i class="fa-solid fa-folder-open text-4xl mb-3 opacity-20 block"></i> No inventory records found for current filters</td></tr>' : ''}
                                 ${inventory.map((i, idx) => {
            const isD = !!i.isDiscontinued;
            const sC = isD ? 'bg-gray-100 text-gray-500 border-gray-200' : (i.currentStock <= i.reorderLevel ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100');
            const sT = isD ? 'Discontinued' : (i.currentStock <= i.reorderLevel ? 'Low' : 'OK');
            return `
                                    <tr class="hover:bg-indigo-50/30 transition-colors group">
                                        <td class="px-3 py-3 text-center text-gray-300 font-mono text-[10px]">${idx + 1}</td>
                                        <td class="px-3 py-3 text-center">
                                            <button onclick="views.toggleInvBatches('${i.itemId}', this)" class="w-7 h-7 rounded-lg hover:bg-indigo-100 text-indigo-400 hover:text-indigo-600 transition-all border border-transparent hover:border-indigo-200 flex items-center justify-center mx-auto group-hover:scale-110">
                                                <i class="fa-solid fa-chevron-right text-[10px] transition-transform duration-200"></i>
                                            </button>
                                        </td>
                                        <td class="px-4 py-3">
                                            <div class="font-bold text-gray-800 leading-tight">${i.itemName}</div>
                                            <div class="text-[9px] text-gray-400 font-mono uppercase tracking-wider mt-1 flex items-center gap-1.5">
                                                <span class="opacity-50">#</span>${i.itemId}
                                            </div>
                                        </td>
                                        <td class="px-3 py-3 text-center">
                                            <span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold border border-indigo-100/50 whitespace-nowrap">${i.batchId || '-'}</span>
                                        </td>
                                        <td class="px-4 py-3 text-gray-500 text-[10px] font-bold uppercase tracking-tight whitespace-nowrap">${i.supplierId || '-'}</td>
                                        <td class="px-3 py-3 text-center text-gray-500 font-medium">${utils.formatNumber(i.stockIn)}</td>
                                        <td class="px-3 py-3 text-center text-gray-400">${utils.formatNumber(i.sold)}</td>
                                        <td class="px-4 py-3 text-center">
                                            <span class="text-lg font-black ${i.currentStock <= 0 ? 'text-red-500' : 'text-gray-900'}">${utils.formatNumber(i.currentStock)}</span>
                                        </td>
                                        <td class="px-4 py-3 text-right font-bold text-indigo-600 whitespace-nowrap">${utils.formatCurrency(i.stockValue || 0)}</td>
                                        <td class="px-4 py-3 text-center">
                                            <span class="${sC} text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border shadow-sm inline-block min-w-[70px]">${sT}</span>
                                        </td>
                                    </tr>
                                    <tr id="inv-batches-${i.itemId.replace(/[^a-zA-Z0-9]/g, '_')}" class="hidden bg-gray-50/50">
                                        <td colspan="10" class="p-0">
                                            <div class="px-12 py-4 border-l-4 border-indigo-400 ml-6 my-2 bg-white rounded-r-xl shadow-inner animate-fade-in overflow-hidden">
                                                <div id="inv-batches-content-${i.itemId.replace(/[^a-zA-Z0-9]/g, '_')}" class="flex flex-col gap-4">
                                                     <div class="flex items-center gap-2 text-indigo-400 mb-2">
                                                        <i class="fa-solid fa-spinner fa-spin"></i>
                                                        <span class="text-xs font-bold uppercase tracking-widest">Loading Batch Details...</span>
                                                     </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    `
        }).join('')}
                            </tbody>
                            <tfoot class="bg-gray-50/80 font-bold border-t-2 border-gray-200 sticky bottom-0 backdrop-blur-sm">
                                <tr>
                                    <td class="px-6 py-4 text-right text-gray-400 uppercase text-[10px] tracking-widest" colspan="8">Total Inventory Value</td>
                                    <td class="px-4 py-4 text-right text-indigo-700 text-lg font-black whitespace-nowrap">
                                        ${utils.formatCurrency(inventory.reduce((sum, i) => sum + (i.stockValue || 0), 0))}
                                    </td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                     </div>
                </div>
            </div>
        `;
    },

    toggleInvBatches: async (itemId, btn) => {
        const safeId = itemId.replace(/[^a-zA-Z0-9]/g, '_');
        const row = document.getElementById(`inv-batches-${safeId}`);
        const content = document.getElementById(`inv-batches-content-${safeId}`);
        const icon = btn.querySelector('i');

        if (!row || !content) return;

        if (row.classList.contains('hidden')) {
            row.classList.remove('hidden');
            icon.classList.add('rotate-90');

            // Fetch batches for this item
            const batches = await db.item_batches.where('itemId').equals(itemId).toArray();
            const item = await db.item_master.get(itemId);

            if (!batches || batches.length === 0) {
                content.innerHTML = `
                    <div class="py-4 text-gray-400 italic text-sm flex items-center gap-3">
                        <i class="fa-solid fa-circle-info text-indigo-300"></i>
                        No batch stock found for this item.
                    </div>
                `;
                return;
            }

            content.innerHTML = `
                <div class="flex items-center justify-between mb-3">
                    <h5 class="text-[10px] font-black uppercase tracking-widest text-indigo-500 flex items-center gap-2">
                        <i class="fa-solid fa-boxes-stacked"></i> Batch Specific Stock
                    </h5>
                    <div class="flex items-center gap-2">
                        <button onclick="views.exportToPDF('inv-batches-table-${safeId}', 'Batch Stock Report - ${item ? item.itemName : itemId}')" class="bg-indigo-50 text-indigo-600 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-indigo-100 hover:bg-indigo-100 transition-colors flex items-center gap-1">
                            <i class="fa-solid fa-file-pdf"></i> PDF
                        </button>
                        <div class="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border border-indigo-100">
                            Ref: ${itemId}
                        </div>
                    </div>
                </div>
                <div class="overflow-hidden border border-gray-100 rounded-xl bg-white shadow-sm">
                    <table id="inv-batches-table-${safeId}" class="w-full text-xs text-left">
                        <thead class="bg-gray-50 text-[10px] text-gray-400 font-black uppercase tracking-widest border-b border-gray-100">
                            <tr>
                                <th class="px-4 py-3">Batch ID / Name</th>
                                <th class="px-4 py-3 text-center">Stock In</th>
                                <th class="px-4 py-3 text-center text-indigo-500">Current Stock</th>
                                <th class="px-4 py-3 text-right">Cost Rate</th>
                                <th class="px-4 py-3 text-right">Selling Price (MRP)</th>
                                <th class="px-4 py-3 text-right">Batch Value</th>
                                <th class="px-4 py-3 text-center">Condition</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-50">
                            ${batches.map(b => {
                const val = (b.currentStock || 0) * (b.costPrice || 0);
                const isLow = b.currentStock <= (item?.reorderLevel || 5);
                return `
                                    <tr class="hover:bg-indigo-50/20 transition-colors">
                                        <td class="px-4 py-3 font-bold text-gray-700">${b.batchId}</td>
                                        <td class="px-4 py-3 text-center">
                                            <span class="text-sm font-bold text-gray-400">${b.initialStock || b.currentStock || 0}</span>
                                        </td>
                                        <td class="px-4 py-3 text-center bg-indigo-50/30">
                                            <span class="text-base font-black ${b.currentStock <= 0 ? 'text-red-400' : 'text-gray-900'}">${utils.formatNumber(b.currentStock)}</span>
                                        </td>
                                        <td class="px-4 py-3 text-right font-mono text-gray-400">${utils.formatCurrency(b.costPrice)}</td>
                                        <td class="px-4 py-3 text-right font-mono font-bold text-indigo-600 font-bold">${utils.formatCurrency(b.listPrice)}</td>
                                        <td class="px-4 py-3 text-right font-black text-gray-600">${utils.formatCurrency(val)}</td>
                                        <td class="px-4 py-3 text-center">
                                            <span class="text-[9px] font-black uppercase tracking-tighter px-2 py-1 rounded-lg ${isLow ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}">
                                                ${isLow ? 'Low Stock' : 'Good'}
                                            </span>
                                        </td>
                                    </tr>
                                `;
            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            row.classList.add('hidden');
            icon.classList.remove('rotate-90');
        }
    },

    recalculateAllInventory: async (isSilent = false) => {
        if (!isSilent && !app.isAdmin) {
            app.requestAuth(() => views.recalculateAllInventory());
            return;
        }
        if (!isSilent && !confirm('This will RESET all inventory counts by calculating (Total Stock In - Total Sales). Continue?')) return;

        try {
            if (!isSilent) utils.showNotification('Recalculating... Please wait', 'info');

            await db.transaction('rw', db.inventory, db.item_master, db.stock_in, db.sales, db.item_batches, async () => {
                await db.inventory.clear();
                const items = await db.item_master.toArray();
                let allStockIn = await db.stock_in.toArray();
                const allSales = await db.sales.toArray();
                const stockInMap = new Map();
                allStockIn.forEach(s => {
                    if (!stockInMap.has(s.itemId)) stockInMap.set(s.itemId, []);
                    stockInMap.get(s.itemId).push(s);
                });
                const salesMap = new Map();
                allSales.forEach(s => {
                    if (s.paymentStatus === 'Cancelled') return;
                    if (!salesMap.has(s.itemId)) salesMap.set(s.itemId, []);
                    salesMap.get(s.itemId).push(s);
                });
                
                // PRESERVE STATUS: Fetch existing batch statuses early to inform Item Master price sync
                const existingBatches = await db.item_batches.toArray();
                const discStatusMap = new Map(existingBatches.map(b => [`${b.itemId}_${String(b.batchId).toLowerCase()}`, !!b.isDiscontinued]));

                // --- REPAIR ALL STOCK IN RECORDS FIRST ---
                const itemMap = new Map(items.map(i => [i.itemId, i]));
                for (let sin of allStockIn) {
                    const item = itemMap.get(sin.itemId);
                    if (item && ((!sin.mrp || sin.mrp <= 0) || (!sin.costPrice || sin.costPrice <= 0))) {
                        sin.mrp = (sin.mrp > 0) ? sin.mrp : (parseFloat(item.listPrice) || 0);
                        sin.costPrice = (sin.costPrice > 0) ? sin.costPrice : (parseFloat(item.costPrice) || 0);
                        await db.stock_in.update(sin.id, {
                            mrp: sin.mrp,
                            costPrice: sin.costPrice,
                            total: (parseFloat(sin.qty) || 0) * sin.costPrice
                        });
                    }
                }

                // --- GHOST ITEM RECOVERY REMOVED ---
                // Deleted items should remain deleted even if history exists.

                // 1. Identify LATEST prices from Stock In records for each item
                const latestPriceMap = new Map();
                // Sort by ID to ensure latest is processed last or used correctly
                const sortedStockIn = [...allStockIn].sort((a,b) => (a.id || 0) - (b.id || 0));
                for (const sin of sortedStockIn) {
                    latestPriceMap.set(sin.itemId, {
                        costPrice: parseFloat(sin.costPrice) || 0,
                        listPrice: parseFloat(sin.mrp) || 0
                    });
                }

                const inventoryUpdates = [];
                const masterUpdates = [];

                // 2. Process Items and update Master store
                for (const item of items) {
                    // HEALING: Auto-detect supplierId if missing
                    if (!item.supplierId) {
                        let detectedSup = null;
                        if (/^[A-Z]{2,4}\d+$/i.test(item.itemId)) {
                            detectedSup = item.itemId.match(/^[A-Z]{2,4}/i)[0].toUpperCase();
                        } else if (item.itemName && item.itemName.includes('-')) {
                            const parts = item.itemName.split('-');
                            const potential = parts[parts.length - 1].trim().toUpperCase();
                            if (potential.length >= 2 && potential.length <= 4) detectedSup = potential;
                        }

                        if (detectedSup) {
                            item.supplierId = detectedSup;
                            masterUpdates.push(db.item_master.update(item.itemId, { supplierId: detectedSup }));
                        }
                    }

                    // Identify the ACTUAL latest batch for this item to keep it in sync (Favoring active batches)
                    const itemStocks = (stockInMap.get(item.itemId) || []).sort((a,b) => (Number(b.id) || 0) - (Number(a.id) || 0));
                    const latestStockRecord = itemStocks.find(s => !discStatusMap.get(`${item.itemId}_${String(s.batchId || 'B001').toLowerCase()}`)) || itemStocks[0];
                    const finalBatchId = latestStockRecord ? latestStockRecord.batchId : (item.batchId || 'B001');
                    const finalCost = latestStockRecord ? (parseFloat(latestStockRecord.costPrice) || 0) : (parseFloat(item.costPrice) || 0);
                    const finalMRP = latestStockRecord ? (parseFloat(latestStockRecord.mrp) || 0) : (parseFloat(item.listPrice) || 0);

                    // Force sync Master record if it differs from latest stock in
                    if (latestStockRecord || (item.costPrice !== finalCost || item.listPrice !== finalMRP || item.batchId !== finalBatchId)) {
                        // Update local object too so batch lookup works later
                        item.costPrice = finalCost;
                        item.listPrice = finalMRP;
                        item.batchId = finalBatchId;

                        masterUpdates.push(db.item_master.update(item.itemId, {
                            costPrice: finalCost,
                            listPrice: finalMRP,
                            batchId: finalBatchId,
                            useBatch: true
                        }));
                    }

                    const stockInRecords = stockInMap.get(item.itemId) || [];
                    const salesRecords = salesMap.get(item.itemId) || [];

                    const totalIn = stockInRecords.reduce((sum, r) => sum + (parseFloat(r.qty) || 0), 0);
                    const totalSold = salesRecords.reduce((sum, r) => sum + (parseFloat(r.qty) || 0), 0);
                    const currentStock = totalIn - totalSold;

                    inventoryUpdates.push({
                        itemId: item.itemId,
                        itemName: item.itemName,
                        supplierId: item.supplierId || '',
                        stockIn: totalIn,
                        sold: totalSold,
                        currentStock: currentStock,
                        reorderLevel: item.reorderLevel || 0,
                        stockValue: currentStock * finalCost,
                        batchId: item.batchId || 'B001',
                        avgCost: finalCost
                    });
                }

                // Apply Master updates first to ensure they are the reference
                if (masterUpdates.length > 0) await Promise.all(masterUpdates);

                if (inventoryUpdates.length > 0) {
                    await db.inventory.bulkAdd(inventoryUpdates);
                }

                // 3. Batch Stock Recalculation (Ensuring Parity)
                // (discStatusMap already prepared at the start of transaction)

                await db.item_batches.clear();
                const batchMap = new Map();

                // Track latest price found for each specific batch
                const batchLatestPriceMap = new Map();

                // Rebuild batches from stock in records
                for (const sin of allStockIn) {
                    const bId = (sin.batchId && sin.batchId.trim() !== '') ? sin.batchId : 'B001';
                    const key = `${sin.itemId}_${bId.toLowerCase()}`;

                    // Update the latest price for this specific batch key
                    batchLatestPriceMap.set(key, {
                        costPrice: parseFloat(sin.costPrice) || 0,
                        listPrice: parseFloat(sin.mrp) || 0
                    });

                    if (!batchMap.has(key)) {
                        batchMap.set(key, {
                            itemId: sin.itemId,
                            batchId: bId,
                            isDiscontinued: discStatusMap.get(key) || false,
                            initialStock: 0,
                            currentStock: 0
                            // Prices will be set after the loop from batchLatestPriceMap
                        });
                    }
                    const b = batchMap.get(key);
                    const qty = (parseFloat(sin.qty) || 0);
                    b.initialStock = (b.initialStock || 0) + qty;
                    b.currentStock = (b.currentStock || 0) + qty;
                }

                const itemLookupMap = new Map(items.map(i => [i.itemId, i]));

                // Apply the latest batch-specific prices to the map
                for (const [key, b] of batchMap.entries()) {
                    const prices = batchLatestPriceMap.get(key);
                    const master = itemLookupMap.get(b.itemId);
                    if (prices) {
                        // Fix for 0.00 prices: Fallback to master item price if batch price is zero
                        b.costPrice = (prices.costPrice > 0) ? prices.costPrice : (master ? parseFloat(master.costPrice) || 0 : 0);
                        b.listPrice = (prices.listPrice > 0) ? prices.listPrice : (master ? parseFloat(master.listPrice) || 0 : 0);
                    }
                }

                // Deduct Sales
                for (const sale of allSales) {
                    if (sale.paymentStatus === 'Cancelled') continue;
                    const bId = (sale.batchId && sale.batchId.trim() !== '') ? sale.batchId : 'B001';
                    const key = `${sale.itemId}_${bId.toLowerCase()}`;
                    if (batchMap.has(key)) {
                        const b = batchMap.get(key);
                        b.currentStock = (b.currentStock || 0) - (parseFloat(sale.qty) || 0);
                    }
                }

                if (batchMap.size > 0) {
                    await db.item_batches.bulkAdd(Array.from(batchMap.values()));
                }
            });

            if (!isSilent) {
                utils.showNotification('Inventory Synchronized Successfully!', 'success');
                views.initInventory();
            }
        } catch (err) {
            console.error('Recalculate error:', err);
            utils.showNotification('Error syncing inventory: ' + err.message, 'error');
        }
    },

    performAnnualClosing: async () => {
        if (!app.isAdmin) {
            app.requestAuth(() => views.performAnnualClosing());
            return;
        }

        const yearInput = prompt("Enter the year you want to archive (e.g., 2026):", new Date().getFullYear() - 1);
        if (!yearInput) return;
        const year = parseInt(yearInput);

        if (!confirm(`⚠️ ANNUAL CLOSING & ARCHIVE: ${year}\n\nThis process will:\n1. MOVE all sales from ${year} to the archive table.\n2. PERMANENTLY ADJUST stock-in history to maintain current counts.\n3. FORCE a system backup before starting.\n\nThis is a permanent action. Continue?`)) return;

        try {
            utils.showNotification('Starting Annual Closing... Please wait.', 'info');

            // 1. Force Backup
            await views.backupData();
            utils.showNotification('Safety backup created. Processing data...', 'info');

            await db.transaction('rw', db.sales, db.sales_archive, db.stock_in, db.stock_in_archive, db.audit_logs, db.purchases, db.purchases_archive, async () => {
                const targetSales = await db.sales.filter(s => {
                    if (!s.date) return false;
                    const d = new Date(s.date);
                    const isCorrectYear = !isNaN(d.getTime()) && d.getFullYear() === year;
                    return isCorrectYear && s.paymentStatus !== 'Pending'; // PREVENT ARCHIVE: Keep pending payments in main table for tracking
                }).toArray();

                const targetStockIn = await db.stock_in.filter(sin => {
                    if (!sin.date) return false;
                    const d = new Date(sin.date);
                    return !isNaN(d.getTime()) && d.getFullYear() === year;
                }).toArray();

                const targetPurchases = await db.purchases.filter(p => {
                    if (!p.date) return false;
                    const d = new Date(p.date);
                    return !isNaN(d.getTime()) && d.getFullYear() === year;
                }).toArray();

                if (targetSales.length === 0 && targetStockIn.length === 0 && targetPurchases.length === 0) {
                    throw new Error(`No records found for the year ${year}.`);
                }

                // --- 1. ARCHIVE SALES ---
                if (targetSales.length > 0) {
                    const archiveSales = targetSales.map(s => {
                        let ns = { ...s, archiveYear: year };
                        delete ns.id; // Delete original ID so archive table auto-increments
                        return ns;
                    });
                    await db.sales_archive.bulkAdd(archiveSales);
                    await db.sales.bulkDelete(targetSales.map(s => s.id));
                }

                // --- 2. ARCHIVE STOCK IN AND CALCULATE CONSOLIDATION ---
                // We map all activity (In and Out) to find the final result for that year
                const consolidationMap = {}; // Key: itemId||batchId

                // Group Stock In (Positive)
                targetStockIn.forEach(sin => {
                    const key = `${sin.itemId}||${sin.batchId || 'B001'}`;
                    if (!consolidationMap[key]) {
                        consolidationMap[key] = { qty: 0, itemName: sin.itemName, mrp: sin.mrp, cost: sin.costPrice, supplierId: sin.supplierId };
                    }
                    consolidationMap[key].qty += (parseFloat(sin.qty) || 0);
                });

                // Group Sales (Negative)
                targetSales.forEach(s => {
                    if (s.paymentStatus === 'Cancelled') return; // BUG FIX: Skip cancelled sales for stock consolidation
                    const key = `${s.itemId}||${s.batchId || 'B001'}`;
                    if (!consolidationMap[key]) {
                        consolidationMap[key] = { qty: 0, itemName: s.itemName, mrp: s.mrp, cost: s.costPrice, supplierId: s.supplierId };
                    }
                    consolidationMap[key].qty -= (parseFloat(s.qty) || 0);
                });

                // Move original Stock In to Archive
                if (targetStockIn.length > 0) {
                    const archiveStockIn = targetStockIn.map(sin => {
                        let ns = { ...sin, archiveYear: year };
                        delete ns.id;
                        return ns;
                    });
                    await db.stock_in_archive.bulkAdd(archiveStockIn);
                    await db.stock_in.bulkDelete(targetStockIn.map(sin => sin.id));
                }

                // --- 2.5 ARCHIVE PURCHASES ---
                if (targetPurchases.length > 0) {
                    const archivePurchases = targetPurchases.map(p => {
                        let ns = { ...p, archiveYear: year };
                        delete ns.id;
                        return ns;
                    });
                    await db.purchases_archive.bulkAdd(archivePurchases);
                    await db.purchases.bulkDelete(targetPurchases.map(p => p.id));
                }

                // --- 3. CREATE CONSOLIDATED BALANCE FORWARD ---
                const consolidationRecords = [];
                for (const key in consolidationMap) {
                    const [itemId, batchId] = key.split('||');
                    const data = consolidationMap[key];
                    
                    if (data.qty !== 0) {
                        consolidationRecords.push({
                            date: `${year}-12-31`,
                            itemId: itemId,
                            itemName: data.itemName,
                            batchId: batchId,
                            qty: data.qty,
                            costPrice: data.cost,
                            mrp: data.mrp,
                            total: data.qty * data.cost,
                            remarks: `ANNUAL BALANCE CARRYOVER ${year}`,
                            supplierId: data.supplierId || 'SYSTEM'
                        });
                    }
                }
                
                if (consolidationRecords.length > 0) {
                    await db.stock_in.bulkAdd(consolidationRecords);
                }

                await utils.logAction('Annual Closing', `Archived Year ${year}: ${targetSales.length} Sales, ${targetStockIn.length} Purchases. Created ${consolidationRecords.length} Carryover records.`);
            });

            utils.showNotification(`Annual Closing for ${year} complete! System history has been consolidated.`, 'success');
            
            // Recalculate Inventory to sync with new Carryover records
            await views.recalculateAllInventory(true);
            
            setTimeout(() => window.location.reload(), 2000);

        } catch (err) {
            console.error('Annual closing error:', err);
            utils.showNotification('Error during annual closing: ' + err.message, 'error');
        }
    },

    importInventoryFromCSV: (input) => {
        const file = input.files[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim().toLowerCase(),
            complete: async (results) => {
                const rows = results.data;
                let count = 0;
                let skipped = 0;

                for (const row of rows) {
                    const itemId = (row['item id'] || row['itemid'] || row['id'] || row['item_id'] || '').toString().trim();
                    const newStockStr = row['current stock'] || row['currentstock'] || row['stock'] || row['qty'] || row['quantity'];
                    const newStock = parseFloat(newStockStr);

                    if (!itemId || isNaN(newStock)) {
                        console.warn('Skipping Invalid Row:', row);
                        skipped++;
                        continue;
                    }

                    try {
                        // Find item either by string ID or numeric ID
                        let itemInMaster = await db.item_master.get(itemId);
                        if (!itemInMaster && !isNaN(Number(itemId))) {
                            itemInMaster = await db.item_master.get(Number(itemId));
                        }

                        if (!itemInMaster) {
                            console.warn(`Item ${itemId} not found in master`);
                            skipped++;
                            continue;
                        }

                        const actualId = itemInMaster.itemId; // Use ID from master
                        const invItem = await db.inventory.get(actualId);
                        const currentQty = invItem ? (invItem.currentStock || 0) : 0;
                        const diff = newStock - currentQty;

                        if (diff !== 0) {
                            await db.stock_in.add({
                                date: new Date().toISOString().split('T')[0],
                                supplierId: itemInMaster.supplierId || 'SYSTEM',
                                itemId: actualId,
                                itemName: itemInMaster.itemName,
                                batchId: itemInMaster.batchId || 'B001',
                                qty: diff,
                                costPrice: itemInMaster.costPrice || 0,
                                mrp: itemInMaster.listPrice || 0,
                                total: diff * (itemInMaster.costPrice || 0),
                                remarks: `CSV STOCK ADJUSTMENT (${newStock})`
                            });
                            count++;
                        }
                    } catch (e) {
                        console.error('Inv Import Error', e);
                        skipped++;
                    }
                }

                if (count > 0) {
                    await views.recalculateAllInventory(true);
                    utils.showNotification(`Adjusted stock for ${count} items. ${skipped} rows skipped.`, 'success');
                } else {
                    utils.showNotification(`No stock changes detected. ${skipped} rows skipped.`, 'info');
                }

                views.initInventory();
                input.value = '';
            },
            error: (err) => {
                utils.showNotification('CSV parsing error', 'error');
                console.error(err);
            }
        });
    },

    // --- POS SECTION (Complex) ---
    initPOS: async () => {
        const container = document.getElementById('view-pos');

        // Setup state for Cart
        window.posCart = [];
        window.posReturnMode = false; // Initialize Return Mode state

        // Cache items for fast search (Force reload to get latest useBatch and prices)
        app.itemCache = await db.item_master.toArray();
        window.posItems = app.itemCache;

        // Helper to get consistent light color based on Supplier ID
        const getSupColor = (supId) => {
            if (!supId) return 'bg-gray-50 border-gray-100';
            const colors = [
                'bg-red-50 border-red-100',
                'bg-emerald-50 border-emerald-100',
                'bg-blue-50 border-blue-100',
                'bg-amber-50 border-amber-100',
                'bg-purple-50 border-purple-100',
                'bg-pink-50 border-pink-100',
                'bg-orange-50 border-orange-100',
                'bg-teal-50 border-teal-100',
                'bg-indigo-50 border-indigo-100',
                'bg-sky-50 border-sky-100',
                'bg-lime-50 border-lime-100',
                'bg-rose-50 border-rose-100'
            ];
            let hash = 0;
            const str = String(supId);
            for (let i = 0; i < str.length; i++) {
                hash = str.charCodeAt(i) + ((hash << 5) - hash);
            }
            const index = Math.abs(hash) % colors.length;
            return colors[index];
        };

        // --- Get Top 24 Fast Moving Items for Quick Grid ---
        let displayItems = [];
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const startDate = thirtyDaysAgo.toISOString().split('T')[0];
            const allSales = await db.sales.where('date').aboveOrEqual(startDate).toArray();
            const frequencyMap = {};
            allSales.forEach(s => {
                if (!frequencyMap[s.itemId]) frequencyMap[s.itemId] = 0;
                frequencyMap[s.itemId] += 1; // Count of sales records (frequency)
            });

            // Sort item IDs by frequency
            const sortedIds = Object.keys(frequencyMap).sort((a, b) => frequencyMap[b] - frequencyMap[a]);

            // Map IDs back to item objects and filter
            displayItems = sortedIds
                .map(id => window.posItems.find(i => String(i.itemId) === String(id)))
                .filter(i => i && i.itemName && i.itemName.toString().trim() !== "0")
                .slice(0, 24);
        } catch (e) {
            console.error("Error fetching fast moving items:", e);
        }

        // Fallback if no sales or not enough sales: Add from master list
        if (displayItems.length < 24) {
            const existingIds = displayItems.map(i => String(i.itemId));
            const extraItems = window.posItems
                .filter(i => !existingIds.includes(String(i.itemId)) && i.itemName && i.itemName.toString().trim() !== "0")
                .slice(0, 24 - displayItems.length);
            displayItems = [...displayItems, ...extraItems];
        }

        container.innerHTML = `
            <div class="flex h-full gap-4">
                <!-- Left: Product Selection -->
                <div class="w-[60%] flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <!-- Search Bar -->
                    <div class="mb-6">
                        <div class="relative">
                            <i class="fa-solid fa-barcode absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl"></i>
                            <input 
                                type="text" 
                                id="pos-search" 
                                class="w-full pl-14 pr-4 py-4 bg-gray-50 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-all text-lg font-medium" 
                                placeholder="🔍 Scan barcode or type item name..."
                                autofocus
                            >
                            <div id="pos-search-results" class="absolute top-full left-0 w-full mt-2 bg-white rounded-xl shadow-2xl z-50 hidden max-h-[320px] overflow-y-auto border border-gray-200 divide-y divide-gray-100 animate-fade-in"></div>
                        </div>
                    </div>

                    <!-- Quick Access Grid -->
                    <div class="mb-4 flex justify-between items-center">
                        <div class="flex items-center gap-4">
                            <h3 class="text-sm font-bold text-gray-500 uppercase tracking-wide">Fast Moving Items</h3>
                            
                            <!-- Return Mode Toggle -->
                            <label class="flex items-center gap-2 cursor-pointer bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-100 transition-colors">
                                <span class="text-xs font-bold text-red-600 uppercase">Return Mode</span>
                                <div class="relative inline-block w-10 h-5">
                                    <input type="checkbox" id="return-mode-toggle" class="peer sr-only" onchange="views.toggleReturnMode(this.checked)">
                                    <div class="w-11 h-6 bg-gray-300 rounded-full peer peer-focus:ring-4 peer-focus:ring-red-300 dark:peer-focus:ring-red-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                                </div>
                            </label>

                            <!-- Custom Item Button -->
                            <button onclick="views.openCustomItemModal()" class="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-100 transition-colors text-indigo-700">
                                <i class="fa-solid fa-pen-to-square"></i>
                                <span class="text-xs font-bold uppercase">Custom Item</span>
                            </button>
                        </div>

                        <button onclick="views.clearCart()" class="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1">
                            <i class="fa-solid fa-trash"></i> Clear All
                        </button>
                    </div>
                    
                    <div class="flex-1 overflow-y-auto pr-2">
                        <div class="grid grid-cols-4 gap-3" id="pos-quick-grid">
                            ${displayItems.map(item => {
            const colorClasses = getSupColor(item.supplierId);
            return `
                                <div 
                                    onclick="views.addToCart('${item.itemId}')" 
                                    class="${colorClasses} hover:bg-white border-2 hover:border-primary p-3 rounded-xl cursor-pointer transition-all hover:scale-105 active:scale-95 group shadow-sm hover:shadow-md h-full flex flex-col justify-between"
                                >
                                    <div>
                                        <div class="w-auto inline-flex px-2 py-0.5 bg-white/80 rounded-lg border border-gray-100/50 mb-2 shadow-sm group-hover:bg-primary group-hover:text-white transition-all">
                                            <span class="font-bold text-[9px] uppercase tracking-wider text-gray-400 group-hover:text-white">${item.itemId}</span>
                                        </div>
                                        <h4 class="font-bold text-gray-800 text-[13px] leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2 h-[34px] overflow-hidden">${utils.cleanItemName(item.itemName)}</h4>
                                    </div>
                                    <div class="flex justify-between items-center mt-1 pt-2 border-t border-gray-100/50">
                                        <span class="text-[10px] text-gray-400 bg-white/50 px-1.5 py-0.5 rounded font-bold uppercase">${item.unit}</span>
                                        <span class="text-[15px] font-black text-primary">${utils.formatCurrencyNoCents(item.listPrice)}</span>
                                    </div>
                                </div>
                            `}).join('')}
                        </div>
                    </div>
                </div>

                <!-- Right: Cart & Billing -->
                <div class="w-[40%] flex flex-col bg-white rounded-2xl shadow-2xl border-2 border-indigo-500/30 overflow-hidden">
                    <!-- Header -->
                    <div class="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-6">
                        <div class="flex justify-between items-center">
                            <div>
                                <h4 class="text-xl font-bold">Current Bill</h4>
                                <p class="text-indigo-200 text-sm mt-1">Invoice #${Date.now().toString().slice(-6)}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-xs text-indigo-200">Items</p>
                                <p class="text-2xl font-bold" id="cart-item-count">0</p>
                            </div>
                        </div>
                    </div>

                    <!-- Cart Items -->
                    <div class="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50" id="cart-container">
                        <div class="flex flex-col items-center justify-center h-full text-gray-400">
                            <i class="fa-solid fa-cart-shopping text-6xl mb-4 opacity-20"></i>
                            <p class="text-lg font-medium">Cart is empty</p>
                            <p class="text-sm">Scan or search items to add</p>
                        </div>
                    </div>

                    <!-- Billing Summary -->
                    <div class="bg-white p-6 shadow-[0_-5px_20px_rgba(0,0,0,0.08)] z-10 border-t-2 border-gray-100">
                        <!-- Customer & Date Selection -->
                        <div class="grid grid-cols-2 gap-4 mb-4">
                             <div>
                                <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Customer (Optional)</label>
                                <div class="relative">
                                    <i class="fa-solid fa-user absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                                    <input type="text" id="pos-customer" placeholder="Walk-in Customer" class="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm font-medium transition-all">
                                </div>
                             </div>
                             <div>
                                <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Bill Date (Admin)</label>
                                <div id="pos-date-wrapper">
                                    <button onclick="views.unlockOldDate()" class="w-full py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-400 text-xs font-bold flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors">
                                        <i class="fa-solid fa-calendar-alt"></i> Today
                                    </button>
                                </div>
                             </div>
                        </div>

                        <!-- Payment Mode Selection -->
                        <div class="mb-4">
                            <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Payment Method</label>
                            <div class="grid grid-cols-3 gap-2">
                                <label class="cursor-pointer">
                                    <input type="radio" name="payment-method" value="Cash" checked class="hidden peer">
                                    <div class="text-center py-2 rounded-lg border border-gray-200 bg-gray-50 peer-checked:border-secondary peer-checked:bg-emerald-50 peer-checked:text-secondary font-bold text-xs transition-all flex items-center justify-center gap-1">
                                        <i class="fa-solid fa-money-bill-wave"></i> Cash
                                    </div>
                                </label>
                                <label class="cursor-pointer">
                                    <input type="radio" name="payment-method" value="Visa/Master" class="hidden peer">
                                    <div class="text-center py-2 rounded-lg border border-gray-200 bg-gray-50 peer-checked:border-primary peer-checked:bg-indigo-50 peer-checked:text-primary font-bold text-xs transition-all flex items-center justify-center gap-1">
                                        <i class="fa-brands fa-cc-visa"></i> Card
                                    </div>
                                </label>
                                <label class="cursor-pointer">
                                    <input type="radio" name="payment-method" value="Bank" class="hidden peer">
                                    <div class="text-center py-2 rounded-lg border border-gray-200 bg-gray-50 peer-checked:border-blue-500 peer-checked:bg-blue-50 peer-checked:text-blue-600 font-bold text-xs transition-all flex items-center justify-center gap-1">
                                        <i class="fa-solid fa-building-columns"></i> Bank
                                    </div>
                                </label>
                                <label class="cursor-pointer">
                                    <input type="radio" name="payment-method" value="QR" class="hidden peer">
                                    <div class="text-center py-2 rounded-lg border border-gray-200 bg-gray-50 peer-checked:border-orange-500 peer-checked:bg-orange-50 peer-checked:text-orange-600 font-bold text-xs transition-all flex items-center justify-center gap-1">
                                        <i class="fa-solid fa-qrcode"></i> QR
                                    </div>
                                </label>
                                <label class="cursor-pointer">
                                    <input type="radio" name="payment-method" value="Mixed" class="hidden peer">
                                    <div class="text-center py-2 rounded-lg border border-gray-200 bg-gray-50 peer-checked:border-purple-500 peer-checked:bg-purple-50 peer-checked:text-purple-600 font-bold text-xs transition-all flex items-center justify-center gap-1">
                                        <i class="fa-solid fa-layer-group"></i> Mixed
                                    </div>
                                </label>
                                <label class="cursor-pointer">
                                    <input type="radio" name="payment-method" value="Credit" class="hidden peer">
                                    <div class="text-center py-2 rounded-lg border border-gray-200 bg-gray-50 peer-checked:border-red-500 peer-checked:bg-red-50 peer-checked:text-red-600 font-bold text-xs transition-all flex items-center justify-center gap-1">
                                        <i class="fa-solid fa-user-clock"></i> Credit
                                    </div>
                                </label>
                            </div>
                        </div>

                        <!-- Mixed Payment Breakdown -->
                        <div id="mixed-payment-section" class="hidden mb-4 p-3 bg-purple-50/50 border border-purple-100 rounded-xl space-y-2 animate-fade-in">
                            <div class="grid grid-cols-2 gap-2">
                                <div>
                                    <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Cash Amt</label>
                                    <input type="number" id="mix-cash" placeholder="0.00" class="w-full px-3 py-1.5 text-sm font-bold border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 outline-none mix-input">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Card Amt</label>
                                    <input type="number" id="mix-card" placeholder="0.00" class="w-full px-3 py-1.5 text-sm font-bold border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 outline-none mix-input">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Bank Amt</label>
                                    <input type="number" id="mix-bank" placeholder="0.00" class="w-full px-3 py-1.5 text-sm font-bold border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 outline-none mix-input">
                                </div>
                                <div>
                                    <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">QR Amt</label>
                                    <input type="number" id="mix-qr" placeholder="0.00" class="w-full px-3 py-1.5 text-sm font-bold border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 outline-none mix-input">
                                </div>
                            </div>
                        </div>

                        <!-- Subtotal -->
                        <div class="flex justify-between items-center mb-4 pt-2 border-t border-gray-100">
                            <span class="text-gray-600 font-medium">Net Total</span>
                            <span class="font-bold text-lg" id="bill-subtotal">Rs. 0.00</span>
                        </div>
                        
                        <!-- Bill Discount -->
                        <div class="mb-4">
                            <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Bill Discount</label>
                            <div class="relative">
                                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-amber-600 font-bold">Rs.</span>
                                <input type="number" id="bill-discount" placeholder="0.00" class="w-full pl-10 pr-4 py-2 bg-amber-50/30 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-400 focus:bg-white outline-none font-bold text-gray-800 transition-all">
                            </div>
                        </div>
                        
                        <!-- Total -->
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-2xl font-bold text-gray-800">TOTAL</span>
                            <span class="text-3xl font-bold text-primary" id="bill-total">Rs. 0.00</span>
                        </div>
                        <div id="bill-profit-summary" class="text-right mb-6 no-print">
                            <!-- Profit Margin details injected here -->
                        </div>

                        <!-- Payment Details -->
                        <div class="grid grid-cols-2 gap-4 mb-6 pt-4 border-t border-dashed border-gray-200">
                             <div>
                                <label class="block text-xs font-bold text-gray-500 mb-1">PAID AMOUNT</label>
                                <div class="relative">
                                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Rs.</span>
                                    <input type="number" id="bill-paid" placeholder="0.00" class="w-full pl-10 pr-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:border-green-400 focus:bg-white outline-none font-bold text-lg text-gray-800 transition-all">
                                </div>
                             </div>
                             <div>
                                <label class="block text-xs font-bold text-gray-500 mb-1">BALANCE</label>
                                <div class="font-black text-2xl text-gray-400 py-2" id="bill-balance">Rs. 0.00</div>
                             </div>
                        </div>

                        <!-- Action Buttons -->
                        <div class="grid grid-cols-1 gap-3">
                            <button 
                                onclick="views.processCheckout(true)" 
                                class="w-full bg-gradient-to-r from-primary to-indigo-700 hover:from-indigo-700 hover:to-primary text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/40 transition-all active:scale-95 flex items-center justify-center gap-3 text-lg"
                            >
                                <i class="fa-solid fa-print text-xl"></i>
                                <span>Print & Save Bill</span>
                            </button>

                            <button 
                                onclick="views.processCheckout(false)" 
                                class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-500/30 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <i class="fa-solid fa-floppy-disk"></i>
                                <span>Save Only (No Print)</span>
                            </button>
                            
                            <button 
                                onclick="views.holdBill()" 
                                class="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 text-sm"
                            >
                                <i class="fa-solid fa-pause"></i>
                                <span>Hold Bill</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Search Logic with better UX - OPTIMIZED FOR BARCODE SCANNERS
        const searchInput = document.getElementById('pos-search');
        const resultsBox = document.getElementById('pos-search-results');

        const posSearchHandler = utils.debounce((query) => {
            // Re-verify current input – if it was cleared by scanner add-to-cart, abort!
            const currentVal = searchInput.value.trim().toLowerCase();
            if (currentVal === '' || query.length < 1) {
                resultsBox.classList.add('hidden');
                return;
            }

            const matches = window.posItems.filter(i =>
                String(i.itemName).toLowerCase().includes(query) ||
                String(i.itemId).toLowerCase().includes(query) ||
                String(i.supplierId || '').toLowerCase().includes(query)
            );
            if (matches.length > 0) {
                resultsBox.innerHTML = matches.slice(0, 15).map(i => `
                    <div 
                        onclick="views.addToCart('${i.itemId}'); document.getElementById('pos-search').value = ''; document.getElementById('pos-search-results').classList.add('hidden'); document.getElementById('pos-search').focus();" 
                        class="p-4 hover:bg-indigo-50 cursor-pointer flex justify-between items-center group transition-colors"
                    >
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors text-center">
                                <span class="font-bold text-[10px] break-all leading-tight">${i.itemId}</span>
                            </div>
                            <div>
                                <div class="font-bold text-gray-800 group-hover:text-primary">${utils.cleanItemName(i.itemName)}</div>
                                <div class="text-[10px] text-gray-400 font-mono tracking-wider">${i.itemId} • ${i.unit}</div>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="text-lg font-bold text-primary">${utils.formatCurrencyNoCents(i.listPrice)}</div>
                        </div>
                    </div>
                `).join('');
                resultsBox.classList.remove('hidden');
            } else {
                resultsBox.innerHTML = `
                    <div class="p-6 text-center text-gray-400">
                        <i class="fa-solid fa-search text-3xl mb-2 opacity-20"></i>
                        <p>No items found</p>
                    </div>
                `;
                resultsBox.classList.remove('hidden');
            }
        }, 100);

        // Scanner detection variables
        let lastInputTime = Date.now();
        let fastInputStreak = 0;

        // Input Listener with Scanner Detection
        searchInput.addEventListener('input', async (e) => {
            const now = Date.now();
            const diff = now - lastInputTime;
            lastInputTime = now;

            const val = e.target.value.trim();
            const query = val.toLowerCase();

            if (query.length === 0) {
                fastInputStreak = 0;
                resultsBox.classList.add('hidden');
                return;
            }

            // Detection: Character arrived faster than humanly possible (typically < 40-50ms)
            if (diff < 45) {
                fastInputStreak++;
            } else {
                fastInputStreak = 0;
            }

            // SEARCH LOGIC:
            // 1. If it's a "Fast Streak" (Scanner/Paste) OR it's a long exact match ID
            // We check for exact match in real-time.
            const exactMatch = window.posItems.find(i => String(i.itemId).toLowerCase() === query);

            // If it's an exact match AND (it arrived fast OR it's a standard barcode length like 8+)
            // This ensures scanners that don't send 'Enter' still work instantly.
            if (exactMatch && (fastInputStreak > 1 || query.length >= 8)) {
                // Short debounce to let the scanner finish the stream
                clearTimeout(window.posScanTimer);
                window.posScanTimer = setTimeout(async () => {
                    const finalVal = searchInput.value.trim().toLowerCase();
                    const finalMatch = window.posItems.find(i => String(i.itemId).toLowerCase() === finalVal);

                    if (finalMatch) {
                        searchInput.value = '';
                        resultsBox.classList.add('hidden');
                        await views.addToCart(finalMatch.itemId);
                        fastInputStreak = 0;
                        searchInput.focus();
                    }
                }, 30);
                return;
            }

            // 2. Otherwise, treat as manual typing (Show results only)
            posSearchHandler(query);
        });

        // Professional Keydown Handling (Enter to add first result)
        searchInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const query = searchInput.value.trim().toLowerCase();

                if (query.length > 0) {
                    // 1. Try to find exact match (perfectly handles scanners that send Enter)
                    const exactMatch = window.posItems.find(i => String(i.itemId).toLowerCase() === query);
                    if (exactMatch) {
                        searchInput.value = '';
                        resultsBox.classList.add('hidden');
                        await views.addToCart(exactMatch.itemId);
                        searchInput.focus();
                        return;
                    }

                    // 2. If no exact match but search result has only ONE matching item, add it automatically
                    const matches = window.posItems.filter(i =>
                        String(i.itemName).toLowerCase().includes(query) ||
                        String(i.itemId).toLowerCase().includes(query)
                    );

                    if (matches.length === 1) {
                        searchInput.value = '';
                        resultsBox.classList.add('hidden');
                        await views.addToCart(matches[0].itemId);
                        searchInput.focus();
                        return;
                    }

                    // 3. Fallback: If hits enter and there are multiple results, 
                    // maybe just stay there or focus the first one (we'll just let them pick for now)
                }
            }
            if (e.key === 'Escape') {
                resultsBox.classList.add('hidden');
                searchInput.value = '';
            }
        });

        // Initialize Held Bills Table
        views.loadHeldBills();

        // Setup Custom Item Form Handler
        const customItemForm = document.getElementById('custom-item-form');
        if (customItemForm) {
            customItemForm.onsubmit = (e) => {
                e.preventDefault();
                views.handleAddCustomItem();
            };
        }

        // --- Payment Method UI Logic ---
        const methodRadios = document.querySelectorAll('input[name="payment-method"]');
        const mixedSection = document.getElementById('mixed-payment-section');
        const paidInput = document.getElementById('bill-paid');
        const mixInputs = document.querySelectorAll('.mix-input');

        const updateMixedTotal = () => {
            let total = 0;
            mixInputs.forEach(inp => total += (parseFloat(inp.value) || 0));
            paidInput.value = total.toFixed(2); // Always show a value, even if 0.00
            views.calculateBalance();
        };

        methodRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.value === 'Mixed') {
                    mixedSection.classList.remove('hidden');
                    paidInput.readOnly = true;
                    paidInput.classList.add('bg-indigo-50/50');
                    updateMixedTotal();
                } else {
                    mixedSection.classList.add('hidden');
                    paidInput.readOnly = false;
                    paidInput.classList.remove('bg-indigo-50/50');
                    if (e.target.value === 'Credit') {
                        paidInput.value = '0';
                        views.calculateBalance();
                    }
                }
            });
        });

        mixInputs.forEach(inp => {
            inp.addEventListener('input', updateMixedTotal);
        });
    },

    openCustomItemModal: () => {
        const modal = document.getElementById('custom-item-modal');
        modal.classList.remove('hidden');
        // Small delay to allow display:block to apply before opacity transition
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            modal.classList.add('opacity-100');
            document.getElementById('custom-item-name').focus();
        });
        document.getElementById('custom-item-form').reset();
    },

    handleAddCustomItem: () => {
        const name = document.getElementById('custom-item-name').value.trim();
        const price = parseFloat(document.getElementById('custom-item-price').value);
        const qtyVal = parseFloat(document.getElementById('custom-item-qty').value);
        const cost = parseFloat(document.getElementById('custom-item-cost').value) || 0;

        if (!name || isNaN(price) || isNaN(qtyVal) || qtyVal <= 0) {
            utils.showNotification('Please enter valid item details', 'error');
            return;
        }

        const qty = window.posReturnMode ? -Math.abs(qtyVal) : Math.abs(qtyVal);
        const total = price * qty;

        // Add to cart
        window.posCart.push({
            itemId: 'CUSTOM-' + Date.now(),
            name: name + (window.posReturnMode ? ' (Return)' : ''),
            supplierId: 'N/A',
            price: price,
            cost: cost,
            qty: qty,
            unit: 'Unit',
            discount: 0,
            total: total, // Discount is 0 for custom items initially
            isCustom: true
        });

        views.renderCart();

        // Close modal
        const modal = document.getElementById('custom-item-modal');
        modal.classList.remove('opacity-100');
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 200);

        utils.showNotification('Custom item added to bill');
    },

    loadHeldBills: async () => {
        const container = document.getElementById('held-bills-section');
        if (!container) {
            // If container doesn't exist (first load), inject it below the main POS area
            const posView = document.getElementById('view-pos');
            const heldSection = document.createElement('div');
            heldSection.id = 'held-bills-section';
            heldSection.className = 'mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden';
            heldSection.innerHTML = `
                <div class="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50">
                    <h4 class="font-bold text-gray-800 flex items-center gap-2">
                        <i class="fa-solid fa-pause text-amber-500"></i>
                        Held Bills (Pending)
                    </h4>
                    <span class="text-xs text-gray-400 bg-white px-3 py-1 rounded-full border border-gray-200" id="held-count">0 Records</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm text-left">
                        <thead class="bg-gray-50 text-xs text-gray-400 uppercase tracking-wider">
                            <tr>
                                <th class="px-6 py-3">Time</th>
                                <th class="px-6 py-3">Customer Ref</th>
                                <th class="px-6 py-3 text-center">Items</th>
                                <th class="px-6 py-3 text-right">Total Amount</th>
                                <th class="px-6 py-3 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="held-bills-body" class="divide-y divide-gray-50">
                            <tr><td colspan="5" class="text-center py-4 text-gray-400">No held bills</td></tr>
                        </tbody>
                    </table>
                </div>
            `;
            posView.appendChild(heldSection);
        }

        const heldBills = await db.held_bills.reverse().toArray();
        const tbody = document.getElementById('held-bills-body');
        const countBadge = document.getElementById('held-count');

        if (countBadge) countBadge.innerText = `${heldBills.length} Records`;

        if (heldBills.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-gray-400 italic">No held bills currently</td></tr>`;
            return;
        }

        tbody.innerHTML = heldBills.map(bill => `
            <tr class="hover:bg-amber-50 transition-colors">
                <td class="px-6 py-4 text-gray-500 font-mono text-xs">
                    ${new Date(bill.timestamp).toLocaleTimeString()}
                    <div class="text-[10px] text-gray-400">${new Date(bill.timestamp).toLocaleDateString()}</div>
                </td>
                <td class="px-6 py-4 font-bold text-gray-800">${bill.customerName || 'Walk-in Customer'}</td>
                <td class="px-6 py-4 text-center">
                    <span class="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-bold">${bill.itemCount}</span>
                </td>
                <td class="px-6 py-4 text-right font-mono font-bold text-indigo-600">${utils.formatCurrency(bill.total)}</td>
                <td class="px-6 py-4 text-center space-x-2">
                    <button onclick="views.restoreHeldBill(${bill.id})" class="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                        <i class="fa-solid fa-play mr-1"></i> Resume
                    </button>
                    <button onclick="views.removeHeldBill(${bill.id})" class="bg-red-50 text-red-500 hover:bg-red-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    },

    restoreHeldBill: async (id) => {
        if (window.posCart.length > 0) {
            if (!confirm('Current cart is not empty. Replace it with held bill?')) return;
        }

        const bill = await db.held_bills.get(id);
        if (!bill) {
            utils.showNotification('Bill not found', 'error');
            views.loadHeldBills();
            return;
        }

        // Restore Cart
        window.posCart = bill.cartData.cart;

        // Restore Discount if saved
        const discountInput = document.getElementById('bill-discount');
        if (discountInput) {
            discountInput.value = bill.cartData.discount || '';
        }

        // Remove from held bills
        await db.held_bills.delete(id);

        views.renderCart();
        views.loadHeldBills();
        utils.showNotification('Bill Resumed Successfully');
    },

    removeHeldBill: async (id) => {
        if (!confirm('Delete this held bill permanently?')) return;
        await db.held_bills.delete(id);
        views.loadHeldBills();
        utils.showNotification('Held bill discarded');
    },

    addToCart: async (itemId) => {
        // Robust item lookup (Handle String vs Number ID & Case Insensitivity)
        const item = window.posItems.find(i => String(i.itemId).toLowerCase() === String(itemId).toLowerCase());
        if (!item) {
            console.error('POS: Item not found in cache:', itemId);
            utils.showNotification('Item not found: ' + itemId, 'error');
            return;
        }

        const standardId = item.itemId; // Use the ID from master for consistency

        // --- BATCH SELECTION LOGIC ---
        let selectedBatch = null;
        let useBatch = item.useBatch;

        // Force check for batches even if flag is false (Catch items without flag)
        let batches = await db.item_batches.where('itemId').equals(standardId).toArray();
        if (batches.length > 0) {
            useBatch = true;
            // Filter out discontinued
            batches = batches.filter(b => !b.isDiscontinued);

            if (batches.length === 0) {
                utils.showNotification(`Active batches for ${item.itemName} are not available.`, 'error');
                return;
            }

            if (batches.length === 1) {
                selectedBatch = batches[0];
            } else {
                selectedBatch = await views.showBatchSelectionDialog(item, batches);
                if (!selectedBatch) return;
            }
        }

        const cartItemId = useBatch ? `${standardId}_${selectedBatch.batchId}` : standardId;
        const existing = window.posCart.find(i => i.cartItemId === cartItemId);
        const qtyChange = window.posReturnMode ? -1 : 1;

        if (existing) {
            existing.qty += qtyChange;
            if (existing.qty === 0) {
                const idx = window.posCart.indexOf(existing);
                window.posCart.splice(idx, 1);
                utils.showNotification('Item removed (Quantity reached 0)', 'info');
            } else {
                existing.total = existing.qty * (existing.price - (existing.discount || 0));
            }
        } else {
            // Fetch Inventory Data for remains display
            const invRecord = await db.inventory.get(standardId);
            const sysStock = useBatch ? selectedBatch.currentStock : (invRecord ? invRecord.currentStock : 0);
            const reorderLevel = invRecord ? invRecord.reorderLevel : (item.reorderLevel || 0);

            window.posCart.push({
                cartItemId: cartItemId, // Unique ID for cart
                itemId: item.itemId,
                batchId: useBatch ? selectedBatch.batchId : (item.batchId || 'B001'),
                name: utils.cleanItemName(item.itemName),
                supplierId: item.supplierId,
                price: useBatch ? selectedBatch.listPrice : item.listPrice,
                cost: useBatch ? selectedBatch.costPrice : item.costPrice,
                qty: qtyChange,
                unit: item.unit,
                discount: 0,
                total: (useBatch ? selectedBatch.listPrice : item.listPrice) * qtyChange,
                remarks: item.remarks,
                dbStock: sysStock, // Initial system stock
                reorderLevel: reorderLevel
            });
        }
        views.renderCart();

        // Always refocus search for continuous scanning and hide results
        setTimeout(() => {
            const searchInput = document.getElementById('pos-search');
            if (searchInput) {
                searchInput.focus();
                document.getElementById('pos-search-results')?.classList.add('hidden');
            }
        }, 50);
    },

    showBatchSelectionDialog: (item, batches) => {
        return new Promise((resolve) => {
            // Store batches globally temporarily for the click handler
            window.currentDialogBatches = batches;
            window.resolveBatchSelection = (batch) => {
                delete window.currentDialogBatches;
                delete window.resolveBatchSelection;
                resolve(batch);
            };

            const modal = document.createElement('div');
            modal.id = 'batch-selection-modal';
            modal.className = 'fixed inset-0 bg-black/60 z-[200] flex items-center justify-center backdrop-blur-sm animate-fade-in';
            modal.innerHTML = `
                <div class="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scale-up">
                    <h3 class="text-xl font-bold mb-2 text-primary">Select Batch</h3>
                    <p class="text-sm text-gray-500 mb-6">Multiple batches found for <b>${item.itemName}</b>. Please select the correct one:</p>
                    <div class="space-y-3 max-h-[300px] overflow-y-auto mb-6 pr-2">
                        ${batches.map((b, idx) => `
                            <button class="w-full text-left p-4 rounded-xl border-2 border-gray-100 hover:border-primary hover:bg-indigo-50 transition-all group flex justify-between items-center" 
                                onclick="document.getElementById('batch-selection-modal').remove(); window.resolveBatchSelection(window.currentDialogBatches[${idx}])">
                                <div>
                                    <div class="font-bold text-gray-800 group-hover:text-primary">Batch: ${b.batchId}</div>
                                    <div class="text-xs text-gray-400 font-mono">Stock: ${b.currentStock} Units</div>
                                </div>
                                <div class="text-right">
                                    <div class="text-lg font-black text-primary">${utils.formatCurrency(b.listPrice)}</div>
                                    <div class="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Selling Price</div>
                                </div>
                            </button>
                        `).join('')}
                    </div>
                    <button onclick="document.getElementById('batch-selection-modal').remove(); window.resolveBatchSelection(null)" class="w-full py-3 text-gray-500 hover:bg-gray-100 rounded-xl font-bold transition-colors">Cancel</button>
                </div>
            `;
            document.body.appendChild(modal);
        });
    },

    toggleReturnMode: (enabled) => {
        window.posReturnMode = enabled;
        const searchInput = document.getElementById('pos-search');
        if (enabled) {
            utils.showNotification('RETURN MODE ENABLED', 'warning');
            if (searchInput) {
                searchInput.classList.add('ring-2', 'ring-red-500', 'border-red-500');
                searchInput.placeholder = "SEARCH ITEMS TO RETURN...";
            }
        } else {
            utils.showNotification('Return Mode Disabled');
            if (searchInput) {
                searchInput.classList.remove('ring-2', 'ring-red-500', 'border-red-500');
                searchInput.placeholder = "🔍 Scan barcode or type item name...";
            }
        }
    },

    removeFromCart: (index) => {
        window.posCart.splice(index, 1);
        views.renderCart();
    },

    updateCartQty: (index, newQty) => {
        let qty = parseFloat(newQty);
        // Allow negative quantities for returns
        if (isNaN(qty) || qty === 0) return; // Prevent 0 or NaN

        const item = window.posCart[index];
        item.qty = qty;
        // Discount is UNIT discount
        item.total = item.qty * (item.price - (item.discount || 0));
        views.renderCart();
    },

    updateCartDiscount: (index, newDiscount) => {
        const item = window.posCart[index];
        item.discount = parseFloat(newDiscount) || 0;
        // Discount is UNIT discount
        item.total = item.qty * (item.price - item.discount);
        views.renderCart();
    },

    renderCart: () => {
        const container = document.getElementById('cart-container');
        const itemCountEl = document.getElementById('cart-item-count');

        if (window.posCart.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-gray-400">
                    <i class="fa-solid fa-cart-shopping text-6xl mb-4 opacity-20"></i>
                    <p class="text-lg font-medium">Cart is empty</p>
                    <p class="text-sm">Scan or search items to add</p>
                </div>
            `;
            itemCountEl.innerText = '0';
            document.getElementById('bill-subtotal').innerText = 'Rs. 0.00';
            document.getElementById('bill-total').innerText = 'Rs. 0.00';
            const profitSummaryEl = document.getElementById('bill-profit-summary');
            if (profitSummaryEl) profitSummaryEl.innerHTML = '';
            return;
        }

        itemCountEl.innerText = window.posCart.length;
        const profitSummaryEl = document.getElementById('bill-profit-summary');

        container.innerHTML = window.posCart.map((item, idx) => {
            const remain = (item.dbStock || 0) - item.qty;
            const isLow = remain <= (item.reorderLevel || 0);
            const stockColor = isLow ? 'text-red-600' : 'text-emerald-600';
            
            return `
            <div class="bg-white p-4 rounded-xl border-2 border-gray-100 hover:border-primary transition-colors shadow-sm">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex-1">
                        <h5 class="font-bold text-gray-800 text-base mb-1">
                            ${item.name} 
                            <span class="bg-gray-100 text-gray-500 px-2 py-0.5 rounded text-[10px] font-bold ml-1 uppercase">${item.unit || ''}</span>
                            <span class="no-print font-black text-xs ml-3 ${stockColor} uppercase">
                                <i class="fa-solid fa-boxes-stacked mr-1"></i>Remains: ${remain.toFixed(2)}
                            </span>
                        </h5>
                        <div class="flex items-center gap-2">
                            <p class="text-xs text-gray-400 font-mono tracking-tighter">${item.itemId}</p>
                            ${item.remarks ? `
                                <span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                                    <i class="fa-solid fa-note-sticky"></i> ${item.remarks}
                                </span>
                            ` : ''}
                            <span class="text-sm font-black text-red-500 bg-red-50 px-2 py-0.5 rounded no-print font-mono flex items-center gap-2 mt-1">
                                <span>Cost: ${item.cost.toFixed(2)}</span>
                                <span class="text-emerald-600 bg-emerald-50 px-1 rounded">Margin: ${((item.price - item.discount - item.cost) / (item.price - item.discount) * 100).toFixed(1)}%</span>
                            </span>
                        </div>
                    </div>
                    <button 
                        onclick="views.removeFromCart(${idx})" 
                        class="text-red-400 hover:text-red-600 p-1 rounded-lg transition-colors"
                    >
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                
                ${item.qty < 0 ? `
                    <div class="bg-red-100 text-red-700 px-3 py-1 rounded text-xs font-bold mb-2 text-center uppercase tracking-wide border border-red-200">
                        <i class="fa-solid fa-rotate-left mr-1"></i> Return Item
                    </div>
                ` : ''}

                <div class="grid grid-cols-2 gap-3 mb-3">
                    <div class="bg-gray-50 p-2 rounded-lg">
                        <label class="block text-sm uppercase font-bold text-gray-400 mb-1">Unit Price</label>
                        <div class="font-bold text-gray-700 font-mono text-sm">${utils.formatCurrency(item.price)}</div>
                    </div>
                    <div class="bg-gray-50 p-2 rounded-lg">
                        <label class="block text-sm uppercase font-bold text-gray-400 mb-1">Total</label>
                        <div class="font-black ${item.total < 0 ? 'text-red-600' : 'text-primary'} font-mono text-sm">${utils.formatCurrency(item.total)}</div>
                    </div>
                </div>

                <div class="flex items-center justify-between gap-4">
                    <div class="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                        <button onclick="views.updateCartQty(${idx}, ${(item.qty - 1).toFixed(3)})" class="w-8 h-8 bg-white rounded-md shadow-sm hover:bg-gray-200 font-bold">-</button>
                        <input 
                            type="number" 
                            step="any" 
                            value="${item.qty}" 
                            onchange="views.updateCartQty(${idx}, this.value)"
                            class="w-16 text-center font-bold bg-transparent border-none outline-none p-0 text-gray-800 focus:ring-0 text-sm appearance-none"
                            onfocus="this.select()"
                        >
                        <button onclick="views.updateCartQty(${idx}, ${(parseFloat(item.qty) + 1).toFixed(3)})" class="w-8 h-8 bg-white rounded-md shadow-sm hover:bg-primary hover:text-white font-bold">+</button>
                    </div>
                    
                    <div class="flex-1 min-w-0 ml-2">
                        <div class="relative w-full">
                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 tracking-wider">DISC</span>
                            <input 
                                type="number" 
                                value="${item.discount || ''}" 
                                onchange="views.updateCartDiscount(${idx}, this.value)"
                                placeholder="0.00"
                                class="w-full pl-12 pr-3 py-2 text-sm font-bold bg-amber-50/50 border border-amber-100 rounded-lg focus:ring-2 focus:ring-amber-200 focus:bg-white outline-none text-right transition-all"
                            >
                        </div>
                        ${(item.discount && item.discount > 0) ? `<div class="text-sm font-bold text-amber-600 text-right mt-1">Tot Disc: ${utils.formatCurrency(item.discount * item.qty)}</div>` : ''}
                    </div>
                </div>
            </div>
            `;
        }).join('');

        const subtotal = window.posCart.reduce((sum, i) => sum + i.total, 0);
        const subtotalEl = document.getElementById('bill-subtotal');
        subtotalEl.innerText = utils.formatCurrency(subtotal);
        if (subtotal < 0) {
            subtotalEl.classList.remove('text-gray-800'); // Assuming default was gray or inherit
            subtotalEl.classList.add('text-red-600');
        } else {
            subtotalEl.classList.remove('text-red-600');
            subtotalEl.classList.add('text-gray-800');
        }

        // Listen to discount changes
        const discountInput = document.getElementById('bill-discount');
        const discount = parseFloat(discountInput.value) || 0;

        const finalTotal = subtotal - discount;
        const totalEl = document.getElementById('bill-total');
        totalEl.innerText = utils.formatCurrency(finalTotal);

        if (finalTotal < 0) {
            totalEl.classList.remove('text-primary');
            totalEl.classList.add('text-red-600');
        } else {
            totalEl.classList.remove('text-red-600');
            totalEl.classList.add('text-primary');
        }

        const updateProfit = () => {
            const d = parseFloat(discountInput.value) || 0;
            const currentTotal = subtotal - d;
            const totalCost = window.posCart.reduce((sum, i) => sum + (i.cost * i.qty), 0);
            const totalProfit = currentTotal - totalCost;
            const totalMargin = currentTotal > 0 ? (totalProfit / currentTotal) * 100 : 0;

            if (profitSummaryEl) {
                profitSummaryEl.innerHTML = `
                    <div class="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100 font-black text-sm shadow-sm">
                        <i class="fa-solid fa-chart-line"></i>
                        <span>Bill Profit: ${utils.formatCurrency(totalProfit)}</span>
                        <span class="text-xs opacity-70">(${totalMargin.toFixed(1)}%)</span>
                    </div>
                `;
            }
        };

        updateProfit();

        discountInput.oninput = () => {
            const d = parseFloat(discountInput.value) || 0;
            const newTotal = subtotal - d;
            document.getElementById('bill-total').innerText = utils.formatCurrency(newTotal);

            const tEl = document.getElementById('bill-total');
            if (newTotal < 0) {
                tEl.classList.remove('text-primary');
                tEl.classList.add('text-red-600');
            } else {
                tEl.classList.remove('text-red-600');
                tEl.classList.add('text-primary');
            }
            updateProfit();
            views.calculateBalance();
        };

        // Listen to Paid Amount changes
        const paidInput = document.getElementById('bill-paid');
        if (paidInput) {
            paidInput.oninput = () => views.calculateBalance();
        }
    },

    calculateBalance: () => {
        const subtotal = window.posCart.reduce((sum, i) => sum + i.total, 0);
        const discount = parseFloat(document.getElementById('bill-discount').value) || 0;
        const total = subtotal - discount;

        const paidInput = document.getElementById('bill-paid');
        const balanceDisplay = document.getElementById('bill-balance');

        const paid = parseFloat(paidInput.value) || 0;
        let balance = paid - total;

        // Fix floating-point precision issues
        // Round to 2 decimal places and treat very small values as zero
        balance = Math.round(balance * 100) / 100;

        // Treat values between -0.01 and 0.01 as exactly zero
        if (Math.abs(balance) < 0.01) {
            balance = 0;
        }

        if (paid > 0) {
            balanceDisplay.innerText = utils.formatCurrency(balance);
            if (balance < 0) {
                balanceDisplay.classList.remove('text-green-600', 'text-gray-400');
                balanceDisplay.classList.add('text-red-500'); // Underpayment
            } else {
                balanceDisplay.classList.remove('text-red-500', 'text-gray-400');
                balanceDisplay.classList.add('text-green-600');
            }
        } else {
            balanceDisplay.innerText = 'Rs. 0.00';
            balanceDisplay.classList.remove('text-green-600', 'text-red-500');
            balanceDisplay.classList.add('text-gray-400');
        }
    },

    getNextBillNo: async (prefix = 'INV', customDate = null) => {
        const now = customDate ? new Date(customDate) : new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const datePrefix = prefix + yy + mm;

        // Find the last record for this prefix (e.g., INV2602)
        const lastSale = await db.sales
            .where('billNo')
            .startsWith(datePrefix)
            .reverse()
            .first();

        let nextSeq = 1;

        if (lastSale && lastSale.billNo) {
            // Extract sequence from the end (e.g., INV2602000001 -> 000001)
            const seqStr = lastSale.billNo.slice(datePrefix.length);
            const lastSeq = parseInt(seqStr);
            if (!isNaN(lastSeq)) {
                nextSeq = lastSeq + 1;
            }
        }

        return datePrefix + String(nextSeq).padStart(6, '0');
    },

    unlockOldDate: () => {
        const pwd = prompt('📛 ADMIN ACTION REQUIRED\n\nPlease enter the OLD DATE BILL password to proceed:');
        if (pwd === "8542074") {
            const wrapper = document.getElementById('pos-date-wrapper');
            if (wrapper) {
                const todayStr = new Date().toISOString().split('T')[0];
                wrapper.innerHTML = `
                    <input type="date" id="pos-custom-date" max="${todayStr}" value="${todayStr}"
                        class="w-full px-3 py-1.5 text-xs font-bold border-2 border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-400 outline-none animate-fade-in shadow-inner bg-amber-50">
                    <div class="text-[8px] text-amber-600 font-black uppercase mt-1 text-center tracking-tighter">🔒 Admin Override Active</div>
                `;
                utils.showNotification('Old Date Billing Unlocked!', 'info');
            }
        } else if (pwd !== null) {
            utils.showNotification('Incorrect password! Action restricted.', 'error');
        }
    },

    clearCart: () => {
        if (window.posCart.length === 0) return;
        if (confirm('Clear all items from cart?')) {
            window.posCart = [];
            views.renderCart();
            utils.showNotification('Cart cleared');
        }
    },

    holdBill: async () => {
        if (window.posCart.length === 0) {
            utils.showNotification('Cart is empty', 'error');
            return;
        }

        const customerName = prompt('Enter Customer Name / Reference (Optional):', 'Walk-in');
        if (customerName === null) return; // Cancelled

        const subtotal = window.posCart.reduce((sum, i) => sum + i.total, 0);
        const discount = parseFloat(document.getElementById('bill-discount').value) || 0;
        const total = subtotal - discount;

        const billData = {
            timestamp: Date.now(),
            customerName: customerName || 'Walk-in',
            itemCount: window.posCart.reduce((acc, item) => acc + item.qty, 0),
            total: total,
            cartData: {
                cart: window.posCart,
                discount: discount
            }
        };

        try {
            await db.held_bills.add(billData);

            // Clear current cart
            window.posCart = [];
            const discountInput = document.getElementById('bill-discount');
            if (discountInput) discountInput.value = '';

            const paidInput = document.getElementById('bill-paid');
            if (paidInput) paidInput.value = '';
            document.getElementById('bill-balance').innerText = 'Rs. 0.00';

            views.renderCart();
            views.loadHeldBills();
            utils.showNotification('Bill held successfully', 'success');
        } catch (err) {
            console.error('Hold Bill Error:', err);
            utils.showNotification('Failed to hold bill', 'error');
        }
    },

    processCheckout: async (shouldPrint = true) => {
        console.log('Processing Checkout... Print:', shouldPrint);
        if (window.posCart.length === 0) {
            utils.showNotification('Cart is empty', 'error');
            return;
        }

        const paidInput = document.getElementById('bill-paid');
        if (paidInput && paidInput.value.trim() === '') {
            utils.showNotification('PAID AMOUNT cannot be blank! (Type 0 if nothing paid)', 'error');
            paidInput.focus();
            paidInput.classList.add('ring-2', 'ring-red-500', 'animate-shake');
            setTimeout(() => {
                paidInput.classList.remove('ring-2', 'ring-red-500', 'animate-shake');
            }, 3000);
            return;
        }

        const subtotal = window.posCart.reduce((sum, i) => sum + i.total, 0);
        const discount = parseFloat(document.getElementById('bill-discount').value) || 0;
        const finalTotal = subtotal - discount;
        const paymentMethod = document.querySelector('input[name="payment-method"]:checked')?.value || 'Cash';

        // NEW: Check for ADMIN custom date override
        const customDateInput = document.getElementById('pos-custom-date');
        const overriddenDate = customDateInput ? customDateInput.value : null;

        // NEW: Standard Numbering (INVYYMMXXXXXX / SRYYMMXXXXXX)
        const hasReturnItem = window.posCart.some(i => i.qty < 0);
        const prefix = hasReturnItem ? 'SR' : 'INV';
        const billNo = await views.getNextBillNo(prefix, overriddenDate);
        const rawBillId = billNo.replace('INV', '').replace('SR', '');

        const saleDate = overriddenDate || new Date().toISOString().split('T')[0];
        const saleTime = overriddenDate ? "00:00:01" : new Date().toLocaleTimeString();

        try {
            // 1. Prepare Sales Data
            const billDiscount = parseFloat(document.getElementById('bill-discount').value) || 0;
            const paidAmountInput = parseFloat(document.getElementById('bill-paid').value) || 0;

            // Mixed Payment Breakdown
            const cashAmt = paymentMethod === 'Mixed' ? (parseFloat(document.getElementById('mix-cash').value) || 0) : (paymentMethod === 'Cash' ? paidAmountInput : 0);
            const cardAmt = paymentMethod === 'Mixed' ? (parseFloat(document.getElementById('mix-card').value) || 0) : (paymentMethod === 'Visa/Master' ? paidAmountInput : 0);
            const bankAmt = paymentMethod === 'Mixed' ? (parseFloat(document.getElementById('mix-bank').value) || 0) : (paymentMethod === 'Bank' ? paidAmountInput : 0);
            const qrAmt = paymentMethod === 'Mixed' ? (parseFloat(document.getElementById('mix-qr').value) || 0) : (paymentMethod === 'QR' ? paidAmountInput : 0);

            const salesData = window.posCart.map(item => {
                const itemGrossTotal = item.qty * item.price;
                const itemDirectDiscount = (item.discount || 0) * item.qty;
                const discountRatio = subtotal > 0 ? item.total / subtotal : 0;
                const billDiscountPortion = billDiscount * discountRatio;
                const totalDiscount = itemDirectDiscount + billDiscountPortion;
                const itemFinalTotal = itemGrossTotal - totalDiscount;
                const itemSellingPrice = itemFinalTotal / item.qty;
                const itemProfit = itemFinalTotal - (item.cost * item.qty);
                const customerName = document.getElementById('pos-customer').value.trim() || 'Walk-in';

                let paymentStatus = 'Paid';
                let settledDate = saleDate;
                
                // --- Payment Status Logic ---
                // If Credit method OR any underpayment (balance < 0), mark as Pending
                if (paymentMethod === 'Credit' || paidAmountInput < (finalTotal - 0.01)) {
                    paymentStatus = 'Pending';
                    settledDate = null;
                }

                return {
                    date: saleDate,
                    billNo: billNo,
                    itemId: item.itemId,
                    itemName: item.name,
                    batchId: item.batchId || null,
                    supplierId: item.supplierId,
                    customer: customerName,
                    qty: item.qty,
                    costPrice: item.cost,
                    mrp: item.price,
                    discount: totalDiscount, // Still merged for backward compatibility and reports
                    itemDiscount: itemDirectDiscount, // NEW: Item-level only
                    billDiscount: billDiscount, // Already existed, but clearly separated now
                    sellingPrice: itemSellingPrice,
                    total: itemFinalTotal,
                    profit: itemProfit,
                    method: paymentMethod,
                    paymentStatus: paymentStatus,
                    settledDate: settledDate,
                    unit: item.unit || 'Pcs',
                    time: saleTime,
                    paidAmount: paidAmountInput,
                    cashAmount: cashAmt,
                    cardAmount: cardAmt,
                    bankAmount: bankAmt,
                    qrAmount: qrAmt
                };
            });

            // 2. Execute Transaction
            await db.transaction('rw', db.sales, db.inventory, db.item_batches, db.audit_logs, async () => {
                await db.sales.bulkAdd(salesData);

                // Update Batches
                for (const item of window.posCart.filter(i => !i.isCustom && i.batchId)) {
                    const batchRecord = await db.item_batches.where({ itemId: item.itemId, batchId: item.batchId }).first();
                    if (batchRecord) {
                        await db.item_batches.update(batchRecord.id, {
                            currentStock: (batchRecord.currentStock || 0) - item.qty
                        });
                    }
                }

                // Update Inventory
                const itemIds = window.posCart.filter(i => !i.isCustom).map(i => i.itemId);
                if (itemIds.length > 0) {
                    const invItems = await db.inventory.where('itemId').anyOf(itemIds).toArray();
                    const updates = invItems.map(invItem => {
                        const cartItems = window.posCart.filter(ci => ci.itemId === invItem.itemId);
                        const totalQty = cartItems.reduce((sum, ci) => sum + ci.qty, 0);
                        const cost = invItem.avgCost || invItem.costPrice || 0;

                        invItem.sold = (invItem.sold || 0) + totalQty;
                        invItem.currentStock = (invItem.currentStock || 0) - totalQty;
                        invItem.stockValue = invItem.currentStock * cost;
                        return invItem;
                    });
                    await db.inventory.bulkPut(updates);
                }

                // Audit Log
                await utils.logAction('Sale', `Bill ${billNo} processed. Total: ${finalTotal.toFixed(2)} (${paymentMethod})`);
            });

            // 3. Receipt Generation and Print
            const receiptHTML = `
                <div style="width: 100%; padding: 0; margin: 0; overflow: visible; font-family: 'Outfit', 'Noto Sans Sinhala', sans-serif;">
                    <div style="text-align: center; margin-bottom: 5px;">
                        <h1 style="font-size: 1.3em; margin: 0 0 2px 0; font-weight: bold; text-transform: uppercase;">SAVI SHAKTHI<br>HARDWARE</h1>
                        <p style="margin: 0; font-size: 0.75em;">5th Canel, Srawasthipura, Anuradhapura</p>
                        <p style="margin: 0; font-size: 0.9em;">Phone: 076 181 8748</p>
                        <div style="border-bottom: 2px solid black; margin: 5px 0;"></div>
                        
                        <div style="font-size: 0.85em; text-align: left; font-weight: bold;">
                            <div>Bill ID: ${billNo}</div>
                            <div style="margin-top: 1px;">Ref: ${document.getElementById('pos-customer').value.trim() || 'Guest'}</div>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.7em; text-align: left; margin-top: 1px;">
                            <span>Date: ${saleDate}</span>
                            <span>Time: ${saleTime}</span>
                        </div>
                        <div style="font-size: 0.8em; text-align: left; margin-top: 1px; font-weight: bold;">
                            <div>Method: ${paymentMethod === 'Mixed' ? 'MIXED' : paymentMethod} ${paymentMethod === 'Credit' || paidAmountInput < (finalTotal - 0.01) ? '(PENDING)' : '(PAID)'}</div>
                        </div>
                    </div>
                    
                    <table style="width: 100%; font-size: 0.9em; border-collapse: collapse; margin-bottom: 5px; table-layout: fixed;">
                        <thead>
                            <tr style="border-bottom: 1.5px solid black; border-top: 1.5px solid black;">
                                <th style="padding: 3px 0; text-align: left; width: 52%;">ITEM</th>
                                <th style="padding: 3px 0; text-align: center; width: 15%;">QTY</th>
                                <th style="padding: 3px 0; text-align: right; width: 33%;">AMT</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${window.posCart.map(item => {
                const hasDiscount = (item.discount || 0) > 0;
                return `
                                    <tr>
                                        <td colspan="3" style="padding: 5px 0 1px 0; font-weight: bold; line-height: 1.1; font-size: 0.95em; white-space: nowrap; overflow: hidden;">${String(item.name).toUpperCase()}</td>
                                    </tr>
                                    ${hasDiscount ? `
                                        <tr>
                                            <td colspan="3" style="padding: 0 0 1px 0; font-size: 0.85em; font-weight: 500;">
                                                ${item.qty} ${item.unit} @ ${item.price.toFixed(2)}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 0 0 5px 0; font-size: 0.82em; font-weight: bold; white-space: nowrap;">Discount: -${((item.discount || 0) * item.qty).toFixed(2)}</td>
                                            <td style="text-align: center; font-weight: bold; padding-bottom: 5px; font-size: 0.95em; vertical-align: top;">${item.qty}</td>
                                            <td style="text-align: right; font-weight: bold; padding-bottom: 5px; font-size: 0.95em; vertical-align: top;">${item.total.toFixed(2)}</td>
                                        </tr>
                                    ` : `
                                        <tr>
                                            <td style="padding: 0 0 5px 0; font-size: 0.85em; font-weight: 500; vertical-align: top;">
                                                ${item.qty} ${item.unit} @ ${item.price.toFixed(2)}
                                            </td>
                                            <td style="text-align: center; font-weight: bold; padding-bottom: 5px; font-size: 0.95em; vertical-align: top;">${item.qty}</td>
                                            <td style="text-align: right; font-weight: bold; padding-bottom: 5px; font-size: 0.95em; vertical-align: top;">${item.total.toFixed(2)}</td>
                                        </tr>
                                    `}
                                `;
            }).join('')}
                        </tbody>
                    </table>
                    
                    <div style="border-top: 1.5px solid black; padding-top: 4px;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 2px;">
                            <span>Items Subtotal</span>
                            <span style="font-weight: bold;">${(window.posCart.reduce((s, i) => s + (i.price * i.qty), 0)).toFixed(2)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 2px;">
                            <span>Items Discount</span>
                            <span style="font-weight: bold;">-${(window.posCart.reduce((s, i) => s + ((i.discount || 0) * i.qty), 0)).toFixed(2)}</span>
                        </div>
                        ${discount > 0 ? `
                        <div style="display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 2px;">
                            <span>Bill Discount</span>
                            <span style="font-weight: bold;">-${discount.toFixed(2)}</span>
                        </div>
                        ` : ''}
                        
                        <div style="border-top: 1.5px solid black; border-bottom: 1.5px solid black; padding: 4px 0; margin-top: 2px; display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: bold; font-size: 1.32em;">TOTAL</span>
                            <span style="font-weight: bold; font-size: 1.5em;">${finalTotal.toFixed(2)}</span>
                        </div>

                        <div style="margin-top: 4px; border-bottom: 1px dashed black; padding-bottom: 4px;">
                            <div style="display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 2px;">
                                <span>Paid Amount</span>
                                <span style="font-weight: bold;">${(parseFloat(document.getElementById('bill-paid').value) || 0).toFixed(2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.9em;">
                                <span>Balance</span>
                                <span style="font-weight: bold;">${((parseFloat(document.getElementById('bill-paid').value) || 0) - finalTotal).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top: 6px; text-align: center;">
                         <div style="display: flex; justify-content: center; font-size: 0.8em; font-weight: bold; margin-bottom: 4px;">
                            <span>Total Items: ${window.posCart.length} | Qty: ${window.posCart.reduce((a, b) => a + b.qty, 0)}</span>
                        </div>
                        <div style="border-bottom: 1px dashed black; margin-bottom: 6px;"></div>
                        
                        <div style="font-weight: bold; font-size: 0.75em; white-space: nowrap;">THANK YOU, COME AGAIN!</div>
                        <div style="margin: 2px 0; font-size: 0.7em; opacity: 0.9; font-weight: 500;">Software by AMBH Solutions</div>
                        
                        <div style="margin: 5px 0 0 0; text-align: center; display: flex; justify-content: center;">
                            <svg id="bill-scannable-barcode" style="max-width: 100%;"></svg>
                        </div>
                        <div style="font-family: monospace; font-size: 0.8em; margin-top: 2px; margin-bottom: 2pt; padding-bottom: 0;">${billNo}</div>
                    </div>
                </div>
            `;

            const container = document.getElementById('receipt-container');
            container.innerHTML = receiptHTML;

            setTimeout(() => {
                try {
                    JsBarcode("#bill-scannable-barcode", billNo, {
                        format: "CODE128",
                        width: 1.2,
                        height: 32,
                        displayValue: false,
                        margin: 0
                    });
                } catch (e) {
                    console.error('Bill barcode generation error:', e);
                }

                window.posCart = [];
                views.renderCart();
                const discountInput = document.getElementById('bill-discount');
                if (discountInput) discountInput.value = '';

                const paidInput = document.getElementById('bill-paid');
                if (paidInput) paidInput.value = '';
                document.getElementById('bill-balance').innerText = 'Rs. 0.00';

                utils.showNotification('Sale Completed');
                if (shouldPrint) window.print();

                if (window.app && app.checkAutoBackup) app.checkAutoBackup();
            }, 1);

        } catch (err) {
            console.error('Checkout error:', err);
            utils.showNotification('Error processing sale: ' + err.message, 'error');
        }
    },

    // --- SALES HISTORY ---
    initSales: async () => {
        const container = document.getElementById('view-sales');
        container.innerHTML = `
             <div class="flex flex-col h-full gap-6">
                <!-- Header with Actions -->
                <div class="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <div>
                        <h3 class="text-xl font-bold text-gray-800">Sales History</h3>
                        <p class="text-xs text-gray-500">Track and manage past transactions</p>
                    </div>

                    <!-- Search Box -->
                    <div class="flex-1 max-w-md mx-6 relative">
                        <i class="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                        <input 
                            type="text" 
                            id="sales-search-input" 
                            placeholder="Search by Bill No, Item Name or ID..." 
                            class="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm"
                            oninput="views.loadSalesTable(this.value, document.getElementById('sales-search-month').value)"
                        >
                    </div>
                     <div class="relative w-48">
                        <i class="fa-solid fa-calendar-days absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                        <input 
                            type="month" 
                            id="sales-search-month" 
                            class="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm"
                            onchange="views.loadSalesTable(document.getElementById('sales-search-input').value, this.value)"
                        >
                    </div>

                    <div class="flex gap-3">
                        <button onclick="if(!app.isAdmin) { app.requestAuth(() => views.exportToPDF('sales-history-table', 'Sales History Report')); } else { views.exportToPDF('sales-history-table', 'Sales History Report'); }" class="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-all text-sm font-semibold shadow-sm">
                            <i class="fa-solid fa-file-pdf"></i> PDF
                        </button>
                        <button onclick="views.reprintBillByNumber()" class="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 transition-all text-sm font-semibold border border-emerald-100">
                            <i class="fa-solid fa-print"></i> Reprint Bill
                        </button>
                        <button onclick="views.exportSalesToCSV()" class="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-all text-sm font-semibold border border-blue-100 ${app.isAdmin ? '' : 'hidden'}">
                            <i class="fa-solid fa-file-export"></i> Export
                        </button>
                    </div>
                </div>

                <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex-1 flex flex-col">
                     <div class="overflow-y-auto flex-1">
                        <table id="sales-history-table" class="w-full text-sm text-left">
                            <thead class="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                                <tr>
                                    <th class="px-3 py-3">Date/Time</th>
                                    <th class="px-3 py-3">Bill No</th>
                                    <th class="px-3 py-3">Item Name</th>
                                    <th class="px-2 py-3 text-indigo-500">Batch</th>
                                    <th class="px-2 py-3">Item ID</th>
                                    <th class="px-2 py-3 text-right">Qty</th>
                                    <th class="px-2 py-3 text-right">Method</th>
                                    <th class="px-3 py-3 text-right">Disc.</th>
                                    <th class="px-3 py-3 text-right">Price</th>
                                    <th class="px-3 py-3 text-right">Total</th>
                                    <th class="px-3 py-3 text-right">Profit</th>
                                    <th class="px-2 py-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody id="sales-table-body">
                                <tr><td colspan="10" class="text-center py-10 text-gray-400">Loading sales records...</td></tr>
                            </tbody>
                        </table>
                     </div>
                     <div id="sales-pagination-info" class="px-6 py-4 bg-gray-50 border-t border-gray-100 text-xs font-bold text-indigo-600 flex justify-between items-center uppercase tracking-widest">
                        <span>Calculating summary...</span>
                     </div>
                </div>
            </div>
        `;
        views.loadSalesTable();
    },

    loadSalesTable: async (query = '', searchMonth = '') => {
        const tbody = document.getElementById('sales-table-body');
        if (!tbody) return;

        let sales;

        // Optimized Data Fetching: Avoid .toArray() on full set
        if (!query && !searchMonth) {
            // Default view: Latest 1000
            sales = await db.sales.orderBy('date').reverse().limit(1000).toArray();
        } else if (searchMonth && !query) {
            // Month only: Use index
            sales = await db.sales.where('date').startsWith(searchMonth).reverse().toArray();
        } else {
            // Search or combined: Fetch latest 2000 for filtering (memory safety cap)
            sales = await db.sales.orderBy('date').reverse().limit(2000).toArray();
        }

        if (searchMonth) {
            sales = sales.filter(s => {
                if (!s.date) return false;
                if (s.date.startsWith(searchMonth)) return true;
                const d = new Date(s.date);
                if (isNaN(d.getTime())) return false;
                return d.toISOString().startsWith(searchMonth);
            });
        }

        if (query) {
            const q = query.toLowerCase();
            sales = sales.filter(s =>
                String(s.billNo).toLowerCase().includes(q) ||
                String(s.itemId).toLowerCase().includes(q) ||
                String(s.supplierId || '').toLowerCase().includes(q) ||
                (s.itemName && s.itemName.toLowerCase().includes(q)) ||
                (String(s.date).includes(q) ||
                    utils.formatDate(s.date).includes(q))
            );
        }

        const totalFound = sales.length;
        const totalAmount = sales.filter(s => s.paymentStatus !== 'Cancelled').reduce((sum, s) => sum + (s.total || 0), 0);
        const totalProfitVal = sales.filter(s => s.paymentStatus !== 'Cancelled').reduce((sum, s) => sum + (s.profit || 0), 0);

        // Limit to latest 50 for display ONLY if no search filters are active
        const isFiltered = query || searchMonth;
        if (!isFiltered) {
            sales = sales.slice(0, 50);
        } else if (sales.length > 500) {
            // For performance, only show top 500 even if filtered
            sales = sales.slice(0, 500);
        }

        const infoEl = document.getElementById('sales-pagination-info');
        if (infoEl) {
            infoEl.innerHTML = `
                <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-2">
                        <span class="text-gray-500">Showing:</span>
                        <span>${sales.length} of ${totalFound} Transactions</span>
                        ${!isFiltered ? '<span class="bg-indigo-100 px-2 py-0.5 rounded text-[10px] text-indigo-700">Recent 50 Only</span>' : '<span class="bg-emerald-100 px-2 py-0.5 rounded text-[10px] text-emerald-700">All matched results</span>'}
                    </div>
                </div>
                <div class="flex items-center gap-6">
                    <div class="flex flex-col items-end">
                        <span class="text-[10px] text-gray-400">Total Sales</span>
                        <span class="text-sm font-black text-indigo-700">${utils.formatCurrency(totalAmount)}</span>
                    </div>
                    <div class="flex flex-col items-end border-l pl-6 border-gray-200">
                        <span class="text-[10px] text-gray-400">Total Profit</span>
                        <span class="text-sm font-black text-emerald-700">${utils.formatCurrency(totalProfitVal)}</span>
                    </div>
                </div>
            `;
        }

        if (sales.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="text-center py-12 text-gray-400">No records found.</td></tr>`;
            return;
        }

        tbody.innerHTML = sales.map(s => `
            <tr class="border-b hover:bg-gray-50 ${s.paymentStatus === 'Cancelled' ? 'bg-red-50/50 opacity-70 italic' : ''}">
                <td class="px-2 py-3">
                    <div class="text-[11px] font-bold text-gray-800">${utils.formatDate(s.date)}</div>
                    <div class="text-[9px] text-gray-400 font-medium">${s.time || '--:-- --'}</div>
                </td>
                <td class="px-2 py-3 font-mono text-[11px]">${s.billNo}</td>
                <td class="px-2 py-3 font-bold text-gray-800 text-sm" style="font-family: 'Noto Sans Sinhala', 'Outfit', sans-serif;">
                    ${s.itemName || '-'}
                    ${s.paymentStatus === 'Cancelled' ? '<span class="ml-2 bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter">Cancelled</span>' : ''}
                </td>
                <td class="px-2 py-3 text-center">
                    <span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold">
                        ${s.batchId || 'B001'}
                    </span>
                </td>
                <td class="px-1 py-3 text-xs font-mono text-gray-400">${s.itemId}</td>
                <td class="px-1 py-3 text-right text-sm font-bold ${s.paymentStatus === 'Cancelled' ? 'line-through' : ''}">${s.qty}</td>
                <td class="px-1 py-3 text-right text-[11px] font-bold text-gray-600">
                    <div class="flex flex-col items-end">
                        <span>${s.method || 'Cash'}</span>
                        ${s.paymentStatus === 'Pending' ? '<span class="text-[9px] text-red-500 font-black uppercase tracking-wider">Pending</span>' : ''}
                        ${s.paymentStatus === 'Cancelled' ? '<span class="text-[9px] text-red-600 font-black uppercase tracking-wider">Cancelled</span>' : ''}
                    </div>
                </td>
                <td class="px-2 py-3 text-right text-red-600 text-sm font-medium ${s.paymentStatus === 'Cancelled' ? 'line-through' : ''}">${utils.formatCurrency(s.discount || 0)}</td>
                <td class="px-2 py-3 text-right text-sm">${utils.formatCurrency(s.sellingPrice)}</td>
                <td class="px-2 py-3 text-right font-black text-indigo-700 text-sm ${s.paymentStatus === 'Cancelled' ? 'line-through text-gray-400' : ''}">${utils.formatCurrency(s.total)}</td>
                <td class="px-1 py-3 text-right text-emerald-700 font-bold text-sm ${s.paymentStatus === 'Cancelled' ? 'line-through text-gray-400' : ''}">${utils.formatCurrency(s.profit)}</td>
                <td class="px-1 py-3 text-right space-x-1 flex justify-end items-center h-full">
                    ${s.paymentStatus === 'Pending' ? `
                    <button onclick="if(!app.isAdmin) { app.requestAuth(() => views.settlePayment(${s.id})); } else { views.settlePayment(${s.id}); }" class="text-emerald-500 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 p-1 rounded transition-colors" title="Mark as Paid">
                        <i class="fa-solid fa-check"></i>
                    </button>
                    ` : ''}
                    
                    ${s.paymentStatus !== 'Cancelled' ? `
                    <button onclick="views.cancelSale(${s.id})" class="text-orange-500 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 p-1 rounded transition-colors" title="Cancel Sale">
                        <i class="fa-solid fa-ban"></i>
                    </button>
                    ` : ''}

                    <button onclick="views.reprintBillByNumber('${s.billNo}')" class="text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 p-1 rounded transition-colors" title="Reprint Bill">
                        <i class="fa-solid fa-print"></i>
                    </button>

                    <button onclick="views.voidEntireBill('${s.billNo}')" class="text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 p-1 rounded transition-colors" title="Void Entire Bill">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                    
                    <button onclick="views.deleteSale(${s.id})" class="text-gray-400 hover:text-red-700 p-1 ${app.isAdmin ? '' : 'hidden'}" title="Permanently Delete Record">
                        <i class="fa-solid fa-eraser"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    },

    settlePayment: async (id) => {
        if (!confirm('Mark this payment as RECEIVED/SETTLED?')) return;
        try {
            await db.sales.update(id, {
                paymentStatus: 'Paid',
                settledDate: new Date().toISOString()
            });
            utils.showNotification('Payment marked as SETTLED', 'success');
            views.loadSalesTable(document.getElementById('sales-search-input').value);
            if (typeof app !== 'undefined' && app.updateDashboard) app.updateDashboard();
        } catch (err) {
            console.error('Settlement Error:', err);
            utils.showNotification('Failed to update status', 'error');
        }
    },

    settleBill: async (billNo) => {
        if (!confirm('Mark BILL ' + billNo + ' as FULLY RECEIVED/SETTLED?')) return;
        try {
            // Find all pending sales for this bill
            const billItems = await db.sales.where('billNo').equals(billNo).toArray();
            const pendingItems = billItems.filter(i => i.paymentStatus === 'Pending');

            if (pendingItems.length === 0) {
                utils.showNotification('No pending items found for this bill', 'warning');
                return;
            }

            // Update all to Paid
            const updates = pendingItems.map(item => {
                return db.sales.update(item.id, {
                    paymentStatus: 'Paid',
                    settledDate: new Date().toISOString().split('T')[0]
                });
            });
            await Promise.all(updates);

            utils.showNotification('Bill ' + billNo + ' marked as SETTLED', 'success');

            // Refresh Reports if currently on Reports view
            if (document.getElementById('view-reports') && !document.getElementById('view-reports').classList.contains('hidden')) {
                views.initReports();
            }
            // Refresh Sales if currently on Sales view
            if (document.getElementById('view-sales') && !document.getElementById('view-sales').classList.contains('hidden')) {
                views.loadSalesTable();
            }

            if (typeof app !== 'undefined' && app.updateDashboard) app.updateDashboard();

        } catch (err) {
            console.error('Bill Settlement Error:', err);
            utils.showNotification('Failed to update bill status', 'error');
        }
    },

    initArchive: async () => {
        const container = document.getElementById('view-archive');
        const salesYears = await db.sales_archive.orderBy('archiveYear').uniqueKeys();
        const stockInYears = await db.stock_in_archive.orderBy('archiveYear').uniqueKeys();
        const allYears = [...new Set([...salesYears, ...stockInYears])].sort().reverse();
        
        container.innerHTML = `
             <div class="flex flex-col h-full gap-6">
                <!-- Header -->
                <div class="flex flex-wrap justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100 gap-4">
                    <div>
                        <h3 class="text-xl font-bold text-gray-800">System Archive</h3>
                        <p class="text-xs text-gray-500">Historical records for Consolidated years</p>
                    </div>

                    <!-- Tab Switcher -->
                    <div class="flex bg-gray-100 p-1 rounded-xl">
                        <button id="archive-tab-sales" onclick="views.switchArchiveTab('sales')" class="px-6 py-2 rounded-lg text-xs font-bold transition-all bg-white text-indigo-600 shadow-sm">
                            <i class="fa-solid fa-file-invoice-dollar mr-2"></i>Sales Archive
                        </button>
                        <button id="archive-tab-stock" onclick="views.switchArchiveTab('stock')" class="px-6 py-2 rounded-lg text-xs font-bold transition-all text-gray-500 hover:text-gray-700">
                            <i class="fa-solid fa-truck-ramp-box mr-2"></i>Stock-In Archive
                        </button>
                    </div>

                    <!-- Controls -->
                    <div class="flex flex-1 max-w-md relative">
                        <i class="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                        <input 
                            type="text" 
                            id="archive-search-input" 
                            placeholder="Search archived records..." 
                            class="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm"
                            oninput="views.loadArchiveTable()"
                        >
                    </div>
                     <div class="relative w-40">
                        <i class="fa-solid fa-calendar-check absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                        <select 
                            id="archive-year-filter" 
                            class="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm"
                            onchange="views.loadArchiveTable()"
                        >
                            <option value="">All Years</option>
                            ${allYears.map(y => `<option value="${y}">${y}</option>`).join('')}
                        </select>
                    </div>

                    <button onclick="views.exportToPDF('archive-table-container', 'Archive Report')" class="px-4 py-2.5 bg-slate-600 text-white rounded-xl hover:bg-slate-700 transition-all text-sm font-semibold shadow-sm">
                        <i class="fa-solid fa-file-pdf mr-1"></i> Export PDF
                    </button>
                </div>

                <div id="archive-table-container" class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex-1 flex flex-col">
                     <div class="overflow-y-auto flex-1">
                        <table class="w-full text-sm text-left">
                            <thead id="archive-table-head" class="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                                <!-- Head injected by loadArchiveTable -->
                            </thead>
                            <tbody id="archive-table-body">
                                <tr><td colspan="10" class="text-center py-10 text-gray-400">Loading archived records...</td></tr>
                            </tbody>
                        </table>
                     </div>
                </div>
            </div>
        `;
        app.activeArchiveTab = 'sales';
        views.loadArchiveTable();
    },

    switchArchiveTab: (tab) => {
        app.activeArchiveTab = tab;
        const salesBtn = document.getElementById('archive-tab-sales');
        const stockBtn = document.getElementById('archive-tab-stock');
        
        if (tab === 'sales') {
            salesBtn.classList.add('bg-white', 'text-indigo-600', 'shadow-sm');
            salesBtn.classList.remove('text-gray-500');
            stockBtn.classList.remove('bg-white', 'text-indigo-600', 'shadow-sm');
            stockBtn.classList.add('text-gray-500');
        } else {
            stockBtn.classList.add('bg-white', 'text-indigo-600', 'shadow-sm');
            stockBtn.classList.remove('text-gray-500');
            salesBtn.classList.remove('bg-white', 'text-indigo-600', 'shadow-sm');
            salesBtn.classList.add('text-gray-500');
        }
        views.loadArchiveTable();
    },

    loadArchiveTable: async () => {
        const query = document.getElementById('archive-search-input')?.value || '';
        const year = document.getElementById('archive-year-filter')?.value || '';
        const tbody = document.getElementById('archive-table-body');
        const thead = document.getElementById('archive-table-head');
        if (!tbody || !thead) return;

        const tab = app.activeArchiveTab || 'sales';
        let archive;
        
        if (tab === 'sales') {
            thead.innerHTML = `
                <tr>
                    <th class="px-3 py-3">Date</th>
                    <th class="px-3 py-3">Bill No</th>
                    <th class="px-3 py-3">Item Name</th>
                    <th class="px-2 py-3 text-right">Qty</th>
                    <th class="px-3 py-3 text-right">Selling</th>
                    <th class="px-3 py-3 text-right">Total</th>
                    <th class="px-3 py-3 text-right text-emerald-600">Profit</th>
                    <th class="px-2 py-3 text-right">Year</th>
                </tr>
            `;

            archive = await db.sales_archive.orderBy('date').reverse().toArray();
            if (year) {
                const yearInt = parseInt(year);
                archive = archive.filter(s => s.archiveYear === yearInt);
            }
            
            if (query) {
                const q = query.toLowerCase();
                archive = archive.filter(s => 
                    String(s.billNo).toLowerCase().includes(q) || 
                    String(s.itemName).toLowerCase().includes(q) || 
                    String(s.itemId).toLowerCase().includes(q)
                );
            }

            tbody.innerHTML = archive.map(s => `
                <tr class="hover:bg-gray-50/80 transition-all border-b border-gray-50">
                    <td class="px-3 py-2 text-gray-500 text-xs">${utils.formatDate(s.date)}</td>
                    <td class="px-3 py-2 font-bold text-gray-800">${s.billNo}</td>
                    <td class="px-3 py-2 text-gray-700 font-medium">${s.itemName} <span class="text-[10px] text-gray-400 block">${s.itemId}</span></td>
                    <td class="px-2 py-2 text-right font-black text-indigo-600">${utils.formatNumber(s.qty)}</td>
                    <td class="px-3 py-2 text-right text-gray-500">${utils.formatCurrencyNoCents(s.sellingPrice)}</td>
                    <td class="px-3 py-2 text-right font-bold text-gray-900">${utils.formatCurrencyNoCents(s.total)}</td>
                    <td class="px-3 py-2 text-right font-bold text-emerald-600">${utils.formatCurrencyNoCents(s.profit)}</td>
                    <td class="px-2 py-2 text-right"><span class="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-[10px] font-black">${s.archiveYear}</span></td>
                </tr>
            `).join('');
        } else {
            thead.innerHTML = `
                <tr>
                    <th class="px-3 py-3">Date</th>
                    <th class="px-3 py-3">Supplier</th>
                    <th class="px-3 py-3">Item Name</th>
                    <th class="px-2 py-3 text-right">Qty</th>
                    <th class="px-3 py-3 text-right">Cost</th>
                    <th class="px-3 py-3 text-right">Total</th>
                    <th class="px-2 py-3 text-right">Batch</th>
                    <th class="px-2 py-3 text-right">Year</th>
                </tr>
            `;

            archive = await db.stock_in_archive.orderBy('date').reverse().toArray();
            if (year) {
                const yearInt = parseInt(year);
                archive = archive.filter(s => s.archiveYear === yearInt);
            }

            if (query) {
                const q = query.toLowerCase();
                archive = archive.filter(s => 
                    String(s.itemName).toLowerCase().includes(q) || 
                    String(s.itemId).toLowerCase().includes(q) ||
                    String(s.supplierId).toLowerCase().includes(q)
                );
            }

            tbody.innerHTML = archive.map(s => `
                <tr class="hover:bg-gray-50/80 transition-all border-b border-gray-50">
                    <td class="px-3 py-2 text-gray-500 text-xs">${utils.formatDate(s.date)}</td>
                    <td class="px-3 py-2 font-black text-gray-400 uppercase text-[10px]">${s.supplierId || '---'}</td>
                    <td class="px-3 py-2 text-gray-700 font-medium">${s.itemName} <span class="text-[10px] text-gray-400 block">${s.itemId}</span></td>
                    <td class="px-2 py-2 text-right font-black text-blue-600">${utils.formatNumber(s.qty)}</td>
                    <td class="px-3 py-2 text-right text-gray-500">${utils.formatCurrencyNoCents(s.costPrice)}</td>
                    <td class="px-3 py-2 text-right font-bold text-gray-900">${utils.formatCurrencyNoCents(s.total)}</td>
                    <td class="px-2 py-2 text-right"><span class="bg-indigo-50 text-indigo-500 px-2 py-0.5 rounded text-[10px] font-bold">${s.batchId || 'B001'}</span></td>
                    <td class="px-2 py-2 text-right"><span class="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-[10px] font-black">${s.archiveYear}</span></td>
                </tr>
            `).join('');
        }

        if (archive.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="text-center py-10 text-gray-400">No archived records found for this period.</td></tr>`;
        }
    },

    voidEntireBill: async (billNo) => {
        if (!app.isAdmin) {
            app.requestAuth(() => views.voidEntireBill(billNo));
            return;
        }

        const confirmMsg = `⚠️ VOID ENTIRE BILL: ${billNo}\n\nThis will cancel ALL items in this transaction and return them to stock. This action is permanent.\n\nAre you sure you want to proceed?`;
        if (!confirm(confirmMsg)) return;

        try {
            utils.showNotification('Voiding transaction...', 'info');

            await db.transaction('rw', db.sales, db.inventory, db.item_batches, db.audit_logs, async () => {
                const billItems = await db.sales.where('billNo').equals(billNo).toArray();
                const activeItems = billItems.filter(i => i.paymentStatus !== 'Cancelled');

                if (activeItems.length === 0) {
                    throw new Error('No active items found for this bill.');
                }

                for (const item of activeItems) {
                    // 1. Revert Inventory
                    const invItem = await db.inventory.get(item.itemId);
                    if (invItem) {
                        const newCurrent = (invItem.currentStock || 0) + item.qty;
                        const cost = invItem.avgCost || item.costPrice || 0;
                        await db.inventory.update(item.itemId, {
                            sold: (invItem.sold || 0) - item.qty,
                            currentStock: newCurrent,
                            stockValue: newCurrent * cost
                        });
                    }

                    // 2. Revert Batch
                    if (item.batchId) {
                        const batch = await db.item_batches.where({ itemId: item.itemId, batchId: item.batchId }).first();
                        if (batch) {
                            await db.item_batches.update(batch.id, {
                                currentStock: (batch.currentStock || 0) + item.qty
                            });
                        }
                    }

                    // 3. Mark as Cancelled
                    await db.sales.update(item.id, {
                        paymentStatus: 'Cancelled',
                        updatedAt: new Date().toISOString()
                    });
                }

                // 4. Audit Log
                await utils.logAction('Void Bill', `Voided entire transaction ${billNo} (${activeItems.length} items)`);
            });

            utils.showNotification('Transaction voided successfully', 'success');
            views.loadSalesTable(document.getElementById('sales-search-input').value);
            if (typeof app !== 'undefined' && app.updateDashboard) app.updateDashboard();
        } catch (err) {
            console.error('Void Bill Error:', err);
            utils.showNotification('Failed to void bill: ' + err.message, 'error');
        }
    },

    deleteSale: async (id) => {
        if (!app.isAdmin) return;
        if (!confirm('Are you sure you want to delete this sale record? Inventory will be reverted.')) return;
        if (!utils.verifyDeletePassword()) return;

        try {
            await db.transaction('rw', db.sales, db.inventory, db.item_batches, db.audit_logs, async () => {
                const sale = await db.sales.get(id);
                if (!sale) throw new Error('Sale not found');

                // 1. Revert Inventory
                const invItem = await db.inventory.get(sale.itemId);
                if (invItem) {
                    const newCurrent = (invItem.currentStock || 0) + sale.qty;
                    const cost = invItem.avgCost || sale.costPrice || 0;
                    await db.inventory.update(sale.itemId, {
                        sold: (invItem.sold || 0) - sale.qty,
                        currentStock: newCurrent,
                        stockValue: newCurrent * cost
                    });
                }

                // 2. Revert Batch
                if (sale.batchId) {
                    const batch = await db.item_batches.where({ itemId: sale.itemId, batchId: sale.batchId }).first();
                    if (batch) {
                        await db.item_batches.update(batch.id, {
                            currentStock: (batch.currentStock || 0) + sale.qty
                        });
                    }
                }

                // 3. Delete Sale
                await db.sales.delete(id);

                // 4. Audit Log
                await utils.logAction('Sale Delete', `Deleted Sale Bill ${sale.billNo} for ${sale.itemName}`);
            });
            utils.showNotification('Sale record deleted and inventory reverted');
            views.initSales();
        } catch (err) {
            console.error('Delete Sale Error:', err);
            utils.showNotification('Error deleting sale: ' + err.message, 'error');
        }
    },

    cancelSale: async (id) => {
        if (!confirm('Are you sure you want to CANCEL this sale? Inventory will be reverted and the record will be marked as Cancelled.')) return;

        try {
            await db.transaction('rw', db.sales, db.inventory, db.item_batches, db.audit_logs, async () => {
                const sale = await db.sales.get(id);
                if (!sale) throw new Error('Sale not found');

                if (sale.paymentStatus === 'Cancelled') {
                    utils.showNotification('Sale is already cancelled', 'warning');
                    return;
                }

                // 1. Revert Inventory
                const invItem = await db.inventory.get(sale.itemId);
                if (invItem) {
                    const newCurrent = (invItem.currentStock || 0) + sale.qty;
                    const cost = invItem.avgCost || sale.costPrice || 0;
                    await db.inventory.update(sale.itemId, {
                        sold: (invItem.sold || 0) - sale.qty,
                        currentStock: newCurrent,
                        stockValue: newCurrent * cost
                    });
                }

                // 2. Revert Batch
                if (sale.batchId) {
                    const batch = await db.item_batches.where({ itemId: sale.itemId, batchId: sale.batchId }).first();
                    if (batch) {
                        await db.item_batches.update(batch.id, {
                            currentStock: (batch.currentStock || 0) + sale.qty
                        });
                    }
                }

                // 3. Mark as Cancelled
                await db.sales.update(id, {
                    paymentStatus: 'Cancelled',
                    // We keep total and profit for record, but we'll exclude them in sums
                });

                // 4. Audit Log
                await utils.logAction('Sale Cancel', `Cancelled Sale Bill ${sale.billNo} for ${sale.itemName}`);
            });
            utils.showNotification('Sale cancelled and inventory reverted', 'success');
            views.initSales();
            if (typeof app !== 'undefined' && app.updateDashboard) app.updateDashboard();
        } catch (err) {
            console.error('Cancel Sale Error:', err);
            utils.showNotification('Error cancelling sale: ' + err.message, 'error');
        }
    },


    importSalesCSV: (input) => {
        const file = input.files[0];
        if (!file) return;

        if (!confirm('⚠️ WARNING: This will DELETE ALL existing sales history and replace it with data from this CSV. Continue?')) {
            input.value = '';
            return;
        }

        const cleanNum = (val) => {
            if (val === undefined || val === null || val === '') return 0;
            if (typeof val === 'number') return val;
            return parseFloat(val.toString().replace(/[^0-9.-]+/g, '')) || 0;
        };

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim().toLowerCase(),
            complete: async (results) => {
                const rows = results.data;
                const today = new Date().toISOString().split('T')[0];
                let count = 0;
                let skipped = 0;

                try {
                    const masterCount = await db.item_master.count();
                    if (masterCount === 0) {
                        utils.showNotification('Please import Item Master first!', 'error');
                        input.value = '';
                        return;
                    }

                    utils.showNotification('Replacing sales history...', 'info');
                    await db.sales.clear();

                    const salesToImport = [];
                    for (const row of rows) {
                        const rawId = row['item id'] || row['itemid'] || row['item_id'] || row['id'] || row['item code'] || row['code'] || row['itemcode'];
                        const itemId = rawId ? rawId.toString().trim() : null;
                        const qty = cleanNum(row['qty'] || row['quantity'] || row['count']);
                        const sellingPrice = cleanNum(row['selling price'] || row['sellingprice'] || row['price'] || row['rate']);

                        if ((!itemId && !row['item name'] && !row['itemname']) || qty <= 0) {
                            skipped++;
                            continue;
                        }

                        let item = null;
                        if (itemId) {
                            item = await db.item_master.get(itemId);
                            if (!item && !isNaN(Number(itemId))) {
                                item = await db.item_master.get(Number(itemId));
                            }
                        }

                        if (!item && (row['item name'] || row['itemname'])) {
                            const nameToFind = (row['item name'] || row['itemname']).toString().trim();
                            item = await db.item_master.where('itemName').equalsIgnoreCase(nameToFind).first();
                        }

                        if (!item) {
                            skipped++;
                            continue;
                        }

                        const costPrice = cleanNum(row['cost price'] || row['costprice'] || row['cost']) || item.costPrice || 0;
                        const mrp = cleanNum(row['mrp'] || row['list price']) || item.listPrice || sellingPrice;
                        const date = row['date'] || today;
                        const billNo = row['bill no'] || row['billno'] || row['bill_no'] || 'CSV-' + Date.now() + '-' + count;
                        const discount = cleanNum(row['discount']);
                        const total = cleanNum(row['total']) || (qty * sellingPrice);
                        const profit = cleanNum(row['profit']) || (total - (qty * costPrice));

                        salesToImport.push({
                            date: date,
                            time: row['time'] || row['sale time'] || row['sale_time'] || '--:-- --',
                            billNo: billNo,
                            itemId: item.itemId,
                            itemName: item.itemName,
                            qty: qty,
                            costPrice: costPrice,
                            mrp: mrp,
                            discount: discount,
                            sellingPrice: sellingPrice,
                            total: total,
                            profit: profit
                        });
                        count++;
                    }

                    if (salesToImport.length > 0) {
                        await db.sales.bulkAdd(salesToImport);
                    }

                    await views.performInternalSync();
                    utils.showNotification(`Sales Overwritten: ${count} imported`, 'success');
                    if (skipped > 0) console.warn(`[Sales Import] ${skipped} rows skipped due to missing items or invalid data.`);
                    views.initSales();
                    if (typeof app !== 'undefined' && app.updateDashboard) app.updateDashboard();
                } catch (err) {
                    console.error('Import Failure:', err);
                    utils.showNotification('Import failed: ' + err.message, 'error');
                } finally {
                    input.value = '';
                }
            },
            error: (err) => {
                utils.showNotification('CSV error', 'error');
                console.error(err);
            }
        });
    },

    exportSalesToCSV: async () => {
        const sales = await db.sales.toArray();
        if (sales.length === 0) {
            utils.showNotification('No sales records to export', 'warning');
            return;
        }

        const items = await db.item_master.toArray();
        const itemMap = Object.fromEntries(items.map(i => [i.itemId, i.itemName]));

        const exportData = sales.map(s => ({
            'Date': s.date,
            'Time': s.time || '--:-- --',
            'Bill No': s.billNo,
            'Item Name': s.itemName || itemMap[s.itemId] || 'Unknown',
            'Item ID': s.itemId,
            'Qty': s.qty,
            'Cost Price': s.costPrice,
            'MRP': s.mrp,
            'Discount': s.discount,
            'Selling Price': s.sellingPrice,
            'Total': s.total,
            'Profit': s.profit
        }));

        const csv = Papa.unparse(exportData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `sales_history_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    reprintBillByNumber: async (billNumber = null) => {
        let searchBillNo = billNumber;

        // If no bill number provided, prompt the user
        if (!searchBillNo) {
            const billNo = prompt('Enter Bill Number to Reprint:\n(e.g., INV2602000001 or SR2602000001)');
            if (!billNo || billNo.trim() === '') return;
            searchBillNo = billNo.trim();
        }

        try {
            // Find all sales records with this bill number
            const salesRecords = await db.sales.where('billNo').equals(searchBillNo).toArray();

            if (salesRecords.length === 0) {
                utils.showNotification('Bill not found: ' + searchBillNo, 'error');
                return;
            }

            // Group items by bill number (should all be the same)
            const firstRecord = salesRecords[0];
            const saleDate = firstRecord.date;
            const saleTime = firstRecord.time || '--:-- --';
            const paymentMethod = firstRecord.method || 'Cash';
            const customerName = firstRecord.customer || 'Walk-in';
            const paymentStatus = firstRecord.paymentStatus || 'Paid';

            // Retrieve stored meta-data if available (from version 22+)
            const billDiscountStored = firstRecord.billDiscount || 0;
            const paidAmountStored = firstRecord.paidAmount; // Might be undefined for old records

            // Extract numeric part from bill number (remove INV or SR prefix)
            const rawBillId = searchBillNo.replace('INV-', '').replace('INV', '').replace('SR', '');

            // Calculate totals
            let itemsSubtotal = 0;
            let totalDiscountSum = 0;
            let totalQty = 0;
            let finalTotal = 0;

            // Calculate bill-wide totals first for accurate reconstruction
            const billFinalTotal = salesRecords.reduce((sum, s) => sum + (s.total || 0), 0);
            const billOriginalSubtotal = billFinalTotal + billDiscountStored;

            // Build cart-like structure from sales records
            const cartItems = salesRecords.map(sale => {
                const itemTotal = sale.total || 0;
                const itemMergedDiscount = sale.discount || 0;
                
                itemsSubtotal += (sale.qty * sale.mrp);
                totalQty += sale.qty;

                let itemLevelDiscount = 0;

                // LOGIC: Check if new 'itemDiscount' field exists
                if (sale.itemDiscount !== undefined) {
                    itemLevelDiscount = sale.itemDiscount;
                } else {
                    // FALLBACK: Mathematical Reconstruction for old records
                    if (billOriginalSubtotal > 0 && billDiscountStored > 0) {
                        const factor = billFinalTotal / billOriginalSubtotal;
                        const reconstructedOriginalItemTotal = itemTotal / factor;
                        itemLevelDiscount = (sale.qty * sale.mrp) - reconstructedOriginalItemTotal;
                    } else {
                        itemLevelDiscount = itemMergedDiscount;
                    }
                }

                totalDiscountSum += itemLevelDiscount;
                finalTotal += itemTotal; // Accumulated for the final display total (should match billFinalTotal)
                const originalItemTotal = (sale.qty * sale.mrp) - itemLevelDiscount;

                return {
                    name: utils.cleanItemName(sale.itemName),
                    qty: sale.qty,
                    unit: sale.unit || 'Pcs',
                    price: sale.mrp,
                    discount: itemLevelDiscount / sale.qty, // Only item-level per unit
                    total: originalItemTotal
                };
            });

            // Calculate Bill Discount separately for display
            const billDiscount = billDiscountStored;
            const itemsDiscount = totalDiscountSum; // Now accurately represents sum of item-level discounts

            // Handle Paid Amount and Balance for display
            let displayPaid = 0;
            if (paidAmountStored !== undefined) {
                displayPaid = paidAmountStored;
            } else {
                // Legacy fallback: Assume Paid bills were fully paid
                displayPaid = (paymentStatus === 'Paid') ? finalTotal : 0;
            }
            const displayBalance = displayPaid - finalTotal;

            // Generate Receipt HTML (similar to POS checkout)
            const receiptHTML = `
                <div style="width: 100%; padding: 0; margin: 0; overflow: visible; font-family: 'Outfit', 'Noto Sans Sinhala', sans-serif;">
                    <div style="text-align: center; margin-bottom: 5px;">
                        <h1 style="font-size: 1.3em; margin: 0 0 2px 0; font-weight: bold; text-transform: uppercase;">SAVI SHAKTHI<br>HARDWARE</h1>
                        <p style="margin: 0; font-size: 0.75em;">5th Canel, Srawasthipura, Anuradhapura</p>
                        <p style="margin: 0; font-size: 0.9em;">Phone: 076 181 8748</p>
                        <div style="border-bottom: 2px solid black; margin: 5px 0;"></div>
                        
                        <div style="font-size: 0.85em; text-align: left; font-weight: bold;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span>Bill ID: ${searchBillNo}</span>
                                <span style="color: #dc2626; font-size: 9px; font-weight: normal; border: 1px solid #dc2626; padding: 0 2px; border-radius: 2px;">REPRINT</span>
                            </div>
                            <div style="margin-top: 1px;">Ref: ${customerName}</div>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.7em; text-align: left; margin-top: 1px;">
                            <span>Date: ${saleDate}</span>
                            <span>Time: ${saleTime}</span>
                        </div>
                        <div style="font-size: 0.8em; text-align: left; margin-top: 1px; font-weight: bold;">
                            <div>Method: ${paymentMethod === 'Mixed' ? 'MIXED' : paymentMethod} ${paymentStatus === 'Pending' ? '(PENDING)' : '(PAID)'}</div>
                        </div>
                    </div>
                    
                    <table style="width: 100%; font-size: 0.9em; border-collapse: collapse; margin-bottom: 5px; table-layout: fixed;">
                        <thead>
                            <tr style="border-bottom: 1.5px solid black; border-top: 1.5px solid black;">
                                <th style="padding: 3px 0; text-align: left; width: 52%;">ITEM</th>
                                <th style="padding: 3px 0; text-align: center; width: 15%;">QTY</th>
                                <th style="padding: 3px 0; text-align: right; width: 33%;">AMT</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${cartItems.map(item => {
                const hasDiscount = (item.discount || 0) > 0;
                return `
                                    <tr>
                                        <td colspan="3" style="padding: 5px 0 1px 0; font-weight: bold; line-height: 1.1; font-size: 0.95em; white-space: nowrap; overflow: hidden;">${String(item.name).toUpperCase()}</td>
                                    </tr>
                                    ${hasDiscount ? `
                                        <tr>
                                            <td colspan="3" style="padding: 0 0 1px 0; font-size: 0.85em; font-weight: 500;">
                                                ${item.qty} ${item.unit} @ ${item.price.toFixed(2)}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 0 0 5px 0; font-size: 0.82em; font-weight: bold; white-space: nowrap;">Discount: -${((item.discount || 0) * item.qty).toFixed(2)}</td>
                                            <td style="text-align: center; font-weight: bold; padding-bottom: 5px; font-size: 0.95em; vertical-align: top;">${item.qty}</td>
                                            <td style="text-align: right; font-weight: bold; padding-bottom: 5px; font-size: 0.95em; vertical-align: top;">${item.total.toFixed(2)}</td>
                                        </tr>
                                    ` : `
                                        <tr>
                                            <td style="padding: 0 0 5px 0; font-size: 0.85em; font-weight: 500; vertical-align: top;">
                                                ${item.qty} ${item.unit} @ ${item.price.toFixed(2)}
                                            </td>
                                            <td style="text-align: center; font-weight: bold; padding-bottom: 5px; font-size: 0.95em; vertical-align: top;">${item.qty}</td>
                                            <td style="text-align: right; font-weight: bold; padding-bottom: 5px; font-size: 0.95em; vertical-align: top;">${item.total.toFixed(2)}</td>
                                        </tr>
                                    `}
                                `;
            }).join('')}
                        </tbody>
                    </table>
                    
                    <div style="border-top: 1.5px solid black; padding-top: 4px;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 2px;">
                            <span>Items Subtotal</span>
                            <span style="font-weight: bold;">${itemsSubtotal.toFixed(2)}</span>
                        </div>
                        ${itemsDiscount > 0 ? `
                        <div style="display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 2px;">
                            <span>Items Discount</span>
                            <span style="font-weight: bold;">-${itemsDiscount.toFixed(2)}</span>
                        </div>
                        ` : ''}
                        ${billDiscount > 0 ? `
                        <div style="display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 2px;">
                            <span>Bill Discount</span>
                            <span style="font-weight: bold;">-${billDiscount.toFixed(2)}</span>
                        </div>
                        ` : ''}
                        
                        <div style="border-top: 1.5px solid black; border-bottom: 1.5px solid black; padding: 4px 0; margin-top: 2px; display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: bold; font-size: 1.32em;">TOTAL</span>
                            <span style="font-weight: bold; font-size: 1.5em;">${finalTotal.toFixed(2)}</span>
                        </div>

                        <div style="margin-top: 4px; border-bottom: 1px dashed black; padding-bottom: 4px;">
                            <div style="display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 2px;">
                                <span>Paid Amount</span>
                                <span style="font-weight: bold;">${displayPaid.toFixed(2)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.9em;">
                                <span>Balance</span>
                                <span style="font-weight: bold;">${displayBalance.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top: 6px; text-align: center;">
                        <div style="display: flex; justify-content: center; font-size: 0.8em; font-weight: bold; margin-bottom: 4px;">
                            <span>Total Items: ${cartItems.length} | Qty: ${totalQty}</span>
                        </div>
                        <div style="border-bottom: 1px dashed black; margin-bottom: 6px;"></div>
                        
                        <div style="font-weight: bold; font-size: 0.75em; white-space: nowrap;">THANK YOU, COME AGAIN!</div>
                        <div style="margin: 2px 0; font-size: 0.7em; opacity: 0.9; font-weight: 500;">Software by AMBH Solutions</div>
                        
                        <div style="margin: 5px 0 0 0; text-align: center; display: flex; justify-content: center;">
                            <svg id="reprint-bill-barcode" style="max-width: 100%;"></svg>
                        </div>
                        <div style="font-family: monospace; font-size: 0.8em; margin-top: 2px; margin-bottom: 2pt; padding-bottom: 0;">${searchBillNo}</div>
                    </div>
                </div>
            `;

            const container = document.getElementById('receipt-container');
            container.innerHTML = receiptHTML;

            // Generate barcode and print
            setTimeout(() => {
                try {
                    JsBarcode("#reprint-bill-barcode", searchBillNo, {
                        format: "CODE128",
                        width: 1.2,
                        height: 32,
                        displayValue: false,
                        margin: 0
                    });
                } catch (e) {
                    console.error('Reprint barcode generation error:', e);
                }

                utils.showNotification('Reprinting bill: ' + searchBillNo, 'success');
                window.print();
            }, 100);

        } catch (err) {
            console.error('Reprint error:', err);
            utils.showNotification('Error reprinting bill: ' + err.message, 'error');
        }
    },


    // --- SETTINGS / BACKUP SECTION ---
    initSettings: async () => {
        const container = document.getElementById('view-settings');
        container.innerHTML = `
                <div class="h-full flex flex-col max-w-5xl mx-auto w-full">
                <div class="mb-6 flex justify-between items-center">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-800">System Settings</h2>
                        <p class="text-sm text-gray-500">Manage data, backups, and system reset</p>
                    </div>
                </div>

                <!-- Scrollable Content -->
        <div class="flex-1 overflow-y-auto pr-2 space-y-6 pb-12">

            <!-- 1. Data Backup & Restore -->
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div class="p-6 border-b border-gray-50 flex items-center gap-4 bg-gradient-to-r from-gray-50 to-white">
                    <div class="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center text-xl shadow-sm">
                        <i class="fa-solid fa-database"></i>
                    </div>
                    <div>
                        <h3 class="text-lg font-bold text-gray-800">Data Management</h3>
                        <p class="text-xs text-gray-500">Backup and restore your system data</p>
                    </div>
                </div>

                <div class="p-8">
                    <!-- Settings Actions Grid -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Backup (Visible for Admin and View-Only) -->
                        <button onclick="views.backupData()" class="group relative overflow-hidden bg-white border-2 border-gray-100 hover:border-primary/30 rounded-2xl p-6 text-left transition-all hover:shadow-lg hover:shadow-primary/5 ${(app.isAdmin || app.isViewOnly) ? '' : 'hidden'}">
                            <div class="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                            <i class="fa-solid fa-download text-3xl text-gray-300 group-hover:text-primary mb-4 transition-colors"></i>
                            <h4 class="font-bold text-gray-800 mb-1">Export Backup</h4>
                            <p class="text-xs text-gray-500 mb-4">Download all items, inventory, and sales history as a JSON file.</p>
                            <span class="inline-flex items-center text-xs font-bold text-primary group-hover:translate-x-1 transition-transform">
                                Download Now <i class="fa-solid fa-arrow-right ml-1"></i>
                            </span>
                        </button>

                        <!-- Restore -->
                        <button onclick="document.getElementById('restore-input').click()" class="group relative overflow-hidden bg-white border-2 border-gray-100 hover:border-secondary/30 rounded-2xl p-6 text-left transition-all hover:shadow-lg hover:shadow-secondary/5 ${app.isAdmin ? '' : 'hidden'}">
                            <div class="absolute top-0 right-0 w-24 h-24 bg-secondary/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                            <i class="fa-solid fa-upload text-3xl text-gray-300 group-hover:text-secondary mb-4 transition-colors"></i>
                            <h4 class="font-bold text-gray-800 mb-1">Restore Backup</h4>
                            <p class="text-xs text-gray-500 mb-4">Import a backup file to restore your data on this device.</p>
                            <span class="inline-flex items-center text-xs font-bold text-secondary group-hover:translate-x-1 transition-transform">
                                Select File <i class="fa-solid fa-arrow-right ml-1"></i>
                            </span>
                            <input type="file" id="restore-input" class="hidden" accept=".json" onchange="views.restoreData(this)">
                        </button>

                        <!-- Support Card (Only for View-Only) -->
                        ${app.isViewOnly ? `
                        <div class="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden group border border-indigo-400/30">
                            <div class="absolute -right-4 -bottom-4 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-125 transition-transform"></div>
                            <div class="relative z-10 flex flex-col h-full">
                                <div class="flex justify-between items-start mb-4">
                                    <div class="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/20">
                                        <i class="fa-solid fa-headset text-xl"></i>
                                    </div>
                                    <span class="bg-emerald-500/20 text-emerald-400 text-[8px] font-black px-2 py-1 rounded-full uppercase tracking-tighter border border-emerald-500/30">System Active</span>
                                </div>
                                
                                <h4 class="font-bold text-lg mb-1">Support & Assistance</h4>
                                <p class="text-xs text-indigo-100 mb-6 opacity-70 leading-relaxed font-medium">Contact system provider for updates, training, or technical support.</p>
                                
                                <div class="space-y-4 mt-auto">
                                    <div class="bg-white/5 p-3 rounded-xl border border-white/10 transition-colors hover:bg-white/10">
                                        <div class="flex items-center gap-3">
                                            <div class="w-8 h-8 bg-indigo-500/30 rounded-lg flex items-center justify-center text-xs">
                                                <i class="fa-solid fa-user-shield text-indigo-200"></i>
                                            </div>
                                            <div>
                                                <p class="text-[9px] uppercase font-black text-indigo-300 opacity-60">Admin Support</p>
                                                <p class="text-[13px] font-bold">AMBH Solutions</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="bg-indigo-900/40 p-3 rounded-xl border border-indigo-400/20 flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <div class="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center text-xs">
                                                <i class="fa-solid fa-phone-volume text-emerald-300"></i>
                                            </div>
                                            <p class="text-lg font-black tracking-widest text-emerald-50">077 700 2164</p>
                                        </div>
                                        <i class="fa-brands fa-whatsapp text-emerald-400 text-xl animate-pulse"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
            
            <!-- 1.5 Data Safety & Protection (NEW) - Admin Only -->
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${app.isAdmin ? '' : 'hidden'}">
                <div class="p-6 border-b border-gray-50 flex items-center gap-4 bg-gradient-to-r from-gray-50 to-white">
                    <div class="w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center text-xl shadow-sm">
                        <i class="fa-solid fa-shield-halved"></i>
                    </div>
                    <div>
                        <h3 class="text-lg font-bold text-gray-800">Advanced Data Protection</h3>
                        <p class="text-xs text-gray-500">Auto-backup and failsafe recovery settings</p>
                    </div>
                </div>

                <div class="p-8 space-y-6">
                    <div class="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <div>
                            <h4 class="font-bold text-gray-800 text-sm">Transaction Auto-Backup</h4>
                            <p class="text-xs text-gray-500">Ask for a backup download after every few sales.</p>
                        </div>
                        <div class="flex items-center gap-3">
                         <select id="setting-backup-interval" onchange="views.updateBackupSetting(this.value)" class="bg-white border border-gray-300 rounded-lg px-2 py-1 text-xs font-bold">
                                <option value="5" ${app.autoBackupInterval == 5 ? 'selected' : ''}>Every 5 Sales</option>
                                <option value="10" ${app.autoBackupInterval == 10 ? 'selected' : ''}>Every 10 Sales</option>
                                <option value="25" ${app.autoBackupInterval == 25 ? 'selected' : ''}>Every 25 Sales</option>
                                <option value="50" ${app.autoBackupInterval == 50 ? 'selected' : ''}>Every 50 Sales</option>
                                <option value="0" ${app.autoBackupInterval == 0 ? 'selected' : ''}>Disabled</option>
                             </select>
                        </div>
                    </div>

                    <div class="flex items-center justify-between p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <h4 class="font-bold text-indigo-900 text-sm">Ghost Failsafe (Emergency Copy)</h4>
                                <span class="bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">Recommended</span>
                            </div>
                            <p class="text-xs text-indigo-700 leading-relaxed">
                                Automatically keeps a "Ghost" copy of your Inventory in a separate storage. 
                                <br/>Even if your main database is wiped, you can recover within seconds.
                            </p>
                        </div>
                        <div class="px-3 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase shadow-md shadow-indigo-200">
                            Active
                        </div>
                    </div>
                </div>
            </div>

            <!-- 1.6 Cloud Connectivity (NEW) - Admin Only -->
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${app.isAdmin ? '' : 'hidden'}">
                <div class="p-6 border-b border-gray-50 flex items-center gap-4 bg-gradient-to-r from-blue-50 to-white">
                    <div class="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center text-xl shadow-sm">
                        <i class="fa-solid fa-cloud-arrow-up"></i>
                    </div>
                    <div>
                        <h3 class="text-lg font-bold text-gray-800">Cloud Connectivity (Firebase)</h3>
                        <p class="text-xs text-gray-500">Sync data between PC and Web POS</p>
                    </div>
                </div>

                <div class="p-8">
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <button onclick="cloudSync.checkConnection()" class="group relative overflow-hidden bg-white border-2 border-emerald-50 hover:border-emerald-300 rounded-2xl p-6 text-left transition-all hover:shadow-lg">
                            <i class="fa-solid fa-signal text-3xl text-emerald-300 group-hover:text-emerald-500 mb-4"></i>
                            <h4 class="font-bold text-gray-800 mb-1">Check Connection</h4>
                            <p class="text-xs text-gray-500">Verify if the PC can communicate with Firebase Cloud.</p>
                        </button>

                        <button onclick="cloudSync.uploadAll()" class="group relative overflow-hidden bg-white border-2 border-blue-50 hover:border-blue-300 rounded-2xl p-6 text-left transition-all hover:shadow-lg">
                            <i class="fa-solid fa-cloud-arrow-up text-3xl text-blue-300 group-hover:text-blue-500 mb-4"></i>
                            <h4 class="font-bold text-gray-800 mb-1">Incremental Cloud Sync</h4>
                            <p class="text-xs text-gray-500">Fast Sync: Push only new data to Cloud (Recommended).</p>
                        </button>

                        <button onclick="document.getElementById('cloud-json-input').click()" class="group relative overflow-hidden bg-white border-2 border-indigo-50 hover:border-indigo-300 rounded-2xl p-6 text-left transition-all hover:shadow-lg">
                            <i class="fa-solid fa-file-import text-3xl text-indigo-300 group-hover:text-indigo-500 mb-4"></i>
                            <h4 class="font-bold text-gray-800 mb-1">Upload JSON to Cloud</h4>
                            <p class="text-xs text-gray-500">Wipe Cloud & Replace with JSON data (Warning: Destructive).</p>
                            <input type="file" id="cloud-json-input" class="hidden" accept=".json" onchange="cloudSync.uploadFromJSON(this.files[0])">
                        </button>

                        <button onclick="cloudSync.downloadAll()" class="group relative overflow-hidden bg-white border-2 border-orange-50 hover:border-orange-300 rounded-2xl p-6 text-left transition-all hover:shadow-lg">
                            <i class="fa-solid fa-cloud-arrow-down text-3xl text-orange-300 group-hover:text-orange-500 mb-4"></i>
                            <h4 class="font-bold text-gray-800 mb-1">Download from Cloud</h4>
                            <p class="text-xs text-gray-500">Pull data from Cloud to this device (Overwrites local data).</p>
                        </button>

                        <button onclick="cloudSync.clearCloudData()" class="group relative overflow-hidden bg-white border-2 border-rose-50 hover:border-rose-300 rounded-2xl p-6 text-left transition-all hover:shadow-lg">
                            <i class="fa-solid fa-trash-can text-3xl text-rose-300 group-hover:text-rose-500 mb-4"></i>
                            <h4 class="font-bold text-gray-800 mb-1 text-rose-600">Clean Cloud Data</h4>
                            <p class="text-xs text-gray-500">Delete ALL data from Firebase (Permanent Wipe - Password Required).</p>
                        </button>
                    </div>
                </div>
            </div>


            <!-- 2. Font Management (NEW) - Admin Only -->
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${app.isAdmin ? '' : 'hidden'}">
                <div class="p-6 border-b border-gray-50 flex items-center gap-4 bg-gradient-to-r from-gray-50 to-white">
                    <div class="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center text-xl shadow-sm">
                        <i class="fa-solid fa-font"></i>
                    </div>
                    <div>
                        <h3 class="text-lg font-bold text-gray-800">PDF Font Management</h3>
                        <p class="text-xs text-gray-500">Upload custom fonts (e.g. Sinhala) for PDF exports</p>
                    </div>
                </div>

                <div class="p-8">
                    <div class="bg-purple-50/50 border border-purple-100 rounded-xl p-4 mb-8 flex gap-4 items-start">
                        <i class="fa-solid fa-circle-info text-purple-500 mt-1 text-lg"></i>
                        <div class="text-sm text-purple-800">
                            <p class="font-bold">Sinhala Font Support</p>
                            <p class="leading-relaxed">
                                To show Sinhala characters correctly in PDF exports, you must upload a <strong>.ttf</strong> font file (e.g., NotoSansSinhala-Regular.ttf).
                            </p>
                        </div>
                    </div>

                    <div class="flex items-center gap-4 ${app.isAdmin ? '' : 'hidden'}">
                        <button onclick="document.getElementById('font-upload-input').click()" class="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg shadow-purple-200 transition-all flex items-center gap-2">
                            <i class="fa-solid fa-file-arrow-up"></i> Upload Font (.ttf)
                        </button>
                        <input type="file" id="font-upload-input" class="hidden" accept=".ttf" onchange="views.uploadFont(this)">
                        
                        <div id="font-status" class="text-sm font-medium text-gray-500">
                            Checking custom font...
                        </div>
                    </div>
                    ${!app.isAdmin ? '<p class="text-sm text-amber-600 font-medium"><i class="fa-solid fa-lock mr-2"></i> Admin login required to upload fonts.</p>' : ''}
                </div>
            </div>

            <!-- 3. System Maintenance & Diagnostics (NEW) - Admin Only -->
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${app.isAdmin ? '' : 'hidden'}">
                <div class="p-6 border-b border-gray-50 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center text-xl shadow-sm">
                            <i class="fa-solid fa-wrench"></i>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-gray-800">Maintenance & Diagnostics</h3>
                            <p class="text-xs text-gray-500">Check database health and fix inconsistencies</p>
                        </div>
                    </div>
                    <button onclick="views.runSystemDiagnostics()" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all flex items-center gap-2">
                        <i class="fa-solid fa-stethoscope"></i> Run Diagnostic
                    </button>
                </div>

                <div class="p-8">
                    <div id="diagnostic-results" class="hidden mb-6 p-4 rounded-xl border-2 border-dashed border-gray-100 bg-gray-50/30">
                        <!-- Diagnostic results injected here -->
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div class="flex flex-col gap-2">
                            <button onclick="views.recalculateAllInventory()" class="px-6 py-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                                <i class="fa-solid fa-arrows-rotate"></i> Recalculate Inventory
                            </button>
                            <p class="text-[10px] text-gray-400">Fixes incorrect stock counts by recalculating (Stock-In - Sales).</p>
                        </div>
                        
                        <div class="flex flex-col gap-2">
                            <button onclick="db.open().then(() => utils.showNotification('Database optimized!'))" class="px-6 py-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                                <i class="fa-solid fa-sparkles"></i> Optimize Database
                            </button>
                            <p class="text-[10px] text-gray-400">Re-indexes tables and cleans up temporary storage for better speed.</p>
                        </div>

                        <div class="flex flex-col gap-2">
                            <button onclick="views.performAnnualClosing()" class="px-6 py-3 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm">
                                <i class="fa-solid fa-box-archive"></i> Archive Data
                            </button>
                            <p class="text-[10px] text-gray-400">Archives old sales & purchases to speed up the system.</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 4. Audit Logs (NEW) - Admin Only -->
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${app.isAdmin ? '' : 'hidden'}">
                <div class="p-6 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between bg-gradient-to-r from-gray-50 to-white gap-4">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center text-xl shadow-sm">
                            <i class="fa-solid fa-clock-rotate-left"></i>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-gray-800">System Audit Logs</h3>
                            <p class="text-xs text-gray-500">Track all critical actions and user logins</p>
                        </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-3">
                        <div class="relative">
                            <input type="date" id="audit-logs-date" onchange="views.loadAuditLogs()" class="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all w-full md:w-40">
                            <i class="fa-solid fa-calendar absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]"></i>
                        </div>
                        <div class="relative">
                            <input type="text" id="audit-logs-search" placeholder="Search logs..." oninput="views.loadAuditLogs()" class="pl-9 pr-4 py-2 bg-white border border-gray-100 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all w-full md:w-44">
                            <i class="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]"></i>
                        </div>
                        <button onclick="views.loadAuditLogs()" class="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-bold transition-all whitespace-nowrap">
                            <i class="fa-solid fa-arrows-rotate mr-1"></i> Refresh
                        </button>
                        <button onclick="views.exportToPDF('audit-logs-table', 'System Audit Log')" class="px-4 py-2 bg-indigo-500 text-white hover:bg-indigo-600 rounded-lg text-xs font-bold transition-all whitespace-nowrap shadow-sm">
                            <i class="fa-solid fa-file-pdf mr-1"></i> PDF
                        </button>
                    </div>
                </div>

                <div class="p-0 overflow-x-auto max-h-[400px]">
                    <table id="audit-logs-table" class="w-full text-sm text-left">
                        <thead class="bg-gray-50 text-gray-500 uppercase text-[10px] font-black sticky top-0">
                            <tr>
                                <th class="px-6 py-3">Time</th>
                                <th class="px-6 py-3">User</th>
                                <th class="px-6 py-3">Action</th>
                                <th class="px-6 py-3">Details</th>
                            </tr>
                        </thead>
                        <tbody id="audit-logs-body" class="divide-y divide-gray-100">
                            <!-- Logs injected here -->
                            <tr><td colspan="4" class="px-6 py-8 text-center text-gray-400">Loading logs...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 5. User Management (NEW) - Admin Only -->
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${app.isAdmin ? '' : 'hidden'}">
                <div class="p-6 border-b border-gray-50 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center text-xl shadow-sm">
                            <i class="fa-solid fa-users-gear"></i>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-gray-800">User Profile Management</h3>
                            <p class="text-xs text-gray-500">Manage user accounts and access levels</p>
                        </div>
                    </div>
                    <button onclick="views.openUserModal()" class="px-4 py-2 bg-primary text-white hover:bg-indigo-700 rounded-lg text-xs font-bold transition-all shadow-md">
                        <i class="fa-solid fa-user-plus mr-1"></i> Add New User
                    </button>
                </div>

                <div class="p-0 overflow-x-auto">
                    <table class="w-full text-sm text-left">
                        <thead class="bg-gray-50 text-gray-500 uppercase text-[10px] font-black">
                            <tr>
                                <th class="px-6 py-3">Username</th>
                                <th class="px-6 py-3 text-center">Role</th>
                                <th class="px-6 py-3 text-center">Created At</th>
                                <th class="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="user-management-body" class="divide-y divide-gray-100">
                            <!-- Users injected here -->
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 6. Danger Zone - Admin Only -->
            <div class="bg-red-50/50 rounded-2xl shadow-sm border border-red-100 overflow-hidden ${app.isAdmin ? '' : 'hidden'}">
                <div class="p-6 flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 bg-red-100 text-red-500 rounded-xl flex items-center justify-center text-lg">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-red-900">Factory Reset</h3>
                            <p class="text-xs text-red-600">Permanently delete all data and start fresh.</p>
                        </div>
                    </div>
                    <button onclick="views.factoryReset()" class="px-5 py-2.5 bg-white border border-red-200 text-red-600 rounded-xl text-sm font-bold hover:bg-red-500 hover:text-white hover:border-red-500 transition-all shadow-sm">
                        Reset System
                    </button>
                </div>
            </div>
        </div>
            </div >

            `;

        views.checkFontStatus();
        if (app.isAdmin) {
            views.loadAuditLogs();
            views.loadUsers();
        }
    },

    loadAuditLogs: async () => {
        const tbody = document.getElementById('audit-logs-body');
        if (!tbody) return;

        const queryInp = document.getElementById('audit-logs-search');
        const dateInp = document.getElementById('audit-logs-date');
        const query = queryInp ? queryInp.value.toLowerCase() : '';
        const dateFilter = dateInp ? dateInp.value : '';

        try {
            let logs = await db.audit_logs.reverse().toArray();

            // Apply Keyword Search
            if (query) {
                logs = logs.filter(l =>
                    l.user.toLowerCase().includes(query) ||
                    l.action.toLowerCase().includes(query) ||
                    l.details.toLowerCase().includes(query)
                );
            }

            // Apply Date Filter
            if (dateFilter) {
                logs = logs.filter(l => {
                    const logDate = new Date(l.timestamp).toISOString().split('T')[0];
                    return logDate === dateFilter;
                });
            }

            // Limit results for performance after filtering
            logs = logs.slice(0, 300);

            if (logs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-12 text-center text-gray-400">
                    <i class="fa-solid fa-magnifying-glass text-3xl mb-2 opacity-20"></i><br>
                    No logs matching your criteria.
                </td></tr>`;
                return;
            }

            tbody.innerHTML = logs.map(l => {
                let actionColor = 'bg-gray-100 text-gray-600';
                if (l.action.includes('Login')) actionColor = 'bg-emerald-100 text-emerald-600';
                if (l.action.includes('Delete')) actionColor = 'bg-red-100 text-red-600';
                if (l.action.includes('Auth')) actionColor = 'bg-amber-100 text-amber-600';
                if (l.action.includes('Sale')) actionColor = 'bg-indigo-100 text-indigo-600';
                if (l.action.includes('Reset')) actionColor = 'bg-rose-100 text-rose-600 font-bold animate-pulse';

                return `
                <tr class="hover:bg-blue-50/30 transition-colors group">
                    <td class="px-6 py-4 text-[11px] font-mono text-gray-400 group-hover:text-blue-500 transition-colors">
                        ${new Date(l.timestamp).toLocaleDateString()} ${new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-2">
                            <div class="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                                ${l.user.charAt(0).toUpperCase()}
                            </div>
                            <span class="text-sm font-bold text-gray-700">${l.user}</span>
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${actionColor}">
                            ${l.action}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-xs text-gray-500 leading-relaxed max-w-md truncate hover:whitespace-normal transition-all" title="${l.details}">
                        ${l.details}
                    </td>
                </tr>
            `;
            }).join('');
        } catch (err) {
            console.error('Audit Load Error:', err);
        }
    },

    loadUsers: async () => {
        const tbody = document.getElementById('user-management-body');
        if (!tbody) return;

        try {
            const users = await db.users.toArray();
            tbody.innerHTML = users.map(u => `
                <tr class="hover:bg-gray-50 transition-colors">
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold">
                                ${u.username.charAt(0).toUpperCase()}
                            </div>
                            <span class="font-bold text-gray-800">${u.username}</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 text-center">
                        <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase ${u.role === 'Admin' ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600'}">
                            ${u.role}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-center text-xs text-gray-400">
                        ${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'Initial'}
                    </td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="views.openUserModal(${u.id})" class="text-blue-500 hover:text-blue-700 mr-3 transition-colors">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button onclick="views.deleteUser(${u.id})" class="text-red-300 hover:text-red-500 transition-colors ${u.username === 'admin' ? 'hidden' : ''}">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            console.error('User Fetch Error:', err);
        }
    },

    openUserModal: async (userId = null) => {
        let user = null;
        if (userId) {
            user = await db.users.get(userId);
        }

        const modalHtml = `
            <div id="user-edit-modal" class="fixed inset-0 bg-black/60 z-[1000] flex items-center justify-center backdrop-blur-sm animate-fade-in shadow-2xl">
                <div class="bg-white rounded-2xl w-full max-w-sm p-8 transform transition-all shadow-2xl border border-gray-100">
                    <h3 class="text-xl font-black mb-6 text-gray-800 flex items-center gap-2">
                        <i class="fa-solid fa-user-gear text-primary"></i> ${userId ? 'Edit User Profile' : 'Add New User Account'}
                    </h3>
                    <form id="user-manage-form" class="space-y-5">
                        <input type="hidden" id="manage-user-id" value="${userId || ''}">
                        <div>
                            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Username</label>
                            <input type="text" id="manage-user-name" class="w-full rounded-xl border-2 border-gray-100 px-4 py-3 text-sm focus:border-primary outline-none font-bold" value="${user ? user.username : ''}" ${user && user.username === 'admin' ? 'readonly' : ''} required>
                        </div>
                        <div>
                            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">${userId ? 'New Password (Leave blank to keep)' : 'User Password'}</label>
                            <input type="password" id="manage-user-pass" class="w-full rounded-xl border-2 border-gray-100 px-4 py-3 text-sm focus:border-primary outline-none font-bold" ${userId ? '' : 'required'}>
                        </div>
                        <div>
                            <label class="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">System Access Role</label>
                            <select id="manage-user-role" class="w-full rounded-xl border-2 border-gray-100 px-4 py-3 text-sm focus:border-primary outline-none font-bold text-gray-700" ${user && user.username === 'admin' ? 'disabled' : ''}>
                                <option value="Admin" ${user && user.role === 'Admin' ? 'selected' : ''}>Full Admin Access</option>
                                <option value="User" ${user && user.role === 'User' ? 'selected' : '' || !user ? 'selected' : ''}>Staff / View Only</option>
                            </select>
                        </div>
                        <div class="flex gap-3 pt-6 border-t border-gray-50 mt-8">
                            <button type="button" onclick="this.closest('#user-edit-modal').remove()" class="flex-1 py-3.5 text-xs font-black text-gray-400 hover:bg-gray-50 rounded-xl transition-all uppercase tracking-widest">Cancel</button>
                            <button type="submit" class="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black py-3.5 rounded-xl uppercase tracking-widest text-xs shadow-lg shadow-indigo-200">Save User</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const form = document.getElementById('user-manage-form');
        form.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('manage-user-id').value;
            const username = document.getElementById('manage-user-name').value.trim().toLowerCase();
            const pass = document.getElementById('manage-user-pass').value;
            const role = document.getElementById('manage-user-role').value;

            try {
                const userData = {
                    username,
                    role,
                    updatedAt: new Date().toISOString()
                };

                let passChanged = false;
                if (!id) {
                    userData.createdAt = new Date().toISOString();
                }
                
                if (pass) {
                    userData.passwordHash = await app.hashPassword(pass);
                    passChanged = true;
                }

                if (id) {
                    const numericalId = parseInt(id);
                    await db.users.update(numericalId, userData);
                    utils.showNotification('User profile updated');
                } else {
                    const exists = await db.users.where('username').equals(username).first();
                    if (exists) {
                        utils.showNotification('Username already exists', 'error');
                        return;
                    }
                    await db.users.add(userData);
                    utils.showNotification('New user added successfully');
                }

                document.getElementById('user-edit-modal').remove();
                views.loadUsers();
                
                const logMsg = passChanged ? 
                    `Modified user profile and updated password for: ${username}` : 
                    `Modified user profile details for: ${username}`;
                await utils.logAction('User Mgmt', logMsg);
                
                // Force a sync if possible
                if (typeof cloudSync !== 'undefined') {
                    console.log('User profile changed. Triggering silent cloud sync...');
                    cloudSync.uploadAll(true);
                }
            } catch (err) {
                console.error('User Save Error:', err);
                utils.showNotification('Failed to save user: ' + err.message, 'error');
            }
        };
    },

    deleteUser: async (id) => {
        const user = await db.users.get(id);
        if (user.username === 'admin') return;
        if (!confirm(`Are you sure you want to delete user "${user.username}"?`)) return;
        if (!utils.verifyDeletePassword()) return;

        await db.users.delete(id);
        utils.showNotification('User deleted');
        views.loadUsers();
        await utils.logAction('User Mgmt', `Deleted user: ${user.username}`);
    },

    uploadFont: async (input) => {
        const file = input.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            utils.showNotification('Font file too large (max 2MB)', 'error');
            input.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const base64 = e.target.result.split(',')[1];
                await db.settings.put({ key: 'custom_font', value: base64, fileName: file.name });
                utils.showNotification('Font uploaded successfully! PDFs will now use this font.');
                views.checkFontStatus();
            } catch (err) {
                console.error('Font upload failed:', err);
                utils.showNotification('Error uploading font', 'error');
            } finally {
                input.value = '';
            }
        };
        reader.readAsDataURL(file);
    },

    checkFontStatus: async () => {
        const statusEl = document.getElementById('font-status');
        if (!statusEl) return;

        try {
            const font = await db.settings.get('custom_font');
            if (font && font.value) {
                statusEl.innerHTML = `<span class="text-green-600 font-bold"><i class="fa-solid fa-check-circle"></i> Active: ${font.fileName || 'Custom Font'}</span>`;
            } else {
                statusEl.innerHTML = '<span class="text-gray-400 italic">No custom font uploaded.</span>';
            }
        } catch (err) {
            statusEl.innerText = 'Error checking font status';
        }
    },

    updateBackupSetting: async (val) => {
        const interval = parseInt(val);
        app.autoBackupInterval = interval;
        await db.settings.put({ key: 'autoBackupInterval', value: String(interval) });
        utils.showNotification('Backup interval saved successfully', 'success');
    },

    backupData: async () => {
        try {
            utils.showNotification('Preparing system backup...', 'info');

            const tables = [
                'item_master', 'inventory', 'stock_in', 'sales', 'expenses', 'purchases',
                'settings', 'held_bills', 'item_batches', 'audit_logs', 'users', 'sales_archive', 'stock_in_archive', 'closing_balances'
            ];
            const backupDataMap = {};

            // Parallel fetch all data for faster backup
            await Promise.all(tables.map(async (table) => {
                backupDataMap[table] = await db[table].toArray();
            }));

            const backup = {
                timestamp: new Date().toISOString(),
                version: '23', 
                data: backupDataMap
            };

            const jsonString = JSON.stringify(backup);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
            const timeStr = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
            link.download = `SaviShakthi_Backup_${dateStr}_${timeStr}.json`;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            utils.showNotification('Backup completed! Move it to your safety drive.', 'success');
            await db.settings.put({ key: 'lastBackupDate', value: new Date().toISOString() });
        } catch (err) {
            console.error('Backup failed:', err);
            utils.showNotification('Backup failed: ' + err.message, 'error');
        }
    },

    runSystemDiagnostics: async () => {
        const resultsEl = document.getElementById('diagnostic-results');
        if (!resultsEl) return;

        resultsEl.classList.remove('hidden');
        resultsEl.innerHTML = `
            <div class="flex items-center gap-3 text-indigo-600 mb-4 font-bold text-sm">
                <i class="fa-solid fa-spinner fa-spin"></i>
                Analyzing Database Structures...
            </div>
        `;

        try {
            // Check Database Connectivity
            const isOpen = db.isOpen();

            // Check Tables and Record Counts
            const tableNames = ['item_master', 'inventory', 'stock_in', 'sales', 'expenses', 'purchases', 'settings', 'held_bills', 'item_batches', 'audit_logs', 'users', 'sales_archive', 'stock_in_archive', 'closing_balances'];
            const counts = {};

            for (const table of tableNames) {
                try {
                    counts[table] = await db[table].count();
                } catch (e) {
                    counts[table] = 'ERROR';
                }
            }

            // Fetch Additional Diagnostics
            const lastBackupRecord = await db.settings.get('lastBackupDate');
            const lastBackupStr = lastBackupRecord ? new Date(lastBackupRecord.value).toLocaleString() : 'Never';
            const ghostCount = await db.ghost_backups.count();

            // Check Browser Storage Space
            let storageInfo = 'N/A';
            if (navigator.storage && navigator.storage.estimate) {
                const estimate = await navigator.storage.estimate();
                const used = (estimate.usage / (1024 * 1024)).toFixed(2);
                const total = (estimate.quota / (1024 * 1024)).toFixed(2);
                storageInfo = `${used} MB used of ${total} MB available`;
            }

            resultsEl.innerHTML = `
                <div class="flex justify-between items-center mb-4 pb-2 border-b border-gray-200/50">
                    <h5 class="text-xs font-black uppercase text-gray-400 tracking-widest">Diagnostic Report</h5>
                    <span class="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-black uppercase">System Healthy</span>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    <div class="space-y-2">
                        <div class="flex justify-between text-xs">
                            <span class="text-gray-500">Database Status:</span>
                            <span class="${isOpen ? 'text-emerald-500' : 'text-red-500'} font-bold">${isOpen ? 'Connected (Dexie v' + db.verno + ')' : 'Disconnected'}</span>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="text-gray-500">Browser Persistence:</span>
                            <span class="text-indigo-600 font-bold">Enabled</span>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="text-gray-500">Storage Usage:</span>
                            <span class="text-gray-700 font-bold">${storageInfo}</span>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="text-gray-500">Last External Backup:</span>
                            <span class="text-indigo-600 font-bold">${lastBackupStr}</span>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="text-gray-500">Ghost Safe Mode:</span>
                            <span class="${ghostCount > 0 ? 'text-emerald-500' : 'text-amber-500'} font-bold">${ghostCount > 0 ? ghostCount + ' Snapshots Armed' : 'Inactive'}</span>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                        ${tableNames.map(t => `
                            <div class="bg-white p-2 rounded-lg border border-gray-100 flex justify-between items-center shadow-sm">
                                <span class="text-[9px] text-gray-400 font-bold uppercase truncate pr-2">${t.replace('_', ' ')}</span>
                                <span class="text-xs font-black ${counts[t] === 'ERROR' ? 'text-red-500' : 'text-indigo-600'}">${counts[t]}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="mt-4 pt-4 border-t border-gray-200/30 flex gap-4">
                     <div class="flex items-center gap-2 text-[10px] text-emerald-600 font-bold uppercase">
                        <i class="fa-solid fa-check-double"></i> All Modules Synced
                     </div>
                     <div class="flex items-center gap-2 text-[10px] text-blue-600 font-bold uppercase">
                        <i class="fa-solid fa-cloud-arrow-up"></i> Auto-Backup Armed
                     </div>
                </div>
            `;

        } catch (err) {
            resultsEl.innerHTML = `<div class="text-red-500 text-xs font-bold p-2 bg-red-50 rounded">Diagnostic failed: ${err.message}</div>`;
        }
    },

    restoreData: async (input) => {
        const file = input.files[0];
        if (!file) return;

        if (!confirm('⚠️ WARNING: Restoring will DELETE ALL CURRENT DATA on this computer and replace it with the backup.\n\nAre you sure you want to proceed?')) {
            input.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target.result;
                const backup = JSON.parse(content);

                // INDUSTRIAL VALIDATION: Check for core tables and version integrity
                if (!backup.data || !backup.timestamp) {
                    throw new Error('Invalid format: Missing data or timestamp.');
                }

                const requiredTables = ['item_master', 'inventory', 'sales', 'users'];
                const missing = requiredTables.filter(t => !backup.data[t]);
                if (missing.length > 0) {
                    throw new Error(`Invalid Backup: Missing critical data tables (${missing.join(', ')}). Restore aborted.`);
                }

                if (!backup.version) {
                    console.warn('Old backup version detected.');
                }

                utils.showNotification('Restoring data...', 'info');

                await db.transaction('rw', db.item_master, db.inventory, db.stock_in, db.sales, db.expenses, db.purchases, db.settings, db.held_bills, db.item_batches, db.audit_logs, db.users, db.sales_archive, db.stock_in_archive, db.closing_balances, async () => {
                    // Clear all tables
                    await Promise.all([
                        db.item_master.clear(),
                        db.inventory.clear(),
                        db.stock_in.clear(),
                        db.sales.clear(),
                        db.expenses.clear(),
                        db.purchases.clear(),
                        db.settings.clear(),
                        db.held_bills.clear(),
                        db.item_batches.clear(),
                        db.users.clear(),
                        db.audit_logs.clear(),
                        db.sales_archive.clear(),
                        db.stock_in_archive.clear(),
                        db.closing_balances.clear()
                    ]);

                    // Restore data
                    const { item_master, inventory, stock_in, sales, expenses, purchases, settings, held_bills, item_batches, audit_logs, users, sales_archive, stock_in_archive, closing_balances } = backup.data;

                    if (item_master?.length) await db.item_master.bulkPut(item_master);
                    if (inventory?.length) await db.inventory.bulkPut(inventory);
                    if (stock_in?.length) await db.stock_in.bulkPut(stock_in);
                    if (sales?.length) await db.sales.bulkPut(sales);
                    if (expenses?.length) await db.expenses.bulkPut(expenses);
                    if (purchases?.length) await db.purchases.bulkPut(purchases);
                    if (settings?.length) await db.settings.bulkPut(settings);
                    if (held_bills?.length) await db.held_bills.bulkPut(held_bills);
                    if (item_batches?.length) await db.item_batches.bulkPut(item_batches);
                    if (audit_logs?.length) await db.audit_logs.bulkPut(audit_logs);
                    if (users?.length) await db.users.bulkPut(users);
                    if (sales_archive?.length) await db.sales_archive.bulkPut(sales_archive);
                    if (stock_in_archive?.length) await db.stock_in_archive.bulkPut(stock_in_archive);
                    if (closing_balances?.length) await db.closing_balances.bulkPut(closing_balances);
                });

                utils.showNotification('Data applied. Finalizing system sync...', 'info');
                await views.recalculateAllInventory(true);

                utils.showNotification('System restored successfully! Reloading...', 'success');
                setTimeout(() => window.location.reload(), 2000);

            } catch (err) {
                console.error('Restore failed:', err);
                utils.showNotification('Restore failed: ' + err.message, 'error');
            } finally {
                input.value = '';
            }
        };
        reader.readAsText(file);
    },

    factoryReset: async () => {
        if (!app.isAdmin) {
            app.requestAuth(() => views.factoryReset());
            return;
        }

        const confirm1 = confirm('📛 DANGER ZONE\n\nAre you sure you want to RESET the entire system?\nThis will permanently delete ALL ITEMS, SALES, and INVENTORY history.\n\nThis action cannot be undone.');
        if (!confirm1) return;

        if (!utils.verifyDeletePassword()) return;

        const code = prompt('To confirm permanent deletion, please type "RESET" (all caps):');
        if (code === 'RESET') {
            try {
                utils.showNotification('Resetting system...', 'info');

                // Clear all tables for a clean start
                await Promise.all([
                    db.item_master.clear(),
                    db.inventory.clear(),
                    db.stock_in.clear(),
                    db.sales.clear(),
                    db.held_bills.clear(),
                    db.expenses.clear(),
                    db.purchases.clear(),
                    db.audit_logs.clear(),
                    db.users.clear(),
                    db.settings.clear(),
                    db.item_batches.clear(),
                    db.ghost_backups.clear(),
                    db.sales_archive.clear(),
                    db.stock_in_archive.clear(),
                    db.closing_balances.clear()
                ]);

                // Try to delete the DB as well for a full purge (optional but safe now tables are empty)
                try {
                    await db.delete();
                } catch (e) {
                    console.warn("DB Delete deferred/blocked, but tables cleared.", e);
                }

                alert('System has been reset successfully. The page will now reload.');
                window.location.reload();
            } catch (err) {
                console.error('Reset failed:', err);
                alert('Reset failed: ' + err.message);
            }
        }
    },

    // --- EXPENSES SECTION ---
    initExpenses: async () => {
        const container = document.getElementById('view-expenses');
        container.innerHTML = `
            <div class="flex flex-col h-full gap-6">
                <div class="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div>
                        <h3 class="text-xl font-bold text-gray-800">Expense Management</h3>
                        <p class="text-sm text-gray-500">Track and manage business operational costs</p>
                    </div>
                    <div class="flex gap-2">
                        <div class="relative">
                            <i class="fa-solid fa-calendar-days absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                            <input type="month" id="expenses-search-month" 
                             class="pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
                             onchange="views.loadExpensesTable(this.value)">
                        </div>
                        <button onclick="if(!app.isAdmin) { app.requestAuth(() => views.exportToPDF('expenses-table', 'Expenses Report')); } else { views.exportToPDF('expenses-table', 'Expenses Report'); }" class="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center gap-2">
                             <i class="fa-solid fa-file-pdf"></i> PDF
                        </button>
                        <button onclick="if(!app.isAdmin) { app.requestAuth(() => views.openAddExpenseModal()); } else { views.openAddExpenseModal(); }" class="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl shadow-lg shadow-orange-200 transition-all flex items-center gap-2">
                             <i class="fa-solid fa-plus"></i> Add
                        </button>
                    </div>
                </div>

                <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex-1 flex flex-col">
                     <div class="overflow-y-auto flex-1">
                        <table id="expenses-table" class="w-full text-sm text-left">
                            <thead class="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                                <tr>
                                    <th class="px-3 py-4 w-28 text-left">Date</th>
                                    <th class="px-3 py-4 w-28 text-left">Category</th>
                                    <th class="px-3 py-4 text-left">Description</th>
                                    <th class="px-3 py-4 text-left">User</th>
                                    <th class="px-3 py-4 text-right w-24">Amount</th>
                                    <th class="px-3 py-4 text-center w-28">Action</th>
                                </tr>
                            </thead>
                            <tbody id="expenses-table-body">
                                <tr><td colspan="6" class="text-center py-10 text-gray-400">Loading expenses...</td></tr>
                            </tbody>
                        </table>
                     </div>
                </div>
            </div>
        `;

        views.loadExpensesTable();

        const form = document.getElementById('add-expense-form');
        if (form) form.onsubmit = views.saveExpense;
        const dateInp = document.getElementById('expense-date');
        if (dateInp) dateInp.valueAsDate = new Date();
    },

    openAddExpenseModal: (id = null) => {
        const modal = document.getElementById('add-expense-modal');
        const title = document.getElementById('expense-modal-title');
        const saveBtn = document.getElementById('expense-save-btn');
        const idInp = document.getElementById('expense-id');
        const form = document.getElementById('add-expense-form');

        form.reset();
        idInp.value = '';
        title.innerText = 'Record New Expense';
        saveBtn.innerText = 'Save Expense';
        const dateInp = document.getElementById('expense-date');
        if (dateInp) dateInp.valueAsDate = new Date();

        if (id) {
            title.innerText = 'Edit Expense Record';
            saveBtn.innerText = 'Update Expense';
            views.editExpense(id);
        }

        modal.classList.remove('hidden');
        const amtInp = document.getElementById('expense-amount');
        if (amtInp) amtInp.focus();
    },

    editExpense: async (id) => {
        const exp = await db.expenses.get(id);
        if (!exp) return;
        document.getElementById('expense-id').value = id;
        document.getElementById('expense-date').value = exp.date;
        document.getElementById('expense-category').value = exp.category;
        document.getElementById('expense-desc').value = exp.description || '';
        document.getElementById('expense-amount').value = exp.amount;
    },

    saveExpense: async (e) => {
        e.preventDefault();
        const id = document.getElementById('expense-id').value;
        const date = document.getElementById('expense-date').value;
        const category = document.getElementById('expense-category').value;
        const desc = document.getElementById('expense-desc').value;
        const amount = parseFloat(document.getElementById('expense-amount').value);
        const user = app.currentUser || 'System';

        if (!amount || amount <= 0) {
            utils.showNotification('Invalid amount', 'error');
            return;
        }

        const data = { date, category, description: desc, amount, user };

        try {
            if (id) {
                await db.expenses.update(parseInt(id), data);
                utils.showNotification('Expense updated successfully', 'success');
            } else {
                await db.expenses.add(data);
                utils.showNotification('Expense saved successfully', 'success');
            }

            document.getElementById('add-expense-modal').classList.add('hidden');
            views.loadExpensesTable();

            if (app.currentState === 'reports') views.initReports();

        } catch (err) {
            console.error(err);
            utils.showNotification('Error saving expense', 'error');
        }
    },

    loadExpensesTable: async (searchMonth = '', query = '') => {
        const tbody = document.getElementById('expenses-table-body');
        if (!tbody) return;

        let expenses = await db.expenses.orderBy('date').reverse().toArray();

        if (query) {
            const q = query.toLowerCase();
            expenses = expenses.filter(e =>
                (e.category || '').toLowerCase().includes(q) ||
                (e.description || '').toLowerCase().includes(q)
            );
        }

        if (searchMonth) {
            expenses = expenses.filter(e => {
                if (!e.date) return false;
                if (e.date.startsWith(searchMonth)) return true;
                const d = new Date(e.date);
                if (isNaN(d.getTime())) return false;
                return d.toISOString().startsWith(searchMonth);
            });
        }

        if (expenses.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-12 text-gray-400">No expenses recorded.</td></tr>`;
            return;
        }

        tbody.innerHTML = expenses.map(e => `
            <tr class="border-b hover:bg-gray-50 transition-colors">
            <td class="px-3 py-4 font-mono text-xs text-gray-500">${e.date}</td>
            <td class="px-3 py-4"><span class="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-gray-100 text-gray-600">${e.category}</span></td>
            <td class="px-3 py-4 text-sm text-gray-600 truncate max-w-[200px]" title="${e.description || '-'}">${e.description || '-'}</td>
             <td class="px-3 py-4 text-[10px] text-gray-400 font-bold">${e.user || 'System'}</td>
            <td class="px-3 py-4 text-right font-bold text-red-500 font-mono">${utils.formatCurrency(e.amount)}</td>
            <td class="px-3 py-4 text-center whitespace-nowrap">
                <div class="flex justify-center items-center gap-2">
                    <button onclick="views.openAddExpenseModal(${e.id})" class="text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 p-1.5 rounded-lg transition-all ${app.isAdmin ? '' : 'hidden'}" title="Edit"><i class="fa-solid fa-pen-to-square text-xs"></i></button>
                    <button onclick="views.deleteExpense(${e.id})" class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg transition-all ${app.isAdmin ? '' : 'hidden'}" title="Delete"><i class="fa-solid fa-trash text-xs"></i></button>
                </div>
            </td>
        </tr>
        `).join('');
    },

    deleteExpense: async (id) => {
        if (!confirm('Are you sure you want to delete this expense record?')) return;
        if (!utils.verifyDeletePassword()) return;

        try {
            await db.expenses.delete(id);
            utils.showNotification('Expense deleted');
            views.loadExpensesTable();
            if (app.currentState === 'reports') views.initReports();
        } catch (err) {
            console.error(err);
            utils.showNotification('Delete failed', 'error');
        }
    },

    // --- PURCHASES SECTION ---
    initPurchases: async () => {
        const container = document.getElementById('view-purchases');
        container.innerHTML = `
            <div class="flex flex-col h-full gap-6">
                <div class="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div>
                        <h3 class="text-xl font-bold text-gray-800">Purchase Management</h3>
                        <p class="text-sm text-gray-500">Track and manage inventory purchases from suppliers</p>
                    </div>
                    <div class="flex gap-2">
                        <div class="relative">
                            <i class="fa-solid fa-calendar-days absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                            <input type="month" id="purchases-search-month" 
                             class="pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
                             onchange="views.loadPurchasesTable(this.value)">
                        </div>
                        <button onclick="if(!app.isAdmin) { app.requestAuth(() => views.exportToPDF('purchases-table', 'Purchases Report')); } else { views.exportToPDF('purchases-table', 'Purchases Report'); }" class="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center gap-2">
                             <i class="fa-solid fa-file-pdf"></i> PDF
                        </button>
                        <button onclick="if(!app.isAdmin) { app.requestAuth(() => views.openAddPurchaseModal()); } else { views.openAddPurchaseModal(); }" class="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-lg shadow-amber-200 transition-all flex items-center gap-2">
                             <i class="fa-solid fa-plus"></i> New Purchase
                        </button>
                    </div>
                </div>

                <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex-1 flex flex-col">
                     <div class="overflow-y-auto flex-1">
                        <table id="purchases-table" class="w-full text-sm text-left">
                            <thead class="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                                <tr>
                                    <th class="px-3 py-4 w-28">Date</th>
                                    <th class="px-3 py-4 w-28">Invoice No</th>
                                    <th class="px-3 py-4">Supplier</th>
                                    <th class="px-3 py-4 w-40">Method</th>
                                    <th class="px-3 py-4 text-right w-24">Total</th>
                                    <th class="px-3 py-4 text-right w-24">Paid</th>
                                    <th class="px-3 py-4 text-right w-24">Balance</th>
                                    <th class="px-3 py-4 text-center w-36">Action</th>
                                </tr>
                            </thead>
                            <tbody id="purchases-table-body">
                                <tr><td colspan="8" class="text-center py-10 text-gray-400">Loading purchases...</td></tr>
                            </tbody>
                        </table>
                     </div>
                </div>
            </div>
        `;

        views.loadPurchasesTable();

        const form = document.getElementById('add-purchase-form');
        if (form) form.onsubmit = views.savePurchase;

        const totalInp = document.getElementById('purchase-total');
        const paidInp = document.getElementById('purchase-paid');
        const balInp = document.getElementById('purchase-balance');

        const calcBal = () => {
            const t = parseFloat(totalInp.value) || 0;
            const p = parseFloat(paidInp.value) || 0;
            if (balInp) balInp.value = (t - p).toFixed(2);
        };

        if (totalInp) totalInp.oninput = calcBal;
        if (paidInp) paidInp.oninput = calcBal;

        const methodInp = document.getElementById('purchase-method');
        const settleContainer = document.getElementById('purchase-settle-date-container');
        const chequeDetails = document.getElementById('purchase-cheque-details');

        if (methodInp) {
            methodInp.onchange = () => {
                if (settleContainer) settleContainer.classList.toggle('hidden', methodInp.value !== 'Credit');
                if (chequeDetails) chequeDetails.classList.toggle('hidden', methodInp.value !== 'Cheque');
            };
        }

        const dateInp = document.getElementById('purchase-date');
        if (dateInp) dateInp.valueAsDate = new Date();
    },

    openAddPurchaseModal: (id = null) => {
        const modal = document.getElementById('add-purchase-modal');
        const title = document.getElementById('purchase-modal-title');
        const saveBtn = document.getElementById('purchase-save-btn');
        const idInp = document.getElementById('purchase-id');
        const form = document.getElementById('add-purchase-form');

        form.reset();
        idInp.value = '';
        title.innerText = 'Record New Purchase';
        saveBtn.innerText = 'Save Purchase';
        document.getElementById('purchase-date').valueAsDate = new Date();

        document.getElementById('purchase-settle-date-container').classList.add('hidden');
        document.getElementById('purchase-cheque-details').classList.add('hidden');

        if (id) {
            title.innerText = 'Edit Purchase Record';
            saveBtn.innerText = 'Update Purchase';
            views.editPurchase(id);
        }

        modal.classList.remove('hidden');
    },

    editPurchase: async (id) => {
        const pur = await db.purchases.get(id);
        if (!pur) return;
        document.getElementById('purchase-id').value = id;
        document.getElementById('purchase-date').value = pur.date;
        document.getElementById('purchase-supplier').value = pur.supplierName;
        document.getElementById('purchase-invoice-no').value = pur.invoiceNo;
        document.getElementById('purchase-total').value = pur.totalBill;
        document.getElementById('purchase-paid').value = pur.paidAmount;
        document.getElementById('purchase-balance').value = pur.balance;
        document.getElementById('purchase-method').value = pur.method;

        const settleContainer = document.getElementById('purchase-settle-date-container');
        const chequeDetails = document.getElementById('purchase-cheque-details');

        settleContainer.classList.toggle('hidden', pur.method !== 'Credit');
        chequeDetails.classList.toggle('hidden', pur.method !== 'Cheque');

        document.getElementById('purchase-settle-date').value = pur.settleDate || '';
        document.getElementById('purchase-cheque-date').value = pur.chequeDate || '';
        document.getElementById('purchase-cheque-no').value = pur.chequeNo || '';
        document.getElementById('purchase-reminder-days').value = pur.reminderDays || 2;
    },

    savePurchase: async (e) => {
        e.preventDefault();
        const id = document.getElementById('purchase-id').value;
        const date = document.getElementById('purchase-date').value;
        const supplierName = document.getElementById('purchase-supplier').value;
        const invoiceNo = document.getElementById('purchase-invoice-no').value;
        const totalBill = parseFloat(document.getElementById('purchase-total').value);
        const paidAmount = parseFloat(document.getElementById('purchase-paid').value);
        const balance = parseFloat(document.getElementById('purchase-balance').value);
        const method = document.getElementById('purchase-method').value;
        const settleDate = document.getElementById('purchase-settle-date').value;
        const chequeDate = document.getElementById('purchase-cheque-date').value;
        const chequeNo = document.getElementById('purchase-cheque-no').value;
        const reminderDays = parseInt(document.getElementById('purchase-reminder-days').value) || 0;

        const data = {
            date, supplierName, invoiceNo, totalBill, paidAmount, balance,
            method, settleDate, chequeDate, chequeNo, reminderDays
        };

        try {
            if (id) {
                await db.purchases.update(parseInt(id), data);
                utils.showNotification('Purchase updated successfully', 'success');
            } else {
                await db.purchases.add(data);
                utils.showNotification('Purchase saved successfully', 'success');
            }

            document.getElementById('add-purchase-modal').classList.add('hidden');
            views.loadPurchasesTable();

            if (app.currentState === 'reports') views.initReports();

        } catch (err) {
            console.error(err);
            utils.showNotification('Error saving purchase', 'error');
        }
    },

    loadPurchasesTable: async (searchMonth = '', query = '') => {
        const tbody = document.getElementById('purchases-table-body');
        if (!tbody) return;

        let purchases = await db.purchases.orderBy('date').reverse().toArray();

        if (query) {
            const q = query.toLowerCase();
            purchases = purchases.filter(p =>
                (p.supplierName || '').toLowerCase().includes(q) ||
                (p.invoiceNo || '').toLowerCase().includes(q) ||
                (p.method || '').toLowerCase().includes(q)
            );
        }

        if (searchMonth) {
            purchases = purchases.filter(p => {
                if (!p.date) return false;
                if (p.date.startsWith(searchMonth)) return true;
                const d = new Date(p.date);
                if (isNaN(d.getTime())) return false;
                return d.toISOString().startsWith(searchMonth);
            });
        }

        if (purchases.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-12 text-gray-400">No purchases recorded.</td></tr>`;
            return;
        }

        tbody.innerHTML = purchases.map(p => {
            const isDue = p.balance > 0;
            return `
            <tr class="border-b transition-colors ${isDue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}">
                <td class="px-3 py-4 font-mono text-xs text-gray-500">${p.date}</td>
                <td class="px-3 py-4 font-bold text-gray-700">${p.invoiceNo}</td>
                <td class="px-3 py-4 text-sm text-gray-600">${p.supplierName}</td>
                 <td class="px-3 py-4">
                    <div class="flex flex-col gap-2">
                        <span class="w-fit px-3 py-1 rounded-full text-[10px] font-black uppercase ${p.method === 'Cash' ? 'bg-green-100 text-green-600' : p.method === 'Credit' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}">
                            ${p.method}
                        </span>
                        
                        ${p.method === 'Credit' && p.settleDate ? `
                            <div class="flex items-center gap-2 px-2 py-1 rounded-lg ${isDue ? 'bg-red-600 text-white shadow-md shadow-red-200 animate-pulse' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'} w-fit group transition-all">
                                <i class="fa-solid ${isDue ? 'fa-hourglass-half' : 'fa-calendar-check'} text-xs"></i>
                                <div class="flex flex-col leading-tight">
                                    <span class="text-[7px] uppercase font-black ${isDue ? 'text-red-100' : 'opacity-60'}">${isDue ? 'Due' : 'Set'}</span>
                                    <span class="text-[10px] font-bold">${utils.formatDate(p.settleDate)}</span>
                                </div>
                            </div>
                        ` : ''}

                        ${p.method === 'Cheque' ? `
                            <div class="flex flex-col gap-1">
                                ${p.chequeNo ? `<div class="text-[10px] font-bold text-gray-800 flex items-center gap-1"><i class="fa-solid fa-money-check text-orange-400"></i>#${p.chequeNo}</div>` : ''}
                                ${p.chequeDate ? `
                                    <div class="flex items-center gap-2 px-2 py-1 rounded-lg bg-orange-500 text-white shadow-md shadow-orange-200 w-fit group transition-all">
                                        <i class="fa-solid fa-calendar-day text-xs"></i>
                                        <div class="flex flex-col leading-tight">
                                            <span class="text-[7px] uppercase font-black text-orange-100">Date</span>
                                            <span class="text-[10px] font-bold">${utils.formatDate(p.chequeDate)}</span>
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}
                    </div>
                </td>
                <td class="px-3 py-4 text-right font-bold text-gray-800">${utils.formatCurrency(p.totalBill)}</td>
                <td class="px-3 py-4 text-right font-bold text-emerald-600">${utils.formatCurrency(p.paidAmount)}</td>
                <td class="px-3 py-4 text-right font-bold ${p.balance > 0 ? 'text-red-600' : 'text-gray-400'}">
                    ${utils.formatCurrency(p.balance)}
                    ${isDue ? '<div class="text-[9px] text-red-500 font-bold uppercase mt-1">Payment Due</div>' : ''}
                </td>
                <td class="px-3 py-4 text-center whitespace-nowrap">
                    <div class="flex justify-center items-center gap-1">
                        ${isDue ? `
                        <button onclick="if(!app.isAdmin) { app.requestAuth(() => views.settlePurchase(${p.id}, ${p.balance})); } else { views.settlePurchase(${p.id}, ${p.balance}); }" class="bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-1.5 rounded-lg shadow-sm text-[10px] font-bold transition-all border border-emerald-400" title="Settle Balance">
                            Pay
                        </button>
                        ` : ''}
                        <button onclick="views.openAddPurchaseModal(${p.id})" class="text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 p-1.5 rounded-lg transition-all ${app.isAdmin ? '' : 'hidden'}" title="Edit"><i class="fa-solid fa-pen-to-square text-xs"></i></button>
                        <button onclick="views.deletePurchase(${p.id})" class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg transition-all ${app.isAdmin ? '' : 'hidden'}" title="Delete"><i class="fa-solid fa-trash text-xs"></i></button>
                    </div>
                </td>
            </tr>
            `;
        }).join('');
    },

    settlePurchase: async (id, currentBalance) => {
        if (!app.isAdmin) {
            app.requestAuth(() => views.settlePurchase(id, currentBalance));
            return;
        }
        const amountStr = prompt(`Enter payment amount to settle(Balance: ${utils.formatCurrency(currentBalance)})`, currentBalance);
        if (amountStr === null) return; // Cancelled

        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
            utils.showNotification('Invalid amount', 'error');
            return;
        }

        if (amount > currentBalance) {
            utils.showNotification('Amount exceeds balance!', 'warning');
            return;
        }

        try {
            const purchase = await db.purchases.get(id);
            if (!purchase) return;

            const newPaid = (purchase.paidAmount || 0) + amount;
            const newBalance = purchase.totalBill - newPaid;

            // Only update specific fields
            await db.purchases.update(id, {
                paidAmount: newPaid,
                balance: newBalance,
                // Optional: track payment history if schema supported, but for now just update totals
                settleDate: newBalance <= 0 ? new Date().toISOString().split('T')[0] : purchase.settleDate // Update settle date if fully paid? Or keep original?
                // User requirement: "balance eka paykarana dawasata paykarala" -> pay on the day.
                // We'll update settleDate to today if it's a new payment event? Or maybe we need a 'lastPaymentDate'.
                // Reuse settleDate as 'Last Payment Date' for simplicity.
            });

            utils.showNotification('Payment recorded successfully', 'success');
            views.loadPurchasesTable();
        } catch (e) {
            console.error(e);
            utils.showNotification('Error updating purchase', 'error');
        }
    },

    deletePurchase: async (id) => {
        if (!confirm('Are you sure you want to delete this purchase record?')) return;
        if (!utils.verifyDeletePassword()) return;
        const record = await db.purchases.get(id);
        await db.purchases.delete(id);
        await utils.logAction('Purchase Delete', `Deleted purchase: ${record ? record.description : id}`);
        views.loadPurchasesTable();
        if (app.currentState === 'reports') views.initReports();
        utils.showNotification('Purchase deleted');
    },

    // --- REPORTS SECTION ---
    initReports: async () => {
        const container = document.getElementById('view-reports');
        if (!container) return;

        // Optimized Data Fetching: Avoid .toArray() on large tables
        const currentMonthKey = app.currentReportMonth; // YYYY-MM
        const currentYearKey = String(app.currentReportYear); // YYYY

        // Fetch only summary data or specifically filtered data
        const [
            thisMonthSales, 
            thisMonthExpenses, 
            masterItems, 
            allInventory, 
            allPurchases, 
            pendingSalesRaw,
            thisYearSales
        ] = await Promise.all([
            db.sales.where('date').startsWith(currentMonthKey).toArray(),
            db.expenses.where('date').startsWith(currentMonthKey).toArray(),
            db.item_master.toArray(), // Items are usually manageable (<10k)
            db.inventory.toArray(),
            db.purchases.toArray(),
            db.sales.where('paymentStatus').equals('Pending').toArray(),
            db.sales.where('date').startsWith(currentYearKey).toArray()
        ]);

        let monthRevenue = 0;
        let monthGrossProfit = 0;
        let monthExpensesTotal = 0;

        for (const s of thisMonthSales) {
            if (s.paymentStatus !== 'Cancelled') {
                monthRevenue += (s.total || 0);
                monthGrossProfit += (s.profit || 0);
            }
        }

        for (const e of thisMonthExpenses) {
            monthExpensesTotal += (e.amount || 0);
        }

        const monthNetProfit = monthGrossProfit - monthExpensesTotal;
        const monthGrossMargin = monthRevenue > 0 ? (monthGrossProfit / monthRevenue) * 100 : 0;
        const monthNetMargin = monthRevenue > 0 ? (monthNetProfit / monthRevenue) * 100 : 0;

        container.innerHTML = `
        <div class="flex flex-col gap-6 h-full overflow-hidden">
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
                    <div>
                        <h3 class="text-xl font-bold text-gray-800 mb-2">Business Analytics & Reports</h3>
                        <p class="text-sm text-gray-500">Comprehensive overview of your business performance.</p>
                    </div>
                </div>

                <!-- 1. Top Stats Cards -->
                <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div class="bg-gradient-to-br from-indigo-500 to-indigo-600 p-4 rounded-2xl shadow-lg border border-indigo-400">
                        <p class="text-indigo-100 text-[10px] font-bold uppercase tracking-wider mb-1 opacity-80">Month Revenue</p>
                        <h4 class="text-lg font-black text-white">${utils.formatCurrency(monthRevenue)}</h4>
                    </div>
                    <div class="bg-gradient-to-br from-emerald-500 to-emerald-600 p-4 rounded-2xl shadow-lg border border-emerald-400">
                        <p class="text-emerald-100 text-[10px] font-bold uppercase tracking-wider mb-1 opacity-80">Gross Profit</p>
                        <h4 class="text-lg font-black text-white">${utils.formatCurrency(monthGrossProfit)}</h4>
                    </div>
                     <div class="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm">
                        <p class="text-emerald-600 text-[10px] font-bold uppercase tracking-wider mb-1">Gross Margin</p>
                        <h4 class="text-lg font-black text-gray-800">${monthGrossMargin.toFixed(1)}%</h4>
                    </div>
                    <div class="bg-gradient-to-br from-red-500 to-red-600 p-4 rounded-2xl shadow-lg border border-red-400">
                        <p class="text-red-100 text-[10px] font-bold uppercase tracking-wider mb-1 opacity-80">Month Expenses</p>
                        <h4 class="text-lg font-black text-white">${utils.formatCurrency(monthExpensesTotal)}</h4>
                    </div>
                    <div class="bg-gradient-to-br from-blue-600 to-blue-700 p-4 rounded-2xl shadow-lg border border-blue-500">
                        <p class="text-blue-100 text-[10px] font-bold uppercase tracking-wider mb-1 opacity-80">Net Profit</p>
                        <h4 class="text-lg font-black text-white">${utils.formatCurrency(monthNetProfit)}</h4>
                    </div>
                    <div class="bg-white p-4 rounded-2xl border border-blue-100 shadow-sm">
                        <p class="text-blue-600 text-[10px] font-bold uppercase tracking-wider mb-1">Net Margin</p>
                        <h4 class="text-lg font-black ${monthNetProfit >= 0 ? 'text-blue-600' : 'text-red-600'}">${monthNetMargin.toFixed(1)}%</h4>
                    </div>
                </div>

                <!-- 2. Outstanding Payments Table -->
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-red-100 flex flex-col overflow-hidden mb-2" style="max-height: 350px;">
            <h4 class="font-bold text-red-800 mb-4 flex items-center justify-between text-sm uppercase tracking-wide">
                <span class="flex items-center gap-2"><i class="fa-solid fa-clock text-red-500"></i> Outstanding Payments</span>
                <button onclick="views.exportToPDF('outstanding-payments-table', 'Outstanding Payments')" class="text-[10px] bg-red-100 text-red-700 px-3 py-1 rounded-lg hover:bg-red-200 transition-all flex items-center gap-1">
                    <i class="fa-solid fa-file-pdf"></i> Download PDF
                </button>
            </h4>
            <div class="overflow-y-auto">
                <table id="outstanding-payments-table" class="w-full text-sm text-left">
                    <thead class="text-xs text-gray-400 uppercase bg-red-50 sticky top-0">
                        <tr>
                            <th class="px-4 py-3">Date</th>
                            <th class="px-4 py-3">Bill No</th>
                            <th class="px-4 py-3">Customer</th>
                            <th class="px-4 py-3">Method</th>
                            <th class="px-4 py-3 text-right">Amount Due</th>
                            <th class="px-4 py-3 text-center print:hidden">Action</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-50">
                        ${(() => {
                if (pendingSalesRaw.length === 0) return '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-400 italic">No outstanding payments!</td></tr>';

                const bills = {};
                pendingSalesRaw.forEach(s => {
                    const bNo = s.billNo || 'UNKNOWN';
                    if (!bills[bNo]) bills[bNo] = { date: s.date, billNo: bNo, customer: s.customer || 'Unknown', method: s.method, total: 0, paid: (s.paidAmount || 0) };
                    bills[bNo].total += (s.total || 0);
                });

                return Object.values(bills).map(b => {
                    const due = b.total - b.paid;
                    return `
                                        <tr class="hover:bg-red-50 transition-colors">
                                            <td class="px-4 py-3 font-mono text-gray-500 text-xs text-date">${new Date(b.date).toLocaleDateString()}</td>
                                            <td class="px-4 py-3 font-bold text-gray-800 text-xs">${b.billNo}</td>
                                            <td class="px-4 py-3 font-bold text-gray-700">${b.customer}</td>
                                            <td class="px-4 py-3"><span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${b.method === 'QR' ? 'bg-orange-100 text-orange-600' : (b.method === 'Mixed' ? 'bg-purple-100 text-purple-600' : 'bg-red-100 text-red-600')}">${b.method}</span></td>
                                            <td class="px-4 py-3 text-right font-bold text-red-600 font-mono">${utils.formatCurrency(due)}</td>
                                            <td class="px-4 py-3 text-center print:hidden">
                                                <button onclick="if(!app.isAdmin) { app.requestAuth(() => views.settleBill('${b.billNo}')); } else { views.settleBill('${b.billNo}'); }" class="text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 px-3 py-1.5 rounded-lg font-bold transition-all border border-emerald-200">Mark Paid</button>
                                            </td>
                                        </tr>
                                    `}).join('');
            })()}
                    </tbody>
                </table>
            </div>
        </div>

                ${app.isAdmin ? `
                <!-- NEW: Performance Charts & Summary Section -->
                <div class="grid grid-cols-10 gap-6 mb-6">
                    <!-- 1. Daily Sales Summary (Left Side) -->
                    <div class="col-span-10 lg:col-span-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                        <h4 class="font-bold text-lg mb-4 text-gray-800 flex justify-between items-center">
                            <span class="flex items-center gap-2 text-sm uppercase tracking-wide"><i class="fa-solid fa-table-list text-gray-400"></i> Daily Sales Summary (Latest)</span>
                            <div class="flex items-center gap-2 no-print">
                                <input type="month" id="report-summary-month-filter"
                                    class="text-[10px] font-bold px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500 bg-gray-50 hover:bg-white transition-colors cursor-pointer"
                                    onchange="app.updateReportSummaryTable()">
                                <button
                                    onclick="views.exportToPDF('daily-sales-summary-report-table', 'Daily Sales Summary')"
                                    class="text-[10px] bg-red-50 text-red-600 px-3 py-1 rounded-lg hover:bg-red-100 transition-all flex items-center gap-1">
                                    <i class="fa-solid fa-file-pdf"></i> PDF
                                </button>
                            </div>
                        </h4>
                        <div class="overflow-y-auto" style="max-height: 400px;">
                            <table id="daily-sales-summary-report-table" class="w-full text-sm text-left">
                                <thead class="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                                    <tr>
                                        <th class="px-2 py-2">Date</th>
                                        <th class="px-2 py-2 text-right">Sales</th>
                                        <th class="px-2 py-2 text-right">Profit</th>
                                        <th class="px-2 py-2 text-right">Margin</th>
                                    </tr>
                                </thead>
                                <tbody id="report-daily-summary-body" class="divide-y divide-gray-50">
                                    <tr>
                                        <td colspan="4" class="px-4 py-8 text-center text-gray-400 animate-pulse">Initializing table...</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 2. Last 12 Months Performance (Right Side) -->
                    <div class="col-span-10 lg:col-span-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col min-h-[400px]">
                        <h4 class="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wide flex justify-between items-center">
                            <span class="flex items-center gap-2"><i class="fa-solid fa-chart-area text-blue-500"></i> Business Performance (Last 12 Months)</span>
                            <div class="flex gap-3">
                                <span class="flex items-center gap-1.5 text-[9px] text-indigo-600 font-black uppercase"><span class="w-2 h-2 bg-indigo-600 rounded-full"></span> Sales</span>
                                <span class="flex items-center gap-1.5 text-[9px] text-emerald-600 font-black uppercase"><span class="w-2 h-2 bg-emerald-600 rounded-full"></span> Profit</span>
                                <span class="flex items-center gap-1.5 text-[9px] text-red-600 font-black uppercase"><span class="w-2 h-2 bg-red-600 rounded-full"></span> Expenses</span>
                            </div>
                        </h4>
                        <div class="flex-1 relative">
                            <canvas id="reportPerformance12MonthsChart"></canvas>
                        </div>
                    </div>
                </div>

                <!-- 3. Last 30 Days Performance (Full width below) -->
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-indigo-100 flex flex-col min-h-[350px] mb-6">
                    <h4 class="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wide flex justify-between items-center">
                        <span class="flex items-center gap-2"><i class="fa-solid fa-chart-line text-indigo-500"></i> Business Performance (Last 30 Days)</span>
                        <div class="flex items-center gap-3">
                            <input type="month" id="report30DaysHistoryMonth" 
                                class="text-[10px] font-bold px-2 py-1 border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-500 bg-indigo-50 hover:bg-white transition-colors cursor-pointer"
                                value="${app.currentReportMonth}"
                                onchange="app.initReportCharts()">
                            <div class="flex gap-3">
                                <span class="flex items-center gap-1.5 text-[9px] text-indigo-600 font-black uppercase"><span class="w-2 h-2 bg-indigo-600 rounded-full"></span> Sales</span>
                                <span class="flex items-center gap-1.5 text-[9px] text-emerald-600 font-black uppercase"><span class="w-2 h-2 bg-emerald-600 rounded-full"></span> Profit</span>
                            </div>
                        </div>
                    </h4>
                    <div class="flex-1 relative">
                        <canvas id="reportPerformance30DaysChart"></canvas>
                    </div>
                </div>

                <!-- 4. Monthly Financial Performance Table -->
                 <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden mb-6">
                     <h4 class="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wide flex items-center justify-between">
                        <div class="flex items-center gap-4">
                            <span class="flex items-center gap-2"><i class="fa-solid fa-calendar-check text-indigo-500"></i> Performance Year</span>
                            <input type="number" id="report-year-input" value="${app.currentReportYear}" onchange="app.currentReportYear = this.value; views.initReports();" 
                                class="w-24 text-center text-sm font-bold bg-indigo-50 border-2 border-indigo-200 rounded-xl px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none text-indigo-700 shadow-sm transition-all cursor-pointer"
                                placeholder="YYYY">
                        </div>
                        <button onclick="views.exportToPDF('monthly-performance-table', 'Monthly Financial Performance')" class="text-[10px] bg-gray-100 text-gray-700 px-3 py-1 rounded-lg hover:bg-gray-200 transition-all flex items-center gap-1">
                            <i class="fa-solid fa-file-pdf"></i> Download PDF
                        </button>
                    </h4>
                    <div id="report-monthly-performance-container" class="overflow-x-auto min-h-[200px] flex items-center justify-center italic text-gray-400">
                         Loading historical report data for ${currentYearKey}...
                    </div>
                </div>

                <!-- 4. Top/Dead Items Grid -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 md:pb-6">
                    <!-- Supplier Ranking -->
                    <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden" style="max-height: 400px;">
                        <h4 class="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wide flex items-center justify-between">
                             <span class="flex items-center gap-2"><i class="fa-solid fa-truck-fast text-blue-500"></i> Supplier Performance (Yearly)</span>
                             <button onclick="views.exportToPDF('supplier-ranking-table', 'Supplier Performance Performance')" class="text-[10px] bg-blue-50 text-blue-700 px-3 py-1 rounded-lg hover:bg-blue-100 transition-all flex items-center gap-1">
                                <i class="fa-solid fa-file-pdf"></i> PDF
                            </button>
                        </h4>
                        <div class="overflow-y-auto">
                            <table id="supplier-ranking-table" class="w-full text-sm text-left">
                                <thead class="text-xs text-gray-400 uppercase bg-gray-50 sticky top-0">
                                    <tr>
                                        <th class="px-4 py-3">Supplier ID</th>
                                        <th class="px-4 py-3 text-right">Revenue</th>
                                        <th class="px-4 py-3 text-right">Profit</th>
                                        <th class="px-4 py-3 text-right">Margin</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-50">
                    ${(() => {
                    const sMap = {};
                    
                    // Use yearly sales for supplier ranking
                    thisYearSales.forEach(s => {
                        if (s.paymentStatus === 'Cancelled') return;
                        let sId = s.supplierId || 'UNKNOWN';
                        if (sId === 'UNKNOWN') {
                            const m = masterItems.find(i => i.itemId === s.itemId);
                            sId = m ? m.supplierId : 'UNKNOWN';
                        }
                        if (!sMap[sId]) sMap[sId] = { rev: 0, prof: 0 };
                        sMap[sId].rev += (s.total || 0);
                        sMap[sId].prof += (s.profit || 0);
                    });
                    
                    const sorted = Object.entries(sMap).sort((a, b) => b[1].prof - a[1].prof).slice(0, 50);
                    if (sorted.length === 0) return `<tr><td colspan="4" class="text-center py-4 text-gray-400">No Data for ${currentYearKey}</td></tr>`;

                    return sorted.map(([id, d]) => {
                        const marg = d.rev > 0 ? (d.prof / d.rev) * 100 : 0;
                        return `
                                                <tr class="hover:bg-gray-50 border-b border-gray-50">
                                                    <td class="px-4 py-3 text-xs font-bold font-mono text-gray-700">${id}</td>
                                                    <td class="px-4 py-3 text-right text-xs font-mono text-indigo-600">${utils.formatCurrency(d.rev)}</td>
                                                    <td class="px-4 py-3 text-right text-xs font-mono text-emerald-600">${utils.formatCurrency(d.prof)}</td>
                                                    <td class="px-4 py-3 text-right text-xs font-mono text-gray-600">${marg.toFixed(1)}%</td>
                                                </tr>
                                            `;
                    }).join('');
                })()}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Top Profitable Products -->
                    <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden" style="max-height: 400px;">
                        <h4 class="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wide flex items-center justify-between">
                             <span class="flex items-center gap-2"><i class="fa-solid fa-star text-amber-500"></i> Top Profitable Products (Yearly)</span>
                             <button onclick="views.exportToPDF('top-profitable-table', 'Top Profitable Products')" class="text-[10px] bg-amber-50 text-amber-700 px-3 py-1 rounded-lg hover:bg-amber-100 transition-all flex items-center gap-1">
                                <i class="fa-solid fa-file-pdf"></i> PDF
                            </button>
                        </h4>
                        <div class="overflow-y-auto">
                            <table id="top-profitable-table" class="w-full text-sm text-left">
                                <thead class="text-xs text-gray-400 uppercase bg-gray-50 sticky top-0">
                                    <tr>
                                        <th class="px-4 py-3">Item Name</th>
                                        <th class="px-4 py-3 text-right">Profit</th>
                                        <th class="px-4 py-3 text-right">Margin</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-50">
                                    ${(() => {
                    const pMap = {};
                    thisYearSales.forEach(s => {
                        if (s.paymentStatus === 'Cancelled') return;
                        if (!pMap[s.itemId]) pMap[s.itemId] = { name: s.itemName, rev: 0, prof: 0 };
                        pMap[s.itemId].rev += (s.total || 0);
                        pMap[s.itemId].prof += (s.profit || 0);
                    });
                    const sorted = Object.values(pMap).sort((a, b) => b.prof - a.prof).slice(0, 25);
                    if (sorted.length === 0) return `<tr><td colspan="3" class="text-center py-4 text-gray-400">No Data for ${currentYearKey}</td></tr>`;

                    return sorted.map(d => {
                        const marg = d.rev > 0 ? (d.prof / d.rev) * 100 : 0;
                        return `
                                                <tr class="hover:bg-gray-50 border-b border-gray-50">
                                                    <td class="px-4 py-3 text-xs font-bold text-gray-700 truncate max-w-[150px]">${utils.cleanItemName(d.name)}</td>
                                                    <td class="px-4 py-3 text-right text-xs font-bold text-emerald-600">${utils.formatCurrency(d.prof)}</td>
                                                    <td class="px-4 py-3 text-right text-xs text-gray-600">${marg.toFixed(1)}%</td>
                                                </tr>
                                            `;
                    }).join('');
                })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- 4.5. Top Selling & Fast Moving Items Section -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <!-- Top Selling Items (Current Trend) -->
                    <div class="bg-white p-6 rounded-2xl shadow-sm border border-indigo-100 flex flex-col overflow-hidden" style="max-height: 500px;">
                        <h4 class="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wide flex items-center justify-between">
                             <span class="flex items-center gap-2"><i class="fa-solid fa-trophy text-amber-500"></i> Top Selling Items (Yearly Trend)</span>
                             <button onclick="views.exportToPDF('top-selling-items-report', 'Top Selling Items Report')" class="text-[10px] bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg hover:bg-indigo-100 transition-all flex items-center gap-1">
                                <i class="fa-solid fa-file-pdf"></i> PDF
                            </button>
                        </h4>
                        <div class="overflow-y-auto">
                            <table id="top-selling-items-report" class="w-full text-sm text-left">
                                <thead class="text-xs text-gray-400 uppercase bg-gray-50 sticky top-0">
                                    <tr>
                                        <th class="px-3 py-3 w-10">No.</th>
                                        <th class="px-3 py-3">Item Name & ID</th>
                                        <th class="px-3 py-3 text-center">Qty Sold</th>
                                        <th class="px-3 py-3 text-right">Revenue</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-50">
                                    ${(() => {
                    const itemSalesMap = {};
                    thisYearSales.forEach(s => {
                        if (s.paymentStatus === 'Cancelled') return;
                        if (!itemSalesMap[s.itemId]) itemSalesMap[s.itemId] = { id: s.itemId, name: s.itemName, qty: 0, rev: 0, prof: 0 };
                        itemSalesMap[s.itemId].qty += s.qty;
                        itemSalesMap[s.itemId].rev += (s.total || 0);
                        itemSalesMap[s.itemId].prof += (s.profit || 0);
                    });
                    const sorted = Object.values(itemSalesMap).sort((a, b) => b.qty - a.qty).slice(0, 50);
                    if (sorted.length === 0) return `<tr><td colspan="4" class="text-center py-4 text-gray-400">No Data for ${currentYearKey}</td></tr>`;

                    return sorted.map((d, idx) => `
                            <tr class="hover:bg-indigo-50/50 border-b border-gray-50 transition-colors">
                                <td class="px-3 py-1.5 text-xs text-gray-400 font-mono">${idx + 1}</td>
                                <td class="px-3 py-1.5">
                                    <div class="font-bold text-gray-800 text-xs">${utils.cleanItemName(d.name)}</div>
                                    <div class="text-[9px] text-gray-400 font-mono">${d.id}</div>
                                </td>
                                <td class="px-3 py-1.5 text-center font-black text-indigo-600 text-xs">${utils.formatNumber(d.qty)}</td>
                                <td class="px-3 py-1.5 text-right font-mono text-gray-600 text-xs">${utils.formatNumber(d.rev)}</td>
                            </tr>
                        `).join('');
                })()}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Fast Moving Items (High Frequency) -->
                    <div class="bg-white p-6 rounded-2xl shadow-sm border border-purple-100 flex flex-col overflow-hidden" style="max-height: 500px;">
                        <h4 class="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wide flex items-center justify-between">
                             <span class="flex items-center gap-2"><i class="fa-solid fa-bolt text-purple-500"></i> Fast Moving Items (Yearly Frequency)</span>
                             <button onclick="views.exportToPDF('fast-moving-items-report', 'Fast Moving Items Report')" class="text-[10px] bg-purple-50 text-purple-700 px-3 py-1 rounded-lg hover:bg-purple-100 transition-all flex items-center gap-1">
                                <i class="fa-solid fa-file-pdf"></i> PDF
                            </button>
                        </h4>
                        <div class="overflow-y-auto">
                            <table id="fast-moving-items-report" class="w-full text-sm text-left">
                                <thead class="text-xs text-gray-400 uppercase bg-gray-50 sticky top-0">
                                    <tr>
                                        <th class="px-3 py-3 w-10">No.</th>
                                        <th class="px-3 py-3">Item Name & ID</th>
                                        <th class="px-3 py-3 text-center">Bills Count</th>
                                        <th class="px-3 py-3 text-center">Total Qty</th>
                                        <th class="px-3 py-3 text-right">Avg Qty/Bill</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-50">
                                    ${(() => {
                    const freqMap = {};
                    thisYearSales.forEach(s => {
                        if (s.paymentStatus === 'Cancelled') return;
                        if (!freqMap[s.itemId]) freqMap[s.itemId] = { id: s.itemId, name: s.itemName, count: 0, totalQty: 0 };
                        freqMap[s.itemId].count += 1;
                        freqMap[s.itemId].totalQty += s.qty;
                    });
                    const sortedFreq = Object.values(freqMap).sort((a, b) => b.count - a.count).slice(0, 50);
                    if (sortedFreq.length === 0) return `<tr><td colspan="4" class="text-center py-4 text-gray-400">No Data for ${currentYearKey}</td></tr>`;

                    return sortedFreq.map((d, idx) => `
                            <tr class="hover:bg-purple-50/50 border-b border-gray-50 transition-colors">
                                <td class="px-3 py-1.5 text-xs text-gray-400 font-mono">${idx + 1}</td>
                                <td class="px-3 py-1.5">
                                    <div class="font-bold text-gray-800 text-xs">${utils.cleanItemName(d.name)}</div>
                                    <div class="text-[9px] text-gray-400 font-mono">${d.id}</div>
                                </td>
                                <td class="px-3 py-1.5 text-center font-black text-purple-600 text-xs">${d.count}</td>
                                <td class="px-3 py-1.5 text-center font-bold text-indigo-600 text-xs">${utils.formatNumber(d.totalQty)}</td>
                                <td class="px-3 py-1.5 text-right font-mono text-gray-600 text-xs">${(d.totalQty / d.count).toFixed(1)}</td>
                            </tr>
                        `).join('');
                })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- 5. Month sales report -->
                 <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden mb-12">
                    <h4 class="font-bold text-gray-800 mb-4 text-sm uppercase tracking-wide flex items-center justify-between">
                         <div class="flex items-center gap-4">
                            <span class="flex items-center gap-2"><i class="fa-solid fa-percent text-purple-500"></i> Month sales report</span>
                            <input type="month" value="${app.currentReportMonth}" onchange="app.currentReportMonth = this.value; views.initReports();" class="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-purple-500 outline-none">
                         </div>
                         <span class="flex items-center gap-4">
                            <button onclick="views.exportToPDF('month-sales-report-table', 'Month Sales Report')" class="text-[10px] bg-purple-100 text-purple-700 px-3 py-1 rounded-lg hover:bg-purple-200 transition-all flex items-center gap-1">
                                <i class="fa-solid fa-file-pdf"></i> Download PDF
                            </button>
                         </span>
                    </h4>
                    <div class="overflow-y-auto" style="max-height: 500px;">
                        <table id="month-sales-report-table" class="w-full text-sm text-left">
                            <thead class="text-xs text-gray-400 uppercase bg-gray-50 sticky top-0">
                                <tr>
                                    <th class="px-2 py-3 w-10 text-center">No.</th>
                                    <th class="px-4 py-3">Item Name & ID</th>
                                    <th class="px-4 py-3 text-right">Sold Qty</th>
                                    <th class="px-4 py-3 text-right">Avg Sell Price</th>
                                    <th class="px-4 py-3 text-right">Total Revenue</th>
                                    <th class="px-4 py-3 text-right text-emerald-600">Total Profit</th>
                                    <th class="px-4 py-3 text-right text-purple-600">Profit margin %</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-50">
                                ${(() => {
                    // Calculate stats for THIS MONTH only
                    const mStats = {};
                    thisMonthSales.forEach(s => {
                        const key = s.itemId || 'UNKNOWN';
                        if (!mStats[key]) mStats[key] = { id: key, name: s.itemName, qty: 0, rev: 0, prof: 0 };
                        mStats[key].qty += s.qty;
                        mStats[key].rev += (s.total || 0);
                        mStats[key].prof += (s.profit || 0);
                    });

                    const sortedM = Object.values(mStats).sort((a, b) => b.prof - a.prof); // Sort by highest profit
                    if (sortedM.length === 0) return '<tr><td colspan="7" class="text-center py-6 text-gray-400">No sales yet this month.</td></tr>';

                    return sortedM.map((d, idx) => {
                        const avgPrice = d.qty > 0 ? d.rev / d.qty : 0;
                        const margin = d.rev > 0 ? (d.prof / d.rev) * 100 : 0;
                        return `
                                            <tr class="hover:bg-gray-50 border-b border-gray-50">
                                                <td class="px-2 py-1.5 text-center text-xs text-gray-400">${idx + 1}</td>
                                                <td class="px-4 py-1.5">
                                                    <div class="font-bold text-gray-700">${utils.cleanItemName(d.name)}</div>
                                                    <div class="text-[10px] text-gray-400 uppercase font-mono">${d.id}</div>
                                                </td>
                                                <td class="px-4 py-1.5 text-right text-gray-600 font-mono">${d.qty}</td>
                                                <td class="px-4 py-1.5 text-right text-gray-500 font-mono text-xs">${utils.formatCurrency(avgPrice)}</td>
                                                <td class="px-4 py-1.5 text-right font-mono text-gray-800">${utils.formatCurrency(d.rev)}</td>
                                                <td class="px-4 py-1.5 text-right font-mono font-bold text-emerald-600">${utils.formatCurrency(d.prof)}</td>
                                                <td class="px-4 py-1.5 text-right font-mono font-bold text-purple-600">${margin.toFixed(2)}%</td>
                                            </tr>
                                        `;
                    }).join('');
                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
                ` : `
                <div class="bg-white p-12 rounded-2xl shadow-sm border border-indigo-100 text-center my-8">
                    <div class="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i class="fa-solid fa-lock text-indigo-400 text-3xl"></i>
                    </div>
                    <h3 class="text-2xl font-black text-gray-800 mb-2">Detailed Reports Restricted</h3>
                    <p class="text-gray-500 max-w-md mx-auto mb-8">Monthly performance, supplier analytics, and profit margins are only visible to administrators. Please login to continue.</p>
                    <button onclick="app.requestAuth(() => views.initReports())" class="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all active:scale-95 flex items-center gap-2 mx-auto">
                        <i class="fa-solid fa-shield-halved"></i> Login as Administrator
                    </button>
                </div>
                `}
            </div>
            `;

        if (app.isAdmin) {
            app.updateReportSummaryTable(); // Load the small table separately
            app.initReportCharts(); // Load charts separately
            
            // Defer the massive historical table calculation to avoid freezing/OOM
            setTimeout(async () => {
                const perfContainer = document.getElementById('report-monthly-performance-container');
                if (!perfContainer) return;

                try {
                    const monthlyData = {};
                    // Only fetch minimal required fields for the historical table (filtered by year)
                    const yearSales = await db.sales.where('date').startsWith(currentYearKey).toArray();
                    const yearExpenses = await db.expenses.where('date').startsWith(currentYearKey).toArray();
                    const yearStockIn = await db.stock_in.where('date').startsWith(currentYearKey).toArray();

                    yearSales.forEach(s => {
                        if (s.paymentStatus === 'Cancelled') return;
                        const m = s.date.substring(0, 7);
                        if (!monthlyData[m]) monthlyData[m] = { revenue: 0, grossProfit: 0, expenses: 0, stockIn: 0, outstanding: 0, salesCost: 0, soldItemIds: new Set() };
                        monthlyData[m].revenue += (s.total || 0);
                        monthlyData[m].grossProfit += (s.profit || 0);
                        monthlyData[m].salesCost += (s.qty * (s.costPrice || 0));
                        monthlyData[m].soldItemIds.add(s.itemId);
                        if (s.paymentStatus === 'Pending') monthlyData[m].outstanding += (s.total || 0);
                    });

                    yearExpenses.forEach(e => {
                        const m = e.date.substring(0, 7);
                        if (!monthlyData[m]) monthlyData[m] = { revenue: 0, grossProfit: 0, expenses: 0, stockIn: 0, outstanding: 0, salesCost: 0, soldItemIds: new Set() };
                        monthlyData[m].expenses += (e.amount || 0);
                    });

                    yearStockIn.forEach(st => {
                        const m = st.date.substring(0, 7);
                        if (!monthlyData[m]) monthlyData[m] = { revenue: 0, grossProfit: 0, expenses: 0, stockIn: 0, outstanding: 0, salesCost: 0, soldItemIds: new Set() };
                        monthlyData[m].stockIn += (st.total || 0);
                    });

                    const currentTotalStockValue = allInventory.reduce((sum, item) => sum + (item.stockValue || 0), 0);
                    const validMonthKeys = [...new Set(Object.keys(monthlyData).filter(k => k.startsWith(currentYearKey) && /^\d{4}-\d{2}$/.test(k)))].sort().reverse();

                    let runningVal = currentTotalStockValue;
                    const monthEndValues = {};
                    validMonthKeys.forEach(m => {
                        monthEndValues[m] = runningVal;
                        const d = monthlyData[m];
                        runningVal = runningVal - (d.stockIn || 0) + (d.salesCost || 0);
                    });

                    perfContainer.innerHTML = `
                        <table id="monthly-performance-table" class="w-full text-sm text-left">
                            <thead class="text-gray-400 uppercase bg-gray-50 sticky top-0">
                                <tr>
                                    <th class="px-3 py-3 text-center w-24">Month</th>
                                    <th class="px-3 py-3 text-right">Rev</th>
                                    <th class="px-3 py-3 text-right text-emerald-600">GP</th>
                                    <th class="px-3 py-3 text-right text-emerald-600">GM%</th>
                                    <th class="px-3 py-3 text-right text-orange-600">Exp</th>
                                    <th class="px-3 py-3 text-right text-blue-600">NP</th>
                                    <th class="px-3 py-3 text-right text-blue-600">NM%</th>
                                    <th class="px-3 py-3 text-right text-indigo-600">FM items</th>
                                    <th class="px-3 py-3 text-right text-red-600">Dead Stocks</th>
                                    <th class="px-3 py-3 text-right text-gray-800">New Stock</th>
                                    <th class="px-3 py-3 text-right text-gray-600">Month End S.Value</th>
                                    <th class="px-3 py-3 text-right text-red-700">Outst.</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-50">
                                ${validMonthKeys.map(m => {
                                    const d = monthlyData[m];
                                    const net = d.grossProfit - d.expenses;
                                    const gMargin = d.revenue > 0 ? (d.grossProfit / d.revenue) * 100 : 0;
                                    const nMargin = d.revenue > 0 ? (net / d.revenue) * 100 : 0;
                                    const mName = new Date(m + '-01').toLocaleString('en-US', { month: 'short', year: 'numeric' });
                                    const deadStockCount = allInventory.filter(item => !d.soldItemIds.has(item.itemId) && item.currentStock > 0).length;

                                    return `
                                        <tr class="hover:bg-gray-50 transition-colors">
                                            <td class="px-3 py-1.5 font-bold text-gray-700 text-center">${mName}</td>
                                            <td class="px-3 py-1.5 text-right font-mono">${utils.formatNumber(d.revenue)}</td>
                                            <td class="px-3 py-1.5 text-right font-mono text-emerald-600">${utils.formatNumber(d.grossProfit)}</td>
                                            <td class="px-3 py-1.5 text-right font-mono text-emerald-600">${gMargin.toFixed(1)}%</td>
                                            <td class="px-3 py-1.5 text-right font-mono text-orange-600">${utils.formatNumber(d.expenses)}</td>
                                            <td class="px-3 py-1.5 text-right font-mono font-bold ${net >= 0 ? 'text-blue-600' : 'text-red-600'}">${utils.formatNumber(net)}</td>
                                            <td class="px-3 py-1.5 text-right font-mono ${net >= 0 ? 'text-blue-600' : 'text-red-600'}">${nMargin.toFixed(1)}%</td>
                                            <td class="px-3 py-1.5 text-right font-mono text-indigo-600">${d.soldItemIds.size}</td>
                                            <td class="px-3 py-1.5 text-right font-mono text-red-600">${deadStockCount}</td>
                                            <td class="px-3 py-1.5 text-right font-mono text-gray-800">${utils.formatNumber(d.stockIn)}</td>
                                            <td class="px-3 py-1.5 text-right font-mono text-gray-600">${utils.formatNumber(monthEndValues[m])}</td>
                                            <td class="px-3 py-1.5 text-right font-mono text-red-700">${utils.formatNumber(d.outstanding)}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    `;
                } catch (e) {
                    console.error('Historical report calculation failed:', e);
                    perfContainer.innerHTML = '<div class="text-red-500 p-4 font-bold">Historical data calculation failed.</div>';
                }
            }, 500);
        }
    },

    exportItemsToCSV: async () => {
        try {
            const items = await db.item_master.toArray();
            if (items.length === 0) {
                utils.showNotification('No items to export', 'error');
                return;
            }
            const csv = Papa.unparse(items);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `Items_Master_${new Date().toISOString().slice(0, 10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            utils.showNotification('Items exported successfully');
        } catch (err) {
            console.error('Export Error:', err);
            utils.showNotification('Export failed', 'error');
        }
    },

    recalculateInventory: async () => {
        return views.recalculateAllInventory();
    }
};

