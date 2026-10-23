// Métricas al estilo FBref, calculadas en memoria a partir de filas por
// jugador y partido. Las que dependen del detalle de jugadores (pases,
// defensa, posesión, duelos) se calculan solo con los partidos que lo tienen
// (en el ascenso FotMob no lo publica): si ninguno lo tiene, quedan en null.

// Arco al que ataca cada tiro en las coordenadas de FotMob (cancha de 105 x 68)
const ARCO = { x: 105, y: 34 };
const AL_ARCO = ['Goal', 'AttemptSaved'];

const suma = (lista, campo) => lista.reduce((t, x) => t + (Number(x[campo]) || 0), 0);
const div = (a, b) => (b ? a / b : null);
const redondear = (v, dec = 2) => (v == null || Number.isNaN(v) ? null : Number(v.toFixed(dec)));

// Columnas de stats_jugador_partido con el detalle de cada jugador (métrica -> columna)
const DETALLE = {
    pasesPrecisos: 'pases_precisos',
    pasesTotales: 'pases_intentados',
    pasesUltimoTercio: 'pases_ultimo_tercio',
    pelotazosPrecisos: 'pases_largos_precisos',
    pelotazosTotales: 'pases_largos_intentados',
    centrosPrecisos: 'centros_precisos',
    centrosTotales: 'centros_intentados',
    chancesCreadas: 'ocasiones_creadas',
    grandesChancesCreadas: 'grandes_ocasiones_creadas',
    grandesChancesFalladas: 'grandes_ocasiones_falladas',
    toques: 'toques',
    toquesArea: 'toques_area_rival',
    gambetas: 'regates_exitosos',
    gambetasIntentos: 'regates_intentados',
    perdidas: 'perdidas',
    offsides: 'offsides',
    entradas: 'entradas',
    intercepciones: 'intercepciones',
    despejes: 'despejes',
    bloqueos: 'bloqueos',
    recuperaciones: 'recuperaciones',
    regateado: 'regateado',
    duelosGanados: 'duelos_ganados',
    duelosPerdidos: 'duelos_perdidos',
    aereosGanados: 'duelos_aereos_ganados',
    aereosTotales: 'duelos_aereos_intentados',
    faltasCometidas: 'faltas_cometidas',
    faltasRecibidas: 'faltas_recibidas',
    penalesGanados: 'penales_ganados',
    penalesCometidos: 'penales_cometidos',
    erroresGol: 'errores_gol',
};
// Las que también se dan cada 90 minutos (para el scouting y las tablas)
const DETALLE_POR_90 = ['pasesPrecisos', 'pasesUltimoTercio', 'chancesCreadas', 'toquesArea', 'gambetas', 'entradas',
    'intercepciones', 'recuperaciones', 'despejes', 'duelosGanados', 'aereosGanados', 'faltasRecibidas', 'perdidas'];

/**
 * Agrega las filas de un jugador (una por partido):
 * { partido_id, minutos, goles, asistencias, xg, xa, amarilla, roja, puntaje, titular, tiros: [...], detalle }
 * titular es null si ese partido no tiene alineaciones cargadas; amarilla/roja
 * son null si no tiene eventos; detalle es null si la fuente no publica el
 * detalle de jugadores (si no, la fila de stats_jugador_partido).
 */
