// Estadísticas al estilo FBref para jugadores, equipos y torneos. Solo lee:
// usa lo que ya está en la base y deja en null lo que todavía no se carga.
const supabase = require('../config/supabase');
const { NotFoundError } = require('../middlewares/errors/AppError');
const { COMPETICIONES, competicionDe } = require('../config/competiciones');
const { traerTodo, fechaIso } = require('../utils/traerTodo');
const { conCachePorClave } = require('../utils/cache');
const { esTerminado, resultadoPara, claveCompeticion, lineaDe, masComun } = require('../utils/futbol');
const { agregarJugador, agregarArquero, statsDeEquipo, agregarEquipo, percentil, AL_ARCO, redondear } = require('../utils/metricas');
const { cargarEquipos, COLUMNAS_PARTIDO } = require('./comun');

// Mínimo de minutos para entrar en la comparación del informe de scouting
const MIN_MINUTOS_SCOUTING = 450;

// --- Carga de datos -------------------------------------------------------

// Consulta por lotes de partidos (para no armar URLs largas), en paralelo
const porLotes = async (ids, consulta, tamano = 50) => {
    const lotes = [];
    for (let i = 0; i < ids.length; i += tamano) lotes.push(ids.slice(i, i + tamano));
    return (await Promise.all(lotes.map(lote => traerTodo(() => consulta(lote))))).flat();
};

const COLUMNAS_STATS = 'partido_id, jugador_id, equipo_id, minutos_jugados, rating, goles, asistencias, xg, xa, tarjeta_amarilla, tarjeta_roja, jugadores(nombre_completo)';

/**
 * Stats, alineaciones y tiros de un conjunto de partidos (opcionalmente solo
 * de un equipo o de un jugador).
 */
const cargarDetalle = (partidoIds, filtro = {}) => {
    const aplicar = (q) => {
        if (filtro.equipoId) q = q.eq('equipo_id', filtro.equipoId);
        if (filtro.jugadorId) q = q.eq('jugador_id', filtro.jugadorId);
        return q;
    };
    return Promise.all([
        porLotes(partidoIds, (lote) => aplicar(supabase.from('stats_jugador_partido').select(COLUMNAS_STATS).in('partido_id', lote)).order('stat_id')),
        porLotes(partidoIds, (lote) => supabase.from('alineaciones').select('partido_id, jugador_id, equipo_id, es_titular, posicion').in('partido_id', lote).order('partido_id').order('jugador_id')),
        porLotes(partidoIds, (lote) => supabase.from('tiros').select('tiro_id, partido_id, equipo_id, jugador_id, minuto, x, y, xg, xgot, tipo_tiro, resultado').in('partido_id', lote).order('tiro_id')),
    ]).then(([stats, alineaciones, tiros]) => ({
        stats,
        alineaciones,
        tiros: tiros.map(t => ({ ...t, x: Number(t.x), y: Number(t.y), xg: t.xg != null ? Number(t.xg) : 0, xgot: t.xgot != null ? Number(t.xgot) : 0, tipo: t.tipo_tiro })),
    }));
};

/**
 * Filas por jugador y partido (lo que usa agregarJugador), con la línea más
 * habitual del jugador según las alineaciones.
 */
const filasPorJugador = ({ stats, alineaciones, tiros }) => {
    // Partidos que tienen alineaciones cargadas (por equipo): si no, "titular" es desconocido
    const conAlineacion = new Set(alineaciones.map(a => `${a.partido_id}|${a.equipo_id}`));
    const alineacion = new Map(alineaciones.map(a => [`${a.partido_id}|${a.jugador_id}`, a]));
    const tirosDe = new Map();
    for (const t of tiros) {
        const k = `${t.partido_id}|${t.jugador_id}`;
        if (!tirosDe.has(k)) tirosDe.set(k, []);
        tirosDe.get(k).push(t);
    }

    const porJugador = new Map();
    for (const s of stats) {
        const a = alineacion.get(`${s.partido_id}|${s.jugador_id}`);
        const r = parseFloat(s.rating);
        const fila = {
            partido_id: s.partido_id,
            equipo_id: s.equipo_id,
            minutos: s.minutos_jugados || 0,
            goles: s.goles || 0,
            asistencias: s.asistencias || 0,
            xg: Number(s.xg) || 0,
            xa: Number(s.xa) || 0,
            amarilla: !!s.tarjeta_amarilla,
            roja: !!s.tarjeta_roja,
            puntaje: Number.isNaN(r) ? null : r,
            titular: conAlineacion.has(`${s.partido_id}|${s.equipo_id}`) ? !!a?.es_titular : null,
            posicion: a?.posicion ?? null,
            tiros: tirosDe.get(`${s.partido_id}|${s.jugador_id}`) || [],
        };
        if (!porJugador.has(s.jugador_id)) porJugador.set(s.jugador_id, { jugador_id: s.jugador_id, nombre: s.jugadores?.nombre_completo ?? '?', filas: [] });
        porJugador.get(s.jugador_id).filas.push(fila);
    }
    for (const j of porJugador.values()) j.linea = lineaDe(masComun(j.filas.map(f => f.posicion)));
    return porJugador;
};

