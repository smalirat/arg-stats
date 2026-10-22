// Columnas de las tablas de estadísticas (al estilo de las de FBref).
// "falta: true" = FotMob publica el dato pero la base todavía no lo guarda;
// la tabla lo muestra igual, vacío, para que se vea qué falta cargar.

export type Columna = {
  clave: string;
  etiqueta: string;
  ayuda: string;
  decimales?: number;
  falta?: boolean;
};

export type Grupo = { titulo: string; columnas: Columna[] };

const c = (clave: string, etiqueta: string, ayuda: string, decimales = 0, falta = false): Columna => ({ clave, etiqueta, ayuda, decimales, falta });

export const ESTANDAR: Grupo[] = [
  { titulo: "Tiempo de juego", columnas: [
    c("pj", "PJ", "Partidos jugados"),
    c("titular", "Tit", "Partidos como titular (vacío si el partido no tiene alineaciones cargadas)"),
    c("min", "Min", "Minutos jugados"),
    c("n90", "90s", "Minutos jugados divididos por 90", 1),
  ] },
  { titulo: "Rendimiento", columnas: [
    c("goles", "Gls", "Goles"),
    c("asistencias", "Ast", "Asistencias"),
    c("ga", "G+A", "Goles + asistencias"),
    c("golesSinPenal", "G-TP", "Goles sin contar penales", 0, true),
    c("pk", "TP", "Penales convertidos", 0, true),
    c("pkIntentos", "TPint", "Penales intentados", 0, true),
    c("amarillas", "TA", "Tarjetas amarillas (el ETL las guarda siempre en falso)", 0, true),
    c("rojas", "TR", "Tarjetas rojas (el ETL las guarda siempre en falso)", 0, true),
  ] },
  { titulo: "Esperado", columnas: [
    c("xg", "xG", "Goles esperados", 2),
    c("npxg", "npxG", "Goles esperados sin penales", 2, true),
    c("xa", "xA", "Asistencias esperadas", 2),
    c("xgxa", "xG+xA", "Goles esperados + asistencias esperadas", 2),
  ] },
  { titulo: "Por 90 minutos", columnas: [
    c("goles90", "Gls", "Goles cada 90 minutos", 2),
    c("asistencias90", "Ast", "Asistencias cada 90 minutos", 2),
    c("ga90", "G+A", "Goles + asistencias cada 90 minutos", 2),
    c("xg90", "xG", "Goles esperados cada 90 minutos", 2),
    c("xa90", "xA", "Asistencias esperadas cada 90 minutos", 2),
    c("xgxa90", "xG+xA", "xG + xA cada 90 minutos", 2),
  ] },
  { titulo: "FotMob", columnas: [
    c("puntaje", "Punt", "Puntaje promedio de FotMob", 2),
  ] },
];

// Plantel de un equipo (como la tabla "Standard Stats" del plantel en FBref):
// solo lo que la base tiene; las métricas pendientes quedan en la pestaña Estadísticas
const cargadas = (titulo: string) => ESTANDAR.find((g) => g.titulo === titulo)!.columnas.filter((c) => !c.falta);
export const PLANTEL: Grupo[] = [
  { titulo: "Tiempo de juego", columnas: cargadas("Tiempo de juego") },
  { titulo: "Rendimiento", columnas: cargadas("Rendimiento") },
  { titulo: "Esperado", columnas: cargadas("Esperado") },
  { titulo: "Tiros", columnas: [
    c("tiros", "Dis", "Disparos totales"),
    c("tirosArco", "DaP", "Disparos a puerta (goles + atajados)"),
    c("gMenosXg", "G-xG", "Goles menos goles esperados", 2),
  ] },
  { titulo: "Por 90 minutos", columnas: cargadas("Por 90 minutos") },
  { titulo: "FotMob", columnas: cargadas("FotMob") },
];

export const TIROS: Grupo[] = [
  { titulo: "Tiros", columnas: [
    c("tiros", "Dis", "Disparos totales"),
    c("tirosArco", "DaP", "Disparos a puerta (goles + atajados)"),
    c("pctArco", "%DaP", "Porcentaje de disparos a puerta", 1),
    c("tiros90", "Dis/90", "Disparos cada 90 minutos", 2),
    c("tirosArco90", "DaP/90", "Disparos a puerta cada 90 minutos", 2),
    c("golesPorTiro", "G/Dis", "Goles por disparo", 2),
    c("golesPorTiroArco", "G/DaP", "Goles por disparo a puerta", 2),
    c("distancia", "Dist", "Distancia promedio de los disparos al arco, en metros", 1),
    c("cabezazos", "Cab", "Disparos de cabeza"),
  ] },
  { titulo: "Esperado", columnas: [
    c("xgPorTiro", "xG/Dis", "Goles esperados por disparo", 2),
    c("gMenosXg", "G-xG", "Goles menos goles esperados (positivo = definió mejor de lo esperado)", 2),
    c("xgot", "xGOT", "Goles esperados de los disparos a puerta", 2),
  ] },
];

