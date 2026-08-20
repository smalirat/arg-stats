const edicionService = require('../services/edicionService');
const catchAsync = require('../middlewares/utils/catchAsync');

const getEdiciones = catchAsync(async (req, res, next) => {
    const ediciones = await edicionService.getAllEdiciones();

    res.status(200).json({
        status: 'success',
        results: ediciones.length,
        data: ediciones
    });
});

const getEdicionById = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const data = await edicionService.getEdicionDetails(id);

    res.status(200).json({
        status: 'success',
        data
    });
});

module.exports = {
    getEdiciones,
    getEdicionById
};