const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Product = require('./Product');
const User = require('./User');

const Wishlist = sequelize.define('Wishlist', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  user_id: DataTypes.UUID,
  product_id: DataTypes.UUID,
});

Wishlist.belongsTo(Product, { foreignKey: 'product_id' });
Wishlist.belongsTo(User, { foreignKey: 'user_id' });

module.exports = Wishlist;