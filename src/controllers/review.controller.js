const service = require('../services/review.service');

exports.create = async (req, res) => {
  const data = { ...req.body, user_id: req.user.id };
  res.json(await service.create(data));
};

exports.getAll = async (req, res) => {
  res.json(await service.getAll());
};

exports.update = async (req, res) => {
  await service.update(req.params.id, req.body);
  res.json({ message: 'Updated' });
};

exports.remove = async (req, res) => {
  await service.delete(req.params.id);
  res.json({ message: 'Deleted' });
};