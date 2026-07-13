# Feature Specification: Inventory Loss & Shrinkage

**Feature Branch**: `019-inventory-loss-shrinkage`
**Created**: 2026-07-01
**Status**: Draft
**Input**: User description: "Inventory Loss & Shrinkage tracking for the per-bill produce commission market. Three loss types under one mechanism (reason codes: shrinkage | lost | spoiled)..."

## Context & Business Model

This market does **not** operate like a typical retail store. Inventory is organized **per supplier delivery ("bill")**, never pooled by product. A delivery of 50 tomato boxes from John and a delivery of 33 tomato boxes from Ahmad are two distinct stocks that are sold down and settled **separately**. There is no product-level stock and no first-in-first-out ordering — every sale is made against **one specific delivered lot**. A bill is eventually **closed**, at which point it is settled with its supplier (commission deliveries pay the supplier their sold value minus commission and fees; owned/purchased deliveries are the store's own cost).

Between receiving and closing, produce is lost in three ways, and today none of them are recorded, so the books overstate stock value and the store cannot see how much it loses to spoilage, theft, or dehydration.

1. **Shrinkage** — weight-tracked produce (sold by weight) naturally loses weight over time (dehydration, incidental nibbling). 100 kg received becomes ~95 kg sold. This is expected and continuous.
2. **Lost / missing** — counted units (boxes, heads) that disappear with no explanation (theft, mismanagement).
3. **Spoiled / wasted** — counted units that rot and are thrown away (an expired box of tomatoes).

This feature records all three as accountable inventory losses, keeps stock quantities honest, and reflects the losses correctly in the store's accounts.

## Clarifications

### Session 2026-07-01

- Q: How is a lot's weight-tracked vs quantity-only mode determined at receiving? → A: Explicit toggle at receiving, pre-defaulted from the item's unit measurement type (mass ⇒ weight-tracked), with operator override.
- Q: For a weight-tracked lot, is a unit count (e.g. crates) also tracked, or is it purely weight? → A: Both weight AND quantity are tracked and reconciled — weight auto-shrinks at close and any leftover unit count must also be classified at close.
- Q: On a weight-tracked lot, how does the unit count decrease as goods are sold? → A: Each sale records both units and weight and decrements both; at close leftover whole units are classified (each consuming its proportional weight) and only the residual weight is automatic shrinkage; all valued on the single per-weight cost basis so the books never over-write-off.
- Q: Should inventory losses be captured in the audit log? → A: Audit manual loss creation and reversals; automatic shrinkage relies on the existing bill-close audit (no separate audit line per shrinkage).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic weight shrinkage recognized when a bill is closed (Priority: P1)

A worker receives a delivery of produce that is **tracked by weight** (e.g. 100 kg of tomatoes). Over the following days it is sold by weight at the point of sale; each sale records the weight sold and the lot's remaining weight goes down and is visible while selling. By the time the delivery is finished and the operator closes the bill, 95 kg have been sold and 5 kg are gone to natural weight loss. When the operator closes the bill, the system **automatically** recognizes the 5 kg (valued at that lot's cost) as shrinkage — no data entry, no extra action — and the bill's remaining inventory value is cleared to zero.

**Why this priority**: This is the single largest and most invisible source of loss in a produce market, it is fully automatic, and it is the reason the current books overstate inventory. It delivers value on its own even if nothing else in this feature ships.

**Independent Test**: Receive a weight-tracked lot, sell part of it by weight, close the bill, and confirm the leftover weight is recorded as a shrinkage loss for the correct value and the lot's remaining value is zero.

**Acceptance Scenarios**:

1. **Given** a weight-tracked owned lot of 100 kg at a known cost, **When** 95 kg are sold and the operator closes the bill, **Then** a 5 kg shrinkage loss is recorded, valued at the lot's cost, and the store's expense for inventory loss increases by that amount while its inventory asset decreases by the same amount.
2. **Given** a weight-tracked lot on a **commission** delivery, **When** it is closed with leftover weight, **Then** the shrinkage is recorded as a note against that lot with **no** accounting entry (the loss belongs to the supplier), and the supplier's settlement is based only on the weight actually sold.
3. **Given** a weight-tracked lot is fully sold (0 kg remaining) at close, **When** the bill is closed, **Then** no shrinkage loss is recorded.
4. **Given** a weight-tracked lot, **When** the operator is at the point of sale, **Then** the weight for the sale is **required** and the lot's remaining weight is shown and decreases as sales are made.

---

### User Story 2 - Record lost or spoiled stock manually (Priority: P2)

An operator notices during the day that counted stock is gone or unusable — five boxes are missing from a lot, or one box has rotted and must be thrown out. From the inventory view they open the affected lot, choose **Report Loss**, pick a reason (**Lost / missing** or **Spoiled / wasted**), enter how many units, and confirm. The lot's on-hand quantity drops immediately and the loss is reflected in the accounts.

