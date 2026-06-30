-- =============================================================================
-- Let the manager (Gavin) add scopes + log variations on-site, WITHOUT ever
-- seeing or setting money. Mirrors the masked-view + guard-trigger patterns
-- from 20260522000003 (worker rate) and 20260522000007 (variations/drafts).
--
--   Scopes:     manager may INSERT + UPDATE (name, hours, status, notes). The
--               three $ columns (quoted_price, materials_budget, target_profit)
--               are forced null on manager INSERT and preserved unchanged on
--               manager UPDATE — he can never write a price. DELETE stays admin
--               (removing a priced scope changes the project quote rollup).
--   Variations: manager may INSERT a description-only, unpriced, pending row.
--               `amount` becomes nullable ("not yet priced"). Manager reads go
--               through project_variations_visible, which masks the amount.
--               Pricing, editing, approving + rejecting stay admin-only.
--
-- Demo mode (VITE_DEMO_MODE=true) short-circuits every hook and never touches
-- Postgres, so this migration only matters once the app is pointed at a real
-- Supabase project. Verify with `supabase db reset` before go-live.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Scopes — manager write + financial-column guard
-- ---------------------------------------------------------------------------
create or replace function enforce_manager_scope_economics()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admin may set anything; only constrain the manager.
  if is_admin() then
    return new;
  end if;
  if is_manager() then
    if tg_op = 'INSERT' then
      new.quoted_price     := null;
      new.materials_budget := null;
      new.target_profit    := null;
    elsif tg_op = 'UPDATE' then
      -- Preserve whatever the admin set; ignore any value the manager's patch
      -- tried to write (the UI hides these fields, but the API call to
      -- `update project_scopes set ...` still carries them).
      new.quoted_price     := old.quoted_price;
      new.materials_budget := old.materials_budget;
      new.target_profit    := old.target_profit;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists project_scopes_manager_economics on project_scopes;
create trigger project_scopes_manager_economics
  before insert or update on project_scopes
  for each row execute function enforce_manager_scope_economics();

-- Manager INSERT + UPDATE (admin already covered by project_scopes_admin_write).
drop policy if exists project_scopes_manager_insert on project_scopes;
create policy project_scopes_manager_insert on project_scopes for insert to authenticated
  with check (is_manager());

drop policy if exists project_scopes_manager_update on project_scopes;
create policy project_scopes_manager_update on project_scopes for update to authenticated
  using (is_manager()) with check (is_manager());

-- ---------------------------------------------------------------------------
-- Variations — nullable amount, manager insert, masked read
-- ---------------------------------------------------------------------------
alter table project_variations alter column amount drop not null;
alter table project_variations drop constraint if exists project_variations_amount_check;
alter table project_variations
  add constraint project_variations_amount_check check (amount is null or amount <> 0);

-- Force any manager-created variation to be unpriced + pending, regardless of
-- what the request body carried.
create or replace function enforce_manager_variation_economics()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_admin() then
    return new;
  end if;
  if is_manager() then
    new.amount      := null;
    new.status      := 'pending';
    new.approved_at := null;
    new.approved_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists project_variations_manager_economics on project_variations;
create trigger project_variations_manager_economics
  before insert on project_variations
  for each row execute function enforce_manager_variation_economics();

-- Manager INSERT only. UPDATE / DELETE stay admin (price + approve + reject).
drop policy if exists project_variations_manager_insert on project_variations;
create policy project_variations_manager_insert on project_variations for insert to authenticated
  with check (is_manager());

-- Manager SELECT through a masked view (amount + approver hidden), same shape
-- as project_scopes_visible. Admin sees the real amount via is_admin().
drop view if exists project_variations_visible;
create view project_variations_visible
  with (security_invoker = false)
  as
  select id,
         project_id,
         description,
         case when is_admin() then amount      else null end as amount,
         status,
         notes,
         created_at,
         created_by,
         case when is_admin() then approved_at else null end as approved_at,
         case when is_admin() then approved_by else null end as approved_by
  from project_variations;

revoke select on project_variations              from anon, authenticated;
-- useCreateVariation does `insert ... select('id')`; keep id readable so the
-- INSERT ... RETURNING id succeeds without exposing the amount.
grant  select (id) on project_variations          to authenticated;
grant  select       on project_variations_visible to authenticated;
