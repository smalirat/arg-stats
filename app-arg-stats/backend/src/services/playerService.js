const supabase = require('../config/supabase');
const { NotFoundError } = require('../middlewares/errors/AppError');
const { competicionDe } = require('../config/competiciones');
const { traerTodo, fechaIso } = require('../utils/traerTodo');
const { esTerminado, resultadoPara, promedio } = require('../utils/futbol');
const { cargarEquipos, COLUMNAS_PARTIDO } = require('./comun');

const POSICIONES = { Arqueros: 'Arquero', Defensores: 'Defensor', Mediocampistas: 'Mediocampista', Delanteros: 'Delantero' };
const posicionDe = (codigo) => {
    const n = parseInt(codigo, 10);
    if (!n) return null;
    if (n < 20) return POSICIONES.Arqueros;
    if (n < 50) return POSICIONES.Defensores;
    if (n < 100) return POSICIONES.Mediocampistas;
    return POSICIONES.Delanteros;
};

/**
 * Todo lo de la página de un jugador: equipo actual, posición, estadísticas
 * por temporada y competición, últimos partidos y transferencias.
 */
const getPlayerDetails = async (id) => {
    const jugadorId = Number(id);

    const { data: jugador, error } = await supabase
        .from('jugadores')
        .select('jugador_id, nombre_completo')
        .eq('jugador_id', jugadorId)
        .maybeSingle();
    if (error) throw error;
    if (!jugador) throw new NotFoundError(`No se encontró el jugador con ID ${id}`);

    const [stats, alineaciones, transferenciasRes] = await Promise.all([
        traerTodo(() => supabase
            .from('stats_jugador_partido')
            .select(`partido_id, equipo_id, minutos_jugados, rating, goles, asistencias, xg, xa, tarjeta_amarilla, tarjeta_roja, partidos(${COLUMNAS_PARTIDO})`)
            .eq('jugador_id', jugadorId)
            .order('partido_id')),
        traerTodo(() => supabase
            .from('alineaciones')
            .select('partido_id, dorsal, posicion, es_titular')
            .eq('jugador_id', jugadorId)
            .order('partido_id')),
        supabase
            .from('transferencias')
            .select('fecha, equipo_origen_id, equipo_destino_id, tipo_transferencia')
            .eq('jugador_id', jugadorId),
    ]);
    if (transferenciasRes.error) throw transferenciasRes.error;

    const partidos = stats
        .filter(s => s.partidos)
        .map(s => ({ ...s, partido: { ...s.partidos, fecha_utc: fechaIso(s.partidos.fecha_utc) } }))
        .sort((a, b) => String(a.partido.fecha_utc).localeCompare(String(b.partido.fecha_utc)));

    const edicionIds = [...new Set(partidos.map(s => s.partido.edicion_id))];
    const { data: ediciones, error: errorEdiciones } = edicionIds.length
        ? await supabase.from('ediciones').select('edicion_id, nombre_torneo, temporada').in('edicion_id', edicionIds)
        : { data: [], error: null };
    if (errorEdiciones) throw errorEdiciones;
    const edicionPorId = new Map(ediciones.map(e => [e.edicion_id, e]));

    const transferencias = transferenciasRes.data || [];
    const mini = await cargarEquipos([
        ...partidos.flatMap(s => [s.equipo_id, s.partido.equipo_local_id, s.partido.equipo_visitante_id]),
        ...transferencias.flatMap(t => [t.equipo_origen_id, t.equipo_destino_id]),
    ]);

    // Estadísticas por temporada, competición y equipo
    const grupos = new Map();
    for (const s of partidos) {
        const edicion = edicionPorId.get(s.partido.edicion_id);
        const competicion = competicionDe(edicion?.nombre_torneo ?? '')?.nombre ?? edicion?.nombre_torneo ?? '?';
        const clave = `${edicion?.temporada}|${competicion}|${s.equipo_id}`;
        if (!grupos.has(clave)) {
            grupos.set(clave, { temporada: edicion?.temporada, competicion, equipo: mini(s.equipo_id), partidos: 0, minutos: 0, goles: 0, asistencias: 0, xg: 0, xa: 0, amarillas: 0, rojas: 0, puntajes: [] });
        }
        const g = grupos.get(clave);
        g.partidos += 1;
        g.minutos += s.minutos_jugados || 0;
        g.goles += s.goles || 0;
        g.asistencias += s.asistencias || 0;
        g.xg += Number(s.xg) || 0;
        g.xa += Number(s.xa) || 0;
        g.amarillas += s.tarjeta_amarilla ? 1 : 0;
        g.rojas += s.tarjeta_roja ? 1 : 0;
        const r = parseFloat(s.rating);
        if (!Number.isNaN(r)) g.puntajes.push(r);
    }
    const temporadas = [...grupos.values()]
        .map(({ puntajes, ...g }) => ({ ...g, xg: Number(g.xg.toFixed(2)), xa: Number(g.xa.toFixed(2)), puntaje: promedio(puntajes) }))
        .sort((a, b) => String(b.temporada).localeCompare(String(a.temporada)) || a.competicion.localeCompare(b.competicion));

    // Últimos partidos (más recientes primero)
    const ultimos = partidos.filter(s => esTerminado(s.partido)).slice(-10).reverse().map(s => {
        const p = s.partido;
        const r = parseFloat(s.rating);
        return {
            partido_id: p.partido_id,
            fecha_utc: p.fecha_utc,
            competicion: edicionPorId.get(p.edicion_id)?.nombre_torneo ?? null,
            edicion_id: p.edicion_id,
            equipo: mini(s.equipo_id),
            local: mini(p.equipo_local_id),
            visitante: mini(p.equipo_visitante_id),
            goles_local: p.goles_local,
            goles_visitante: p.goles_visitante,
            resultado: resultadoPara(p, s.equipo_id),
            minutos: s.minutos_jugados,
            goles: s.goles || 0,
            asistencias: s.asistencias || 0,
            amarilla: !!s.tarjeta_amarilla,
            roja: !!s.tarjeta_roja,
            puntaje: Number.isNaN(r) ? null : r,
        };
    });

    // Posición y dorsal más habituales
    const cuenta = new Map();
    for (const a of alineaciones) {
        const pos = posicionDe(a.posicion);
        if (pos) cuenta.set(pos, (cuenta.get(pos) || 0) + 1);
    }
    const posicion = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const dorsal = alineaciones.map(a => a.dorsal).filter(d => d != null).at(-1) ?? null;

    const totalPuntajes = partidos.map(s => parseFloat(s.rating)).filter(r => !Number.isNaN(r));

    return {
        jugador: { jugador_id: jugador.jugador_id, nombre: jugador.nombre_completo },
        equipoActual: partidos.length ? mini(partidos.at(-1).equipo_id) : null,
        posicion,
        dorsal,
        totales: {
            partidos: partidos.length,
            minutos: partidos.reduce((t, s) => t + (s.minutos_jugados || 0), 0),
            goles: partidos.reduce((t, s) => t + (s.goles || 0), 0),
            asistencias: partidos.reduce((t, s) => t + (s.asistencias || 0), 0),
            puntaje: promedio(totalPuntajes),
        },
        temporadas,
        ultimos,
        transferencias: transferencias
            .map(t => ({ fecha: t.fecha, tipo: t.tipo_transferencia, origen: t.equipo_origen_id ? mini(t.equipo_origen_id) : null, destino: t.equipo_destino_id ? mini(t.equipo_destino_id) : null }))
            .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))),
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
