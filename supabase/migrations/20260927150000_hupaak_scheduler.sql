-- Hupaak scheduler. These tables are separate from the bakery catalog.

create schema if not exists hupaak_private;

revoke all on schema hupaak_private from public, anon;
grant usage on schema hupaak_private to authenticated;

alter default privileges in schema hupaak_private revoke all on functions from public;

create table public.hupaak_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  remarks text not null default '',
  config jsonb not null,
  expiry_date timestamptz not null,
  on_days date[] not null default '{}',
  compulsory_days date[] not null default '{}',
  saved_slots text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint hupaak_campaigns_config_object check (jsonb_typeof(config) = 'object'),
  constraint hupaak_campaigns_name_not_blank check (char_length(btrim(name)) > 0)
);

create table public.hupaak_admins (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.hupaak_campaigns (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  role text not null default 'admin',
  created_at timestamptz not null default now(),
  constraint hupaak_admins_role_check check (role = 'admin'),
  constraint hupaak_admins_email_check check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint hupaak_admins_campaign_email_key unique (campaign_id, email)
);

create table public.hupaak_access (
  campaign_id uuid not null references public.hupaak_campaigns (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table public.hupaak_people (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.hupaak_campaigns (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null,
  email text not null default '',
  role text not null,
  last_updated timestamptz,
  constraint hupaak_people_role_check check (role in ('choreographer', 'dancer')),
  constraint hupaak_people_name_not_blank check (char_length(btrim(name)) > 0)
);

create table public.hupaak_blocks (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.hupaak_people (id) on delete cascade,
  kind text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  whole_day boolean not null default false,
  constraint hupaak_blocks_kind_check check (kind in ('available', 'unavailable')),
  constraint hupaak_blocks_time_check check (ends_at > starts_at)
);

create index hupaak_campaigns_owner_id_idx on public.hupaak_campaigns (owner_id);
create index hupaak_campaigns_created_at_idx on public.hupaak_campaigns (created_at desc);
create index hupaak_admins_campaign_id_idx on public.hupaak_admins (campaign_id);
create index hupaak_admins_user_id_idx on public.hupaak_admins (user_id);
create index hupaak_admins_email_idx on public.hupaak_admins (email);
create index hupaak_access_user_id_idx on public.hupaak_access (user_id);
create index hupaak_people_campaign_id_idx on public.hupaak_people (campaign_id);
create index hupaak_people_user_id_idx on public.hupaak_people (user_id);
create unique index hupaak_people_campaign_user_uidx
  on public.hupaak_people (campaign_id, user_id)
  where user_id is not null;
create index hupaak_blocks_person_id_idx on public.hupaak_blocks (person_id);

create or replace function hupaak_private.jwt_email()
returns text
language sql
stable
set search_path = ''
as $$
  select pg_catalog.lower(
    case
      when auth.jwt() ->> 'email' is null then ''::text
      else auth.jwt() ->> 'email'
    end
  );
$$;

create or replace function hupaak_private.can_edit_campaign(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hupaak_campaigns c
    where c.id = cid
      and c.owner_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.hupaak_admins a
    where a.campaign_id = cid
      and (
        a.user_id = (select auth.uid())
        or (
          hupaak_private.jwt_email() <> ''
          and a.email = hupaak_private.jwt_email()
        )
      )
  );
$$;

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
      and p.user_id = (select auth.uid())
      and p.role = 'choreographer'
  );
$$;

create or replace function hupaak_private.can_edit_roster(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select hupaak_private.can_edit_campaign(cid)
    or hupaak_private.is_campaign_choreographer(cid);
$$;

create or replace function hupaak_private.can_read_campaign(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select hupaak_private.can_edit_campaign(cid)
    or hupaak_private.is_campaign_choreographer(cid)
    or exists (
      select 1
      from public.hupaak_access a
      where a.campaign_id = cid
        and a.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.hupaak_people p
      where p.campaign_id = cid
        and p.user_id = (select auth.uid())
    );
$$;

create or replace function hupaak_private.protect_campaign_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  editor boolean;
  choreographer boolean;
begin
  editor := hupaak_private.can_edit_campaign(old.id);
  choreographer := hupaak_private.is_campaign_choreographer(old.id);

  if not editor and not choreographer then
    raise exception 'You cannot edit this event';
  end if;

  if new.owner_id is distinct from old.owner_id or new.id is distinct from old.id then
    raise exception 'The owner cannot be changed';
  end if;

  if choreographer and not editor then
    if new.name is distinct from old.name
      or new.remarks is distinct from old.remarks
      or new.config is distinct from old.config
      or new.expiry_date is distinct from old.expiry_date
      or new.on_days is distinct from old.on_days
      or new.compulsory_days is distinct from old.compulsory_days
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Choreographers can only update the shortlist';
    end if;
  end if;

  return new;
end;
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

  if new.user_id is distinct from old.user_id or new.role is distinct from old.role then
    raise exception 'You can only update your name';
  end if;

  return new;
end;
$$;

create or replace function hupaak_private.protect_admin_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if new.campaign_id is distinct from old.campaign_id or new.id is distinct from old.id then
    raise exception 'This admin row cannot be moved';
  end if;

  if exists (
    select 1 from public.hupaak_campaigns c
    where c.id = old.campaign_id and c.owner_id = uid
  ) or exists (
    select 1 from public.hupaak_admins a
    where a.campaign_id = old.campaign_id
      and a.user_id = uid
      and a.id <> old.id
  ) or old.user_id = uid then
    return new;
  end if;

  if old.user_id is null
    and hupaak_private.jwt_email() <> ''
    and old.email = hupaak_private.jwt_email()
    and new.user_id = uid
    and new.email = old.email
    and new.role = old.role
  then
    return new;
  end if;

  raise exception 'You cannot edit this admin';
end;
$$;

create or replace function hupaak_private.lowercase_admin_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := pg_catalog.lower(pg_catalog.btrim(new.email));
  return new;
end;
$$;

create trigger hupaak_campaigns_protect
  before update on public.hupaak_campaigns
  for each row execute function hupaak_private.protect_campaign_update();

create trigger hupaak_people_protect
  before update on public.hupaak_people
  for each row execute function hupaak_private.protect_person_update();

create trigger hupaak_admins_protect
  before update on public.hupaak_admins
  for each row execute function hupaak_private.protect_admin_update();

create trigger hupaak_admins_lowercase
  before insert or update on public.hupaak_admins
  for each row execute function hupaak_private.lowercase_admin_email();

alter table public.hupaak_campaigns enable row level security;
alter table public.hupaak_admins enable row level security;
alter table public.hupaak_access enable row level security;
alter table public.hupaak_people enable row level security;
alter table public.hupaak_blocks enable row level security;

alter table public.hupaak_campaigns force row level security;
alter table public.hupaak_admins force row level security;
alter table public.hupaak_access force row level security;
alter table public.hupaak_people force row level security;
alter table public.hupaak_blocks force row level security;

create policy hupaak_campaigns_select on public.hupaak_campaigns
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (select hupaak_private.can_read_campaign(id))
  );

create policy hupaak_campaigns_insert on public.hupaak_campaigns
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy hupaak_campaigns_update on public.hupaak_campaigns
  for update to authenticated
  using (
    (select hupaak_private.can_edit_campaign(id))
    or (select hupaak_private.is_campaign_choreographer(id))
  )
  with check (
    (select hupaak_private.can_edit_campaign(id))
    or (select hupaak_private.is_campaign_choreographer(id))
  );

create policy hupaak_campaigns_delete on public.hupaak_campaigns
  for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy hupaak_admins_select on public.hupaak_admins
  for select to authenticated
  using (
    (select hupaak_private.can_edit_campaign(campaign_id))
    or user_id = (select auth.uid())
    or (
      hupaak_private.jwt_email() <> ''
      and email = hupaak_private.jwt_email()
    )
  );

create policy hupaak_admins_insert on public.hupaak_admins
  for insert to authenticated
  with check (
    (select hupaak_private.can_edit_campaign(campaign_id))
    and role = 'admin'
  );

create policy hupaak_admins_update on public.hupaak_admins
  for update to authenticated
  using (
    (select hupaak_private.can_edit_campaign(campaign_id))
    or (
      user_id is null
      and hupaak_private.jwt_email() <> ''
      and email = hupaak_private.jwt_email()
    )
  )
  with check (
    (select hupaak_private.can_edit_campaign(campaign_id))
    or (
      user_id = (select auth.uid())
      and hupaak_private.jwt_email() <> ''
      and email = hupaak_private.jwt_email()
    )
  );

create policy hupaak_admins_delete on public.hupaak_admins
  for delete to authenticated
  using ((select hupaak_private.can_edit_campaign(campaign_id)));

create policy hupaak_access_select on public.hupaak_access
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy hupaak_access_insert on public.hupaak_access
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy hupaak_access_delete on public.hupaak_access
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy hupaak_people_select on public.hupaak_people
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select hupaak_private.can_edit_roster(campaign_id))
  );

create policy hupaak_people_insert on public.hupaak_people
  for insert to authenticated
  with check (
    (
      user_id = (select auth.uid())
      and role in ('dancer', 'choreographer')
    )
    or (select hupaak_private.can_edit_roster(campaign_id))
  );

create policy hupaak_people_update on public.hupaak_people
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or (select hupaak_private.can_edit_roster(campaign_id))
  )
  with check (
    user_id = (select auth.uid())
    or (select hupaak_private.can_edit_roster(campaign_id))
  );

create policy hupaak_people_delete on public.hupaak_people
  for delete to authenticated
  using ((select hupaak_private.can_edit_roster(campaign_id)));

create policy hupaak_blocks_all on public.hupaak_blocks
  for all to authenticated
  using (
    exists (
      select 1
      from public.hupaak_people p
      where p.id = person_id
    )
  )
  with check (
    exists (
      select 1
      from public.hupaak_people p
      where p.id = person_id
    )
  );

revoke all on table public.hupaak_campaigns from public, anon, authenticated;
revoke all on table public.hupaak_admins from public, anon, authenticated;
revoke all on table public.hupaak_access from public, anon, authenticated;
revoke all on table public.hupaak_people from public, anon, authenticated;
revoke all on table public.hupaak_blocks from public, anon, authenticated;

grant select, insert, update, delete on table public.hupaak_campaigns to authenticated;
grant select, insert, update, delete on table public.hupaak_admins to authenticated;
grant select, insert, delete on table public.hupaak_access to authenticated;
grant select, insert, update, delete on table public.hupaak_people to authenticated;
grant select, insert, update, delete on table public.hupaak_blocks to authenticated;

revoke all on function hupaak_private.jwt_email() from public, anon, authenticated;
revoke all on function hupaak_private.can_edit_campaign(uuid) from public, anon, authenticated;
revoke all on function hupaak_private.is_campaign_choreographer(uuid) from public, anon, authenticated;
revoke all on function hupaak_private.can_edit_roster(uuid) from public, anon, authenticated;
revoke all on function hupaak_private.can_read_campaign(uuid) from public, anon, authenticated;
revoke all on function hupaak_private.protect_campaign_update() from public, anon, authenticated;
revoke all on function hupaak_private.protect_person_update() from public, anon, authenticated;
revoke all on function hupaak_private.protect_admin_update() from public, anon, authenticated;
revoke all on function hupaak_private.lowercase_admin_email() from public, anon, authenticated;

grant execute on function hupaak_private.jwt_email() to authenticated;
grant execute on function hupaak_private.can_edit_campaign(uuid) to authenticated;
grant execute on function hupaak_private.is_campaign_choreographer(uuid) to authenticated;
grant execute on function hupaak_private.can_edit_roster(uuid) to authenticated;
grant execute on function hupaak_private.can_read_campaign(uuid) to authenticated;
grant execute on function hupaak_private.protect_campaign_update() to authenticated;
grant execute on function hupaak_private.protect_person_update() to authenticated;
grant execute on function hupaak_private.protect_admin_update() to authenticated;
grant execute on function hupaak_private.lowercase_admin_email() to authenticated;

alter publication supabase_realtime add table public.hupaak_campaigns;
alter publication supabase_realtime add table public.hupaak_admins;
alter publication supabase_realtime add table public.hupaak_people;
alter publication supabase_realtime add table public.hupaak_blocks;

notify pgrst, 'reload schema';
