// Índices al estilo FBref: partidos por día, jugadores A-Z, clubes y búsqueda
const supabase = require('../config/supabase');
const { BadRequestError } = require('../middlewares/errors/AppError');
const { COMPETICIONES, competicionDe } = require('../config/competiciones');
const { traerTodoEnParalelo, fechaIso } = require('../utils/traerTodo');
const { conCache } = require('../utils/cache');
const { cargarEquipos, COLUMNAS_PARTIDO, normalizarPartido, porFecha, partidoParaVista } = require('./comun');

// --- Utilidades -------------------------------------------------------------

// Argentina es UTC-3 todo el año: el día local de una fecha UTC
const diaArgentina = (iso) => new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const hoyArgentina = () => diaArgentina(new Date().toISOString());
const sumarDias = (dia, n) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// AAAA-MM-DD y además una fecha que existe (descarta 2026-13-99 o 2026-02-30)
const esFechaValida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
    && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

const normalizar = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const apellido = (nombre) => (nombre ?? '').trim().split(/\s+/).at(-1) ?? '';
const inicial = (nombre) => normalizar(apellido(nombre)).charAt(0).toUpperCase();

// Orden de las competiciones como en la home; el resto, al final
const ordenCompeticion = (nombreTorneo) => {
    const i = COMPETICIONES.findIndex(c => nombreTorneo.startsWith(c.prefijo));
    return i === -1 ? COMPETICIONES.length : i;
};

// --- Datos cacheados ----------------------------------------------------------

// Días (hora argentina) con partidos, para navegar entre fechas
const diasConPartidos = conCache(async () => {
    const filas = await traerTodoEnParalelo((opciones) => supabase
        .from('partidos')
        .select('fecha_utc', opciones)
        .not('fecha_utc', 'is', null)
        .order('partido_id'));
    const conteo = new Map();
    for (const f of filas) {
        const dia = diaArgentina(fechaIso(f.fecha_utc));
        conteo.set(dia, (conteo.get(dia) || 0) + 1);
    }
    return [...conteo.keys()].sort();
}, 10);

// Todos los jugadores, con partidos jugados y último equipo
const jugadoresIndice = conCache(async () => {
    const [jugadores, stats] = await Promise.all([
        traerTodoEnParalelo((opciones) => supabase.from('jugadores').select('jugador_id, nombre_completo', opciones).order('jugador_id')),
        traerTodoEnParalelo((opciones) => supabase.from('stats_jugador_partido').select('jugador_id, equipo_id, partido_id', opciones).order('stat_id')),
    ]);

    // Último equipo: el del partido con ID más alto (los IDs de FotMob crecen con el tiempo)
    const resumen = new Map();
    for (const s of stats) {
        const r = resumen.get(s.jugador_id) || { partidos: 0, ultimoPartido: -1, equipo_id: null };
        r.partidos += 1;
        if (s.partido_id > r.ultimoPartido) {
            r.ultimoPartido = s.partido_id;
            r.equipo_id = s.equipo_id;
        }
        resumen.set(s.jugador_id, r);
    }

    const mini = await cargarEquipos([...resumen.values()].map(r => r.equipo_id));
    return jugadores.map(j => {
        const r = resumen.get(j.jugador_id);
        return {
            jugador_id: j.jugador_id,
            nombre: j.nombre_completo,
            apellido: apellido(j.nombre_completo),
            inicial: inicial(j.nombre_completo),
            partidos: r?.partidos ?? 0,
            equipo: r?.equipo_id ? mini(r.equipo_id) : null,
        };
    });
}, 10);