export const PASES: Grupo[] = [
  { titulo: "Pases", columnas: [
    c("pasesPrecisos", "Cmp", "Pases completados", 0, true),
    c("pasesTotales", "Int", "Pases intentados", 0, true),
    c("pctPases", "%Cmp", "Porcentaje de pases completados", 1, true),
    c("pasesUltimoTercio", "1/3", "Pases al último tercio", 0, true),
    c("pelotazosPrecisos", "Larg", "Pases largos precisos", 0, true),
    c("centrosPrecisos", "Cen", "Centros precisos", 0, true),
    c("chancesCreadas", "Ocas", "Ocasiones creadas", 0, true),
  ] },
];

export const DEFENSA: Grupo[] = [
  { titulo: "Acciones defensivas", columnas: [
    c("entradas", "Ent", "Entradas", 0, true),
    c("intercepciones", "Int", "Intercepciones", 0, true),
    c("despejes", "Desp", "Despejes", 0, true),
    c("bloqueos", "Bloq", "Disparos bloqueados", 0, true),
    c("recuperaciones", "Rec", "Recuperaciones", 0, true),
    c("regateado", "Reg", "Veces que lo regatearon", 0, true),
    c("accionesDefensivas", "AccD", "Acciones defensivas totales", 0, true),
  ] },
];

export const POSESION: Grupo[] = [
  { titulo: "Posesión", columnas: [
    c("toques", "Toq", "Toques", 0, true),
    c("toquesArea", "ÁreaR", "Toques en el área rival", 0, true),
    c("gambetas", "Reg", "Regates exitosos", 0, true),
    c("perdidas", "Pérd", "Pérdidas de balón", 0, true),
    c("offsides", "Off", "Fueras de juego", 0, true),
  ] },
];

export const DUELOS: Grupo[] = [
  { titulo: "Duelos y faltas", columnas: [
    c("duelosGanados", "DG", "Duelos ganados", 0, true),
    c("duelosPerdidos", "DP", "Duelos perdidos", 0, true),
    c("aereosGanados", "Aér", "Duelos aéreos ganados", 0, true),
    c("faltasCometidas", "FC", "Faltas cometidas", 0, true),
    c("faltasRecibidas", "FR", "Faltas recibidas", 0, true),
  ] },
];

export const ARQUEROS: Grupo[] = [
  { titulo: "Tiempo de juego", columnas: [
    c("pj", "PJ", "Partidos jugados"),
    c("min", "Min", "Minutos jugados"),
    c("n90", "90s", "Minutos divididos por 90", 1),
  ] },
  { titulo: "Rendimiento", columnas: [
    c("ga", "GC", "Goles en contra"),
    c("ga90", "GC90", "Goles en contra cada 90 minutos", 2),
    c("tirosArcoRecibidos", "DaPC", "Disparos a puerta recibidos"),
    c("atajadas", "Ata", "Atajadas"),
    c("pctAtajadas", "%Ata", "Porcentaje de atajadas", 1),
    c("vallasInvictas", "PaC", "Partidos (completos) con la valla invicta"),
    c("pctVallas", "%PaC", "Porcentaje de partidos completos con la valla invicta", 1),
  ] },
  { titulo: "Esperado", columnas: [
    c("xgotRecibido", "PSxG", "Goles esperados de los disparos a puerta recibidos", 2),
    c("golesEvitados", "PSxG-GC", "Goles evitados: PSxG menos goles en contra (positivo = atajó más de lo esperado)", 2),
  ] },
];

