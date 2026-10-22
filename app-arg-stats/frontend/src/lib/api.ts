// URL del backend. Se define con API_URL en el .env del frontend; por defecto
// apunta al backend local.
export const API_URL = import.meta.env.API_URL ?? 'http://localhost:3000';

/**
 * Pide una ruta de la API y devuelve su `data` (la API responde { status, data }).
 * - 404: devuelve null, para que la página haga Astro.rewrite("/404").
 * - Cualquier otro error (o el backend caído): tira una excepción y Astro
 *   muestra la página 500, en vez de una página vacía o mal redirigida.
 */
export const pedirApi = async <T = any>(ruta: string): Promise<T | null> => {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${ruta}`);
  } catch (error) {
    throw new Error(`El backend no responde (${API_URL}${ruta})`, { cause: error });
  }
  if (response.status === 404) return null;
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`La API respondió ${response.status} en ${ruta}: ${json.message ?? ''}`);
  return (json.data ?? {}) as T;
};
