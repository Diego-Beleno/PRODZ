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
