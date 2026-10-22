// Lógica de fútbol compartida por los servicios: resultados, tablas de
// posiciones (cargadas o calculadas con los partidos) y forma.
const { competicionDe } = require('../config/competiciones');

const TERMINADO = ['FT', 'AET', 'Pen'];
const esTerminado = (p) => TERMINADO.includes(p.estado);

// Programado y con fecha futura (los pendientes con fecha pasada no cuentan)
const esPendiente = (p, ahora = new Date().toISOString()) => !esTerminado(p) && !!p.fecha_utc && p.fecha_utc >= ahora;

// Clave de agrupación: la competición de la edición, o la edición misma
const claveCompeticion = (edicion) => competicionDe(edicion.nombre_torneo)?.prefijo ?? edicion.nombre_torneo;

// Las copas y los playoffs son eliminación directa: no tienen tabla
const tieneTabla = (edicion) =>
    competicionDe(edicion.nombre_torneo)?.prefijo !== 'Copa Argentina' && !/playoff/i.test(edicion.nombre_torneo);

// Resultado de un partido terminado para un equipo: G, E o P (los penales desempatan)
const resultadoPara = (p, equipoId) => {
    const propio = p.equipo_local_id === equipoId ? 'local' : 'visitante';
    const rival = propio === 'local' ? 'visitante' : 'local';
    let a = p[`goles_${propio}`], b = p[`goles_${rival}`];
    if (a === b && p.penales_local != null) {
        a = p[`penales_${propio}`];
        b = p[`penales_${rival}`];
    }
    return a > b ? 'G' : a < b ? 'P' : 'E';
};

// Tabla calculada con los partidos terminados (para etapas sin posiciones cargadas)
const calcularTabla = (partidos) => {
    const filas = new Map();
    const fila = (id) => {
        if (!filas.has(id)) filas.set(id, { equipo_id: id, partidos_jugados: 0, victorias: 0, empates: 0, derrotas: 0, goles_favor: 0, goles_contra: 0 });
        return filas.get(id);
    };

    for (const p of partidos) {
        fila(p.equipo_local_id);
        fila(p.equipo_visitante_id);
        if (!esTerminado(p)) continue;

        for (const [id, gf, gc] of [[p.equipo_local_id, p.goles_local, p.goles_visitante], [p.equipo_visitante_id, p.goles_visitante, p.goles_local]]) {
            const f = fila(id);
            f.partidos_jugados += 1;
            f.goles_favor += gf;
            f.goles_contra += gc;
            if (gf > gc) f.victorias += 1;
            else if (gf < gc) f.derrotas += 1;
            else f.empates += 1;
        }
    }

    return [...filas.values()].map(f => ({
        ...f,
        diferencia_gol: f.goles_favor - f.goles_contra,
        puntos: f.victorias * 3 + f.empates,
    }));
};

const ordenarTabla = (filas) => filas.sort((a, b) =>
    b.puntos - a.puntos || b.diferencia_gol - a.diferencia_gol || b.goles_favor - a.goles_favor);

/**
 * Tablas (una por zona) de cada edición con tabla.
 * - ediciones: las ediciones a armar
 * - todasLasEdiciones: ediciones de la temporada, para tomar grupos de otra etapa
 * - partidos: partidos de esas ediciones, ordenados por fecha
 * - posicionesPorEdicion: Map edicion_id -> filas de posiciones cargadas
 * - mini: equipo_id -> { equipo_id, nombre, escudo_url }
 * Devuelve [{ edicion_id, nombre_competicion, titulo, primeraFecha, ultimaFecha, filas }]
 */