// Todos los clubes, con sus temporadas, partidos y competición más reciente
const clubesIndice = conCache(async () => {
    const [partidos, edicionesRes, equiposRes] = await Promise.all([
        traerTodoEnParalelo((opciones) => supabase.from('partidos').select('edicion_id, equipo_local_id, equipo_visitante_id', opciones).order('partido_id')),
        supabase.from('ediciones').select('edicion_id, nombre_torneo, temporada'),
        supabase.from('equipos').select('equipo_id, nombre_fuente, nombre_corto, escudo_url'),
    ]);
    if (edicionesRes.error) throw edicionesRes.error;
    if (equiposRes.error) throw equiposRes.error;

    const edicionPorId = new Map(edicionesRes.data.map(e => [e.edicion_id, e]));
    const porEquipo = new Map();
    for (const p of partidos) {
        const edicion = edicionPorId.get(p.edicion_id);
        if (!edicion) continue;
        for (const id of [p.equipo_local_id, p.equipo_visitante_id]) {
            const c = porEquipo.get(id) || { partidos: 0, temporadas: new Set(), porTemporada: new Map() };
            c.partidos += 1;
            c.temporadas.add(edicion.temporada);
            if (!c.porTemporada.has(edicion.temporada)) c.porTemporada.set(edicion.temporada, new Set());
            c.porTemporada.get(edicion.temporada).add(edicion);
            porEquipo.set(id, c);
        }
    }

    const temporadaActual = edicionesRes.data.map(e => e.temporada).sort().at(-1);

    const clubes = equiposRes.data
        .filter(e => porEquipo.has(e.equipo_id))
        .map(e => {
            const c = porEquipo.get(e.equipo_id);
            const temporadas = [...c.temporadas].sort();
            const ultima = temporadas.at(-1);
            // Competición principal de la última temporada: la liga antes que la copa
            const edicionesUltima = [...c.porTemporada.get(ultima)].sort((a, b) => ordenCompeticion(a.nombre_torneo) - ordenCompeticion(b.nombre_torneo));
            const liga = edicionesUltima.find(ed => !ed.nombre_torneo.startsWith('Copa')) ?? edicionesUltima[0];
            return {
                equipo_id: e.equipo_id,
                nombre: e.nombre_corto || e.nombre_fuente,
                escudo_url: e.escudo_url,
                desde: temporadas[0],
                hasta: ultima,
                temporadas: temporadas.length,
                partidos: c.partidos,
                competicion: competicionDe(liga.nombre_torneo)?.nombre ?? liga.nombre_torneo,
                inicial: normalizar(e.nombre_corto || e.nombre_fuente).charAt(0).toUpperCase(),
            };
        })
        .sort((a, b) => normalizar(a.nombre).localeCompare(normalizar(b.nombre)));

    return { temporadaActual, clubes };
}, 30);

// --- Servicios ------------------------------------------------------------------

/**
 * Partidos de un día (hora argentina), agrupados por torneo, con los días
 * anterior y siguiente que tienen partidos.
 */
const getPartidosPorFecha = async (fecha) => {
    // Sin fecha: hoy. Con una fecha que no existe (2026-13-99): 400
    if (fecha != null && !esFechaValida(fecha)) throw new BadRequestError(`Fecha inválida: "${fecha}". Formato: AAAA-MM-DD.`);
    const dia = fecha ?? hoyArgentina();
    const manana = sumarDias(dia, 1);

    // Un día argentino abarca dos días UTC (va hasta las 03:00 del siguiente)
    const [{ data, error }, dias] = await Promise.all([
        supabase
            .from('partidos')
            .select(COLUMNAS_PARTIDO)
            .or(`fecha_utc.like.${dia}*,fecha_utc.like.${manana}*`),
        diasConPartidos(),
    ]);
    if (error) throw error;

    const partidos = data.map(normalizarPartido).filter(p => diaArgentina(p.fecha_utc) === dia).sort(porFecha);

    const edicionIds = [...new Set(partidos.map(p => p.edicion_id))];
    const { data: ediciones, error: errorEdiciones } = edicionIds.length
        ? await supabase.from('ediciones').select('edicion_id, nombre_torneo, temporada').in('edicion_id', edicionIds)
        : { data: [], error: null };
    if (errorEdiciones) throw errorEdiciones;
    const edicionPorId = new Map(ediciones.map(e => [e.edicion_id, e]));

    const mini = await cargarEquipos(partidos.flatMap(p => [p.equipo_local_id, p.equipo_visitante_id]));

    const torneos = edicionIds
        .map(id => edicionPorId.get(id))
        .sort((a, b) => ordenCompeticion(a.nombre_torneo) - ordenCompeticion(b.nombre_torneo) || a.nombre_torneo.localeCompare(b.nombre_torneo))
        .map(edicion => ({
            edicion,
            competicion: competicionDe(edicion.nombre_torneo)?.nombre ?? edicion.nombre_torneo,
            partidos: partidos.filter(p => p.edicion_id === edicion.edicion_id).map(p => partidoParaVista(p, mini, edicion)),
        }));

    return {
        fecha: dia,
        hoy: hoyArgentina(),
        anterior: [...dias].reverse().find(d => d < dia) ?? null,
        siguiente: dias.find(d => d > dia) ?? null,
        primera: dias[0] ?? null,
        ultima: dias.at(-1) ?? null,
        total: partidos.length,
        torneos,
    };
};

