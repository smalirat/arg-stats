const supabase = require('../config/supabase');
const { NotFoundError } = require('../middlewares/errors/AppError');


const getPlayerDetails = async (id) => {
    const jugadorPromise = supabase
        .from('jugadores')
        .select('*')
        .eq('jugador_id', id)
        .single();

    const statsPromise = supabase
        .from('v_jugador_stats_agregadas')
        .select('*')
        .eq('jugador_id', id)
        .single();

    const transferenciasPromise = supabase
        .from('transferencias')
        .select('*, equipo_origen:equipos!transferencias_equipo_origen_id_fkey(nombre_corto), equipo_destino:equipos!transferencias_equipo_destino_id_fkey(nombre_corto)')
        .eq('jugador_id', id)
        .order('fecha', { ascending: false });

    const ultimosPartidosPromise = supabase
        .from('v_jugador_historial_partidos')
        .select('*')
        .eq('jugador_id', id)
        .order('fecha_utc', { ascending: false })
        .limit(10);

    const [jugadorRes, statsRes, transferenciasRes, ultimosPartidosRes] = await Promise.all([
        jugadorPromise,
        statsPromise,
        transferenciasPromise,
        ultimosPartidosPromise
    ]);

    if (jugadorRes.error || !jugadorRes.data) {
        throw new NotFoundError(`No se encontró el jugador con ID ${id}`);
    }

    return {
        jugador: jugadorRes.data,
        statsAgregadas: statsRes.data || {
            partidos_jugados: 0,
            minutos_totales: 0,
            goles_totales: 0,
            asistencias_totales: 0,
            rating_promedio: 0,
            xg_total: 0,
            xa_total: 0
        },
        transferencias: transferenciasRes.data || [],
        historialPartidos: ultimosPartidosRes.data || []
    };
};


const getPlayerMatchLogDetails = async (id) => {
    const { data, error } = await supabase
        .from('v_jugador_historial_partidos')
        .select('*')
        .eq('jugador_id', id)
        .order('fecha_utc', { ascending: false });

    if (error) throw error;
    return data || [];
};

module.exports = {
    getPlayerDetails,
    getPlayerMatchLogDetails
};