// Account Statement Print Renderer
// Receives data via IPC and renders HTML

let statementData = null;

// Listen for data from preload script
window.addEventListener('DOMContentLoaded', () => {
  // Set up listener for statement data
  if (window.printAPI && window.printAPI.onStatementData) {
    window.printAPI.onStatementData((data) => {
      window.setStatementData(data);
    });
  }
});

// Function to format currency
function formatCurrency(amount, currency, includeSymbol = true) {
  if (amount === undefined || amount === null || isNaN(amount)) {
    amount = 0;
  }
  
  if (currency === 'USD') {
    const formatted = amount.toFixed(2);
    return includeSymbol ? `$${formatted}` : formatted;
  } else {
    const rounded = Math.round(amount);
    const formatted = rounded.toLocaleString('en-US');
    return includeSymbol ? `${formatted} ل.ل` : formatted;
  }
}

// Function to format date
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('ar-LB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

// Function to get transaction type label
function getTransactionTypeLabel(type, entityType) {
  const labels = {
    sale: entityType === 'customer' ? 'بيع' : 'مبيعات',
    payment: 'دفعة',
    income: 'إيراد',
    expense: 'مصروف'
  };
  return labels[type] || type;
}

// Calculate incremental balance for line items
function calculateLineItemBalance(balanceBefore, lineItems, currentIndex) {
  let balance = balanceBefore;
  for (let i = 0; i <= currentIndex; i++) {
    const item = lineItems[i];
    const debit = item.debit_amount || 0;
    const credit = item.credit_amount || 0;
    balance += debit - credit;
  }
  return balance;
}

// Render the statement
function renderStatement(data) {
  if (!data || !data.statement) {
    document.getElementById('statement-root').innerHTML = '<p>Error: No statement data available</p>';
    return;
  }

  const { statement, entity, viewMode, language } = data;
  const isRTL = language === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';
  
  // Set document direction
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', language);

  const root = document.getElementById('statement-root');
  
  // Determine primary currency (prefer USD if available, otherwise LBP)
  const primaryCurrency = statement.financialSummary.currentBalance.USD !== 0 ? 'USD' : 'LBP';
  
  // Calculate balance before first transaction
  let balanceBefore = statement.financialSummary.openingBalance[primaryCurrency];
  
  let html = `
    <div class="statement-header">
      <div class="statement-title">${isRTL ? 'كشف حساب' : 'Account Statement'}</div>
      <div class="entity-name">${entity.name}</div>
      <div class="statement-meta">
        <span>${isRTL ? 'الفترة:' : 'Period:'} ${formatDate(statement.dateRange.start)} - ${formatDate(statement.dateRange.end)}</span>
        <span>${isRTL ? 'التاريخ:' : 'Date:'} ${formatDate(statement.statementDate)}</span>
      </div>
    </div>

    <div class="financial-summary">
      <div class="summary-row">
        <span class="summary-label">${isRTL ? 'الرصيد الافتتاحي:' : 'Opening Balance:'}</span>
        <span class="summary-value">${formatCurrency(statement.financialSummary.openingBalance[primaryCurrency], primaryCurrency)}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">${isRTL ? 'الرصيد الحالي:' : 'Current Balance:'}</span>
        <span class="summary-value ${statement.financialSummary.currentBalance[primaryCurrency] >= 0 ? 'positive' : 'negative'}">
          ${formatCurrency(statement.financialSummary.currentBalance[primaryCurrency], primaryCurrency)}
        </span>
      </div>
      ${entity.type === 'customer' ? `
        <div class="summary-row">
          <span class="summary-label">${isRTL ? 'إجمالي المبيعات:' : 'Total Sales:'}</span>
          <span class="summary-value">${formatCurrency(statement.financialSummary.totalSales[primaryCurrency], primaryCurrency)}</span>
        </div>
      ` : `
        <div class="summary-row">
          <span class="summary-label">${isRTL ? 'إجمالي المشتريات:' : 'Total Purchases:'}</span>
          <span class="summary-value">${formatCurrency(statement.financialSummary.totalReceivings[primaryCurrency], primaryCurrency)}</span>
        </div>
      `}
      <div class="summary-row">
        <span class="summary-label">${isRTL ? 'إجمالي المدفوعات:' : 'Total Payments:'}</span>
        <span class="summary-value">${formatCurrency(statement.financialSummary.totalPayments[primaryCurrency], primaryCurrency)}</span>
      </div>
    </div>

    <table class="transaction-table" dir="${dir}">
      <thead>
        <tr>
          <th>${isRTL ? 'التاريخ' : 'Date'}</th>
          <th>${isRTL ? 'المرجع' : 'Reference'}</th>
          <th>${isRTL ? 'البيان' : 'Description'}</th>
          ${viewMode === 'detailed' ? `
            <th>${isRTL ? 'العدد' : 'Quantity'}</th>
            <th>${isRTL ? 'الوزن' : 'Weight'}</th>
            <th>${isRTL ? 'السعر' : 'Price'}</th>
          ` : ''}
          <th class="number">${isRTL ? 'مدين' : 'Debit'}</th>
          <th class="number">${isRTL ? 'دائن' : 'Credit'}</th>
          <th class="number">${isRTL ? 'الرصيد' : 'Balance'}</th>
        </tr>
      </thead>
      <tbody>
  `;

  // Render transactions
  statement.transactions.forEach((transaction, transactionIndex) => {
    const hasLineItems = viewMode === 'detailed' && transaction.product_details && transaction.product_details.length > 0;
    const itemCurrency = transaction.currency || primaryCurrency;
    
    // Calculate balance before this transaction
    // Use the transaction's balance_after from previous transaction, or opening balance
    if (transactionIndex > 0) {
      const prevTransaction = statement.transactions[transactionIndex - 1];
      // Use previous transaction's balance_after (already in correct currency)
      balanceBefore = prevTransaction.balance_after;
    } else {
      // First transaction - use opening balance in the transaction's currency
      balanceBefore = statement.financialSummary.openingBalance[itemCurrency];
    }
    
    if (!hasLineItems) {
      // Single row transaction
      const debitAmount = transaction.type !== 'payment' ? transaction.amount : 0;
      const creditAmount = transaction.type === 'payment' ? transaction.amount : 0;
      
      html += `
        <tr>
          <td>${formatDate(transaction.date)}</td>
          <td>${transaction.reference || '-'}</td>
          <td>${transaction.description}</td>
          ${viewMode === 'detailed' ? `
            <td class="number">${transaction.quantity || '-'}</td>
            <td class="number">${transaction.weight ? `${transaction.weight}kg` : '-'}</td>
            <td class="number">${transaction.price ? formatCurrency(transaction.price, itemCurrency, false) : '-'}</td>
          ` : ''}
          <td class="number ${debitAmount > 0 ? 'debit' : ''}">${debitAmount > 0 ? formatCurrency(debitAmount, itemCurrency, false) : '0'}</td>
          <td class="number ${creditAmount > 0 ? 'credit' : ''}">${creditAmount > 0 ? formatCurrency(creditAmount, itemCurrency, false) : '0'}</td>
          <td class="number">${formatCurrency(transaction.balance_after, itemCurrency)}</td>
        </tr>
      `;
    } else {
      // Multiple line items - render each as separate row
      transaction.product_details.forEach((item, itemIndex) => {
        const isFirstItem = itemIndex === 0;
        const itemBalance = calculateLineItemBalance(balanceBefore, transaction.product_details, itemIndex);
        
        html += `
          <tr class="line-item-row">
            <td>${isFirstItem ? formatDate(transaction.date) : ''}</td>
            <td>${transaction.reference || '-'}</td>
            <td>
              <div style="font-weight: 600;">${item.product_name}</div>
              ${item.notes ? `<div style="font-size: 8pt; color: #666; font-style: italic; margin-top: 2px;">${item.notes}</div>` : ''}
            </td>
            ${viewMode === 'detailed' ? `
              <td class="number">${item.quantity} ${item.unit}</td>
              <td class="number">${item.weight ? `${item.weight}kg` : '-'}</td>
              <td class="number">${formatCurrency(item.unit_price, item.currency || itemCurrency, false)}</td>
            ` : ''}
            <td class="number ${item.debit_amount > 0 ? 'debit' : ''}">${item.debit_amount > 0 ? formatCurrency(item.debit_amount, item.currency || itemCurrency, false) : '0'}</td>
            <td class="number ${item.credit_amount > 0 ? 'credit' : ''}">${item.credit_amount > 0 ? formatCurrency(item.credit_amount, item.currency || itemCurrency, false) : '0'}</td>
            <td class="number">${formatCurrency(itemBalance, item.currency || itemCurrency)}</td>
          </tr>
        `;
      });
    }
  });

  html += `
      </tbody>
    </table>

    <div class="statement-footer">
      <div>${isRTL ? 'تم إنشاء هذا الكشف تلقائياً' : 'This statement was generated automatically'}</div>
    </div>
  `;

  root.innerHTML = html;
}

// Expose function to receive data
window.setStatementData = function(data) {
  statementData = data;
  renderStatement(data);
};

