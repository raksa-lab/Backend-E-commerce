const db = require('../config/database');

exports.create = (data) =>
  db.from('products').insert([data]).select().single();

exports.findAll = () =>
  db.from('products').select('*');

exports.update = (id, data) =>
  db.from('products').update(data).eq('id', id).select().single();

exports.delete = (id) =>
  db.from('products').delete().eq('id', id);
