const router = require('express').Router();
const c = require('../controllers/useraddress.controller');
const { protect } = require('../middlewares/auth.middleware');

router.use(protect);

router.get('/', c.getAll);
router.post('/', c.create);
router.put('/:id', c.update);
router.delete('/:id', c.remove);

module.exports = router;