# Contract: Home Cash Drawer View Update Behavior

## Purpose

Define expected Home cash drawer behavior after removing periodic polling.

## Behavior Contract

1. Home cash drawer values MUST refresh through existing reactive/event-driven triggers only.
2. Home MUST NOT schedule recurring timer-based refresh checks for this feature.
3. Home MUST NOT show an explicit freshness indicator in this feature scope.
4. Update latency expectation is relative parity with other primary screens that consume the same state path.

## Trigger Sources (allowed)

- Context state changes (e.g. active drawer session changed)
- Relevant transaction list changes
- Sync completion transitions
- Existing event listeners for cross-tab / external update events

## Trigger Sources (forbidden)

- `setInterval` fallback refresh loop in Home
- Any timer whose sole purpose is periodic cash drawer status polling

## Verification Contract

- Static inspection confirms no periodic interval for cash drawer refresh in `Home.tsx`.
- Manual flow confirms Home values update after:
  - opening/closing drawer
  - posting a drawer-related transaction
  - receiving synchronized updates
