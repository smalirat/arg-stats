const express = require('express');
const router = express.Router();
const validarId = require('../middlewares/validarId');

const playerController = require('../controllers/playerController');
const indiceController = require('../controllers/indiceController');

// Los :id son enteros: si no, 400 en vez de un error de la base
router.param('id', validarId);

// Índice de jugadores (?letra=A o ?q=nombre)
router.get('/', indiceController.getJugadores);

router.get('/:id', playerController.getPlayerById);
router.get('/:id/estadisticas', indiceController.getEstadisticasJugador);

router.get('/:id/partidos', playerController.getPlayerMatchLog);

module.exports = router;