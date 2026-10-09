const Variant = require('../models/ProductVariant');
const HttpError = require('../utils/http-error');

exports.create = async (data) => {
  const { data: variant, error } = await Variant.create(data);
  if (error) throw error;
  return variant;
};

exports.getAll = async () => {
  const { data, error } = await Variant.findAll();
  if (error) throw error;
  return data || [];
};

exports.update = async (id, data) => {
  const { data: variant, error } = await Variant.update(id, data);
  if (error) throw error;
  if (!variant) throw new HttpError(404, 'Product variant not found');
  return variant;
};

exports.delete = async (id) => {
  const { data, error } = await Variant.destroy(id);
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new HttpError(404, 'Product variant not found');
  }
};
