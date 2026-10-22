-- =====================================================================
-- GlowMart database. Paste this whole file into
-- Supabase -> SQL Editor -> New query -> Run.
-- Safe to run again: it drops and recreates policies and functions.
-- =====================================================================

-- ---------- Tables ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null default '' check (char_length(name) <= 100),
  role       text not null default 'buyer' check (role in ('buyer', 'seller')),
  whatsapp   text check (whatsapp is null or char_length(whatsapp) <= 20),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null,
  title       text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  category    text not null default 'Other' check (char_length(category) <= 40),
  price       numeric(10,2) not null check (price >= 0 and price <= 100000),
  stock       integer not null default 0 check (stock >= 0),
  image_url   text check (image_url is null or char_length(image_url) <= 500),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint products_seller_id_fkey
    foreign key (seller_id) references public.profiles(id) on delete cascade
);

create table if not exists public.orders (
  id           uuid primary key default gen_random_uuid(),
  buyer_id     uuid not null,
  seller_id    uuid not null,
  status       text not null default 'pending'
               check (status in ('pending', 'paid', 'shipped', 'completed', 'cancelled')),
  total        numeric(10,2) not null default 0,
  ship_name    text not null,
  ship_phone   text not null,
  ship_address text not null,
  note         text not null default '',
  created_at   timestamptz not null default now(),
  constraint orders_buyer_id_fkey
    foreign key (buyer_id) references public.profiles(id),
  constraint orders_seller_id_fkey
    foreign key (seller_id) references public.profiles(id)
);

create table if not exists public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  title      text not null,
  price      numeric(10,2) not null,
  qty        integer not null check (qty > 0)
);

create index if not exists products_active_created_idx on public.products (active, created_at desc);
create index if not exists products_seller_idx on public.products (seller_id);
create index if not exists orders_buyer_idx on public.orders (buyer_id, created_at desc);
create index if not exists orders_seller_idx on public.orders (seller_id, created_at desc);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- ---------- Create a profile automatically at sign-up ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role, whatsapp)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)), 100),
    case when new.raw_user_meta_data->>'role' = 'seller' then 'seller' else 'buyer' end,
    left(nullif(trim(new.raw_user_meta_data->>'whatsapp'), ''), 20)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row Level Security ----------
alter table public.profiles    enable row level security;
alter table public.products    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- profiles: names (and sellers' WhatsApp numbers) are public so buyers can contact sellers
drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles
  for select using (true);

drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- products: everyone sees active ones, sellers manage only their own
drop policy if exists "read products" on public.products;
create policy "read products" on public.products
  for select using (active = true or seller_id = auth.uid());

drop policy if exists "sellers add products" on public.products;
create policy "sellers add products" on public.products
  for insert to authenticated
  with check (
    seller_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'seller')
  );

drop policy if exists "sellers edit own products" on public.products;
create policy "sellers edit own products" on public.products
  for update to authenticated
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());

drop policy if exists "sellers delete own products" on public.products;
create policy "sellers delete own products" on public.products
  for delete to authenticated using (seller_id = auth.uid());

-- orders: only the buyer and the seller can read them. Nobody writes directly:
-- orders are created and updated through the functions below.
drop policy if exists "read own orders" on public.orders;
create policy "read own orders" on public.orders
  for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid());

drop policy if exists "read own order items" on public.order_items;
create policy "read own order items" on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
  ));

