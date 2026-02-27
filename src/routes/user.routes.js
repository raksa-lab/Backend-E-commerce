const router = require('express').Router();
const controller = require('../controllers/user.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const { isAdmin } = require('../middlewares/role.middleware');

// Admin only
router.get('/', verifyToken, isAdmin, controller.getAllUsers);
router.get('/:id', verifyToken, isAdmin, controller.getUserById);

module.exports = router;