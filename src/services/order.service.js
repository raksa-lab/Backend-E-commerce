const OrderItem = require('../models/OrderItem');
const Order = require('../models/Order');
const HttpError = require('../utils/http-error');
const db = require('../config/database');
const OrderStatusHistory = require('../models/OrderStatusHistory');
const ORDER_STATUSES = require('../utils/order-status');

const throwStatusError = (error) => {
  if (error.code === 'P0002') throw new HttpError(404, error.message);
  if (error.code === 'P0001') throw new HttpError(409, error.message);
  if (error.code === '22023') throw new HttpError(400, error.message);
  throw error;
};

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

exports.cancelOrder = async (orderId, actor, note) =>
  exports.changeStatus(orderId, actor, 'cancelled', note);

exports.changeStatus = async (orderId, actor, status, note) => {
  const { data, error } = await db.rpc('change_order_status', {
    p_order_id: orderId,
    p_actor_id: actor.id,
    p_actor_role: actor.role,
    p_target_status: status,
    p_note: note || null,
  });
  if (error) throwStatusError(error);
  return data;
};

exports.getAdminOrders = async ({ page, limit, status }) => {
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) throw new HttpError(400, 'page is too large');
  const { data, count } = await Order.findAllAdmin({ status, offset, limit });
  return { orders: data, page, limit, total: count };
};

exports.getOrderStatusHistory = async (orderId, { page, limit }) => {
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) throw new HttpError(400, 'page is too large');
  const order = await Order.findById(orderId);
  if (!order) throw new HttpError(404, 'Order not found');
  const { data, count } = await OrderStatusHistory.findByOrder(orderId, { offset, limit });
  return { history: data, page, limit, total: count };
};

exports.orderStatuses = ORDER_STATUSES;