const construirTablas = ({ ediciones, todasLasEdiciones = ediciones, partidos, posicionesPorEdicion, mini }) => {
    const tablas = [];

    for (const edicion of ediciones) {
        if (!tieneTabla(edicion)) continue;

        const comp = competicionDe(edicion.nombre_torneo);
        const partidosEdicion = partidos.filter(p => p.edicion_id === edicion.edicion_id);
        let filas = posicionesPorEdicion.get(edicion.edicion_id);

        if (!filas?.length) {
            // Sin posiciones cargadas: se calcula con los partidos y se usan los
            // grupos de otra etapa de la misma competición (en Argentina los
            // grupos se mantienen todo el año)
            const zonaDe = new Map();
            for (const otra of todasLasEdiciones) {
                if (claveCompeticion(otra) !== claveCompeticion(edicion) || otra.temporada !== edicion.temporada) continue;
                for (const po of posicionesPorEdicion.get(otra.edicion_id) || []) {
                    if (po.zona) zonaDe.set(po.equipo_id, po.zona);
                }
            }
            filas = calcularTabla(partidosEdicion).map(f => ({ ...f, zona: zonaDe.get(f.equipo_id) ?? null }));
        }

        // Forma (últimos 5) y próximo rival de cada equipo en esta etapa
        const conDetalle = filas.map(f => {
            const suyos = partidosEdicion.filter(p => p.equipo_local_id === f.equipo_id || p.equipo_visitante_id === f.equipo_id);
            const prox = suyos.find(p => esPendiente(p));
            return {
                ...f,
                equipo: mini(f.equipo_id),
                forma: suyos.filter(esTerminado).slice(-5).map(p => ({ partido_id: p.partido_id, resultado: resultadoPara(p, f.equipo_id) })),
                siguiente: prox ? mini(prox.equipo_local_id === f.equipo_id ? prox.equipo_visitante_id : prox.equipo_local_id) : null,
            };
        });

        const etapa = comp ? edicion.nombre_torneo.slice(comp.prefijo.length).trim() : '';
        const primeraFecha = partidosEdicion[0]?.fecha_utc ?? '';
        const ultimaFecha = partidosEdicion.at(-1)?.fecha_utc ?? '';

        for (const zona of [...new Set(conDetalle.map(f => f.zona))].sort()) {
            const filasZona = conDetalle.filter(f => f.zona === zona);
            // Si las posiciones vienen cargadas se respeta su orden; si no, por puntos
            const ordenadas = filasZona.every(f => f.posicion != null)
                ? filasZona.sort((a, b) => a.posicion - b.posicion)
                : ordenarTabla(filasZona);

            tablas.push({
                edicion_id: edicion.edicion_id,
                nombre_torneo: edicion.nombre_torneo,
                temporada: edicion.temporada,
                nombre_competicion: comp?.nombre ?? edicion.nombre_torneo,
                titulo: [etapa, (zona || '').replace(/^Group\b/, 'Grupo')].filter(Boolean).join(' ') || comp?.nombre || edicion.nombre_torneo,
                primeraFecha,
                ultimaFecha,
                filas: ordenadas.map((f, i) => ({ ...f, posicion: i + 1 })),
            });
        }
    }

    return tablas;
};

// Solo el torneo actual: la etapa que empezó más tarde y las que se juegan a la vez
const soloEtapaActual = (tablas) => {
    const inicioActual = tablas.map(t => t.primeraFecha).sort().at(-1) ?? '';
    return tablas.filter(t => t.ultimaFecha >= inicioActual);
};

// Agrupa filas de posiciones por edición
const agruparPosiciones = (posiciones) => {
    const mapa = new Map();
    for (const po of posiciones) {
        if (!mapa.has(po.edicion_id)) mapa.set(po.edicion_id, []);
        mapa.get(po.edicion_id).push(po);
    }
    return mapa;
};

// Línea del jugador según el código de posición de FotMob en la alineación
// (11 arquero, 3x defensores, 5x-8x mediocampistas, 10x-11x delanteros)
const LINEAS = ['Arqueros', 'Defensores', 'Mediocampistas', 'Delanteros'];
const lineaDe = (codigo) => {
    const n = parseInt(codigo, 10);
    if (!n) return null;
    if (n < 20) return 'Arqueros';
    if (n < 50) return 'Defensores';
    if (n < 100) return 'Mediocampistas';
    return 'Delanteros';
};

// Valor más repetido de una lista (ignora nulos)
const masComun = (valores) => {
    const cuenta = new Map();
    for (const v of valores) if (v != null) cuenta.set(v, (cuenta.get(v) || 0) + 1);
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

// Promedio de puntajes (rating viene como texto)
const promedio = (valores) => valores.length ? Number((valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(2)) : null;

module.exports = {
    esTerminado,
    esPendiente,
    claveCompeticion,
    tieneTabla,
    resultadoPara,
    construirTablas,
    soloEtapaActual,
    agruparPosiciones,
    promedio,
    LINEAS,
    lineaDe,
    masComun,
};
