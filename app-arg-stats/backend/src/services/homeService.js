const supabase = require('../config/supabase');
const { COMPETICIONES } = require('../config/competiciones');
const { traerTodo } = require('../utils/traerTodo');

// Últimos partidos jugados de una competición (los programados todavía no
// tienen resultado, por eso se filtra por estado terminado)
const getPartidosRecientes = async (edicionIds) => {
    const { data, error } = await supabase
        .from('v_partidos_detalles')
        .select('partido_id, edicion_id, fecha_utc, estado, goles_local, goles_visitante, equipo_local_id, equipo_visitante_id, local_nombre_fuente, local_nombre_corto, visitante_nombre_fuente, visitante_nombre_corto')
        .in('edicion_id', edicionIds)
        .in('estado', ['FT', 'AET', 'Pen'])
        .order('fecha_utc', { ascending: false })
        .limit(15);
    if (error) throw error;
    return data;
};

// Por cada competición, en su última temporada: los clubes que la juegan y
// sus partidos más recientes
const getCompeticiones = async () => {
    const { data: ediciones, error } = await supabase
        .from('ediciones')
        .select('edicion_id, nombre_torneo, temporada')
        .or(COMPETICIONES.map(c => `nombre_torneo.like.${c.prefijo}*`).join(','));
    if (error) throw error;

    // Última temporada de cada competición y sus ediciones
    const elegidas = COMPETICIONES.map(c => {
        const propias = ediciones.filter(e => e.nombre_torneo.startsWith(c.prefijo));
        const temporada = propias.map(e => e.temporada).sort().at(-1);
        return {
            ...c,
            temporada,
            edicionIds: propias.filter(e => e.temporada === temporada).map(e => e.edicion_id),
        };
    }).filter(c => c.edicionIds.length);

    const partidos = await traerTodo(() => supabase
        .from('partidos')
        .select('edicion_id, equipo_local_id, equipo_visitante_id')
        .in('edicion_id', elegidas.flatMap(c => c.edicionIds))
        .order('partido_id'));

    const equipoIds = [...new Set(partidos.flatMap(p => [p.equipo_local_id, p.equipo_visitante_id]))];
    const { data: equipos, error: errorEquipos } = await supabase
        .from('equipos')
        .select('equipo_id, nombre_fuente, nombre_corto, escudo_url')
        .in('equipo_id', equipoIds);
    if (errorEquipos) throw errorEquipos;

    const porId = new Map(equipos.map(eq => [eq.equipo_id, eq]));

    const recientes = await Promise.all(elegidas.map(c => getPartidosRecientes(c.edicionIds)));

    return elegidas.map((c, i) => {
        const ids = new Set(partidos
            .filter(p => c.edicionIds.includes(p.edicion_id))
            .flatMap(p => [p.equipo_local_id, p.equipo_visitante_id]));

        const clubes = [...ids]
            .map(id => porId.get(id))
            .filter(Boolean)
            .sort((a, b) => (a.nombre_corto || a.nombre_fuente).localeCompare(b.nombre_corto || b.nombre_fuente));

        // La vista de partidos no trae escudos: se toman de los equipos ya cargados
        const partidosConEscudo = recientes[i].map(p => ({
            ...p,
            local_escudo_url: porId.get(p.equipo_local_id)?.escudo_url ?? null,
            visitante_escudo_url: porId.get(p.equipo_visitante_id)?.escudo_url ?? null,
        }));

        return { nombre: c.nombre, temporada: c.temporada, clubes, partidos: partidosConEscudo };
    });
};

const getHomeDashboard = async () => {
    const edicionesPromise = supabase
        .from('v_ediciones_resumen')
        .select('*')
        .order('temporada', { ascending: false })
        .limit(10);

    const [edicionesRes, competiciones] = await Promise.all([
        edicionesPromise,
        getCompeticiones()
    ]);

    return {
        ediciones: edicionesRes.data || [],
        // [{ nombre, temporada, clubes: [...], partidos: [...] }]
        competiciones
    };
};

module.exports = {
    getHomeDashboard
};
