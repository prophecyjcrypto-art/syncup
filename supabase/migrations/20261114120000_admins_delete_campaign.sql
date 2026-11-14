-- Admins who can already edit an event may delete it.
-- can_edit_campaign is the owner or an admin. Choreographers are not included.

drop policy if exists hupaak_campaigns_delete on public.hupaak_campaigns;

create policy hupaak_campaigns_delete on public.hupaak_campaigns
  for delete to authenticated
  using ((select hupaak_private.can_edit_campaign(id)));
