-- schema.sql
-- Run this first (Database > SQL Editor).

create type order_status as enum ('received','processed','invoiced','shipped','delivered','cancelled');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text check (role in ('sales','admin')) not null default 'sales',
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id bigserial primary key,
  name text not null,
  phone text,
  email text,
  address text,
  city text,
  country text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id bigserial primary key,
  sku text unique not null,
  name text not null,
  unit text default 'pcs',
  price numeric(12,2) not null default 0,
  stock integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id bigserial primary key,
  customer_id bigint not null references public.customers(id),
  created_by uuid not null references auth.users(id),
  submitted_by uuid references auth.users(id),  
  status order_status not null default 'received',
  payment_terms text default null check (payment_terms in ('CASH','CREDIT') or payment_terms is null),
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists submitted_by uuid references auth.users(id);


create table if not exists public.order_items (
  id bigserial primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  product_id bigint not null references public.products(id),
  qty numeric(12,2) not null check (qty > 0),
  price numeric(12,2) not null,
  line_total numeric(14,2) generated always as (qty * price) stored
);

create table if not exists public.order_status_history (
  id bigserial primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  from_status order_status,
  to_status order_status not null,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);

create or replace view public.v_orders as
select
  o.id,
  o.customer_id,
  o.created_by,
  o.submitted_by as submitted_by_id,
  o.status,
  o.payment_terms,
  o.subtotal,
  o.discount,
  o.tax,
  o.total,
  o.notes,
  o.created_at,
  o.updated_at,
  p.full_name as submitted_by_name,
  c.name as customer_name
from public.orders o
join public.customers c on c.id = o.customer_id
left join public.profiles p on p.id = o.submitted_by;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists t_products_updated on public.products;
create trigger t_products_updated before update on public.products
for each row execute function public.touch_updated_at();

drop trigger if exists t_customers_updated on public.customers;
create trigger t_customers_updated before update on public.customers
for each row execute function public.touch_updated_at();

drop trigger if exists t_orders_updated on public.orders;
create trigger t_orders_updated before update on public.orders
for each row execute function public.touch_updated_at();
