-- Supplier Ledger View and Function (Option B: dynamic, immutable journal)
-- Dependencies: tables sale_items, transactions, inventory_bills (for commission rate)

-- View to project commission accruals and supplier payments
create or replace view public.supplier_ledger_entries as
with commissions as (
  select
    si.store_id,
    si.supplier_id,
    si.created_at,
    'commission'::text as kind,
    'LBP'::text as currency,
    (
      coalesce(si.received_value, 0)::numeric
      * coalesce(r.rate, 0.1)
      / 100.0
    ) as amount,
    (
      coalesce(si.received_value, 0)::numeric
      * coalesce(r.rate, 0.1)
      / 100.0
    ) as delta,
    si.id as source_id,
    ('SALE-' || right(si.id::text, 8)) as reference,
    'Commission Accrued' as description
  from public.sale_items si
  left join public.inventory_bills invb on invb.id = si.inventory_item_id
  cross join lateral (
    select (
      case 
        when regexp_replace(trim(coalesce(invb.commission_rate::text, '')), '[^0-9.]', '', 'g') ~ '^[0-9]+(\.[0-9]+)?$'
          then regexp_replace(trim(coalesce(invb.commission_rate::text, '')), '[^0-9.]', '', 'g')::numeric
        else null::numeric
      end
    ) as rate
  ) r
  where si.supplier_id is not null
),
supplier_payments as (
  select
    t.store_id,
    t.supplier_id,
    t.created_at,
    'payment'::text as kind,
    t.currency::text as currency,
    t.amount::numeric as amount,
    (-t.amount)::numeric as delta,
    t.id as source_id,
    coalesce(t.reference, 'P-' || right(t.id::text, 8)) as reference,
    'Payment Sent' as description
  from public.transactions t
  where t.category = 'Supplier Payment'
    and t.supplier_id is not null
)
select * from commissions
union all
select * from supplier_payments;

-- RPC for supplier ledger with running balances and opening
create or replace function public.get_supplier_ledger(
  p_store_id uuid,
  p_supplier_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  store_id uuid,
  supplier_id uuid,
  created_at timestamptz,
  kind text,
  currency text,
  amount numeric,
  delta numeric,
  source_id uuid,
  reference text,
  description text,
  running_balance numeric
)
language sql
stable
as $$
  with entries as (
    select *
    from public.supplier_ledger_entries e
    where e.store_id = p_store_id
      and e.supplier_id = p_supplier_id
  ),
  opening_per_currency as (
    select currency,
           coalesce(sum(delta), 0)::numeric as opening
    from entries
    where created_at < p_from
    group by currency
  ),
  filtered as (
    select *
    from entries
    where created_at >= p_from and created_at <= p_to
  ),
  running as (
    select f.*, 
           sum(f.delta) over (partition by f.currency order by f.created_at, f.kind, f.source_id)
             + coalesce((select o.opening from opening_per_currency o where o.currency = f.currency), 0) as running_balance
    from filtered f
  )
  select store_id, supplier_id, created_at, kind, currency, amount, delta, source_id, reference, description, running_balance
  from running
  order by created_at asc, kind asc, source_id asc;
$$;

-- Optional: grant execute/select to anon/authenticated as needed

