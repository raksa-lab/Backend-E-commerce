const supabase = require('../config/supabase');

exports.create = (data) =>
  supabase.from('product_variants').insert([data]).select().single();

exports.findAll = () =>
  supabase.from('product_variants').select('*');

exports.findByPk = async (id) => {
  const { data, error } = await supabase
    .from('product_variants')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
};

exports.update = (id, data) =>
  supabase.from('product_variants').update(data).eq('id', id).select().single();

exports.destroy = (id) =>
  supabase.from('product_variants').delete().eq('id', id);