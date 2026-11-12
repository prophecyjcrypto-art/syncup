-- Event data is visible only to people who already belong to that event.
-- Members can read that event's names and availability. They can change only their own times,
-- unless they are an owner, admin, or organizer.
-- Joining requires an unguessable invite. The event id is not enough.
--
-- Apply this file to the hosted SyncUp database before the new app build is safe:
-- project ref iwnyibbjkajayeybmrjt (name syncup).

create or replace function hupaak_private.current_user_id()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'sub', '');
$$;

revoke all on function hupaak_private.current_user_id() from public, anon;
grant execute on function hupaak_private.current_user_id() to authenticated;

create table hupaak_private.organizer_grants (
  campaign_id uuid not null references public.hupaak_campaigns (id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (campaign_id, user_id),
  constraint organizer_grants_user_id_not_blank check (char_length(btrim(user_id)) > 0)
);

alter table hupaak_private.organizer_grants enable row level security;
alter table hupaak_private.organizer_grants force row level security;

revoke all on table hupaak_private.organizer_grants from public, anon, authenticated;

create or replace function hupaak_private.has_organizer_grant(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from hupaak_private.organizer_grants g
    where g.campaign_id = cid
      and g.user_id = hupaak_private.current_user_id()
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
      and hupaak_private.can_read_campaign(p.campaign_id)
  );
$$;

create or replace function hupaak_private.can_write_blocks(pid uuid)
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

revoke all on function hupaak_private.has_organizer_grant(uuid) from public, anon;
revoke all on function hupaak_private.can_read_blocks(uuid) from public, anon;
revoke all on function hupaak_private.can_write_blocks(uuid) from public, anon;
grant execute on function hupaak_private.has_organizer_grant(uuid) to authenticated;
grant execute on function hupaak_private.can_read_blocks(uuid) to authenticated;
grant execute on function hupaak_private.can_write_blocks(uuid) to authenticated;

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

revoke all on function hupaak_private.protect_person_update() from public, anon;
grant execute on function hupaak_private.protect_person_update() to authenticated;

create or replace function hupaak_private.revoke_organizer_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.user_id is not null
    and old.role = 'choreographer'
    and (tg_op = 'DELETE' or new.role is distinct from 'choreographer')
  then
    delete from hupaak_private.organizer_grants g
    where g.campaign_id = old.campaign_id
      and g.user_id = old.user_id::text;
  end if;

  if tg_op = 'DELETE' and old.user_id is not null then
    delete from public.hupaak_access a
    where a.campaign_id = old.campaign_id
      and a.user_id::text = old.user_id::text
      and not exists (
        select 1
        from public.hupaak_campaigns c
        where c.id = old.campaign_id
          and c.owner_id::text = old.user_id::text
      )
      and not exists (
        select 1
        from public.hupaak_admins ad
        where ad.campaign_id = old.campaign_id
          and ad.user_id::text = old.user_id::text
      );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function hupaak_private.revoke_organizer_grant() from public, anon;
grant execute on function hupaak_private.revoke_organizer_grant() to authenticated;

drop trigger if exists hupaak_people_revoke_organizer on public.hupaak_people;
create trigger hupaak_people_revoke_organizer
  after update or delete on public.hupaak_people
  for each row execute function hupaak_private.revoke_organizer_grant();

drop policy if exists hupaak_people_select on public.hupaak_people;
create policy hupaak_people_select on public.hupaak_people
  for select to authenticated
  using ((select hupaak_private.can_read_campaign(campaign_id)));

drop policy if exists hupaak_people_insert on public.hupaak_people;
create policy hupaak_people_insert on public.hupaak_people
  for insert to authenticated
  with check (
    (
      user_id::text = (select hupaak_private.current_user_id())
      and role = 'dancer'
      and (select hupaak_private.can_read_campaign(campaign_id))
    )
    or (
      user_id::text = (select hupaak_private.current_user_id())
      and role = 'choreographer'
      and (select hupaak_private.has_organizer_grant(campaign_id))
    )
    or (select hupaak_private.can_edit_roster(campaign_id))
  );

drop policy if exists hupaak_access_insert on public.hupaak_access;
revoke insert on table public.hupaak_access from public, anon, authenticated;

drop policy if exists hupaak_blocks_all on public.hupaak_blocks;
drop policy if exists hupaak_blocks_select on public.hupaak_blocks;
drop policy if exists hupaak_blocks_insert on public.hupaak_blocks;
drop policy if exists hupaak_blocks_update on public.hupaak_blocks;
drop policy if exists hupaak_blocks_delete on public.hupaak_blocks;

create policy hupaak_blocks_select on public.hupaak_blocks
  for select to authenticated
  using ((select hupaak_private.can_read_blocks(person_id)));

create policy hupaak_blocks_insert on public.hupaak_blocks
  for insert to authenticated
  with check ((select hupaak_private.can_write_blocks(person_id)));

create policy hupaak_blocks_update on public.hupaak_blocks
  for update to authenticated
  using ((select hupaak_private.can_write_blocks(person_id)))
  with check ((select hupaak_private.can_write_blocks(person_id)));

create policy hupaak_blocks_delete on public.hupaak_blocks
  for delete to authenticated
  using ((select hupaak_private.can_write_blocks(person_id)));

create table public.hupaak_organizer_invites (
  campaign_id uuid primary key references public.hupaak_campaigns (id) on delete cascade,
  code text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint hupaak_organizer_invites_code_key unique (code),
  constraint hupaak_organizer_invites_code_format check (code ~ '^[a-f0-9]{32}$')
);

alter table public.hupaak_organizer_invites enable row level security;
alter table public.hupaak_organizer_invites force row level security;

create policy hupaak_organizer_invites_select on public.hupaak_organizer_invites
  for select to authenticated
  using ((select hupaak_private.can_edit_roster(campaign_id)));

revoke all on table public.hupaak_organizer_invites from public, anon, authenticated;
grant select on table public.hupaak_organizer_invites to authenticated;

create or replace function hupaak_private.issue_organizer_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.hupaak_organizer_invites (campaign_id, code)
  values (new.id, pg_catalog.replace(extensions.gen_random_uuid()::text, '-', ''));
  return new;
end;
$$;

revoke all on function hupaak_private.issue_organizer_invite() from public, anon;
grant execute on function hupaak_private.issue_organizer_invite() to authenticated;

drop trigger if exists hupaak_campaigns_organizer_invite on public.hupaak_campaigns;
create trigger hupaak_campaigns_organizer_invite
  after insert on public.hupaak_campaigns
  for each row execute function hupaak_private.issue_organizer_invite();

insert into public.hupaak_organizer_invites (campaign_id, code)
select c.id, pg_catalog.replace(extensions.gen_random_uuid()::text, '-', '')
from public.hupaak_campaigns c
where not exists (
  select 1 from public.hupaak_organizer_invites i where i.campaign_id = c.id
);

create or replace function hupaak_private.column_cast(target regclass, column_name text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  user_type text;
begin
  select a.atttypid::regtype::text
  into user_type
  from pg_catalog.pg_attribute a
  where a.attrelid = target
    and a.attname = column_name
    and a.attnum > 0
    and not a.attisdropped;

  if user_type = 'uuid' then
    return 'uuid';
  end if;
  if user_type = 'text' then
    return 'text';
  end if;
  raise exception 'unsupported user id column';
end;
$$;

revoke all on function hupaak_private.column_cast(regclass, text) from public, anon, authenticated;

create or replace function hupaak_private.grant_membership(cid uuid, uid text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  access_cast text;
begin
  access_cast := hupaak_private.column_cast('public.hupaak_access'::regclass, 'user_id');
  execute format(
    'insert into public.hupaak_access (campaign_id, user_id) values ($1, $2::%s) on conflict (campaign_id, user_id) do nothing',
    access_cast
  )
  using cid, uid;
end;
$$;

revoke all on function hupaak_private.grant_membership(uuid, text) from public, anon, authenticated;

create or replace function public.claim_hupaak_organizer(invite text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  uid text;
  mail text;
  person_name text;
  normalized text;
  people_cast text;
begin
  uid := hupaak_private.current_user_id();
  if uid is null then
    raise exception 'Sign in required';
  end if;

  normalized := pg_catalog.lower(pg_catalog.btrim(
    case when invite is null then ''::text else invite end
  ));
  normalized := pg_catalog.replace(normalized, '-', '');

  if normalized !~ '^[a-f0-9]{32}$' then
    raise exception 'Invalid invite';
  end if;

  select i.campaign_id into cid
  from public.hupaak_organizer_invites i
  where i.code = normalized;

  if cid is null then
    raise exception 'Invalid invite';
  end if;

  insert into hupaak_private.organizer_grants (campaign_id, user_id)
  values (cid, uid)
  on conflict (campaign_id, user_id) do nothing;

  perform hupaak_private.grant_membership(cid, uid);

  update public.hupaak_people
  set role = 'choreographer'
  where campaign_id = cid
    and user_id::text = uid
    and role is distinct from 'choreographer';

  if not found then
    if not exists (
      select 1
      from public.hupaak_people p
      where p.campaign_id = cid
        and p.user_id::text = uid
    ) then
      mail := hupaak_private.jwt_email();
      person_name := pg_catalog.btrim(pg_catalog.split_part(mail, '@', 1));
      if person_name = '' then
        person_name := 'Organizer';
      end if;

      people_cast := hupaak_private.column_cast('public.hupaak_people'::regclass, 'user_id');
      begin
        execute format(
          'insert into public.hupaak_people (campaign_id, user_id, name, email, role, last_updated) values ($1, $2::%s, $3, $4, ''choreographer'', pg_catalog.now())',
          people_cast
        )
        using cid, uid, person_name, mail;
      exception
        when unique_violation then
          update public.hupaak_people
          set role = 'choreographer'
          where campaign_id = cid
            and user_id::text = uid;
      end;
    end if;
  end if;

  return cid;
end;
$$;

create or replace function public.rotate_hupaak_organizer_invite(campaign uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_code text;
begin
  if hupaak_private.current_user_id() is null then
    raise exception 'Sign in required';
  end if;
  if not hupaak_private.can_edit_campaign(campaign) then
    raise exception 'You cannot change this invite';
  end if;

  next_code := pg_catalog.replace(extensions.gen_random_uuid()::text, '-', '');

  update public.hupaak_organizer_invites
  set code = next_code
  where campaign_id = campaign;

  if not found then
    insert into public.hupaak_organizer_invites (campaign_id, code)
    values (campaign, next_code);
  end if;

  return next_code;
end;
$$;

revoke all on function public.claim_hupaak_organizer(text) from public, anon, authenticated;
revoke all on function public.rotate_hupaak_organizer_invite(uuid) from public, anon, authenticated;
grant execute on function public.claim_hupaak_organizer(text) to authenticated;
grant execute on function public.rotate_hupaak_organizer_invite(uuid) to authenticated;

create table public.hupaak_participant_invites (
  campaign_id uuid primary key references public.hupaak_campaigns (id) on delete cascade,
  code text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint hupaak_participant_invites_code_key unique (code),
  constraint hupaak_participant_invites_code_format check (code ~ '^[a-f0-9]{32}$')
);

alter table public.hupaak_participant_invites enable row level security;
alter table public.hupaak_participant_invites force row level security;

create policy hupaak_participant_invites_select on public.hupaak_participant_invites
  for select to authenticated
  using ((select hupaak_private.can_edit_roster(campaign_id)));

revoke all on table public.hupaak_participant_invites from public, anon, authenticated;
grant select on table public.hupaak_participant_invites to authenticated;

create or replace function hupaak_private.issue_participant_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.hupaak_participant_invites (campaign_id, code)
  values (new.id, pg_catalog.replace(extensions.gen_random_uuid()::text, '-', ''));
  return new;
end;
$$;

revoke all on function hupaak_private.issue_participant_invite() from public, anon;
grant execute on function hupaak_private.issue_participant_invite() to authenticated;

drop trigger if exists hupaak_campaigns_participant_invite on public.hupaak_campaigns;
create trigger hupaak_campaigns_participant_invite
  after insert on public.hupaak_campaigns
  for each row execute function hupaak_private.issue_participant_invite();

insert into public.hupaak_participant_invites (campaign_id, code)
select c.id, pg_catalog.replace(extensions.gen_random_uuid()::text, '-', '')
from public.hupaak_campaigns c
where not exists (
  select 1 from public.hupaak_participant_invites i where i.campaign_id = c.id
);

create or replace function public.claim_hupaak_participant(invite text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  uid text;
  normalized text;
begin
  uid := hupaak_private.current_user_id();
  if uid is null then
    raise exception 'Sign in required';
  end if;

  normalized := pg_catalog.lower(pg_catalog.btrim(
    case when invite is null then ''::text else invite end
  ));
  normalized := pg_catalog.replace(normalized, '-', '');

  if normalized !~ '^[a-f0-9]{32}$' then
    raise exception 'Invalid invite';
  end if;

  select i.campaign_id into cid
  from public.hupaak_participant_invites i
  where i.code = normalized;

  if cid is null then
    raise exception 'Invalid invite';
  end if;

  perform hupaak_private.grant_membership(cid, uid);
  return cid;
end;
$$;

create or replace function public.rotate_hupaak_participant_invite(campaign uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_code text;
begin
  if hupaak_private.current_user_id() is null then
    raise exception 'Sign in required';
  end if;
  if not hupaak_private.can_edit_campaign(campaign) then
    raise exception 'You cannot change this invite';
  end if;

  next_code := pg_catalog.replace(extensions.gen_random_uuid()::text, '-', '');

  update public.hupaak_participant_invites
  set code = next_code
  where campaign_id = campaign;

  if not found then
    insert into public.hupaak_participant_invites (campaign_id, code)
    values (campaign, next_code);
  end if;

  return next_code;
end;
$$;

revoke all on function public.claim_hupaak_participant(text) from public, anon, authenticated;
revoke all on function public.rotate_hupaak_participant_invite(uuid) from public, anon, authenticated;
grant execute on function public.claim_hupaak_participant(text) to authenticated;
grant execute on function public.rotate_hupaak_participant_invite(uuid) to authenticated;

revoke all on table public.hupaak_campaigns from public, anon;
revoke all on table public.hupaak_admins from public, anon;
revoke all on table public.hupaak_access from public, anon;
revoke all on table public.hupaak_people from public, anon;
revoke all on table public.hupaak_blocks from public, anon;
revoke all on table public.hupaak_admin_invites from public, anon;

do $$
begin
  if pg_catalog.to_regprocedure('public.purge_hupaak_bin()') is not null then
    execute 'revoke all on function public.purge_hupaak_bin() from public, anon, authenticated';
  end if;
end;
$$;

notify pgrst, 'reload schema';
