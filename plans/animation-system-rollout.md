# Plan: App-Wide Entrance Animation System (store-app)

## Goal

Roll out the two animations prototyped in `SupplierAdvances.tsx` to **every page and every modal/form** in `apps/store-app`, sourced from **one central definition** instead of per-component inline `<style>` blocks:

1. **Page entrance** — top-level sections of each screen fade + rise in with a staggered delay.
2. **Modal pop-in** — backdrop fades, dialog card pops in.

The result must be DRY (single source of truth), preserve the existing `prefers-reduced-motion` accessibility behavior, and be RTL-safe.

## Scope

**In scope:** Central CSS animation utilities; retrofit of the 2 shared `Modal` bases + `AccessibleModal`; ~25 hand-rolled modals; page-entrance stagger on the 11 interactive pages.

**Out of scope (note, don't do):** Consolidating the 25 hand-rolled modals into the shared `<Modal>` component (a separate refactor); merging the duplicate `common/Modal.tsx` vs `ui/Modal.tsx`; adding an animation library (none exists and none is needed). The print page `PublicCustomerStatement.tsx` is intentionally excluded.

---

## Phase 0 — Discovery findings (consolidated, verified)

These are the established facts the implementation phases rely on. Re-verify any file's *current* state before editing (the working tree has shown churn — e.g. `SupplierFormModal` animation appeared then reverted).

### Allowed conventions / "Allowed APIs"
- **No animation library.** `package.json` has no framer-motion/motion/gsap/react-spring. Use **CSS only**.
- **Tailwind config is empty** (`tailwind.config.js`: `theme.extend: {}`, `darkMode: 'class'`, content glob `./src/**/*.{js,ts,jsx,tsx}`). The app already uses Tailwind's built-in `animate-spin` / `animate-pulse`.
- **`@layer` is restricted to `base` / `components` / `utilities`.** `@layer keyframes` is INVALID — define `@keyframes` at top level, put the helper classes in `@layer components`.
- **Global CSS entry:** `src/index.css` (imported first in `src/main.tsx`, before `styles/print.css`). 119 lines. No `@keyframes` today.
- **Reduced-motion is already global** — `src/index.css:100-107`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```
  This universal `*` rule auto-neutralizes **any** new animation. **Do NOT add per-animation reduced-motion fallbacks.**
- **Existing unused hooks:** `src/index.css` defines `.modal-overlay` (line 23) and `.modal-content` (line 28) in `@layer components` — currently not wired to the JS modals. Leave them; do not repurpose (avoids surprise coupling).

### Reference implementation (source of truth to centralize)
`src/components/accountingPage/tabs/SupplierAdvances.tsx` currently holds the canonical animations inline:
```css
/* page entrance */
@keyframes sa-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.sa-rise { animation: sa-rise .5s cubic-bezier(.16, 1, .3, 1) both; }
/* modal */
@keyframes advm-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes advm-pop  { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
.advm-fade { animation: advm-fade .2s ease-out both; }
.advm-pop  { animation: advm-pop .25s cubic-bezier(.16, 1, .3, 1) both; }
```
Applied at: stats grid (`sa-rise`, delay 0), suppliers table (`60ms`), action buttons (`120ms`), history table (`180ms`); modal overlay (`advm-fade`) + card (`advm-pop`).

### Page inventory (11 in-scope + 1 excluded)
All pages live in `src/pages/`. Outer wrapper is almost always `<div className="p-6 …">` with N direct-child sections.

| # | Page | Outer wrapper | Top-level sections | Type | Notes |
|---|------|---------------|--------------------|------|-------|
| 1 | `Home.tsx` | `div.p-6` | 4 (welcome / fast actions / stats grid / cash-drawer monitor) | static | sections at ~L601,608,645,659 |
| 2 | `Settings.tsx` | `div.p-6` | ~3 (header / tabs / content) | tabbed | |
| 3 | `POS.tsx` | `div.p-6 pt-3` | ~2 | tabbed + interactive | **Header/tabs only** — do NOT animate the live cart/payment area |
| 4 | `Accounting.tsx` | `div.p-6` | tabs bar + active tab panel | tab container | Tab panels own their own reveal (SupplierAdvances already does). Animate the tabs bar; **do not nest** stagger over a tab that self-staggers |
| 5 | `Reports.tsx` | `div.p-6` | 4 | static-ish | report body swaps on selection |
| 6 | `UnsyncedItems.tsx` | `div.p-6 bg-gray-50` | 4 + list | static + list | list is one section card; don't stagger rows |
| 7 | `Customers.tsx` | `div.p-6` | ~4-6 (header / tabs / search / table) | tabbed + paginated | |
| 8 | `Employees.tsx` | `div.p-6` | ~6 + form modal | static | |
| 9 | `Inventory.tsx` | `div.p-6` | 5+ (header / tabs / content) | tabbed + list | also has page-level spinner overlay (skip) |
| 10 | `AuditLog.tsx` | `div.p-6` `dir=rtl` | ~6 (collapsible filter + rows) | RTL + paginated | confirms RTL-safety of vertical transform |
| 11 | `CategoriesAndUnitsSettings.tsx` | `div.p-6 max-w-5xl mx-auto` | 4 | tabbed | |
| — | `PublicCustomerStatement.tsx` | `div.min-h-screen` | print-aware | **EXCLUDED** (print/export view) |

Layout shell: `src/layouts/Layout.tsx` renders all pages via `<Outlet/>` (~L542). It is NOT used to drive per-section stagger (it can't see page sections), but is the place a future route-transition could hook.

### Modal inventory
- **Shared-base consumers (retrofit base → free):** `accountingPage/modals/PaymentsModal.tsx`, `EditSaleModal.tsx`, `DeleteSaleModal.tsx`, `tabs/receivedBills/ReceivedBillDetailsModal.tsx`, `ReceivedBillSalesLogsModal.tsx` — all delegate to `common/Modal.tsx` or `ui/Modal.tsx`.
- **Shared bases to edit:** `common/Modal.tsx` (overlay L34, card L35), `ui/Modal.tsx` (overlay L28, card L29), `common/AccessibleModal.tsx` (overlay L52, card L60 — has focus-trap + backdrop-click; retrofit once, covers its consumers).
- **Hand-rolled modals to retrofit individually (~25):**
  `common/UnifiedPaymentModal.tsx`, `common/SupplierFormModal.tsx`, `common/RecordExpenseModal.tsx`, `common/PrintPreview.tsx`, `common/RemindersDashboard.tsx` (completion+snooze), `inventory/AddProductModal.tsx`, `inventory/EditProductModal.tsx`, `inventory/EditInventoryModal.tsx`, `inventory/ReceiveFormModal.tsx`, `inventory/DeleteProductConfirm.tsx`, `inventory/DeleteInventoryConfirm.tsx`, `inventory/ArchivedInventoryTab.tsx`, `MissedProductsDetailsModal.tsx`, `AccountStatementModal.tsx`, `CashDrawerBalanceReport.tsx`, `CurrentCashDrawerStatus.tsx`, `BranchSelector.tsx`, `accountingPage/modals/InventoryVerificationModal.tsx`, `reports/JournalEntryDrillDownModal.tsx`, `accountingPage/tabs/RecentPayments.tsx`, `accountingPage/tabs/EmployeePayments.tsx`, `accountingPage/tabs/SoldBills.tsx`, `pages/CategoriesAndUnitsSettings.tsx`, `pages/Employees.tsx`, `pages/POS.tsx` (print-confirm).
  - Already has its own (rename to central): `accountingPage/tabs/SupplierAdvances.tsx` (`advm-*`).
- **Overlays that are NOT dialogs — SKIP the pop (they are loading spinners):** `pages/Inventory.tsx` spinner overlay (`backdrop-blur-[2px] bg-black/20`), `pages/POS.tsx` spinner overlay (`bg-opacity-20`). A backdrop fade is fine; do NOT pop a spinner.
- Common signatures to match when adding classes: overlay = `fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50`; card = `bg-white rounded-lg … w-full max-h-[90vh] …`.

---

## Phase 1 — Central animation system + migrate the reference component

**What to implement (COPY the keyframes verbatim from Phase 0 reference into `index.css`):**

1. In `src/index.css`, **after** `@tailwind utilities;` (line 3) and before the `@layer components` block, add top-level keyframes:
   ```css
   /* ── App-wide entrance animations (single source of truth) ────────────
      Reduced-motion is handled globally by the `*` rule below (~L100). */
   @keyframes rise       { from { opacity: 0; transform: translateY(12px); }       to { opacity: 1; transform: none; } }
   @keyframes modal-fade { from { opacity: 0; }                                    to { opacity: 1; } }
   @keyframes modal-pop  { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
   ```
2. Inside the existing `@layer components { … }` block, add the helper classes:
   ```css
   /* Entrance helpers */
   .animate-rise       { animation: rise .5s cubic-bezier(.16, 1, .3, 1) both; }
   .animate-modal-fade { animation: modal-fade .2s ease-out both; }
   .animate-modal-pop  { animation: modal-pop .25s cubic-bezier(.16, 1, .3, 1) both; }

   /* Auto-stagger: drop `stagger` on a wrapper; its DIRECT children rise in sequence. */
   .stagger > * { animation: rise .5s cubic-bezier(.16, 1, .3, 1) both; }
   .stagger > *:nth-child(1)   { animation-delay: 0ms;   }
   .stagger > *:nth-child(2)   { animation-delay: 60ms;  }
   .stagger > *:nth-child(3)   { animation-delay: 120ms; }
   .stagger > *:nth-child(4)   { animation-delay: 180ms; }
   .stagger > *:nth-child(5)   { animation-delay: 240ms; }
   .stagger > *:nth-child(6)   { animation-delay: 300ms; }
   .stagger > *:nth-child(7)   { animation-delay: 360ms; }
   .stagger > *:nth-child(n+8) { animation-delay: 420ms; }
   ```
   > Rationale: a single `stagger` parent class means each page needs **one** class added, with zero inline `animationDelay` math and no extra wrapper DOM nodes (preserves `space-y-*`/grid layouts).

3. **Migrate `SupplierAdvances.tsx` off its inline `<style>` blocks** to prove the system end-to-end:
   - Delete both inline `<style>` blocks (`sa-rise`, `advm-fade`, `advm-pop`).
   - Replace the 4 per-section `sa-rise … style={{animationDelay}}` usages with a single `stagger` class on the outer `<div className="space-y-6">` → `<div className="space-y-6 stagger">`, and remove the now-redundant `sa-rise` + inline `animationDelay` from the 4 child sections.
   - Replace modal classes: overlay `advm-fade` → `animate-modal-fade`; card `advm-pop` → `animate-modal-pop`.

**Documentation references:** keyframes/timings = Phase 0 "reference implementation"; insertion point = `index.css:3` (top-level) and the existing `@layer components` block; reduced-motion = `index.css:100-107`.

**Verification checklist:**
- `pnpm --filter store-app build` (or `npx tsc --noEmit`) is clean.
- `grep -rn "@keyframes\|<style" src/components/accountingPage/tabs/SupplierAdvances.tsx` → **no matches** (inline styles gone).
- `grep -rn "sa-rise\|advm-" src/` → **no matches** (fully migrated).
- Run app, open Accounting → Supplier Advances: sections still rise in sequence; the Record-Advance modal still pops. Toggle OS "reduce motion" → content appears instantly, no errors.

**Anti-pattern guards:**
- Do NOT wrap keyframes in `@layer` (invalid). Keyframes go top-level.
- Do NOT register these in `tailwind.config.js` `theme.extend` — the nth-child stagger + `both` fill-mode don't map cleanly to Tailwind's `animation`/`delay` utilities (its `delay-*` sets `transition-delay`, not `animation-delay`).
- Do NOT add a `prefers-reduced-motion` override for the new classes; the global rule already covers them.

---

## Phase 2 — Retrofit the shared modal bases (covers ~7 modals for free)

**What to implement (apply two classes; do not restructure):**

1. `src/components/common/Modal.tsx`: add `animate-modal-fade` to the overlay div (L34) and `animate-modal-pop` to the card div (L35).
2. `src/components/ui/Modal.tsx`: same — overlay (L28) `animate-modal-fade`, card (L29) `animate-modal-pop`.
3. `src/components/common/AccessibleModal.tsx`: same — overlay (L52) `animate-modal-fade`, card (L60) `animate-modal-pop`.

**Documentation references:** the `.animate-modal-fade` / `.animate-modal-pop` classes defined in Phase 1; `SupplierFormModal`-style usage shown in Phase 0.

**Verification checklist:**
- `npx tsc --noEmit` clean.
- `grep -n "animate-modal-fade\|animate-modal-pop" src/components/common/Modal.tsx src/components/ui/Modal.tsx src/components/common/AccessibleModal.tsx` → 2 hits each.
- Open one consumer of each base (e.g. a `PaymentsModal`, an `EditSaleModal`, and an `AccessibleModal` user) → card pops, backdrop fades; `AccessibleModal` focus-trap + backdrop-click still work.

**Anti-pattern guards:** don't change `maxWidth`, focus, or close logic; this phase is class-only. Keep the `flex items-center justify-center` centering (the pop transform must not fight a different positioning scheme).

---

## Phase 3 — Retrofit hand-rolled modals (~25)

Apply the same two classes to each hand-rolled modal: `animate-modal-fade` on the `fixed inset-0 …` overlay, `animate-modal-pop` on the white card. Work in directory-grouped batches so each can be verified independently.

**Batch A — `components/common/`:** `UnifiedPaymentModal.tsx`, `SupplierFormModal.tsx`, `RecordExpenseModal.tsx`, `PrintPreview.tsx`, `RemindersDashboard.tsx` (both the completion and snooze overlays).
**Batch B — `components/inventory/`:** `AddProductModal.tsx`, `EditProductModal.tsx`, `EditInventoryModal.tsx`, `ReceiveFormModal.tsx`, `DeleteProductConfirm.tsx`, `DeleteInventoryConfirm.tsx`, `ArchivedInventoryTab.tsx`.
**Batch C — top-level `components/`:** `MissedProductsDetailsModal.tsx`, `AccountStatementModal.tsx`, `CashDrawerBalanceReport.tsx`, `CurrentCashDrawerStatus.tsx`, `BranchSelector.tsx`.
**Batch D — accounting/reports:** `accountingPage/modals/InventoryVerificationModal.tsx`, `reports/JournalEntryDrillDownModal.tsx`, `accountingPage/tabs/RecentPayments.tsx`, `accountingPage/tabs/EmployeePayments.tsx`, `accountingPage/tabs/SoldBills.tsx`.
**Batch E — page-embedded modals:** `pages/CategoriesAndUnitsSettings.tsx`, `pages/Employees.tsx`, `pages/POS.tsx` (the print-confirm dialog only).

**Per-file procedure:**
1. Read the file; locate every `fixed inset-0 … bg-opacity-50/40` overlay and its immediate white card child.
2. Prepend `animate-modal-fade ` to the overlay className, `animate-modal-pop ` to the card className.
3. **Skip pure spinner overlays** (`pages/Inventory.tsx` blur spinner, `pages/POS.tsx` `bg-opacity-20` spinner): optional `animate-modal-fade` on the backdrop, **never** `animate-modal-pop`.
4. If a file has nested transforms or `transition-transform` on the card, confirm the pop doesn't conflict (the pop only runs once on mount).

**Verification checklist (per batch):**
- `npx tsc --noEmit` clean after each batch.
- For each file: `grep -c "animate-modal-pop" <file>` ≥ number of dialog cards in it.
- Smoke-open 1–2 modals per batch in the running app → pop + fade; no layout shift; close still works.

**Anti-pattern guards:** class-only changes; do not migrate to `<Modal>` here, do not touch business logic, do not add `animate-modal-pop` to non-dialog overlays (toasts, spinners, drawers).

---

## Phase 4 — Page entrance stagger rollout

For each in-scope page, add the single `stagger` class to the wrapper whose **direct children** are the top-level sections (usually the outer `<div className="p-6 …">`). No inline delays, no new wrappers.

**Standard pages (add `stagger` to outer `div`):** `Home.tsx`, `Reports.tsx`, `UnsyncedItems.tsx`, `Employees.tsx`, `CategoriesAndUnitsSettings.tsx`, `AuditLog.tsx`.
- Example: `Home.tsx` `<div className="p-6">` → `<div className="p-6 stagger">` (its 4 sections cascade 0/60/120/180ms).

**Tabbed pages (`Settings`, `Customers`, `Inventory`, `POS`, `Accounting`):**
- Add `stagger` to the outer wrapper so **header + tab-bar + active panel** cascade on mount.
- For the active tab **panel**, add `animate-rise` (NOT a nested `stagger`) on the panel root keyed by active tab, so switching tabs re-reveals the panel. Use a React `key={activeTab}` on the panel wrapper if it doesn't already remount, so the animation re-fires on switch.
- `POS.tsx`: apply `stagger` only to the header/tab region; **exclude** the live cart/payment column (wrap only the upper sections, or place `stagger` on a container that does not include the interactive cart).
- `Accounting.tsx`: the active tab is a child component that may self-reveal (SupplierAdvances now uses `stagger` internally from Phase 1). Ensure Accounting’s `stagger` targets the page chrome (tabs bar) and the panel container — verify SupplierAdvances does not visibly double-animate (one outer rise + inner stagger is acceptable and subtle; if it looks heavy, drop `animate-rise` on the Accounting panel wrapper and let the tab own it).

**Excluded:** `PublicCustomerStatement.tsx` (print view) — add nothing.

**Special cases / guards:**
- **Dynamic lists:** keep the whole list/table inside a single section child so it reveals once. NEVER put `stagger` on a `<tbody>` or a `.map()` list root (would animate every row → jank + re-fires on filter).
- **Re-render vs re-mount:** `.stagger`/`animate-rise` fire on mount only, so typing in a search box or repaginating will NOT re-trigger (good). Tab switches re-trigger only where you add `key`.
- **RTL:** the `rise`/`modal-pop` transforms are vertical (`translateY`) — confirmed safe for `AuditLog.tsx` (`dir=rtl`) and Arabic locale. Do not introduce `translateX`.

**Verification checklist:**
- `npx tsc --noEmit` clean.
- `grep -rn "stagger" src/pages` → matches on the 5 tabbed + 6 standard pages (11 total), none on `PublicCustomerStatement.tsx`.
- Visit each page: top sections cascade once on load; lists don’t flicker on search/pagination; tab switches re-reveal panels.
- Toggle OS reduce-motion → every page renders instantly, no console errors, no stuck `opacity:0`.

---

## Phase 5 — Final verification

1. **DRY check (no stray inline animation):**
   `grep -rn "@keyframes\|sfm-\|advm-\|sa-rise\|<style" src/` → only expected hits are the keyframes in `index.css`; **zero** inline `<style>` animation blocks in components. (If `SupplierFormModal` or any file still has `sfm-*`, migrate it to `animate-modal-*`.)
2. **Single source of truth:** `grep -rn "@keyframes rise\|@keyframes modal-pop\|@keyframes modal-fade" src/` → defined exactly once, in `index.css`.
3. **Reduced-motion:** with `prefers-reduced-motion: reduce` (DevTools → Rendering → Emulate), load 3 pages + open 3 modals → instant, no animation, no errors. Confirms `index.css:100-107` covers the new classes.
4. **RTL:** switch to Arabic / open `AuditLog` → entrance + modal pop look correct, no horizontal jank.
5. **Build + lint:** `pnpm --filter store-app build` and `pnpm lint` pass with no NEW errors (the pre-existing `any`/unused-var lint debt in `SupplierAdvances.tsx` is unchanged and unrelated).
6. **Coverage spot-check:** every page in the Phase 0 table (except the print page) has `stagger`; every modal base + hand-rolled modal has `animate-modal-pop` (spinners excluded).

---

## Risks & rollback

- **Risk: nth-child stagger over-counts** when a wrapper has non-section children (e.g. a `<style>` tag, a portal anchor, an always-null conditional). Mitigation: put `stagger` only on wrappers whose direct children are real sections; otherwise use explicit `animate-rise` per section.
- **Risk: pop transform fights an absolutely-positioned card.** All audited cards use `flex items-center justify-center` centering, so `translateY/scale` is safe. Verify any non-centered modal before adding `animate-modal-pop`.
- **Risk: list re-animation.** Covered by the Phase 4 guard (never stagger list roots).
- **Rollback:** the system is additive and class-based. Reverting = delete the `index.css` additions and remove the `stagger` / `animate-modal-*` class names (a single `grep -rl` sweep). No logic changed.

## Suggested execution order

Phase 1 → 2 → 3 (batches A–E) → 4 → 5. Phases 2 and 3 are independent of 4 and can be parallelized across contexts if desired. Phase 1 must land first (defines the classes everything else references).
