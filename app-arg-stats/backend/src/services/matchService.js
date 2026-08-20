const supabase = require('../config/supabase');
const { NotFoundError } = require('../middlewares/errors/AppError');

const getMatchDetails = async (id) => {
    const partidoPromise = supabase
        .from('v_partidos_detalles')
        .select('*')
        .eq('partido_id', id)
        .single();

    const alineacionesPromise = supabase
        .from('alineaciones')
        .select('jugador_id, equipo_id, es_titular, dorsal, posicion, jugadores(nombre_completo)')
        .eq('partido_id', id);

    const eventosPromise = supabase
        .from('eventos')
        .select('evento_id, minuto, tipo_evento, detalle, equipo_id, jugadores(nombre_completo)')
        .eq('partido_id', id)
        .order('minuto', { ascending: true });

    const [partidoRes, alineacionesRes, eventosRes] = await Promise.all([
        partidoPromise,
        alineacionesPromise,
        eventosPromise
    ]);

    if (partidoRes.error || !partidoRes.data) {
        throw new NotFoundError(`No se encontró el partido con ID ${id}`);
    }

    return {
        partido: partidoRes.data,
        alineaciones: alineacionesRes.data || [],
        eventos: eventosRes.data || []
    };
};

const getMatchEventsDetails = async (id) => {
    const { data, error } = await supabase
        .from('eventos')
        .select('*, jugadores(nombre_completo)')
        .eq('partido_id', id)
        .order('minuto', { ascending: true });
    
    if (error) throw error;
    return data;
};

const getMatchShotsDetails = async (id) => {
    const { data, error } = await supabase
        .from('tiros')
        .select('*, jugadores(nombre_completo)')
        .eq('partido_id', id);
        
    if (error) throw error;
    return data;
};

const getMatchMomentumDetails = async (id) => {
    const { data, error } = await supabase
        .from('momentum')
        .select('*')
        .eq('partido_id', id)
        .order('minuto', { ascending: true });
        
    if (error) throw error;
    return data;
};

const getMatchPlayerStatsDetails = async (id) => {
    const { data, error } = await supabase
        .from('stats_jugador_partido')
        .select('*, jugadores(nombre_completo)')
        .eq('partido_id', id);
        
    if (error) throw error;
    return data;
};

module.exports = {
    getMatchDetails,
    getMatchEventsDetails,
    getMatchShotsDetails,
    getMatchMomentumDetails,
    getMatchPlayerStatsDetails
};