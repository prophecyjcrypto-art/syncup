-- Apply this file once, only after the new app is live.
-- The previous production client selects saved_slots on every event load. This file
-- revokes that column, so applying it first makes the old client fail to load events.
-- Do not reapply older migrations. Do not rewrite durations, groups, availability,
-- invite codes, or existing people. Do not change hupaak_campaigns_delete.
-- Until it is applied, the app still hides results in the interface, and organizer grants
-- that need is_organizer will fail closed instead of changing a person's role.
--
-- 1. A participant can also be an organizer (is_organizer) without leaving their group.
-- 2. Ordinary participants can read only their own availability blocks.
-- 3. Saved shortlist slots are not selectable by participants. Organizers and admins
--    read them through hupaak_my_saved_slots.

alter table public.hupaak_people
  add column if not exists is_organizer boolean not null default false;

create or replace function hupaak_private.is_campaign_choreographer(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hupaak_people p
    where p.campaign_id = cid
      and p.user_id = (select hupaak_private.current_user_id())
      and (
        p.role = 'choreographer'
        or p.is_organizer
      )
  );
$$;

create or replace function hupaak_private.can_read_blocks(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hupaak_people p
    where p.id = pid
      and (
        p.user_id::text = hupaak_private.current_user_id()
        or hupaak_private.can_edit_roster(p.campaign_id)
      )
  );
$$;

create or replace function hupaak_private.protect_person_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.campaign_id is distinct from old.campaign_id or new.id is distinct from old.id then
    raise exception 'This person cannot be moved';
  end if;

  if hupaak_private.can_edit_roster(old.campaign_id) then
    return new;
  end if;

  if new.is_organizer is distinct from old.is_organizer then
    raise exception 'You can only update your name';
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'You can only update your name';
  end if;

  if new.role is distinct from old.role then
    if new.role = 'choreographer'
      and old.user_id::text = hupaak_private.current_user_id()
      and hupaak_private.has_organizer_grant(old.campaign_id)
    then
      return new;
    end if;
    raise exception 'You can only update your name';
  end if;

  return new;
end;
$$;

drop policy if exists hupaak_admins_insert on public.hupaak_admins;
create policy hupaak_admins_insert on public.hupaak_admins
  for insert to authenticated
  with check (
    role = 'admin'
    and (select hupaak_private.can_edit_roster(campaign_id))
  );

revoke select (saved_slots) on table public.hupaak_campaigns from public, anon, authenticated;

create or replace function public.hupaak_my_saved_slots()
returns table (campaign_id uuid, saved_slots text[])
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.saved_slots
  from public.hupaak_campaigns c
  where hupaak_private.can_edit_roster(c.id);
$$;

revoke all on function public.hupaak_my_saved_slots() from public, anon;
grant execute on function public.hupaak_my_saved_slots() to authenticated;

notify pgrst, 'reload schema';