**Why this priority**: Gives the store real-time visibility and control over theft and spoilage as it happens, and keeps on-hand counts accurate so the point of sale cannot oversell a lot.

**Independent Test**: Open a counted lot with on-hand stock, report a loss of N units with a reason, and confirm the on-hand quantity drops by N and a loss for the correct value and reason is recorded.

**Acceptance Scenarios**:

1. **Given** an owned counted lot with 20 boxes on hand, **When** the operator reports 3 boxes as Spoiled, **Then** on-hand quantity becomes 17 and a spoilage loss valued at 3 × the lot's unit cost is recorded against inventory.
2. **Given** a commission counted lot, **When** the operator reports units as Lost, **Then** the on-hand quantity drops, the loss is recorded as a note with no accounting entry, and the supplier's settlement is unaffected beyond selling less.
3. **Given** a lot with 4 boxes on hand, **When** the operator tries to report a loss of 6 boxes, **Then** the system rejects it (cannot lose more than is on hand).
4. **Given** a weight-tracked lot, **When** the operator opens Report Loss, **Then** manual loss entry is by **quantity only** (weight loss is handled automatically at close, not entered by hand).

---

### User Story 3 - Reconcile counted lots when closing a bill (Priority: P2)

An operator closes a delivery of counted produce. The system compares what was received against what was sold and already recorded as lost/spoiled. If any units are still unaccounted for, the operator **cannot** close the bill until they classify each remaining unit as **Lost** or **Spoiled**. This guarantees that at close, everything received is accounted for as sold, lost, or spoiled.

**Why this priority**: Prevents phantom stock from lingering after a bill is settled and forces an honest reconciliation, which is what makes the inventory value trustworthy. Depends on the manual-loss mechanism from Story 2.

**Independent Test**: Close a counted lot that has unsold, unrecorded units and confirm the close is blocked until the remainder is classified, after which the loss is recorded and the bill closes.

**Acceptance Scenarios**:

1. **Given** a counted owned lot of 100 boxes with 95 sold and none reported lost/spoiled, **When** the operator attempts to close the bill, **Then** the system shows 5 unaccounted units and blocks closing until each is classified as Lost or Spoiled.
2. **Given** the operator classifies the 5 remaining boxes as Spoiled, **When** they confirm, **Then** a spoilage loss for 5 boxes is recorded, on-hand quantity becomes 0, and the bill closes.
3. **Given** a counted lot fully accounted for (received = sold + already-recorded losses), **When** the operator closes the bill, **Then** no reconciliation prompt appears and the bill closes normally.

---

### User Story 4 - Reverse a loss recorded by mistake (Priority: P3)

An operator or manager realizes a recorded loss was wrong — the "missing" boxes were found, or a wrong quantity was entered. From the loss history they reverse the loss. The stock (quantity or weight) is restored to the lot and any accounting entry is reversed, leaving a clear trail of both the original and the reversal.

**Why this priority**: Losses destroy recorded value, so mistakes must be correctable without deleting history. Lower priority because it is a correction path, not the core capability.

**Independent Test**: Record a loss, reverse it, and confirm the stock is restored, the accounting effect is undone, and both the original and reversal remain visible in history.

**Acceptance Scenarios**:

1. **Given** a recorded owned-lot loss, **When** it is reversed, **Then** the lot's on-hand quantity/weight is restored, an offsetting accounting entry returns the value to inventory, and the loss is marked reversed (not deleted).
2. **Given** a commission-lot loss (note only), **When** it is reversed, **Then** the stock is restored and the note is marked reversed with no accounting effect.
3. **Given** a loss that has already been reversed, **When** the operator tries to reverse it again, **Then** the system prevents a double reversal.

---

### User Story 5 - See how much is being lost, and why (Priority: P3)

A manager reviews inventory losses over a period — total value lost, broken down by reason (shrinkage vs lost vs spoiled), by product, and by supplier/bill — so they can act on spoilage and theft and understand the store's true margins.

**Why this priority**: Turns the recorded data into a management signal (shrinkage %, spoilage hotspots). Valuable but depends on the recording capabilities above.

**Independent Test**: With losses of different reasons recorded across bills, open the loss report and confirm totals and breakdowns by reason, product, and bill are correct for a chosen period.

**Acceptance Scenarios**:

1. **Given** recorded losses across several bills in a period, **When** the manager opens the loss report for that period, **Then** the total loss value and the breakdown by reason are shown and reconcile with the underlying loss records.
2. **Given** the accounting reports, **When** the manager views the income statement / balance sheet, **Then** inventory losses appear as a distinct expense line, separate from the cost of goods actually sold.

---

### Edge Cases

