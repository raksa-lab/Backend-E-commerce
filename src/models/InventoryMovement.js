const db = require('../config/database');

exports.findByVariant = (variantId, { offset, limit }) =>
  db.from('inventory_movements')
    .select('*', { count: 'exact' })
    .eq('variant_id', variantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