/**
 * Qué tiene la base para un conjunto de partidos jugados: sirve para ver el
 * estado de la carga (cuántos tienen stats, alineaciones, tiros, etc.).
 */
const cobertura = async (partidos) => {
    const ids = partidos.map(p => p.partido_id);
    const distintos = async (tabla, extra = (q) => q) => new Set((await porLotes(ids, (lote) =>
        extra(supabase.from(tabla).select('partido_id').in('partido_id', lote)).order('partido_id'))).map(f => f.partido_id)).size;

    const [stats, alineaciones, tiros, eventos, momentum] = await Promise.all([
        distintos('stats_jugador_partido', q => q.gte('minutos_jugados', 90)),
        distintos('alineaciones', q => q.eq('es_titular', true)),
        distintos('tiros'),
        distintos('eventos'),
        distintos('momentum', q => q.lte('minuto', 1)),
    ]);

    return {
        partidos: ids.length,
        estadisticasJugadores: stats,
        alineaciones,
        tiros,
        eventos,
        momentum,
        estadisticasEquipo: partidos.filter(p => Array.isArray(p.stats) && p.stats.length).length,
    };
};

// Partidos jugados de unas ediciones, con las estadísticas de equipo de la metadata
const partidosJugados = async (edicionIds) => (await porLotes(edicionIds, (lote) => supabase
    .from('partidos')
    .select(`${COLUMNAS_PARTIDO}, stats:metadata->Periods->All->stats`)
    .in('edicion_id', lote)
    .in('estado', ['FT', 'AET', 'Pen'])
    .order('partido_id'), 20))
    .map(p => ({ ...p, fecha_utc: fechaIso(p.fecha_utc) }));

// --- Scouting ------------------------------------------------------------------

// Todos los jugadores de una competición y temporada, agregados (con cache)
const jugadoresDeCompeticion = conCachePorClave(async (clave) => {
    const [temporada, prefijo] = clave.split('|');
    const { data: ediciones, error } = await supabase
        .from('ediciones').select('edicion_id, nombre_torneo').eq('temporada', temporada).like('nombre_torneo', `${prefijo}%`);
    if (error) throw error;
    const partidos = await partidosJugados(ediciones.filter(e => claveCompeticion(e) === prefijo).map(e => e.edicion_id));
    const porJugador = filasPorJugador(await cargarDetalle(partidos.map(p => p.partido_id)));
    return [...porJugador.values()].map(j => ({ jugador_id: j.jugador_id, linea: j.linea, m: agregarJugador(j.filas) }));
}, 15);

// Métricas del informe de scouting (por 90 salvo las que son porcentajes o promedios)
const METRICAS_SCOUTING = [
    'goles90', 'xg90', 'tiros90', 'tirosArco90', 'pctArco', 'golesPorTiro', 'asistencias90', 'xa90', 'xgxa90', 'puntaje',
    // Pendientes de carga en la base
    'pasesPrecisos', 'pctPases', 'chancesCreadas', 'entradas', 'intercepciones', 'recuperaciones', 'gambetas', 'duelosGanados', 'aereosGanados',
];

const scouting = async (jugadorId, temporada, competicionNombre) => {
    // Las competiciones conocidas se buscan por su prefijo; las demás, por el nombre de la edición
    const prefijo = COMPETICIONES.find(c => c.nombre === competicionNombre)?.prefijo ?? competicionNombre;
    const todos = await jugadoresDeCompeticion(`${temporada}|${prefijo}`);
    const yo = todos.find(j => j.jugador_id === jugadorId);
    if (!yo) return null;

    const pares = todos.filter(j => j.m.min >= MIN_MINUTOS_SCOUTING && (!yo.linea || j.linea === yo.linea));
    return {
        temporada,
        competicion: competicionNombre,
        linea: yo.linea,
        minutos: yo.m.min,
        suficientesMinutos: yo.m.min >= MIN_MINUTOS_SCOUTING,
        comparados: pares.length,
        minimoMinutos: MIN_MINUTOS_SCOUTING,
        metricas: METRICAS_SCOUTING.map(clave => ({
            clave,
            valor: yo.m[clave],
            percentil: yo.m[clave] == null ? null : percentil(yo.m[clave], pares.map(p => p.m[clave])),
        })),
    };
};

