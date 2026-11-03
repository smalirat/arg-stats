// Historial de Primera División: campeones, tabla histórica, récords y el
// archivo de todas las temporadas. Todo sale de un mismo cálculo sobre los
// partidos de Primera desde 1931, cacheado porque cambia poco.
const supabase = require('../config/supabase');
const { BadRequestError } = require('../middlewares/errors/AppError');
const { COMPETICIONES, competicionDe } = require('../config/competiciones');
const { traerTodo, traerTodoEnParalelo } = require('../utils/traerTodo');
const { conCache } = require('../utils/cache');
const { cargarEquipos } = require('./comun');
const { CAMPEONES } = require('../data/campeones');

const MINUTOS_CACHE = 12 * 60;
const TOP_RECORDS = 10;

// --- Ediciones de Primera ---------------------------------------------------

// Nombres de los torneos de Primera antes de "Liga Profesional" (datos históricos)
const PRIMERA_HISTORICA = ['Campeonato', 'Copa de Honor', 'Metropolitano', 'Nacional', 'Torneo Nacional', 'Torneo Apertura', 'Torneo Clausura'];
const esPrimera = (nombre) =>
    PRIMERA_HISTORICA.includes(nombre) || nombre.startsWith('Liga Profesional') || nombre.startsWith('Copa de la Liga Profesional');

// Mes aproximado de inicio de cada torneo en su año, para ordenar las ediciones
// en el tiempo: los partidos históricos no tienen fecha, y en un mismo año se
// jugaban varios torneos (Metropolitano y Nacional, Clausura y Apertura...).
const MES_LIGA_PROFESIONAL = { 2014: 7, 2015: 2, 2016: 2, 2021: 7, 2022: 6, 2023: 2, 2024: 5 };
const mesDeInicio = ({ nombre_torneo: n, temporada: t }) => {
    const anio = Number(t.slice(0, 4));
    if (t.includes('/')) return 7;                          // temporada europea: arranca a mitad de año
    if (n === 'Torneo Clausura' || n === 'Copa de Honor') return 1;
    if (n === 'Torneo Apertura') return 7;
    if (n === 'Metropolitano') return anio <= 1981 ? 1 : 7;
    if (n === 'Nacional') return 7;
    if (n === 'Torneo Nacional') return 1;
    if (n === 'Campeonato') return anio === 1936 ? 7 : 1;  // la Copa Campeonato 1936 fue después de la Copa de Honor
    if (n === 'Copa de la Liga Profesional') return anio === 2023 ? 8 : anio === 2020 ? 10 : 1;
    if (n === 'Copa de la Liga Profesional Playoff') return 4;
    if (n === 'Liga Profesional') return MES_LIGA_PROFESIONAL[anio] ?? 1;
    if (n.includes('Apertura')) return n.includes('Playoff') ? 5 : 1;
    if (n.includes('Clausura')) return n.includes('Playoff') ? 11 : 7;
    return 1;
};
const ordenEdicion = (e) => Number(e.temporada.slice(0, 4)) * 100 + mesDeInicio(e);

// Eras de la tabla histórica (por formato de torneo)
const ERAS = [
    { clave: 'todas', nombre: 'Todas', descripcion: 'Todos los torneos desde 1931', es: () => true },
    { clave: '1931-1966', nombre: '1931–1966', descripcion: 'Torneos largos', es: (e) => ordenEdicion(e) < 196700 },
    { clave: '1967-1985', nombre: '1967–1985', descripcion: 'Metropolitano y Nacional', es: (e) => ordenEdicion(e) >= 196700 && ordenEdicion(e) < 198507 },
    { clave: '1985-1991', nombre: '1985/86–1990/91', descripcion: 'Temporadas de dos ruedas', es: (e) => ordenEdicion(e) >= 198507 && ordenEdicion(e) < 199107 },
    { clave: '1991-2012', nombre: '1991–2012', descripcion: 'Apertura y Clausura', es: (e) => e.nombre_torneo === 'Torneo Apertura' || e.nombre_torneo === 'Torneo Clausura' },
    { clave: '2012-hoy', nombre: '2012/13–hoy', descripcion: 'Liga Profesional y Copa de la Liga', es: (e) => e.nombre_torneo.startsWith('Liga Profesional') || e.nombre_torneo.startsWith('Copa de la Liga') },
];

// --- Campeones ----------------------------------------------------------------

// Nombre corto del torneo de un playoff: "Liga Profesional Clausura Playoff" -> "Clausura"
const torneoDePlayoff = (nombre) => nombre.startsWith('Copa de la Liga')
    ? 'Copa de la Liga'
    : nombre.replace('Liga Profesional', '').replace('Playoff', '').trim() || 'Liga Profesional';

