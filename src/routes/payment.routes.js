const router = require('express').Router();
const controller = require('../controllers/payment.controller');
const { protect } = require('../middlewares/auth.middleware');
const { isAdmin } = require('../middlewares/role.middleware');

router.get('/', protect, isAdmin, controller.listAdminPayments);
router.get('/:id', protect, isAdmin, controller.getAdminPayment);
router.post('/:id/refunds', protect, isAdmin, controller.createRefund);

module.exports = router;