// --- Jugador -------------------------------------------------------------------

/**
 * Estadísticas de un jugador: tablas por temporada/competición/equipo,
 * registro de partidos, tiros e informe de scouting.
 */
const getEstadisticasJugador = async (id) => {
    const jugadorId = Number(id);
    const { data: jugador, error } = await supabase.from('jugadores').select('jugador_id, nombre_completo').eq('jugador_id', jugadorId).maybeSingle();
    if (error) throw error;
    if (!jugador) throw new NotFoundError(`No se encontró el jugador con ID ${id}`);

    const propios = await traerTodo(() => supabase
        .from('stats_jugador_partido')
        .select(`partido_id, partidos(${COLUMNAS_PARTIDO})`)
        .eq('jugador_id', jugadorId)
        .order('partido_id'));
    const partidos = propios.map(s => s.partidos).filter(Boolean).map(p => ({ ...p, fecha_utc: fechaIso(p.fecha_utc) }));
    const partidoPorId = new Map(partidos.map(p => [p.partido_id, p]));

    const edicionIds = [...new Set(partidos.map(p => p.edicion_id))];
    const { data: ediciones, error: errorEdiciones } = edicionIds.length
        ? await supabase.from('ediciones').select('edicion_id, nombre_torneo, temporada').in('edicion_id', edicionIds)
        : { data: [], error: null };
    if (errorEdiciones) throw errorEdiciones;
    const edicionPorId = new Map(ediciones.map(e => [e.edicion_id, e]));

    const detalle = await cargarDetalle(partidos.map(p => p.partido_id), { jugadorId });
    // Las alineaciones se cargaron de todo el partido (para saber si hay alineación): se quedan las del equipo
    const yo = filasPorJugador(detalle).get(jugadorId);
    const filas = (yo?.filas ?? []).map(f => ({ ...f, partido: partidoPorId.get(f.partido_id) })).filter(f => f.partido)
        .sort((a, b) => String(a.partido.fecha_utc).localeCompare(String(b.partido.fecha_utc)));

    const mini = await cargarEquipos(partidos.flatMap(p => [p.equipo_local_id, p.equipo_visitante_id]));
    const competicion = (p) => {
        const e = edicionPorId.get(p.edicion_id);
        return { temporada: e?.temporada, nombre: competicionDe(e?.nombre_torneo ?? '')?.nombre ?? e?.nombre_torneo ?? '?', edicion: e };
    };

    // Tablas por temporada, competición y equipo
    const grupos = new Map();
    for (const f of filas) {
        const c = competicion(f.partido);
        const clave = `${c.temporada}|${c.nombre}|${f.equipo_id}`;
        if (!grupos.has(clave)) grupos.set(clave, { temporada: c.temporada, competicion: c.nombre, equipo: mini(f.equipo_id), filas: [] });
        grupos.get(clave).filas.push(f);
    }
    const temporadas = [...grupos.values()]
        .map(g => ({ temporada: g.temporada, competicion: g.competicion, equipo: g.equipo, ...agregarJugador(g.filas) }))
        .sort((a, b) => String(b.temporada).localeCompare(String(a.temporada)) || a.competicion.localeCompare(b.competicion));

    // Registro de partidos (match log), del más reciente al más viejo
    const partidosLog = filas.slice().reverse().map(f => {
        const p = f.partido;
        const local = p.equipo_local_id === f.equipo_id;
        const c = competicion(p);
        const m = agregarJugador([f]);
        return {
            partido_id: p.partido_id,
            fecha_utc: p.fecha_utc,
            temporada: c.temporada,
            competicion: c.edicion?.nombre_torneo ?? c.nombre,
            edicion_id: p.edicion_id,
            ronda: p.ronda,
            sede: local ? 'L' : 'V',
            equipo: mini(f.equipo_id),
            rival: mini(local ? p.equipo_visitante_id : p.equipo_local_id),
            local: mini(p.equipo_local_id),
            visitante: mini(p.equipo_visitante_id),
            goles_local: p.goles_local,
            goles_visitante: p.goles_visitante,
            resultado: esTerminado(p) ? resultadoPara(p, f.equipo_id) : null,
            titular: f.titular,
            min: f.minutos,
            goles: f.goles,
            asistencias: f.asistencias,
            xg: redondear(f.xg),
            xa: redondear(f.xa),
            tiros: m.tiros,
            tirosArco: m.tirosArco,
            amarilla: f.amarilla,
            roja: f.roja,
            puntaje: f.puntaje,
        };
    });

    // Tiros (para el mapa), con el partido y la temporada
    const tiros = filas.flatMap(f => f.tiros.map(t => ({
        partido_id: f.partido_id,
        temporada: competicion(f.partido).temporada,
        competicion: competicion(f.partido).nombre,
        rival: mini(f.partido.equipo_local_id === f.equipo_id ? f.partido.equipo_visitante_id : f.partido.equipo_local_id),
        minuto: t.minuto,
        x: t.x,
        y: t.y,
        xg: t.xg,
        xgot: t.xgot,
        tipo: t.tipo,
        resultado: t.resultado,
    })));

    // Scouting de la temporada/competición más reciente con más minutos
    const masReciente = temporadas.filter(t => t.temporada === temporadas[0]?.temporada).sort((a, b) => b.min - a.min)[0];
    const informe = masReciente ? await scouting(jugadorId, masReciente.temporada, masReciente.competicion) : null;

    return {
        jugador: { jugador_id: jugador.jugador_id, nombre: jugador.nombre_completo },
        linea: yo?.linea ?? null,
        temporadas,
        totales: filas.length ? agregarJugador(filas) : null,
        partidos: partidosLog,
        tiros,
        scouting: informe,
    };
};

