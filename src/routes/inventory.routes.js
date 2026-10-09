const router = require('express').Router();
const c = require('../controllers/inventory.controller');
const { protect } = require('../middlewares/auth.middleware');
const { isAdmin } = require('../middlewares/role.middleware');

router.use(protect, isAdmin);
router.get('/', c.list);
router.post('/:variantId/adjustments', c.adjust);
router.get('/:variantId/adjustments', c.history);

module.exports = router;
