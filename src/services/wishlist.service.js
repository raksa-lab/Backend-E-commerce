const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');

exports.create = (data) => Wishlist.create(data);

exports.getAll = (userId) =>
  Wishlist.findAll({
    where: { user_id: userId },
    include: Product,
  });

exports.delete = (id, userId) =>
  Wishlist.destroy({ where: { id, user_id: userId } });