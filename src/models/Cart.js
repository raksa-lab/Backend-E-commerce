const db = require('../config/database');

exports.findOne = async ({ where }) => {
  const { data, error } = await db
    .from('carts')
    .select('*')
    .eq('user_id', where.user_id)
    .maybeSingle();

  if (error) throw error;
  return data;
};

exports.create = async (payload) => {
  const { data, error } = await db
    .from('carts')
    .insert([payload])
    .select('*')
    .single();

  if (error) throw error;
  return data;
};
