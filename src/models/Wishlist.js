const db = require('../config/database');

exports.create = (data) => db.from('wishlists').insert([data]).select('*').single();
exports.findAll = ({ where } = {}) => {
  const query = db.from('wishlists').select('*');
  return where?.user_id ? query.eq('user_id', where.user_id) : query;
};
exports.destroy = ({ where }) => db.from('wishlists').delete().eq('id', where.id).select('*');
