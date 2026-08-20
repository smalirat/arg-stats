const express = require('express');
const router = express.Router();
const edicionController = require('../controllers/edicionController');


router.get('/', edicionController.getEdiciones);


router.get('/:id', edicionController.getEdicionById);

module.exports = router;