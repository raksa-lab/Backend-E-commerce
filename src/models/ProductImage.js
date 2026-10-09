const db = require('../config/database');

exports.create = (data) => db.from('product_images').insert([data]).select('*').single();
exports.findAll = () => db.from('product_images').select('*');
exports.findByProduct = (productId) => db.from('product_images').select('*').eq('product_id', productId);
exports.update = (id, data) => db.from('product_images').update(data).eq('id', id).select('*');
exports.delete = (id) => db.from('product_images').delete().eq('id', id).select('*');
