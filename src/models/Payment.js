const db = require('../config/database');

exports.create = (data) => db.from('payments').insert([data]).select('*').single();
exports.findAll = () => db.from('payments').select('*');
exports.findByOrder = (orderId) => db.from('payments').select('*').eq('order_id', orderId);
exports.update = (id, data) => db.from('payments').update(data).eq('id', id).select('*');
