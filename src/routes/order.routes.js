const router = require('express').Router();
const c = require('../controllers/order.controller');
const { protect } = require('../middlewares/auth.middleware');

router.use(protect);

router.get('/', c.getAll);
router.get('/:id', c.getOne);
router.post('/', c.create);

module.exports = router;
