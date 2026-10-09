const supabase = require('../config/supabase');

exports.findByVariant = (variantId, { offset, limit }) =>
  supabase.from('inventory_movements')
    .select('*', { count: 'exact' })
    .eq('variant_id', variantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
