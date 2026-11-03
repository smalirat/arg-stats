// Campeones de Primera División desde el profesionalismo (1931), según la lista
// oficial de AFA. Va como dato fijo porque en muchos formatos viejos el campeón
// no sale de la tabla (grupos y finales del Metropolitano y el Nacional,
// desempates, puntos de 2 por victoria). Cada entrada apunta a su edición en la
// base por (nombre_torneo, temporada); null si el torneo no está cargado.
//
// Los torneos con playoff (Copa de la Liga 2024 en adelante) no van acá: el
// campeón sale de la final cargada (historialService), así los nuevos aparecen solos.

const B = 10077, R = 10076, IND = 10078, SL = 10083, EST = 10094, VEL = 10079, RAC = 10080, NOB = 10201,
    RC = 10084, HUR = 10081, ARG = 10086, LAN = 10082, FER = 161733, BAN = 10087, CHA = 10093, COL = 25,
    QUI = 10226, ARS = 10098;

const anual = (anio, equipo) => ({ torneo: 'Campeonato', temporada: String(anio), edicion: ['Campeonato', String(anio)], equipo });

const CAMPEONES = [
    ...[[1931, B], [1932, R], [1933, SL], [1934, B], [1935, B]].map(([a, e]) => anual(a, e)),
    { torneo: 'Copa de Honor', temporada: '1936', edicion: ['Copa de Honor', '1936'], equipo: SL },
    { torneo: 'Copa Campeonato', temporada: '1936', edicion: ['Campeonato', '1936'], equipo: R },
    ...[[1937, R], [1938, IND], [1939, IND], [1940, B], [1941, R], [1942, R], [1943, B], [1944, B], [1945, R],
        [1946, SL], [1947, R], [1948, IND], [1949, RAC], [1950, RAC], [1951, RAC], [1952, R], [1953, R], [1954, B],
        [1955, R], [1956, R], [1957, R], [1958, RAC], [1959, SL], [1960, IND], [1961, RAC], [1962, B], [1963, IND],
        [1964, B], [1965, B], [1966, RAC]].map(([a, e]) => anual(a, e)),

    // Metropolitano y Nacional (en 1982-1985 el Nacional se jugó primero)
    ...[[1967, EST, IND], [1968, SL, VEL], [1969, CHA, B], [1970, IND, B], [1971, IND, RC], [1972, SL, SL],
        [1973, HUR, RC], [1974, NOB, SL], [1975, R, R], [1976, B, B], [1977, R, IND], [1978, QUI, IND],
        [1979, R, R], [1980, R, RC], [1981, B, R]].flatMap(([a, metro, nacional]) => [
        { torneo: 'Metropolitano', temporada: String(a), edicion: ['Metropolitano', String(a)], equipo: metro },
        { torneo: 'Nacional', temporada: String(a), edicion: ['Nacional', String(a)], equipo: nacional },
    ]),
    ...[[1982, FER, EST], [1983, EST, IND], [1984, FER, ARG]].flatMap(([a, nacional, metro]) => [
        { torneo: 'Nacional', temporada: String(a), edicion: ['Torneo Nacional', String(a)], equipo: nacional },
        { torneo: 'Metropolitano', temporada: String(a), edicion: ['Metropolitano', String(a)], equipo: metro },
    ]),
    { torneo: 'Nacional', temporada: '1985', edicion: ['Torneo Nacional', '1985'], equipo: ARG },

    // Temporadas largas de dos ruedas
    ...[['1985/86', R], ['1986/87', RC], ['1987/88', NOB], ['1988/89', IND], ['1989/90', R], ['1990/91', NOB]]
        .map(([t, e]) => ({ torneo: 'Campeonato', temporada: t, edicion: ['Campeonato', t], equipo: e })),

    // Apertura y Clausura (temporada = año del torneo)
    ...[[1991, R, NOB], [1992, B, VEL], [1993, R, IND], [1994, R, SL], [1995, VEL, VEL], [1996, R, R],
        [1997, R, VEL], [1998, B, B], [1999, R, R], [2000, B, SL], [2001, RAC, R], [2002, IND, R], [2003, B, R],
        [2004, NOB, VEL], [2005, B, B], [2006, EST, SL], [2007, LAN, R], [2008, B, VEL], [2009, BAN, ARG],
        [2010, EST, VEL], [2011, B, ARS]].flatMap(([a, apertura, clausura]) => [
        { torneo: 'Apertura', temporada: String(a), edicion: ['Torneo Apertura', String(a)], equipo: apertura },
        // El Clausura de la misma temporada se juega en el primer semestre del año siguiente
        { torneo: 'Clausura', temporada: String(a + 1), edicion: a + 1 <= 2011 ? ['Torneo Clausura', String(a + 1)] : null, equipo: clausura },
    ]),

    // Liga Profesional (Inicial y Final de 2012/13 y 2013/14 son la misma edición en la base)
    { torneo: 'Inicial', temporada: '2012/2013', edicion: ['Liga Profesional', '2012/2013'], equipo: VEL },
    { torneo: 'Final', temporada: '2012/2013', edicion: ['Liga Profesional', '2012/2013'], equipo: NOB },
    { torneo: 'Inicial', temporada: '2013/2014', edicion: ['Liga Profesional', '2013/2014'], equipo: SL },
    { torneo: 'Final', temporada: '2013/2014', edicion: ['Liga Profesional', '2013/2014'], equipo: R },
    ...[['2014', RAC], ['2015', B], ['2016', LAN], ['2016/2017', B], ['2017/2018', B], ['2018/2019', RAC],
        ['2019/2020', B], ['2021', R], ['2022', B], ['2023', R], ['2024', VEL]]
        .map(([t, e]) => ({ torneo: 'Liga Profesional', temporada: t, edicion: ['Liga Profesional', t], equipo: e })),
    ...[['2020', B], ['2021', COL], ['2022', B], ['2023', RC]]
        .map(([t, e]) => ({ torneo: 'Copa de la Liga', temporada: t, edicion: ['Copa de la Liga Profesional', t], equipo: e })),
];

module.exports = { CAMPEONES };
