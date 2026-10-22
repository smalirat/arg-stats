// Supabase devuelve como máximo 1000 filas por consulta: esto pide páginas
// hasta traer todas. Recibe una función que arma la consulta (sin range).
const PAGINA = 1000;

const traerTodo = async (consulta) => {
    const filas = [];
    for (let desde = 0; ; desde += PAGINA) {
        const { data, error } = await consulta().range(desde, desde + PAGINA - 1);
        if (error) throw error;
        filas.push(...data);
        if (data.length < PAGINA) return filas;
    }
};

// Igual que traerTodo, pero pide todas las páginas a la vez (para tablas
// grandes). consulta(opciones) arma la consulta; primero se cuenta el total.
const traerTodoEnParalelo = async (consulta) => {
    const { count, error } = await consulta({ count: 'exact', head: true });
    if (error) throw error;

    const paginas = [];
    for (let desde = 0; desde < count; desde += PAGINA) paginas.push(desde);

    const resultados = await Promise.all(paginas.map(async (desde) => {
        const { data, error: errorPagina } = await consulta().range(desde, desde + PAGINA - 1);
        if (errorPagina) throw errorPagina;
        return data;
    }));
    return resultados.flat();
};

// Las fechas vienen como "2026-07-23T22:30:00.000Z" (FotMob) o
// "2024-01-25 22:00:00" (UTC sin zona). Se pasan todas a ISO con Z.
const fechaIso = (fecha) => {
    if (!fecha) return null;
    const s = String(fecha).trim().replace(' ', 'T');
    return /Z$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`;
};

module.exports = { traerTodo, traerTodoEnParalelo, fechaIso };
