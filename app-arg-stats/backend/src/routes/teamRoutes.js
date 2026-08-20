// src/routes/teamRoutes.js
const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');


router.get('/test-db', teamController.testDbConnection);

module.exports = router;