const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const indiceController = require('../controllers/indiceController');

// Índice de clubes
router.get('/', indiceController.getClubes);


router.get('/:id', teamController.getTeamById);

router.get('/:id/plantel', teamController.getTeamSquad);
router.get('/:id/partidos', teamController.getTeamMatches);
// Estadísticas del plantel al estilo FBref
router.get('/:id/estadisticas', indiceController.getEstadisticasEquipo);

module.exports = router;