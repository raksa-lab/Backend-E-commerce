const db = require('../config/database');
const Movement = require('../models/InventoryMovement');
const HttpError = require('../utils/http-error');

const mapRpcError = (error) => {
  if (error.code === 'P0002') throw new HttpError(404, error.message);
  if (error.code === 'P0001') throw new HttpError(409, error.message);
  throw error;
};

exports.list = async ({ offset, limit }) => {
  const { data, count, error } = await db.from('product_variants')
    .select('*', { count: 'exact' })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { inventory: data || [], total: count || 0 };
};

exports.adjust = async (variantId, actorId, { change_type, quantity, note }) => {
  const { data, error } = await db.rpc('admin_adjust_inventory', {
    p_variant_id: variantId,
    p_actor_id: actorId,
    p_change_type: change_type,
    p_quantity: quantity,
    p_note: note || null,
  });
  if (error) mapRpcError(error);
  return data;
};

exports.history = async (variantId, { offset, limit }) => {
  const { data: variant, error: variantError } = await db.from('product_variants')
    .select('id').eq('id', variantId).maybeSingle();
  if (variantError) throw variantError;
  if (!variant) throw new HttpError(404, 'Product variant not found');

  const { data, count, error } = await Movement.findByVariant(variantId, { offset, limit });
  if (error) throw error;
  return { movements: data || [], total: count || 0 };
};
