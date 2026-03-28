# Data model: Local calendar day (conceptual)

**Branch**: `004-local-date-timezone`  
**Date**: 2026-03-25  
**Spec**: [spec.md](./spec.md)

---

## Purpose

This feature does **not** introduce new database tables or columns. It defines how **business calendar days** are represented and compared in the app layer.

---

## Core concepts

### Business calendar day

- **Representation**: String `YYYY-MM-DD` interpreted in the **relevant local timezone** (POS: device/browser; public statement: viewer’s browser).
- **Source of truth for “now”**: `getTodayLocalDate()` → internally `getLocalDateString(new Date().toISOString())`.
- **Source of truth from a stored event**: `getLocalDateString(isoTimestamp)` — uses the device/viewer's local offset at parse time to map the instant to a calendar date.

### Point-in-time record (unchanged storage)

- Bills, transactions, journal lines, inventory batches, etc. continue to store ISO-8601 strings where they do today.
- **Display and filter** derive `YYYY-MM-DD` via `getLocalDateString`, not via `toISOString().split('T')[0]`.

### Date range (reports, feeds, statements)

- **Start** and **end** are inclusive business calendar days in the browsing context.
- **Default “today”** for end (and start when both mean current period) must use `getTodayLocalDate()`, not UTC date extraction.

---

## Relationships

- A **transaction** instant maps to one **business calendar day** per viewer timezone rule.
- **Dashboard “today”** compares: `getLocalDateString(recordInstant) === getTodayLocalDate()` when both use the same browsing context (POS device).

---

## Validation rules

- All `YYYY-MM-DD` strings used for filters must be produced by `getLocalDateString` or `getTodayLocalDate`, except fixed literals in tests where intentional.
- No requirement to normalize historical rows in IndexedDB/Supabase (out of scope per spec).

---

## Snapshot scheduler

- **Label** `snapshotDate` for a run at local time `now` must use `getLocalDateString(now.toISOString())` or `getTodayLocalDate()` when labeling “current” day — consistent with `snapshotService` lookup by local date.
