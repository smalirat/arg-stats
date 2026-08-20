const homeService = require('../services/homeService');
const catchAsync = require('../middlewares/utils/catchAsync');

const getHome = catchAsync(async (req, res, next) => {
    const data = await homeService.getHomeDashboard();

    res.status(200).json({
        status: 'success',
        data
    });
});

module.exports = {
    getHome
};