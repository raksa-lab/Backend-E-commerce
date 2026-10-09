const db = require('../config/database');

exports.create = async (payload) => {
  const { data, error } = await db
    .from('order_items')
    .insert([payload])
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

exports.findAllByOrder = async (orderId) => {
  const { data, error } = await db
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);

  if (error) throw error;
  return data || [];
};
