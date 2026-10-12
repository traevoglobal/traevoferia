-- Traevo Feria · pegar entero en el SQL Editor del proyecto "Traevo Global S.L".
-- Idempotente: se puede ejecutar varias veces. No modifica tablas ajenas.
-- Acceso: solo los emails de public.feria_members (paso 9). El repo es público y la anon key también:
-- "authenticated" no basta, porque cualquiera podría registrarse.

-- 0) Seguridad: si existen tablas con estos nombres que no son de esta app, abortar.
do $$
begin
  if to_regclass('public.suppliers') is not null and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'suppliers' and column_name = 'ai_status') then
    raise exception 'Ya existe public.suppliers y no es de Traevo Feria. No se ha tocado nada.';
  end if;
  if to_regclass('public.project_notes') is not null and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_notes' and column_name = 'competition') then
    raise exception 'Ya existe public.project_notes y no es de Traevo Feria. No se ha tocado nada.';
  end if;
end $$;

-- 0b) Lista blanca de usuarios de la app
create table if not exists public.feria_members (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.feria_members enable row level security;  -- sin políticas: solo se edita desde el SQL Editor
revoke all on public.feria_members from anon, authenticated;

create or replace function public.feria_is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.feria_members m where m.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.feria_is_member() from public, anon;
grant execute on function public.feria_is_member() to authenticated;

-- 1) Perfiles: "profiles" si no existe; si ya existe una ajena, "feria_profiles".
do $$
declare t text;
begin
  if to_regclass('public.feria_profiles') is not null then
    t := 'feria_profiles';
  elsif to_regclass('public.profiles') is not null then
    t := case when obj_description('public.profiles'::regclass, 'pg_class') = 'traevo-feria'
              then 'profiles' else 'feria_profiles' end;
  else
    t := 'profiles';
  end if;

  execute format('create table if not exists public.%I (
      id uuid primary key references auth.users(id) on delete cascade,
      name text not null default '''',
      color text not null default '''',
      updated_at timestamptz not null default now())', t);
  execute format('comment on table public.%I is %L', t, 'traevo-feria');
  execute format('alter table public.%I enable row level security', t);
  execute format('revoke all on public.%I from anon', t);
  execute format('grant select, insert, update on public.%I to authenticated', t);
  execute format('drop policy if exists feria_profiles_select on public.%I', t);
  execute format('create policy feria_profiles_select on public.%I for select to authenticated using ((select public.feria_is_member()))', t);
  execute format('drop policy if exists feria_profiles_insert on public.%I', t);
  execute format('create policy feria_profiles_insert on public.%I for insert to authenticated with check (id = auth.uid() and (select public.feria_is_member()))', t);
  execute format('drop policy if exists feria_profiles_update on public.%I', t);
  execute format('create policy feria_profiles_update on public.%I for update to authenticated using (id = auth.uid() and (select public.feria_is_member())) with check (id = auth.uid())', t);

  -- Trigger: crear el perfil al crear un usuario
  execute format($f$
    create or replace function public.feria_handle_new_user() returns trigger
    language plpgsql security definer set search_path = public as $b$
    begin
      insert into public.%I (id, name) values (new.id, coalesce(new.raw_user_meta_data->>'name', ''))
      on conflict (id) do nothing;
      return new;
    end $b$;
  $f$, t);
  raise notice 'Tabla de perfiles: %', t;
end $$;

drop trigger if exists feria_on_auth_user_created on auth.users;
create trigger feria_on_auth_user_created
  after insert on auth.users
  for each row execute function public.feria_handle_new_user();

-- 2) Proveedores
create table if not exists public.suppliers (
  id uuid primary key,
  company text not null default '',
  company_zh text not null default '',
  contact text not null default '',
  role text not null default '',
  wechat text not null default '',
  phone text not null default '',
  email text not null default '',
  web text not null default '',
  booth text not null default '',
  city text not null default '',
  kind text not null default '',
  products text not null default '',
  price text not null default '',
  moq text not null default '',
  incoterm text not null default '',
  lead_time text not null default '',
  samples text not null default '',
  agreement text not null default '',
  next_step text not null default '',
  project_ids text[] not null default '{}',
  tags text[] not null default '{}',
  rating int not null default 0,
  photos jsonb not null default '[]'::jsonb,
  event text not null default '',
  note text not null default '',
  ai_status text not null default 'pending',
  ai_summary text not null default '',
  deleted boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now()  -- hora del servidor, para descargas incrementales
);
create index if not exists suppliers_synced_at_idx on public.suppliers (synced_at);

