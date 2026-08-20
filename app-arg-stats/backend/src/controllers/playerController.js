const playerService = require('../services/playerService');
const catchAsync = require('../middlewares/utils/catchAsync');

const getPlayerById = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const data = await playerService.getPlayerDetails(id);

    res.status(200).json({
        status: 'success',
        data
    });
});

const getPlayerMatchLog = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const matchLog = await playerService.getPlayerMatchLogDetails(id);

    res.status(200).json({
        status: 'success',
        results: matchLog.length,
        data: matchLog
    });
});

module.exports = {
    getPlayerById,
    getPlayerMatchLog
};