// Ganador de una final (con penales si hubo)
const ganador = (p) => {
    let a = p.goles_local, b = p.goles_visitante;
    if (a === b && p.penales_local != null) { a = p.penales_local; b = p.penales_visitante; }
    if (a === b) return null;
    return a > b ? p.equipo_local_id : p.equipo_visitante_id;
};

// --- Rachas ---------------------------------------------------------------------

// Meses entre el inicio de dos torneos (orden = año * 100 + mes)
const mesesEntre = (a, b) => (Math.floor(b / 100) * 12 + (b % 100)) - (Math.floor(a / 100) * 12 + (a % 100));

// Si un club estuvo más de un año y medio sin jugar en Primera (descendió y volvió),
// la racha se corta: no son partidos seguidos
const MESES_MAXIMOS_ENTRE_PARTIDOS = 18;

// Las rachas más largas de partidos seguidos que cumplen `sigue` (ej. no perder).
// Vigente: llega al último partido del club y el club juega la temporada actual.
const rachas = (partidosPorEquipo, sigue, ordenActual) => {
    const todas = [];
    for (const [equipoId, lista] of partidosPorEquipo) {
        let inicio = 0;
        const cerrar = (fin) => {
            const largo = fin - inicio;
            if (largo >= 5) {
                const vigente = fin === lista.length && mesesEntre(lista[fin - 1].orden, ordenActual) <= 12;
                todas.push({ equipo_id: equipoId, largo, desde: lista[inicio], hasta: lista[fin - 1], vigente });
            }
        };
        for (let i = 0; i < lista.length; i++) {
            if (i > 0 && mesesEntre(lista[i - 1].orden, lista[i].orden) > MESES_MAXIMOS_ENTRE_PARTIDOS) {
                cerrar(i);
                inicio = i;
            }
            if (!sigue(lista[i].resultado)) {
                cerrar(i);
                inicio = i + 1;
            }
        }
        cerrar(lista.length);
    }
    return todas.sort((a, b) => b.largo - a.largo).slice(0, TOP_RECORDS);
};

// --- Cálculo completo (cacheado) -------------------------------------------------