- **Over-weighing** (recorded sold weight exceeds received weight, implying negative shrinkage): the system MUST NOT record a negative loss; it flags the lot as a data anomaly for review at close and does not auto-book.
- **Genuinely good stock remaining at close**: closing a bill asserts the delivery is finished; any remaining weight (weight lots) or classified units (counted lots) is treated as loss. If real sellable stock remains, the operator should not close the bill yet. This is surfaced clearly before the irreversible close.
- **Closing a bill offline**: shrinkage recognition and loss recording work fully offline and reconcile/sync when connectivity returns, like all other business actions.
- **Reversing a loss after the bill is already closed**: allowed as a correction; restores stock and reverses the accounting, and is recorded against the (closed) bill's history.
- **Changing a lot's tracking mode after receiving**: not allowed — the weight-tracked vs quantity-only choice is fixed at receiving so historical sales stay consistent.
- **A user without loss permission**: cannot record or reverse manual losses and cannot classify count gaps at close; automatic shrinkage still occurs as part of the normal close performed by an authorized closer.
- **Rounding of small weight fractions**: shrinkage value uses the lot's cost basis and standard currency rounding; tiny residual weights still produce a (possibly small) shrinkage record so the lot's value zeroes out.

## Requirements *(mandatory)*

### Functional Requirements

**Tracking mode & point of sale**

- **FR-001**: Each received lot MUST carry a tracking mode — **weight-tracked** or **quantity-only** — set via an explicit toggle at receiving time and immutable thereafter. The toggle MUST be pre-defaulted from the item's unit measurement type (a mass/weight unit defaults to weight-tracked; a count unit defaults to quantity-only), and the operator MUST be able to override the default before saving.
- **FR-002**: For a weight-tracked lot, the system MUST require a weight on every point-of-sale line for that lot and MUST NOT allow the sale to proceed without it.
- **FR-003**: For a quantity-only lot, the point of sale MUST sell by quantity and MUST NOT present a weight entry.
- **FR-004**: For a weight-tracked lot, each sale MUST record both the number of units and the weight, and MUST decrement **both** that specific lot's remaining weight and its remaining unit count. The remaining weight (and remaining unit count) MUST be visible at the point of sale. Sales MUST affect only the specific lot being sold, never another supplier's lot of the same product.
- **FR-004a**: Each weight-tracked lot MUST carry a nominal per-unit weight (originally received weight ÷ originally received units) used to attribute a proportional weight to any whole-unit loss, so that unit losses and residual-weight shrinkage never overlap in value.

**Reconciliation & automatic shrinkage at close**

- **FR-005**: When a bill is closed, for each **weight-tracked** lot the system MUST (a) require the operator to classify any remaining whole units as **Lost** or **Spoiled** (see FR-011), then (b) treat the lot's residual weight — remaining weight minus the proportional weight of those classified units — as **shrinkage** and record it automatically, with no additional entry.
- **FR-006**: Shrinkage and unit losses MUST be valued on the lot's single cost basis (per-weight for weight-tracked lots, per-unit for quantity-only lots) and, taken together with the cost of goods sold, MUST reduce that owned lot's remaining inventory value to exactly zero at close. The system MUST NOT write off more than the lot's remaining inventory value (no double-counting).
- **FR-007**: The close screen MUST show, per lot, the unit remainder requiring classification and the computed residual shrinkage, for transparency before the operator confirms the (irreversible) close.

**Manual losses (lost / spoiled)**

- **FR-008**: Operators MUST be able to record a loss against a specific lot at any time from the inventory view, choosing a reason of **Lost / missing** or **Spoiled / wasted** and a unit quantity. This applies to any lot that has a unit count (both quantity-only and weight-tracked lots).
- **FR-009**: Manual losses MUST be recorded by **unit quantity only** and MUST immediately decrement the lot's on-hand unit count; for a weight-tracked lot, the loss MUST also remove the classified units' proportional weight (FR-004a) from the lot's remaining weight so it is not later re-counted as shrinkage.
- **FR-010**: The system MUST reject a manual loss greater than the lot's current on-hand unit count.

**Count reconciliation at close**

- **FR-011**: When closing a bill, for **every** lot (quantity-only and weight-tracked) the system MUST compute unaccounted units as received units minus sold units minus already-recorded unit losses, and MUST block the close while any lot has unaccounted units.
- **FR-012**: The operator MUST classify every unaccounted unit as **Lost** or **Spoiled** to proceed; on confirmation the classified quantities MUST be recorded as losses and the lot's on-hand unit count MUST reach zero. For weight-tracked lots this classification precedes the automatic residual-weight shrinkage of FR-005.

**Accounting treatment**

