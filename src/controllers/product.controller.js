const service = require('../services/product.service');
const HttpError = require('../utils/http-error');
const { requireUuid } = require('../utils/uuid');

const validateBody = (body, creating) => {
  const allowed = ['category_id', 'name', 'description', 'price', 'image_url'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) {
    throw new HttpError(400, 'Request body must be a non-empty JSON object');
  }
  if (Object.keys(body).some((field) => !allowed.includes(field))) {
    throw new HttpError(400, 'Request body contains an unsupported field');
  }
  if (creating && !Object.hasOwn(body, 'name')) throw new HttpError(400, 'name is required');
  if (Object.hasOwn(body, 'name') && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 200)) {
    throw new HttpError(400, 'name must be between 1 and 200 characters');
  }
  if (Object.hasOwn(body, 'category_id') && body.category_id !== null) requireUuid(body.category_id, 'category_id');
  if (Object.hasOwn(body, 'description') && body.description !== null
    && (typeof body.description !== 'string' || body.description.length > 5000)) {
    throw new HttpError(400, 'description must be at most 5000 characters');
  }
  if (Object.hasOwn(body, 'price') && body.price !== null
    && (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0 || body.price > 9999999999.99)) {
    throw new HttpError(400, 'price must be a non-negative valid amount');
  }
  if (Object.hasOwn(body, 'image_url') && body.image_url !== null
    && (typeof body.image_url !== 'string' || body.image_url.length > 2048)) {
    throw new HttpError(400, 'image_url must be a string of at most 2048 characters');
  }
};

exports.create = async (req, res) => {
  validateBody(req.body, true);
  const data = await service.createProduct({ ...req.body, name: req.body.name.trim() });
  res.status(201).json(data);
};

exports.getAll = async (req, res) => {
  res.json(await service.getProducts());
};

exports.update = async (req, res) => {
  requireUuid(req.params.id, 'id');
  validateBody(req.body, false);
  const body = Object.hasOwn(req.body, 'name') ? { ...req.body, name: req.body.name.trim() } : req.body;
  res.json(await service.updateProduct(req.params.id, body));
};

exports.remove = async (req, res) => {
  requireUuid(req.params.id, 'id');
  await service.deleteProduct(req.params.id);
  res.json({ message: 'Deleted' });
};
