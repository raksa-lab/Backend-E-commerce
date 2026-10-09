const service = require('../services/order.service');
const HttpError = require('../utils/http-error');
const { requireUuid } = require('../utils/uuid');
const orderStatuses = require('../utils/order-status');

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

const parseNoteBody = (body, allowedFields) => {
  const value = body === undefined ? {} : body;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }
  if (Object.keys(value).some((key) => !allowedFields.includes(key))) {
    throw new HttpError(400, 'Request body contains an unsupported field');
  }
  if (value.note !== undefined && (typeof value.note !== 'string' || value.note.length > 500)) {
    throw new HttpError(400, 'note must be a string of at most 500 characters');
  }
  return value;
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

exports.cancel = async (req, res) => {
  requireUuid(req.params.id, 'id');
  const { note } = parseNoteBody(req.body, ['note']);
  res.json(await service.cancelOrder(req.params.id, req.user, note));
};

exports.adminGetAll = async (req, res) => {
  const page = parsePositiveInteger(req.query.page, 1, 'page');
  const limit = parsePositiveInteger(req.query.limit, 20, 'limit', 100);
  const status = req.query.status;
  if (status !== undefined && !orderStatuses.includes(status)) {
    throw new HttpError(400, 'status is invalid');
  }
  res.json(await service.getAdminOrders({ page, limit, status }));
};

exports.updateStatus = async (req, res) => {
  requireUuid(req.params.id, 'id');
  const { status, note } = parseNoteBody(req.body, ['status', 'note']);
  if (typeof status !== 'string' || !orderStatuses.includes(status) || status === 'cancelled') {
    throw new HttpError(400, 'status must be processing, shipped, or delivered');
  }
  res.json(await service.changeStatus(req.params.id, req.user, status, note));
};

exports.getStatusHistory = async (req, res) => {
  requireUuid(req.params.id, 'id');
  const page = parsePositiveInteger(req.query.page, 1, 'page');
  const limit = parsePositiveInteger(req.query.limit, 20, 'limit', 100);
  res.json(await service.getOrderStatusHistory(req.params.id, { page, limit }));
};
