const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Order = require('./Order');

const Payment = sequelize.define('Payment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  order_id: DataTypes.UUID,
  payment_method: DataTypes.STRING,
  transaction_id: DataTypes.STRING,
  payment_status: DataTypes.STRING,
});

Payment.belongsTo(Order, { foreignKey: 'order_id' });

module.exports = Payment;