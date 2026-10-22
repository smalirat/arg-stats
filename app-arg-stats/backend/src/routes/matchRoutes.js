const express = require('express');
const router = express.Router();
const validarId = require('../middlewares/validarId');

const matchController = require('../controllers/matchController');
const indiceController = require('../controllers/indiceController');

// Los :id son enteros: si no, 400 en vez de un error de la base
router.param('id', validarId);

// Partidos de un día (?fecha=AAAA-MM-DD, hora argentina)
router.get('/', indiceController.getPartidosPorFecha);

router.get('/:id', matchController.getMatchById);

module.exports = router;