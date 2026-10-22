const express = require('express');
const router = express.Router();
const matchController = require('../controllers/matchController');
const indiceController = require('../controllers/indiceController');

// Partidos de un día (?fecha=AAAA-MM-DD, hora argentina)
router.get('/', indiceController.getPartidosPorFecha);

router.get('/:id', matchController.getMatchById);

module.exports = router;