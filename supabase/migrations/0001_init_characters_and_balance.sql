-- Zastosowane w projekcie Supabase „tomi-aludec” (12.11.2026)
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 24),
  appearance jsonb not null default '{}'::jsonb,
  points integer not null default 0,
  shift_count integer not null default 0,
  last_position jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index characters_name_lower_idx on public.characters (lower(name));
alter table public.characters enable row level security;
create policy "characters_select_own" on public.characters for select to authenticated using ((select auth.uid()) = user_id);
create policy "characters_insert_own" on public.characters for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "characters_update_own" on public.characters for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.characters_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.points := 0; new.shift_count := 0;
  elsif tg_op = 'UPDATE' and (select auth.role()) = 'authenticated' then
    new.points := old.points; new.shift_count := old.shift_count; new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger characters_guard_trg before insert or update on public.characters for each row execute function public.characters_guard();

create table public.balance (key text primary key, value jsonb not null, description text, updated_at timestamptz not null default now());
alter table public.balance enable row level security;
create policy "balance_read_all" on public.balance for select to anon, authenticated using (true);
insert into public.balance (key, value, description) values
 ('crane', '{"slowSpeed":0.35,"fastSpeed":1.1,"hoistSlow":0.12,"hoistFast":0.4,"accel":1.6,"swingDamping":0.06,"unlockPoints":500}', 'Suwnica'),
 ('player', '{"walkSpeed":2.2,"runSpeed":3.6}', 'Postać'),
 ('instructions', '{"freeViewsPerModel":20,"penaltyPerExtraView":5}', 'Instrukcja modelu'),
 ('pour', '{"startDelaySec":2,"maxPauseSec":15}', 'Mieszarka');
