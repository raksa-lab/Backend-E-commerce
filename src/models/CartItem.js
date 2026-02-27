const supabase = require('../config/supabase');

exports.findAll = async ({ where }) => {
  const { data, error } = await supabase
    .from('cart_items')
    .select('*')
    .eq('cart_id', where.cart_id);

  if (error) throw error;
  return data;
};

exports.create = async (payload) => {
  const { data, error } = await supabase
    .from('cart_items')
    .insert([payload])
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

exports.destroy = async ({ where }) => {
  let query = supabase.from('cart_items').delete();

  if (where.id) {
    query = query.eq('id', where.id);
  }

  if (where.cart_id) {
    query = query.eq('cart_id', where.cart_id);
  }

  const { data, error } = await query.select('*');

  if (error) throw error;
  return data;
};