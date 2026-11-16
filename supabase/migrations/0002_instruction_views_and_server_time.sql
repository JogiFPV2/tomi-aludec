-- Podglądy instrukcji modelu: licznik na gracza i model (limit darmowych podglądów).
create table if not exists public.instruction_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  model_id text not null check (char_length(model_id) between 1 and 40),
  views integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, model_id)
);
alter table public.instruction_views enable row level security;
create policy "instruction_views_select_own" on public.instruction_views for select to authenticated using ((select auth.uid()) = user_id);

-- Zapisuje jeden podgląd instrukcji i zwraca, który to podgląd dla tego modelu.
create or replace function public.view_instruction(p_model text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  if (select auth.uid()) is null then raise exception 'not authenticated'; end if;
  insert into public.instruction_views (user_id, model_id, views) values ((select auth.uid()), p_model, 1)
  on conflict (user_id, model_id) do update set views = public.instruction_views.views + 1, updated_at = now()
  returning views into v;
  return v;
end $$;
revoke all on function public.view_instruction(text) from public, anon;
grant execute on function public.view_instruction(text) to authenticated;

-- Czas serwera (gra pokazuje datę i godzinę wspólną dla wszystkich graczy).
create or replace function public.server_now() returns timestamptz language sql stable set search_path = '' as $$ select now() $$;
grant execute on function public.server_now() to anon, authenticated;

-- Przełącznik limitu podglądów (panel admina): limitEnabled = false → instrukcja zawsze za darmo.
update public.balance set value = value || '{"limitEnabled": true}'::jsonb, updated_at = now() where key = 'instructions';
