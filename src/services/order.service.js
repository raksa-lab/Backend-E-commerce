const OrderItem = require('../models/OrderItem');
const Order = require('../models/Order');
const HttpError = require('../utils/http-error');
const db = require('../config/database');

exports.createOrder = async (userId, addressId) => {
  const { data, error } = await db.rpc('checkout_order', {
    p_user_id: userId,
    p_address_id: addressId,
  });
  if (error) {
    if (error.code === 'P0002') throw new HttpError(404, error.message);
    if (error.code === 'P0001') {
      const status = /insufficient stock/i.test(error.message) ? 409 : 400;
      throw new HttpError(status, error.message);
    }
    throw error;
  }
  return data;
};

exports.getUserOrders = async (userId, { page, limit }) => {
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) {
    throw new HttpError(400, 'page is too large');
  }

  const { data, count } = await Order.findAllByUser(userId, { offset, limit });
  return { orders: data, page, limit, total: count };
};

exports.getUserOrder = async (userId, orderId) => {
  const order = await Order.findByIdForUser(orderId, userId);
  if (!order) throw new HttpError(404, 'Order not found');

  const items = await OrderItem.findAllByOrder(order.id);
  return { ...order, items };
};
