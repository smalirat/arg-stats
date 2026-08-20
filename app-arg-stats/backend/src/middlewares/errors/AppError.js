
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Recurso no encontrado') {
        super(message, 404);
    }
}

class BadRequestError extends AppError {
    constructor(message = 'Petición inválida') {
        super(message, 400);
    }
}

class DatabaseError extends AppError {
    constructor(message = 'Error en la base de datos') {
        super(message, 500);
    }
}

module.exports = {
    AppError,
    NotFoundError,
    BadRequestError,
    DatabaseError
};