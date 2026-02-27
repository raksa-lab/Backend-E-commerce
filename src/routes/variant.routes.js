const router = require('express').Router();
const c = require('../controllers/variant.controller');

router.post('/', c.create);
router.get('/', c.getAll);
router.put('/:id', c.update);
router.delete('/:id', c.remove);

module.exports = router;