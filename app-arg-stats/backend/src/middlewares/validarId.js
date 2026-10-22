const { BadRequestError } = require('./errors/AppError');

// Para router.param('id', validarId): los IDs son enteros positivos. Sin esto,
// un ID como "abc" llega a Postgres y vuelve como error 500.
const validarId = (req, res, next, id) => {
    if (!/^\d+$/.test(id)) return next(new BadRequestError(`ID inválido: "${id}". Tiene que ser un número.`));
    next();
};

module.exports = validarId;