- **FR-013**: For **owned** lots, every recorded loss (shrinkage, lost, or spoiled) MUST post a balanced accounting entry that increases an **Inventory Loss / Shrinkage** expense and decreases **Inventory**, using a dedicated loss category distinct from the cost of goods sold.
- **FR-014**: For **commission** lots, losses MUST be recorded as a note only, with **no** accounting entry; the supplier's settlement MUST be based solely on quantity/weight actually sold.
- **FR-015**: Inventory losses MUST appear as their own expense line in financial reports, separate from the cost of goods actually sold.

**Loss records & reversal**

- **FR-016**: Every loss MUST be stored as its own record, scoped to a specific lot, capturing at minimum: reason (shrinkage / lost / spoiled), source (automatic-at-close / manual), quantity or weight, cost basis and value at the time, currency, who recorded it, and when.
- **FR-017**: A loss MUST be reversible: reversing restores the lot's quantity or weight and reverses any accounting entry, without deleting the original record; both the original and the reversal remain visible.
- **FR-018**: The system MUST prevent reversing a loss that is already reversed.

**Permissions, offline, sync, reporting**

- **FR-019**: Recording and reversing manual losses, and classifying count gaps at close, MUST be restricted to users with an inventory-loss permission.
- **FR-020**: All loss recording, shrinkage recognition, and reversal MUST work fully offline and later synchronize deterministically through the store's event-driven synchronization, consistent with other business actions.
- **FR-021**: The system MUST provide a loss report over a selectable period showing total loss value and breakdowns by reason, by product, and by supplier/bill.
- **FR-022**: The system MUST record an audit-log entry for each **manual** loss creation and each loss **reversal** (capturing actor, lot, reason, quantity, and value). Automatic shrinkage at close does NOT require its own audit entry; it is covered by the existing bill-close audit.

### Key Entities *(include if feature involves data)*

- **Loss Event**: A single recorded inventory loss against one specific lot. Attributes: the lot and its product and originating bill, reason (shrinkage / lost / spoiled), source (automatic-at-close / manual), quantity and/or weight lost, unit cost and total value at the time, currency, status (active / reversed), links to any reversal and to the accounting entry it produced (absent for commission), who recorded it, and when.
- **Received Lot** (existing, extended): A line of stock from one delivery. Gains a fixed tracking mode (weight-tracked / quantity-only) set at receiving. Weight-tracked lots additionally maintain a **live remaining weight** and a **live remaining unit count** (both distinct from the originally received amounts) plus a **nominal per-unit weight** (received weight ÷ received units) used to attribute proportional weight to whole-unit losses.
- **Bill / Delivery** (existing): The unit of stock and settlement. Its close is the trigger for automatic shrinkage and for count reconciliation.
- **Inventory Loss expense account** (new accounting concept): A dedicated expense line that accumulates the value of owned-inventory losses, separate from cost of goods sold.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After closing any weight-tracked owned lot, that lot's remaining recorded inventory value is exactly zero (received value = value of goods sold + shrinkage), with no manual entry required.
- **SC-002**: 100% of point-of-sale lines for weight-tracked lots have a recorded sold weight (no missing weights), so shrinkage figures are complete and trustworthy.
- **SC-003**: A counted bill cannot be closed while any received unit is unaccounted for; reconciliation is enforced on 100% of counted-lot closes.
- **SC-004**: An operator can record a loss on a lot in under 20 seconds and see the on-hand quantity update immediately.
- **SC-005**: Total inventory loss recorded in a period equals the sum of the individual loss records and reconciles to the Inventory Loss expense line in the financial reports for that period (owned lots), to the cent.
- **SC-006**: Losses on commission lots never alter the store's own profit or the inventory asset, and never change what the supplier is owed beyond the goods actually sold.
- **SC-007**: Every recorded loss can be reversed with full restoration of stock and accounting, and both original and reversal remain visible in history.
- **SC-008**: Managers can see loss broken down by reason, product, and supplier for any chosen period.

## Assumptions

- A dedicated **Inventory Loss / Shrinkage** expense account and a distinct loss transaction category will be added to the chart of accounts; losses are intentionally separated from cost of goods sold so shrinkage is visible to management.
- Manual losses are quantity-based only; all weight discrepancy on weight-tracked lots is treated as automatic shrinkage at close. A discrete event on a weight lot (e.g. a rotten crate) therefore rolls into that lot's shrinkage figure and is labeled "shrinkage" — an accepted simplification.
- No value threshold or secondary approval is required for a write-off in this version; control is via the inventory-loss permission. A manager-approval threshold can be added later.
- Existing stores contain test data only, so no historical backfill of past losses is required; the feature applies to lots going forward.
- Currency for a loss is the lot's own currency; each loss is single-currency because it concerns one lot.
- "Closing a bill" remains the existing settlement action; this feature adds shrinkage recognition and count reconciliation to that flow rather than introducing a new close.
