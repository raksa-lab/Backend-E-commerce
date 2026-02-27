const service = require('../services/useraddress.service');

exports.create = async (req, res) => {
  const data = { ...req.body, user_id: req.user.id };
  res.json(await service.createAddress(data));
};

exports.getAll = async (req, res) => {
  res.json(await service.getUserAddresses(req.user.id));
};

exports.update = async (req, res) => {
  await service.updateAddress(req.params.id, req.body);
  res.json({ message: 'Updated' });
};

exports.remove = async (req, res) => {
  await service.deleteAddress(req.params.id);
  res.json({ message: 'Deleted' });
};