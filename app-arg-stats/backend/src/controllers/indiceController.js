const indiceService = require('../services/indiceService');
const estadisticasService = require('../services/estadisticasService');
const catchAsync = require('../middlewares/utils/catchAsync');

const getPartidosPorFecha = catchAsync(async (req, res) => {
    const data = await indiceService.getPartidosPorFecha(req.query.fecha);
    res.status(200).json({ status: 'success', data });
});

const getJugadores = catchAsync(async (req, res) => {
    const data = await indiceService.getJugadores({ letra: req.query.letra, q: req.query.q });
    res.status(200).json({ status: 'success', data });
});

const getClubes = catchAsync(async (req, res) => {
    const data = await indiceService.getClubes();
    res.status(200).json({ status: 'success', data });
});

const buscar = catchAsync(async (req, res) => {
    const data = await indiceService.buscar(req.query.q);
    res.status(200).json({ status: 'success', data });
});

// Estadísticas al estilo FBref (solo lectura)
const getEstadisticasJugador = catchAsync(async (req, res) => {
    const data = await estadisticasService.getEstadisticasJugador(req.params.id);
    res.status(200).json({ status: 'success', data });
});

const getEstadisticasEquipo = catchAsync(async (req, res) => {
    const data = await estadisticasService.getEstadisticasEquipo(req.params.id);
    res.status(200).json({ status: 'success', data });
});

const getEstadisticasTorneo = catchAsync(async (req, res) => {
    const data = await estadisticasService.getEstadisticasTorneo(req.params.id);
    res.status(200).json({ status: 'success', data });
});

module.exports = {
    getPartidosPorFecha, getJugadores, getClubes, buscar,
    getEstadisticasJugador, getEstadisticasEquipo, getEstadisticasTorneo,
};
