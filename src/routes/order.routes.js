const router = require('express').Router();
const c = require('../controllers/order.controller');
const { protect } = require('../middlewares/auth.middleware');

router.use(protect);

router.post('/', c.create);

module.exports = router;