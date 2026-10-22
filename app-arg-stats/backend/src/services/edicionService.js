const supabase = require('../config/supabase');
const { NotFoundError } = require('../middlewares/errors/AppError');
const { competicionDe } = require('../config/competiciones');
const { traerTodo } = require('../utils/traerTodo');
const { esTerminado, esPendiente, claveCompeticion, construirTablas, agruparPosiciones, promedio } = require('../utils/futbol');
const { cargarEquipos, COLUMNAS_PARTIDO, normalizarPartido, porFecha, partidoParaVista } = require('./comun');

// Mínimo de partidos con puntaje para el ranking de puntaje del torneo
const MIN_PARTIDOS_PUNTAJE = 5;
const TOP_RANKING = 10;

const getAllEdiciones = async () => {
    const { data, error } = await supabase
        .from('v_ediciones_resumen')
        .select('*')
        .order('temporada', { ascending: false });

    if (error) throw error;
    return data || [];
};

// Orden de las rondas: las numéricas por número; el resto (playoffs, copas) por fecha
const ordenarRondas = (rondas) => rondas.sort((a, b) => {
    const na = Number(a.ronda), nb = Number(b.ronda);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a.partidos[0]?.fecha_utc).localeCompare(String(b.partidos[0]?.fecha_utc));
});

/**
 * Todo lo de la página de un torneo (una edición): tablas, partidos por fecha,
 * rankings de jugadores, equipos y las otras etapas/temporadas de la misma
 * competición para navegar.
 */
