-- Recreate v_orders view with fallback to created_by when submitted_by is null
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
left join public.profiles p on p.id = coalesce(o.submitted_by, o.created_by);