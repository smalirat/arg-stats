// Cache en memoria con vencimiento, para cálculos caros que cambian poco
// (índices de clubes y jugadores). Si dos pedidos llegan juntos, comparten
// el mismo cálculo en curso.
const conCache = (fn, minutos) => {
    let valor = null;
    let vence = 0;
    let enCurso = null;

    return async () => {
        if (valor && Date.now() < vence) return valor;
        if (!enCurso) {
            enCurso = fn()
                .then((v) => {
                    valor = v;
                    vence = Date.now() + minutos * 60 * 1000;
                    return v;
                })
                .finally(() => { enCurso = null; });
        }
        return enCurso;
    };
};

// Igual que conCache, pero guarda un resultado por clave (ej. por competición y temporada)
const conCachePorClave = (fn, minutos) => {
    const porClave = new Map();
    return (clave, ...args) => {
        if (!porClave.has(clave)) porClave.set(clave, conCache(() => fn(clave, ...args), minutos));
        return porClave.get(clave)();
    };
};

module.exports = { conCache, conCachePorClave };
