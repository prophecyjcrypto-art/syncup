create table public.hupaak_admin_invites (
  campaign_id uuid primary key references public.hupaak_campaigns (id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  constraint hupaak_admin_invites_code_key unique (code),
  constraint hupaak_admin_invites_code_format check (code ~ '^[a-f0-9]{32}$')
);

alter table public.hupaak_admin_invites enable row level security;
alter table public.hupaak_admin_invites force row level security;

create policy hupaak_admin_invites_select on public.hupaak_admin_invites
  for select to authenticated
  using ((select hupaak_private.can_edit_campaign(campaign_id)));

revoke all on table public.hupaak_admin_invites from public, anon, authenticated;
grant select on table public.hupaak_admin_invites to authenticated;

create or replace function hupaak_private.issue_admin_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.hupaak_admin_invites (campaign_id, code)
  values (new.id, replace(extensions.gen_random_uuid()::text, '-', ''));
  return new;
end;
$$;

create trigger hupaak_campaigns_admin_invite
  after insert on public.hupaak_campaigns
  for each row execute function hupaak_private.issue_admin_invite();

insert into public.hupaak_admin_invites (campaign_id, code)
select c.id, replace(extensions.gen_random_uuid()::text, '-', '')
from public.hupaak_campaigns c
where not exists (
  select 1 from public.hupaak_admin_invites i where i.campaign_id = c.id
);

create or replace function public.claim_hupaak_admin(invite text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  uid uuid := auth.uid();
  mail text;
  normalized text;
begin
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
  from public.hupaak_admin_invites i
  where i.code = normalized;

  if cid is null then
    raise exception 'Invalid invite';
  end if;

  select pg_catalog.lower(u.email) into mail
  from auth.users u
  where u.id = uid;

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

create or replace function public.rotate_hupaak_admin_invite(campaign uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_code text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not hupaak_private.can_edit_campaign(campaign) then
    raise exception 'You cannot change this invite';
  end if;

  next_code := replace(extensions.gen_random_uuid()::text, '-', '');

  update public.hupaak_admin_invites
  set code = next_code
  where campaign_id = campaign;

  if not found then
    insert into public.hupaak_admin_invites (campaign_id, code)
    values (campaign, next_code);
  end if;

  return next_code;
end;
$$;

revoke all on function hupaak_private.issue_admin_invite() from public, anon, authenticated;
revoke all on function public.claim_hupaak_admin(text) from public, anon, authenticated;
revoke all on function public.rotate_hupaak_admin_invite(uuid) from public, anon, authenticated;

grant execute on function hupaak_private.issue_admin_invite() to authenticated;
grant execute on function public.claim_hupaak_admin(text) to authenticated;
grant execute on function public.rotate_hupaak_admin_invite(uuid) to authenticated;
