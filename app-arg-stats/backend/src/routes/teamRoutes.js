const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');


router.get('/:id', teamController.getTeamById);

router.get('/:id/plantel', teamController.getTeamSquad);
router.get('/:id/partidos', teamController.getTeamMatches);
router.get('/:id/estadisticas', teamController.getTeamStats);

module.exports = router;