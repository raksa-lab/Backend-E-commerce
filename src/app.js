const express = require('express');
const app = express();

app.use(express.json());

app.use('/api/health', require('./routes/health.routes'));
app.use('/api/products', require('./routes/product.routes'));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/categories', require('./routes/category.routes'));
app.use('/api/addresses', require('./routes/useraddress.routes'));
app.use('/api/variants', require('./routes/variant.routes'));
app.use('/api/cart', require('./routes/cart.routes'));
app.use('/api/orders', require('./routes/order.routes'));

module.exports = app;