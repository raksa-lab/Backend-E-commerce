const service = require('../services/useraddress.service');
const HttpError = require('../utils/http-error');
const { requireUuid } = require('../utils/uuid');

const validateAddressBody = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }
  const protectedFields = ['user_id', 'id', 'created_at', 'updated_at'];
  const protectedField = protectedFields.find((field) =>
    Object.prototype.hasOwnProperty.call(body, field),
  );
  if (protectedField) {
    throw new HttpError(400, protectedField + ' cannot be set in the request body');
  }
  if (Object.keys(body).length === 0) {
    throw new HttpError(400, 'Request body cannot be empty');
  }
};

exports.create = async (req, res) => {
  const body = req.body;
  validateAddressBody(body);
  const data = { ...body, user_id: req.user.id };
  res.status(201).json(await service.createAddress(data));
};

exports.getAll = async (req, res) => {
  res.json(await service.getUserAddresses(req.user.id));
};

exports.update = async (req, res) => {
  requireUuid(req.params.id, 'id');
  validateAddressBody(req.body);
  await service.updateAddress(req.user.id, req.params.id, req.body);
  res.json({ message: 'Updated' });
};

exports.remove = async (req, res) => {
  requireUuid(req.params.id, 'id');
  await service.deleteAddress(req.user.id, req.params.id);
  res.json({ message: 'Deleted' });
};