// --- Equipo --------------------------------------------------------------------

/**
 * Estadísticas del plantel de un equipo en su temporada más reciente (todas
 * las competiciones): tabla por jugador, arqueros, equipo vs rivales y cobertura.
 */
const getEstadisticasEquipo = async (id) => {
    const equipoId = Number(id);
    const { data: equipo, error } = await supabase.from('equipos').select('equipo_id, nombre_fuente, nombre_corto, escudo_url').eq('equipo_id', equipoId).maybeSingle();
    if (error) throw error;
    if (!equipo) throw new NotFoundError(`No se encontró el equipo con ID ${id}`);

    const propios = await traerTodo(() => supabase
        .from('partidos').select('edicion_id').or(`equipo_local_id.eq.${equipoId},equipo_visitante_id.eq.${equipoId}`).order('partido_id'));
    const edicionIds = [...new Set(propios.map(p => p.edicion_id))];
    const { data: ediciones, error: errorEdiciones } = edicionIds.length
        ? await supabase.from('ediciones').select('edicion_id, nombre_torneo, temporada').in('edicion_id', edicionIds)
        : { data: [], error: null };
    if (errorEdiciones) throw errorEdiciones;

    const temporada = ediciones.map(e => e.temporada).sort().at(-1) ?? null;
    const edicionesTemporada = ediciones.filter(e => e.temporada === temporada);
    const partidos = (await partidosJugados(edicionesTemporada.map(e => e.edicion_id)))
        .filter(p => p.equipo_local_id === equipoId || p.equipo_visitante_id === equipoId);
    const ids = partidos.map(p => p.partido_id);

    const detalle = await cargarDetalle(ids);
    const delEquipo = {
        stats: detalle.stats.filter(s => s.equipo_id === equipoId),
        alineaciones: detalle.alineaciones.filter(a => a.equipo_id === equipoId),
        tiros: detalle.tiros.filter(t => t.equipo_id === equipoId),
    };
    const porJugador = filasPorJugador(delEquipo);

    const jugadores = [...porJugador.values()]
        .map(j => ({ jugador_id: j.jugador_id, nombre: j.nombre, linea: j.linea, ...agregarJugador(j.filas) }))
        .sort((a, b) => b.min - a.min);

    // Total del equipo: minutos = 90 por partido, así "por 90" es "por partido"
    const totalesBase = agregarJugador([...porJugador.values()].flatMap(j => j.filas));
    const n = partidos.length;
    const porPartido = (v) => redondear(n ? v / n : null);
    const totales = {
        ...totalesBase,
        pj: n,
        titular: null,
        min: n * 90,
        n90: n,
        goles90: porPartido(totalesBase.goles),
        asistencias90: porPartido(totalesBase.asistencias),
        ga90: porPartido(totalesBase.ga),
        xg90: porPartido(totalesBase.xg),
        xa90: porPartido(totalesBase.xa),
        xgxa90: porPartido(totalesBase.xgxa),
        tiros90: porPartido(totalesBase.tiros),
        tirosArco90: porPartido(totalesBase.tirosArco),
    };

    // Arqueros: por cada partido que atajó, lo que recibió del rival
    const tirosRival = new Map();
    for (const t of detalle.tiros.filter(t => t.equipo_id !== equipoId)) {
        if (!tirosRival.has(t.partido_id)) tirosRival.set(t.partido_id, []);
        tirosRival.get(t.partido_id).push(t);
    }
    const partidoPorId = new Map(partidos.map(p => [p.partido_id, p]));
    const arqueros = [...porJugador.values()]
        .filter(j => j.linea === 'Arqueros')
        .map(j => ({
            jugador_id: j.jugador_id,
            nombre: j.nombre,
            ...agregarArquero(j.filas.map(f => {
                const p = partidoPorId.get(f.partido_id);
                const recibidos = tirosRival.get(f.partido_id) || [];
                return {
                    minutos: f.minutos,
                    golesRecibidos: p.equipo_local_id === equipoId ? p.goles_visitante : p.goles_local,
                    tirosArcoRecibidos: recibidos.filter(t => AL_ARCO.includes(t.resultado)).length,
                    xgotRecibido: recibidos.reduce((s, t) => s + (t.xgot || 0), 0),
                };
            })),
        }))
        .sort((a, b) => b.min - a.min);

    // Equipo vs rivales (estadísticas de equipo de la metadata de cada partido)
    const lado = (p) => (p.equipo_local_id === equipoId ? 0 : 1);
    const propio = partidos.map(p => ({ goles: lado(p) === 0 ? p.goles_local : p.goles_visitante, stats: statsDeEquipo(p.stats, lado(p)) }));
    const rival = partidos.map(p => ({ goles: lado(p) === 0 ? p.goles_visitante : p.goles_local, stats: statsDeEquipo(p.stats, 1 - lado(p)) }));

    return {
        equipo: { equipo_id: equipo.equipo_id, nombre: equipo.nombre_corto || equipo.nombre_fuente, escudo_url: equipo.escudo_url },
        temporada,
        competiciones: [...new Set(edicionesTemporada.map(e => competicionDe(e.nombre_torneo)?.nombre ?? e.nombre_torneo))],
        jugadores,
        totales,
        arqueros,
        equipoVsRivales: { equipo: agregarEquipo(propio), rivales: agregarEquipo(rival) },
        cobertura: await cobertura(partidos),
    };
};

