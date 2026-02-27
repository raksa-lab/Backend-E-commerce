const Category = require('../models/Category');

exports.createCategory = async (data) => {
  const { data: res, error } = await Category.create(data);
  if (error) throw error;
  return res;
};

exports.getCategories = async () => {
  const { data, error } = await Category.findAll();
  if (error) throw error;
  return data;
};

exports.updateCategory = async (id, body) => {
  const { error } = await Category.update(id, body);
  if (error) throw error;
};

exports.deleteCategory = async (id) => {
  const { error } = await Category.delete(id);
  if (error) throw error;
};