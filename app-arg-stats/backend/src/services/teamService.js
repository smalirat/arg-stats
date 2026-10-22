const supabase = require('../config/supabase');
const { NotFoundError } = require('../middlewares/errors/AppError');
const { traerTodo } = require('../utils/traerTodo');
const {
    esTerminado, esPendiente, claveCompeticion, construirTablas, soloEtapaActual, agruparPosiciones, promedio,
    LINEAS, lineaDe, masComun,
} = require('../utils/futbol');
const { cargarEquipos, COLUMNAS_PARTIDO, normalizarPartido, porFecha, partidoParaVista } = require('./comun');

// Mínimo de partidos con puntaje para entrar en "Mejor puntuado"
const MIN_PARTIDOS_PUNTAJE = 5;

/**
 * Todo lo de la página de un equipo, para su temporada más reciente: perfil,
 * últimos partidos, partido siguiente, lista de partidos, tablas (la etapa
 * actual y todas), plantel y rankings de sus jugadores.
 */
const getTeamDetails = async (id) => {
    const equipoId = Number(id);

    const { data: equipo, error: errorEquipo } = await supabase
        .from('equipos')
        .select('equipo_id, nombre_fuente, nombre_corto, es_fusion, escudo_url')
        .eq('equipo_id', equipoId)
        .maybeSingle();
    if (errorEquipo) throw errorEquipo;
    if (!equipo) throw new NotFoundError(`No se encontró el equipo con ID ${id}`);

    const vacio = {
        perfil: equipo, temporada: null, ultimos: [], siguiente: null, partidos: [],
        competiciones: [], clasificacion: [], plantel: [], rankings: { puntuados: [], goleadores: [], asistentes: [] },
    };

    // 1. Temporada más reciente del equipo y las competiciones que juega en ella
    const propios = await traerTodo(() => supabase
        .from('partidos')
        .select('edicion_id')
        .or(`equipo_local_id.eq.${equipoId},equipo_visitante_id.eq.${equipoId}`)
        .order('partido_id'));
    const edicionIdsEquipo = [...new Set(propios.map(p => p.edicion_id))];
    if (!edicionIdsEquipo.length) return vacio;

    const { data: edicionesEquipo, error: errorEdiciones } = await supabase
        .from('ediciones')
        .select('edicion_id, nombre_torneo, temporada')
        .in('edicion_id', edicionIdsEquipo);
    if (errorEdiciones) throw errorEdiciones;

    const temporada = edicionesEquipo.map(e => e.temporada).sort().at(-1);
    const clavesEquipo = new Set(edicionesEquipo.filter(e => e.temporada === temporada).map(claveCompeticion));

    // Todas las ediciones de esas competiciones en la temporada (todos los
    // grupos, aunque el equipo juegue solo en uno)
    const { data: edicionesTemporada, error: errorTemporada } = await supabase
        .from('ediciones')
        .select('edicion_id, nombre_torneo, temporada')
        .eq('temporada', temporada);
    if (errorTemporada) throw errorTemporada;
    const ediciones = edicionesTemporada.filter(e => clavesEquipo.has(claveCompeticion(e)));
    const edicionPorId = new Map(ediciones.map(e => [e.edicion_id, e]));

    // 2. Partidos, posiciones y equipos de esas ediciones
    const [partidosRaw, posicionesRes] = await Promise.all([
        traerTodo(() => supabase
            .from('partidos')
            .select(COLUMNAS_PARTIDO)
            .in('edicion_id', ediciones.map(e => e.edicion_id))
            .order('partido_id')),
        supabase
            .from('posiciones')
            .select('edicion_id, equipo_id, zona, posicion, partidos_jugados, victorias, empates, derrotas, goles_favor, goles_contra, diferencia_gol, puntos')
            .in('edicion_id', ediciones.map(e => e.edicion_id)),
    ]);
    if (posicionesRes.error) throw posicionesRes.error;

    const partidos = partidosRaw.map(normalizarPartido).sort(porFecha);
    const mini = await cargarEquipos(partidos.flatMap(p => [p.equipo_local_id, p.equipo_visitante_id]));
    const vista = (p) => partidoParaVista(p, mini, edicionPorId.get(p.edicion_id), equipoId);

    // 3. Partidos del equipo: últimos 5, siguiente y la lista completa
    const delEquipo = partidos.filter(p => p.equipo_local_id === equipoId || p.equipo_visitante_id === equipoId);
    const ultimos = delEquipo.filter(esTerminado).slice(-5).map(vista);
    const siguienteRaw = delEquipo.find(p => esPendiente(p));
    const lista = delEquipo.filter(p => esTerminado(p) || esPendiente(p)).map(vista);

    // 4. Tablas de cada competición: la etapa actual (resumen) y todas (clasificación)
    const tablas = construirTablas({ ediciones, partidos, posicionesPorEdicion: agruparPosiciones(posicionesRes.data), mini });
    const agruparPorCompeticion = (lista) => {
        const mapa = new Map();
        for (const t of lista) {
            if (!mapa.has(t.nombre_competicion)) mapa.set(t.nombre_competicion, []);
            mapa.get(t.nombre_competicion).push(t);
        }
        return [...mapa.entries()].map(([nombre, ts]) => ({ nombre, tablas: ts }));
    };
    const competiciones = agruparPorCompeticion(tablas)
        .map(c => ({ ...c, tablas: soloEtapaActual(c.tablas).sort((a, b) => a.titulo.localeCompare(b.titulo)) }));
    const clasificacion = agruparPorCompeticion(tablas)
        .map(c => ({ ...c, tablas: c.tablas.sort((a, b) => b.primeraFecha.localeCompare(a.primeraFecha) || a.titulo.localeCompare(b.titulo)) }));

    // 5. Estadísticas y alineaciones de los jugadores del equipo en la temporada
    const idsJugados = delEquipo.filter(esTerminado).map(p => p.partido_id);
    const [stats, alineaciones] = idsJugados.length ? await Promise.all([
        traerTodo(() => supabase
            .from('stats_jugador_partido')
            .select('partido_id, jugador_id, minutos_jugados, rating, goles, asistencias, tarjeta_amarilla, tarjeta_roja, jugadores(nombre_completo)')
            .eq('equipo_id', equipoId)
            .in('partido_id', idsJugados)
            .order('partido_id')),
        traerTodo(() => supabase
            .from('alineaciones')
            .select('partido_id, jugador_id, es_titular, dorsal, posicion, jugadores(nombre_completo)')
            .eq('equipo_id', equipoId)
            .in('partido_id', idsJugados)
            .order('partido_id')),
    ]) : [[], []];

    const porJugador = new Map();
    const jugador = (id, nombre) => {
        if (!porJugador.has(id)) {
            porJugador.set(id, { jugador_id: id, nombre: nombre ?? '?', partidos: 0, titular: 0, minutos: 0, goles: 0, asistencias: 0, amarillas: 0, rojas: 0, puntajes: [], posiciones: [], dorsales: [] });
        }
        return porJugador.get(id);
    };
    for (const s of stats) {
        const j = jugador(s.jugador_id, s.jugadores?.nombre_completo);
        j.partidos += 1;
        j.minutos += s.minutos_jugados || 0;
        j.goles += s.goles || 0;
        j.asistencias += s.asistencias || 0;
        j.amarillas += s.tarjeta_amarilla ? 1 : 0;
        j.rojas += s.tarjeta_roja ? 1 : 0;
        const r = parseFloat(s.rating);
        if (!Number.isNaN(r)) j.puntajes.push(r);
    }
    for (const a of alineaciones) {
        const j = jugador(a.jugador_id, a.jugadores?.nombre_completo);
        if (a.es_titular) j.titular += 1;
        j.posiciones.push(a.posicion);
        j.dorsales.push(a.dorsal);
    }

    const jugadores = [...porJugador.values()].map(j => ({
        jugador_id: j.jugador_id,
        nombre: j.nombre,
        dorsal: j.dorsales.filter(d => d != null).at(-1) ?? null,
        linea: lineaDe(masComun(j.posiciones)),
        partidos: j.partidos,
        titular: j.titular,
        minutos: j.minutos,
        goles: j.goles,
        asistencias: j.asistencias,
        amarillas: j.amarillas,
        rojas: j.rojas,
        puntaje: promedio(j.puntajes),
        partidosConPuntaje: j.puntajes.length,
    }));

    // Plantel agrupado por línea (los que no tienen posición registrada, al final)
    const plantel = [...LINEAS, null]
        .map(linea => ({
            linea: linea ?? 'Sin posición registrada',
            jugadores: jugadores.filter(j => j.linea === linea).sort((a, b) => b.minutos - a.minutos || a.nombre.localeCompare(b.nombre)),
        }))
        .filter(g => g.jugadores.length);

    const top = (campo) => jugadores.filter(j => j[campo] > 0).sort((a, b) => b[campo] - a[campo]).slice(0, 3)
        .map(j => ({ jugador_id: j.jugador_id, nombre: j.nombre, valor: j[campo] }));

    const rankings = {
        puntuados: jugadores
            .filter(j => j.partidosConPuntaje >= MIN_PARTIDOS_PUNTAJE)
            .sort((a, b) => b.puntaje - a.puntaje)
            .slice(0, 3)
            .map(j => ({ jugador_id: j.jugador_id, nombre: j.nombre, valor: j.puntaje })),
        goleadores: top('goles'),
        asistentes: top('asistencias'),
    };

    return {
        perfil: equipo,
        temporada,
        ultimos,
        siguiente: siguienteRaw ? vista(siguienteRaw) : null,
        partidos: lista,
        competiciones,
        clasificacion,
        plantel,
        rankings,
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