// --- Torneo ----------------------------------------------------------------------

/**
 * Estadísticas de equipo de un torneo (una edición): por equipo, lo propio y
 * lo del rival (para xG en contra, etc.), y la cobertura de datos.
 */
const getEstadisticasTorneo = async (id) => {
    const edicionId = Number(id);
    const { data: edicion, error } = await supabase.from('ediciones').select('edicion_id, nombre_torneo, temporada').eq('edicion_id', edicionId).maybeSingle();
    if (error) throw error;
    if (!edicion) throw new NotFoundError(`No se encontró la edición de torneo con ID ${id}`);

    const partidos = await partidosJugados([edicionId]);
    const mini = await cargarEquipos(partidos.flatMap(p => [p.equipo_local_id, p.equipo_visitante_id]));

    const porEquipo = new Map();
    const agregar = (equipoId, propio, rival) => {
        if (!porEquipo.has(equipoId)) porEquipo.set(equipoId, { propio: [], rival: [] });
        porEquipo.get(equipoId).propio.push(propio);
        porEquipo.get(equipoId).rival.push(rival);
    };
    for (const p of partidos) {
        const local = { goles: p.goles_local, stats: statsDeEquipo(p.stats, 0) };
        const visitante = { goles: p.goles_visitante, stats: statsDeEquipo(p.stats, 1) };
        agregar(p.equipo_local_id, local, visitante);
        agregar(p.equipo_visitante_id, visitante, local);
    }

    const equipos = [...porEquipo.entries()].map(([equipoId, d]) => {
        const propio = agregarEquipo(d.propio);
        const rival = agregarEquipo(d.rival);
        return {
            equipo: mini(equipoId),
            ...propio,
            golesContra: rival.goles,
            xgContra: rival.xg,
            xgDif: propio.xg != null && rival.xg != null ? redondear(propio.xg - rival.xg) : null,
            tirosContraProm: rival.tirosProm,
            tirosArcoContraProm: rival.tirosArcoProm,
        };
    }).sort((a, b) => (b.xgDif ?? -999) - (a.xgDif ?? -999) || a.equipo.nombre.localeCompare(b.equipo.nombre));

    return {
        edicion,
        equipos,
        cobertura: await cobertura(partidos),
    };
};

module.exports = { getEstadisticasJugador, getEstadisticasEquipo, getEstadisticasTorneo };
