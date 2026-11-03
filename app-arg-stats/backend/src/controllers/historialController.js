const historialService = require('../services/historialService');
const catchAsync = require('../middlewares/utils/catchAsync');

const getCampeones = catchAsync(async (req, res) => {
    const data = await historialService.getCampeones();
    res.status(200).json({ status: 'success', data });
});

const getTabla = catchAsync(async (req, res) => {
    const data = await historialService.getTabla(req.query.era);
    res.status(200).json({ status: 'success', data });
});

const getRecords = catchAsync(async (req, res) => {
    const data = await historialService.getRecords();
    res.status(200).json({ status: 'success', data });
});

const getTemporadas = catchAsync(async (req, res) => {
    const data = await historialService.getTemporadas();
    res.status(200).json({ status: 'success', data });
});

module.exports = { getCampeones, getTabla, getRecords, getTemporadas };
