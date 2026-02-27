const Product = require('../models/Product');

exports.createProduct = async (data) => {
  const { data: res, error } = await Product.create(data);
  if (error) throw error;
  return res;
};

exports.getProducts = async () => {
  const { data, error } = await Product.findAll();
  if (error) throw error;
  return data;
};

exports.updateProduct = async (id, body) => {
  const { data, error } = await Product.update(id, body);
  if (error) throw error;
  return data;
};

exports.deleteProduct = async (id) => {
  const { error } = await Product.delete(id);
  if (error) throw error;
};