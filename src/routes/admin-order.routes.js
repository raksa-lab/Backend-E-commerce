const router = require('express').Router();
const c = require('../controllers/order.controller');
const { protect } = require('../middlewares/auth.middleware');
const { isAdmin } = require('../middlewares/role.middleware');

router.use(protect, isAdmin);
router.get('/', c.adminGetAll);
router.post('/:id/cancel', c.cancel);
router.patch('/:id/status', c.updateStatus);
router.get('/:id/status-history', c.getStatusHistory);

module.exports = router;
