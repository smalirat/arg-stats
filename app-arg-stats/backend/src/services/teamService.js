const supabase = require('../config/supabase');
const { NotFoundError } = require('../middlewares/errors/AppError');


const getTeamDetails = async (id) => {
    const equipoPromise = supabase.from('v_equipo_resumen_posiciones').select('*').eq('equipo_id', id).limit(1);
    const plantelPromise = supabase.from('v_plantel_actual').select('jugador_id, nombre_completo, dorsal, posicion').eq('equipo_id', id).limit(35);
    const partidosPromise = supabase.from('v_partidos_detalles').select('*').or(`equipo_local_id.eq.${id},equipo_visitante_id.eq.${id}`).order('fecha_utc', { ascending: false }).limit(6);

    const [equipoRes, plantelRes, partidosRes] = await Promise.all([equipoPromise, plantelPromise, partidosPromise]);

    if (equipoRes.error || !equipoRes.data || equipoRes.data.length === 0) {
        throw new NotFoundError(`No se encontró el equipo con ID ${id}`);
    }

    const primerRegistro = equipoRes.data[0];
    const perfil = {
        equipo_id: primerRegistro.equipo_id,
        nombre_fuente: primerRegistro.nombre_fuente,
        nombre_corto: primerRegistro.nombre_corto,
        es_fusion: primerRegistro.es_fusion
    };

    const resumen = {
        edicion_id: primerRegistro.edicion_id,
        partidos_jugados: primerRegistro.partidos_jugados || 0,
        victorias: primerRegistro.victorias || 0,
        empates: primerRegistro.empates || 0,
        derrotas: primerRegistro.derrotas || 0,
        goles_favor: primerRegistro.goles_favor || 0,
        goles_contra: primerRegistro.goles_contra || 0,
        diferencia_gol: primerRegistro.diferencia_gol || 0,
        puntos: primerRegistro.puntos || 0
    };

    const plantelMap = new Map();
    (plantelRes.data || []).forEach(item => {
        if (!plantelMap.has(item.jugador_id)) {
            plantelMap.set(item.jugador_id, {
                jugador_id: item.jugador_id,
                nombre: item.nombre_completo,
                posicion: item.posicion || 'N/D',
                camiseta: item.dorsal || '-'
            });
        }
    });

    return {
        perfil,
        resumen,
        plantel: Array.from(plantelMap.values()),
        ultimosPartidos: partidosRes.data || []
    };
};


const getTeamSquadDetails = async (id) => {
    const { data, error } = await supabase
        .from('v_plantel_actual')
        .select('*')
        .eq('equipo_id', id);

    if (error) throw error;
    return data || [];
};


const getTeamMatchesDetails = async (id) => {
    const { data, error } = await supabase
        .from('v_partidos_detalles')
        .select('*')
        .or(`equipo_local_id.eq.${id},equipo_visitante_id.eq.${id}`)
        .order('fecha_utc', { ascending: false });

    if (error) throw error;
    return data || [];
};


const getTeamStatsDetails = async (id) => {
    const { data, error } = await supabase
        .from('v_equipo_resumen_posiciones')
        .select('*')
        .eq('equipo_id', id);

    if (error) throw error;
    return data || [];
};

module.exports = { 
    getTeamDetails,
    getTeamSquadDetails,
    getTeamMatchesDetails,
    getTeamStatsDetails
};