const Review = require('../models/Review');

exports.create = (data) => Review.create(data);

exports.getAll = () => Review.findAll();

exports.update = (id, data) =>
  Review.update(data, { where: { id } });

exports.delete = (id) =>
  Review.destroy({ where: { id } });