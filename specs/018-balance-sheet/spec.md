# Feature Specification: Balance Sheet Report (Assets / Liabilities / Equity, Comparative Periods)

**Feature Branch**: `018-balance-sheet`
**Created**: 2026-05-04
**Status**: Draft
**Input**: User description: "I want you to search requirements and specify @FUTURE_IMPLEMENTATIONS.md phase 1 step 2 (Balance Sheet (Assets / Liabilities / Equity, comparative periods))"

---

## Clarifications

### Session 2026-05-04

- Q: Where does the Current vs. Non-Current sub-classification come from? → A: Add a `subClassification` field on each chart-of-accounts entry, seed it via a one-time migration using account-number ranges (e.g., 1000–1499 Current Assets, 1500+ Non-Current Assets, 2000–2499 Current Liabilities, 2500+ Non-Current Liabilities, 3000+ Equity), and allow admins to edit it thereafter.
- Q: How is the cumulative FX translation effect computed when this feature does not post FX journal entries? → A: Compute the translation difference at render time as a derived plug that makes the report balance, and display it as a labeled "Unrealized FX Translation Adjustment (display-only)" line inside Equity. No GL writes.
- Q: How are inter-branch transfer journal entries identified for consolidation netting? → A: Eliminate journal entries that share a dedicated `transferGroupId` (or equivalent explicit marker linking the source-branch and destination-branch legs of the same transfer). Heuristic-based detection is rejected.
- Q: Which RBAC operation gates the Balance Sheet, and how is "All branches" gated? → A: Reuse the existing financial-reports permission already used by P&L (and the recently shipped Trial Balance). No new RBAC operation is added. "All branches" is gated by whether the user's grant is store-scoped vs. branch-scoped.
- Q: What is the default comparison-column state when the user first opens the report? → A: Pre-populate one comparison column set to "End of previous calendar month" (relative to the chosen as-of date). The user can remove or change it.

---

## Overview

The Balance Sheet is the second deliverable inside the **Complete Financial Statements Pack** (Phase 1, Item 2 of the roadmap). It complements the existing Profit & Loss report and the recently shipped Trial Balance by giving owners and accountants a point-in-time view of the business's financial position: what it owns (Assets), what it owes (Liabilities), and what belongs to the owner (Equity).

This specification covers **only the Balance Sheet** — the Cash Flow Statement, Period Locking, and PDF/Excel export pipeline are tracked elsewhere in the same pack and are explicitly out of scope here, except where the Balance Sheet has a hard dependency on them.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Owner views the current Balance Sheet (Priority: P1)

A store owner or accountant opens the Reports area, selects "Balance Sheet", picks an "as-of" date (defaulting to today), optionally chooses a single branch or "All branches", and immediately sees a structured statement: total Assets at the top, total Liabilities + Equity at the bottom, with subtotals per category (Current Assets, Non-Current Assets, Current Liabilities, Non-Current Liabilities, Equity) and the balancing equation displayed (Assets = Liabilities + Equity, with a visible variance flag if it does not balance).

**Why this priority**: This is the minimum viable Balance Sheet. Without a clean as-of-date snapshot that ties to the GL, none of the comparative or drill-down value can be delivered. Owners, banks, and auditors all start from "show me the position today."

**Independent Test**: Can be fully tested by posting a known set of journal entries, opening the report, picking today as the as-of date, and verifying that totals match the GL trial balance for the same date and that Assets equals Liabilities + Equity.

**Acceptance Scenarios**:

1. **Given** the GL contains posted entries through today, **When** the owner opens the Balance Sheet with the default as-of date, **Then** the report renders with all five sub-sections populated (Current Assets, Non-Current Assets, Current Liabilities, Non-Current Liabilities, Equity), category subtotals, grand totals, and a balanced check indicator.
2. **Given** the user selects an as-of date in the past, **When** the report is generated, **Then** balances reflect only journal entries dated on or before that date.
3. **Given** the user filters to a specific branch, **When** the report is generated, **Then** only journal entries scoped to that branch are included; "All branches" returns the consolidated position for the store.
4. **Given** the user changes the language to Arabic, **When** the report renders, **Then** all section headings, account labels, and currency formatting respect the Arabic locale and right-to-left layout.
5. **Given** the GL is out of balance for a given as-of date, **When** the report is generated, **Then** a visible variance indicator is shown alongside the balancing equation, and the variance amount is displayed.

---

### User Story 2 — Comparative period view (Priority: P1)

The owner toggles a "Compare to" mode and picks one or more comparison points (typical choices: end of last month, end of same month last year, end of last fiscal year). The Balance Sheet then shows a column for the primary as-of date and one column per comparison date, with absolute and percentage variance columns.

