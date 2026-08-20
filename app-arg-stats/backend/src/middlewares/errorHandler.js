const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    if (process.env.NODE_ENV === 'development') {
        console.error('🔥 [ERROR DEPURACIÓN]:', err);
        return res.status(err.statusCode).json({
            status: err.status,
            error: err,
            message: err.message,
            stack: err.stack
        });
    }

    if (!err.isOperational) {
        console.error('💥 [ERROR CRÍTICO NO CONTROLADO]:', err);
        return res.status(500).json({
            status: 'error',
            message: 'Ocurrió un error interno en el servidor.'
        });
    }

    return res.status(err.statusCode).json({
        status: err.status,
        message: err.message
    });
};

module.exports = errorHandler;