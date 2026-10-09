const db = require('../config/database');

exports.create = async (payload) => {
  const { data, error } = await db
    .from('orders')
    .insert([payload])
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

exports.findAllByUser = async (userId, { offset, limit }) => {
  const { data, count, error } = await db
    .from('orders')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return { data: data || [], count: count || 0 };
};

exports.findByIdForUser = async (id, userId) => {
  const { data, error } = await db
    .from('orders')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
};
