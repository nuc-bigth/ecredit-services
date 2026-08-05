const express = require('express');
const homeRoute = require('./homeRoute');
const authRoute = require('./authRoute');
const sessionRoute = require('./sessionRoute');
const healthRoute = require('./healthRoute');
const docsRoute = require('./docsRoute');
const requestRoute = require('./requestRoute');

/**
 * Dev Environment Route Aggregator
 * Mounts all subroutes for the dev environment
 * - All routes mounted with /api prefix by parent routes/index.js
 * - Public routes: home, health
 * - Authenticated routes: auth, session
 * - Documentation: docs
 */

const router = express.Router();

// Mount subroutes
router.use('/home', homeRoute);
router.use('/auth', authRoute);
router.use('/session', sessionRoute);
router.use('/requests', requestRoute);
router.use('/health', healthRoute);
router.use('/docs', docsRoute);

module.exports = router;