const agregarJugador = (filas) => {
    const min = suma(filas, 'minutos');
    const n90 = min / 90;
    const goles = suma(filas, 'goles');
    const asistencias = suma(filas, 'asistencias');
    const xg = suma(filas, 'xg');
    const xa = suma(filas, 'xa');
    const conAlineacion = filas.filter(f => f.titular != null);
    const puntajes = filas.map(f => f.puntaje).filter(p => p != null);

    const tiros = filas.flatMap(f => f.tiros || []);
    const alArco = tiros.filter(t => AL_ARCO.includes(t.resultado));
    const golesDeTiro = tiros.filter(t => t.resultado === 'Goal').length;
    const xgTiros = suma(tiros, 'xg');
    const distancias = tiros.map(t => Math.hypot(ARCO.x - t.x, ARCO.y - t.y));

    const por90 = (v) => redondear(div(v, n90));

    // Tarjetas: solo de los partidos con eventos cargados
    const conTarjetas = filas.filter(f => f.amarilla != null);
    // Detalle: sumado en los partidos que lo tienen, y "por 90" con los minutos de esos partidos
    const conDetalle = filas.filter(f => f.detalle);

    // Penales: los tiros con situación "Penalty". Se sabe si los tiros traen la
    // situación, o si el jugador tiene detalle y no pateó; si no, null.
    const conSituacion = tiros.filter(t => t.situacion != null);
    const penales = conSituacion.filter(t => t.situacion === 'Penalty');
    const pk = conSituacion.length || (conDetalle.length && !tiros.length) ? penales.filter(t => t.resultado === 'Goal').length : null;
    const xgPenales = suma(penales, 'xg');
    const n90Detalle = suma(conDetalle, 'minutos') / 90;
    const detalle = (columna) => (conDetalle.length ? conDetalle.reduce((t, f) => t + (Number(f.detalle[columna]) || 0), 0) : null);
    const det = Object.fromEntries(Object.entries(DETALLE).map(([metrica, columna]) => [metrica, detalle(columna)]));
    const accionesDefensivas = conDetalle.length
        ? conDetalle.reduce((t, f) => t + (Number(f.detalle.fotmob?.defensive_actions) || 0), 0)
        : null;
    const pct = (a, b) => (a == null ? null : redondear(div(a * 100, b), 1));

    const m = {
        // Las filas con 0 minutos son suplentes que no entraron: no cuentan como partido jugado
        pj: filas.filter(f => f.minutos > 0).length,
        titular: conAlineacion.length ? conAlineacion.filter(f => f.titular).length : null,
        min,
        n90: redondear(n90, 1),
        goles,
        asistencias,
        ga: goles + asistencias,
        amarillas: conTarjetas.length ? conTarjetas.filter(f => f.amarilla).length : null,
        rojas: conTarjetas.length ? conTarjetas.filter(f => f.roja).length : null,
        pk,
        pkIntentos: pk == null ? null : penales.length,
        golesSinPenal: pk == null ? null : goles - pk,
        npxg: pk == null ? null : redondear(xg - xgPenales),
        npxgxa: pk == null ? null : redondear(xg - xgPenales + xa),
        npxg90: pk == null ? null : por90(xg - xgPenales),
        xg: redondear(xg),
        xa: redondear(xa),
        xgxa: redondear(xg + xa),
        goles90: por90(goles),
        asistencias90: por90(asistencias),
        ga90: por90(goles + asistencias),
        xg90: por90(xg),
        xa90: por90(xa),
        xgxa90: por90(xg + xa),
        tiros: tiros.length,
        tirosArco: alArco.length,
        pctArco: redondear(div(alArco.length * 100, tiros.length), 1),
        tiros90: por90(tiros.length),
        tirosArco90: por90(alArco.length),
        golesPorTiro: redondear(div(golesDeTiro, tiros.length)),
        golesPorTiroArco: redondear(div(golesDeTiro, alArco.length)),
        distancia: redondear(div(distancias.reduce((a, b) => a + b, 0), distancias.length), 1),
        xgTiros: redondear(xgTiros),
        xgPorTiro: redondear(div(xgTiros, tiros.length)),
        gMenosXg: redondear(goles - xg),
        xgot: redondear(suma(tiros, 'xgot')),
        cabezazos: tiros.filter(t => t.tipo === 'Header').length,
        puntaje: redondear(div(puntajes.reduce((a, b) => a + b, 0), puntajes.length)),
        partidosConPuntaje: puntajes.length,
        // Detalle de jugadores
        partidosConDetalle: conDetalle.length,
        ...det,
        accionesDefensivas,
        pctPases: pct(det.pasesPrecisos, det.pasesTotales),
        pctPelotazos: pct(det.pelotazosPrecisos, det.pelotazosTotales),
        pctCentros: pct(det.centrosPrecisos, det.centrosTotales),
        pctGambetas: pct(det.gambetas, det.gambetasIntentos),
        pctAereos: pct(det.aereosGanados, det.aereosTotales),
        pctDuelos: pct(det.duelosGanados, det.duelosGanados == null ? null : det.duelosGanados + det.duelosPerdidos),
    };
    for (const metrica of DETALLE_POR_90) m[`${metrica}90`] = m[metrica] == null ? null : redondear(div(m[metrica], n90Detalle));
    return m;
};

/**
 * Arqueros: con los partidos que atajó. Por cada partido:
 * { minutos, golesRecibidos, tirosArcoRecibidos, xgotRecibido, atajadas, penalesAtajados }
 * Si el partido tiene el detalle del arquero, goles, atajadas y xGOT recibido
 * son los suyos; si no, los del rival en todo el partido (aproximado si no
 * jugó los 90) y atajadas = tiros al arco - goles. penalesAtajados es null
 * sin detalle.
 */
