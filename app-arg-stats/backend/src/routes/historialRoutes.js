const express = require('express');
const router = express.Router();
const historialController = require('../controllers/historialController');

router.get('/campeones', historialController.getCampeones);
router.get('/tabla', historialController.getTabla);
router.get('/records', historialController.getRecords);
router.get('/temporadas', historialController.getTemporadas);

module.exports = router;
