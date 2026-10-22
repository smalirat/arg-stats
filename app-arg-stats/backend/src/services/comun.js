// Consultas y formatos que comparten los servicios
const supabase = require('../config/supabase');
const { fechaIso } = require('../utils/traerTodo');
const { esTerminado, resultadoPara } = require('../utils/futbol');

/**
 * Trae los equipos indicados y devuelve una función id -> { equipo_id, nombre, escudo_url }.
 * Se consulta de a 200 IDs para no armar URLs demasiado largas.
 */
const cargarEquipos = async (ids) => {
    const unicos = [...new Set(ids.filter(id => id != null))];
    const porId = new Map();

    for (let i = 0; i < unicos.length; i += 200) {
        const { data, error } = await supabase
            .from('equipos')
            .select('equipo_id, nombre_fuente, nombre_corto, escudo_url')
            .in('equipo_id', unicos.slice(i, i + 200));
        if (error) throw error;
        for (const e of data) {
            porId.set(e.equipo_id, { equipo_id: e.equipo_id, nombre: e.nombre_corto || e.nombre_fuente, escudo_url: e.escudo_url });
        }
    }

    return (id) => porId.get(id) || { equipo_id: id, nombre: '?', escudo_url: null };
};

// Columnas de partidos que usan las páginas
const COLUMNAS_PARTIDO = 'partido_id, edicion_id, fecha_utc, ronda, estado, goles_local, goles_visitante, penales_local, penales_visitante, equipo_local_id, equipo_visitante_id';

const normalizarPartido = (p) => ({ ...p, fecha_utc: fechaIso(p.fecha_utc) });

const porFecha = (a, b) => String(a.fecha_utc).localeCompare(String(b.fecha_utc));

/**
 * Partido en el formato de las páginas. Con equipoId, el resultado (G/E/P) es
 * desde el punto de vista de ese equipo.
 */
const partidoParaVista = (p, mini, edicion = null, equipoId = null) => ({
    partido_id: p.partido_id,
    fecha_utc: p.fecha_utc,
    ronda: p.ronda,
    estado: p.estado,
    terminado: esTerminado(p),
    edicion_id: p.edicion_id,
    competicion: edicion?.nombre_torneo ?? null,
    local: mini(p.equipo_local_id),
    visitante: mini(p.equipo_visitante_id),
    goles_local: p.goles_local,
    goles_visitante: p.goles_visitante,
    penales_local: p.penales_local,
    penales_visitante: p.penales_visitante,
    resultado: esTerminado(p) && equipoId != null ? resultadoPara(p, equipoId) : null,
});

module.exports = { cargarEquipos, COLUMNAS_PARTIDO, normalizarPartido, porFecha, partidoParaVista };
