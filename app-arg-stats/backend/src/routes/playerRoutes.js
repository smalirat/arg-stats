const express = require('express');
const router = express.Router();
const playerController = require('../controllers/playerController');

router.get('/:id', playerController.getPlayerById);

router.get('/:id/partidos', playerController.getPlayerMatchLog);

module.exports = router;