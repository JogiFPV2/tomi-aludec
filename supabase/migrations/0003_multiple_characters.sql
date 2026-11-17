-- Kilka postaci na koncie (maks. 5); jedna aktywna – ta wchodzi na halę i zbiera punkty.
alter table public.characters drop constraint if exists characters_user_id_key;
alter table public.characters add column if not exists is_active boolean not null default false;
update public.characters c set is_active = true where not exists (select 1 from public.characters o where o.user_id = c.user_id and o.is_active);
create unique index if not exists characters_one_active_idx on public.characters (user_id) where is_active;
create index if not exists characters_user_idx on public.characters (user_id);

-- Strażnik: punkty zmienia tylko add_points (app.allow_points), aktywną postać tylko set_active_character (app.allow_active).
create or replace function public.characters_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.points := 0; new.shift_count := 0;
    if (select count(*) from public.characters where user_id = new.user_id) >= 5 then
      raise exception 'Masz już 5 postaci – to maksimum na jedno konto.';
    end if;
    new.is_active := not exists (select 1 from public.characters where user_id = new.user_id and is_active);
  elsif tg_op = 'UPDATE' and (select auth.role()) = 'authenticated' then
    new.user_id := old.user_id;
    if coalesce(current_setting('app.allow_points', true), '') <> '1' then new.points := old.points; new.shift_count := old.shift_count; end if;
    if coalesce(current_setting('app.allow_active', true), '') <> '1' then new.is_active := old.is_active; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.set_active_character(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.characters where id = p_id and user_id = v_uid) then raise exception 'Nie ma takiej postaci'; end if;
  perform set_config('app.allow_active', '1', true);
  update public.characters set is_active = false where user_id = v_uid and is_active and id <> p_id;
  update public.characters set is_active = true where id = p_id;
  perform set_config('app.allow_active', '', true);
end $$;
revoke all on function public.set_active_character(uuid) from public, anon;
grant execute on function public.set_active_character(uuid) to authenticated;

create or replace function public.add_points(p_delta integer, p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_pts integer;
begin
  if p_delta is null or p_delta < -1000 or p_delta > 1000 then raise exception 'Nieprawidłowa liczba punktów'; end if;
  select id into v_id from public.characters where user_id = (select auth.uid()) and is_active;
  if v_id is null then raise exception 'Brak postaci'; end if;
  perform set_config('app.allow_points', '1', true);
  update public.characters set points = greatest(0, points + p_delta) where id = v_id returning points into v_pts;
  perform set_config('app.allow_points', '', true);
  insert into public.point_events(character_id, delta, reason) values (v_id, p_delta, left(coalesce(p_reason, ''), 200));
  return v_pts;
end $$;
