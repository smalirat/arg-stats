// URLs con el esquema de FotMob: /{entidad}/{id}/{pestaña}/{slug}.
// El slug es decorativo: las páginas buscan por ID y, si el slug o la pestaña
// no coinciden, redirigen a la URL correcta.

export const slug = (texto: string | null | undefined) =>
  (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "-";

type Equipo = { equipo_id: number; nombre?: string; nombre_corto?: string; nombre_fuente?: string };
type Edicion = { edicion_id: number; nombre_torneo: string; temporada?: string };
type Partido = { partido_id: number; local?: { nombre?: string }; visitante?: { nombre?: string } };
type Jugador = { jugador_id: number; nombre?: string; nombre_completo?: string };

export const TABS_EQUIPO = ["resumen", "partidos", "plantel", "estadisticas", "clasificacion"] as const;
export const TABS_TORNEO = ["resumen", "partidos", "estadisticas"] as const;
export const TABS_JUGADOR = ["resumen", "estadisticas", "partidos", "tiros"] as const;

export const urlEquipo = (e: Equipo, tab: (typeof TABS_EQUIPO)[number] = "resumen") =>
  `/equipos/${e.equipo_id}/${tab}/${slug(e.nombre ?? e.nombre_corto ?? e.nombre_fuente)}`;

export const urlTorneo = (ed: Edicion, tab: (typeof TABS_TORNEO)[number] = "resumen") =>
  `/torneos/${ed.edicion_id}/${tab}/${slug(`${ed.nombre_torneo} ${ed.temporada ?? ""}`)}`;

// Sin nombres de equipos alcanza con el ID: la página redirige a la URL completa
export const urlPartido = (p: Partido) =>
  p.local?.nombre && p.visitante?.nombre
    ? `/partidos/${p.partido_id}/${slug(`${p.local.nombre} vs ${p.visitante.nombre}`)}`
    : `/partidos/${p.partido_id}`;

// El resumen del jugador no lleva pestaña en la URL (como FotMob)
export const urlJugador = (j: Jugador, tab: (typeof TABS_JUGADOR)[number] = "resumen") =>
  tab === "resumen"
    ? `/jugadores/${j.jugador_id}/${slug(j.nombre ?? j.nombre_completo)}`
    : `/jugadores/${j.jugador_id}/${tab}/${slug(j.nombre ?? j.nombre_completo)}`;
