const router = require('express').Router();
const c = require('../controllers/order.controller');
const { protect } = require('../middlewares/auth.middleware');
const paymentController = require('../controllers/payment.controller');

router.use(protect);

router.get('/', c.getAll);
router.get('/:id', c.getOne);
router.get('/:id/payment', paymentController.getCustomerPayment);
router.post('/:id/checkout-session', paymentController.createCheckoutSession);
router.post('/', c.create);
router.post('/:id/cancel', c.cancel);

module.exports = router;
