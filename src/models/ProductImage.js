const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Product = require('./Product');

const ProductImage = sequelize.define('ProductImage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  product_id: DataTypes.UUID,
  image_url: DataTypes.TEXT,
  is_primary: DataTypes.BOOLEAN,
});

ProductImage.belongsTo(Product, { foreignKey: 'product_id' });
Product.hasMany(ProductImage, { foreignKey: 'product_id' });

module.exports = ProductImage;