**Why this priority**: This is the point of the report for owners — answering "are we better or worse off than three months ago?" The roadmap explicitly calls this out ("comparative periods", "this month vs. last month / YoY"). Without comparison the Balance Sheet is a static snapshot of limited business value.

**Independent Test**: Generate the report with two known as-of dates, verify that each column independently equals what a single-date Balance Sheet for that same date would produce, and verify that variance columns equal the arithmetic difference and percentage between them.

**Acceptance Scenarios**:

1. **Given** the user picks "End of last month" as comparison, **When** the report renders, **Then** two value columns appear (current as-of, last-month-end) plus a variance column showing absolute and % change per line.
2. **Given** the user picks "Same month last year" as comparison, **When** the report renders, **Then** the comparison column reflects balances as of that date.
3. **Given** an account had no balance at the comparison date but has one now (or vice versa), **When** the report renders, **Then** the empty side displays as zero (not blank) so variance % is computed safely.

---

### User Story 3 — Drill-down to journal entries (Priority: P2)

From any line on the Balance Sheet (e.g., "Cash on hand — 12,450 USD"), the owner clicks the amount and sees the underlying journal entries that produced that balance: opening balance + each posting up to the as-of date, with date, reference, description, debit/credit amount, and a link back to the source document (bill, transaction, manual journal).

**Why this priority**: Required for audit defense and for explaining the number to a banker. Owners do not trust a number they cannot explain. However, the report is still useful in P1 form for high-level reading; drill-down can ship in a follow-up release if necessary.

**Independent Test**: For any non-zero line, click the amount and verify that the sum of debits minus credits (or credits minus debits, depending on account type) of the listed journal lines equals the displayed balance.

**Acceptance Scenarios**:

1. **Given** an Asset line shows $5,000, **When** the user opens the drill-down, **Then** a list of journal entries is displayed and the net of those entries up to the as-of date equals $5,000.
2. **Given** a category subtotal (e.g., "Total Current Assets"), **When** the user opens its drill-down, **Then** the entries from every account within that category are aggregated and balance to the subtotal.
3. **Given** a journal entry is shown, **When** the user clicks the source-document reference, **Then** the originating bill / transaction / journal opens in its existing detail view.

---

### User Story 4 — Multi-currency presentation (Priority: P2)

Because the business operates in both USD and LBP, the user can choose the presentation currency: USD-only, LBP-only, or a dual-column view that shows the original currency of each balance and the consolidated equivalent in the chosen presentation currency, using exchange rates already maintained by the system.

**Why this priority**: The roadmap's Phase 1 entry explicitly mentions "Multi-currency consolidation (USD/LBP with FX gain/loss)". A single-currency Balance Sheet still works as an MVP, but in Lebanon dual presentation is expected by every audit-grade reader.

**Independent Test**: Switch presentation currency; verify totals in each currency tie to the same underlying GL postings translated by the as-of-date exchange rate, and that the FX gain/loss line in Equity captures the difference.

**Acceptance Scenarios**:

1. **Given** mixed-currency journal entries exist, **When** the user picks "USD" as presentation, **Then** every line shows its USD value translated using the configured rate effective on the as-of date.
2. **Given** the user picks the dual-column view, **When** the report renders, **Then** each line shows native currency totals separately plus a consolidated total in the presentation currency.
3. **Given** the configured exchange rate for the as-of date is missing, **When** the report is generated, **Then** the user is told which date is missing and asked to confirm using the most recent available rate (or to enter one).

---

### User Story 5 — Offline operation and persistence (Priority: P3)

The owner can generate the Balance Sheet on a tablet or laptop with no internet, working from local data. When connectivity returns, fresh sync data is applied and a re-run reflects the latest state. The report itself is not stored, but the user's saved view preferences (default branch, default comparative mode, default presentation currency) persist between sessions and devices.

**Why this priority**: Aligned with the system's offline-first architecture rule. It is non-negotiable as a platform constraint, but functionally it is invisible to the user as long as it works, so it is captured here as P3 to make the constraint testable.

**Independent Test**: Disconnect the device, open the report — it must render from local data. Reconnect, sync, re-open — values must reflect any new postings that arrived during sync.

**Acceptance Scenarios**:

1. **Given** the device is offline, **When** the user opens the Balance Sheet, **Then** the report generates without error using locally available journal entries.
2. **Given** the user changes a saved preference (e.g., default branch), **When** they open the report on the same store account from another device after sync, **Then** the preference is applied.

---

### Edge Cases

