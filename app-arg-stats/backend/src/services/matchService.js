const supabase = require('../config/supabase');
const { NotFoundError } = require('../middlewares/errors/AppError');
const { cargarEquipos, COLUMNAS_PARTIDO, normalizarPartido, partidoParaVista } = require('./comun');

// Línea de la formación según el código de posición de FotMob (11 arquero,
// 3x defensores, 6x-8x mediocampistas, 10x-11x delanteros)
const lineaFormacion = (codigo) => Math.floor(Number(codigo) / 10);

// Estadísticas del partido guardadas en metadata (bloque "Periods" de FotMob)
const estadisticasDelPartido = (metadata) => {
    const grupos = metadata?.Periods?.All?.stats;
    if (!Array.isArray(grupos)) return [];

    return grupos
        .map(g => ({
            titulo: g.title,
            clave: g.key,
            filas: (g.stats || [])
                .filter(s => Array.isArray(s.stats) && s.stats.some(v => v != null))
                .map(s => ({ titulo: s.title, local: s.stats[0], visitante: s.stats[1] })),
        }))
        .filter(g => g.filas.length);
};

/**
 * Todo lo de la página de un partido: datos del partido, eventos,
 * alineaciones (con formación), estadísticas de equipo, tiros, momentum y
 * estadísticas por jugador. Cada bloque viene vacío si no hay datos.
 */
const getMatchDetails = async (id) => {
    const partidoId = Number(id);

    const { data: raw, error } = await supabase
        .from('partidos')
        .select(`${COLUMNAS_PARTIDO}, metadata, ediciones(nombre_torneo, temporada)`)
        .eq('partido_id', partidoId)
        .maybeSingle();
    if (error) throw error;
    if (!raw) throw new NotFoundError(`No se encontró el partido con ID ${id}`);

    const p = normalizarPartido(raw);
    const mini = await cargarEquipos([p.equipo_local_id, p.equipo_visitante_id]);
    const lado = (equipoId) => (equipoId === p.equipo_local_id ? 'local' : equipoId === p.equipo_visitante_id ? 'visitante' : null);

    const [eventosRes, alineacionesRes, statsRes, tirosRes, momentumRes] = await Promise.all([
        supabase.from('eventos').select('evento_id, minuto, tipo_evento, detalle, equipo_id, jugador_id, jugadores(nombre_completo)').eq('partido_id', partidoId).order('minuto'),
        supabase.from('alineaciones').select('jugador_id, equipo_id, es_titular, dorsal, posicion, jugadores(nombre_completo)').eq('partido_id', partidoId),
        supabase.from('stats_jugador_partido').select('jugador_id, equipo_id, minutos_jugados, rating, goles, asistencias, xg, xa, tarjeta_amarilla, tarjeta_roja, jugadores(nombre_completo)').eq('partido_id', partidoId),
        supabase.from('tiros').select('tiro_id, minuto, x, y, xg, xgot, tipo_tiro, resultado, equipo_id, jugador_id, jugadores(nombre_completo)').eq('partido_id', partidoId).order('minuto'),
        supabase.from('momentum').select('minuto, valor').eq('partido_id', partidoId).order('minuto'),
    ]);
    for (const r of [eventosRes, alineacionesRes, statsRes, tirosRes, momentumRes]) if (r.error) throw r.error;

    const statsPorJugador = new Map(statsRes.data.map(s => [s.jugador_id, s]));
    const datosJugador = (jugadorId, nombre) => {
        const s = statsPorJugador.get(jugadorId);
        const r = parseFloat(s?.rating);
        return {
            jugador_id: jugadorId,
            nombre: nombre ?? s?.jugadores?.nombre_completo ?? '?',
            puntaje: Number.isNaN(r) ? null : r,
            minutos: s?.minutos_jugados ?? null,
            goles: s?.goles ?? 0,
            asistencias: s?.asistencias ?? 0,
            xg: s?.xg != null ? Number(s.xg) : null,
            xa: s?.xa != null ? Number(s.xa) : null,
            amarilla: !!s?.tarjeta_amarilla,
            roja: !!s?.tarjeta_roja,
        };
    };

    // Alineaciones por lado: titulares en líneas (formación) y suplentes
    const alineaciones = {};
    for (const ladoNombre of ['local', 'visitante']) {
        const suyos = alineacionesRes.data.filter(a => lado(a.equipo_id) === ladoNombre);
        const titulares = suyos.filter(a => a.es_titular)
            .map(a => ({ ...datosJugador(a.jugador_id, a.jugadores?.nombre_completo), dorsal: a.dorsal, posicion: a.posicion }));
        const lineas = new Map();
        for (const t of titulares) {
            const l = lineaFormacion(t.posicion);
            if (!lineas.has(l)) lineas.set(l, []);
            lineas.get(l).push(t);
        }
        const lineasOrdenadas = [...lineas.entries()].sort((a, b) => a[0] - b[0])
            .map(([, js]) => js.sort((a, b) => Number(a.posicion) - Number(b.posicion)));

        alineaciones[ladoNombre] = {
            formacion: lineasOrdenadas.slice(1).map(l => l.length).join('-') || null,
            lineas: lineasOrdenadas,
            suplentes: suyos.filter(a => !a.es_titular)
                .map(a => ({ ...datosJugador(a.jugador_id, a.jugadores?.nombre_completo), dorsal: a.dorsal }))
                .sort((a, b) => (b.minutos ?? 0) - (a.minutos ?? 0) || (a.dorsal ?? 99) - (b.dorsal ?? 99)),
        };
    }
    const hayAlineaciones = alineacionesRes.data.length > 0;

    return {
        partido: {
            ...partidoParaVista(p, mini, raw.ediciones),
            temporada: raw.ediciones?.temporada ?? null,
        },
        eventos: eventosRes.data.map(e => ({
            minuto: e.minuto,
            tipo: e.tipo_evento,
            detalle: e.detalle,
            lado: lado(e.equipo_id),
            jugador_id: e.jugador_id,
            jugador: e.jugadores?.nombre_completo ?? null,
        })),
        alineaciones: hayAlineaciones ? alineaciones : null,
        estadisticas: estadisticasDelPartido(raw.metadata),
        tiros: tirosRes.data.map(t => ({
            minuto: t.minuto,
            x: Number(t.x),
            y: Number(t.y),
            xg: t.xg != null ? Number(t.xg) : null,
            xgot: t.xgot != null ? Number(t.xgot) : null,
            tipo: t.tipo_tiro,
            resultado: t.resultado,
            lado: lado(t.equipo_id),
            jugador_id: t.jugador_id,
            jugador: t.jugadores?.nombre_completo ?? null,
        })),
        momentum: momentumRes.data.map(m => ({ minuto: Number(m.minuto), valor: Number(m.valor) })),
        jugadores: {
            local: statsRes.data.filter(s => lado(s.equipo_id) === 'local').map(s => datosJugador(s.jugador_id)).sort((a, b) => (b.minutos ?? 0) - (a.minutos ?? 0)),
            visitante: statsRes.data.filter(s => lado(s.equipo_id) === 'visitante').map(s => datosJugador(s.jugador_id)).sort((a, b) => (b.minutos ?? 0) - (a.minutos ?? 0)),
        },
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