-- ============================================================
-- MIGRACIÓN: Sistema de Referidos y Cupones
-- Ejecutar TODO en el SQL Editor de Supabase Dashboard
-- ============================================================

-- 1. EXTENSIONES (idempotente)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TABLA: referrals (relación referente → referido)
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(referred_id)
);

COMMENT ON TABLE public.referrals IS 'Historial de referidos: quién refirió a quién';

-- 3. TABLA: coupons (definición de cupones)
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

COMMENT ON TABLE public.coupons IS 'Catálogo de cupones de descuento';
COMMENT ON COLUMN public.coupons.asignado_a IS 'UUID del usuario al que está vinculado exclusivamente (NULL = global)';

-- 4. TABLA: user_coupons (relación N:N + control de usos)
CREATE TABLE IF NOT EXISTS public.user_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  usos_actuales INTEGER DEFAULT 0 CHECK (usos_actuales >= 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, coupon_id)
);

COMMENT ON TABLE public.user_coupons IS 'Cupones asignados a usuarios y su consumo';

-- 5. FUNCIÓN: crear_cupones_referido (genera cupones de $5 para ambos)
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

  -- Cupón para el nuevo usuario ($5 USD fijo, 1 uso, 30 días)
  INSERT INTO public.coupons (codigo, tipo_descuento, valor, fecha_expiracion, max_usos_totales, max_usos_por_usuario, estado, asignado_a)
  VALUES (v_codigo_referred, 'fijo', 5, v_expira, 1, 1, 'activo', p_referred_id)
  RETURNING id INTO v_coupon_referred_id;

  INSERT INTO public.user_coupons (user_id, coupon_id) VALUES (p_referred_id, v_coupon_referred_id);

  -- Cupón para el referente ($5 USD fijo, 1 uso, 30 días)
  INSERT INTO public.coupons (codigo, tipo_descuento, valor, fecha_expiracion, max_usos_totales, max_usos_por_usuario, estado, asignado_a)
  VALUES (v_codigo_referrer, 'fijo', 5, v_expira, 1, 1, 'activo', p_referrer_id)
  RETURNING id INTO v_coupon_referrer_id;

  INSERT INTO public.user_coupons (user_id, coupon_id) VALUES (p_referrer_id, v_coupon_referrer_id);
END;
$$;

-- 6. REEMPLAZAR: handle_new_user (agrega detección de referido)
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

-- 7. HABILITAR ROW LEVEL SECURITY
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_coupons ENABLE ROW LEVEL SECURITY;

-- 8. POLÍTICAS RLS

-- referrals: solo admin puede ver el historial
DROP POLICY IF EXISTS "referrals_select_admin" ON public.referrals;
CREATE POLICY "referrals_select_admin" ON public.referrals
  FOR SELECT USING (public.is_admin());

-- referrals: el trigger inserta automáticamente, nadie más necesita INSERT/UPDATE/DELETE
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

-- coupons: admin CRUD total
DROP POLICY IF EXISTS "coupons_all_admin" ON public.coupons;
CREATE POLICY "coupons_all_admin" ON public.coupons
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- user_coupons: usuario ve sus propias asignaciones
DROP POLICY IF EXISTS "user_coupons_select_own" ON public.user_coupons;
CREATE POLICY "user_coupons_select_own" ON public.user_coupons
  FOR SELECT USING (user_id = auth.uid());

-- user_coupons: admin CRUD total
DROP POLICY IF EXISTS "user_coupons_all_admin" ON public.user_coupons;
CREATE POLICY "user_coupons_all_admin" ON public.user_coupons
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- user_coupons: el trigger y funciones la crean automáticamente
DROP POLICY IF EXISTS "user_coupons_insert_system" ON public.user_coupons;
CREATE POLICY "user_coupons_insert_system" ON public.user_coupons
  FOR INSERT WITH CHECK (true);

-- 9. FUNCIÓN ADMIN: crear cupón manualmente (opcional, se puede insertar directo)
CREATE OR REPLACE FUNCTION public.admin_crear_cupon(
  p_codigo TEXT,
  p_tipo TEXT,
  p_valor NUMERIC,
  p_expiracion TIMESTAMPTZ DEFAULT NULL,
  p_max_total INTEGER DEFAULT NULL,
  p_max_user INTEGER DEFAULT 1,
  p_asignado UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo admin puede crear cupones';
  END IF;
  INSERT INTO public.coupons (codigo, tipo_descuento, valor, fecha_expiracion, max_usos_totales, max_usos_por_usuario, estado, asignado_a)
  VALUES (p_codigo, p_tipo, p_valor, p_expiracion, p_max_total, p_max_user, 'activo', p_asignado)
  RETURNING id INTO v_id;

  IF p_asignado IS NOT NULL THEN
    INSERT INTO public.user_coupons (user_id, coupon_id) VALUES (p_asignado, v_id);
  END IF;

  RETURN v_id;
END;
$$;

-- Solo funciones SECURITY DEFINER se pueden ejecutar desde la API
GRANT EXECUTE ON FUNCTION public.admin_crear_cupon TO authenticated;