- **Unposted period**: When the as-of date falls inside an open fiscal year (no closing entries have run), revenue and expense balances must be virtually rolled into Retained Earnings on the Balance Sheet without modifying underlying GL data, so Equity equals what it would be after a hypothetical close to that date.
- **Future as-of date**: If the user picks a date later than today, the system should warn that no future-dated entries exist (or include them if the GL contains scheduled entries) and clearly label the report as projected.
- **Pre-history as-of date**: If the as-of date precedes the first journal entry, all balances are zero and the report displays an empty-state message rather than a blank table.
- **Out-of-balance GL**: If the underlying GL is unbalanced as of the chosen date, the Balance Sheet must still render, must clearly flag the imbalance, must display the variance amount, and must direct the user to the Trial Balance or audit log for diagnosis. It must not silently rebalance.
- **Account type changes**: If a chart-of-accounts entry has been re-classified (e.g., from Asset to Equity) at some point in history, the report must classify each line by its current classification rather than per-entry classification, with the user informed of any reclassifications affecting comparison periods.
- **Deleted journal entries**: Soft-deleted journal entries (`_deleted = true`) must be excluded from balances regardless of as-of date.
- **Zero-balance accounts**: By default, accounts whose balance is exactly zero on the as-of date and on every comparison date are hidden, with a "Show zero-balance accounts" toggle to reveal them.
- **Branch consolidation conflicts**: When viewing "All branches", inter-branch transfers must net to zero and must not double-count cash or stock.
- **Currency rate missing for comparison date**: If the FX rate is unavailable for a comparison date, that comparison column shows native currency only and a note explaining why no consolidated value is shown.
- **Permission boundary**: A branch-scoped user must not see "All branches" consolidated data unless their role grants store-level reporting access.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Report generation

- **FR-001**: System MUST generate a Balance Sheet showing Assets, Liabilities, and Equity totals as of any user-selected calendar date, with subtotals for at least Current Assets, Non-Current Assets, Current Liabilities, Non-Current Liabilities, and Equity.
- **FR-002**: System MUST classify every chart-of-accounts entry into exactly one of {Asset, Liability, Equity, Revenue, Expense} and display only Asset, Liability, and Equity classifications on the Balance Sheet.
- **FR-002a**: System MUST persist a `subClassification` value on every Asset and Liability chart-of-accounts entry with the allowed values {Current Asset, Non-Current Asset, Current Liability, Non-Current Liability}, and on every Equity entry with the value {Equity}. The Balance Sheet uses this field as the sole source of truth for sub-grouping.
- **FR-002b**: System MUST seed `subClassification` for existing chart-of-accounts entries via a one-time migration using account-number ranges as defaults (1000–1499 → Current Asset, 1500–1999 → Non-Current Asset, 2000–2499 → Current Liability, 2500–2999 → Non-Current Liability, 3000+ → Equity), and MUST flag any entry that falls outside these ranges for manual review rather than guessing.
- **FR-002c**: Admin users MUST be able to edit `subClassification` on any chart-of-accounts entry after migration, with the change captured in the existing audit log.
- **FR-003**: System MUST roll Revenue and Expense balances accumulated within the current open fiscal year into "Current Year Earnings" inside Equity for any as-of date that falls inside an unclosed period, without altering underlying GL data.
- **FR-004**: System MUST display the balancing equation Assets = Liabilities + Equity at the bottom of the report, including a variance indicator and amount when the equation does not hold.
- **FR-005**: System MUST default the as-of date to today and offer quick-pick presets for end-of-day, end-of-week, end-of-month, end-of-quarter, end-of-fiscal-year.
- **FR-006**: System MUST exclude soft-deleted journal entries from all balances.
- **FR-007**: When "All branches" is selected, system MUST eliminate the journal-entry legs of an inter-branch transfer by netting all entries that share a common `transferGroupId` (or equivalent explicit marker linking the source-branch leg and the destination-branch leg of the same transfer). Heuristic detection (e.g., matching debit/credit legs on the same account in different branches) MUST NOT be used.
- **FR-007a**: When viewing a single branch, inter-branch entries MUST appear normally — only the "All branches" consolidated view performs elimination.
- **FR-007b**: Inter-branch transfer entries that lack a `transferGroupId` MUST be flagged in a system warning visible to the user (and logged), since their absence indicates either a data-integrity issue or a transfer that pre-dates the marker.

#### Comparative periods

