const db = require('../config/database');

exports.create = (data) =>
  db.from('categories').insert([data]).select().single();

exports.findAll = () => db.from('categories').select('*');

exports.update = (id, data) => db.from('categories').update(data).eq('id', id);

exports.delete = (id) => db.from('categories').delete().eq('id', id);
