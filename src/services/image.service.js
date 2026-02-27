const Image = require('../models/ProductImage');

exports.create = (data) => Image.create(data);
exports.getAll = () => Image.findAll();
exports.update = (id, data) => Image.update(data, { where: { id } });
exports.delete = (id) => Image.destroy({ where: { id } });