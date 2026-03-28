/**
 * Stateful contract mock for Supabase used by sync parity tests (plan B).
 */

export class ParitySupabaseState {
  readonly tables = new Map<string, Map<string, Record<string, unknown>>>();
  readonly upsertOrder: string[] = [];

  seed(table: string, id: string, row: Record<string, unknown>): void {
    if (!this.tables.has(table)) this.tables.set(table, new Map());
    this.tables.get(table)!.set(id, { ...row, id });
  }

  getAll(table: string): Record<string, unknown>[] {
    return [...(this.tables.get(table)?.values() ?? [])];
  }

  reset(): void {
    this.tables.clear();
    this.upsertOrder.length = 0;
  }
}

function applyEq(rows: Record<string, unknown>[], col: string, val: unknown): Record<string, unknown>[] {
  return rows.filter((r) => r[col] === val);
}

function applyOrProductFilter(rows: Record<string, unknown>[], storeId: string): Record<string, unknown>[] {
  return rows.filter(
    (r) => r.store_id === storeId || r.is_global === true || r.is_global === 'true'
  );
}

/** Parse simple or filter like "store_id.eq.X,is_global.eq.true" */
function applyOrString(rows: Record<string, unknown>[], orStr: string, storeId: string): Record<string, unknown>[] {
  if (orStr.includes('store_id.eq') && orStr.includes('is_global')) {
    return applyOrProductFilter(rows, storeId);
  }
  return rows;
}

export function createSupabaseFromState(state: ParitySupabaseState): {
  supabase: { from: (t: string) => ReturnType<typeof chain> };
} {
  function chain(table: string) {
    const ctx: {
      table: string;
      op: 'select' | 'upsert' | 'delete' | 'insert';
      cols?: string;
      countHead?: boolean;
      filters: Array<[string, string, unknown]>;
      orStr?: string;
      limit?: number;
      range?: [number, number];
      order?: { col: string; ascending?: boolean };
      single?: boolean;
      maybeSingle?: boolean;
      payload?: unknown;
    } = { table, op: 'select', filters: [] };

    const b: any = {
      select(cols?: string, opts?: { count?: string; head?: boolean }) {
        ctx.cols = cols;
        if (opts?.count === 'exact') ctx.countHead = true;
        return b;
      },
      insert(payload: unknown) {
        ctx.op = 'insert';
        ctx.payload = payload;
        return b;
      },
      upsert(payload: unknown, _opts?: unknown) {
        ctx.op = 'upsert';
        ctx.payload = payload;
        state.upsertOrder.push(table);
        return b;
      },
      delete() {
        ctx.op = 'delete';
        return b;
      },
      update(payload: unknown) {
        ctx.op = 'update';
        ctx.payload = payload;
        return b;
      },
      eq(col: string, val: unknown) {
        ctx.filters.push(['eq', col, val]);
        return b;
      },
      or(q: string) {
        ctx.orStr = q;
        return b;
      },
      gte(col: string, val: unknown) {
        ctx.filters.push(['gte', col, val]);
        return b;
      },
      gt(col: string, val: unknown) {
        ctx.filters.push(['gt', col, val]);
        return b;
      },
      in(col: string, vals: unknown) {
        ctx.filters.push(['in', col, vals]);
        return b;
      },
      limit(n: number) {
        ctx.limit = n;
        return b;
      },
      range(from: number, to: number) {
        ctx.range = [from, to];
        return b;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        ctx.order = { col, ascending: opts?.ascending };
        return b;
      },
      single() {
        ctx.single = true;
        return b;
      },
      maybeSingle() {
        ctx.maybeSingle = true;
        return b;
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(run(ctx, state)).then(onFulfilled, onRejected);
      },
    };
    return b;
  }

  return {
    supabase: { from: (t: string) => chain(t) },
  };
}

