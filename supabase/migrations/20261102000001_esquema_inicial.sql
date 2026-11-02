-- =====================================================================
--  LevelUp Recargas — Esquema inicial
--  Revendedores, saldo, pedidos, depósitos por Binance, clientes,
--  tickets y notificaciones. Toda modificación de saldo pasa por
--  funciones del servidor; el navegador nunca puede tocar el saldo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  name       text not null default '',
  store_name text not null default '',
  phone      text not null default '',
  role       text not null default 'reseller' check (role in ('reseller', 'admin')),
  balance    numeric(12,2) not null default 0 check (balance >= 0),
  created_at timestamptz not null default now()
);

create table public.levels (
  id        text primary key,
  name      text not null,
  min_spend numeric(12,2) not null,
  discount  numeric(5,4) not null check (discount >= 0 and discount < 1),
  perks     text[] not null default '{}',
  sort      int not null
);

create table public.packages (
  id        text primary key,
  game      text not null default 'ff',
  code      text not null,
  name      text not null,
  icon      text not null default '💎',
  cost      numeric(10,2) not null check (cost > 0),
  suggested numeric(10,2) not null check (suggested > 0),
  active    boolean not null default true,
  sort      int not null default 0
);

create table public.reseller_prices (
  user_id    uuid not null references public.profiles on delete cascade,
  package_id text not null references public.packages on delete cascade,
  price      numeric(10,2) not null check (price >= 0),
  primary key (user_id, package_id)
);

create table public.orders (
  id           bigint generated always as identity (start with 10001) primary key,
  user_id      uuid not null references public.profiles on delete cascade,
  package_id   text not null references public.packages,
  player_id    text not null check (player_id ~ '^\d{6,12}$'),
  nick         text,
  cost         numeric(10,2) not null,
  price        numeric(10,2) not null,
  status       text not null default 'pendiente'
               check (status in ('pendiente', 'procesando', 'completado', 'fallido')),
  provider_ref text,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index orders_user_date on public.orders (user_id, created_at desc);
create index orders_open on public.orders (status) where status in ('pendiente', 'procesando');

-- Solicitud de depósito: el revendedor paga por Binance, manda la
-- captura por WhatsApp y un administrador la aprueba o rechaza.
create table public.deposits (
  id          bigint generated always as identity (start with 1001) primary key,
  user_id     uuid not null references public.profiles on delete cascade,
  amount      numeric(12,2) not null check (amount > 0),   -- monto que dice haber enviado
  method      text not null default 'binance_pay' check (method in ('binance_pay')),
  reference   text,                                        -- ID de orden de Binance Pay
  status      text not null default 'revision'
              check (status in ('revision', 'aprobado', 'rechazado')),
  credited    numeric(12,2),                               -- monto realmente acreditado
  note        text,                                        -- motivo de rechazo / comentario
  reviewed_by uuid references public.profiles,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);
-- Un mismo ID de orden de Binance no se puede usar dos veces
create unique index deposits_reference_once on public.deposits (reference)
  where reference is not null and status <> 'rechazado';
create index deposits_user on public.deposits (user_id, created_at desc);
create index deposits_open on public.deposits (created_at) where status = 'revision';

-- Libro de movimientos del saldo (cada cambio de saldo deja registro)
create table public.wallet_movements (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles on delete cascade,
  kind          text not null check (kind in ('deposito', 'recarga', 'reembolso', 'ajuste')),
  amount        numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  concept       text not null,
  order_id      bigint references public.orders,
  deposit_id    bigint references public.deposits,
  created_at    timestamptz not null default now()
);
create index movements_user_date on public.wallet_movements (user_id, created_at desc);

create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  name       text not null check (length(name) between 1 and 60),
  player_id  text not null check (player_id ~ '^\d{6,12}$'),
  nick       text,
  phone      text not null default '',
  note       text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, player_id)
);

