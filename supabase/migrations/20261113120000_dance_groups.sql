-- Additive dancer groups. This file does not alter, rewrite, or delete existing
-- events, people, availability, shortlists, or invites. A event with no groups
-- continues to load with an empty group list.

create table public.hupaak_groups (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.hupaak_campaigns (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint hupaak_groups_name_not_blank check (char_length(btrim(name)) > 0)
);

create table public.hupaak_group_members (
  group_id uuid not null references public.hupaak_groups (id) on delete cascade,
  person_id uuid not null references public.hupaak_people (id) on delete cascade,
  primary key (group_id, person_id)
);

create index hupaak_groups_campaign_id_idx on public.hupaak_groups (campaign_id, position, created_at);
create index hupaak_group_members_person_id_idx on public.hupaak_group_members (person_id);

alter table public.hupaak_groups enable row level security;
alter table public.hupaak_group_members enable row level security;
alter table public.hupaak_groups force row level security;
alter table public.hupaak_group_members force row level security;

create policy hupaak_groups_select on public.hupaak_groups
  for select to authenticated
  using ((select hupaak_private.can_read_campaign(campaign_id)));

create policy hupaak_groups_insert on public.hupaak_groups
  for insert to authenticated
  with check ((select hupaak_private.can_edit_roster(campaign_id)));

create policy hupaak_groups_update on public.hupaak_groups
  for update to authenticated
  using ((select hupaak_private.can_edit_roster(campaign_id)))
  with check ((select hupaak_private.can_edit_roster(campaign_id)));

create policy hupaak_groups_delete on public.hupaak_groups
  for delete to authenticated
  using ((select hupaak_private.can_edit_roster(campaign_id)));

create policy hupaak_group_members_select on public.hupaak_group_members
  for select to authenticated
  using (
    exists (
      select 1
      from public.hupaak_groups g
      where g.id = group_id
        and (select hupaak_private.can_read_campaign(g.campaign_id))
    )
  );

create policy hupaak_group_members_insert on public.hupaak_group_members
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.hupaak_groups g
      join public.hupaak_people p on p.id = person_id
      where g.id = group_id
        and p.campaign_id = g.campaign_id
        and (select hupaak_private.can_edit_roster(g.campaign_id))
    )
  );

create policy hupaak_group_members_delete on public.hupaak_group_members
  for delete to authenticated
  using (
    exists (
      select 1
      from public.hupaak_groups g
      where g.id = group_id
        and (select hupaak_private.can_edit_roster(g.campaign_id))
    )
  );

revoke all on table public.hupaak_groups from public, anon, authenticated;
revoke all on table public.hupaak_group_members from public, anon, authenticated;

grant select, insert, update, delete on table public.hupaak_groups to authenticated;
grant select, insert, delete on table public.hupaak_group_members to authenticated;

notify pgrst, 'reload schema';
