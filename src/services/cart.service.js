const Cart = require('../models/Cart');
const CartItem = require('../models/CartItem');

exports.getCart = async (userId) => {
  let cart = await Cart.findOne({ where: { user_id: userId } });

  if (!cart) {
    cart = await Cart.create({ user_id: userId });
  }

  return await CartItem.findAll({ where: { cart_id: cart.id } });
};

exports.addToCart = async (userId, data) => {
  let cart = await Cart.findOne({ where: { user_id: userId } });

  if (!cart) {
    cart = await Cart.create({ user_id: userId });
  }

  return await CartItem.create({
    cart_id: cart.id,
    variant_id: data.variant_id,
    quantity: data.quantity,
  });
};

exports.removeItem = async (id) => {
  return await CartItem.destroy({ where: { id } });
};