create table public.tickets (
  id         bigint generated always as identity (start with 201) primary key,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  subject    text not null check (length(subject) between 1 and 120),
  order_id   bigint references public.orders,
  message    text not null check (length(message) between 1 and 4000),
  reply      text,
  status     text not null default 'abierto' check (status in ('abierto', 'respondido', 'cerrado')),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  text       text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public._spend_30d(p_user uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(cost), 0) from orders
  where user_id = p_user and status = 'completado' and created_at >= now() - interval '30 days';
$$;

create or replace function public._level_for(p_user uuid)
returns public.levels language sql stable security definer set search_path = public as $$
  select l.* from levels l where l.min_spend <= _spend_30d(p_user) order by l.min_spend desc limit 1;
$$;

-- Nivel y compras de los últimos 30 días del usuario actual
create or replace function public.my_level()
returns table (level_id text, level_name text, discount numeric, spend_30d numeric,
               next_level_name text, next_min_spend numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_spend numeric := _spend_30d(auth.uid()); v_lvl levels; v_next levels;
begin
  v_lvl := _level_for(auth.uid());
  select * into v_next from levels where min_spend > v_spend order by min_spend limit 1;
  return query select v_lvl.id, v_lvl.name, v_lvl.discount, v_spend, v_next.name, v_next.min_spend;
end $$;

create or replace function public._notify(p_user uuid, p_text text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, text) values (p_user, p_text);
$$;

create or replace function public._touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger orders_touch before update on public.orders
  for each row execute function public._touch_updated_at();

-- Perfil automático al registrarse. Si el correo coincide con
-- app_config.admin_email, la cuenta se crea como administrador.
create or replace function public._on_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_admin text;
begin
  select value #>> '{}' into v_admin from app_config where key = 'admin_email';
  insert into profiles (id, name, store_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'store_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    case when v_admin is not null and v_admin <> '' and lower(new.email) = lower(v_admin) then 'admin' else 'reseller' end
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public._on_new_user();

-- ---------------------------------------------------------------------
-- Operaciones de saldo
-- ---------------------------------------------------------------------

-- Crear una recarga: cobra del saldo de forma atómica
create or replace function public.place_order(p_package text, p_player_id text, p_nick text default null)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pkg packages; v_disc numeric; v_cost numeric(10,2); v_price numeric(10,2);
  v_bal numeric(12,2); v_order orders;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_player_id !~ '^\d{6,12}$' then raise exception 'ID de jugador inválido'; end if;

  select * into v_pkg from packages where id = p_package and active;
  if not found then raise exception 'Paquete no disponible'; end if;

  select balance into v_bal from profiles where id = v_uid for update;
  v_disc := coalesce((_level_for(v_uid)).discount, 0);
  v_cost := round(v_pkg.cost * (1 - v_disc), 2);
  if v_bal < v_cost then raise exception 'Saldo insuficiente'; end if;

  v_price := coalesce((select price from reseller_prices where user_id = v_uid and package_id = p_package), v_pkg.suggested);

  update profiles set balance = balance - v_cost where id = v_uid returning balance into v_bal;
  insert into orders (user_id, package_id, player_id, nick, cost, price)
    values (v_uid, p_package, p_player_id, left(p_nick, 40), v_cost, v_price)
    returning * into v_order;
  insert into wallet_movements (user_id, kind, amount, balance_after, concept, order_id)
    values (v_uid, 'recarga', -v_cost, v_bal, 'Recarga R-' || v_order.id || ' · ' || v_pkg.name, v_order.id);
  return v_order;
end $$;

-- Registrar un depósito por Binance (queda "en revisión")
create or replace function public.create_deposit_request(p_amount numeric, p_reference text default null)
returns public.deposits language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_min numeric; v_ref text := nullif(trim(p_reference), ''); v_dep deposits;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  select (value #>> '{}')::numeric into v_min from app_config where key = 'min_deposit';
  if p_amount is null or p_amount < coalesce(v_min, 10) then
    raise exception 'El depósito mínimo es % USDT', coalesce(v_min, 10);
  end if;
  if p_amount > 10000 then raise exception 'Monto demasiado alto'; end if;
  if v_ref is not null and v_ref !~ '^[A-Za-z0-9-]{6,64}$' then
    raise exception 'ID de orden de Binance inválido';
  end if;
  if (select count(*) from deposits where user_id = v_uid and status = 'revision') >= 3 then
    raise exception 'Ya tienes 3 depósitos en revisión. Espera a que se aprueben';
  end if;
  if v_ref is not null and exists (select 1 from deposits where reference = v_ref and status <> 'rechazado') then
    raise exception 'Ese ID de orden ya fue registrado';
  end if;

  insert into deposits (user_id, amount, reference)
    values (v_uid, round(p_amount, 2), v_ref)
    returning * into v_dep;
  return v_dep;
end $$;

-- ---------------------------------------------------------------------
-- Funciones de administrador
-- ---------------------------------------------------------------------

-- Aprobar: acredita el monto indicado (o el declarado si no se indica)
create or replace function public.admin_approve_deposit(p_deposit bigint, p_amount numeric default null, p_note text default null)
returns public.deposits language plpgsql security definer set search_path = public as $$
declare v_dep deposits; v_credit numeric(12,2); v_bal numeric(12,2);
begin
  if not is_admin() then raise exception 'Solo administradores'; end if;
  select * into v_dep from deposits where id = p_deposit for update;
  if not found then raise exception 'Depósito no existe'; end if;
  if v_dep.status <> 'revision' then raise exception 'El depósito ya fue revisado'; end if;

  v_credit := round(coalesce(p_amount, v_dep.amount), 2);
  if v_credit <= 0 then raise exception 'Monto inválido'; end if;

  update deposits set status = 'aprobado', credited = v_credit, note = p_note,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_deposit returning * into v_dep;
  update profiles set balance = balance + v_credit where id = v_dep.user_id returning balance into v_bal;
  insert into wallet_movements (user_id, kind, amount, balance_after, concept, deposit_id)
    values (v_dep.user_id, 'deposito', v_credit, v_bal, 'Depósito Binance #' || v_dep.id, v_dep.id);
  perform _notify(v_dep.user_id, '✅ Depósito #' || v_dep.id || ' aprobado: +$' || v_credit);
  return v_dep;
end $$;

create or replace function public.admin_reject_deposit(p_deposit bigint, p_reason text)
returns public.deposits language plpgsql security definer set search_path = public as $$
declare v_dep deposits;
begin
  if not is_admin() then raise exception 'Solo administradores'; end if;
  update deposits set status = 'rechazado', note = coalesce(nullif(p_reason, ''), 'Pago no recibido'),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_deposit and status = 'revision' returning * into v_dep;
  if not found then raise exception 'El depósito no existe o ya fue revisado'; end if;
  perform _notify(v_dep.user_id, '❌ Depósito #' || v_dep.id || ' rechazado: ' || v_dep.note);
  return v_dep;
end $$;

create or replace function public.admin_update_order(p_order bigint, p_status text, p_note text default null, p_provider_ref text default null)
returns public.orders language plpgsql security definer set search_path = public as $$
declare v_o orders; v_bal numeric(12,2);
begin
  if not is_admin() then raise exception 'Solo administradores'; end if;
  select * into v_o from orders where id = p_order for update;
  if not found then raise exception 'Pedido no existe'; end if;
  if v_o.status in ('completado', 'fallido') then raise exception 'El pedido ya está cerrado'; end if;

  update orders set status = p_status, note = coalesce(p_note, note), provider_ref = coalesce(p_provider_ref, provider_ref)
   where id = p_order returning * into v_o;

  if p_status = 'fallido' then
    update profiles set balance = balance + v_o.cost where id = v_o.user_id returning balance into v_bal;
    insert into wallet_movements (user_id, kind, amount, balance_after, concept, order_id)
      values (v_o.user_id, 'reembolso', v_o.cost, v_bal, 'Reembolso R-' || v_o.id, v_o.id);
    perform _notify(v_o.user_id, '⚠️ R-' || v_o.id || ' falló. Se reembolsaron $' || v_o.cost);
  elsif p_status = 'completado' then
    perform _notify(v_o.user_id, '✅ R-' || v_o.id || ' entregado a ' || coalesce(v_o.nick, v_o.player_id));
  end if;
  return v_o;
end $$;

create or replace function public.admin_adjust_balance(p_user uuid, p_amount numeric, p_concept text)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_bal numeric(12,2);
begin
  if not is_admin() then raise exception 'Solo administradores'; end if;
  update profiles set balance = balance + round(p_amount, 2) where id = p_user returning balance into v_bal;
  if not found then raise exception 'Usuario no existe'; end if;
  insert into wallet_movements (user_id, kind, amount, balance_after, concept)
    values (p_user, 'ajuste', round(p_amount, 2), v_bal, coalesce(nullif(p_concept, ''), 'Ajuste manual'));
  return v_bal;
end $$;

-- ---------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_admin()                                       to authenticated;
grant execute on function public.my_level()                                       to authenticated;
grant execute on function public.place_order(text, text, text)                    to authenticated;
grant execute on function public.create_deposit_request(numeric, text)            to authenticated;
grant execute on function public.admin_approve_deposit(bigint, numeric, text)     to authenticated;
grant execute on function public.admin_reject_deposit(bigint, text)               to authenticated;
grant execute on function public.admin_update_order(bigint, text, text, text)     to authenticated;
grant execute on function public.admin_adjust_balance(uuid, numeric, text)        to authenticated;

-- ---------------------------------------------------------------------
-- Seguridad por filas (RLS)
-- ---------------------------------------------------------------------
alter table public.app_config       enable row level security;
alter table public.profiles         enable row level security;
alter table public.levels           enable row level security;
alter table public.packages         enable row level security;
alter table public.reseller_prices  enable row level security;
alter table public.orders           enable row level security;
alter table public.deposits         enable row level security;
alter table public.wallet_movements enable row level security;
alter table public.clients          enable row level security;
alter table public.tickets          enable row level security;
alter table public.notifications    enable row level security;

-- Nadie anónimo accede a nada
revoke all on all tables in schema public from anon;

-- Configuración: lectura para usuarios, escritura admin
create policy cfg_read  on public.app_config for select to authenticated using (key in ('binance_pay_id', 'binance_name', 'admin_whatsapp', 'min_deposit', 'support_telegram') or is_admin());
create policy cfg_admin on public.app_config for all    to authenticated using (is_admin()) with check (is_admin());

-- Perfiles: cada uno ve el suyo; solo puede editar nombre, tienda y teléfono
create policy prof_read   on public.profiles for select to authenticated using (id = auth.uid() or is_admin());
create policy prof_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from authenticated;
grant update (name, store_name, phone) on public.profiles to authenticated;

-- Catálogo: lectura para todos los usuarios, edición admin
create policy lvl_read  on public.levels   for select to authenticated using (true);
create policy lvl_admin on public.levels   for all    to authenticated using (is_admin()) with check (is_admin());
create policy pkg_read  on public.packages for select to authenticated using (active or is_admin());
create policy pkg_admin on public.packages for all    to authenticated using (is_admin()) with check (is_admin());

-- Precios propios
create policy price_own on public.reseller_prices for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Pedidos, depósitos y movimientos: solo lectura (se crean vía funciones)
create policy ord_read on public.orders           for select to authenticated using (user_id = auth.uid() or is_admin());
create policy dep_read on public.deposits         for select to authenticated using (user_id = auth.uid() or is_admin());
create policy mov_read on public.wallet_movements for select to authenticated using (user_id = auth.uid() or is_admin());
revoke insert, update, delete on public.orders, public.deposits, public.wallet_movements from authenticated;

-- Clientes propios
create policy cli_own on public.clients for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tickets: el usuario crea y ve los suyos; el admin responde
create policy tk_read   on public.tickets for select to authenticated using (user_id = auth.uid() or is_admin());
create policy tk_insert on public.tickets for insert to authenticated with check (user_id = auth.uid() and status = 'abierto' and reply is null);
create policy tk_admin  on public.tickets for update to authenticated using (is_admin()) with check (is_admin());

-- Notificaciones: ver las propias y marcarlas como leídas
create policy nt_read   on public.notifications for select to authenticated using (user_id = auth.uid());
create policy nt_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete on public.notifications from authenticated;
grant update (read) on public.notifications to authenticated;

-- ---------------------------------------------------------------------
-- Datos iniciales
-- ---------------------------------------------------------------------
insert into public.app_config (key, value) values
  ('binance_pay_id',   '""'),     -- tu Binance Pay ID (número), se configura después
  ('binance_name',     '""'),     -- nombre visible en Binance, para que el revendedor confirme
  ('admin_whatsapp',   '""'),     -- WhatsApp donde llegan los comprobantes (ej. 5215512345678)
  ('admin_email',      '""'),     -- correo del administrador
  ('min_deposit',      '10'),
  ('support_telegram', '""');

insert into public.levels (id, name, min_spend, discount, perks, sort) values
  ('basico',   'Básico',   0,    0,    array['Precios mayoristas', 'Soporte por ticket'], 1),
  ('plata',    'Plata',    200,  0.02, array['-2 % en todos los paquetes', 'Recarga masiva', 'Soporte por WhatsApp'], 2),
  ('oro',      'Oro',      800,  0.04, array['-4 % en todos los paquetes', 'Acceso a API', 'Soporte prioritario'], 3),
  ('diamante', 'Diamante', 2000, 0.06, array['-6 % en todos los paquetes', 'Gestor de cuenta dedicado', 'Pagos a crédito'], 4);

-- Precios de ejemplo: reemplazar por los de tu proveedor
insert into public.packages (id, code, name, icon, cost, suggested, sort) values
  ('ff-100',     '100',     '100 Diamantes',   '💎', 0.85,  1.20,  1),
  ('ff-310',     '310',     '310 Diamantes',   '💎', 2.55,  3.50,  2),
  ('ff-520',     '520',     '520 Diamantes',   '💎', 4.20,  5.80,  3),
  ('ff-1060',    '1060',    '1060 Diamantes',  '💎', 8.40,  11.50, 4),
  ('ff-2180',    '2180',    '2180 Diamantes',  '💎', 16.90, 23.00, 5),
  ('ff-5600',    '5600',    '5600 Diamantes',  '💎', 42.50, 57.00, 6),
  ('ff-semanal', 'semanal', 'Tarjeta semanal', '🎟️', 1.60,  2.30,  7),
  ('ff-mensual', 'mensual', 'Tarjeta mensual', '📅', 7.90,  10.50, 8),
  ('ff-booyah',  'booyah',  'Pase Booyah',     '🏆', 3.20,  4.50,  9);
