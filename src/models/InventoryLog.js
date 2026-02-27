const { DataTypes } = require('sequelize');
const sequelize = require('../config/supabase');
const ProductVariant = require('./ProductVariant');

const InventoryLog = sequelize.define('InventoryLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  variant_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: ProductVariant,
      key: 'id',
    },
  },
  change_type: {
    type: DataTypes.ENUM('add', 'deduct'),
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
});

InventoryLog.belongsTo(ProductVariant, { foreignKey: 'variant_id' });
ProductVariant.hasMany(InventoryLog, { foreignKey: 'variant_id' });

module.exports = InventoryLog;
