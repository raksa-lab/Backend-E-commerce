const express = require('express');
const app = express();

app.use(express.json({ limit: '100kb' }));

app.use('/api/health', require('./routes/health.routes'));
app.use('/api/products', require('./routes/product.routes'));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/categories', require('./routes/category.routes'));
app.use('/api/addresses', require('./routes/useraddress.routes'));
app.use('/api/variants', require('./routes/variant.routes'));
app.use('/api/cart', require('./routes/cart.routes'));
app.use('/api/orders', require('./routes/order.routes'));
app.use('/api/admin/orders', require('./routes/admin-order.routes'));
app.use('/api/inventory', require('./routes/inventory.routes'));

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});
app.use(require('./middlewares/error.middleware'));

module.exports = app;
