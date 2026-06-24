-- ============================================================
-- PRODZ — Fix: añadir política DELETE para bookings (admin)
-- Ejecutar en https://supabase.com/dashboard/project/cecosbigfwgvoezmbapv/sql/new
-- ============================================================

DROP POLICY IF EXISTS "bookings_delete_admin" ON public.bookings;
CREATE POLICY "bookings_delete_admin" ON public.bookings
  FOR DELETE USING (true);
