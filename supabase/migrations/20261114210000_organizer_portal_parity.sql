-- Organizers share the admin portal with the owner and admins.
-- Apply this file once, after 20261114180000_role_grants_and_results_privacy.sql,
-- and only after the app that reads is_organizer is live.
-- Do not apply it from the client. Do not reapply older migrations.
--
-- After 20261114180000, is_campaign_choreographer matches a choreographer role
-- or is_organizer, using the live text user id. This file does not rewrite people,
-- blocks, groups, durations, invite codes, or saved slots.
--
-- hupaak_campaigns_delete is unchanged. Deleting an event stays with the owner
-- and admins (can_edit_campaign). Invite claim and rotate functions are unchanged,
-- so organizers do not issue new codes.

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

  return new;
end;
$$;

-- Organizers can see the admin list and remove an admin from the portal.
drop policy if exists hupaak_admins_select on public.hupaak_admins;
create policy hupaak_admins_select on public.hupaak_admins
  for select to authenticated
  using (
    (select hupaak_private.can_edit_roster(campaign_id))
    or user_id = (select auth.uid())
    or (
      hupaak_private.jwt_email() <> ''
      and email = hupaak_private.jwt_email()
    )
  );

drop policy if exists hupaak_admins_delete on public.hupaak_admins;
create policy hupaak_admins_delete on public.hupaak_admins
  for delete to authenticated
  using ((select hupaak_private.can_edit_roster(campaign_id)));

-- Copying an existing admin invite is portal access. Issuing a new code is not.
drop policy if exists hupaak_admin_invites_select on public.hupaak_admin_invites;
create policy hupaak_admin_invites_select on public.hupaak_admin_invites
  for select to authenticated
  using ((select hupaak_private.can_edit_roster(campaign_id)));
