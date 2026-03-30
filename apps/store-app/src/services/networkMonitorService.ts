/**
 * Network Monitor Service
 *
 * Intercepts every Supabase HTTP request and produces structured reports so
 * you can see exactly which table, operation, and code path generated each
 * call — and how many there were per sync session.
 *
 * Usage (browser/Electron DevTools console):
 *   window.__networkMonitor.enable()        // start recording
 *   window.__networkMonitor.startSession()  // mark the start of a sync
 *   // … trigger a POS sale / sync …
 *   window.__networkMonitor.report()        // print full breakdown
 *   window.__networkMonitor.disable()       // stop recording
 *   window.__networkMonitor.clear()         // wipe history
 *
 * Auto-enable via localStorage:
 *   localStorage.setItem('pos_network_monitor', 'true')
 *   // then reload — monitoring starts automatically on boot
 */

export interface RequestRecord {
  id: string;
  sessionId: string;
  timestamp: number;
  duration: number | null;        // ms, set on response
  url: string;
  method: string;
  // Parsed from URL
  table: string;
  operation: 'select' | 'count' | 'insert' | 'upsert' | 'update' | 'delete' | 'rpc' | 'auth' | 'other';
  isCountOnly: boolean;           // limit=0 with count=exact → just a COUNT query
  filters: string;                // compact representation of URL query params
  // Response
  status: number | null;
  // Caller identification
  callerStack: string[];          // top 8 non-library frames
  callerSummary: string;          // single-line "who called this"
}

export interface SyncSession {
  id: string;
  label: string;
  startTime: number;
  endTime: number | null;
  requests: RequestRecord[];
}

// ─── helpers ───────────────────────────────────────────────────────────────

function parseUrl(rawUrl: string): Pick<RequestRecord, 'table' | 'operation' | 'isCountOnly' | 'filters'> {
  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split('/').filter(Boolean);

    // /rest/v1/<table>  or  /rest/v1/rpc/<fn>
    // /auth/v1/...
    if (url.pathname.includes('/auth/v1/')) {
      return { table: 'auth', operation: 'auth', isCountOnly: false, filters: '' };
    }
    if (url.pathname.includes('/rpc/')) {
      const fn = segments[segments.indexOf('rpc') + 1] || 'unknown';
      return { table: `rpc:${fn}`, operation: 'rpc', isCountOnly: false, filters: '' };
    }

    const table = segments[segments.length - 1] ?? 'unknown';
    const params = url.searchParams;
    const limit = params.get('limit');
    const prefer = ''; // prefer header is in init, not URL
    const isCountOnly = limit === '0';

    // Build a compact filter string — skip pagination / ordering params
    const SKIP = new Set(['select', 'limit', 'offset', 'order']);
    const filterParts: string[] = [];
    params.forEach((value, key) => {
      if (!SKIP.has(key)) filterParts.push(`${key}=${value}`);
    });

    return {
      table,
      operation: isCountOnly ? 'count' : 'select',
      isCountOnly,
      filters: filterParts.join(' & ') || '—',
    };
  } catch {
    return { table: 'unknown', operation: 'other', isCountOnly: false, filters: '—' };
  }
}

function inferOperation(
  method: string,
  prefer: string,
  parsed: Pick<RequestRecord, 'operation' | 'isCountOnly'>
): RequestRecord['operation'] {
  if (parsed.operation === 'auth' || parsed.operation === 'rpc') return parsed.operation;
  if (parsed.isCountOnly) return 'count';
  const m = method.toUpperCase();
  if (m === 'POST') return prefer.includes('resolution=merge-duplicates') ? 'upsert' : 'insert';
  if (m === 'PATCH') return 'update';
  if (m === 'DELETE') return 'delete';
  return 'select';
}

