const service = require('../services/wishlist.service');

exports.create = async (req, res) => {
  const data = { ...req.body, user_id: req.user.id };
  res.json(await service.create(data));
};

exports.getAll = async (req, res) => {
  res.json(await service.getAll(req.user.id));
};

exports.remove = async (req, res) => {
  await service.delete(req.params.id, req.user.id);
  res.json({ message: 'Deleted' });
};