function run(
  ctx: {
    table: string;
    op: 'select' | 'upsert' | 'delete' | 'insert';
    cols?: string;
    countHead?: boolean;
    filters: Array<[string, string, unknown]>;
    orStr?: string;
    limit?: number;
    range?: [number, number];
    order?: { col: string; ascending?: boolean };
    single?: boolean;
    maybeSingle?: boolean;
    payload?: unknown;
  },
  state: ParitySupabaseState
): Record<string, unknown> {
  const { table } = ctx;

  if (ctx.op === 'upsert') {
    const rows = Array.isArray(ctx.payload) ? ctx.payload : [ctx.payload];
    const clean = rows.filter(Boolean) as Record<string, unknown>[];
    if (!state.tables.has(table)) state.tables.set(table, new Map());
    const m = state.tables.get(table)!;
    for (const r of clean) {
      if (r.id) m.set(String(r.id), { ...r });
    }
    return { data: clean, error: null };
  }

  if (ctx.op === 'delete') {
    let ids = ctx.filters.filter((f) => f[0] === 'eq' && f[1] === 'id').map((f) => f[2]);
    const m = state.tables.get(table);
    if (m && ids[0]) m.delete(String(ids[0]));
    return { data: null, error: null };
  }

  if (ctx.op === 'insert') {
    const row = ctx.payload as Record<string, unknown>;
    if (!state.tables.has(table)) state.tables.set(table, new Map());
    if (row?.id) state.tables.get(table)!.set(String(row.id), row);
    return { data: row, error: null };
  }

  if (ctx.op === 'update') {
    const row = ctx.payload as Record<string, unknown>;
    const inv = ctx.filters.find((f) => f[1] === 'inventory_item_id')?.[2];
    if (inv && table === 'bill_line_items') {
      const m = state.tables.get(table);
      const all = m ? [...m.values()] : [];
      for (const r of all) {
        if (r.inventory_item_id === inv) {
          const id = String(r.id);
          m!.set(id, { ...r, ...row });
        }
      }
    }
    return { data: null, error: null };
  }

  // select
  if (table === 'products' && ctx.cols === 'id' && ctx.limit === 1) {
    return { data: [{ id: 'parity-connectivity-check' }], error: null };
  }

  // Deletion detection: paginated id scan
  if (ctx.cols === 'id' && ctx.range) {
    let rows = state.getAll(table);
    for (const [op, col, val] of ctx.filters) {
      if (op === 'eq') rows = applyEq(rows, col, val);
    }
    const storeEq = ctx.filters.find((f) => f[1] === 'store_id')?.[2];
    if (ctx.orStr && table === 'products' && storeEq !== undefined) {
      rows = applyOrString(rows, ctx.orStr, String(storeEq));
    }
    const idRows = rows.map((r) => ({ id: r.id }));
    const [a, b] = ctx.range;
    return { data: idRows.slice(a, b + 1), error: null };
  }

  if (ctx.countHead && ctx.limit === 0) {
    let rows = state.getAll(table);
    const storeId = ctx.filters.find((f) => f[1] === 'store_id')?.[2] as string | undefined;
    for (const [op, col, val] of ctx.filters) {
      if (op === 'eq') rows = applyEq(rows, col, val);
    }
    if (ctx.orStr && storeId) rows = applyOrString(rows, ctx.orStr, storeId);
    const count = rows.length;
    return { data: null, error: null, count };
  }

  if (table === 'branch_event_log') {
    let rows = state.getAll(table);
    for (const [op, col, val] of ctx.filters) {
      if (op === 'eq') rows = applyEq(rows, col, val);
      if (op === 'gt') rows = rows.filter((r) => Number(r[col]) > Number(val));
    }
    rows.sort((a, b) => Number(a.version) - Number(b.version));
    if (ctx.limit !== undefined) rows = rows.slice(0, ctx.limit);
    return { data: rows, error: null };
  }

  let rows = state.getAll(table);
  let storeIdFilter = ctx.filters.find((f) => f[1] === 'store_id')?.[2] as string | undefined;
  if (!storeIdFilter && ctx.orStr && table === 'products') {
    const m = ctx.orStr.match(/store_id\.eq\.([^,()]+)/);
    if (m) storeIdFilter = m[1];
  }

  if (ctx.orStr && table === 'products' && storeIdFilter) {
    rows = applyOrString(rows, ctx.orStr, storeIdFilter);
  } else {
    for (const [op, col, val] of ctx.filters) {
      if (op === 'eq') rows = applyEq(rows, col, val);
      if (op === 'gte') rows = rows.filter((r) => String(r[col] ?? '') >= String(val));
      if (op === 'gt') rows = rows.filter((r) => Number(r[col]) > Number(val));
      if (op === 'in') {
        const set = new Set(Array.isArray(val) ? val : [val]);
        rows = rows.filter((r) => set.has(r[col]));
      }
    }
  }

  if (ctx.range) {
    const [a, b] = ctx.range;
    rows = rows.slice(a, b + 1);
  } else if (ctx.limit !== undefined) {
    rows = rows.slice(0, ctx.limit);
  }

  if (ctx.cols === 'id' && !ctx.countHead) {
    const idRows = rows.map((r) => ({ id: r.id }));
    return { data: idRows, error: null };
  }

  if (ctx.single) {
    const row = rows[0];
    if (!row) return { data: null, error: { code: 'PGRST116', message: 'No rows' } };
    return { data: row, error: null };
  }

  if (ctx.maybeSingle) {
    const row = rows[0];
    if (!row) return { data: null, error: null };
    return { data: row, error: null };
  }

  return { data: rows, error: null };
}
