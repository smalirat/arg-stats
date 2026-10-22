const express = require('express');
const router = express.Router();
const validarId = require('../middlewares/validarId');

const edicionController = require('../controllers/edicionController');
const indiceController = require('../controllers/indiceController');

// Los :id son enteros: si no, 400 en vez de un error de la base
router.param('id', validarId);


router.get('/', edicionController.getEdiciones);


router.get('/:id', edicionController.getEdicionById);
router.get('/:id/estadisticas', indiceController.getEstadisticasTorneo);

module.exports = router;