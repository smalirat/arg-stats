const matchService = require('../services/matchService');
const catchAsync = require('../middlewares/utils/catchAsync');
const { NotFoundError } = require('../middlewares/errors/AppError');

/**
 * 1. Obtiene la radiografía completa de un partido (Marcador, alineaciones, eventos)
 */
const getMatchById = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const data = await matchService.getMatchDetails(id);

    if (!data.partido) {
        return next(new NotFoundError(`El partido con ID ${id} no existe en la base de datos.`));
    }

    res.status(200).json({ 
        status: 'success', 
        data 
    });
});

/**
 * 2. Obtiene exclusivamente la línea de tiempo de eventos (goles, tarjetas, cambios)
 */
const getMatchEvents = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const events = await matchService.getMatchEventsDetails(id);

    res.status(200).json({
        status: 'success',
        results: events.length,
        data: events
    });
});

/**
 * 3. Obtiene el mapa de tiros y métricas de xG (Expected Goals) del partido
 */
const getMatchShots = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const shots = await matchService.getMatchShotsDetails(id);

    res.status(200).json({
        status: 'success',
        results: shots.length,
        data: shots
    });
});

/**
 * 4. Obtiene la curva de momentum minuto a minuto del encuentro
 */
const getMatchMomentum = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const momentum = await matchService.getMatchMomentumDetails(id);

    res.status(200).json({
        status: 'success',
        results: momentum.length,
        data: momentum
    });
});

/**
 * 5. Obtiene las estadísticas individuales de todos los jugadores que participaron en el partido (xG, xA, minutos, rating)
 */
const getMatchPlayerStats = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const stats = await matchService.getMatchPlayerStatsDetails(id);

    res.status(200).json({
        status: 'success',
        results: stats.length,
        data: stats
    });
});

module.exports = {
    getMatchById,
    getMatchEvents,
    getMatchShots,
    getMatchMomentum,
    getMatchPlayerStats
};