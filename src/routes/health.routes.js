'use strict';

const express = require('express');

const healthController = require('../controllers/health.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/', asyncHandler(healthController.getHealth));
router.get('/details', asyncHandler(healthController.getHealthDetails));

module.exports = router;
