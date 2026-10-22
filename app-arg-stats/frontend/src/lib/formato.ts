// Formatos compartidos por las páginas: fechas en hora de Argentina y colores de resultado

const TZ = "America/Argentina/Buenos_Aires";

const dia = (fecha: string | Date) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: TZ, day: "numeric", month: "numeric", year: "numeric" }).format(new Date(fecha));

// "Hoy" o "dom, 25 oct"
export const fechaCorta = (iso: string) =>
  dia(iso) === dia(new Date())
    ? "Hoy"
    : new Intl.DateTimeFormat("es-AR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));

// "25 de octubre de 2026"
export const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

export const hora = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

// Ganado, Empatado, Perdido
export const colorResultado: Record<string, string> = {
  G: "bg-[#1f8a4c] text-white",
  E: "bg-gray-400 text-white",
  P: "bg-[#c8102e] text-white",
};

// Color del puntaje del jugador (escala de FotMob)
export const colorPuntaje = (puntaje: number | null | undefined) => {
  if (puntaje == null) return "bg-gray-200 text-gray-600";
  if (puntaje >= 8) return "bg-[#1f6fb2] text-white";
  if (puntaje >= 7) return "bg-[#1f8a4c] text-white";
  if (puntaje >= 6) return "bg-[#e3a008] text-white";
  return "bg-[#c8102e] text-white";
};

export const ronda = (r: string | null | undefined) =>
  r == null ? "" : /^\d+$/.test(r) ? `Fecha ${r}` : r;
