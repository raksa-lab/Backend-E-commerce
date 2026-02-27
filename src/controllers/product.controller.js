const service = require('../services/product.service');

exports.create = async (req, res) => {
  try {
    const data = await service.createProduct(req.body);
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    res.json(await service.getProducts());
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.update = async (req, res) => {
  try {
    res.json(await service.updateProduct(req.params.id, req.body));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.remove = async (req, res) => {
  try {
    await service.deleteProduct(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};