const service = require('../services/category.service');

exports.create = async (req, res) => {
  res.json(await service.createCategory(req.body));
};

exports.getAll = async (req, res) => {
  res.json(await service.getCategories());
};

exports.update = async (req, res) => {
  await service.updateCategory(req.params.id, req.body);
  res.json({ message: 'Updated' });
};

exports.remove = async (req, res) => {
  await service.deleteCategory(req.params.id);
  res.json({ message: 'Deleted' });
};