- **FR-008**: Users MUST be able to add at least one comparison column to the report, with quick-pick presets for "End of last month", "End of same month last year", "End of last fiscal year", and "Custom date".
- **FR-008a**: On first open of the Balance Sheet (and on any open where the user has not saved a different default), the report MUST render with **one** comparison column pre-populated to "End of previous calendar month" relative to the chosen as-of date. The user MUST be able to remove this column with a single action, change its date, or add additional columns.
- **FR-009**: System MUST compute absolute variance (current − comparison) and percentage variance ((current − comparison) ÷ comparison × 100) for every displayed line, handling zero-baseline cases without runtime errors.
- **FR-010**: System MUST classify every account using its **current** classification, not the classification it had at the comparison date, and MUST surface a notice if any reclassification was detected within the displayed range.

#### Drill-down

- **FR-011**: Users MUST be able to click any non-zero amount on the report (account-level or subtotal-level) and see the underlying journal entries that produced it, scoped to the corresponding as-of date and branch filter.
- **FR-012**: Each drill-down entry MUST display: posting date, reference number, description, debit/credit amount, source-document type, and a link to open the source document.
- **FR-013**: System MUST guarantee that the sum of drill-down entries for any line equals the displayed balance for that line; mismatch MUST be flagged as a system error.

#### Multi-currency

- **FR-014**: Users MUST be able to choose the presentation currency from {USD, LBP, dual-column} where dual-column shows native currency plus consolidated USD-equivalent.
- **FR-015**: System MUST translate non-presentation-currency balances using the exchange rate effective on the relevant as-of date (or comparison date) for each column independently.
- **FR-016**: When in consolidated presentation, system MUST compute the cumulative translation difference at render time as the residual needed to keep Assets = Liabilities + Equity, and MUST display it as a clearly labeled "Unrealized FX Translation Adjustment (display-only)" line inside Equity. This value is derived per-render and is never written to the GL by this feature.
- **FR-016a**: The "Unrealized FX Translation Adjustment" line MUST recompute independently for each column (primary as-of date and every comparison column), so each column balances on its own.
- **FR-016b**: System MUST disclose, alongside the report, that the Unrealized FX Translation Adjustment is a display-only figure produced by re-translating non-presentation-currency balances at the as-of-date rate and is not booked to the GL.
- **FR-017**: When an exchange rate is missing for any required date, system MUST notify the user and offer to use the most recent prior rate or prompt for a manual rate, rather than silently substituting.

#### Filtering and scope

- **FR-018**: Users MUST be able to filter the report by branch (single branch or "All branches") subject to RBAC.
- **FR-019**: System MUST gate access to the Balance Sheet using the **same existing financial-reports RBAC operation** already used by the Profit & Loss and Trial Balance reports — no new RBAC operation is introduced by this feature.
- **FR-019a**: The "All branches" consolidated view MUST be available only to users whose grant of the financial-reports operation is **store-scoped** (i.e., not restricted to a specific branch). Branch-scoped grant holders MUST see only their own branch and MUST NOT see "All branches" in the branch picker.
- **FR-020**: Users MUST be able to toggle visibility of zero-balance accounts (hidden by default).

#### Presentation and accessibility

- **FR-021**: System MUST render all account names, section headings, and report metadata in the user's selected language (English / Arabic) using the existing multilingual labels on chart-of-accounts entries.
- **FR-022**: System MUST format currency values consistent with the rest of the system (decimal places, thousand separators, currency symbol placement).
- **FR-023**: System MUST be usable on tablet-sized screens (minimum 768 px width) with no horizontal scroll for the single-column view.

#### Persistence and offline

- **FR-024**: System MUST generate the Balance Sheet from local data while offline, using the same code path as online operation.
- **FR-025**: System MUST persist user preferences (default branch, default comparative mode, default presentation currency, default zero-balance toggle, default language) per user and sync them across devices.
- **FR-026**: System MUST NOT persist the generated report itself — every render is computed fresh from current GL data.

#### Export *(scoped narrowly here; full export pipeline tracked in the broader Financial Statements Pack)*

- **FR-027**: Users MUST be able to print the report to a printer-friendly view that respects the active filters (date, branches, comparison columns, currency).
- **FR-028**: PDF and Excel exports as called out in the roadmap are dependent on the shared Financial Statements export pipeline and are **out of scope** for this feature; this feature MUST cleanly integrate with that pipeline once it ships, but MUST NOT block on it.

#### Auditability

- **FR-029**: System MUST log every Balance Sheet generation event (user, store, branch filter, as-of date, comparison dates, presentation currency, language) into the existing audit log.

### Key Entities *(include if feature involves data)*