const agregarArquero = (todos) => {
    // Solo los partidos en los que entró (los de 0 minutos estuvo en el banco)
    const partidos = todos.filter(p => p.minutos > 0);
    const min = suma(partidos, 'minutos');
    const n90 = min / 90;
    const ga = suma(partidos, 'golesRecibidos');
    const tirosArco = suma(partidos, 'tirosArcoRecibidos');
    const atajadas = partidos.reduce((t, p) => t + (p.atajadas ?? Math.max(0, p.tirosArcoRecibidos - p.golesRecibidos)), 0);
    const conDetalle = partidos.filter(p => p.penalesAtajados != null);
    const completos = partidos.filter(p => p.minutos >= 90);
    return {
        pj: partidos.length,
        min,
        n90: redondear(n90, 1),
        ga,
        ga90: redondear(div(ga, n90)),
        tirosArcoRecibidos: tirosArco,
        atajadas,
        pctAtajadas: redondear(div(atajadas * 100, tirosArco), 1),
        vallasInvictas: completos.filter(p => p.golesRecibidos === 0).length,
        pctVallas: redondear(div(completos.filter(p => p.golesRecibidos === 0).length * 100, completos.length), 1),
        xgotRecibido: redondear(suma(partidos, 'xgotRecibido')),
        golesEvitados: redondear(suma(partidos, 'xgotRecibido') - ga),
        penalesAtajados: conDetalle.length ? suma(conDetalle, 'penalesAtajados') : null,
    };
};

// --- Estadísticas de equipo (bloque "Top stats" de FotMob en partidos.metadata) ---

// "354 (84%)" -> { valor: 354, pct: 84 }; "1.50" -> { valor: 1.5 }
const leerValor = (v) => {
    if (v == null) return null;
    const s = String(v);
    const num = parseFloat(s);
    const pct = s.match(/\((\d+)%\)/);
    return Number.isNaN(num) ? null : { valor: num, pct: pct ? Number(pct[1]) : null };
};

const STATS_EQUIPO = {
    posesion: 'Ball possession',
    xg: 'Expected goals (xG)',
    tiros: 'Total shots',
    tirosArco: 'Shots on target',
    chancesClaras: 'Big chances',
    chancesFalladas: 'Big chances missed',
    pasesPrecisos: 'Accurate passes',
    corners: 'Corners',
    faltas: 'Fouls committed',
    amarillas: 'Yellow cards',
    toquesArea: 'Touches in opposition box',
};

// De la metadata de un partido, los valores de un lado (0 = local, 1 = visitante)
const statsDeEquipo = (grupos, lado) => {
    const filas = (grupos || []).flatMap(g => g.stats || []);
    const buscar = (titulo) => filas.find(s => s.title === titulo && Array.isArray(s.stats) && s.stats.some(v => v != null));
    const r = {};
    for (const [clave, titulo] of Object.entries(STATS_EQUIPO)) {
        const s = buscar(titulo);
        r[clave] = s ? leerValor(s.stats[lado]) : null;
    }
    return r;
};

/**
 * Suma de un equipo en varios partidos: [{ goles, stats (de statsDeEquipo) }].
 * Devuelve totales y promedios por partido (solo de partidos con datos).
 */
const agregarEquipo = (partidos) => {
    const conStats = partidos.filter(p => p.stats && Object.values(p.stats).some(v => v != null));
    const total = (clave) => conStats.reduce((t, p) => t + (p.stats[clave]?.valor ?? 0), 0);
    const prom = (clave) => redondear(div(total(clave), conStats.length), 1);
    const pctPases = conStats.map(p => p.stats.pasesPrecisos?.pct).filter(v => v != null);

    return {
        pj: partidos.length,
        conDatos: conStats.length,
        goles: suma(partidos, 'goles'),
        golesProm: redondear(div(suma(partidos, 'goles'), partidos.length)),
        posesion: prom('posesion'),
        xg: conStats.length ? redondear(total('xg')) : null,
        xgProm: conStats.length ? redondear(div(total('xg'), conStats.length)) : null,
        tiros: conStats.length ? total('tiros') : null,
        tirosProm: conStats.length ? prom('tiros') : null,
        tirosArco: conStats.length ? total('tirosArco') : null,
        tirosArcoProm: conStats.length ? prom('tirosArco') : null,
        chancesClaras: conStats.length ? total('chancesClaras') : null,
        pasesPrecisosProm: conStats.length ? prom('pasesPrecisos') : null,
        pctPases: redondear(div(pctPases.reduce((a, b) => a + b, 0), pctPases.length), 1),
        cornersProm: conStats.length ? prom('corners') : null,
        faltasProm: conStats.length ? prom('faltas') : null,
        toquesAreaProm: conStats.length ? prom('toquesArea') : null,
    };
};

/**
 * Percentil de un valor frente a una lista (porcentaje de pares con valor menor o igual)
 */
const percentil = (valor, lista) => {
    if (valor == null) return null;
    const validos = lista.filter(v => v != null);
    if (!validos.length) return null;
    return Math.round((validos.filter(v => v <= valor).length / validos.length) * 100);
};

module.exports = { agregarJugador, agregarArquero, statsDeEquipo, agregarEquipo, percentil, DETALLE, AL_ARCO, redondear };
