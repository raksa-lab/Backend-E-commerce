const Address = require('../models/UserAddress');
const HttpError = require('../utils/http-error');

exports.createAddress = async (data) => {
  const { data: result, error } = await Address.create(data);
  if (error) throw error;
  return result;
};

exports.getUserAddresses = async (userId) => {
  const { data, error } = await Address.findByUser(userId);
  if (error) throw error;
  return data;
};

exports.updateAddress = async (userId, id, body) => {
  const rows = await Address.updateForUser(id, userId, body);
  if (!rows.length) throw new HttpError(404, 'Address not found');
};

exports.deleteAddress = async (userId, id) => {
  const rows = await Address.deleteForUser(id, userId);
  if (!rows.length) throw new HttpError(404, 'Address not found');
};
