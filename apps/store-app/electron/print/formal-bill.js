/**
 * formal-bill.js
 * Runs inside the hidden Electron BrowserWindow.
 * Reads window.BILL_DATA (injected by the main process via executeJavaScript)
 * and renders a professional A4 wholesale invoice into #bill-root.
 */

(function () {
  'use strict';

  function fmt(amount, currency, exchangeRate) {
    if (currency === 'USD' && exchangeRate > 0) {
      const usd = amount / exchangeRate;
      return '$' + usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return amount.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' LL';
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function labelMap(lang) {
    const labels = {
      en: {
        invoice: 'Invoice',
        billNo: 'Bill No',
        date: 'Date',
        customer: 'Customer',
        phone: 'Phone',
        payment: 'Payment',
        no: '#',
        product: 'Product',
        qty: 'Qty',
        weight: 'Weight',
        unitPrice: 'Unit Price',
        total: 'Total',
        subtotal: 'Subtotal',
        prevBalance: 'Prev. Balance',
        grandTotal: 'Grand Total',
        items: 'Items',
      },
      ar: {
        invoice: 'فاتورة',
        billNo: 'رقم الفاتورة',
        date: 'التاريخ',
        customer: 'الزبون',
        phone: 'الهاتف',
        payment: 'الدفع',
        no: '#',
        product: 'المنتج',
        qty: 'الكمية',
        weight: 'الوزن',
        unitPrice: 'سعر الوحدة',
        total: 'المجموع',
        subtotal: 'المجموع الفرعي',
        prevBalance: 'الرصيد السابق',
        grandTotal: 'المجموع الكلي',
        items: 'عناصر',
      },
      fr: {
        invoice: 'Facture',
        billNo: 'N° Facture',
        date: 'Date',
        customer: 'Client',
        phone: 'Téléphone',
        payment: 'Paiement',
        no: '#',
        product: 'Produit',
        qty: 'Qté',
        weight: 'Poids',
        unitPrice: 'Prix Unit.',
        total: 'Total',
        subtotal: 'Sous-total',
        prevBalance: 'Solde Préc.',
        grandTotal: 'Total Général',
        items: 'Articles',
      },
    };
    return labels[lang] || labels['en'];
  }

  function render(data) {
    const lang = data.language || 'en';
    const isRTL = lang === 'ar';
    const L = labelMap(lang);
    const currency = data.currency || 'LBP';
    const exchangeRate = data.exchangeRate || 0;
    const rs = data.receiptSettings || {};
    const bill = data.bill || {};
    const entity = data.entity || null;
    const lineItems = data.lineItems || [];

    if (isRTL) document.body.classList.add('rtl');

    const billDate = bill.bill_date ? new Date(bill.bill_date).toLocaleDateString('en-GB') : '';
    const billNumber = (rs.billNumberPrefix || '') + (bill.bill_number || '').split('-')[1] || bill.bill_number || '';

    // Logo
    const logoHtml = data.logo
      ? `<img class="store-logo" src="${escHtml(data.logo)}" alt="logo">`
      : '';

    // Phones
    const phones = [
      rs.phone1Name && rs.phone1 ? `${escHtml(rs.phone1Name)}: ${escHtml(rs.phone1)}` : (rs.phone1 ? escHtml(rs.phone1) : ''),
      rs.phone2Name && rs.phone2 ? `${escHtml(rs.phone2Name)}: ${escHtml(rs.phone2)}` : (rs.phone2 ? escHtml(rs.phone2) : ''),
    ].filter(Boolean).join('  /  ');

    // Meta rows
    const metaRows = [
      `<div class="invoice-meta-item"><span class="invoice-meta-label">${L.billNo}:</span><span class="invoice-meta-value">${escHtml(billNumber)}</span></div>`,
      `<div class="invoice-meta-item"><span class="invoice-meta-label">${L.date}:</span><span class="invoice-meta-value">${escHtml(billDate)}</span></div>`,
      entity
        ? `<div class="invoice-meta-item"><span class="invoice-meta-label">${L.customer}:</span><span class="invoice-meta-value">${escHtml(entity.name)}</span></div>`
        : '',
      entity && entity.phone
        ? `<div class="invoice-meta-item"><span class="invoice-meta-label">${L.phone}:</span><span class="invoice-meta-value">${escHtml(entity.phone)}</span></div>`
        : '',
      `<div class="invoice-meta-item"><span class="invoice-meta-label">${L.payment}:</span><span class="invoice-meta-value">${escHtml(bill.payment_method || '')}</span></div>`,
    ].filter(Boolean).join('');

    // Line items
    const rowsHtml = lineItems.map((item, i) => {
      const weightCell = item.weight && item.weight > 0
        ? `${item.weight.toFixed(2)} kg`
        : '-';
      return `
        <tr>
          <td class="col-num">${i + 1}</td>
          <td class="col-product">${escHtml(item.productName)}</td>
          <td class="col-qty">${item.quantity}</td>
          <td class="col-weight">${weightCell}</td>
          <td class="col-price">${fmt(item.unit_price, currency, exchangeRate)}</td>
          <td class="col-total">${fmt(item.line_total, currency, exchangeRate)}</td>
        </tr>`;
    }).join('');

    // Totals
    const subtotalRow = `
      <tr>
        <td class="totals-label">${L.subtotal}:</td>
        <td class="totals-value">${fmt(bill.subtotal || 0, currency, exchangeRate)}</td>
      </tr>`;

    const prevBalanceRow = rs.showPreviousBalance && entity && (entity.lb_balance || 0) > 0
      ? `<tr>
          <td class="totals-label">${L.prevBalance}:</td>
          <td class="totals-value">${fmt(entity.lb_balance, currency, exchangeRate)}</td>
        </tr>`
      : '';

    const grandTotalRow = `
      <tr class="grand-total">
        <td class="totals-label">${L.grandTotal}:</td>
        <td class="totals-value">${fmt(bill.total_amount || 0, currency, exchangeRate)}</td>
      </tr>`;

    const itemCountHtml = rs.showItemCount
      ? `<div class="item-count">${lineItems.length} ${L.items}</div>`
      : '';

    const html = `
      <div class="bill-header">
        <div class="store-info">
          <div class="store-name">${escHtml(rs.storeName || '')}</div>
          ${rs.address ? `<div class="store-address">${escHtml(rs.address)}</div>` : ''}
          ${phones ? `<div class="store-phones">${phones}</div>` : ''}
        </div>
        ${logoHtml}
      </div>

      <div class="invoice-meta">
        ${metaRows}
      </div>

      ${itemCountHtml}

      <table class="items-table">
        <thead>
          <tr>
            <th class="col-num">${L.no}</th>
            <th class="col-product">${L.product}</th>
            <th class="col-qty">${L.qty}</th>
            <th class="col-weight">${L.weight}</th>
            <th class="col-price">${L.unitPrice}</th>
            <th class="col-total">${L.total}</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="totals-section">
        <table class="totals-table">
          ${subtotalRow}
          ${prevBalanceRow}
          ${grandTotalRow}
        </table>
      </div>

      <div class="bill-footer">
        <span class="thank-you">${escHtml(rs.thankYouMessage || 'Thank You!')}</span>
        <span class="payment-method">${escHtml(bill.payment_method || '')}</span>
      </div>
    `;

    document.getElementById('bill-root').innerHTML = html;
  }

  // Poll for BILL_DATA injected by Electron main process
  function waitForData(attempts) {
    if (typeof window.BILL_DATA !== 'undefined') {
      render(window.BILL_DATA);
    } else if (attempts > 0) {
      setTimeout(function () { waitForData(attempts - 1); }, 50);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { waitForData(20); });
  } else {
    waitForData(20);
  }
})();
