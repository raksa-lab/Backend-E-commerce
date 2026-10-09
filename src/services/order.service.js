const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Cart = require('../models/Cart');
const CartItem = require('../models/CartItem');
const Variant = require('../models/ProductVariant');
const Address = require('../models/UserAddress');
const HttpError = require('../utils/http-error');

exports.createOrder = async (userId, addressId) => {
  const address = await Address.findByIdForUser(addressId, userId);
  if (!address) throw new HttpError(404, 'Address not found');

  const cart = await Cart.findOne({ where: { user_id: userId } });
  if (!cart) throw new HttpError(400, 'Cart is empty');

  const items = await CartItem.findAll({ where: { cart_id: cart.id } });
  if (!items.length) throw new HttpError(400, 'Cart is empty');

  const pricedItems = [];
  let totalCents = 0;

  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new HttpError(400, 'Cart contains an invalid quantity');
    }

    const variant = await Variant.findByPk(item.variant_id);
    if (!variant) throw new HttpError(404, 'A cart product variant no longer exists');

    const price = Number(variant.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new HttpError(400, 'A cart product has an invalid price');
    }

    const priceCents = Math.round(price * 100);
    totalCents += priceCents * item.quantity;
    if (!Number.isSafeInteger(totalCents)) {
      throw new HttpError(400, 'Order total is too large');
    }

    pricedItems.push({
      variant_id: item.variant_id,
      quantity: item.quantity,
      price: priceCents / 100,
    });
  }

  const total = totalCents / 100;
  const order = await Order.create({
    user_id: userId,
    address_id: addressId,
    total_amount: total,
    final_amount: total,
    status: 'pending',
  });

  for (const item of pricedItems) {
    await OrderItem.create({
      order_id: order.id,
      ...item,
    });
  }

  await CartItem.destroy({ where: { cart_id: cart.id } });
  return order;
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
