const Variant = require('../models/ProductVariant');

exports.create = (data) => Variant.create(data);
exports.getAll = () => Variant.findAll();
exports.update = (id, data) => Variant.update(data, { where: { id } });
exports.delete = (id) => Variant.destroy({ where: { id } });