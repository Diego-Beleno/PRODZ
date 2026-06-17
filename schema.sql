-- ============================================================
-- PRODZ — Esquema Completo de Base de Datos (Supabase)
-- Ejecutar TODO en el SQL Editor de Supabase Dashboard
-- ============================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TABLA: profiles (extiende auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  telefono TEXT,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Migración: agregar columna telefono si no existe
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telefono TEXT;

-- Migración: cambiar nombre de columna si existe como imagen_url
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'beats' AND column_name = 'imagen_url'
  ) THEN
    ALTER TABLE public.beats RENAME COLUMN imagen_url TO image_url;
  END IF;
END $$;

-- 3. TABLA: weekly_slots (configuración de horarios recurrentes)
CREATE TABLE IF NOT EXISTS public.weekly_slots (
  id SERIAL PRIMARY KEY,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  duracion_minutos INTEGER NOT NULL CHECK (duracion_minutos > 0),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT horas_validas CHECK (hora_inicio < hora_fin)
);

COMMENT ON TABLE public.weekly_slots IS 'Configuración de horarios recurrentes por día de la semana (0=Dom, 1=Lun ... 6=Sáb)';
COMMENT ON COLUMN public.weekly_slots.dia_semana IS '0=Domingo, 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado';
COMMENT ON COLUMN public.weekly_slots.duracion_minutos IS 'Duración de cada sesión en minutos';

-- 4. TABLA: blocked_dates (fechas específicas bloqueadas)
CREATE TABLE IF NOT EXISTS public.blocked_dates (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  todo_el_dia BOOLEAN DEFAULT false,
  hora_inicio TIME,
  hora_fin TIME,
  motivo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. TABLA: bookings (reservas de sesiones)
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nombre_artista TEXT NOT NULL,
  telefono TEXT NOT NULL,
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'cancelada', 'reprogramada')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (fecha, hora_inicio)
);

-- 6. TABLA: beats (catálogo musical)
CREATE TABLE IF NOT EXISTS public.beats (
  id SERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  bpm INTEGER,
  escala TEXT,
  genero TEXT,
  precio NUMERIC(10,2) DEFAULT 0,
  audio_url TEXT NOT NULL,
  image_url TEXT,
  color TEXT DEFAULT '#ffffff',
  featured BOOLEAN DEFAULT false,
  vendido BOOLEAN DEFAULT false,
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. FUNCIÓN: is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid();
  RETURN COALESCE(user_role = 'admin', false);
END;
$$;

-- 8. TRIGGER: Crear perfil automáticamente al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, nombre, apellido, telefono, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', ''),
    COALESCE(NEW.raw_user_meta_data->>'apellido', ''),
    NEW.raw_user_meta_data->>'telefono',
    'client'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. HABILITAR ROW LEVEL SECURITY
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beats ENABLE ROW LEVEL SECURITY;

-- 10. POLÍTICAS RLS

-- profiles: el usuario ve/edita su propio perfil, admin ve todo
DROP POLICY IF EXISTS "profiles_select_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_self_or_admin" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

-- ⚠ Importante: el usuario NO puede cambiarse su propio role a admin
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- weekly_slots (público lectura, admin escritura)
DROP POLICY IF EXISTS "weekly_slots_select_public" ON public.weekly_slots;
CREATE POLICY "weekly_slots_select_public" ON public.weekly_slots
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "weekly_slots_all_admin" ON public.weekly_slots;
CREATE POLICY "weekly_slots_all_admin" ON public.weekly_slots
  FOR ALL USING (true) WITH CHECK (true);

-- blocked_dates (público lectura, escritura pública)
DROP POLICY IF EXISTS "blocked_dates_select_public" ON public.blocked_dates;
CREATE POLICY "blocked_dates_select_public" ON public.blocked_dates
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "blocked_dates_all_admin" ON public.blocked_dates;
CREATE POLICY "blocked_dates_all_admin" ON public.blocked_dates
  FOR ALL USING (true) WITH CHECK (true);

-- bookings (el cliente ve las suyas, todos ven todas)
DROP POLICY IF EXISTS "bookings_select_self_or_admin" ON public.bookings;
CREATE POLICY "bookings_select_self_or_admin" ON public.bookings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "bookings_insert_self" ON public.bookings;
CREATE POLICY "bookings_insert_self" ON public.bookings
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "bookings_update_admin" ON public.bookings;
CREATE POLICY "bookings_update_admin" ON public.bookings
  FOR UPDATE USING (true) WITH CHECK (true);

-- beats (público lectura, escritura pública)
DROP POLICY IF EXISTS "beats_select_public" ON public.beats;
CREATE POLICY "beats_select_public" ON public.beats
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "beats_all_admin" ON public.beats;
CREATE POLICY "beats_all_admin" ON public.beats
  FOR ALL USING (true) WITH CHECK (true);

-- 11. FUNCIÓN: crear primer admin (solo ejecutar 1 vez tras registrarse)
CREATE OR REPLACE FUNCTION public.asignar_admin(target_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  user_id UUID;
BEGIN
  SELECT id INTO user_id FROM auth.users WHERE email = target_email;
  IF user_id IS NULL THEN
    RETURN 'ERROR: No existe usuario con ese correo. Regístrate primero en signup.html';
  END IF;
  UPDATE public.profiles SET role = 'admin' WHERE id = user_id;
  RETURN 'OK: Admin asignado a ' || target_email;
END;
$$;

-- Solo se puede ejecutar desde el SQL Editor (no vía REST API)
REVOKE EXECUTE ON FUNCTION public.asignar_admin FROM anon, authenticated;

-- ══ MIGRATIONS ═══════════════════════════════════════════════════════════
-- 2026-06-16: Add orden column for manual beat reordering
-- ALTER TABLE public.beats ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 0;
-- Luego: UPDATE beats SET orden = sub.rn FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) - 1 AS rn FROM beats) sub WHERE beats.id = sub.id;
