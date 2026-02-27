const service = require('../services/order.service');

exports.create = async (req, res) => {
  const { address_id } = req.body;
  res.json(await service.createOrder(req.user.id, address_id));
};