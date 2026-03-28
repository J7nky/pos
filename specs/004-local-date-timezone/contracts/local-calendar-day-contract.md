# Contract: Local calendar day derivation (store-app)

**Feature**: `004-local-date-timezone`  
**Date**: `2026-03-25`  
**Constitution**: CG-11 (`getLocalDateString` / `getTodayLocalDate`)

---

## Purpose

Define the single allowed pattern for turning instants into **local** `YYYY-MM-DD` strings so dashboards, reports, forms, schedulers, and public pages stay consistent and UTC-midnight bugs do not recur.

---

## Rules

1. **Forbidden**: `new Date(...).toISOString().split('T')[0]` when the meaning is a **local business calendar day** (today, defaults, filters, grouping, snapshot labels, or comparison to another local day).

2. **Required**:
   - `getTodayLocalDate()` from `apps/store-app/src/utils/dateUtils.ts` when the intent is **current** local calendar day (equivalent to “wall clock today” in the browsing context).
   - `getLocalDateString(isoString: string)` when deriving the local calendar day from **any** ISO instant string (stored `created_at`, `bill_date`, etc.).

3. **Browsing context**:
   - **Authenticated POS** (`pages/`, `components/` in store-app): device/browser timezone.
   - **Public customer statement** (`PublicCustomerStatement.tsx`): **viewer’s** browser — same helpers run in that page’s JS context.

4. **Date arithmetic** (e.g. “7 days ago”, “start of year”): Must yield **local** calendar days when the result is used as a business-day filter. Do not chain through `toISOString().split('T')[0]` for the final label; derive a `Date`, then `getLocalDateString(date.toISOString())` or equivalent calendar-safe logic.

5. **Filenames and downloads**: Recommended to use `getTodayLocalDate()` or `getLocalDateString(new Date().toISOString())` for embedded dates so exports match user-visible dates.

---

## Consumer checklist

- [ ] Default state for `start` / `end` / `today` uses `getTodayLocalDate()` where applicable  
- [ ] Grouping key from timestamp uses `getLocalDateString`  
- [ ] No new `toISOString().split('T')[0]` for local-day semantics  

---

## Versioning

- Contract is **behavioral** (not an HTTP API). Breaking change = changing helper semantics or reintroducing UTC day extraction for the same use cases.
