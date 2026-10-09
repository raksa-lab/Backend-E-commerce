const db = require('../config/database');

exports.findByOrder = async (orderId, { offset, limit }) => {
  const { data, count, error } = await db.from('order_status_history')
    .select('*', { count: 'exact' })
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { data: data || [], count: count || 0 };
};
