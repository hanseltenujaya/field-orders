-- policies.sql
-- Run this after schema.sql. Also turn on RLS in the table editor or via the statements below.

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;

-- Profiles
create policy "profiles: self read" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: admin read all" on public.profiles
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='admin'));
create policy "profiles: self upsert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles: self update" on public.profiles
  for update using (auth.uid() = id);

-- Customers
create policy "customers: read for all signed-in" on public.customers
  for select using (auth.role() = 'authenticated');

create policy "customers: admin insert" on public.customers
  for insert with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
create policy "customers: admin update" on public.customers
  for update using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));

-- Allow sales to insert leads (optional: remove if you want only admin)
create policy "customers: sales insert leads" on public.customers
  for insert with check (true);

-- Products
create policy "products: read for all signed-in" on public.products
  for select using (auth.role() = 'authenticated');
create policy "products: admin insert" on public.products
  for insert with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
create policy "products: admin update" on public.products
  for update using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));

-- Orders
create policy "orders: sales insert own" on public.orders
  for insert with check (created_by = auth.uid());
create policy "orders: sales read own" on public.orders
  for select using (created_by = auth.uid());

create policy "orders: admin read all" on public.orders
  for select using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
create policy "orders: admin update all" on public.orders
  for update using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));

-- Order items
create policy "order_items: read if parent readable" on public.order_items
for select using (
  exists (
    select 1 from public.orders o 
    where o.id = order_id 
      and (o.created_by = auth.uid() 
           or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'))
  )
);

create policy "order_items: insert if self order" on public.order_items
for insert with check (
  exists (select 1 from public.orders o where o.id = order_id and o.created_by = auth.uid())
);

create policy "order_items: update if self or admin" on public.order_items
for update using (
  exists (
    select 1 from public.orders o 
    where o.id = order_id 
      and (o.created_by = auth.uid() 
           or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'))
  )
);

-- Status history
create policy "status_history: read if order readable" on public.order_status_history
for select using (
  exists (
    select 1 from public.orders o where o.id = order_id 
      and (o.created_by = auth.uid()
           or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'))
  )
);

create policy "status_history: admin insert" on public.order_status_history
for insert with check (
  exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')
);
