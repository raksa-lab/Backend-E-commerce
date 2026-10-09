const service = require('../services/cart.service');
const HttpError = require('../utils/http-error');
const { requireUuid } = require('../utils/uuid');

exports.getCart = async (req, res) => {
  res.json(await service.getCart(req.user.id));
};

exports.add = async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }

  requireUuid(body.variant_id, 'variant_id');
  if (!Number.isSafeInteger(body.quantity) || body.quantity < 1) {
    throw new HttpError(400, 'quantity must be a positive integer');
  }

  res.status(201).json(await service.addToCart(req.user.id, body));
};

exports.remove = async (req, res) => {
  requireUuid(req.params.id, 'id');
  await service.removeItem(req.user.id, req.params.id);
  res.json({ message: 'Deleted' });
};
