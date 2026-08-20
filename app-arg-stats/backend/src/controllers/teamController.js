const teamService = require('../services/teamService');
const catchAsync = require('../middlewares/utils/catchAsync');
const { NotFoundError } = require('../middlewares/errors/AppError');

const getTeamById = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const data = await teamService.getTeamDetails(id);

    if (!data.perfil) {
        return next(new NotFoundError(`El equipo con ID ${id} no existe.`));
    }

    res.status(200).json({ status: 'success', data });
});

const getTeamSquad = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const squad = await teamService.getTeamSquadDetails(id);

    res.status(200).json({ 
        status: 'success', 
        results: squad.length,
        data: squad 
    });
});

const getTeamMatches = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const matches = await teamService.getTeamMatchesDetails(id);

    res.status(200).json({ 
        status: 'success', 
        results: matches.length,
        data: matches 
    });
});

const getTeamStats = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const stats = await teamService.getTeamStatsDetails(id);

    res.status(200).json({ 
        status: 'success', 
        data: stats 
    });
});

module.exports = { 
    getTeamById,
    getTeamSquad,
    getTeamMatches,
    getTeamStats
};