function captureStack(): string[] {
  const raw = new Error().stack ?? '';
  return raw
    .split('\n')
    .slice(1) // drop "Error" line
    .map(l => l.trim())
    .filter(l =>
      l.startsWith('at ') &&
      !l.includes('networkMonitorService') &&
      !l.includes('node_modules') &&
      !l.includes('<anonymous>') &&
      !l.includes('supabase.ts')
    )
    .slice(0, 8)
    .map(l => {
      // "at functionName (file:line:col)" → "functionName @ file:line"
      const m = l.match(/^at (.+?) \((.+?)(?::\d+:\d+)?\)$/) ??
                l.match(/^at (.+?):(\d+):\d+$/);
      if (!m) return l.replace(/^at /, '');
      const fn = m[1].trim();
      const file = (m[2] ?? '').replace(/.*\/src\//, '').replace(/\?.*/, '');
      return file ? `${fn} @ ${file}` : fn;
    });
}

// ─── main class ────────────────────────────────────────────────────────────

class NetworkMonitorService {
  private _enabled = false;
  private _sessions: SyncSession[] = [];
  private _currentSession: SyncSession | null = null;
  private _pendingRequests = new Map<string, { startTime: number; record: RequestRecord }>();
  private _sessionCounter = 0;

  // ── lifecycle ────────────────────────────────────────────────────────────

  enable(): void {
    this._enabled = true;
    console.log('%c[NetworkMonitor] Enabled — call window.__networkMonitor.startSession() before triggering a sync', 'color:#4ade80;font-weight:bold');
  }

  disable(): void {
    this._enabled = false;
    console.log('[NetworkMonitor] Disabled');
  }

  get isEnabled() { return this._enabled; }

  startSession(label?: string): SyncSession {
    this._sessionCounter++;
    const id = `S${this._sessionCounter}`;
    const session: SyncSession = {
      id,
      label: label ?? `Session ${id}`,
      startTime: Date.now(),
      endTime: null,
      requests: [],
    };
    this._currentSession = session;
    this._sessions.push(session);
    console.log(`%c[NetworkMonitor] ▶ Started ${session.label}`, 'color:#60a5fa;font-weight:bold');
    return session;
  }

  endSession(): void {
    if (this._currentSession) {
      this._currentSession.endTime = Date.now();
      console.log(`%c[NetworkMonitor] ■ Ended ${this._currentSession.label} — call .report() to see results`, 'color:#60a5fa');
      this._currentSession = null;
    }
  }

  clear(): void {
    this._sessions = [];
    this._currentSession = null;
    this._pendingRequests.clear();
    this._sessionCounter = 0;
    console.log('[NetworkMonitor] History cleared');
  }

  // ── internal hooks (called from supabase.ts fetch interceptor) ───────────

  /** Called just before a request is sent. Returns a unique request ID. */
  onRequestStart(url: string, init: RequestInit | undefined): string {
    const id = `R${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    if (!this._enabled) return id;

    const method = (init?.method ?? 'GET').toUpperCase();
    const prefer = (init?.headers as Record<string, string>)?.['prefer'] ?? '';
    const stack = captureStack();
    const parsed = parseUrl(url);
    const operation = inferOperation(method, prefer, parsed);

    const record: RequestRecord = {
      id,
      sessionId: this._currentSession?.id ?? 'no-session',
      timestamp: Date.now(),
      duration: null,
      url,
      method,
      table: parsed.table,
      operation,
      isCountOnly: parsed.isCountOnly,
      filters: parsed.filters,
      status: null,
      callerStack: stack,
      callerSummary: stack[0] ?? '(unknown)',
    };

    this._pendingRequests.set(id, { startTime: Date.now(), record });
    if (this._currentSession) this._currentSession.requests.push(record);

    return id;
  }

  /** Called when a response arrives (or on error). */
  onRequestEnd(id: string, status: number | null): void {
    if (!this._enabled) return;
    const pending = this._pendingRequests.get(id);
    if (!pending) return;
    pending.record.duration = Date.now() - pending.startTime;
    pending.record.status = status;
    this._pendingRequests.delete(id);
  }

  // ── reporting ─────────────────────────────────────────────────────────────

  /** Print a report for the most recent session (or a specific one). */
  report(sessionId?: string): void {
    const session = sessionId
      ? this._sessions.find(s => s.id === sessionId)
      : this._sessions[this._sessions.length - 1];

    if (!session) {
      console.warn('[NetworkMonitor] No sessions recorded yet. Call startSession() first.');
      return;
    }

    const duration = session.endTime
      ? `${((session.endTime - session.startTime) / 1000).toFixed(2)}s`
      : `${((Date.now() - session.startTime) / 1000).toFixed(2)}s (ongoing)`;

    const reqs = session.requests;
    console.groupCollapsed(
      `%c[NetworkMonitor] ${session.label}  •  ${reqs.length} requests  •  ${duration}`,
      'color:#f59e0b;font-size:14px;font-weight:bold'
    );

    // ── 1. By-table summary ──────────────────────────────────────────────
    console.group('📊 Requests per table');
    const byTable = new Map<string, { count: number; ops: Record<string, number>; avgMs: number; totalMs: number }>();
    for (const r of reqs) {
      const entry = byTable.get(r.table) ?? { count: 0, ops: {}, avgMs: 0, totalMs: 0 };
      entry.count++;
      entry.ops[r.operation] = (entry.ops[r.operation] ?? 0) + 1;
      entry.totalMs += r.duration ?? 0;
      byTable.set(r.table, entry);
    }
    const tableRows: Record<string, unknown>[] = [];
    byTable.forEach((v, table) => {
      tableRows.push({
        table,
        total: v.count,
        ops: Object.entries(v.ops).map(([op, n]) => `${op}×${n}`).join(', '),
        avgMs: v.count ? Math.round(v.totalMs / v.count) : 0,
      });
    });
    tableRows.sort((a, b) => (b.total as number) - (a.total as number));
    console.table(tableRows);
    console.groupEnd();

    // ── 2. By-operation summary ──────────────────────────────────────────
    console.group('🔧 Requests per operation');
    const byOp: Record<string, number> = {};
    for (const r of reqs) { byOp[r.operation] = (byOp[r.operation] ?? 0) + 1; }
    console.table(byOp);
    console.groupEnd();

    // ── 3. By-caller summary (top 10) ───────────────────────────────────
    console.group('📍 Top callers');
    const byCaller = new Map<string, number>();
    for (const r of reqs) {
      const key = r.callerSummary;
      byCaller.set(key, (byCaller.get(key) ?? 0) + 1);
    }
    const callerRows = [...byCaller.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([caller, count]) => ({ count, caller }));
    console.table(callerRows);
    console.groupEnd();

    // ── 4. Full request log ──────────────────────────────────────────────
    console.group('📋 All requests (chronological)');
    reqs.forEach((r, i) => {
      const badge = r.isCountOnly ? '🔢' :
        r.operation === 'select' ? '⬇️' :
        r.operation === 'insert' || r.operation === 'upsert' ? '⬆️' :
        r.operation === 'delete' ? '🗑️' :
        r.operation === 'count' ? '🔢' : '🔧';
      const ms = r.duration != null ? `${r.duration}ms` : 'pending';
      const status = r.status != null ? ` HTTP ${r.status}` : '';
      console.groupCollapsed(
        `${String(i + 1).padStart(3)}. ${badge} ${r.operation.padEnd(7)} ${r.table.padEnd(25)} ${ms}${status}`
      );
      console.log('URL     :', r.url);
      console.log('Filters :', r.filters);
      console.log('Caller  :', r.callerSummary);
      if (r.callerStack.length > 1) {
        console.log('Stack   :');
        r.callerStack.forEach(l => console.log('          ', l));
      }
      console.groupEnd();
    });
    console.groupEnd();

    console.groupEnd(); // outer group
  }

  /** Print a one-liner summary of all sessions. */
  sessions(): void {
    if (this._sessions.length === 0) {
      console.log('[NetworkMonitor] No sessions recorded.');
      return;
    }
    console.table(
      this._sessions.map(s => ({
        id: s.id,
        label: s.label,
        requests: s.requests.length,
        durationMs: s.endTime ? s.endTime - s.startTime : null,
        countQueries: s.requests.filter(r => r.isCountOnly).length,
        selectQueries: s.requests.filter(r => r.operation === 'select').length,
        uploads: s.requests.filter(r => ['insert', 'upsert', 'update', 'delete'].includes(r.operation)).length,
      }))
    );
  }

  /** Export raw data for external analysis. */
  export(): SyncSession[] {
    return JSON.parse(JSON.stringify(this._sessions));
  }
}

export const networkMonitorService = new NetworkMonitorService();

// ── Auto-enable from localStorage ─────────────────────────────────────────
if (typeof localStorage !== 'undefined' && localStorage.getItem('pos_network_monitor') === 'true') {
  networkMonitorService.enable();
}

// ── Expose on window for DevTools console access ──────────────────────────
if (typeof window !== 'undefined') {
  (window as any).__networkMonitor = networkMonitorService;
}
