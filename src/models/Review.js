const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Product = require('./Product');
const User = require('./User');

const Review = sequelize.define('Review', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  user_id: DataTypes.UUID,
  product_id: DataTypes.UUID,
  rating: DataTypes.INTEGER,
  comment: DataTypes.TEXT,
});

Review.belongsTo(Product, { foreignKey: 'product_id' });
Review.belongsTo(User, { foreignKey: 'user_id' });

module.exports = Review;