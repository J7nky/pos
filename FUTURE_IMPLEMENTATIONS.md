# 🚀 Future Implementations TODO List

> **Last Updated:** May 3, 2026
> **System:** Wholesale Produce Market ERP/POS (Souq POS)
> **Architecture:** Offline-First, React + TypeScript + Dexie + Supabase
> **Re-prioritization basis:** Gap analysis vs. a professionally complete wholesale-produce ERP, comparing observed code against industry-standard ERP modules and direct/regional competitors (BIM POS, Galoper, MAPOS, NetSuite, Produce Pro, Famous Software).

---

## 🧭 Prioritization Logic

Items are ordered by **operational hierarchy**, not by ease of build:

1. **Phase 1 — Compliance & Financial Integrity.** Without these you face audits, legal exposure, or reported numbers that aren't trustworthy.
2. **Phase 2 — Core Wholesale Workflows.** Without these you cannot run a real wholesale produce business end-to-end (only point-sale).
3. **Phase 3 — Operational Speed & Accuracy.** You bleed time and money without these.
4. **Phase 4 — Customer Experience, Insight & Growth.** You stagnate without these.
5. **Phase 5 — Platform Expansion & Innovation.** Strategic, optional, post-product-market-fit.
6. **Technical Debt & Improvements** — cross-cutting, run continuously.

`[NEW]` = added in this revision based on gap analysis.
`[EXISTING]` = item from prior version.
`[RESCOPED]` = previously listed but adjusted because part of it is already implemented.

---