const historial = conCache(async () => {
    const ediciones = await traerTodo(() => supabase.from('ediciones').select('edicion_id, nombre_torneo, temporada').order('edicion_id'));
    const primera = ediciones.filter(e => esPrimera(e.nombre_torneo));
    const edicionPorId = new Map(ediciones.map(e => [e.edicion_id, e]));

    const partidos = (await traerTodoEnParalelo((opciones) => supabase
        .from('partidos')
        .select('partido_id, edicion_id, fecha_utc, ronda, estado, equipo_local_id, equipo_visitante_id, goles_local, goles_visitante, penales_local, penales_visitante', opciones)
        .in('edicion_id', primera.map(e => e.edicion_id))
        .not('goles_local', 'is', null)
        .not('goles_visitante', 'is', null)
        .order('partido_id')))
        // Orden cronológico: por torneo, y dentro del torneo por fecha (o por ID en los históricos, que no tienen fecha)
        .map(p => ({ ...p, edicion: edicionPorId.get(p.edicion_id), orden: ordenEdicion(edicionPorId.get(p.edicion_id)) }))
        .sort((a, b) => a.orden - b.orden || String(a.fecha_utc ?? '').localeCompare(String(b.fecha_utc ?? '')) || a.partido_id - b.partido_id);

    // Campeones: la lista fija y, de los playoffs, el ganador de la final
    const edicionPorClave = new Map(ediciones.map(e => [`${e.nombre_torneo}|${e.temporada}`, e]));
    const campeones = CAMPEONES.map(c => {
        const edicion = c.edicion ? edicionPorClave.get(c.edicion.join('|')) ?? null : null;
        return { torneo: c.torneo, temporada: c.temporada, equipo_id: c.equipo, edicion, orden: edicion ? ordenEdicion(edicion) : Number(c.temporada.slice(0, 4)) * 100 + 1 };
    });
    for (const e of primera.filter(x => /playoff/i.test(x.nombre_torneo))) {
        const final = partidos.find(p => p.edicion_id === e.edicion_id && String(p.ronda).toLowerCase() === 'final');
        const campeon = final && ganador(final);
        if (campeon) campeones.push({ torneo: torneoDePlayoff(e.nombre_torneo), temporada: e.temporada, equipo_id: campeon, edicion: e, orden: ordenEdicion(e) });
    }
    campeones.sort((a, b) => b.orden - a.orden || b.torneo.localeCompare(a.torneo));
    // La Copa de la Liga (y la Copa Diego Maradona 2020) algunos registros la cuentan aparte de los títulos de liga
    for (const c of campeones) c.tipo = c.torneo === 'Copa de la Liga' ? 'copa' : 'liga';

    // Por equipo, sus partidos en orden y el resultado (90/120 minutos: los penales no cuentan)
    const porEquipo = new Map();
    const agregar = (equipoId, p, gf, gc) => {
        if (!porEquipo.has(equipoId)) porEquipo.set(equipoId, []);
        porEquipo.get(equipoId).push({ partido_id: p.partido_id, edicion: p.edicion, orden: p.orden, gf, gc, resultado: gf > gc ? 'G' : gf < gc ? 'P' : 'E' });
    };
    for (const p of partidos) {
        agregar(p.equipo_local_id, p, p.goles_local, p.goles_visitante);
        agregar(p.equipo_visitante_id, p, p.goles_visitante, p.goles_local);
    }

    // Tabla histórica por era
    const tablas = Object.fromEntries(ERAS.map(era => {
        const filas = new Map();
        for (const [equipoId, lista] of porEquipo) {
            const enEra = lista.filter(x => era.es(x.edicion));
            if (!enEra.length) continue;
            const f = { equipo_id: equipoId, temporadas: new Set(enEra.map(x => x.edicion.temporada)).size, pj: enEra.length, g: 0, e: 0, p: 0, gf: 0, gc: 0 };
            for (const x of enEra) {
                f.gf += x.gf; f.gc += x.gc;
                if (x.resultado === 'G') f.g++; else if (x.resultado === 'P') f.p++; else f.e++;
            }
            f.dg = f.gf - f.gc;
            f.pts = f.g * 3 + f.e;
            f.titulos = campeones.filter(c => c.equipo_id === equipoId && (!c.edicion || era.es(c.edicion))).length;
            f.primera = enEra[0].edicion.temporada;
            f.ultima = enEra.at(-1).edicion.temporada;
            filas.set(equipoId, f);
        }
        return [era.clave, [...filas.values()].sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf)];
    }));

    // Récords de partidos
    const conDiferencia = partidos.map(p => ({ p, dif: Math.abs(p.goles_local - p.goles_visitante), total: p.goles_local + p.goles_visitante }));
    const goleadas = [...conDiferencia].sort((a, b) => b.dif - a.dif || b.total - a.total).slice(0, TOP_RECORDS).map(x => x.p);
    const masGoles = [...conDiferencia].sort((a, b) => b.total - a.total || b.dif - a.dif).slice(0, TOP_RECORDS).map(x => x.p);
    const ordenActual = partidos.at(-1)?.orden ?? 0;
    const invictos = rachas(porEquipo, r => r !== 'P', ordenActual);
    const victorias = rachas(porEquipo, r => r === 'G', ordenActual);
    const sinGanar = rachas(porEquipo, r => r !== 'G', ordenActual);

    // Goles por partido de cada temporada
    const porTemporada = new Map();
    for (const p of partidos) {
        const t = p.edicion.temporada;
        if (!porTemporada.has(t)) porTemporada.set(t, { temporada: t, orden: p.orden, partidos: 0, goles: 0 });
        const f = porTemporada.get(t);
        f.partidos++;
        f.goles += p.goles_local + p.goles_visitante;
    }
    const golesPorTemporada = [...porTemporada.values()]
        .map(f => ({ ...f, promedio: Math.round((f.goles / f.partidos) * 100) / 100 }))
        .sort((a, b) => a.orden - b.orden);

    // Escudos y nombres de todo lo que se muestra
    const ids = [
        ...campeones.map(c => c.equipo_id),
        ...Object.values(tablas).flat().map(f => f.equipo_id),
        ...partidos.flatMap(p => [p.equipo_local_id, p.equipo_visitante_id]),
    ];
    const equipo = await cargarEquipos(ids);

    const vistaPartido = (p) => ({
        partido_id: p.partido_id,
        edicion: p.edicion,
        local: equipo(p.equipo_local_id),
        visitante: equipo(p.equipo_visitante_id),
        goles_local: p.goles_local,
        goles_visitante: p.goles_visitante,
    });
    const vistaRacha = (r) => ({ equipo: equipo(r.equipo_id), largo: r.largo, desde: r.desde.edicion, hasta: r.hasta.edicion, vigente: r.vigente });

    // Ranking de títulos
    const titulosPorEquipo = new Map();
    for (const c of campeones) {
        if (!titulosPorEquipo.has(c.equipo_id)) titulosPorEquipo.set(c.equipo_id, { equipo: equipo(c.equipo_id), titulos: 0, ligas: 0, copas: 0, ultimo: null });
        const t = titulosPorEquipo.get(c.equipo_id);
        t.titulos++;
        if (c.tipo === 'copa') t.copas++; else t.ligas++;
        if (!t.ultimo || c.orden > t.ultimo.orden) t.ultimo = c;
    }

    return {
        desde: partidos[0]?.edicion.temporada ?? null,
        partidos: partidos.length,
        campeones: campeones.map(({ orden, equipo_id, ...c }) => ({ ...c, equipo: equipo(equipo_id) })),
        titulos: [...titulosPorEquipo.values()]
            .map(t => ({ equipo: t.equipo, titulos: t.titulos, ligas: t.ligas, copas: t.copas, ultimo: { torneo: t.ultimo.torneo, temporada: t.ultimo.temporada, orden: t.ultimo.orden } }))
            .sort((a, b) => b.titulos - a.titulos || b.ligas - a.ligas || b.ultimo.orden - a.ultimo.orden)
            .map(({ ultimo: { orden, ...ultimo }, ...t }) => ({ ...t, ultimo })),
        eras: ERAS.map(({ es, ...era }) => era),
        tablas: Object.fromEntries(Object.entries(tablas).map(([clave, filas]) => [clave, filas.map(({ equipo_id, ...f }) => ({ equipo: equipo(equipo_id), ...f }))])),
        records: {
            goleadas: goleadas.map(vistaPartido),
            masGoles: masGoles.map(vistaPartido),
            invictos: invictos.map(vistaRacha),
            victorias: victorias.map(vistaRacha),
            sinGanar: sinGanar.map(vistaRacha),
            golesPorTemporada: golesPorTemporada.map(({ orden, ...f }) => f),
        },
        ediciones,
    };
}, MINUTOS_CACHE);

