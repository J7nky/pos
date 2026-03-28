# Feature Specification: Local calendar dates and time zones (POS)

**Feature Branch**: `004-local-date-timezone`  
**Created**: 2026-03-25  
**Status**: Draft  
**Input**: User description: "Read IMPROVEMENTS_ENHANCEMENTS_REPORT.md and create specification for step 6. Time & Timezone Handling only"

## Clarifications

### Session 2026-03-25

- Q: For the public customer statement page, whose timezone should define default date ranges (“today” and start/end defaults)? → A: **Viewer’s browser** — apply the same local-calendar-day rule as elsewhere, using the browser that opens the public link (Option A).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Correct “today” on the home dashboard (Priority: P1)

A cashier works in a region ahead of UTC (for example UTC+2 or UTC+3). Late in the evening, they record sales and expenses. The home dashboard’s “today” totals must include everything that belongs to **their** calendar day, not a day boundary defined by UTC.

**Why this priority**: Wrong daily totals directly misstate business performance and undermine trust in the system; this is the most visible failure mode.

**Independent Test**: With the device clock set to a timezone east of UTC, create a transaction between local midnight and the moment UTC rolls to the next date; confirm it appears in “today” on the home dashboard.

**Acceptance Scenarios**:

1. **Given** the user’s device is in a timezone east of UTC and local time is still “today”, **When** they view the home dashboard “today” metrics, **Then** transactions created in that local calendar day are included even if UTC date has already advanced.
2. **Given** the user’s device is in a timezone east of UTC, **When** they view “today” metrics, **Then** metrics do not silently attribute late-evening local activity to the next calendar day.

---

### User Story 2 - Reports and activity filters match list and detail views (Priority: P1)

A user opens a profit-and-loss report, customer activity, or similar view with default date range set to “today.” Records that show as a given calendar day in lists must not be excluded from that default range because the range was built using the wrong day boundary.

**Why this priority**: Silent exclusion from reports causes reconciliation errors and missed revenue or cost in printed or on-screen reports.

**Independent Test**: Create a bill or transaction just after local midnight; open the relevant report with default dates; confirm the record appears without changing the end date manually.

**Acceptance Scenarios**:

1. **Given** default report dates are initialized to the current period, **When** the user opens the report without changing dates, **Then** all records whose displayed business date falls within that period are included.
2. **Given** list views derive business dates using local calendar rules, **When** the same records are filtered by default date range in reports or activity feeds, **Then** filtering uses the same local calendar day definition so mixed-boundary mismatches do not occur.
3. **Given** a customer opens a public customer statement link on their own device, **When** the page applies default start/end dates including “today,” **Then** those defaults use the **viewer’s** local calendar date so rows are not excluded compared to the dates shown on the page.

---

### User Story 3 - Form defaults show the correct business date (Priority: P2)

When opening forms for receiving inventory, recording supplier advances, or similar flows, the pre-filled date for “today” must match the user’s local calendar day so users are not nudged to save the wrong date if they submit without editing.

**Why this priority**: Wrong saved dates permanently skew inventory and payment history; fixing data later is costly.

**Independent Test**: After local midnight but before UTC midnight would pass in a way that previously showed the wrong day, open affected forms and confirm the default date matches the wall clock date.

**Acceptance Scenarios**:

1. **Given** a new receive or payment-related form with a default business date, **When** the user opens it during local “today”, **Then** the default date matches the local calendar date, including in the hours where UTC-based shortcuts previously showed “yesterday.”
2. **Given** the user submits without changing the default date, **When** the record is saved, **Then** the stored business date matches what they saw as default (local calendar day).

---

### User Story 4 - Scheduled balance snapshots align with lookup by business date (Priority: P2)

Automated end-of-day (or similar) balance snapshots must be tagged with the same local calendar business date that the rest of the product uses when looking up a snapshot for a given day, so snapshot retrieval does not miss or mislabel data around local midnight.

**Why this priority**: Accounting and closing procedures depend on consistent “which day is this snapshot for?” semantics.

**Independent Test**: Trigger or simulate a snapshot run in the window after local midnight but where UTC date labels differ; confirm snapshot association matches local business date used elsewhere.

**Acceptance Scenarios**:

1. **Given** a scheduler runs at local night hours near midnight, **When** it labels a snapshot with a business date, **Then** that label uses the same local calendar day convention as manual reports and snapshot lookup.
2. **Given** a user looks up “today’s” snapshot using the app’s standard date rules, **When** a snapshot was taken during that local day, **Then** it is found under the expected business date.

---

### User Story 5 - Consistent notion of “today” across the product (Priority: P3)

Wherever the product means “today” for filtering, defaults, or display of day boundaries, it uses one consistent rule so developers and users are not surprised by different definitions in different screens. On the **public customer statement**, “today” follows the **viewer’s** browser local calendar (see Clarifications), not the store’s POS device.

**Why this priority**: Reduces regression risk and support burden after fixes in individual areas.

**Independent Test**: Review or test representative screens (dashboard, reports, forms, scheduler-related labels) and confirm “today” behaves consistently for the same device timezone on POS; on the public statement, confirm defaults match the viewer’s browser local calendar for that page.

**Acceptance Scenarios**:

