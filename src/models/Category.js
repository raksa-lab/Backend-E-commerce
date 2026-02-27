const supabase = require('../config/supabase');

exports.create = (data) =>
  supabase.from('categories').insert([data]).select().single();

exports.findAll = () =>
  supabase.from('categories').select('*');

exports.update = (id, data) =>
  supabase.from('categories').update(data).eq('id', id);

exports.delete = (id) =>
  supabase.from('categories').delete().eq('id', id);