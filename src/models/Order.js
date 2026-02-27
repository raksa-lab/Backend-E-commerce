const supabase = require('../config/supabase');

exports.create = async (payload) => {
  const { data, error } = await supabase
    .from('orders')
    .insert([payload])
    .select('*')
    .single();

  if (error) throw error;
  return data;
};