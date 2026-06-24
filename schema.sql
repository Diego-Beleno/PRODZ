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

-- 7. TABLA: referrals (historial de referidos)
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(referred_id)
);

-- 8. TABLA: coupons (definición de cupones)
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  tipo_descuento TEXT NOT NULL CHECK (tipo_descuento IN ('fijo', 'porcentaje')),
  valor NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  fecha_expiracion TIMESTAMPTZ,
  max_usos_totales INTEGER DEFAULT NULL CHECK (max_usos_totales IS NULL OR max_usos_totales > 0),
  max_usos_por_usuario INTEGER DEFAULT 1 CHECK (max_usos_por_usuario > 0),
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  asignado_a UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. TABLA: user_coupons (relación N:N + control de usos)
CREATE TABLE IF NOT EXISTS public.user_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  usos_actuales INTEGER DEFAULT 0 CHECK (usos_actuales >= 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, coupon_id)
);

-- 10. TABLA: app_config (configuraciones globales)
CREATE TABLE IF NOT EXISTS public.app_config (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT 'null',
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.app_config (key, value)
VALUES ('tasa_cambio_bs', '60')
ON CONFLICT (key) DO NOTHING;

-- 11. FUNCIÓN: is_admin()
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

-- 11. FUNCIÓN: crear_cupones_referido (genera cupones de $5 para ambos)
CREATE OR REPLACE FUNCTION public.crear_cupones_referido(p_referrer_id UUID, p_referred_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_coupon_referred_id UUID;
  v_coupon_referrer_id UUID;
  v_codigo_referred TEXT;
  v_codigo_referrer TEXT;
  v_expira TIMESTAMPTZ;
BEGIN
  v_expira := now() + interval '30 days';
  v_codigo_referred := 'BIENVENIDO-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  v_codigo_referrer := 'REF-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

  INSERT INTO public.coupons (codigo, tipo_descuento, valor, fecha_expiracion, max_usos_totales, max_usos_por_usuario, estado, asignado_a)
  VALUES (v_codigo_referred, 'fijo', 5, v_expira, 1, 1, 'activo', p_referred_id)
  RETURNING id INTO v_coupon_referred_id;

  INSERT INTO public.user_coupons (user_id, coupon_id) VALUES (p_referred_id, v_coupon_referred_id);

  INSERT INTO public.coupons (codigo, tipo_descuento, valor, fecha_expiracion, max_usos_totales, max_usos_por_usuario, estado, asignado_a)
  VALUES (v_codigo_referrer, 'fijo', 5, v_expira, 1, 1, 'activo', p_referrer_id)
  RETURNING id INTO v_coupon_referrer_id;

  INSERT INTO public.user_coupons (user_id, coupon_id) VALUES (p_referrer_id, v_coupon_referrer_id);
END;
$$;

-- 12. TRIGGER: Crear perfil automáticamente al registrar usuario (con referidos)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_referrer_id UUID;
BEGIN
  INSERT INTO public.profiles (id, nombre, apellido, telefono, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', ''),
    COALESCE(NEW.raw_user_meta_data->>'apellido', ''),
    NEW.raw_user_meta_data->>'telefono',
    'client'
  );

  -- Detectar referido desde meta-data (enviado desde signup)
  BEGIN
    v_referrer_id := (NEW.raw_user_meta_data->>'referido_por')::UUID;
    IF v_referrer_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_referrer_id) THEN
        INSERT INTO public.referrals (referrer_id, referred_id)
        VALUES (v_referrer_id, NEW.id);
        PERFORM public.crear_cupones_referido(v_referrer_id, NEW.id);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 13. HABILITAR ROW LEVEL SECURITY
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- 14. POLÍTICAS RLS

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

-- referrals: solo admin puede ver el historial
DROP POLICY IF EXISTS "referrals_select_admin" ON public.referrals;
CREATE POLICY "referrals_select_admin" ON public.referrals
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "referrals_insert_trigger" ON public.referrals;
CREATE POLICY "referrals_insert_trigger" ON public.referrals
  FOR INSERT WITH CHECK (true);

-- coupons: usuarios ven solo activos + asignados a ellos o globales
DROP POLICY IF EXISTS "coupons_select_own" ON public.coupons;
CREATE POLICY "coupons_select_own" ON public.coupons
  FOR SELECT
  USING (
    estado = 'activo'
    AND (asignado_a IS NULL OR asignado_a = auth.uid())
    AND (fecha_expiracion IS NULL OR fecha_expiracion > now())
  );

DROP POLICY IF EXISTS "coupons_all_admin" ON public.coupons;
CREATE POLICY "coupons_all_admin" ON public.coupons
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- user_coupons: usuario ve sus propias asignaciones
DROP POLICY IF EXISTS "user_coupons_select_own" ON public.user_coupons;
CREATE POLICY "user_coupons_select_own" ON public.user_coupons
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_coupons_all_admin" ON public.user_coupons;
CREATE POLICY "user_coupons_all_admin" ON public.user_coupons
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "user_coupons_insert_system" ON public.user_coupons;
CREATE POLICY "user_coupons_insert_system" ON public.user_coupons
  FOR INSERT WITH CHECK (true);

-- app_config: lectura pública, solo admin modifica
DROP POLICY IF EXISTS "app_config_select_public" ON public.app_config;
CREATE POLICY "app_config_select_public" ON public.app_config
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "app_config_all_admin" ON public.app_config;
CREATE POLICY "app_config_all_admin" ON public.app_config
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 15. FUNCIÓN: crear primer admin (solo ejecutar 1 vez tras registrarse)
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
--
-- 2026-06-22: Sistema de Referidos y Cupones
-- Ejecutar migration_referidos_cupones.sql en el SQL Editor de Supabase para añadir:
--   - Tabla referrals
--   - Tabla coupons
--   - Tabla user_coupons
--   - Función crear_cupones_referido()
--   - handle_new_user() actualizado (detección de referidos)
--   - RLS policies para las nuevas tablas
--
-- 2026-06-22: Checkout y Tasa de Cambio
-- Ejecutar migration_checkout.sql en el SQL Editor de Supabase para añadir:
--   - Tabla app_config (tasa de cambio Bs/USD)
--   - RLS policies para app_config
--
-- 2026-06-23: Video Promocional Generator
-- Ejecutar el siguiente bloque en el SQL Editor de Supabase:
--
-- ALTER TABLE public.beats ADD COLUMN IF NOT EXISTS video_url TEXT;
--
-- CREATE TABLE IF NOT EXISTS public.video_generations (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   beat_id INTEGER NOT NULL REFERENCES public.beats(id) ON DELETE CASCADE,
--   estado TEXT NOT NULL DEFAULT 'procesando' CHECK (estado IN ('procesando', 'listo', 'fallido')),
--   video_url TEXT,
--   formato TEXT DEFAULT 'webm',
--   tamaño_bytes BIGINT,
--   tiempo_render_ms INTEGER,
--   created_at TIMESTAMPTZ DEFAULT now(),
--   updated_at TIMESTAMPTZ DEFAULT now()
-- );
--
-- ALTER TABLE public.video_generations ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS "video_generations_all_admin" ON public.video_generations;
-- CREATE POLICY "video_generations_all_admin" ON public.video_generations
--   FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
--
-- CREATE OR REPLACE FUNCTION public.update_updated_at_column()
-- RETURNS TRIGGER AS $$
-- BEGIN NEW.updated_at = now(); RETURN NEW;
-- END; $$ LANGUAGE plpgsql;
--
-- DROP TRIGGER IF EXISTS set_video_generations_updated_at ON public.video_generations;
-- CREATE TRIGGER set_video_generations_updated_at
--   BEFORE UPDATE ON public.video_generations
--   FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
