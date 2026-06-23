const SUPABASE_URL = "https://cecosbigfwgvoezmbapv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlY29zYmlnZndndm9lem1iYXB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0ODE1MDIsImV4cCI6MjA5NzA1NzUwMn0.S7J0u21zRE3DvDeMghMt16VKKx9sZw8fJjV1SD3mz0c";

// Inicializa el cliente global de Supabase
if (!window.supabase || !window.supabase.createClient) {
    document.documentElement.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;min-height:100vh;background:#050505;color:white;font-family:sans-serif;text-align:center;padding:40px;"><div><h2>Error de carga</h2><p style="color:#888;">La librería de Supabase no se cargó. Verifica tu conexión o <a href="javascript:location.reload()" style="color:white;">recarga</a>.</p></div></div>';
    throw new Error('window.supabase no está disponible');
}
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Funciones auxiliares para autenticación y perfiles
async function getUsuarioActual() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) return null;
        return session.user;
    } catch (err) {
        console.error("Error al obtener sesión:", err);
        return null;
    }
}

async function getPerfilUsuario(userId) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error("Error al obtener perfil:", err);
        return null;
    }
}

// ── Referidos ────────────────────────────────────────────
function detectarReferidoURL() {
    try {
        const params = new URLSearchParams(window.location.search);
        const ref = params.get('ref');
        if (ref && ref.length > 10) {
            localStorage.setItem('prodz_referido_por', ref);
        }
    } catch (e) {}
}

async function getReferidos() {
    const { data, error } = await supabase
        .from('referrals')
        .select('*, referrer:referrer_id(nombre, apellido), referred:referred_id(nombre, apellido)')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

async function getCuponesUsuario(userId) {
    const { data, error } = await supabase
        .from('user_coupons')
        .select('*, coupon:coupon_id(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    const now = new Date();
    return (data || []).filter(uc => {
        const c = uc.coupon;
        if (!c || c.estado !== 'activo') return false;
        if (c.fecha_expiracion && new Date(c.fecha_expiracion) <= now) return false;
        if (c.max_usos_totales !== null && c.max_usos_totales <= 0) return false;
        if (uc.usos_actuales >= c.max_usos_por_usuario) return false;
        return true;
    });
}

async function getAllCouponsAdmin() {
    const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

// Detectar referido en la URL al cargar cualquier página
detectarReferidoURL();
