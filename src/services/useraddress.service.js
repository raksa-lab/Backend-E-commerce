const Address = require('../models/UserAddress');

exports.createAddress = async (data) => {
  const { data: res, error } = await Address.create(data);
  if (error) throw error;
  return res;
};

exports.getUserAddresses = async (userId) => {
  const { data, error } = await Address.findByUser(userId);
  if (error) throw error;
  return data;
};

exports.updateAddress = async (id, body) => {
  const { error } = await Address.update(id, body);
  if (error) throw error;
};

exports.deleteAddress = async (id) => {
  const { error } = await Address.delete(id);
  if (error) throw error;
};