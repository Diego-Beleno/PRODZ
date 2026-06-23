-- ============================================================
-- MIGRACIÓN: Sistema de Checkout y Tasa de Cambio
-- Ejecutar en el SQL Editor de Supabase Dashboard
-- ============================================================

-- 1. TABLA: app_config (configuraciones globales key-value)
CREATE TABLE IF NOT EXISTS public.app_config (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT 'null',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insertar tasa de cambio por defecto (60 Bs/USD)
INSERT INTO public.app_config (key, value)
VALUES ('tasa_cambio_bs', '60')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.app_config IS 'Configuraciones globales de la app (tasa de cambio, etc.)';
COMMENT ON COLUMN public.app_config.value IS 'Valor en JSONB para soportar distintos tipos';

-- 2. RLS
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config_select_public" ON public.app_config;
CREATE POLICY "app_config_select_public" ON public.app_config
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "app_config_all_admin" ON public.app_config;
CREATE POLICY "app_config_all_admin" ON public.app_config
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. FUNCIÓN: obtener tasa de cambio
CREATE OR REPLACE FUNCTION public.get_tasa_cambio()
RETURNS NUMERIC
LANGUAGE plpgsql STABLE
SET search_path = 'public'
AS $$
DECLARE
  v_valor NUMERIC;
BEGIN
  SELECT (value->>0)::NUMERIC INTO v_valor
  FROM public.app_config
  WHERE key = 'tasa_cambio_bs';
  RETURN COALESCE(v_valor, 60);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tasa_cambio TO anon, authenticated;