-- 3) Análisis interno por proyecto
create table if not exists public.project_notes (
  project_slug text primary key,
  target text not null default '',
  competition text not null default '',
  conclusions text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 4) Last-write-wins por updated_at (una escritura más antigua se ignora)
create or replace function public.feria_suppliers_bu() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.synced_at := now();
  return new;
end $$;
drop trigger if exists feria_suppliers_bu on public.suppliers;
create trigger feria_suppliers_bu before insert or update on public.suppliers
  for each row execute function public.feria_suppliers_bu();

create or replace function public.feria_notes_bu() returns trigger language plpgsql as $$
begin
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end $$;
drop trigger if exists feria_notes_bu on public.project_notes;
create trigger feria_notes_bu before update on public.project_notes
  for each row execute function public.feria_notes_bu();

-- 5) RLS: solo miembros (feria_members)
alter table public.suppliers enable row level security;
alter table public.project_notes enable row level security;
revoke all on public.suppliers, public.project_notes from anon;
grant select, insert, update, delete on public.suppliers, public.project_notes to authenticated;

drop policy if exists feria_suppliers_all on public.suppliers;
create policy feria_suppliers_all on public.suppliers
  for all to authenticated using ((select public.feria_is_member())) with check ((select public.feria_is_member()));
drop policy if exists feria_notes_all on public.project_notes;
create policy feria_notes_all on public.project_notes
  for all to authenticated using ((select public.feria_is_member())) with check ((select public.feria_is_member()));

-- 6) Storage: bucket privado "photos"
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists feria_photos_select on storage.objects;
create policy feria_photos_select on storage.objects
  for select to authenticated using (bucket_id = 'photos' and (select public.feria_is_member()));
drop policy if exists feria_photos_insert on storage.objects;
create policy feria_photos_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'photos' and (select public.feria_is_member()));
drop policy if exists feria_photos_update on storage.objects;
create policy feria_photos_update on storage.objects
  for update to authenticated using (bucket_id = 'photos' and (select public.feria_is_member()))
  with check (bucket_id = 'photos' and (select public.feria_is_member()));
drop policy if exists feria_photos_delete on storage.objects;
create policy feria_photos_delete on storage.objects
  for delete to authenticated using (bucket_id = 'photos' and (select public.feria_is_member()));

-- 7) Realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'suppliers') then
    alter publication supabase_realtime add table public.suppliers;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_notes') then
    alter publication supabase_realtime add table public.project_notes;
  end if;
end $$;

-- 8) Caché de IA (la usa la Edge Function "ai-proxy" con el token del usuario)
create table if not exists public.ai_cache (
  hash text primary key,  -- sha256 de "translate:<dir>:<texto>"
  kind text not null default '',
  result text not null,
  created_at timestamptz not null default now()
);
alter table public.ai_cache enable row level security;
revoke all on public.ai_cache from anon;
grant select, insert on public.ai_cache to authenticated;
drop policy if exists feria_ai_cache_select on public.ai_cache;
create policy feria_ai_cache_select on public.ai_cache
  for select to authenticated using ((select public.feria_is_member()));
drop policy if exists feria_ai_cache_insert on public.ai_cache;
create policy feria_ai_cache_insert on public.ai_cache
  for insert to authenticated with check ((select public.feria_is_member()));

-- 9) Miembros. Ejecutar APARTE con vuestros emails de acceso (no se guardan en el repo):
--   insert into public.feria_members (email) values (lower('EMAIL_JAVI')), (lower('EMAIL_RAFA')) on conflict do nothing;
do $$
begin
  if not exists (select 1 from public.feria_members) then
    raise warning 'feria_members está vacía: nadie podrá usar la app hasta añadir vuestros emails (paso 9).';
  end if;
end $$;