// --- Archivo de temporadas ---------------------------------------------------------

// Columna del archivo en la que va cada edición
const CATEGORIAS = ['Primera División', ...COMPETICIONES.filter(c => c.nombre !== 'Primera División').map(c => c.nombre), 'Otras'];
const categoriaDe = (nombre) => esPrimera(nombre) ? 'Primera División' : competicionDe(nombre)?.nombre ?? 'Otras';

// Nombre de la edición dentro de su columna: "Federal A Zona A" -> "Zona A",
// "Liga Profesional Apertura Playoff" -> "Apertura (playoff)"
const nombreCorto = (nombre) => {
    const prefijo = nombre.startsWith('Copa de la Liga Profesional') ? 'Copa de la Liga Profesional' : competicionDe(nombre)?.prefijo;
    let corto = nombre.replace(/^Torneo (Apertura|Clausura|Nacional)$/, '$1');
    if (prefijo && nombre !== prefijo) corto = nombre.slice(prefijo.length).trim();
    if (prefijo === 'Copa de la Liga Profesional') corto = `Copa de la Liga ${nombre === prefijo ? '' : corto}`.trim();
    return corto.replace(/\s*Playoff$/i, ' (playoff)').trim();
};

const archivo = (ediciones) => {
    const porTemporada = new Map();
    for (const e of ediciones) {
        if (!porTemporada.has(e.temporada)) porTemporada.set(e.temporada, { temporada: e.temporada, orden: Number(e.temporada.slice(0, 4)) * 10 + (e.temporada.includes('/') ? 5 : 0), categorias: {} });
        const fila = porTemporada.get(e.temporada);
        const cat = categoriaDe(e.nombre_torneo);
        (fila.categorias[cat] ??= []).push({ ...e, corto: nombreCorto(e.nombre_torneo) });
    }
    for (const fila of porTemporada.values()) {
        for (const lista of Object.values(fila.categorias)) lista.sort((a, b) => ordenEdicion(a) - ordenEdicion(b) || a.nombre_torneo.localeCompare(b.nombre_torneo));
    }
    return {
        categorias: CATEGORIAS.filter(c => [...porTemporada.values()].some(f => f.categorias[c])),
        temporadas: [...porTemporada.values()].sort((a, b) => b.orden - a.orden).map(({ orden, ...f }) => f),
    };
};

// --- Lo que piden las pestañas ---------------------------------------------------

const getCampeones = async () => {
    const h = await historial();
    return { campeones: h.campeones, titulos: h.titulos };
};

const getTabla = async (era = 'todas') => {
    const h = await historial();
    if (!h.tablas[era]) throw new BadRequestError(`Era desconocida: ${era}. Válidas: ${h.eras.map(e => e.clave).join(', ')}`);
    return { era: h.eras.find(e => e.clave === era), eras: h.eras, desde: h.desde, partidos: h.partidos, filas: h.tablas[era] };
};

const getRecords = async () => {
    const h = await historial();
    return { desde: h.desde, partidos: h.partidos, ...h.records };
};

const getTemporadas = async () => archivo((await historial()).ediciones);

module.exports = { getCampeones, getTabla, getRecords, getTemporadas };
