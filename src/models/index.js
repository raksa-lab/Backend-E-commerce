const User = require('./User');
const UserAddress = require('./UserAddress');
const Category = require('./Category');
const Product = require('./Product');
const ProductVariant = require('./ProductVariant');
const ProductImage = require('./ProductImage');
const Wishlist = require('./Wishlist');
const Review = require('./Review');
const { Cart, CartItem } = require('./Cart');
const { Order, OrderItem } = require('./Order');
const InventoryLog = require('./InventoryLog');

module.exports = {
  User,
  UserAddress,
  Category,
  Product,
  ProductVariant,
  ProductImage,
  Wishlist,
  Review,
  Cart,
  CartItem,
  Order,
  OrderItem,
  InventoryLog,
};
