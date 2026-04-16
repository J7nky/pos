You are working in **Plan Mode**. Your job is to **analyze, redesign, and incrementally refactor** an existing SyncService in a production POS application.

Do NOT jump directly to code.
You must proceed in **phases**, validating each step before moving forward.

---

# 🧠 CONTEXT

This is an **offline-first POS system** with:

* Local database (SQLite or equivalent)
* Remote backend API
* Existing SyncService (currently flawed)
* EventStream for real-time updates (optional path)

---

# ❌ CURRENT PROBLEM

The app currently:

* Performs **full data sync on every launch**
* Re-fetches all records regardless of changes
* Clears or ignores local DB on logout/login
* Does not scale with large datasets

---

# 🎯 TARGET BEHAVIOR

We want a system that:

* Persists **store-scoped local data**
* Syncs **incrementally (delta-based)**
* Uses **progressive hydration**, not full blocking sync
* Reuses local DB across sessions (same store)
* Scales to **100k+ records efficiently**
* Provides excellent **offline UX**

---

# ⚠️ HARD CONSTRAINTS

* DO NOT perform full dataset sync on every launch
* DO NOT wipe local DB on logout (same store)
* DO NOT use offset pagination
* DO NOT block UI on large syncs

---

# 🧩 EXECUTION PLAN (MANDATORY PHASES)

---

## 🔹 PHASE 1 — Analyze Current System

* Identify how SyncService currently works:

  * Entry points (e.g., sync(), init(), login flow)
  * Data fetching strategy
  * Where full sync is triggered
* Map current data flow:

  * API → SyncService → Local DB

### Output:

* Clear breakdown of current architecture
* List of scalability and inefficiency issues

STOP after this phase and wait for confirmation.

---

## 🔹 PHASE 2 — Design Target Architecture

Redesign SyncService using:

### Key Components:

* Bootstrap Loader (initial minimal data)
* Background Sync Engine
* Delta Sync (since timestamp/version)
* Pagination Handler (cursor-based)
* Outbox (for offline writes)

### Define:

* Data tiers:

  * Tier 1 (critical)
  * Tier 2 (background)
  * Tier 3 (on-demand)
* Store-scoped persistence model

### Output:

* High-level architecture diagram (textual)
* Data flow definition
* Sync lifecycle:

  * First login
  * Returning login
  * Background sync

STOP and wait for confirmation.

---

## 🔹 PHASE 3 — API Contract Refactor

Redesign backend endpoints:

### Required:

* Cursor-based pagination:

  * limit + cursor
* Delta sync endpoint:

  * /sync?since=timestamp

### Include:

* Example requests/responses
* Required fields:

  * id
  * updated_at
  * version
  * deleted_at

### Output:

* Final API contract

STOP and wait for confirmation.

---

## 🔹 PHASE 4 — Sync Engine Implementation Plan

Define logic for:

### 1. First Login (Cold Start)

* Minimal bootstrap
* Background progressive hydration

### 2. Returning Login

* Load from local DB instantly
* Trigger delta sync

### 3. Background Sync Loop

* Pagination handling
* Retry strategy
* Deduplication

### 4. Outbox Processing

* Queue
* Retry
* Failure handling

### Output:

* Pseudocode for each flow

STOP and wait for confirmation.

---

## 🔹 PHASE 6 — Refactor Strategy

Provide:

* Step-by-step migration plan from current system
* Identify:

  * What to remove
  * What to replace
  * What to keep

### Include:

* Risk points
* Data migration concerns

---

# 🧠 DESIGN RULES

Always optimize for:

* Efficiency (minimal data transfer)
* Incrementality (only changes)
* Scalability (large datasets)
* Offline usability (local-first reads)

---

# 🚫 ANTI-PATTERNS (STRICTLY FORBIDDEN)

* Full dataset sync on launch
* Offset pagination
* Blocking UI for sync
* Re-fetching unchanged data

---

# ✅ SUCCESS CRITERIA

* App loads instantly after first sync
* No redundant API calls
* Sync time grows slowly as data grows
* Works reliably offline

---

# IMPORTANT

Think like a **distributed systems engineer**, not a CRUD developer.

Every decision must justify:

* bandwidth usage
* latency impact
* scalability behavior

Proceed with PHASE 1.
