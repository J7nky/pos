# 🚀 Future Implementations TODO List

> **Last Updated:** November 1, 2025  
> **System:** Wholesale Produce Market ERP/POS  
> **Architecture:** Offline-First, React + TypeScript + Supabase

---

## 📋 **Table of Contents**
1. [Critical Priority](#-critical-priority)
2. [High Priority](#-high-priority)
3. [Medium Priority](#-medium-priority)
4. [Long-Term Enhancements](#-long-term-enhancements)
5. [Technical Debt & Improvements](#-technical-debt--improvements)

---

## 🔴 **Critical Priority**
> Essential features for operational completeness and legal compliance

### 1. Barcode/PLU Scanning System
- [ ] Research barcode scanner hardware options (USB, Bluetooth, integrated)
- [ ] Implement barcode input detection (distinguish from keyboard input)
- [ ] Add PLU (Price Look-Up) code support for produce items
- [ ] Create product barcode management (multiple barcodes per product)
- [ ] Add barcode scanning to POS product search
- [ ] Implement inventory receiving via barcode
- [ ] Support UPC, EAN-13, Code 128, QR codes
- [ ] Add barcode printing for inventory labels
- [ ] Test with common scanners (Zebra, Honeywell, Symbol)
- [ ] Add sound/visual feedback on successful scan

**Dependencies:** None  
**Estimated Effort:** 2-3 weeks  
**Impact:** High - Dramatically improves checkout speed

---

### 2. Expiration Date Tracking
- [ ] Add expiration date field to inventory items schema
- [ ] Add receiving date vs. shelf life calculation
- [ ] Implement FEFO (First Expired, First Out) logic
- [ ] Create near-expiry alerts (configurable days threshold)
- [ ] Add expiry date filter in inventory views
- [ ] Display days until expiry in POS/inventory
- [ ] Generate expiry report (daily/weekly)
- [ ] Prevent sale of expired items (configurable override)
- [ ] Auto-suggest price reduction for near-expiry items
- [ ] Track expired inventory for waste analysis

**Dependencies:** Database migration  
**Estimated Effort:** 2 weeks  
**Impact:** Critical - Food safety, waste reduction, compliance

**Files to Modify:**
- `src/types/database.ts` - Add expiry fields
- `src/lib/db.ts` - Update inventory schema
- `src/contexts/OfflineDataContext.tsx` - Add expiry logic
- `src/services/inventoryPurchaseService.ts` - Handle receiving dates
- `supabase/migrations/` - New migration for expiry fields

---

### 3. Refund/Return Workflow
- [ ] Design return transaction type
- [ ] Add return reason codes (damaged, wrong item, overcharge, etc.)
- [ ] Implement inventory restoration on return
- [ ] Create return authorization workflow
- [ ] Support partial returns (some items from bill)
- [ ] Handle credit note generation
- [ ] Process refund to original payment method
- [ ] Track return metrics (return rate by product/supplier)
- [ ] Add manager approval for large returns
- [ ] Link returns to original sales transaction
- [ ] Generate return receipt/credit note
- [ ] Update customer/supplier balances appropriately

**Dependencies:** Audit log system (already exists)  
**Estimated Effort:** 3 weeks  
**Impact:** High - Operational necessity, customer satisfaction

**Files to Modify:**
- `src/types/index.ts` - Add return types
- `src/lib/db.ts` - Add returns table
- `src/contexts/OfflineDataContext.tsx` - Return operations
- `src/pages/POS.tsx` - Return UI
- `src/services/enhancedTransactionService.ts` - Return processing

---

### 4. Waste Product Tracking System
- [ ] Create waste tracking module
- [ ] Add waste reason categories (spoilage, damage, theft, overstock, etc.)
- [ ] Implement inventory decrease without sale
- [ ] Add photo upload for waste documentation
- [ ] Track waste by product, supplier, category
- [ ] Generate waste reports (cost, trends, patterns)
- [ ] Set waste alerts/thresholds
- [ ] Compare waste across time periods
- [ ] Link waste to expiry date system
- [ ] Calculate waste impact on profit margins
- [ ] Add supervisor approval for high-value waste

**Dependencies:** None  
**Estimated Effort:** 2 weeks  
**Impact:** High - Cost control, operational insights

**New Files:**
- `src/services/wasteTrackingService.ts`
- `src/components/WasteManagement.tsx`
- `src/pages/WasteReports.tsx`

---

### 5. Session Timeout & Auto-Logout
- [ ] Implement idle time detection
- [ ] Add configurable timeout duration (default 15-30 mins)
- [ ] Show warning before logout (e.g., 2 min warning)
- [ ] Auto-save draft transactions before logout
- [ ] Lock screen with password/PIN unlock option
- [ ] Track session duration in audit logs
- [ ] Add "Keep me signed in" option with extended timeout
- [ ] Different timeouts by role (cashier vs. admin)
- [ ] Visual countdown timer in UI
- [ ] Resume session on activity

**Dependencies:** `SupabaseAuthContext`  
**Estimated Effort:** 1 week  
**Impact:** High - Security compliance

**Files to Modify:**
- `src/contexts/SupabaseAuthContext.tsx`
- `src/hooks/useIdleTimer.ts` (new)
- `src/App.tsx` - Add global idle detection

---

## 🟡 **High Priority**
> Important features that significantly enhance functionality

### 6. Digital Scale Integration
- [ ] Research scale protocols (RS-232, USB, Toledo/Mettler protocols)
- [ ] Implement Web Serial API for browser-based scale reading
- [ ] Add scale connection settings (COM port, baud rate, protocol)
- [ ] Auto-detect connected scales
- [ ] Real-time weight display in POS
- [ ] Auto-populate weight field on product selection
- [ ] Support multiple scale brands (Toledo, Mettler Toledo, Avery Weigh-Tronix)
- [ ] Add tare weight support
- [ ] Implement scale calibration UI
- [ ] Handle scale disconnection gracefully
- [ ] Add manual weight override option

**Dependencies:** Barcode scanning (optional)  
**Estimated Effort:** 3-4 weeks  
**Impact:** High - Accuracy, speed, error reduction

**New Files:**
- `src/services/scaleIntegrationService.ts`
- `src/hooks/useScaleConnection.ts`
- `src/components/ScaleSettings.tsx`

---

### 7. Payment Gateway Integration (WishMoney + Others)
- [ ] Research WishMoney API documentation
- [ ] Implement Stripe/Square as alternatives
- [ ] Create payment provider abstraction layer
- [ ] Add payment terminal configuration
- [ ] Implement card payment processing
- [ ] Handle payment success/failure states
- [ ] Store payment gateway transaction IDs
- [ ] Support refunds via gateway
- [ ] Add payment reconciliation
- [ ] Track payment gateway fees
- [ ] Support split payments (cash + card)
- [ ] Generate payment gateway reports
- [ ] Handle offline payment queuing
- [ ] PCI compliance considerations

**Dependencies:** None  
**Estimated Effort:** 4-5 weeks  
**Impact:** High - Modern payment methods, customer convenience

**New Files:**
- `src/services/paymentGatewayService.ts`
- `src/integrations/wishMoney.ts`
- `src/integrations/stripe.ts`
- `src/components/PaymentTerminal.tsx`

**Environment Variables:**
- `VITE_WISHMONEY_API_KEY`
- `VITE_WISHMONEY_MERCHANT_ID`
- `VITE_STRIPE_PUBLIC_KEY`

---

### 8. Profit Margin Analytics
- [ ] Calculate COGS (Cost of Goods Sold) per sale
- [ ] Track purchase price vs. selling price
- [ ] Display profit margin % in real-time
- [ ] Generate profit by product report
- [ ] Analyze profit by supplier
- [ ] Track profit by customer
- [ ] Compare margins across time periods
- [ ] Set target margin alerts
- [ ] Factor in operational costs (porterage, transfer, plastic fees)
- [ ] Calculate net profit after commissions
- [ ] Break-even analysis
- [ ] Profit trend visualization

**Dependencies:** Existing transaction data  
**Estimated Effort:** 2-3 weeks  
**Impact:** High - Better business decisions, pricing optimization

**New Files:**
- `src/services/profitAnalyticsService.ts`
- `src/components/ProfitDashboard.tsx`
- `src/pages/ProfitReports.tsx`

---

### 9. Role-Based Access Control (RBAC) - Enhanced
- [ ] Define granular permissions system
- [ ] Create permission groups (view, create, edit, delete, approve)
- [ ] Map permissions to modules (POS, Inventory, Accounting, etc.)
- [ ] Implement permission middleware/guards
- [ ] Add role management UI (admin)
- [ ] Create custom roles beyond (admin/manager/cashier)
- [ ] Implement operation-level restrictions
  - [ ] Max discount % by role
  - [ ] Max return amount by role
  - [ ] Void transaction permissions
  - [ ] Delete record permissions
  - [ ] Price override permissions
  - [ ] Cash drawer access
- [ ] Add permission audit trail
- [ ] Test permission enforcement across all modules

**Dependencies:** Existing authentication  
**Estimated Effort:** 3 weeks  
**Impact:** High - Security, compliance, control

**Files to Modify:**
- `src/types/index.ts` - Add permission types
- `src/contexts/SupabaseAuthContext.tsx` - Add permission checks
- `src/hooks/usePermissions.ts` (new)
- `src/components/PermissionGuard.tsx` (new)

---

### 10. Fraud Detection System
- [ ] Define fraud patterns to detect:
  - [ ] Excessive voids/refunds by user
  - [ ] Large discounts without approval
  - [ ] After-hours transactions
  - [ ] Repeated small cash transactions (structuring)
  - [ ] Manual price overrides
  - [ ] Inventory adjustments without documentation
  - [ ] Unusual payment patterns
- [ ] Implement anomaly detection algorithms
- [ ] Set configurable alert thresholds
- [ ] Real-time fraud alerts (email/SMS/in-app)
- [ ] Generate fraud risk reports
- [ ] Track high-risk transactions
- [ ] Require manager approval for flagged transactions
- [ ] Maintain fraud incident log
- [ ] Integrate with audit log system

**Dependencies:** Audit log system, Analytics  
**Estimated Effort:** 3-4 weeks  
**Impact:** High - Loss prevention, security

**New Files:**
- `src/services/fraudDetectionService.ts`
- `src/components/FraudAlerts.tsx`
- `src/pages/FraudDashboard.tsx`

---

### 11. Custom Report Builder
- [ ] Design drag-and-drop report builder UI
- [ ] Support multiple data sources (sales, inventory, customers, etc.)
- [ ] Add filter builder (date range, category, supplier, etc.)
- [ ] Implement grouping and aggregation
- [ ] Support calculated fields
- [ ] Add chart types (bar, line, pie, table)
- [ ] Save custom reports
- [ ] Schedule automated report generation
- [ ] Export to PDF, Excel, CSV
- [ ] Share reports with other users
- [ ] Create report templates library
- [ ] Support pivot tables

**Dependencies:** Existing reporting infrastructure  
**Estimated Effort:** 5-6 weeks  
**Impact:** Medium-High - User empowerment, flexibility

**New Files:**
- `src/components/ReportBuilder/`
- `src/services/reportGeneratorService.ts`
- `src/pages/CustomReports.tsx`

---

## 🟢 **Medium Priority**
> Enhancements that improve user experience and efficiency

### 12. Enhanced Keyboard Shortcuts
- [ ] Document existing shortcuts
- [ ] Add global shortcuts:
  - [ ] `F1` - Help/Shortcuts guide
  - [ ] `F2` - Quick search
  - [ ] `F3` - New sale
  - [ ] `F4` - Cash drawer
  - [ ] `F5` - Refresh data
  - [ ] `Ctrl+K` - Command palette
  - [ ] `Ctrl+N` - New customer
  - [ ] `Ctrl+P` - Print receipt
  - [ ] `Ctrl+S` - Save draft
  - [ ] `Ctrl+Z` - Undo
  - [ ] `Ctrl+Shift+Z` - Redo
  - [ ] `Esc` - Cancel/Close modal
  - [ ] `Enter` - Confirm/Submit
- [ ] Add POS-specific shortcuts:
  - [ ] `Alt+1-9` - Switch between cart tabs
  - [ ] `+` / `-` - Adjust quantity
  - [ ] `*` - Apply discount
  - [ ] `/` - Focus search
  - [ ] `Del` - Remove item from cart
- [ ] Add shortcut customization in settings
- [ ] Display shortcuts in tooltips
- [ ] Create printable shortcut cheat sheet

**Dependencies:** None  
**Estimated Effort:** 1-2 weeks  
**Impact:** Medium - Power user productivity

**Files to Modify:**
- `src/hooks/usePOSKeyboard.ts` - Enhance existing
- `src/hooks/useGlobalKeyboard.ts` (new)
- `src/components/ShortcutsModal.tsx` (new)

---

### 13. Dark Mode
- [ ] Design dark color palette (compatible with Tailwind)
- [ ] Implement theme context/provider
- [ ] Add theme toggle in settings
- [ ] Support system preference detection
- [ ] Update all components for dark mode
- [ ] Test color contrast for accessibility
- [ ] Adjust charts/graphs for dark background
- [ ] Handle receipt printing (keep light)
- [ ] Save user preference to localStorage
- [ ] Smooth theme transition animation

**Dependencies:** None  
**Estimated Effort:** 2 weeks  
**Impact:** Medium - User comfort, accessibility

**Files to Modify:**
- `src/contexts/ThemeContext.tsx` (new)
- `tailwind.config.js` - Add dark mode config
- All component files - Add `dark:` classes
- `src/index.css` - Dark mode CSS variables

---

### 14. Various Produce Types (Customizable Categories)
- [ ] Create produce type master list:
  - [ ] Fruits
  - [ ] Vegetables
  - [ ] Herbs
  - [ ] Nuts
  - [ ] Dried Fruits
  - [ ] Organic Produce
  - [ ] Exotic/Imported
  - [ ] Seasonal Items
- [ ] Add store preference selection
- [ ] Allow custom category creation
- [ ] Support subcategories (e.g., Citrus → Oranges, Lemons)
- [ ] Add category icons/images
- [ ] Filter POS products by category
- [ ] Category-based reporting
- [ ] Bulk product import by category

**Dependencies:** None  
**Estimated Effort:** 1-2 weeks  
**Impact:** Medium - Better organization, scalability

**Files to Modify:**
- `src/types/index.ts` - Enhance category types
- `src/pages/Settings.tsx` - Category management
- `src/components/CategoryManager.tsx` (new)

---

### 15. Local Data Backup Download
- [ ] Implement IndexedDB export to JSON
- [ ] Add backup button in settings
- [ ] Include all tables in backup
- [ ] Compress backup file (ZIP)
- [ ] Add timestamp to backup filename
- [ ] Implement backup restore functionality
- [ ] Validate backup file before restore
- [ ] Schedule automatic backups (daily/weekly)
- [ ] Store backups in browser storage
- [ ] Add backup encryption option
- [ ] Upload backup to cloud storage (optional)

**Dependencies:** None  
**Estimated Effort:** 1 week  
**Impact:** Medium - Data safety, disaster recovery

**New Files:**
- `src/services/backupService.ts`
- `src/components/BackupManager.tsx`

---

### 16. WhatsApp & Email Statement Delivery
- [ ] Integrate WhatsApp Business API
- [ ] Implement email sending (SendGrid, AWS SES, Resend)
- [ ] Generate statement PDF attachment
- [ ] Add customer contact preferences
- [ ] Create message templates
- [ ] Send statement on-demand (manual trigger)
- [ ] Schedule automatic statements (monthly)
- [ ] Track delivery status
- [ ] Handle bounces/failures
- [ ] Add multi-language support for messages
- [ ] Include QR code in email/WhatsApp
- [ ] Log all sent statements

**Dependencies:** Account statement generation  
**Estimated Effort:** 2-3 weeks  
**Impact:** Medium - Customer communication, automation

**New Files:**
- `src/services/notificationService.ts`
- `src/integrations/whatsapp.ts`
- `src/integrations/emailProvider.ts`

**Environment Variables:**
- `VITE_WHATSAPP_API_KEY`
- `VITE_EMAIL_API_KEY`

---

## 🔵 **Long-Term Enhancements**
> Advanced features for future growth

### 17. Super Admin Dashboard (Multi-Tenant Management)
- [ ] Design multi-tenant architecture
- [ ] Create super_admin role
- [ ] Implement store registration workflow
- [ ] Build subscription plan management:
  - [ ] Free Plan (1 user, 100 transactions/month)
  - [ ] Starter Plan (5 users, 1000 transactions/month)
  - [ ] Professional Plan (20 users, unlimited transactions)
  - [ ] Enterprise Plan (unlimited users, custom features)
- [ ] Add user limit enforcement per plan
- [ ] Implement transaction limit tracking
- [ ] Create plan upgrade/downgrade workflow
- [ ] Add payment integration for subscriptions
- [ ] Build super admin dashboard:
  - [ ] Store list with status
  - [ ] Subscription overview
  - [ ] Revenue analytics
  - [ ] Usage statistics per store
  - [ ] Store activity monitoring
- [ ] Add store suspension/activation
- [ ] Implement feature flags per plan
- [ ] Track online vs offline data usage
- [ ] Generate invoices for stores

**Dependencies:** Payment gateway, Multi-tenant DB structure  
**Estimated Effort:** 6-8 weeks  
**Impact:** High - Business model, scalability

**New Files:**
- `src/pages/SuperAdmin/`
- `src/services/subscriptionService.ts`
- `src/contexts/TenantContext.tsx`
- `supabase/migrations/` - Multi-tenant schema

---

### 18. Native Mobile App
- [ ] Choose framework (React Native, Flutter, or Capacitor)
- [ ] Set up mobile development environment
- [ ] Port core POS functionality
- [ ] Implement offline sync (align with web)
- [ ] Add mobile-specific features:
  - [ ] Camera for barcode scanning
  - [ ] Push notifications
  - [ ] Biometric authentication
  - [ ] GPS for delivery tracking
- [ ] Optimize UI for mobile screens
- [ ] Test on iOS and Android
- [ ] Publish to App Store and Google Play
- [ ] Implement OTA updates
- [ ] Add mobile analytics

**Dependencies:** API development  
**Estimated Effort:** 12-16 weeks  
**Impact:** High - Market expansion, mobility

**New Repository:**
- `pos-mobile/` - Separate mobile project

---

### 19. AI Voice Interface
- [ ] Integrate speech recognition API (OpenAI Whisper, Google Speech)
- [ ] Implement natural language understanding
- [ ] Add voice commands:
  - [ ] "Show balance for [customer name]"
  - [ ] "Generate statement for [customer name] for last month"
  - [ ] "What's the stock level for [product]?"
  - [ ] "Who are my top 5 customers?"
- [ ] Generate spoken responses (text-to-speech)
- [ ] Support Arabic and English voice commands
- [ ] Add voice activation keyword ("Hey KIWI")
- [ ] Implement intent recognition
- [ ] Handle context and follow-up questions
- [ ] Add voice command security (voice authentication)

**Dependencies:** OpenAI API, Microphone access  
**Estimated Effort:** 4-6 weeks  
**Impact:** Medium - Innovation, accessibility

**New Files:**
- `src/services/voiceCommandService.ts`
- `src/integrations/openai.ts`
- `src/components/VoiceInterface.tsx`

---

### 20. IoT Weight Sensor Integration
- [ ] Research compatible weight sensors
- [ ] Implement WebSocket connection for real-time data
- [ ] Add sensor registration and pairing
- [ ] Auto-detect weight changes
- [ ] Map sensors to product stations
- [ ] Display live weight across multiple sensors
- [ ] Implement tare and calibration
- [ ] Handle sensor disconnection
- [ ] Log sensor readings for audit
- [ ] Support multiple sensors simultaneously

**Dependencies:** Scale integration  
**Estimated Effort:** 3-4 weeks  
**Impact:** Medium - Automation, accuracy

**New Files:**
- `src/services/iotSensorService.ts`
- `src/components/SensorMonitor.tsx`

---

## 🔧 **Technical Debt & Improvements**

### 21. Performance Optimizations
- [ ] Implement virtualized lists for large datasets
- [ ] Add service worker for better caching
- [ ] Optimize IndexedDB queries (add indexes)
- [ ] Lazy load modules and components
- [ ] Reduce bundle size (code splitting)
- [ ] Optimize images and assets
- [ ] Add loading skeletons
- [ ] Implement infinite scroll for reports
- [ ] Cache computed values (useMemo, useCallback)

---

### 22. Testing & Quality Assurance
- [ ] Add unit tests (Jest, Vitest)
- [ ] Implement integration tests
- [ ] Add E2E tests (Playwright, Cypress)
- [ ] Set up CI/CD pipeline
- [ ] Add test coverage reporting
- [ ] Implement visual regression testing
- [ ] Add load testing for sync service
- [ ] Test offline scenarios thoroughly

---

### 23. Documentation
- [ ] Create API documentation
- [ ] Write user manual
- [ ] Add inline code documentation
- [ ] Create video tutorials
- [ ] Document deployment procedures
- [ ] Write troubleshooting guide
- [ ] Add architecture diagrams
- [ ] Create onboarding guide for new users

---

## 📊 **Implementation Roadmap**

### **Phase 1 (Q1 2025) - Core POS Enhancements**
- Barcode/PLU Scanning
- Expiration Date Tracking
- Refund/Return Workflow
- Session Timeout
- Waste Tracking

### **Phase 2 (Q2 2025) - Integrations & Analytics**
- Digital Scale Integration
- Payment Gateway (WishMoney)
- Profit Margin Analytics
- Enhanced RBAC
- Fraud Detection

### **Phase 3 (Q3 2025) - User Experience**
- Dark Mode
- Enhanced Keyboard Shortcuts
- Custom Report Builder
- Local Backup
- WhatsApp/Email Notifications

### **Phase 4 (Q4 2025) - Advanced Features**
- Super Admin Dashboard
- Native Mobile App (Start)
- AI Voice Interface
- IoT Sensor Integration

---

## 🎯 **Success Metrics**

Track these KPIs after each implementation:
- **Checkout Speed:** Target < 60 seconds per transaction
- **Error Rate:** Target < 1% incorrect transactions
- **User Satisfaction:** Target > 4.5/5 rating
- **System Uptime:** Target > 99.5%
- **Sync Success Rate:** Target > 98%
- **Fraud Incidents:** Target < 0.1% of transactions

---

## 📝 **Notes**

- All implementations must follow the **offline-first architecture pattern**
- Maintain backward compatibility with existing data
- Write database migrations for schema changes
- Update documentation after each feature
- Test thoroughly in offline mode
- Consider multi-language support for all UI additions
- Prioritize mobile responsiveness

---

**Contributors:** Development Team  
**Approval Required:** Product Owner, Technical Lead  
**Next Review:** Quarterly

---

*This document is a living roadmap and will be updated as priorities shift and new requirements emerge.*