const db = require('../config/database');

exports.create = (data) => db.from('reviews').insert([data]).select('*').single();
exports.findAll = () => db.from('reviews').select('*');
exports.update = (data, { where }) => db.from('reviews').update(data).eq('id', where.id).select('*');
exports.destroy = ({ where }) => db.from('reviews').delete().eq('id', where.id).select('*');