const getEdicionDetails = async (id) => {
    const edicionId = Number(id);

    const { data: edicion, error: errorEdicion } = await supabase
        .from('ediciones')
        .select('edicion_id, nombre_torneo, temporada')
        .eq('edicion_id', edicionId)
        .maybeSingle();
    if (errorEdicion) throw errorEdicion;
    if (!edicion) throw new NotFoundError(`No se encontró la edición de torneo con ID ${id}`);

    const comp = competicionDe(edicion.nombre_torneo);

    // Etapas de la misma competición en la temporada, y la misma edición en otras temporadas
    const { data: relacionadas, error: errorRelacionadas } = await supabase
        .from('ediciones')
        .select('edicion_id, nombre_torneo, temporada')
        .like('nombre_torneo', `${comp?.prefijo ?? edicion.nombre_torneo}%`);
    if (errorRelacionadas) throw errorRelacionadas;

    const hermanas = relacionadas.filter(e => e.temporada === edicion.temporada && claveCompeticion(e) === claveCompeticion(edicion));
    const temporadas = relacionadas
        .filter(e => e.nombre_torneo === edicion.nombre_torneo)
        .sort((a, b) => b.temporada.localeCompare(a.temporada));

    // Partidos y posiciones de las etapas hermanas (para tomar los grupos si
    // esta etapa todavía no tiene posiciones cargadas)
    const [partidosRaw, posicionesRes] = await Promise.all([
        traerTodo(() => supabase
            .from('partidos')
            .select(COLUMNAS_PARTIDO)
            .in('edicion_id', hermanas.map(e => e.edicion_id))
            .order('partido_id')),
        supabase
            .from('posiciones')
            .select('edicion_id, equipo_id, zona, posicion, partidos_jugados, victorias, empates, derrotas, goles_favor, goles_contra, diferencia_gol, puntos')
            .in('edicion_id', hermanas.map(e => e.edicion_id)),
    ]);
    if (posicionesRes.error) throw posicionesRes.error;

    const todos = partidosRaw.map(normalizarPartido).sort(porFecha);
    const partidos = todos.filter(p => p.edicion_id === edicionId);
    const mini = await cargarEquipos(partidos.flatMap(p => [p.equipo_local_id, p.equipo_visitante_id]));

    const tablas = construirTablas({
        ediciones: [edicion],
        todasLasEdiciones: hermanas,
        partidos,
        posicionesPorEdicion: agruparPosiciones(posicionesRes.data),
        mini,
    }).sort((a, b) => a.titulo.localeCompare(b.titulo));

    // Partidos agrupados por fecha (ronda); la fecha actual es la del próximo
    // partido, o la última si ya terminó
    const porRonda = new Map();
    for (const p of partidos) {
        const ronda = p.ronda ?? 'Sin fecha';
        if (!porRonda.has(ronda)) porRonda.set(ronda, []);
        porRonda.get(ronda).push(partidoParaVista(p, mini, edicion));
    }
    const rondas = ordenarRondas([...porRonda.entries()].map(([ronda, ps]) => ({ ronda, partidos: ps })));
    const proximo = partidos.find(p => esPendiente(p));
    const rondaActual = proximo ? rondas.findIndex(r => r.ronda === (proximo.ronda ?? 'Sin fecha')) : rondas.length - 1;

    // Rankings de jugadores del torneo
    // De a 50 partidos por consulta (para no armar URLs largas), todas en paralelo
    const idsJugados = partidos.filter(esTerminado).map(p => p.partido_id);
    const tandas = [];
    for (let i = 0; i < idsJugados.length; i += 50) tandas.push(idsJugados.slice(i, i + 50));
    const stats = (await Promise.all(tandas.map(ids => traerTodo(() => supabase
        .from('stats_jugador_partido')
        .select('partido_id, jugador_id, equipo_id, rating, goles, asistencias, xg, jugadores(nombre_completo)')
        .in('partido_id', ids)
        .order('stat_id'))))).flat();

    const porJugador = new Map();
    for (const s of stats) {
        if (!porJugador.has(s.jugador_id)) {
            porJugador.set(s.jugador_id, { jugador_id: s.jugador_id, nombre: s.jugadores?.nombre_completo ?? '?', equipos: [], goles: 0, asistencias: 0, xg: 0, puntajes: [] });
        }
        const j = porJugador.get(s.jugador_id);
        j.equipos.push(s.equipo_id);
        j.goles += s.goles || 0;
        j.asistencias += s.asistencias || 0;
        j.xg += Number(s.xg) || 0;
        const r = parseFloat(s.rating);
        if (!Number.isNaN(r)) j.puntajes.push(r);
    }
    const jugadores = [...porJugador.values()].map(j => ({
        jugador_id: j.jugador_id,
        nombre: j.nombre,
        equipo: mini(j.equipos.at(-1)),
        goles: j.goles,
        asistencias: j.asistencias,
        xg: Number(j.xg.toFixed(2)),
        puntaje: promedio(j.puntajes),
        partidosConPuntaje: j.puntajes.length,
    }));
    const top = (lista, campo) => lista.filter(j => j[campo] > 0).sort((a, b) => b[campo] - a[campo]).slice(0, TOP_RANKING)
        .map(j => ({ jugador_id: j.jugador_id, nombre: j.nombre, equipo: j.equipo, valor: j[campo] }));

    const rankings = {
        goleadores: top(jugadores, 'goles'),
        asistentes: top(jugadores, 'asistencias'),
        puntuados: top(jugadores.filter(j => j.partidosConPuntaje >= MIN_PARTIDOS_PUNTAJE), 'puntaje'),
        xg: top(jugadores, 'xg'),
    };

    const equipos = [...new Set(partidos.flatMap(p => [p.equipo_local_id, p.equipo_visitante_id]))]
        .map(mini)
        .sort((a, b) => a.nombre.localeCompare(b.nombre));

    // Primera fecha de cada etapa hermana, para ordenarlas en el selector
    const inicio = (e) => todos.find(p => p.edicion_id === e.edicion_id)?.fecha_utc ?? '';

    return {
        edicion: { ...edicion, competicion: comp?.nombre ?? edicion.nombre_torneo },
        etapas: hermanas.sort((a, b) => inicio(a).localeCompare(inicio(b))),
        temporadas,
        tablas,
        rondas,
        rondaActual: Math.max(0, rondaActual),
        rankings,
        equipos,
    };
};

module.exports = {
    getAllEdiciones,
    getEdicionDetails
};
