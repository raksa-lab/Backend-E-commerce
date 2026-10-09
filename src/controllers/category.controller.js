const service = require('../services/category.service');
const HttpError = require('../utils/http-error');
const { requireUuid } = require('../utils/uuid');

const validateBody = (body, creating) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) {
    throw new HttpError(400, 'Request body must be a non-empty JSON object');
  }
  if (Object.keys(body).some((field) => !['name', 'description'].includes(field))) {
    throw new HttpError(400, 'Request body contains an unsupported field');
  }
  if (creating && !Object.hasOwn(body, 'name')) throw new HttpError(400, 'name is required');
  if (Object.hasOwn(body, 'name') && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100)) {
    throw new HttpError(400, 'name must be between 1 and 100 characters');
  }
  if (Object.hasOwn(body, 'description') && body.description !== null
    && (typeof body.description !== 'string' || body.description.length > 1000)) {
    throw new HttpError(400, 'description must be at most 1000 characters');
  }
};

exports.create = async (req, res) => {
  validateBody(req.body, true);
  res.status(201).json(await service.createCategory({ ...req.body, name: req.body.name.trim() }));
};

exports.getAll = async (req, res) => {
  res.json(await service.getCategories());
};

exports.update = async (req, res) => {
  requireUuid(req.params.id, 'id');
  validateBody(req.body, false);
  const body = Object.hasOwn(req.body, 'name') ? { ...req.body, name: req.body.name.trim() } : req.body;
  await service.updateCategory(req.params.id, body);
  res.json({ message: 'Updated' });
};

exports.remove = async (req, res) => {
  requireUuid(req.params.id, 'id');
  await service.deleteCategory(req.params.id);
  res.json({ message: 'Deleted' });
};