## 📋 Table of Contents
1. [Phase 1 — Compliance & Financial Integrity](#-phase-1--compliance--financial-integrity)
2. [Phase 2 — Core Wholesale Workflows](#-phase-2--core-wholesale-workflows)
3. [Phase 3 — Operational Speed & Accuracy](#-phase-3--operational-speed--accuracy)
4. [Phase 4 — Customer Experience, Insight & Growth](#-phase-4--customer-experience-insight--growth)
5. [Phase 5 — Platform Expansion & Innovation](#-phase-5--platform-expansion--innovation)
6. [Technical Debt & Improvements](#-technical-debt--improvements)
7. [Implementation Roadmap](#-implementation-roadmap)

---

## 🔴 **Phase 1 — Compliance & Financial Integrity**
> Build first. Without these, the system is not a trustworthy book of record.

### 1. VAT / Tax Engine + E-Invoicing `[NEW]`
- [ ] Configurable tax codes (Lebanese VAT 11%, exempt, zero-rated)
- [ ] Per-product and per-customer tax overrides
- [ ] Tax-inclusive vs. tax-exclusive pricing toggle
- [ ] Auto-post tax to dedicated GL accounts (output VAT 2300, input VAT 1300)
- [ ] Tax-period reports (monthly VAT return, taxable sales, recoverable input)
- [ ] E-invoicing payload generation (regional regulators are moving here — KSA ZATCA-style, Egypt ETA)
- [ ] Fiscal device / fiscal printer abstraction (future-proof)
- [ ] Supplier tax-ID capture for input tax recovery
- [ ] Multi-currency tax basis handling (USD/LBP)

**Dependencies:** Existing GL  
**Estimated Effort:** 4–5 weeks  
**Impact:** Critical — legal compliance, blocking for B2B customers requiring valid tax invoices.

**Files to Modify / New:**
- `src/services/taxEngineService.ts` (new)
- `src/services/transactionService.ts` (extend for tax postings)
- `src/lib/db.ts` (tax_codes, tax_periods tables)
- `src/components/reports/VATReturnReport.tsx` (new)

---

### 2. Complete Financial Statements Pack `[NEW]`
> P&L exists. Balance Sheet, Cash Flow, and Trial Balance do not. These are non-negotiable for a real ERP.

- [ ] Trial Balance (all GL accounts, debits = credits, period-bounded)
- [ ] Balance Sheet (Assets / Liabilities / Equity, comparative periods)
- [ ] Cash Flow Statement (operating / investing / financing — indirect method)
- [ ] Drill-down from any line to underlying journal entries
- [ ] Multi-currency consolidation (USD/LBP with FX gain/loss)
- [ ] Period locking (close month/year — block back-dated entries)
- [ ] Comparative views (this month vs. last month / YoY)
- [ ] Export to PDF and Excel

**Dependencies:** Existing GL  
**Estimated Effort:** 3–4 weeks  
**Impact:** Critical — required for owners, banks, auditors.

**New Files:**
- `src/services/financialStatementService.ts`
- `src/components/reports/TrialBalance.tsx`
- `src/components/reports/BalanceSheet.tsx`
- `src/components/reports/CashFlowStatement.tsx`
- `src/services/periodCloseService.ts`

---

### 3. AR / AP Aging Reports `[NEW]`
- [ ] AR Aging buckets (Current, 1–30, 31–60, 61–90, 90+)
- [ ] AP Aging buckets (same)
- [ ] Per-currency aging (USD and LBP separately, no false consolidation)
- [ ] Drill-down to outstanding bills behind each bucket
- [ ] Customer/supplier risk flags (over credit limit, in oldest bucket)
- [ ] Aging snapshots saved daily for trending
- [ ] Export and email aging summary to owner

**Dependencies:** Existing AR/AP  
**Estimated Effort:** 1–2 weeks  
**Impact:** Critical — without aging, cash-flow management is blind.

**New Files:**
- `src/services/agingReportService.ts`
- `src/components/reports/ARAgingReport.tsx`
- `src/components/reports/APAgingReport.tsx`

---

### 4. Refund / Return Workflow `[EXISTING]`
- [ ] Design return transaction type
- [ ] Add return reason codes (damaged, wrong item, overcharge, spoiled, etc.)
- [ ] Implement inventory restoration on return
- [ ] Create return authorization workflow
- [ ] Support partial returns (some items from bill)
- [ ] Handle credit-note generation
- [ ] Process refund to original payment method
- [ ] Track return metrics (return rate by product/supplier)
- [ ] Manager approval for large returns
- [ ] Link returns to original sales transaction
- [ ] Generate return receipt / credit note
- [ ] Update customer/supplier balances appropriately

**Dependencies:** Audit log system (already exists)  
**Estimated Effort:** 3 weeks  
**Impact:** High — operational necessity, customer satisfaction, tax-correct reversal.

**Files to Modify:**
- `src/types/index.ts`
- `src/lib/db.ts`
- `src/contexts/OfflineDataContext.tsx`
- `src/pages/POS.tsx`
- `src/services/transactionService.ts`

---

### 5. Lot / Batch Tracking & Traceability `[NEW]` (extends Expiration Tracking)
> Existing code references "batches" but treats them as labels, not tracked entities. Real produce traceability requires per-lot quantities, costs, supplier links, and FEFO-driven picking.

- [ ] Lot table: lot_id, product_id, supplier_id, received_date, expiry_date, qty_received, qty_remaining, unit_cost
- [ ] Lots split when inventory is partially sold
- [ ] FEFO (First Expired, First Out) picking logic on POS sale
- [ ] Configurable override (FIFO / FEFO / manual)
- [ ] Per-lot landed cost (cost + porterage + transport prorated)
- [ ] Recall capability — given a lot, list every bill that consumed it
- [ ] Near-expiry alerts (configurable threshold)
- [ ] Expired-stock auto-quarantine + write-off proposal
- [ ] Suggested price reduction for near-expiry lots

**Dependencies:** Database migration  
**Estimated Effort:** 4 weeks  
**Impact:** Critical — food safety, recall compliance, accurate margin per lot.

**Files:**
- `src/lib/db.ts` — new `inventory_lots` table
- `src/services/lotPickingService.ts` (new)
- `src/services/inventoryPurchaseService.ts` — emit lots on receive
- `src/services/transactionService.ts` — consume lots on sale

---

### 6. Waste / Spoilage Tracking `[EXISTING]`
- [ ] Waste tracking module
- [ ] Waste reason categories (spoilage, damage, theft, overstock, etc.)
- [ ] Inventory decrease without sale
- [ ] Photo upload for waste documentation
- [ ] Track waste by product, supplier, category, lot
- [ ] Generate waste reports (cost, trends, patterns)
- [ ] Set waste alerts/thresholds
- [ ] Compare waste across time periods
- [ ] Link waste to expiry / lot system
- [ ] Calculate waste impact on profit margins
- [ ] Supervisor approval for high-value waste

**Dependencies:** Lot tracking (#5)  
**Estimated Effort:** 2 weeks  
**Impact:** High — cost control, operational insights, audit defensibility for shrinkage.

**New Files:**
- `src/services/wasteTrackingService.ts`
- `src/components/WasteManagement.tsx`
- `src/pages/WasteReports.tsx`

---

### 7. Period Close & Audit Hardening `[NEW]`
- [ ] Month-end / year-end close workflow with checklist
- [ ] Lock posted periods (no back-dated entries without override + audit)
- [ ] Closing journal entries (clear revenue/expense to retained earnings)
- [ ] Pre-close validation (unbalanced JEs, unposted transactions, missing FX rates)
- [ ] Reopen-period flow with mandatory reason
- [ ] Post-close immutability for audit

**Dependencies:** Financial Statements Pack (#2)  
**Estimated Effort:** 2 weeks  
**Impact:** Critical — required for any auditable book of record.

---

### 8. Session Timeout & Auto-Logout `[EXISTING]`
- [ ] Idle time detection
- [ ] Configurable timeout duration (default 15–30 mins)
- [ ] Warning before logout (e.g., 2 min warning)
- [ ] Auto-save draft transactions before logout
- [ ] Lock screen with password/PIN unlock
- [ ] Track session duration in audit logs
- [ ] "Keep me signed in" with extended timeout
- [ ] Different timeouts by role
- [ ] Visual countdown timer
- [ ] Resume session on activity

**Dependencies:** `SupabaseAuthContext`  
**Estimated Effort:** 1 week  
**Impact:** High — security compliance, prevents unattended-terminal abuse.

---

## 🟠 **Phase 2 — Core Wholesale Workflows**
> Without these, this is a POS, not a wholesale ERP.

### 9. Sales Orders / Quotations / Pro-Forma Invoices `[NEW]`
> Today the system jumps directly to a final bill. Wholesale customers expect quote → confirmed order → delivery → invoice.

- [ ] Quotation document (no GL impact, expiry date)
- [ ] Convert quotation → sales order
- [ ] Sales order with reservation against stock
- [ ] Partial fulfillment / backorders
- [ ] Pro-forma invoice (for advance-payment scenarios)
- [ ] Convert sales order → bill on dispatch/delivery
- [ ] Status workflow: draft → confirmed → fulfilled → invoiced → closed
- [ ] Per-document numbering series

**Dependencies:** None  
**Estimated Effort:** 4–5 weeks  
**Impact:** Critical — foundational wholesale workflow.

**New Files:**
- `src/lib/db.ts` — `quotations`, `sales_orders`, `order_lines` tables
- `src/services/salesOrderService.ts`
- `src/pages/Quotations.tsx`, `src/pages/SalesOrders.tsx`

---

### 10. Purchase Orders + Approval Workflow `[NEW]`
> Today the system has goods receiving but no PO. PO drives planned purchases, supplier accountability, and three-way matching.

- [ ] Purchase order creation (supplier, expected date, lines, currency)
- [ ] PO approval workflow (configurable thresholds — amount triggers manager/owner approval)
- [ ] PO statuses: draft → approved → sent → partially-received → received → closed
- [ ] Receive-against-PO (existing receiving connects to a PO)
- [ ] Three-way match: PO ↔ Goods Receipt ↔ Supplier Bill (variance flagged)
- [ ] Backorder tracking
- [ ] Supplier performance metrics (on-time, accuracy, completeness)

**Dependencies:** None  
**Estimated Effort:** 4 weeks  
**Impact:** Critical — supplier accountability, fraud prevention, planning.

**New Files:**
- `src/lib/db.ts` — `purchase_orders`, `po_lines` tables
- `src/services/purchaseOrderService.ts`
- `src/pages/PurchaseOrders.tsx`

---

### 11. Inter-Branch Stock Transfers `[NEW]`
> Inventory is already branch-scoped, but there is no transfer document with in-transit state.

- [ ] Transfer Order (source branch, dest branch, lines, lot references)
- [ ] In-transit state (decrement source, increment "in-transit" virtual location)
- [ ] Receipt confirmation at destination → moves from in-transit to dest stock
- [ ] Variance handling (received less than sent — shrinkage in transit)
- [ ] Transfer cost allocation (transport, porterage)
- [ ] Approval rules per amount/branch
- [ ] Transfer history & audit per branch

**Dependencies:** Lot tracking (#5)  
**Estimated Effort:** 3 weeks  
**Impact:** Critical — multi-branch operation requires this.

---

### 12. Customer-Specific Pricing & Price Lists `[NEW]`
> Today only ad-hoc price overrides exist. Wholesale demands tiered/contract pricing.

- [ ] Multiple price lists (Wholesale, Retail, VIP, Contract)
- [ ] Price list per customer (default + contract)
- [ ] Volume break pricing (qty ≥ X → price Y)
- [ ] Time-bound pricing (promotional periods)
- [ ] Currency-specific price lists (USD vs. LBP)
- [ ] Margin guard — block sale below cost without manager override
- [ ] Effective-dated price changes with history

**Dependencies:** None  
**Estimated Effort:** 3 weeks  
**Impact:** High — every wholesale customer expects this.

**New Files:**
- `src/lib/db.ts` — `price_lists`, `price_list_lines` tables
- `src/services/pricingService.ts`

---

### 13. Delivery & Dispatch / Route Management `[NEW]`
> A produce wholesaler lives or dies by delivery. None of this exists today.

- [ ] Delivery note document (linked to sales order/bill)
- [ ] Driver and vehicle master data
- [ ] Route planning (group orders by zone)
- [ ] Dispatch screen — assign orders to driver/vehicle
- [ ] Loading manifest (printable)
- [ ] Proof of delivery (signature capture, photo, GPS at delivery point)
- [ ] Failed delivery / partial delivery / refusal handling
- [ ] Driver settlement (cash collected, returned items)
- [ ] Per-route profitability report

**Dependencies:** Sales Orders (#9)  
**Estimated Effort:** 5–6 weeks  
**Impact:** Critical — closes the order-to-cash loop for wholesale.

**New Files:**
- `src/lib/db.ts` — `vehicles`, `drivers`, `delivery_notes`, `routes` tables
- `src/services/dispatchService.ts`
- `src/pages/Dispatch.tsx`

---

### 14. Refund/Return → see Phase 1 #4
*(Cross-referenced. Returns require a real workflow that links to delivery and billing.)*

---

### 15. Bank Reconciliation `[NEW]`
- [ ] Bank account master (linked to GL cash accounts)
- [ ] Manual statement import (CSV/OFX)
- [ ] Match GL transactions ↔ statement lines
- [ ] Mark unmatched, partially-matched, reconciled
- [ ] Reconciliation report (book balance vs. bank balance, outstanding items)
- [ ] Period-end reconciliation lock

**Dependencies:** GL  
**Estimated Effort:** 2–3 weeks  
**Impact:** High — required for accurate cash position.

---

## 🟡 **Phase 3 — Operational Speed & Accuracy**

### 16. Barcode / PLU Scanning System `[EXISTING]`
- [ ] Research barcode scanner hardware options (USB, Bluetooth, integrated)
- [ ] Implement barcode input detection
- [ ] PLU code support for produce items
- [ ] Multiple barcodes per product
- [ ] Barcode scanning in POS product search
- [ ] Inventory receiving via barcode
- [ ] UPC, EAN-13, Code 128, QR codes
- [ ] Barcode printing for inventory labels (Zebra/TSC)
- [ ] Test with Zebra, Honeywell, Symbol
- [ ] Sound/visual feedback on scan

**Estimated Effort:** 2–3 weeks  
**Impact:** High — checkout speed, accuracy.

---

### 17. Digital Scale Integration `[EXISTING]`
- [ ] Research scale protocols (RS-232, USB, Toledo/Mettler protocols)
- [ ] Web Serial API for browser-based scale reading
- [ ] Scale connection settings (COM port, baud rate, protocol)
- [ ] Auto-detect connected scales
- [ ] Real-time weight display in POS
- [ ] Auto-populate weight on product selection
- [ ] Toledo, Mettler Toledo, Avery Weigh-Tronix support
- [ ] Tare weight support
- [ ] Calibration UI
- [ ] Manual override

**Estimated Effort:** 3–4 weeks  
**Impact:** High — accuracy, speed, error reduction.

---

### 18. Quality Grading `[NEW]`
- [ ] Grade master (Class A / B / C / Reject — configurable per product family)
- [ ] Grade-aware receiving (split a single received batch into grades)
- [ ] Grade-aware pricing (different price per grade in price lists)
- [ ] Grade-aware reporting (margin by grade, supplier grade quality)
- [ ] Re-grade operation (downgrade aging stock, audit-tracked)

**Dependencies:** Lot tracking (#5)  
**Estimated Effort:** 2 weeks  
**Impact:** High — produce-industry standard, captures real margin variance.

---

### 19. Returnable Container / Crate Tracking `[NEW]`
- [ ] Crate / pallet master (type, deposit value, owner)
- [ ] Issue crates with delivery (qty out per customer)
- [ ] Receive crates back on subsequent visits
- [ ] Customer crate balance (visible alongside cash balance)
- [ ] Aging report on outstanding crates
- [ ] Optional deposit accounting (liability until returned)

**Estimated Effort:** 2 weeks  
**Impact:** High — recovers a recurring physical-asset loss.

---

### 20. Profit Margin Analytics `[EXISTING]`
- [ ] Calculate COGS per sale (linked to consumed lot cost)
- [ ] Track purchase price vs. selling price
- [ ] Real-time margin % display
- [ ] Profit by product, supplier, customer, branch
- [ ] Time-period comparison
- [ ] Target margin alerts
- [ ] Factor operational costs (porterage, transfer, plastic fees)
- [ ] Net profit after commissions
- [ ] Break-even analysis
- [ ] Profit trend visualization

**Dependencies:** Lot tracking (#5)  
**Estimated Effort:** 2–3 weeks  
**Impact:** High — drives pricing decisions.

---

### 21. COGS Method Configuration `[NEW]`
- [ ] Configurable COGS method per product family (FIFO / Weighted Average / Specific Identification)
- [ ] Recompute valuation when method changes (with reason + audit)
- [ ] Document the method in tax filings

**Dependencies:** Lot tracking (#5)  
**Estimated Effort:** 1–2 weeks  
**Impact:** High — material accounting decision; needs explicit handling.

---

### 22. Inventory Valuation Report `[NEW]`
- [ ] Stock-on-hand by branch, product, lot
- [ ] Valuation at cost (per chosen COGS method)
- [ ] Valuation at retail
- [ ] As-of-date valuation (point-in-time)
- [ ] Comparison vs. GL inventory account (variance flag)

**Dependencies:** Lot tracking (#5), COGS method (#21)  
**Estimated Effort:** 1–2 weeks  
**Impact:** High — required to tie inventory back to balance sheet.

---

### 23. Operational Dashboards / BI `[NEW]`
- [ ] Owner dashboard: today's sales, cash position by currency, AR/AP aging, top products
- [ ] Branch dashboard: sales vs. target, drawer status, current employees, low stock
- [ ] Supplier dashboard: outstanding balance, advance position, last delivery, on-time %
- [ ] Customer dashboard: balance, last purchase, lifetime value, credit risk
- [ ] Real-time KPIs (offline-tolerant, refreshed on sync)
- [ ] Configurable widgets per role

**Dependencies:** Existing reporting + Profit Analytics (#20)  
**Estimated Effort:** 4 weeks  
**Impact:** High — converts raw data into decision-ready signal.

---

### 24. Custom Report Builder `[EXISTING]`
- [ ] Drag-and-drop report builder UI
- [ ] Multiple data sources (sales, inventory, customers, etc.)
- [ ] Filter builder (date range, category, supplier, etc.)
- [ ] Grouping and aggregation
- [ ] Calculated fields
- [ ] Chart types (bar, line, pie, table)
- [ ] Save / schedule / share custom reports
- [ ] Export to PDF, Excel, CSV
- [ ] Pivot tables

**Estimated Effort:** 5–6 weeks  
**Impact:** Medium-High — user empowerment.

---

### 25. RBAC Tuning — Threshold Permissions `[RESCOPED]`
> The base RBAC system already exists with 60+ operations. What's missing is **value-threshold** logic.

- [ ] Max discount % by role (cashier 5%, manager 15%, admin unlimited)
- [ ] Max return amount by role
- [ ] Void-transaction approval thresholds
- [ ] Price-override approval thresholds
- [ ] Cash-drawer access matrix
- [ ] After-hours operation flags
- [ ] Approval-request UI (request → notify approver → approve/deny)

**Estimated Effort:** 2 weeks  
**Impact:** High — most real fraud surfaces here.

---

### 26. Fraud Detection System `[EXISTING]`
- [ ] Excessive voids/refunds by user
- [ ] Large discounts without approval
- [ ] After-hours transactions
- [ ] Repeated small cash transactions (structuring)
- [ ] Manual price overrides
- [ ] Inventory adjustments without documentation
- [ ] Unusual payment patterns
- [ ] Anomaly detection algorithms
- [ ] Configurable alert thresholds
- [ ] Real-time alerts (email/SMS/in-app)
- [ ] Fraud risk reports
- [ ] Manager approval for flagged transactions
- [ ] Fraud incident log

**Dependencies:** Audit log, RBAC thresholds (#25)  
**Estimated Effort:** 3–4 weeks  
**Impact:** High — loss prevention.

---

### 27. Demand Forecasting & Auto-Reorder `[NEW]`
- [ ] Per-product reorder point + reorder quantity
- [ ] Sales-velocity-based suggestions (last N days)
- [ ] Seasonality-aware forecasting (basic moving avg first; ML later)
- [ ] Daily "to-buy" list for the buyer (aggregate across branches)
- [ ] One-click PO from suggestion (links to #10)

**Dependencies:** Purchase Orders (#10), Lot tracking (#5)  
**Estimated Effort:** 3 weeks  
**Impact:** High — directly reduces stockouts and over-buying.

---

### 28. Payment Gateway Integration (WishMoney + Others) `[EXISTING]`
- [ ] Research WishMoney API
- [ ] Stripe/Square as alternatives
- [ ] Payment-provider abstraction layer
- [ ] Payment terminal configuration
- [ ] Card payment processing
- [ ] Success/failure handling
- [ ] Store gateway transaction IDs
- [ ] Refunds via gateway
- [ ] Reconciliation
- [ ] Fee tracking
- [ ] Split payments (cash + card)
- [ ] Reports
- [ ] Offline queuing
- [ ] PCI compliance

**Estimated Effort:** 4–5 weeks  
**Impact:** High — modern payment methods.

---

## 🟢 **Phase 4 — Customer Experience, Insight & Growth**

### 29. WhatsApp & Email Statement / Invoice Delivery `[EXISTING]`
- [ ] Integrate WhatsApp Business API
- [ ] Email sending (SendGrid, AWS SES, Resend)
- [ ] Generate statement / invoice PDF
- [ ] Customer contact preferences
- [ ] Message templates
- [ ] On-demand send + scheduled monthly statements
- [ ] Delivery status tracking, bounce handling
- [ ] Multi-language messages
- [ ] QR code in messages
- [ ] Audit log of sent items

**Estimated Effort:** 2–3 weeks  
**Impact:** High — biggest single-feature CX upgrade for wholesale customers.

---

### 30. B2B Customer Self-Service Portal `[NEW]`
> Today only public statements exist (read-only).

- [ ] Customer login (separate from staff auth)
- [ ] View balance, statements, past orders
- [ ] Place new orders (against price list — links to Sales Orders #9)
- [ ] Track order status (confirmed → dispatched → delivered)
- [ ] Download invoices / credit notes
- [ ] Request returns
- [ ] Pay online (links to payment gateway #28)

**Dependencies:** Sales Orders (#9), Payment Gateway (#28)  
**Estimated Effort:** 6 weeks  
**Impact:** High — differentiator vs. local competitors.

---

### 31. Mobile Sales-Rep / Van-Sales App `[NEW]`
- [ ] Lightweight mobile app for field reps
- [ ] Offline catalog + customer list
- [ ] On-route order capture
- [ ] On-route invoicing & cash collection
- [ ] Stock-on-truck reconciliation at end of route
- [ ] Sync back to main system

**Dependencies:** Public API (#42), Dispatch (#13)  
**Estimated Effort:** 8 weeks  
**Impact:** High — opens van-sales business model common in MENA produce.

---

### 32. Loyalty / Promotions / Coupons `[NEW]`
- [ ] Promotion engine (BOGO, %-off, fixed-off, basket-level, product-level)
- [ ] Time-bound and customer-segment-bound promotions
- [ ] Coupon codes (single-use, multi-use, expiry)
- [ ] Loyalty points accrual & redemption (configurable rules)
- [ ] Reporting on promotion ROI

**Estimated Effort:** 4 weeks  
**Impact:** Medium — relevant when retail mix increases.

---

### 33. Document Management `[NEW]`
- [ ] Attach documents to records (supplier bill PDF, contracts, weighbridge tickets, customs)
- [ ] File storage (Supabase Storage) + offline cache for recent
- [ ] Searchable metadata
- [ ] Per-document permissions
- [ ] Retention policies

**Estimated Effort:** 2–3 weeks  
**Impact:** Medium — audit defensibility.

---

### 34. Cold-Chain / Temperature Monitoring `[NEW]`
- [ ] Temperature log (manual entry or sensor feed)
- [ ] Per-cold-room / per-vehicle thresholds
- [ ] Out-of-range alerts
- [ ] Historical chart for HACCP / food-safety audits
- [ ] Optional integration with IoT sensors (links to Phase 5 #46)

**Estimated Effort:** 2 weeks (manual) / +3 weeks (IoT)  
**Impact:** Medium — required if expanding into HORECA / supermarket B2B.

---

### 35. Various Produce Types / Customizable Categories `[EXISTING]`
- [ ] Master list (Fruits, Vegetables, Herbs, Nuts, Dried Fruits, Organic, Exotic/Imported, Seasonal)
- [ ] Store-level preference selection
- [ ] Custom category creation, subcategories
- [ ] Category icons/images
- [ ] POS filter by category
- [ ] Category-based reporting
- [ ] Bulk import by category

**Estimated Effort:** 1–2 weeks  
**Impact:** Medium — better organization.

*(Note: malformed line in prior version regarding `CategoryManager.tsx` was a paste artifact and has been removed.)*

---

### 36. Local Data Backup & Restore `[EXISTING]`
- [ ] IndexedDB → JSON export
- [ ] Backup button in settings
- [ ] All tables in backup
- [ ] ZIP compression
- [ ] Timestamped filename
- [ ] Restore functionality with validation
- [ ] Scheduled automatic backups
- [ ] Encryption option
- [ ] Optional cloud upload

**Estimated Effort:** 1 week  
**Impact:** Medium — disaster recovery for offline-first reality.

---

### 37. Layaway / Installments / Scheduled Payment Plans `[NEW]`
- [ ] Installment plan attached to a bill (n payments, schedule)
- [ ] Auto-aging of upcoming installments
- [ ] Reminder integration (links to existing reminder system)
- [ ] Plan default handling

**Estimated Effort:** 2 weeks  
**Impact:** Medium — relevant for high-ticket / equipment sales.

---

### 38. Fixed Assets & Depreciation `[NEW]`
- [ ] Asset register (vehicles, scales, refrigeration, IT)
- [ ] Acquisition entry posting
- [ ] Depreciation methods (straight-line, declining balance)
- [ ] Periodic depreciation auto-posting
- [ ] Disposal accounting

**Estimated Effort:** 2–3 weeks  
**Impact:** Medium — required for accurate balance sheet over time.

---

### 39. Budgeting & Forecasting `[NEW]`
- [ ] Budget by GL account, branch, period
- [ ] Budget vs. actual variance reports
- [ ] Rolling forecast
- [ ] Cash-flow forecast (using AR/AP aging + recurring expenses)

**Dependencies:** Aging reports (#3)  
**Estimated Effort:** 3 weeks  
**Impact:** Medium — owner-grade planning.

---

### 40. Enhanced Keyboard Shortcuts `[EXISTING]`
- [ ] Document existing shortcuts
- [ ] Global: F1 help, F2 quick search, F3 new sale, F4 cash drawer, F5 refresh, Ctrl+K palette, Ctrl+N new customer, Ctrl+P print, Ctrl+S save draft, Ctrl+Z undo, Ctrl+Shift+Z redo, Esc cancel, Enter confirm
- [ ] POS-specific: Alt+1–9 cart tabs, +/- qty, * discount, / search, Del remove
- [ ] Customization in settings
- [ ] Tooltip display
- [ ] Printable cheat sheet

**Estimated Effort:** 1–2 weeks  
**Impact:** Medium — power-user productivity.

---

### 41. Dark Mode `[EXISTING]`
- [ ] Dark color palette (Tailwind)
- [ ] Theme context/provider
- [ ] Toggle in settings
- [ ] System preference detection
- [ ] Update all components
- [ ] Color-contrast accessibility check
- [ ] Charts/graphs adjusted
- [ ] Receipt printing stays light
- [ ] Persist preference
- [ ] Smooth transition

**Estimated Effort:** 2 weeks  
**Impact:** Medium — comfort & accessibility.

---

## 🔵 **Phase 5 — Platform Expansion & Innovation**

### 42. Public REST / GraphQL API + Webhooks `[NEW]`
- [ ] Versioned public API for read + key writes
- [ ] OAuth / API-key authentication
- [ ] Webhook subscriptions (bill created, payment received, stock low)
- [ ] Rate limiting & quotas
- [ ] OpenAPI / GraphQL schema docs
- [ ] Sandbox environment

**Estimated Effort:** 6 weeks  
**Impact:** Strategic — unlocks integrations, mobile app, B2B customer apps.

---

### 43. Accounting Export Bridges `[NEW]`
- [ ] Generic accounting export (general-ledger format)
- [ ] Specific connectors: Sage, QuickBooks, Odoo, Tally
- [ ] Scheduled export
- [ ] Reconciliation tracking (mark exported entries)

**Estimated Effort:** 3 weeks per connector  
**Impact:** Strategic — eases enterprise customer adoption.

---

### 44. E-commerce Storefront / Marketplace Integration `[NEW]`
- [ ] Public catalog rendering from product master
- [ ] Online ordering with stock check
- [ ] Marketplace integrations (Talabat, Toters, etc., where applicable)
- [ ] Order routing back into Sales Orders (#9)

**Dependencies:** Public API (#42), Sales Orders (#9), B2B Portal (#30)  
**Estimated Effort:** 8–10 weeks  
**Impact:** Strategic — direct-to-consumer expansion lane.

---

### 45. Subscription Plan Tiers & Billing (Super Admin) `[RESCOPED]`
> Multi-tenant store/admin app already exists. What's missing is plan tiering, limits, and automated billing.

- [ ] Plan definitions (Free / Starter / Professional / Enterprise)
- [ ] Per-plan limits (users, transactions/month, branches, storage)
- [ ] Limit enforcement & soft warnings
- [ ] Plan upgrade/downgrade workflow
- [ ] Subscription billing automation (Stripe / local gateway)
- [ ] Invoice generation for store tenants
- [ ] Usage analytics dashboard for the platform owner
- [ ] Feature flags per plan
- [ ] Suspension / activation flows

**Dependencies:** Existing admin app, Payment Gateway (#28)  
**Estimated Effort:** 5–6 weeks  
**Impact:** Strategic — turns the product into a SaaS business.

---

### 46. IoT Weight Sensors & Sensor Network `[EXISTING]`
- [ ] Compatible weight-sensor research
- [ ] WebSocket connection for real-time data
- [ ] Sensor registration / pairing
- [ ] Auto-detect weight changes
- [ ] Map sensors to product stations
- [ ] Live multi-sensor display
- [ ] Tare / calibration
- [ ] Disconnection handling
- [ ] Audit log of readings
- [ ] Cold-chain temperature sensors (links #34)

**Estimated Effort:** 3–4 weeks  
**Impact:** Medium — automation & accuracy.

---

### 47. Native Mobile App `[EXISTING]`
- [ ] Framework choice (React Native / Flutter / Capacitor)
- [ ] Mobile dev environment
- [ ] Port core POS functionality
- [ ] Offline sync alignment
- [ ] Camera barcode scanning
- [ ] Push notifications
- [ ] Biometric auth
- [ ] GPS for delivery tracking
- [ ] iOS + Android testing
- [ ] App Store / Play Store publishing
- [ ] OTA updates
- [ ] Mobile analytics

**Dependencies:** Public API (#42), Mobile Sales-Rep (#31)  
**Estimated Effort:** 12–16 weeks  
**Impact:** High — market expansion.

---

### 48. AI Voice Interface `[EXISTING]`
- [ ] Speech recognition (OpenAI Whisper / Google)
- [ ] NLU / intent recognition
- [ ] Voice commands (balance, statements, stock levels, top customers)
- [ ] TTS responses
- [ ] Arabic + English voice
- [ ] Activation keyword
- [ ] Context / follow-ups
- [ ] Voice authentication

**Estimated Effort:** 4–6 weeks  
**Impact:** Medium — innovation & accessibility.

---

### 49. AI-Assisted Insights `[NEW]`
- [ ] Natural-language Q&A over your data ("which supplier had the highest spoilage last month?")
- [ ] Auto-generated weekly executive summary
- [ ] Anomaly narratives (why did margin drop yesterday?)
- [ ] Smart reorder explanation

**Dependencies:** Dashboards (#23), Forecasting (#27)  
**Estimated Effort:** 4 weeks  
**Impact:** Strategic — modern differentiator.

---

## 🔧 **Technical Debt & Improvements**
> Cross-cutting; run continuously alongside phases.

### T1. Performance Optimizations
- [ ] Virtualized lists for large datasets
- [ ] Service worker for caching
- [ ] Optimize IndexedDB indexes
- [ ] Lazy-load modules / route-level code splitting
- [ ] Image / asset optimization
- [ ] Loading skeletons
- [ ] Infinite scroll for reports
- [ ] `useMemo` / `useCallback` discipline

---

### T2. Testing & Quality Assurance
- [ ] Expand unit tests (Vitest)
- [ ] Integration tests for sync flows
- [ ] E2E tests (Playwright)
- [ ] CI/CD pipeline
- [ ] Coverage reporting
- [ ] Visual regression
- [ ] Sync-service load tests
- [ ] Offline scenario test matrix

---

### T3. Documentation
- [ ] API documentation (after #42)
- [ ] User manual (per role)
- [ ] Inline code documentation only where non-obvious
- [ ] Video tutorials
- [ ] Deployment runbook
- [ ] Troubleshooting guide
- [ ] Architecture diagrams
- [ ] Onboarding guide

---

### T4. Observability `[NEW]`
- [ ] Client-side error tracking (Sentry or self-hosted)
- [ ] Sync health metrics dashboard (lag, failure rate per branch)
- [ ] Audit-log search UI
- [ ] Performance traces for slow operations

---

## 📊 **Implementation Roadmap**

### **Phase 1 — Compliance & Financial Integrity** (Months 1–4)
1. VAT / Tax Engine + E-Invoicing
2. Financial Statements Pack (Trial Balance / Balance Sheet / Cash Flow)
3. AR / AP Aging Reports
4. Refund / Return Workflow
5. Lot / Batch Tracking & Traceability
6. Waste / Spoilage Tracking
7. Period Close & Audit Hardening
8. Session Timeout & Auto-Logout

### **Phase 2 — Core Wholesale Workflows** (Months 5–9)
9. Sales Orders / Quotations / Pro-Forma
10. Purchase Orders + Approval Workflow
11. Inter-Branch Stock Transfers
12. Customer-Specific Pricing & Price Lists
13. Delivery & Dispatch / Route Management
15. Bank Reconciliation

### **Phase 3 — Operational Speed & Accuracy** (Months 10–14)
16. Barcode / PLU Scanning
17. Digital Scale Integration
18. Quality Grading
19. Returnable Container Tracking
20. Profit Margin Analytics
21. COGS Method Configuration
22. Inventory Valuation Report
23. Operational Dashboards / BI
24. Custom Report Builder
25. RBAC Threshold Permissions
26. Fraud Detection
27. Demand Forecasting & Auto-Reorder
28. Payment Gateway Integration

### **Phase 4 — Customer Experience, Insight & Growth** (Months 15–20)
29. WhatsApp & Email Delivery
30. B2B Customer Self-Service Portal
31. Mobile Sales-Rep / Van-Sales App
32. Loyalty / Promotions / Coupons
33. Document Management
34. Cold-Chain / Temperature Monitoring
35. Customizable Categories
36. Local Backup
37. Layaway / Installments
38. Fixed Assets & Depreciation
39. Budgeting & Forecasting
40. Keyboard Shortcuts
41. Dark Mode

### **Phase 5 — Platform Expansion & Innovation** (Months 21+)
42. Public REST / GraphQL API + Webhooks
43. Accounting Export Bridges
44. E-commerce Storefront
45. Subscription Plan Tiers & Billing
46. IoT Sensors
47. Native Mobile App
48. AI Voice Interface
49. AI-Assisted Insights

### **Continuous (every phase)**
T1–T4. Performance, Testing, Documentation, Observability.

---

## 🎯 **Success Metrics**

Track these KPIs after each implementation:
- **Checkout speed:** < 60 seconds per transaction
- **Error rate:** < 1% incorrect transactions
- **Sync success rate:** > 98%
- **System uptime:** > 99.5%
- **User satisfaction:** > 4.5/5
- **Fraud incidents:** < 0.1% of transactions
- **AR days outstanding:** trend down quarter-over-quarter
- **Spoilage / waste %:** trend down after Phase 1 #5–#6 ship
- **Margin variance vs. target:** within ± 1.5% (after Phase 3 ships)
- **Onboarding time per new branch:** < 1 day (after Phase 4 ships)

---

## 📝 **Notes**

- All implementations must follow the **offline-first architecture pattern**.
- All features must round-trip correctly through the event-driven sync (`branch_event_log`).
- Maintain backward compatibility with existing data; write migrations for schema changes.
- Every new entity must carry `_synced`, `_deleted`, `_lastSyncedAt`.
- Multilingual storage (`{en, ar}` objects) for any user-visible strings — never plain strings in multilingual fields.
- All financial operations go through `transactionService.createTransaction()`. Never write to `transactions` or `journal_entries` directly.
- Test thoroughly in offline mode before each release.
- Mobile-responsive layouts for any new UI.

---

**Contributors:** Development Team
**Approval Required:** Product Owner, Technical Lead
**Next Review:** Quarterly

---

*This document is a living roadmap and is updated as priorities shift and new requirements emerge.*
