const service = require('../services/cart.service');

exports.getCart = async (req, res) => {
  res.json(await service.getCart(req.user.id));
};

exports.add = async (req, res) => {
  res.json(await service.addToCart(req.user.id, req.body));
};

exports.remove = async (req, res) => {
  await service.removeItem(req.params.id);
  res.json({ message: 'Deleted' });
};