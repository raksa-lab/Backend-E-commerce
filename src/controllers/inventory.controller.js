const service = require('../services/inventory.service');
const HttpError = require('../utils/http-error');
const { requireUuid } = require('../utils/uuid');

const pageValue = (value, fallback, name, max) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new HttpError(400, name + ' must be a positive integer');
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || (max && number > max)) {
    throw new HttpError(400, name + ' is outside the allowed range');
  }
  return number;
};

const pagination = (query) => {
  const page = pageValue(query.page, 1, 'page');
  const limit = pageValue(query.limit, 20, 'limit', 100);
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) throw new HttpError(400, 'page is too large');
  return { page, limit, offset };
};

exports.list = async (req, res) => {
  const paging = pagination(req.query);
  res.json({ ...await service.list(paging), page: paging.page, limit: paging.limit });
};

exports.adjust = async (req, res) => {
  requireUuid(req.params.variantId, 'variantId');
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }
  if (!['add', 'deduct'].includes(body.change_type)) {
    throw new HttpError(400, 'change_type must be add or deduct');
  }
  if (!Number.isSafeInteger(body.quantity) || body.quantity < 1 || body.quantity > 1000000000) {
    throw new HttpError(400, 'quantity must be a positive integer');
  }
  if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 500)) {
    throw new HttpError(400, 'note must be a string of at most 500 characters');
  }
  res.status(201).json(await service.adjust(req.params.variantId, req.user.id, body));
};

exports.history = async (req, res) => {
  requireUuid(req.params.variantId, 'variantId');
  const paging = pagination(req.query);
  res.json({ ...await service.history(req.params.variantId, paging), page: paging.page, limit: paging.limit });
};
