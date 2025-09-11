-- Customer Ledger View and Function (Option B: dynamic, immutable journal)
-- Dependencies: tables sale_items, transactions

-- View of ledger entries (credit sales and payments)
create or replace view public.customer_ledger_entries as
with credit_sales as (
  select
    si.store_id,
    si.customer_id,
    si.created_at,
    'sale'::text as kind,
    'LBP'::text as currency,
    si.received_value::numeric as amount,
    si.received_value::numeric as delta,
    si.id as source_id,
    ('SALE-' || right(si.id::text, 8)) as reference,
    ('Credit Sale') as description
  from public.sale_items si
  where si.payment_method = 'credit'
    and si.customer_id is not null
),
customer_payments as (
  select
    t.store_id,
    t.customer_id,
    t.created_at,
    'payment'::text as kind,
    t.currency::text as currency,
    t.amount::numeric as amount,
    (-t.amount)::numeric as delta,
    t.id as source_id,
    coalesce(t.reference, 'P-' || right(t.id::text, 8)) as reference,
    'Payment Received' as description
  from public.transactions t
  where t.category = 'Customer Payment'
    and t.customer_id is not null
)
select * from credit_sales
union all
select * from customer_payments;

-- RPC to fetch ledger with running balances and opening by date range
create or replace function public.get_customer_ledger(
  p_store_id uuid,
  p_customer_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  store_id uuid,
  customer_id uuid,
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
    from public.customer_ledger_entries e
    where e.store_id = p_store_id
      and e.customer_id = p_customer_id
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
  select store_id, customer_id, created_at, kind, currency, amount, delta, source_id, reference, description, running_balance
  from running
  order by created_at asc, kind asc, source_id asc;
$$;

-- Optional: grant execute/select to anon/authenticated as needed