-- ---------- Place an order (prices and stock are checked on the server) ----------
create or replace function public.place_order(
  p_items   jsonb,
  p_name    text,
  p_phone   text,
  p_address text,
  p_note    text default ''
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  r          record;
  prod       public.products%rowtype;
  v_orders   jsonb := '{}'::jsonb;
  v_order_id uuid;
  v_ids      uuid[] := '{}';
begin
  if v_uid is null then
    raise exception 'Please log in first';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Your cart is empty';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) as t(e)
    where jsonb_typeof(t.e) <> 'object'
       or coalesce(t.e->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or case when coalesce(t.e->>'qty', '') ~ '^[0-9]{1,2}$' then (t.e->>'qty')::int else 0 end < 1
  ) then
    raise exception 'Invalid cart';
  end if;

  if char_length(trim(coalesce(p_name, '')))    not between 1 and 100
  or char_length(trim(coalesce(p_phone, '')))   not between 6 and 30
  or char_length(trim(coalesce(p_address, ''))) not between 5 and 300 then
    raise exception 'Please fill in your name, phone and delivery address';
  end if;

  -- make sure the buyer has a profile row
  insert into public.profiles (id, name) values (v_uid, left(trim(p_name), 100))
  on conflict (id) do nothing;

  for r in
    select (t.e->>'product_id')::uuid as pid, sum((t.e->>'qty')::int)::int as qty
    from jsonb_array_elements(p_items) as t(e)
    group by 1
    order by 1
  loop
    select * into prod from public.products where id = r.pid for update;

    if not found or not prod.active then
      raise exception 'A product in your cart is no longer available';
    end if;
    if prod.seller_id = v_uid then
      raise exception 'You cannot buy your own product';
    end if;
    if prod.stock < r.qty then
      raise exception 'Not enough stock for "%"', prod.title;
    end if;

    -- one order per seller
    if (v_orders ->> prod.seller_id::text) is null then
      insert into public.orders (buyer_id, seller_id, ship_name, ship_phone, ship_address, note)
      values (v_uid, prod.seller_id, trim(p_name), trim(p_phone), trim(p_address), left(coalesce(p_note, ''), 500))
      returning id into v_order_id;
      v_orders := v_orders || jsonb_build_object(prod.seller_id::text, v_order_id);
      v_ids := v_ids || v_order_id;
    else
      v_order_id := (v_orders ->> prod.seller_id::text)::uuid;
    end if;

    insert into public.order_items (order_id, product_id, title, price, qty)
    values (v_order_id, prod.id, prod.title, prod.price, r.qty);

    update public.products set stock = stock - r.qty where id = prod.id;
  end loop;

  update public.orders o
  set total = coalesce((select sum(i.price * i.qty) from public.order_items i where i.order_id = o.id), 0)
  where o.id = any(v_ids);

  return v_ids;
end;
$$;

-- ---------- Change an order's status ----------
create or replace function public.update_order_status(p_order uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  o     public.orders%rowtype;
begin
  if v_uid is null then
    raise exception 'Please log in first';
  end if;

  select * into o from public.orders where id = p_order for update;
  if not found then
    raise exception 'Order not found';
  end if;

  if p_status not in ('paid', 'shipped', 'completed', 'cancelled') then
    raise exception 'Invalid status';
  end if;

  if v_uid = o.seller_id then
    if not (
         (o.status = 'pending' and p_status in ('paid', 'cancelled'))
      or (o.status = 'paid'    and p_status in ('shipped', 'cancelled'))
      or (o.status = 'shipped' and p_status = 'completed')
    ) then
      raise exception 'You cannot change this order from % to %', o.status, p_status;
    end if;
  elsif v_uid = o.buyer_id then
    if not (
         (o.status = 'pending' and p_status = 'cancelled')
      or (o.status = 'shipped' and p_status = 'completed')
    ) then
      raise exception 'You cannot change this order from % to %', o.status, p_status;
    end if;
  else
    raise exception 'Not allowed';
  end if;

  if p_status = 'cancelled' then
    update public.products p
    set stock = p.stock + i.qty
    from public.order_items i
    where i.order_id = o.id and i.product_id = p.id;
  end if;

  update public.orders set status = p_status where id = o.id;
end;
$$;

revoke all on function public.place_order(jsonb, text, text, text, text) from public, anon;
grant execute on function public.place_order(jsonb, text, text, text, text) to authenticated;
revoke all on function public.update_order_status(uuid, text) from public, anon;
grant execute on function public.update_order_status(uuid, text) to authenticated;

-- ---------- Product photo storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "upload to own folder" on storage.objects;
create policy "upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "see own files" on storage.objects;
create policy "see own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "update own files" on storage.objects;
create policy "update own files" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "delete own files" on storage.objects;
create policy "delete own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);
