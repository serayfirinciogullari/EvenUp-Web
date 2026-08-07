'use strict';

const express = require('express');

const healthRoutes = require('./health.routes');

const router = express.Router();

router.use('/health', healthRoutes);

// Yeni modul route'lari buraya eklenir:
// router.use('/auth', authRoutes);
// router.use('/groups', groupRoutes);
// router.use('/expenses', expenseRoutes);

module.exports = router;
