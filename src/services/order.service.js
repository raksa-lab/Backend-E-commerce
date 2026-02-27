const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Cart = require('../models/Cart');
const CartItem = require('../models/CartItem');
const Variant = require('../models/ProductVariant');

exports.createOrder = async (userId, address_id) => {
  const cart = await Cart.findOne({ where: { user_id: userId } });
  const items = await CartItem.findAll({ where: { cart_id: cart.id } });

  let total = 0;

  for (let item of items) {
    const variant = await Variant.findByPk(item.variant_id);
    total += variant.price * item.quantity;
  }

  const order = await Order.create({
    user_id: userId,
    address_id,
    total_amount: total,
    final_amount: total,
    status: 'pending',
  });

  for (let item of items) {
    const variant = await Variant.findByPk(item.variant_id);

    await OrderItem.create({
      order_id: order.id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      price: variant.price,
    });
  }

  await CartItem.destroy({ where: { cart_id: cart.id } });

  return order;
};