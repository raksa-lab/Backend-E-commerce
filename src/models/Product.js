const supabase = require('../config/supabase');

exports.create = (data) =>
  supabase.from('products').insert([data]).select().single();

exports.findAll = () =>
  supabase.from('products').select('*');

exports.update = (id, data) =>
  supabase.from('products').update(data).eq('id', id).select().single();

exports.delete = (id) =>
  supabase.from('products').delete().eq('id', id);