/**
 * Jugadores por inicial del apellido (A-Z, como FBref) o por búsqueda de nombre.
 */
const getJugadores = async ({ letra, q } = {}) => {
    const todos = await jugadoresIndice();
    const letras = [...new Set(todos.map(j => j.inicial).filter(l => /[A-Z]/.test(l)))].sort();
    const ordenar = (lista) => lista.sort((a, b) => normalizar(a.apellido).localeCompare(normalizar(b.apellido)) || normalizar(a.nombre).localeCompare(normalizar(b.nombre)));

    if (q && q.trim().length >= 2) {
        const buscado = normalizar(q.trim());
        const encontrados = todos.filter(j => normalizar(j.nombre).includes(buscado));
        return { letras, q: q.trim(), total: encontrados.length, jugadores: ordenar(encontrados).slice(0, 200) };
    }

    const l = (letra ?? '').toUpperCase();
    if (/^[A-Z]$/.test(l)) {
        return { letras, letra: l, total: todos.filter(j => j.inicial === l).length, jugadores: ordenar(todos.filter(j => j.inicial === l)) };
    }

    // Portada: los que más partidos tienen registrados
    return {
        letras,
        total: todos.length,
        destacados: [...todos].sort((a, b) => b.partidos - a.partidos).slice(0, 30),
    };
};

/**
 * Clubes: los de la temporada actual agrupados por competición, y todos A-Z
 * con sus temporadas y partidos registrados.
 */
const getClubes = async () => {
    const { temporadaActual, clubes } = await clubesIndice();

    const actuales = COMPETICIONES
        .filter(c => c.nombre !== 'Copa Argentina')
        .map(c => ({
            competicion: c.nombre,
            temporada: temporadaActual,
            clubes: clubes.filter(cl => cl.hasta === temporadaActual && cl.competicion === c.nombre),
        }))
        .filter(g => g.clubes.length);

    return {
        temporadaActual,
        actuales,
        letras: [...new Set(clubes.map(c => c.inicial).filter(l => /[A-Z0-9]/.test(l)))].sort(),
        clubes,
    };
};

/**
 * Búsqueda general del header: clubes, jugadores y torneos.
 */
const buscar = async (q) => {
    const buscado = normalizar((q ?? '').trim());
    if (buscado.length < 2) return { q: q ?? '', clubes: [], jugadores: [], torneos: [] };

    const [{ clubes }, jugadores, edicionesRes] = await Promise.all([
        clubesIndice(),
        jugadoresIndice(),
        supabase.from('ediciones').select('edicion_id, nombre_torneo, temporada').ilike('nombre_torneo', `%${q.trim()}%`),
    ]);
    if (edicionesRes.error) throw edicionesRes.error;

    // De cada torneo, sus temporadas (la más reciente primero)
    const porNombre = new Map();
    for (const e of edicionesRes.data.sort((a, b) => b.temporada.localeCompare(a.temporada))) {
        if (!porNombre.has(e.nombre_torneo)) porNombre.set(e.nombre_torneo, []);
        porNombre.get(e.nombre_torneo).push(e);
    }

    return {
        q: q.trim(),
        clubes: clubes.filter(c => normalizar(c.nombre).includes(buscado)).slice(0, 30),
        jugadores: jugadores.filter(j => normalizar(j.nombre).includes(buscado))
            .sort((a, b) => b.partidos - a.partidos).slice(0, 50),
        torneos: [...porNombre.entries()].map(([nombre, ediciones]) => ({ nombre, ediciones })).slice(0, 20),
    };
};

module.exports = { getPartidosPorFecha, getJugadores, getClubes, buscar };
