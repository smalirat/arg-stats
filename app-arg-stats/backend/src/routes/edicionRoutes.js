const express = require('express');
const router = express.Router();
const edicionController = require('../controllers/edicionController');
const indiceController = require('../controllers/indiceController');


router.get('/', edicionController.getEdiciones);


router.get('/:id', edicionController.getEdicionById);
router.get('/:id/estadisticas', indiceController.getEstadisticasTorneo);

module.exports = router;