1. **Given** multiple features each expose a “today” or default day boundary, **When** compared at the same moment in time on the same device, **Then** they agree on which calendar day “today” is.

---

### Edge Cases

- **DST changes**: On days when local clocks spring forward or fall back, “today” must still follow the device’s local calendar date; no requirement in this spec to support historical reinterpretation of past rows under new rules.
- **User or device timezone changes**: Behavior follows the **current** device timezone when computing local calendar dates for new defaults and filters; migrating historical mis-saved dates is out of scope unless separately specified.
- **West of UTC**: Users behind UTC may see “today” include or exclude hours that align with UTC differently; the rule remains **local calendar day** for the device, not UTC day.
- **Public statement viewer vs store**: The recipient’s browser may use a different timezone than the store’s POS devices; default date range on the public customer statement still follows the **viewer’s** local calendar (per Clarifications). Aligning “today” across the store and an external viewer is not required beyond correct rules on each page.
- **Stored instants**: Records may continue to store a full point-in-time; this feature concerns how **calendar days** are derived for display, filtering, defaults, and snapshot labels—not necessarily changing storage format.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: For home dashboard metrics that are scoped to “today,” the system MUST determine “today” using the user’s **local calendar date** (device timezone), not a day boundary derived from UTC alone.
- **FR-002**: For transaction- or bill-based “today” filters on the home dashboard, date comparison MUST use the same local calendar date derivation for both the filter’s “today” value and the record’s business date used in the UI, so pairs are not mixed across different day conventions.
- **FR-003**: For financial and activity reports (including profit and loss, activity feeds, and **public customer statements**) that initialize a default date range including “today,” the default end date (and start date where it represents “today”) MUST use the **local calendar date in the browsing context**: the authenticated POS app uses the device (browser) timezone; the public customer statement uses the **viewer’s** browser local calendar date. Defaults MUST align with how business dates are shown for the listed records so nothing is silently excluded.
- **FR-004**: For inventory receive flows and accounting forms that default a business date (for example received date or payment date), the default MUST show the local calendar “today,” including late-night hours where UTC-based shortcuts would show the previous calendar day.
- **FR-005**: For scheduled jobs that label balance or similar snapshots with a business date, the label MUST use the same local calendar date convention as snapshot lookup and reporting, including around local midnight.
- **FR-006**: The product MUST apply one consistent convention for deriving a **local calendar day** everywhere “today” and day-based filtering are used: authenticated POS flows use the device (browser) timezone; the public customer statement uses the **viewer’s** browser. Surfaces MUST not mix UTC-only day boundaries with these local calendar rules.
- **FR-007**: Bill and sale **business dates** shown in dashboards and reports MUST align with the calendar day the cashier associates with the transaction when that date is derived from stored timestamps for filtering and grouping.

### Key Entities *(include if feature involves data)*

- **Business calendar day**: The year-month-day the business assigns to an event in the user’s locale; used for dashboards, filters, forms, and snapshot labels.
- **Point-in-time record**: An underlying transaction, bill, or journal event that may store a full timestamp; the calendar day used for reporting is derived consistently from it and from “today” defaults.
- **Date range (report or feed)**: A start and end business date controlling which records appear; defaults must not exclude records that lists show on the selected days.

### Assumptions

- **Timezone source**: For the authenticated POS app, “local” means the timezone of the device or browser running the store app. For the **public customer statement**, default date ranges use the **viewing user’s browser** local calendar date (Option A). A future per-store timezone setting could change this model; this specification does not require per-store timezone configuration in admin.
- **Scope**: Store-facing POS behavior described in the source report (dashboards, reports, forms, snapshot scheduling). Other applications in the monorepo are in scope only where the same wrong-default behavior exists for equivalent user journeys.
- **Storage**: Full timestamps may remain as stored today; the requirement is consistent **derivation** of calendar days and “today,” not a mandatory migration of all stored fields.

### Out of Scope

- Per-store or per-branch configurable timezone profiles in admin.
- Retroactive correction of records already saved with an incorrect business date before this change.
- Cash drawer balance correctness, sync ordering, and other items outside “Time & Timezone Handling” in the source report.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In acceptance testing with a device set to UTC+2 or UTC+3, **100%** of sampled “today” dashboard checks (sales and expenses) include transactions created during the entire local calendar day, including the hours where UTC date has rolled forward (no false “tomorrow” grouping for same-day local activity).
- **SC-002**: In acceptance testing, **100%** of sampled default report or activity date ranges include every record whose on-screen business date falls on the default end date, with zero cases of silent exclusion due to UTC vs local day mismatch (measured against a checklist of at least three surfaces, **including the public customer statement** where that flow exists).
- **SC-003**: In acceptance testing after local midnight, **100%** of sampled inventory and supplier-related forms show a default business date equal to the device’s local calendar date (no systematic “yesterday” default in the first hours after midnight local time).
- **SC-004**: Snapshot labeling and lookup: in a scripted scenario crossing local midnight, **100%** of sampled snapshot labels match the local business date used when users query “today’s” snapshot through the app’s normal date rules.
- **SC-005**: Within three months of release, support or internal bug reports attributing wrong-day totals or missing-from-today-report issues to UTC vs local midnight are **reduced to zero** for flows covered by FR-001 through FR-005 (qualitative tracking).
