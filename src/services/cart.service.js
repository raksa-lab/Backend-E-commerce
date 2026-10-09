const Cart = require('../models/Cart');
const CartItem = require('../models/CartItem');
const Variant = require('../models/ProductVariant');
const HttpError = require('../utils/http-error');

exports.getCart = async (userId) => {
  let cart = await Cart.findOne({ where: { user_id: userId } });

  if (!cart) {
    cart = await Cart.create({ user_id: userId });
  }

  return await CartItem.findAll({ where: { cart_id: cart.id } });
};

exports.addToCart = async (userId, data) => {
  const variant = await Variant.findByPk(data.variant_id);
  if (!variant) throw new HttpError(404, 'Product variant not found');

  let cart = await Cart.findOne({ where: { user_id: userId } });
  if (!cart) cart = await Cart.create({ user_id: userId });

  return await CartItem.create({
    cart_id: cart.id,
    variant_id: data.variant_id,
    quantity: data.quantity,
  });
};

exports.removeItem = async (userId, itemId) => {
  const cart = await Cart.findOne({ where: { user_id: userId } });
  if (!cart) throw new HttpError(404, 'Cart item not found');

  const deleted = await CartItem.destroy({
    where: { id: itemId, cart_id: cart.id },
  });
  if (!deleted.length) throw new HttpError(404, 'Cart item not found');
};
