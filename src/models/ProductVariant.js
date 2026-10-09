const db = require('../config/database');

exports.create = (data) =>
  db.from('product_variants').insert([data]).select().single();

exports.findAll = () =>
  db.from('product_variants').select('*');

exports.findByPk = async (id) => {
  const { data, error } = await db
    .from('product_variants')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
};

exports.update = (id, data) =>
  db.from('product_variants')
    .update(data)
    .eq('id', id)
    .select('*')
    .maybeSingle();

exports.destroy = (id) =>
  db.from('product_variants')
    .delete()
    .eq('id', id)
    .select('*');
