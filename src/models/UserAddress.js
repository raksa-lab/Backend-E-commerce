const supabase = require('../config/supabase');

exports.create = (data) =>
  supabase.from('user_addresses').insert([data]).select().single();

exports.findByUser = (userId) =>
  supabase.from('user_addresses').select('*').eq('user_id', userId);

exports.update = (id, data) =>
  supabase.from('user_addresses').update(data).eq('id', id);

exports.delete = (id) =>
  supabase.from('user_addresses').delete().eq('id', id);