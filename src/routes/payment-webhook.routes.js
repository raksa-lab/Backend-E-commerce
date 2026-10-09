const express = require('express');
const router = require('express').Router();
const controller = require('../controllers/payment.controller');

router.post('/', express.raw({ type: 'application/json', limit: '1mb' }), controller.webhook);

module.exports = router;
