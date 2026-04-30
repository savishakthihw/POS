if (purchases.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-12 text-gray-400">No purchases recorded.</td></tr>`;
    return;
}

tbody.innerHTML = purchases.map(p => {
    const isDue = p.balance > 0;
    return `
            <tr class="border-b transition-colors ${isDue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}">
                <td class="px-6 py-4 font-mono text-xs text-gray-500">${p.date}</td>
                <td class="px-6 py-4 font-bold text-gray-700">${p.invoiceNo}</td>
                <td class="px-6 py-4 text-sm text-gray-600">${p.supplierName}</td>
                 <td class="px-6 py-4">
                    <span class="px-3 py-1 rounded-full text-[10px] font-bold uppercase ${p.method === 'Cash' ? 'bg-green-100 text-green-600' : p.method === 'Credit' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}">
                        ${p.method}
                    </span>
                    ${p.method === 'Credit' && p.settleDate ? `<div class="text-[9px] text-gray-400 mt-1">Settle: ${p.settleDate}</div>` : ''}
                    ${p.method === 'Cheque' && p.chequeNo ? `<div class="text-[9px] text-gray-400 mt-1">#${p.chequeNo} (${p.chequeDate})</div>` : ''}
                </td>
                <td class="px-6 py-4 text-right font-bold text-gray-800">${utils.formatCurrency(p.totalBill)}</td>
                <td class="px-6 py-4 text-right font-bold text-emerald-600">${utils.formatCurrency(p.paidAmount)}</td>
                <td class="px-6 py-4 text-right font-bold ${p.balance > 0 ? 'text-red-600' : 'text-gray-400'}">
                    ${utils.formatCurrency(p.balance)}
                    ${isDue ? '<div class="text-[10px] text-red-500 font-bold uppercase mt-1">Payment Due</div>' : ''}
                </td>
                <td class="px-4 py-4 text-center whitespace-nowrap">
                    ${isDue ? `
                    <button onclick="views.settlePurchase(${p.id}, ${p.balance})" class="bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-1 rounded shadow-sm text-xs mr-2 transition-colors" title="Settle Balance">
                        <i class="fa-solid fa-money-bill-wave"></i> Pay
                    </button>
                    ` : ''}
                    <button onclick="views.openAddPurchaseModal(${p.id})" class="text-blue-400 hover:text-blue-600 transition-colors mr-3 p-1 ${app.isAdmin ? '' : 'hidden'}"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button onclick="views.deletePurchase(${p.id})" class="text-red-300 hover:text-red-500 transition-colors p-1 ${app.isAdmin ? '' : 'hidden'}"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
            `;
}).join('');
