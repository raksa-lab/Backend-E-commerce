const router = require('express').Router();
const c = require('../controllers/product.controller');
const { protect } = require('../middlewares/auth.middleware');
const { isAdmin } = require('../middlewares/role.middleware');

router.get('/', c.getAll);
router.post('/', protect, isAdmin, c.create);
router.put('/:id', protect, isAdmin, c.update);
router.delete('/:id', protect, isAdmin, c.remove);

module.exports = router;