- **Balance Sheet View**: A computed, transient projection of the GL as of a specific date, scoped to a store and optional branch. Not persisted. Composed of: as-of date, presentation currency, branch scope, and a tree of line items grouped by classification → subcategory → account.
- **Account Classification**: A property of each chart-of-accounts entry indicating one of {Asset, Liability, Equity, Revenue, Expense}, plus a sub-classification for Balance Sheet grouping (e.g., "Current Asset", "Non-Current Asset", "Current Liability", "Non-Current Liability"). Source of truth lives on the chart-of-accounts entry itself.
- **Comparison Column**: A user-chosen secondary as-of date that adds a column to the report; multiple comparison columns may be active simultaneously.
- **User Report Preferences**: Per-user, per-store saved defaults for branch filter, comparative mode, presentation currency, zero-balance toggle, and language. Survives across sessions and devices.
- **Drill-Down Entry Set**: For any clicked line, the ordered list of contributing journal entries up to the relevant as-of date. Computed on demand; not stored.
- **Exchange Rate Snapshot**: The exchange rate effective on each relevant as-of/comparison date used for translation. Read from the existing currency-rate store; this feature does not introduce new rate storage.

---

## Assumptions

- The chart-of-accounts table already carries (or can be migrated to carry) the five-way classification {Asset, Liability, Equity, Revenue, Expense}. The Current vs. Non-Current sub-classification is added as a new `subClassification` field on the chart-of-accounts entry (see FR-002a/b/c), seeded from account-number ranges and admin-editable thereafter.
- The recently delivered Trial Balance feature (#560) and existing P&L report are the canonical references for "what the GL looks like." The Balance Sheet must produce numbers that reconcile to both at any common as-of date.
- "Comparative period" means at least one comparison column at MVP; arbitrary multi-column comparison can be a follow-up.
- The Period Close & Audit Hardening feature (Phase 1, #7) is **not** a hard prerequisite. The Balance Sheet handles unclosed periods by virtually rolling Revenue/Expense into Equity. Once Period Close ships, this virtual roll becomes a no-op for closed periods.
- Multi-currency consolidation uses the exchange-rate mechanism already established by Phase 11 (multi-currency dual-write). FX gain/loss postings themselves are not generated by this feature — the report computes a per-column "Unrealized FX Translation Adjustment" as a display-only Equity line that absorbs the translation residual so each column balances (see FR-016/16a/16b).
- PDF/Excel export is a shared Financial-Statements-Pack concern, not a per-statement concern, so it is out of scope here.
- Branch-level Balance Sheets are supported, but inter-branch eliminations are required only for the "All branches" consolidated view.

---

## Dependencies

- Existing chart of accounts with classification metadata.
- Existing journal-entries table accessed through the established offline-first data layer (no direct DB or Supabase access from the report UI).
- Existing role-based access control for reports.
- Existing multilingual label infrastructure on accounts and UI strings.
- Existing currency / exchange-rate store from Phase 11 multi-currency work.
- Trial Balance and Profit & Loss reports as reconciliation references.

---

## Out of Scope

- Cash Flow Statement (separate item in the Financial Statements Pack).
- PDF / Excel export pipeline (shared, separate feature).
- Period Close & Audit Hardening (Phase 1 #7).
- Generating FX gain/loss journal postings (the Balance Sheet only displays translation effects; posting belongs to closing logic).
- Custom user-defined sub-classifications beyond Current vs. Non-Current.
- Saved snapshots of the Balance Sheet at past dates (feature is computed live; snapshotting is a future concern).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can generate a Balance Sheet for any as-of date within the last 5 years in under **3 seconds** on a typical store device, including for stores with up to 100,000 journal-entry lines.
- **SC-002**: For every report rendered, the equation Assets = Liabilities + Equity holds exactly when the underlying GL is balanced (verified against the Trial Balance for the same as-of date) — no rounding drift larger than the smallest currency unit.
- **SC-003**: An owner can produce a Balance Sheet comparing two periods (e.g., this month-end vs. last month-end) in **under 1 minute** of total interaction time, starting from opening the Reports area.
- **SC-004**: 95% of drill-down clicks reveal the underlying journal entries in **under 1 second**, and in 100% of cases the sum of revealed entries equals the displayed amount to the smallest currency unit.
- **SC-005**: An accountant can validate that the Balance Sheet ties to both the Trial Balance and the Profit & Loss for the same as-of date in **under 5 minutes**, with no manual recomputation needed.
- **SC-006**: Owners report (via in-product feedback or post-launch survey) that the Balance Sheet meets their needs for showing the position to a bank or auditor at a rate of **≥ 80%**, measured 60 days after launch.
- **SC-007**: The report functions identically (same numbers, same layout) when the device is offline, verified by an offline test of every primary user flow.
- **SC-008**: Zero P0 / P1 defects related to incorrect balances are open at launch and within the first 30 days post-launch.