// Tabla de equipos de un torneo
export const EQUIPOS_TORNEO: Grupo[] = [
  { titulo: "General", columnas: [
    c("pj", "PJ", "Partidos jugados"),
    c("conDatos", "c/datos", "Partidos con estadísticas de equipo en la base"),
    c("goles", "GF", "Goles a favor"),
    c("golesContra", "GC", "Goles en contra"),
  ] },
  { titulo: "Esperado", columnas: [
    c("xg", "xG", "Goles esperados a favor", 2),
    c("xgContra", "xGC", "Goles esperados en contra", 2),
    c("xgDif", "xGD", "Diferencia de goles esperados", 2),
    c("xgProm", "xG/PJ", "Goles esperados por partido", 2),
  ] },
  { titulo: "Por partido", columnas: [
    c("tirosProm", "Dis", "Disparos por partido", 1),
    c("tirosArcoProm", "DaP", "Disparos a puerta por partido", 1),
    c("tirosContraProm", "DisC", "Disparos en contra por partido", 1),
    c("tirosArcoContraProm", "DaPC", "Disparos a puerta en contra por partido", 1),
    c("toquesAreaProm", "ÁreaR", "Toques en el área rival por partido", 1),
  ] },
  { titulo: "Juego", columnas: [
    c("posesion", "Pos%", "Posesión promedio", 1),
    c("pctPases", "%Pases", "Porcentaje de pases completados", 1),
    c("pasesPrecisosProm", "Pases", "Pases completados por partido", 1),
    c("cornersProm", "Cór", "Córners por partido", 1),
    c("faltasProm", "Faltas", "Faltas por partido", 1),
  ] },
];

// Bloque equipo vs rivales (filas de una tabla vertical)
export const EQUIPO_VS_RIVALES: Columna[] = [
  c("pj", "Partidos", "Partidos jugados"),
  c("goles", "Goles", "Goles"),
  c("golesProm", "Goles por partido", "Goles por partido", 2),
  c("xg", "xG", "Goles esperados", 2),
  c("xgProm", "xG por partido", "Goles esperados por partido", 2),
  c("posesion", "Posesión %", "Posesión promedio", 1),
  c("tirosProm", "Disparos por partido", "Disparos por partido", 1),
  c("tirosArcoProm", "A puerta por partido", "Disparos a puerta por partido", 1),
  c("chancesClaras", "Chances claras", "Chances claras en total"),
  c("pasesPrecisosProm", "Pases completados por partido", "Pases completados por partido", 1),
  c("pctPases", "% de pases", "Porcentaje de pases completados", 1),
  c("toquesAreaProm", "Toques en el área rival por partido", "Toques en el área rival por partido", 1),
  c("cornersProm", "Córners por partido", "Córners por partido", 1),
  c("faltasProm", "Faltas por partido", "Faltas por partido", 1),
];

// Métricas del informe de scouting
export const SCOUTING: Record<string, { etiqueta: string; decimales: number; grupo: string }> = {
  goles90: { etiqueta: "Goles", decimales: 2, grupo: "Ataque" },
  xg90: { etiqueta: "xG", decimales: 2, grupo: "Ataque" },
  tiros90: { etiqueta: "Disparos", decimales: 2, grupo: "Ataque" },
  tirosArco90: { etiqueta: "Disparos a puerta", decimales: 2, grupo: "Ataque" },
  pctArco: { etiqueta: "% disparos a puerta", decimales: 1, grupo: "Ataque" },
  golesPorTiro: { etiqueta: "Goles por disparo", decimales: 2, grupo: "Ataque" },
  asistencias90: { etiqueta: "Asistencias", decimales: 2, grupo: "Creación" },
  xa90: { etiqueta: "xA", decimales: 2, grupo: "Creación" },
  xgxa90: { etiqueta: "xG + xA", decimales: 2, grupo: "Creación" },
  puntaje: { etiqueta: "Puntaje FotMob", decimales: 2, grupo: "General" },
  pasesPrecisos: { etiqueta: "Pases completados", decimales: 1, grupo: "Pendiente de carga" },
  pctPases: { etiqueta: "% de pases", decimales: 1, grupo: "Pendiente de carga" },
  chancesCreadas: { etiqueta: "Ocasiones creadas", decimales: 2, grupo: "Pendiente de carga" },
  entradas: { etiqueta: "Entradas", decimales: 2, grupo: "Pendiente de carga" },
  intercepciones: { etiqueta: "Intercepciones", decimales: 2, grupo: "Pendiente de carga" },
  recuperaciones: { etiqueta: "Recuperaciones", decimales: 2, grupo: "Pendiente de carga" },
  gambetas: { etiqueta: "Regates exitosos", decimales: 2, grupo: "Pendiente de carga" },
  duelosGanados: { etiqueta: "Duelos ganados", decimales: 2, grupo: "Pendiente de carga" },
  aereosGanados: { etiqueta: "Duelos aéreos ganados", decimales: 2, grupo: "Pendiente de carga" },
};

export const formatear = (valor: unknown, decimales = 0) =>
  valor == null || Number.isNaN(valor as number) ? "" : typeof valor === "number" ? valor.toFixed(decimales) : String(valor);
