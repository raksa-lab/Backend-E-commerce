const service = require('../services/order.service');
const HttpError = require('../utils/http-error');
const { requireUuid } = require('../utils/uuid');

const parsePositiveInteger = (value, fallback, name, maximum) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new HttpError(400, name + ' must be a positive integer');
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (maximum && parsed > maximum)) {
    throw new HttpError(400, name + ' is outside the allowed range');
  }
  return parsed;
};

exports.create = async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }

  requireUuid(body.address_id, 'address_id');
  const order = await service.createOrder(req.user.id, body.address_id);
  res.status(201).json(order);
};

exports.getAll = async (req, res) => {
  const page = parsePositiveInteger(req.query.page, 1, 'page');
  const limit = parsePositiveInteger(req.query.limit, 20, 'limit', 100);
  res.json(await service.getUserOrders(req.user.id, { page, limit }));
};

exports.getOne = async (req, res) => {
  requireUuid(req.params.id, 'id');
  res.json(await service.getUserOrder(req.user.id, req.params.id));
};
