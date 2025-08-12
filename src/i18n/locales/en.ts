const en = {
  app: { name: 'Produce POS', loading: 'Loading...' },
  common: {
    actions: { cancel: 'Cancel', save: 'Save', delete: 'Delete', edit: 'Edit', add: 'Add', view: 'View', close: 'Close', export: 'Export', refresh: 'Refresh', search: 'Search', details: 'Details' },
    status: { online: 'Online', offline: 'Offline', synced: 'Synced', unsyncedCount: '{{count}} unsynced' },
    placeholders: { search: 'Search...' },
    labels: { units: 'units', kg: 'kg', piece: 'Piece', box: 'Box', bag: 'Bag', bundle: 'Bundle', dozen: 'Dozen' },
    confirmations: { fullResyncConfirm: 'This will clear all local data and re-download from server. Continue?' },
    alerts: { connectionRestored: 'Connection Restored', autoSyncingChanges: 'Auto-syncing your changes...' }
  },
  nav: { home: 'Home', inventory: 'Inventory', pos: 'Point of Sale', customers: 'Customers', accounting: 'Accounting', reports: 'Reports', settings: 'Settings' },
  layout: { title: 'ProducePOS', connection: { online: 'Online', offline: 'Offline' }, unsynced: 'unsynced', signOut: 'Sign out' },
  login: {
    title: 'Produce POS', subtitle: 'Wholesale Produce Market ERP', email: 'Email Address', emailPlaceholder: 'Enter your email', password: 'Password', passwordPlaceholder: 'Enter your password',
    signIn: 'Sign In', signUp: 'Sign Up', signingIn: 'Signing In...', signingUp: 'Signing Up...', fullName: 'Full Name', role: 'Role', store: 'Store', selectStore: 'Select a store', demoAccount: 'Demo Account',
    invalidCredentials: 'Invalid email or password', signupFailed: 'Sign up failed. Please try again.', genericError: 'An error occurred. Please try again.'
  },
  settings: {
    header: 'Settings', saved: 'Settings saved successfully!', userInfo: 'User Information', name: 'Name', email: 'Email', role: 'Role',
    inventoryAlerts: 'Inventory Alerts', lowStockAlerts: 'Low Stock Alerts', lowStockDescription: 'Get notified when products are running low', lowStockThreshold: 'Low Stock Threshold', units: 'units', save: 'Save', currentThreshold: 'Current threshold: {{value}} units',
    commissionSettings: 'Commission Settings', defaultCommissionRate: 'Default Commission Rate', currentDefaultRate: 'Current default rate: {{value}}%',
    currencySettings: 'Currency Settings', displayCurrency: 'Display Currency', currentCurrency: 'Current currency: {{value}}',
    systemInfo: 'System Information', appVersion: 'Application Version', dataStorage: 'Data Storage', lastSync: 'Last Sync', deviceType: 'Device Type', webApp: 'Web Application',
    security: 'Security', sessionManagement: 'Session Management', sessionNote: 'Your session will remain active until you manually log out', changePassword: 'Change Password',
    language: 'Language', language_ar: 'Arabic', language_en: 'English', language_fr: 'French'
  },
  home: {
    welcome: 'Welcome back, {{name}}', subtitle: "Here's what's happening at your store today.", fastActions: 'Fast Actions', hide: 'Hide', show: 'Show',
    quickSale: 'Quick Sale', quickSaleDesc: 'Start a new sale transaction',
    receiveProducts: 'Receive Products', receiveProductsDesc: 'Add new inventory from suppliers',
    addCustomer: 'Add Customer', addCustomerDesc: 'Register a new customer',
    recordExpense: 'Record Expense', recordExpenseDesc: 'Log business expenses',
    todaySales: "Today's Sales", todaySalesDesc: 'View sales performance',
    checkStock: 'Check Stock', checkStockDesc: 'Monitor inventory levels',
    cashInDrawer: 'Cash in Drawer', notOpenedToday: 'Not opened today', openCashDrawer: 'Open Cash Drawer', todaysExpenses: "Today's Expenses", lowStockItems: 'Low Stock Items', needAttention: 'Need attention', alertsDisabled: 'Alerts disabled', lowStockAlert: 'Low Stock Alert', allWellStocked: 'All products are well stocked!', recentSales: 'Recent Sales', noRecentSales: 'No recent sales'
  },
  inventory: { header: 'Inventory Management', receiveProducts: 'Receive Products', addProduct: 'Add Product', productReception: 'Product Reception', stockProducts: 'Stock Products', searchProducts: 'Search products...', currentStockLevels: 'Current Stock Levels', outOfStock: 'Out of Stock', lowStock: 'Low Stock', inStock: 'In Stock', recentProductReceives: 'Recent Product Receives', actions: 'Actions', edit: 'Edit', delete: 'Delete', noContactInfo: 'No contact info', remaining: 'remaining' },
  pos: { header: 'Point of Sale', newBill: 'New Bill', cartEmpty: 'Cart is empty', products: 'Products', subtotal: 'Subtotal', total: 'Total', customerName: 'Customer Name', walkInCustomer: 'Walk-in Customer', paymentMethod: 'Payment Method', cash: 'Cash', card: 'Card', credit: 'Credit', amountReceived: 'Amount Received', change: 'Change', notesOptional: 'Notes (Optional)', completeSale: 'Complete Sale', processing: 'Processing...', addNewCustomer: 'Add New Customer', searchCustomers: 'Search customers...', searchProducts: 'Search products...' },
  reports: { header: 'Reports & Analytics', exportReport: 'Export Report', generateReport: 'Generate Report', reportType: 'Report Type', startDate: 'Start Date', endDate: 'End Date', salesReport: 'Sales Report', inventoryReport: 'Inventory Report', customerReport: 'Customer Report', profitAnalysis: 'Profit Analysis', totalRevenue: 'Total Revenue', totalSales: 'Total Sales', averageSale: 'Average Sale', customerDebt: 'Customer Debt', topSellingProducts: 'Top Selling Products', currentStockLevels: 'Current Stock Levels', status: { outOfStock: 'Out of Stock', lowStock: 'Low Stock', inStock: 'In Stock', never: 'Never' } },
  syncStatus: { header: 'Sync Status', connection: 'Connection', lastSync: 'Last Sync', pendingChanges: 'Pending Changes', items: 'items', manualSync: 'Manual Sync', fullResync: 'Full Resync', validateAndClean: 'Validate & Clean Data', workingOffline: 'Working Offline', offlineNote: 'Changes will auto-sync when connection is restored.', autoSyncEnabled: 'Auto-sync enabled • Changes sync automatically when online' }
};

export default en;


