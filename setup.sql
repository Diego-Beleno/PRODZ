-- ============================================================
-- PRODZ — Setup Inicial (ejecutar UNA SOLA vez)
-- 1. Abre https://supabase.com/dashboard/project/cecosbigfwgvoezmbapv/sql/new
-- 2. Pega TODO el contenido de schema.sql y ejecútalo
-- 3. Luego pega y ejecuta esto:
-- ============================================================

-- Asignar role admin a Diego (después de registrarse en signup.html)
SELECT public.asignar_admin('belenodiego0702@gmail.com');

-- Si la función no existe aún, ejecuta esto directamente:
-- UPDATE public.profiles SET role = 'admin'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'belenodiego0702@gmail.com');
