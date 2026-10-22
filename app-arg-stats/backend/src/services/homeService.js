const supabase = require('../config/supabase');

// Competiciones de la ventana de clubes, en el orden de las flechas. Cada una
// agrupa sus ediciones por prefijo de nombre (ej. "Liga Profesional" junta
// Apertura, Clausura y playoffs).
const COMPETICIONES = [
    { nombre: 'Primera División', prefijo: 'Liga Profesional' },
    { nombre: 'Primera Nacional', prefijo: 'Primera Nacional' },
    { nombre: 'Primera B Metropolitana', prefijo: 'Primera B Metropolitana' },
    { nombre: 'Federal A', prefijo: 'Federal A' },
    { nombre: 'Copa Argentina', prefijo: 'Copa Argentina' },
];

// Supabase devuelve como máximo 1000 filas por consulta
const PAGINA = 1000;

const traerTodo = async (consulta) => {
    const filas = [];
    for (let desde = 0; ; desde += PAGINA) {
        const { data, error } = await consulta().range(desde, desde + PAGINA - 1);
        if (error) throw error;
        filas.push(...data);
        if (data.length < PAGINA) return filas;
    }
};

// Últimos partidos jugados de una competición (los programados todavía no
// tienen resultado, por eso se filtra por estado terminado)
const getPartidosRecientes = async (edicionIds) => {
    const { data, error } = await supabase
        .from('v_partidos_detalles')
        .select('partido_id, edicion_id, fecha_utc, estado, goles_local, goles_visitante, local_nombre_fuente, local_nombre_corto, visitante_nombre_fuente, visitante_nombre_corto')
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
        .select('equipo_id, nombre_fuente, nombre_corto')
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

        return { nombre: c.nombre, temporada: c.temporada, clubes, partidos: recientes[i] };
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
