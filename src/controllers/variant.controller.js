const service = require('../services/variant.service');
const HttpError = require('../utils/http-error');
const { requireUuid } = require('../utils/uuid');

const validateBody = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) {
    throw new HttpError(400, 'Request body must be a non-empty JSON object');
  }
};

exports.create = async (req, res) => {
  validateBody(req.body);
  res.status(201).json(await service.create(req.body));
};

exports.getAll = async (req, res) => {
  res.json(await service.getAll());
};

exports.update = async (req, res) => {
  requireUuid(req.params.id, 'id');
  validateBody(req.body);
  await service.update(req.params.id, req.body);
  res.json({ message: 'Updated' });
};

exports.remove = async (req, res) => {
  requireUuid(req.params.id, 'id');
  await service.delete(req.params.id);
  res.json({ message: 'Deleted' });
};
