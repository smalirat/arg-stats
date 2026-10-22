const express = require('express');
const router = express.Router();
const playerController = require('../controllers/playerController');
const indiceController = require('../controllers/indiceController');

// Índice de jugadores (?letra=A o ?q=nombre)
router.get('/', indiceController.getJugadores);

router.get('/:id', playerController.getPlayerById);
router.get('/:id/estadisticas', indiceController.getEstadisticasJugador);

router.get('/:id/partidos', playerController.getPlayerMatchLog);

module.exports = router;