
-- Ensure service_role retains full access
GRANT ALL ON public.credit_ledger TO service_role;
GRANT ALL ON public.credit_reservations TO service_role;
GRANT ALL ON public.stripe_events TO service_role;

-- Revoke direct write privileges from client roles; writes must go through
-- SECURITY DEFINER functions or edge functions using the service role.
REVOKE INSERT, UPDATE, DELETE ON public.credit_ledger FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.credit_reservations FROM anon, authenticated;
REVOKE ALL ON public.stripe_events FROM anon, authenticated;

-- Make the "no client writes" intent explicit at the policy layer as well.
DROP POLICY IF EXISTS "No client writes to credit_ledger" ON public.credit_ledger;
CREATE POLICY "No client writes to credit_ledger"
  ON public.credit_ledger
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "No client writes to credit_reservations" ON public.credit_reservations;
CREATE POLICY "No client writes to credit_reservations"
  ON public.credit_reservations
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "No client updates to credit_reservations" ON public.credit_reservations;
CREATE POLICY "No client updates to credit_reservations"
  ON public.credit_reservations
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "No client deletes on credit_reservations" ON public.credit_reservations;
CREATE POLICY "No client deletes on credit_reservations"
  ON public.credit_reservations
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (false);

-- stripe_events is fully backend-owned; deny all client access explicitly.
DROP POLICY IF EXISTS "No client access to stripe_events" ON public.stripe_events;
CREATE POLICY "No client access to stripe_events"
  ON public.stripe_events
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
