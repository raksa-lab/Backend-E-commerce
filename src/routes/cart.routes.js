const router = require('express').Router();
const c = require('../controllers/cart.controller');
const { protect } = require('../middlewares/auth.middleware');

router.use(protect);

router.get('/', c.getCart);
router.post('/', c.add);
router.delete('/:id', c.remove);

module.exports = router;