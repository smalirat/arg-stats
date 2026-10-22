const { AppError, BadRequestError, NotFoundError } = require('./errors/AppError');

// Errores de Supabase/Postgres y de red que tienen una respuesta más precisa que un 500
const traducir = (err) => {
    if (err instanceof AppError) return err;
    // 22P02: texto que no se puede convertir al tipo de la columna (ej. un ID no numérico)
    if (err.code === '22P02') return new BadRequestError('Parámetro inválido.');
    // PGRST116: se pidió una sola fila (.single()) y no hay ninguna
    if (err.code === 'PGRST116') return new NotFoundError();
    // Sin conexión con Supabase (fetch failed, timeout, etc.)
    if (err instanceof TypeError && /fetch failed/i.test(err.message)) {
        return new AppError('La base de datos no responde. Probá de nuevo en un rato.', 503);
    }
    return err;
};

const errorHandler = (original, req, res, next) => {
    const err = traducir(original);
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    if (process.env.NODE_ENV === 'development') {
        console.error('🔥 [ERROR DEPURACIÓN]:', original);
        return res.status(err.statusCode).json({
            status: err.status,
            error: original,
            message: err.message,
            stack: original.stack
        });
    }

    if (!err.isOperational) {
        console.error('💥 [ERROR CRÍTICO NO CONTROLADO]:', original);
        return res.status(500).json({
            status: 'error',
            message: 'Ocurrió un error interno en el servidor.'
        });
    }

    // Los 5xx previstos (ej. base caída) también quedan en el log
    if (err.statusCode >= 500) console.error(`⚠️ [${err.statusCode}] ${req.method} ${req.originalUrl}:`, original.message);

    return res.status(err.statusCode).json({
        status: err.status,
        message: err.message
    });
};

module.exports = errorHandler;
