-- Short invite codes and per-group participant invites.
--
-- Additive only. This file does not change existing 32-hex invite codes, and it does
-- not rewrite events, people, availability, shortlists, or group memberships.
-- Existing ?admin= / ?organizer= / ?participant= links keep working.
-- A short code is stored beside the long code. It stays null until an organizer
-- opens the event (ensure_hupaak_short_codes) or creates a new event.
-- "New code" is the only path that replaces a long code, and only when someone asks.

create or replace function hupaak_private.invite_hex(invite text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when pg_catalog.lower(pg_catalog.replace(pg_catalog.btrim(coalesce(invite, '')), '-', '')) ~ '^[a-f0-9]{32}$'
    then pg_catalog.lower(pg_catalog.replace(pg_catalog.btrim(invite), '-', ''))
    else null
  end
$$;

-- Crockford base32: generated codes omit I, L, O, and U.
-- Typed I/L are read as 1, and O as 0, so a misread character still matches.
create or replace function hupaak_private.invite_short(invite text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  raw text;
begin
  raw := pg_catalog.upper(pg_catalog.btrim(coalesce(invite, '')));
  raw := pg_catalog.replace(raw, 'I', '1');
  raw := pg_catalog.replace(raw, 'L', '1');
  raw := pg_catalog.replace(raw, 'O', '0');
  if raw ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{7}$' then
    return raw;
  end if;
  return null;
end;
$$;

revoke all on function hupaak_private.invite_hex(text) from public, anon, authenticated;
revoke all on function hupaak_private.invite_short(text) from public, anon, authenticated;
grant execute on function hupaak_private.invite_hex(text) to authenticated;
grant execute on function hupaak_private.invite_short(text) to authenticated;

alter table public.hupaak_admin_invites
  add column short_code text;

alter table public.hupaak_organizer_invites
  add column short_code text;

alter table public.hupaak_participant_invites
  add column short_code text;

alter table public.hupaak_admin_invites
  add constraint hupaak_admin_invites_short_code_format
  check (short_code is null or short_code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{7}$');

alter table public.hupaak_organizer_invites
  add constraint hupaak_organizer_invites_short_code_format
  check (short_code is null or short_code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{7}$');

alter table public.hupaak_participant_invites
  add constraint hupaak_participant_invites_short_code_format
  check (short_code is null or short_code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{7}$');

create unique index hupaak_admin_invites_short_code_key
  on public.hupaak_admin_invites (short_code);

create unique index hupaak_organizer_invites_short_code_key
  on public.hupaak_organizer_invites (short_code);

create unique index hupaak_participant_invites_short_code_key
  on public.hupaak_participant_invites (short_code);

create table public.hupaak_group_invites (
  group_id uuid primary key references public.hupaak_groups (id) on delete cascade,
  campaign_id uuid not null references public.hupaak_campaigns (id) on delete cascade,
  short_code text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint hupaak_group_invites_short_code_key unique (short_code),
  constraint hupaak_group_invites_short_code_format check (short_code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{7}$')
);

create index hupaak_group_invites_campaign_id_idx on public.hupaak_group_invites (campaign_id);

alter table public.hupaak_group_invites enable row level security;
alter table public.hupaak_group_invites force row level security;

create policy hupaak_group_invites_select on public.hupaak_group_invites
  for select to authenticated
  using ((select hupaak_private.can_edit_roster(campaign_id)));

revoke all on table public.hupaak_group_invites from public, anon, authenticated;
grant select on table public.hupaak_group_invites to authenticated;

create or replace function hupaak_private.mint_short_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  candidate text;
  i integer;
  n integer;
  taken boolean;
begin
  loop
    candidate := '';
    for i in 1..7 loop
      n := 1 + pg_catalog.floor(pg_catalog.random() * 32)::integer;
      candidate := candidate || pg_catalog.substr(alphabet, n, 1);
    end loop;
    taken := exists (select 1 from public.hupaak_admin_invites where short_code = candidate)
      or exists (select 1 from public.hupaak_organizer_invites where short_code = candidate)
      or exists (select 1 from public.hupaak_participant_invites where short_code = candidate)
      or exists (select 1 from public.hupaak_group_invites where short_code = candidate);
    if not taken then
      return candidate;
    end if;
  end loop;
end;
$$;

revoke all on function hupaak_private.mint_short_code() from public, anon, authenticated;

create or replace function hupaak_private.issue_admin_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_code text;
  next_short text;
  tries integer := 0;
begin
  next_code := pg_catalog.replace(extensions.gen_random_uuid()::text, '-', '');
  loop
    tries := tries + 1;
    next_short := hupaak_private.mint_short_code();
    begin
      insert into public.hupaak_admin_invites (campaign_id, code, short_code)
      values (new.id, next_code, next_short);
      return new;
    exception
      when unique_violation then
        if tries >= 8 then
          raise;
        end if;
        next_code := pg_catalog.replace(extensions.gen_random_uuid()::text, '-', '');
    end;
  end loop;
end;
$$;

create or replace function hupaak_private.issue_organizer_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_code text;
  next_short text;
  tries integer := 0;
begin
  next_code := pg_catalog.replace(extensions.gen_random_uuid()::text, '-', '');
  loop
    tries := tries + 1;
    next_short := hupaak_private.mint_short_code();
    begin
      insert into public.hupaak_organizer_invites (campaign_id, code, short_code)
      values (new.id, next_code, next_short);
      return new;
    exception
      when unique_violation then
        if tries >= 8 then
          raise;
        end if;
        next_code := pg_catalog.replace(extensions.gen_random_uuid()::text, '-', '');
    end;
  end loop;
end;
$$;

create or replace function hupaak_private.issue_participant_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_code text;
  next_short text;
  tries integer := 0;
begin
  next_code := pg_catalog.replace(extensions.gen_random_uuid()::text, '-', '');
  loop
    tries := tries + 1;
    next_short := hupaak_private.mint_short_code();
    begin
      insert into public.hupaak_participant_invites (campaign_id, code, short_code)
      values (new.id, next_code, next_short);
      return new;
    exception
      when unique_violation then
        if tries >= 8 then
          raise;
        end if;
        next_code := pg_catalog.replace(extensions.gen_random_uuid()::text, '-', '');
    end;
  end loop;
end;
$$;

create or replace function hupaak_private.issue_group_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_short text;
  tries integer := 0;
begin
  if exists (select 1 from public.hupaak_group_invites where group_id = new.id) then
    return new;
  end if;
  loop
    tries := tries + 1;
    next_short := hupaak_private.mint_short_code();
    begin
      insert into public.hupaak_group_invites (group_id, campaign_id, short_code)
      values (new.id, new.campaign_id, next_short);
      return new;
    exception
      when unique_violation then
        if tries >= 8 then
          raise;
        end if;
    end;
  end loop;
end;
$$;

revoke all on function hupaak_private.issue_admin_invite() from public, anon;
revoke all on function hupaak_private.issue_organizer_invite() from public, anon;
revoke all on function hupaak_private.issue_participant_invite() from public, anon;
revoke all on function hupaak_private.issue_group_invite() from public, anon;
grant execute on function hupaak_private.issue_admin_invite() to authenticated;
grant execute on function hupaak_private.issue_organizer_invite() to authenticated;
grant execute on function hupaak_private.issue_participant_invite() to authenticated;
grant execute on function hupaak_private.issue_group_invite() to authenticated;

create trigger hupaak_groups_invite
  after insert on public.hupaak_groups
  for each row execute function hupaak_private.issue_group_invite();

-- New rows only. Existing groups that already have no invite get one here.
-- This does not update hupaak_groups or hupaak_group_members.
do $$
declare
  row record;
  next_short text;
  tries integer;
begin
  for row in
    select g.id, g.campaign_id
    from public.hupaak_groups g
    where not exists (
      select 1 from public.hupaak_group_invites i where i.group_id = g.id
    )
  loop
    tries := 0;
    loop
      tries := tries + 1;
      next_short := hupaak_private.mint_short_code();
      begin
        insert into public.hupaak_group_invites (group_id, campaign_id, short_code)
        values (row.id, row.campaign_id, next_short);
        exit;
      exception
        when unique_violation then
          if tries >= 8 then
            raise;
          end if;
      end;
    end loop;
  end loop;
end;
$$;

create or replace function public.claim_hupaak_admin(invite text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  uid text := hupaak_private.current_user_id();
  mail text;
  hex text;
  short text;
begin
  if uid is null then
    raise exception 'Sign in required';
  end if;

  hex := hupaak_private.invite_hex(invite);
  short := hupaak_private.invite_short(invite);
  if hex is null and short is null then
    raise exception 'Invalid invite';
  end if;

  select i.campaign_id into cid
  from public.hupaak_admin_invites i
  where (hex is not null and i.code = hex)
     or (short is not null and i.short_code = short);

  if cid is null then
    raise exception 'Invalid invite';
  end if;

  mail := hupaak_private.jwt_email();

  if mail is null or mail !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'This account has no email';
  end if;

  insert into public.hupaak_access (campaign_id, user_id)
  values (cid, uid)
  on conflict (campaign_id, user_id) do nothing;

  insert into public.hupaak_admins (campaign_id, user_id, email, role)
  values (cid, uid, mail, 'admin')
  on conflict (campaign_id, email) do update
    set user_id = excluded.user_id
    where public.hupaak_admins.user_id is null
       or public.hupaak_admins.user_id = excluded.user_id;

  if not exists (
    select 1 from public.hupaak_admins a
    where a.campaign_id = cid and a.user_id = uid
  ) and not exists (
    select 1 from public.hupaak_campaigns c
    where c.id = cid and c.owner_id = uid
  ) then
    raise exception 'Invalid invite';
  end if;

  return cid;
end;
$$;

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
  hex text;
  short text;
  people_cast text;
begin
  uid := hupaak_private.current_user_id();
  if uid is null then
    raise exception 'Sign in required';
  end if;

  hex := hupaak_private.invite_hex(invite);
  short := hupaak_private.invite_short(invite);
  if hex is null and short is null then
    raise exception 'Invalid invite';
  end if;

  select i.campaign_id into cid
  from public.hupaak_organizer_invites i
  where (hex is not null and i.code = hex)
     or (short is not null and i.short_code = short);

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

create or replace function public.claim_hupaak_participant(invite text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  uid text;
  hex text;
  short text;
begin
  uid := hupaak_private.current_user_id();
  if uid is null then
    raise exception 'Sign in required';
  end if;

  hex := hupaak_private.invite_hex(invite);
  short := hupaak_private.invite_short(invite);
  if hex is null and short is null then
    raise exception 'Invalid invite';
  end if;

  select i.campaign_id into cid
  from public.hupaak_participant_invites i
  where (hex is not null and i.code = hex)
     or (short is not null and i.short_code = short);

  if cid is null then
    raise exception 'Invalid invite';
  end if;

  perform hupaak_private.grant_membership(cid, uid);
  return cid;
end;
$$;

create or replace function public.claim_hupaak_group_invite(invite text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  gid uuid;
  pid uuid;
  uid text;
  mail text;
  person_name text;
  short text;
  people_cast text;
begin
  uid := hupaak_private.current_user_id();
  if uid is null then
    raise exception 'Sign in required';
  end if;

  short := hupaak_private.invite_short(invite);
  if short is null then
    raise exception 'Invalid invite';
  end if;

  select i.group_id, i.campaign_id into gid, cid
  from public.hupaak_group_invites i
  where i.short_code = short;

  if cid is null or gid is null then
    raise exception 'Invalid invite';
  end if;

  perform hupaak_private.grant_membership(cid, uid);

  select p.id into pid
  from public.hupaak_people p
  where p.campaign_id = cid
    and p.user_id::text = uid;

  if pid is null then
    mail := hupaak_private.jwt_email();
    person_name := pg_catalog.btrim(pg_catalog.split_part(coalesce(mail, ''), '@', 1));
    if person_name = '' then
      person_name := 'Participant';
    end if;

    people_cast := hupaak_private.column_cast('public.hupaak_people'::regclass, 'user_id');
    begin
      execute format(
        'insert into public.hupaak_people (campaign_id, user_id, name, email, role, last_updated) values ($1, $2::%s, $3, $4, ''dancer'', null) returning id',
        people_cast
      )
      into pid
      using cid, uid, person_name, coalesce(mail, '');
    exception
      when unique_violation then
        select p.id into pid
        from public.hupaak_people p
        where p.campaign_id = cid
          and p.user_id::text = uid;
    end;
  end if;

  if pid is null then
    raise exception 'Invalid invite';
  end if;

  insert into public.hupaak_group_members (group_id, person_id)
  values (gid, pid)
  on conflict (group_id, person_id) do nothing;

  return cid;
end;
$$;

create or replace function public.claim_hupaak_invite(invite text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  hex text;
  short text;
  found_kind text;
  found_campaign uuid;
begin
  if hupaak_private.current_user_id() is null then
    raise exception 'Sign in required';
  end if;

  hex := hupaak_private.invite_hex(invite);
  short := hupaak_private.invite_short(invite);
  if hex is null and short is null then
    raise exception 'Invalid invite';
  end if;

  select match.kind, match.campaign_id
  into found_kind, found_campaign
  from (
    select 1 as ord, 'admin'::text as kind, i.campaign_id
    from public.hupaak_admin_invites i
    where (hex is not null and i.code = hex)
       or (short is not null and i.short_code = short)
    union all
    select 2, 'organizer', i.campaign_id
    from public.hupaak_organizer_invites i
    where (hex is not null and i.code = hex)
       or (short is not null and i.short_code = short)
    union all
    select 3, 'participant', i.campaign_id
    from public.hupaak_participant_invites i
    where (hex is not null and i.code = hex)
       or (short is not null and i.short_code = short)
    union all
    select 4, 'group', i.campaign_id
    from public.hupaak_group_invites i
    where short is not null and i.short_code = short
  ) match
  order by match.ord
  limit 1;

  if found_campaign is null or found_kind is null then
    raise exception 'Invalid invite';
  end if;

  if found_kind = 'admin' then
    perform public.claim_hupaak_admin(invite);
  elsif found_kind = 'organizer' then
    perform public.claim_hupaak_organizer(invite);
  elsif found_kind = 'participant' then
    perform public.claim_hupaak_participant(invite);
  else
    perform public.claim_hupaak_group_invite(invite);
  end if;

  return jsonb_build_object('campaign_id', found_campaign, 'kind', found_kind);
end;
$$;

create or replace function hupaak_private.write_short_code(target regclass, key_column text, key_value uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_short text;
  tries integer := 0;
  updated integer;
begin
  loop
    tries := tries + 1;
    next_short := hupaak_private.mint_short_code();
    begin
      execute format(
        'update %s set short_code = $1 where %I = $2 and short_code is null',
        target,
        key_column
      )
      using next_short, key_value;
      get diagnostics updated = row_count;
      if updated = 0 then
        execute format('select short_code from %s where %I = $1', target, key_column)
        into next_short
        using key_value;
      end if;
      return next_short;
    exception
      when unique_violation then
        if tries >= 8 then
          raise;
        end if;
    end;
  end loop;
end;
$$;

revoke all on function hupaak_private.write_short_code(regclass, text, uuid) from public, anon, authenticated;

create or replace function public.ensure_hupaak_short_codes(campaign uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  row record;
  next_short text;
  tries integer;
begin
  if hupaak_private.current_user_id() is null then
    raise exception 'Sign in required';
  end if;
  if not hupaak_private.can_edit_roster(campaign) then
    raise exception 'You cannot change this invite';
  end if;

  -- Fill a missing short code only. The long code column is left as it is.
  if hupaak_private.can_edit_campaign(campaign) then
    if exists (
      select 1 from public.hupaak_admin_invites i
      where i.campaign_id = campaign and i.short_code is null
    ) then
      perform hupaak_private.write_short_code('public.hupaak_admin_invites'::regclass, 'campaign_id', campaign);
    end if;
  end if;

  if exists (
    select 1 from public.hupaak_organizer_invites i
    where i.campaign_id = campaign and i.short_code is null
  ) then
    perform hupaak_private.write_short_code('public.hupaak_organizer_invites'::regclass, 'campaign_id', campaign);
  end if;

  if exists (
    select 1 from public.hupaak_participant_invites i
    where i.campaign_id = campaign and i.short_code is null
  ) then
    perform hupaak_private.write_short_code('public.hupaak_participant_invites'::regclass, 'campaign_id', campaign);
  end if;

  for row in
    select g.id
    from public.hupaak_groups g
    where g.campaign_id = campaign
      and not exists (
        select 1 from public.hupaak_group_invites i where i.group_id = g.id
      )
  loop
    tries := 0;
    loop
      tries := tries + 1;
      next_short := hupaak_private.mint_short_code();
      begin
        insert into public.hupaak_group_invites (group_id, campaign_id, short_code)
        values (row.id, campaign, next_short);
        exit;
      exception
        when unique_violation then
          if tries >= 8 then
            raise;
          end if;
      end;
    end loop;
  end loop;
end;
$$;

create or replace function public.rotate_hupaak_admin_invite(campaign uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_code text;
  next_short text;
  tries integer := 0;
begin
  if hupaak_private.current_user_id() is null then
    raise exception 'Sign in required';
  end if;
  if not hupaak_private.can_edit_campaign(campaign) then
    raise exception 'You cannot change this invite';
  end if;

  next_code := pg_catalog.replace(extensions.gen_random_uuid()::text, '-', '');
  loop
    tries := tries + 1;
    next_short := hupaak_private.mint_short_code();
    begin
      update public.hupaak_admin_invites
      set code = next_code, short_code = next_short
      where campaign_id = campaign;
      if not found then
        insert into public.hupaak_admin_invites (campaign_id, code, short_code)
        values (campaign, next_code, next_short);
      end if;
      return next_short;
    exception
      when unique_violation then
        if tries >= 8 then
          raise;
        end if;
    end;
  end loop;
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
  next_short text;
  tries integer := 0;
begin
  if hupaak_private.current_user_id() is null then
    raise exception 'Sign in required';
  end if;
  if not hupaak_private.can_edit_campaign(campaign) then
    raise exception 'You cannot change this invite';
  end if;

  next_code := pg_catalog.replace(extensions.gen_random_uuid()::text, '-', '');
  loop
    tries := tries + 1;
    next_short := hupaak_private.mint_short_code();
    begin
      update public.hupaak_organizer_invites
      set code = next_code, short_code = next_short
      where campaign_id = campaign;
      if not found then
        insert into public.hupaak_organizer_invites (campaign_id, code, short_code)
        values (campaign, next_code, next_short);
      end if;
      return next_short;
    exception
      when unique_violation then
        if tries >= 8 then
          raise;
        end if;
    end;
  end loop;
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
  next_short text;
  tries integer := 0;
begin
  if hupaak_private.current_user_id() is null then
    raise exception 'Sign in required';
  end if;
  if not hupaak_private.can_edit_campaign(campaign) then
    raise exception 'You cannot change this invite';
  end if;

  next_code := pg_catalog.replace(extensions.gen_random_uuid()::text, '-', '');
  loop
    tries := tries + 1;
    next_short := hupaak_private.mint_short_code();
    begin
      update public.hupaak_participant_invites
      set code = next_code, short_code = next_short
      where campaign_id = campaign;
      if not found then
        insert into public.hupaak_participant_invites (campaign_id, code, short_code)
        values (campaign, next_code, next_short);
      end if;
      return next_short;
    exception
      when unique_violation then
        if tries >= 8 then
          raise;
        end if;
    end;
  end loop;
end;
$$;

create or replace function public.rotate_hupaak_group_invite(target uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  next_short text;
  tries integer := 0;
begin
  if hupaak_private.current_user_id() is null then
    raise exception 'Sign in required';
  end if;

  select g.campaign_id into cid
  from public.hupaak_groups g
  where g.id = target;

  if cid is null or not hupaak_private.can_edit_roster(cid) then
    raise exception 'You cannot change this invite';
  end if;

  loop
    tries := tries + 1;
    next_short := hupaak_private.mint_short_code();
    begin
      update public.hupaak_group_invites
      set short_code = next_short
      where group_id = target;
      if not found then
        insert into public.hupaak_group_invites (group_id, campaign_id, short_code)
        values (target, cid, next_short);
      end if;
      return next_short;
    exception
      when unique_violation then
        if tries >= 8 then
          raise;
        end if;
    end;
  end loop;
end;
$$;

revoke all on function public.claim_hupaak_admin(text) from public, anon, authenticated;
revoke all on function public.claim_hupaak_organizer(text) from public, anon, authenticated;
revoke all on function public.claim_hupaak_participant(text) from public, anon, authenticated;
revoke all on function public.claim_hupaak_group_invite(text) from public, anon, authenticated;
revoke all on function public.claim_hupaak_invite(text) from public, anon, authenticated;
revoke all on function public.ensure_hupaak_short_codes(uuid) from public, anon, authenticated;
revoke all on function public.rotate_hupaak_admin_invite(uuid) from public, anon, authenticated;
revoke all on function public.rotate_hupaak_organizer_invite(uuid) from public, anon, authenticated;
revoke all on function public.rotate_hupaak_participant_invite(uuid) from public, anon, authenticated;
revoke all on function public.rotate_hupaak_group_invite(uuid) from public, anon, authenticated;

grant execute on function public.claim_hupaak_admin(text) to authenticated;
grant execute on function public.claim_hupaak_organizer(text) to authenticated;
grant execute on function public.claim_hupaak_participant(text) to authenticated;
grant execute on function public.claim_hupaak_group_invite(text) to authenticated;
grant execute on function public.claim_hupaak_invite(text) to authenticated;
grant execute on function public.ensure_hupaak_short_codes(uuid) to authenticated;
grant execute on function public.rotate_hupaak_admin_invite(uuid) to authenticated;
grant execute on function public.rotate_hupaak_organizer_invite(uuid) to authenticated;
grant execute on function public.rotate_hupaak_participant_invite(uuid) to authenticated;
grant execute on function public.rotate_hupaak_group_invite(uuid) to authenticated;

notify pgrst, 'reload schema';
