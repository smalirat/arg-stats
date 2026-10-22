const express = require('express');
const router = express.Router();
const validarId = require('../middlewares/validarId');

const teamController = require('../controllers/teamController');
const indiceController = require('../controllers/indiceController');

// Los :id son enteros: si no, 400 en vez de un error de la base
router.param('id', validarId);

// Índice de clubes
router.get('/', indiceController.getClubes);


router.get('/:id', teamController.getTeamById);

router.get('/:id/plantel', teamController.getTeamSquad);
router.get('/:id/partidos', teamController.getTeamMatches);
// Estadísticas del plantel al estilo FBref
router.get('/:id/estadisticas', indiceController.getEstadisticasEquipo);

module.exports = router;