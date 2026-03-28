-- 004_fix_memberships_rls.sql
-- Fix: infinite recursion in memberships RLS policies
--
-- Root cause: "Org members can view co-memberships" and "Org admins can manage memberships"
-- policies both query the memberships table itself. PostgreSQL applies RLS to that sub-query
-- too, triggering the same policy again → infinite recursion.
--
-- Fix: introduce SECURITY DEFINER helper functions that bypass RLS when checking
-- membership facts. Policies then call these functions instead of querying memberships directly.

-- ============================================================
-- Helper: returns all org IDs the given user belongs to (bypasses RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_org_ids(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT organization_id FROM memberships WHERE user_id = uid;
$$;

-- ============================================================
-- Helper: returns true if the given user is admin or owner of the org (bypasses RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_org_admin(uid UUID, org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id = uid
      AND organization_id = org_id
      AND role IN ('admin', 'owner')
  );
$$;

-- ============================================================
-- Drop the recursive policies and replace with non-recursive equivalents
-- ============================================================
DROP POLICY IF EXISTS "Org members can view co-memberships" ON memberships;
DROP POLICY IF EXISTS "Org admins can manage memberships" ON memberships;

-- Allow members to see other members in the same org (uses SECURITY DEFINER fn → no recursion)
CREATE POLICY "Org members can view co-memberships"
  ON memberships FOR SELECT
  USING (
    organization_id = ANY(SELECT get_user_org_ids(auth.uid()))
  );

-- Allow org admins/owners to INSERT / UPDATE / DELETE memberships (uses SECURITY DEFINER fn)
CREATE POLICY "Org admins can manage memberships"
  ON memberships FOR ALL
  USING (
    is_org_admin(auth.uid(), organization_id)
  );

-- ============================================================
-- Also fix the organizations policies that had the same indirect recursion:
-- When a user triggers "Org members can view their organization", Postgres checks
-- the memberships sub-query, which hits the recursive memberships policy.
-- Replace with get_user_org_ids() to keep the chain clean.
-- ============================================================
DROP POLICY IF EXISTS "Org members can view their organization" ON organizations;
DROP POLICY IF EXISTS "Org admins can update their organization" ON organizations;
DROP POLICY IF EXISTS "Org admins can delete their organization" ON organizations;

CREATE POLICY "Org members can view their organization"
  ON organizations FOR SELECT
  USING (
    id = ANY(SELECT get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Org admins can update their organization"
  ON organizations FOR UPDATE
  USING (is_org_admin(auth.uid(), id));

CREATE POLICY "Org admins can delete their organization"
  ON organizations FOR DELETE
  USING (is_org_admin(auth.uid(), id));
