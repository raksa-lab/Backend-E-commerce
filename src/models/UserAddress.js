const db = require('../config/database');

exports.create = (data) =>
  db.from('user_addresses').insert([data]).select().single();

exports.findByUser = (userId) =>
  db.from('user_addresses').select('*').eq('user_id', userId);

exports.findByIdForUser = async (id, userId) => {
  const { data, error } = await db
    .from('user_addresses')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
};

exports.updateForUser = async (id, userId, data) => {
  const { data: rows, error } = await db
    .from('user_addresses')
    .update(data)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*');

  if (error) throw error;
  return rows || [];
};

exports.deleteForUser = async (id, userId) => {
  const { data, error } = await db
    .from('user_addresses')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('*');

  if (error) throw error;
  return data || [];
};
