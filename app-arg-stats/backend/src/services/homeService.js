const supabase = require('../config/supabase');

const getHomeDashboard = async () => {
    const edicionesPromise = supabase
        .from('v_ediciones_resumen')
        .select('*')
        .order('temporada', { ascending: false })
        .limit(10);

    const partidosPromise = supabase
        .from('v_partidos_detalles')
        .select('*')
        .order('fecha_utc', { ascending: false })
        .limit(15);

    const equiposPromise = supabase
        .from('equipos')
        .select('equipo_id, nombre_fuente, nombre_corto')
        .limit(28);

    const [edicionesRes, partidosRes, equiposRes] = await Promise.all([
        edicionesPromise,
        partidosPromise,
        equiposPromise
    ]);

    return {
        ediciones: edicionesRes.data || [],
        ultimosPartidos: partidosRes.data || [],
        equiposDestacados: equiposRes.data || []
    };
};

module.exports = {
    getHomeDashboard
};